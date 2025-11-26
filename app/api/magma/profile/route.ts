import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import { isAddress } from "viem";

interface UserRow extends RowDataPacket {
  magma_points_total: number;
  referral_points_earned: number;
  referral_count: number;
  referred_by_wallet: string | null;
}

interface CountRow extends RowDataPacket {
  count: number;
}

function normalizeAddress(addr: string | null): string | null {
  if (!addr) return null;
  return isAddress(addr) ? addr.toLowerCase() : null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const addr = searchParams.get("address");
    const wallet = normalizeAddress(addr);

    if (!wallet) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    // 1) Get user row
    const [userRows] = await db.query<UserRow[]>(
      `SELECT magma_points_total,
              referral_points_earned,
              referral_count,
              referred_by_wallet
       FROM magma_users
       WHERE wallet_address = ?`,
      [wallet]
    );

    if (userRows.length === 0) {
      // User has no points yet
      const [totalRows] = await db.query<CountRow[]>(
        "SELECT COUNT(*) AS count FROM magma_users"
      );
      const totalUsers = totalRows[0]?.count ?? 0;

      return NextResponse.json({
        walletAddress: wallet,
        magmaPointsTotal: 0,
        referralPointsEarned: 0,
        referralCount: 0,
        referredByWallet: null,
        rank: null,
        totalUsers,
      });
    }

    const user = userRows[0];
    const points = user.magma_points_total;

    // 2) Rank: number of users with more points + 1
    const [betterRows] = await db.query<CountRow[]>(
      "SELECT COUNT(*) AS count FROM magma_users WHERE magma_points_total > ?",
      [points]
    );
    const betterCount = betterRows[0]?.count ?? 0;
    const rank = betterCount + 1;

    // 3) Total users
    const [totalRows] = await db.query<CountRow[]>(
      "SELECT COUNT(*) AS count FROM magma_users"
    );
    const totalUsers = totalRows[0]?.count ?? 0;

    return NextResponse.json({
      walletAddress: wallet,
      magmaPointsTotal: points,
      referralPointsEarned: user.referral_points_earned,
      referralCount: user.referral_count,
      referredByWallet: user.referred_by_wallet,
      rank,
      totalUsers,
    });
  } catch (err) {
    console.error("profile error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
