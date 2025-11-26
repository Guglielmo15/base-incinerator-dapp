"use client";

import { useAccount } from "wagmi";
import { useEffect, useState } from "react";

type MagmaProfile = {
  walletAddress: string;
  magmaPointsTotal: number;
  referralPointsEarned: number;
  referralCount: number;
  referredByWallet: string | null;
  rank: number | null;
  totalUsers: number;
};

export function MagmaBadge() {
  const { address } = useAccount();
  const [profile, setProfile] = useState<MagmaProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setProfile(null);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/magma/profile?address=${address}`);
        if (!res.ok) {
          setProfile(null);
          return;
        }
        const data = (await res.json()) as MagmaProfile;
        setProfile(data);
      } catch (err) {
        console.error("Failed to load MAGMA profile", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [address]);

  if (!address || !profile) {
    return null;
  }

  const points = profile.magmaPointsTotal ?? 0;
  const rank = profile.rank;
  const totalUsers = profile.totalUsers;

  let referralUrl = "";
  if (typeof window !== "undefined") {
    referralUrl = `${window.location.origin}?ref=${profile.walletAddress}`;
  }

  const handleCopy = async () => {
    if (!referralUrl) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(referralUrl);
      }
      // in futuro possiamo aggiungere un piccolo toast
    } catch (err) {
      console.error("Failed to copy referral link", err);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm bg-black/40 hover:bg-black/60"
      >
        <span role="img" aria-label="fire">
          🔥
        </span>
        <span>{points} $MAGMA</span>
        {rank && totalUsers > 0 && (
          <span className="text-xs opacity-80">Rank #{rank}</span>
        )}
        {loading && <span className="text-xs opacity-60">...</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl border bg-black/90 p-4 text-sm shadow-lg z-20">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setOpen(false)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              Close
            </button>
          </div>

          <p className="mb-1">
            Total points: <strong>{points}</strong>
          </p>

          {rank && totalUsers > 0 && (
            <p className="mb-2 text-xs opacity-80">Rank #{rank}</p>
          )}

          <p className="mb-2">
            Referral rewards:{" "}
            <strong>{profile.referralPointsEarned} MAGMA</strong> from{" "}
            <strong>{profile.referralCount}</strong> referred users.
          </p>

          <div className="mt-3">
            <p className="mb-1 text-xs opacity-80">
              Share your referral link and earn 10 percent of your referred
              users MAGMA.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 text-xs break-all bg-black/60 rounded-lg px-2 py-1">
                {referralUrl}
              </div>
              <button
                onClick={handleCopy}
                className="text-xs border rounded-lg px-2 py-1 hover:bg-white hover:text-black"
              >
                Copy
              </button>
            </div>
          </div>

          {profile.referredByWallet && (
            <p className="mt-3 text-xs opacity-70">
              You were referred by: {profile.referredByWallet}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
