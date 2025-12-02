import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import { isAddress } from "viem";
import { INCINERATOR_ADDRESS } from "@/lib/contract";

interface UserRow extends RowDataPacket {
  magma_points_total: number;
  referred_by_wallet: string | null;
}

interface BurnRow extends RowDataPacket {
  id: number;
}

type RequestBody = {
  walletAddress: string;
  txHash: string;
  referrer?: string | null;
};

const MAGMA_PER_BURN = 100;
const REFERRAL_POINTS = 10;
const MORALIS_API_BASE = "https://deep-index.moralis.io/api/v2.2";
const MORALIS_CHAIN = "base sepolia";

function normalizeAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  return isAddress(addr) ? addr.toLowerCase() : null;
}

function normalizeTxHash(tx: string | null | undefined): string | null {
  if (!tx) return null;
  const trimmed = tx.trim().toLowerCase();
  const isValid = /^0x[a-f0-9]{64}$/.test(trimmed);
  return isValid ? trimmed : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    const wallet = normalizeAddress(body.walletAddress);
    let referrer = normalizeAddress(body.referrer ?? null);
    const txHash = normalizeTxHash(body.txHash);

    if (!wallet) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    if (!txHash) {
      return NextResponse.json({ error: "Invalid txHash" }, { status: 400 });
    }

    // no self-referral
    if (referrer === wallet) {
      referrer = null;
    }

    // 1) Check if this txHash was already processed
    const [burnRows] = await db.query<BurnRow[]>(
      "SELECT id FROM magma_burns WHERE tx_hash = ?",
      [txHash]
    );

    if (burnRows.length > 0) {
      // Already counted, just return current total
      const [userRows] = await db.query<UserRow[]>(
        "SELECT magma_points_total FROM magma_users WHERE wallet_address = ?",
        [wallet]
      );

      const total = userRows[0]?.magma_points_total ?? 0;

      return NextResponse.json({
        success: true,
        alreadyCounted: true,
        wallet,
        magmaPointsTotal: total,
        awardedPoints: 0,
        referralPointsAwarded: 0,
        isNewUser: userRows.length === 0,
      });
    }

    // 2) Verify the tx on-chain via Moralis
    const apiKey = process.env.MORALIS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Moralis API key missing" },
        { status: 500 }
      );
    }

    let txRes: Response | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(
        `${MORALIS_API_BASE}/transaction/${txHash}?chain=${encodeURIComponent(
          MORALIS_CHAIN
        )}`,
        {
          headers: {
            "X-API-Key": apiKey,
            accept: "application/json",
          },
        }
      );

      if (res.ok) {
        txRes = res;
        break;
      }

      const text = await res.text().catch(() => "");
      console.error("Moralis tx error", res.status, text);

      const isNotFound =
        res.status === 404 &&
        text.toLowerCase().includes("no transaction found");

      if (isNotFound && attempt < 2) {
        await delay(3000);
        continue;
      }

      return NextResponse.json(
        { error: "Failed to fetch transaction from Moralis" },
        { status: 502 }
      );
    }

    if (!txRes) {
      return NextResponse.json(
        { error: "Failed to fetch transaction from Moralis" },
        { status: 502 }
      );
    }

    const txJson = (await txRes.json()) as Record<string, unknown>;

    const from = (txJson.from_address as string | undefined)?.toLowerCase();
    const to = (txJson.to_address as string | undefined)?.toLowerCase();
    const statusRaw =
      txJson.receipt_status ??
      txJson.receipt_status_code ??
      txJson.receipt_status_name;

    const incinerator = INCINERATOR_ADDRESS.toLowerCase();

    // Basic validation: from must match wallet, to must be incinerator, status success
    const isFromOk = from === wallet;
    const isToOk = to === incinerator;
    const isStatusOk =
      statusRaw === 1 ||
      statusRaw === "1" ||
      statusRaw === "SUCCESS" ||
      statusRaw === "success";

    if (!isFromOk || !isToOk || !isStatusOk) {
      return NextResponse.json(
        {
          error: "Transaction is not a valid burn for this wallet",
          details: {
            from,
            to,
            status: statusRaw,
          },
        },
        { status: 400 }
      );
    }

    // 3) At this point, txHash is valid and not yet counted.
    //    Update user + referrer + insert magma_burns.

    // Check if user already exists
    const [userRows] = await db.query<UserRow[]>(
      "SELECT magma_points_total, referred_by_wallet FROM magma_users WHERE wallet_address = ?",
      [wallet]
    );

    const isNewUser = userRows.length === 0;
    const existingUser = userRows[0] ?? null;

    // If user already has a referrer, keep it. Otherwise use referrer (if any)
    let effectiveReferrer: string | null =
      existingUser?.referred_by_wallet ?? referrer ?? null;

    if (effectiveReferrer === wallet) {
      effectiveReferrer = null;
    }

    // Insert or update user with +100 MAGMA
    if (isNewUser) {
      await db.query(
        `INSERT INTO magma_users
          (wallet_address, magma_points_total, referred_by_wallet)
         VALUES (?, ?, ?)`,
        [wallet, MAGMA_PER_BURN, effectiveReferrer]
      );
    } else {
      await db.query(
        `UPDATE magma_users
           SET magma_points_total = magma_points_total + ?,
               referred_by_wallet = COALESCE(referred_by_wallet, ?)
         WHERE wallet_address = ?`,
        [MAGMA_PER_BURN, effectiveReferrer, wallet]
      );
    }

    // Handle referral rewards (fixed 10 points per burn if referrer exists)
    let referralPointsAwarded = 0;

    if (effectiveReferrer && effectiveReferrer !== wallet) {
      const referralCountIncrement = isNewUser ? 1 : 0;

      await db.query(
        `INSERT INTO magma_users
           (wallet_address, magma_points_total, referral_points_earned, referral_count)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           magma_points_total = magma_points_total + VALUES(magma_points_total),
           referral_points_earned = referral_points_earned + VALUES(referral_points_earned),
           referral_count = referral_count + ?`,
        [
          effectiveReferrer,
          REFERRAL_POINTS,
          REFERRAL_POINTS,
          referralCountIncrement,
          referralCountIncrement,
        ]
      );

      referralPointsAwarded = REFERRAL_POINTS;
    }

    // Insert magma_burns row to lock this txHash
    await db.query(
      `INSERT INTO magma_burns (wallet_address, tx_hash, points_awarded)
       VALUES (?, ?, ?)`,
      [wallet, txHash, MAGMA_PER_BURN]
    );

    // Read updated total
    const [updatedRows] = await db.query<UserRow[]>(
      "SELECT magma_points_total FROM magma_users WHERE wallet_address = ?",
      [wallet]
    );

    const total = updatedRows[0]?.magma_points_total ?? MAGMA_PER_BURN;

    return NextResponse.json({
      success: true,
      alreadyCounted: false,
      wallet,
      magmaPointsTotal: total,
      awardedPoints: MAGMA_PER_BURN,
      referralPointsAwarded,
      isNewUser,
    });
  } catch (err) {
    console.error("record-burn error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
