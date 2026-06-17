"use client";

import { useState } from "react";
import Image from "next/image";
import {
  startTeslaOAuth,
  isApiConfigured,
  API_NOT_CONFIGURED_MESSAGE,
  type TemporaryAccess,
} from "@/lib/api";
import { RedeemCodeForm } from "@/components/RedeemCodeForm";

type AuthModalProps = {
  /**
   * Authenticated Supabase user id. The backend's `/auth/tesla/start`
   * endpoint requires it; without it we never redirect (the backend would
   * respond `{ ok: false, error: "missing userId" }`).
   */
  userId: string | null;
  /** Error to surface (e.g. a cancelled/failed OAuth return). */
  errorMessage?: string | null;
  /** Sign out of Supabase. */
  onSignOut?: () => void;
  /** Called when a guest redeems a ride-share code instead of connecting Tesla. */
  onRedeemed?: (access: TemporaryAccess) => void;
};

/**
 * Tesla connect card.
 *
 * The single primary action redirects the browser to the backend's Tesla
 * OAuth start endpoint with the signed-in user's id. All Tesla secrets and
 * the OAuth handshake live on the backend.
 */
export function AuthModal({ userId, errorMessage, onSignOut, onRedeemed }: AuthModalProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const configured = isApiConfigured();
  const error = localError ?? errorMessage ?? null;
  const canConnect = Boolean(userId) && configured;

  function handleConnect() {
    if (!userId) {
      setLocalError("You need to be signed in before connecting Tesla.");
      return;
    }
    if (!configured) {
      setLocalError(API_NOT_CONFIGURED_MESSAGE);
      return;
    }
    setLocalError(null);
    startTeslaOAuth(userId);
  }

  return (
    <div
      className="flex min-h-[480px] w-[440px] flex-col items-center gap-3 overflow-hidden rounded-2xl border border-accent-light bg-white px-4 pt-12 pb-8"
      style={{
        boxShadow:
          "0 73px 118px rgba(211,164,255,0.11), 0 27px 43px rgba(211,164,255,0.08), 0 13px 21px rgba(211,164,255,0.06), 0 6px 10px rgba(211,164,255,0.05), 0 3px 4px rgba(211,164,255,0.03)",
      }}
    >
      {/* Tesla logo */}
      <div className="relative size-16 shrink-0">
        <Image
          src="/assets/Tesla logo@2x.png"
          alt="Tesla"
          fill
          sizes="64px"
          className="object-contain"
          priority
        />
      </div>

      {/* Heading + description */}
      <div className="flex w-full flex-col gap-3 text-center text-accent-dark">
        <h1 className="text-[28px] font-bold tracking-[-1px] leading-tight">
          Connect your Tesla
        </h1>
        <p className="text-base leading-[22px]">
          Link your Tesla account so Parlé can register your
          <br />
          vehicles on the network.
        </p>
      </div>

      {/* CTA */}
      <div className="flex w-[384px] flex-col items-center gap-2 py-4">
        <button
          type="button"
          onClick={handleConnect}
          disabled={!canConnect}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent-dark px-6 text-white transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(29,6,51,0.18)] active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          <span className="relative h-[23px] w-6 shrink-0">
            <Image
              src="/assets/Tesla logo@2x.png"
              alt=""
              fill
              sizes="24px"
              className="object-contain brightness-0 invert"
            />
          </span>
          <span className="text-base font-medium">Connect with Tesla</span>
        </button>
        {error && (
          <p role="alert" className="text-center text-sm leading-[18px] text-[#dc2626]">
            {error}
          </p>
        )}
      </div>

      {/* Guest path — redeem a ride-share code instead of connecting Tesla */}
      {userId && onRedeemed && (
        <div className="flex w-[384px] flex-col items-center gap-3">
          <div className="flex w-full items-center gap-3">
            <span className="h-px flex-1 bg-desat-2" />
            <span className="shrink-0 text-xs text-desat-7">or use a shared vehicle</span>
            <span className="h-px flex-1 bg-desat-2" />
          </div>
          <RedeemCodeForm userId={userId} onRedeemed={onRedeemed} />
        </div>
      )}

      {/* Footer */}
      <div className="flex w-full flex-1 flex-col items-center justify-end gap-3 pt-4">
        <p className="text-center text-sm leading-[20px] text-desat-7">
          {`By continuing, you agree to Parlé's Terms of Service`}
          <br />
          and acknowledge our Privacy Policy.
        </p>
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="text-sm text-accent-dark underline-offset-2 transition-opacity duration-150 hover:opacity-70 hover:underline"
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
