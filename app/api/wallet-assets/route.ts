import { NextResponse } from "next/server";

const MORALIS_API_BASE = "https://deep-index.moralis.io/api/v2.2";

const CHAIN = "base sepolia";

type IncineratorAsset = {
  type: "ERC20" | "ERC721" | "ERC1155";
  contractAddress: string;
  tokenId?: string;
  symbol: string;
  name: string;
  balance: string;
  rawBalance?: string;
  decimals?: number;
  image?: string | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Missing or invalid address" },
      { status: 400 }
    );
  }

  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "MORALIS_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const headers = {
      "X-API-Key": apiKey,
    };

    // 1 - ERC20 + native balances :contentReference[oaicite:2]{index=2}
    const erc20Url = `${MORALIS_API_BASE}/wallets/${address}/tokens?chain=${encodeURIComponent(
      CHAIN
    )}`;

    // 2 - NFT (ERC721 + ERC1155) :contentReference[oaicite:3]{index=3}
    const nftUrl = `${MORALIS_API_BASE}/${address}/nft?chain=${encodeURIComponent(
      CHAIN
    )}&normalizeMetadata=true`;

    const [erc20Res, nftRes] = await Promise.all([
      fetch(erc20Url, { headers }),
      fetch(nftUrl, { headers }),
    ]);

    if (!erc20Res.ok) {
      const text = await erc20Res.text();
      console.error("Moralis ERC20 error:", text);
      throw new Error("Failed to fetch ERC20 balances");
    }

    if (!nftRes.ok) {
      const text = await nftRes.text();
      console.error("Moralis NFT error:", text);
      throw new Error("Failed to fetch NFTs");
    }

    const erc20Json = (await erc20Res.json()) as {
      result: Array<{
        token_address: string;
        symbol: string;
        name: string;
        balance: string;
        decimals: string | number;
      }>;
    };

    const nftJson = (await nftRes.json()) as {
      result: Array<{
        token_address: string;
        token_id: string;
        contract_type: string; // "ERC721" | "ERC1155"
        name: string;
        symbol: string;
        amount?: string;
        normalized_metadata?: {
          image?: string;
          image_url?: string;
        } | null;
      }>;
    };

    const erc20Assets: IncineratorAsset[] =
      erc20Json.result?.map((t) => {
        const decimals =
          typeof t.decimals === "string"
            ? parseInt(t.decimals || "0", 10)
            : t.decimals ?? 0;

        let humanBalance = t.balance;
        if (decimals > 0) {
          const padded = t.balance.padStart(decimals + 1, "0");
          const integerPart = padded.slice(0, -decimals) || "0";
          const fractionalPart = padded.slice(-decimals).replace(/0+$/, "");
          humanBalance = fractionalPart
            ? `${integerPart}.${fractionalPart}`
            : integerPart;
        }

        return {
          type: "ERC20",
          contractAddress: t.token_address,
          symbol: t.symbol || "ERC20",
          name: t.name || t.symbol || t.token_address,
          balance: humanBalance,
          rawBalance: t.balance,
          decimals,
        };
      }) ?? [];

    const nftAssets: IncineratorAsset[] =
      nftJson.result?.map((n) => {
        const contractType =
          n.contract_type === "ERC1155" ? "ERC1155" : "ERC721";
        const image =
          n.normalized_metadata?.image ||
          n.normalized_metadata?.image_url ||
          null;

        return {
          type: contractType,
          contractAddress: n.token_address,
          tokenId: n.token_id,
          symbol: n.symbol || contractType,
          name: n.name || `${contractType} #${n.token_id}`,
          balance: n.amount ?? "1",
          image,
        };
      }) ?? [];

    const allAssets: IncineratorAsset[] = [...erc20Assets, ...nftAssets];

    return NextResponse.json({ assets: allAssets });
  } catch (err) {
    console.error("wallet-assets error:", err);
    return NextResponse.json(
      { error: "Failed to fetch wallet assets" },
      { status: 500 }
    );
  }
}
