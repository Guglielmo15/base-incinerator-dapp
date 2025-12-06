"use client";

import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Animated points value
  const [displayPoints, setDisplayPoints] = useState(0);

  // Fetch MAGMA profile for connected wallet
  useEffect(() => {
    if (!address) {
      setProfile(null);
      setError(null);
      setLoading(false);
      setDisplayPoints(0); // reset when wallet disconnects
      return;
    }

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/magma/profile?address=${address}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load MAGMA profile");
        }

        const data = (await res.json()) as MagmaProfile;
        setProfile(data);
      } catch (err) {
        console.error("MAGMA profile error:", err);
        if (err instanceof Error) {
          setError(err.message || "Unknown error while loading MAGMA profile");
        } else {
          setError("Unknown error while loading MAGMA profile");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [address]);

  // Animate points when profile data updates
  useEffect(() => {
    if (!profile) {
      setDisplayPoints(0);
      return;
    }

    const target = profile.magmaPointsTotal ?? 0;
    const duration = 700; // ms
    const startValue = 0;
    let startTime: number | null = null;
    let frameId: number;

    const animate = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const value = Math.round(startValue + (target - startValue) * progress);
      setDisplayPoints(value);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [profile?.magmaPointsTotal, profile]);

  // Build referral URL from current origin + ref param
  const referralUrl =
    typeof window !== "undefined" && profile
      ? `${window.location.origin}?ref=${profile.walletAddress}`
      : "";

  const truncatedReferralUrl =
    referralUrl && referralUrl.length > 50
      ? `${referralUrl.slice(0, 28)}...${referralUrl.slice(-14)}`
      : referralUrl;

  const handleCopy = async () => {
    if (!referralUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralUrl);
      } else {
        // Basic fallback for very old browsers
        const textarea = document.createElement("textarea");
        textarea.value = referralUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy referral link failed:", err);
    }
  };

  if (!address) {
    return null;
  }

  const points = profile?.magmaPointsTotal ?? 0;
  const rankText =
    profile?.rank != null && profile.totalUsers
      ? `Rank #${profile.rank}`
      : profile?.rank != null
      ? `Rank #${profile.rank}`
      : "Unranked";

  const referralSummary =
    profile && profile.referralCount > 0
      ? `Referral rewards: ${profile.referralPointsEarned} $MAGMA from ${
          profile.referralCount
        } referred ${profile.referralCount === 1 ? "user" : "users"}.`
      : "You do not have referral rewards yet.";

  return (
    <div className="relative inline-block text-white">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading && !profile}
        className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold shadow-md
                  bg-gradient-to-r from-orange-500 to-pink-500 hover:opacity-90 disabled:opacity-60"
      >
        <span role="img" aria-label="flame">
          🔥
        </span>
        {loading && !profile ? (
          <span>Loading MAGMA...</span>
        ) : (
          <>
            <span>{displayPoints} $MAGMA</span>
            {profile && profile.rank != null && (
              <span className="flex items-center gap-1 text-xs opacity-80">
                · {rankText}
                <ChevronDown
                  aria-hidden="true"
                  className="h-3 w-3 translate-y-[1px]"
                />
              </span>
            )}
          </>
        )}
      </button>

      {/* Overlay and popover */}
      {open && profile && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          {/* Gradient border + glow wrapper */}
          <div
            className="relative w-full max-w-md rounded-3xl bg-gradient-to-r from-orange-500 via-pink-500 to-orange-500 p-[1.5px]
                       shadow-[0_0_40px_rgba(255,105,0,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-[22px] bg-black/90 px-6 py-5 text-white">
              {/* Header */}
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold">Your MAGMA profile</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-sm"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {/* Main score block */}
              <div className="mt-4 rounded-2xl bg-neutral-800 px-4 py-3">
                <p className="text-xl font-bold">{displayPoints} $MAGMA</p>
                <p className="mt-1 text-xs opacity-80">{rankText}</p>

                {/* Decorative progress bar, always full for color */}
                <div className="mt-3 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full w-full rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, #ff9900 0%, #ff4b4b 50%, #ff9900 100%)",
                    }}
                  />
                </div>
              </div>

              {/* Referral rewards summary */}
              <div className="mt-4 flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-lg">👥</span>
                <p className="opacity-90" style={{ marginTop: "7px" }}>
                  {referralSummary}
                </p>
              </div>

              {/* Referral link block */}
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide opacity-70">
                  Your referral link
                </p>
                <p className="mt-1 text-xs opacity-80">
                  Share it with a friend and earn 10 % of all MAGMA points they
                  generate.
                </p>

                <div className="mt-3 flex items-center gap-2 rounded-xl bg-neutral-800 px-3 py-2 text-xs">
                  <div className="flex-1 overflow-hidden">
                    <p className="font-mono truncate">{truncatedReferralUrl}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="whitespace-nowrap rounded-lg border border-white/20 px-3 py-1 text-xs hover:bg-white hover:text-black"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>

                {copied && (
                  <p className="mt-2 text-xs text-green-400">
                    Link copied to clipboard.
                  </p>
                )}
              </div>

              {/* Referred by info */}
              {profile.referredByWallet && (
                <p className="mt-4 text-xs opacity-70">
                  You were referred by: {profile.referredByWallet}
                </p>
              )}

              {/* Error message, if any */}
              {error && (
                <p className="mt-3 text-xs text-red-400">
                  Failed to load some MAGMA data: {error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
