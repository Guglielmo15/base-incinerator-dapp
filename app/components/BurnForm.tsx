"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatEther, parseUnits, isAddress, BaseError, Hex } from "viem";
import { baseSepolia } from "wagmi/chains";
import { useSearchParams } from "next/navigation";
import { INCINERATOR_ADDRESS, INCINERATOR_ABI } from "@/lib/contract";
import {
  ERC20_ABI,
  ERC165_ABI,
  ERC721_EXTRA_ABI,
  ERC1155_EXTRA_ABI,
} from "@/lib/abis";

type TokenType = "erc20" | "erc721" | "erc1155" | "unknown";

type WalletAssetType = "ERC20" | "ERC721" | "ERC1155";

type WalletAsset = {
  type: WalletAssetType;
  contractAddress: string;
  tokenId?: string;
  symbol: string;
  name: string;
  balance: string;
  decimals?: number;
};

const IFACE_ERC721 = "0x80ac58cd";
const IFACE_ERC1155 = "0xd9b67a26";

export default function BurnForm() {
  const { address } = useAccount();
  const pc = usePublicClient();
  const searchParams = useSearchParams();

  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeErr,
  } = useWriteContract();

  // Wallet assets (from Moralis via backend)
  const [walletAssets, setWalletAssets] = useState<WalletAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [selectedAssetIndex, setSelectedAssetIndex] = useState<string>("");

  // Manual form state (fallback and for fine control)
  const [tokenAddr, setTokenAddr] = useState<string>("");
  const tokenAddrValid = isAddress(tokenAddr);
  const tokenAddrHex = (tokenAddrValid ? tokenAddr : undefined) as
    | `0x${string}`
    | undefined;

  const [tokenType, setTokenType] = useState<TokenType>("unknown");
  const [amountStr, setAmountStr] = useState<string>(""); // ERC20 amount or ERC1155 quantity
  const [tokenIdStr, setTokenIdStr] = useState<string>(""); // ERC721/1155 token id
  const [feeWei, setFeeWei] = useState<bigint | null>(null);
  const [decimals, setDecimals] = useState<number>(18);

  const { data: receipt } = useWaitForTransactionReceipt({
    hash: txHash as Hex | undefined,
  });

  // Approval flags
  const [needApprove20, setNeedApprove20] = useState(false);
  const [needApprove721, setNeedApprove721] = useState(false);
  const [needApprove1155, setNeedApprove1155] = useState(false);

  // Store referral address from URL in localStorage
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref && isAddress(ref)) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("baseIncinerator_ref", ref.toLowerCase());
      }
    }
  }, [searchParams]);

  // Fetch wallet assets when address changes
  useEffect(() => {
    if (!address) {
      setWalletAssets([]);
      setAssetsError(null);
      setAssetsLoading(false);
      setSelectedAssetIndex("");
      return;
    }

    const fetchAssets = async () => {
      try {
        setAssetsLoading(true);
        setAssetsError(null);
        setSelectedAssetIndex("");

        const res = await fetch(`/api/wallet-assets?address=${address}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load wallet assets");
        }

        const data = await res.json();
        const assets = (data.assets ?? []) as WalletAsset[];
        setWalletAssets(assets);
      } catch (err) {
        console.error("wallet-assets error:", err);
        if (err instanceof Error) {
          setAssetsError(err.message || "Unknown error while loading assets");
        } else {
          setAssetsError("Unknown error while loading assets");
        }
      } finally {
        setAssetsLoading(false);
      }
    };

    fetchAssets();
  }, [address]);

  // Read fee once
  useEffect(() => {
    (async () => {
      if (!pc) return;
      try {
        const v = (await pc.readContract({
          address: INCINERATOR_ADDRESS,
          abi: INCINERATOR_ABI,
          functionName: "BURN_FEE",
        })) as bigint;
        setFeeWei(v);
      } catch (err) {
        console.error("Failed to read burn fee", err);
        setFeeWei(null);
      }
    })();
  }, [pc]);

  // Detect token standard (manual detection)
  const detect = async () => {
    if (!pc || !tokenAddrHex) {
      setTokenType("unknown");
      return;
    }
    try {
      const is721 = (await pc
        .readContract({
          address: tokenAddrHex,
          abi: ERC165_ABI,
          functionName: "supportsInterface",
          args: [IFACE_ERC721],
        })
        .catch(() => false)) as boolean;
      if (is721) {
        setTokenType("erc721");
        return;
      }

      const is1155 = (await pc
        .readContract({
          address: tokenAddrHex,
          abi: ERC165_ABI,
          functionName: "supportsInterface",
          args: [IFACE_ERC1155],
        })
        .catch(() => false)) as boolean;
      if (is1155) {
        setTokenType("erc1155");
        return;
      }

      const dec = (await pc
        .readContract({
          address: tokenAddrHex,
          abi: ERC20_ABI,
          functionName: "decimals",
        })
        .catch(() => null)) as number | null;
      if (dec !== null) {
        setDecimals(dec);
        setTokenType("erc20");
        return;
      }

      setTokenType("unknown");
    } catch (err) {
      console.error("Detect error", err);
      setTokenType("unknown");
    }
  };

  // Apply selected wallet asset to the form
  const applyAssetSelection = (asset: WalletAsset | null) => {
    if (!asset) {
      // Keep manual values as they are
      return;
    }

    setTokenAddr(asset.contractAddress);

    const lowerType = asset.type.toLowerCase() as TokenType;
    setTokenType(lowerType);

    if (asset.type === "ERC20") {
      if (typeof asset.decimals === "number") {
        setDecimals(asset.decimals);
      }
      setTokenIdStr("");
      setAmountStr(asset.balance || "");
    } else if (asset.type === "ERC721") {
      setTokenIdStr(asset.tokenId ?? "");
      setAmountStr("1");
    } else if (asset.type === "ERC1155") {
      setTokenIdStr(asset.tokenId ?? "");
      setAmountStr(asset.balance || "");
    }
  };

  // Check approve need for ERC20
  useEffect(() => {
    (async () => {
      if (
        !pc ||
        tokenType !== "erc20" ||
        !address ||
        !amountStr ||
        !tokenAddrHex
      ) {
        setNeedApprove20(false);
        return;
      }
      try {
        const amountWei = parseUnits(amountStr, decimals);
        const allowance = (await pc.readContract({
          address: tokenAddrHex,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, INCINERATOR_ADDRESS],
        })) as bigint;
        setNeedApprove20(allowance < amountWei);
      } catch (err) {
        console.error("ERC20 allowance check error", err);
        setNeedApprove20(true);
      }
    })();
  }, [pc, tokenType, address, amountStr, tokenAddrHex, decimals]);

  // Check approve need for ERC721
  useEffect(() => {
    (async () => {
      if (
        !pc ||
        tokenType !== "erc721" ||
        !address ||
        !tokenAddrHex ||
        !tokenIdStr
      ) {
        setNeedApprove721(false);
        return;
      }
      try {
        const approved = (await pc.readContract({
          address: tokenAddrHex,
          abi: ERC721_EXTRA_ABI,
          functionName: "getApproved",
          args: [BigInt(tokenIdStr)],
        })) as `0x${string}`;
        if (
          approved &&
          approved.toLowerCase() === INCINERATOR_ADDRESS.toLowerCase()
        ) {
          setNeedApprove721(false);
          return;
        }
        const isAll = (await pc.readContract({
          address: tokenAddrHex,
          abi: ERC721_EXTRA_ABI,
          functionName: "isApprovedForAll",
          args: [address, INCINERATOR_ADDRESS],
        })) as boolean;
        setNeedApprove721(!isAll);
      } catch (err) {
        console.error("ERC721 approve check error", err);
        setNeedApprove721(true);
      }
    })();
  }, [pc, tokenType, address, tokenAddrHex, tokenIdStr]);

  // Check approve need for ERC1155
  useEffect(() => {
    (async () => {
      if (!pc || tokenType !== "erc1155" || !address || !tokenAddrHex) {
        setNeedApprove1155(false);
        return;
      }
      try {
        const isAll = (await pc.readContract({
          address: tokenAddrHex,
          abi: ERC1155_EXTRA_ABI,
          functionName: "isApprovedForAll",
          args: [address, INCINERATOR_ADDRESS],
        })) as boolean;
        setNeedApprove1155(!isAll);
      } catch (err) {
        console.error("ERC1155 approve check error", err);
        setNeedApprove1155(true);
      }
    })();
  }, [pc, tokenType, address, tokenAddrHex]);

  // Approve actions
  const onApprove20 = async () => {
    if (!tokenAddrHex) return;
    const amountWei = parseUnits(amountStr || "0", decimals);
    await writeContract({
      address: tokenAddrHex,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [INCINERATOR_ADDRESS, amountWei],
    });
  };

  const onApprove721 = async () => {
    if (!tokenAddrHex) return;
    await writeContract({
      address: tokenAddrHex,
      abi: ERC721_EXTRA_ABI,
      functionName: "setApprovalForAll",
      args: [INCINERATOR_ADDRESS, true],
    });
  };

  const onApprove1155 = async () => {
    if (!tokenAddrHex) return;
    await writeContract({
      address: tokenAddrHex,
      abi: ERC1155_EXTRA_ABI,
      functionName: "setApprovalForAll",
      args: [INCINERATOR_ADDRESS, true],
    });
  };

  // Burn actions
  const onBurn = async () => {
    if (!feeWei || !tokenAddrHex) return;

    if (tokenType === "erc20") {
      const amountWei = parseUnits(amountStr || "0", decimals);
      await writeContract({
        address: INCINERATOR_ADDRESS,
        abi: INCINERATOR_ABI,
        functionName: "burnErc20",
        args: [tokenAddrHex, amountWei],
        value: feeWei,
      });
    } else if (tokenType === "erc721") {
      const tokenId = BigInt(tokenIdStr || "0");
      await writeContract({
        address: INCINERATOR_ADDRESS,
        abi: INCINERATOR_ABI,
        functionName: "burnErc721",
        args: [tokenAddrHex, tokenId],
        value: feeWei,
      });
    } else if (tokenType === "erc1155") {
      const tokenId = BigInt(tokenIdStr || "0");
      const qty = BigInt(amountStr || "0");
      await writeContract({
        address: INCINERATOR_ADDRESS,
        abi: INCINERATOR_ABI,
        functionName: "burnErc1155",
        args: [tokenAddrHex, tokenId, qty],
        value: feeWei,
      });
    }
  };

  // After tx is confirmed, record MAGMA burn on backend
  useEffect(() => {
    const recordBurn = async () => {
      if (!receipt || !address) return;

      try {
        const ref =
          typeof window !== "undefined"
            ? window.localStorage.getItem("baseIncinerator_ref")
            : null;

        await fetch("/api/magma/record-burn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: address,
            txHash: receipt.transactionHash,
            referrer: ref,
          }),
        });
      } catch (err) {
        console.error("Failed to record MAGMA burn", err);
      }
    };

    recordBurn();
  }, [receipt, address]);

  const explorerBase =
    baseSepolia.blockExplorers?.default?.url ?? "https://sepolia.basescan.org";
  const txUrl = txHash ? `${explorerBase}/tx/${txHash}` : undefined;

  const errMsg =
    (writeErr as BaseError | undefined)?.shortMessage ||
    (writeErr as Error | undefined)?.message ||
    "";

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      {/* Wallet assets dropdown */}
      {address && (
        <div className="grid gap-3">
          <label className="text-sm opacity-80">
            Select an asset from your wallet (Base Sepolia)
          </label>

          {assetsLoading && (
            <p className="text-sm opacity-70">Loading wallet assets...</p>
          )}

          {assetsError && !assetsLoading && (
            <p className="text-sm text-red-500">
              Failed to load wallet assets: {assetsError}
            </p>
          )}

          {!assetsLoading && !assetsError && walletAssets.length === 0 && (
            <p className="text-sm opacity-70">
              No assets detected for this wallet on Base Sepolia.
            </p>
          )}

          {!assetsLoading && walletAssets.length > 0 && (
            <select
              className="border rounded-xl p-3 bg-transparent"
              value={selectedAssetIndex}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedAssetIndex(value);

                if (!value) {
                  applyAssetSelection(null);
                  return;
                }

                const idx = parseInt(value, 10);
                const asset = walletAssets[idx];
                applyAssetSelection(asset ?? null);
              }}
            >
              <option value="">
                Select asset from wallet or use manual input below
              </option>

              <optgroup label="ERC20">
                {walletAssets.map((a, i) =>
                  a.type === "ERC20" ? (
                    <option key={`erc20-${i}`} value={String(i)}>
                      {a.symbol || "ERC20"} · {a.balance} {a.symbol || ""}
                    </option>
                  ) : null
                )}
              </optgroup>

              <optgroup label="ERC721">
                {walletAssets.map((a, i) =>
                  a.type === "ERC721" ? (
                    <option key={`erc721-${i}`} value={String(i)}>
                      {a.name || "ERC721"} #{a.tokenId}
                    </option>
                  ) : null
                )}
              </optgroup>

              <optgroup label="ERC1155">
                {walletAssets.map((a, i) =>
                  a.type === "ERC1155" ? (
                    <option key={`erc1155-${i}`} value={String(i)}>
                      {a.name || "ERC1155"} #{a.tokenId} · qty {a.balance}
                    </option>
                  ) : null
                )}
              </optgroup>
            </select>
          )}
        </div>
      )}

      {/* Manual input fallback */}
      <div className="grid gap-3">
        <label className="text-sm opacity-80">Token address</label>
        <input
          className="border rounded-xl p-3 bg-transparent"
          placeholder="0x..."
          value={tokenAddr}
          onChange={(e) => setTokenAddr(e.target.value.trim())}
        />
        <button
          onClick={detect}
          className="rounded-xl border px-4 py-2"
          disabled={!tokenAddrValid || isPending}
        >
          Detect
        </button>
        <p className="text-sm opacity-70">
          Detected: {tokenType.toUpperCase()}
        </p>
      </div>

      {tokenType === "erc20" && (
        <div className="grid gap-3">
          <label className="text-sm opacity-80">
            Amount ({decimals} decimals)
          </label>
          <input
            className="border rounded-xl p-3 bg-transparent"
            placeholder="e.g. 10.5"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        </div>
      )}

      {tokenType === "erc721" && (
        <div className="grid gap-3">
          <label className="text-sm opacity-80">Token ID</label>
          <input
            className="border rounded-xl p-3 bg-transparent"
            placeholder="e.g. 1234"
            value={tokenIdStr}
            onChange={(e) => setTokenIdStr(e.target.value)}
          />
        </div>
      )}

      {tokenType === "erc1155" && (
        <div className="grid gap-3">
          <label className="text-sm opacity-80">Token ID</label>
          <input
            className="border rounded-xl p-3 bg-transparent"
            placeholder="e.g. 1"
            value={tokenIdStr}
            onChange={(e) => setTokenIdStr(e.target.value)}
          />
          <label className="text-sm opacity-80">Quantity</label>
          <input
            className="border rounded-xl p-3 bg-transparent"
            placeholder="e.g. 5"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 items-center">
        {tokenType === "erc20" && needApprove20 && (
          <button
            onClick={onApprove20}
            disabled={isPending || !tokenAddrValid}
            className="rounded-xl border px-4 py-2"
          >
            Approve ERC20
          </button>
        )}

        {tokenType === "erc721" && needApprove721 && (
          <button
            onClick={onApprove721}
            disabled={isPending || !tokenAddrValid || !tokenIdStr}
            className="rounded-xl border px-4 py-2"
          >
            Approve ERC721 (setApprovalForAll)
          </button>
        )}

        {tokenType === "erc1155" && needApprove1155 && (
          <button
            onClick={onApprove1155}
            disabled={isPending || !tokenAddrValid}
            className="rounded-xl border px-4 py-2"
          >
            Approve ERC1155 (setApprovalForAll)
          </button>
        )}

        <button
          onClick={onBurn}
          disabled={
            !feeWei || isPending || tokenType === "unknown" || !tokenAddrValid
          }
          className="rounded-xl border px-4 py-2"
        >
          {isPending ? "Burning..." : "Burn"}
        </button>

        {txUrl && (
          <a
            className="text-sm underline"
            href={txUrl}
            target="_blank"
            rel="noreferrer"
          >
            View on BaseScan
          </a>
        )}
      </div>

      {!!errMsg && <p className="text-red-500 text-sm">{errMsg}</p>}
      {receipt && (
        <p className="text-green-500 text-sm">
          Confirmed in block #{receipt.blockNumber?.toString()}
        </p>
      )}

      {feeWei && (
        <p className="text-xs opacity-60">
          Burn fee: {formatEther(feeWei)} ETH
        </p>
      )}
    </div>
  );
}
