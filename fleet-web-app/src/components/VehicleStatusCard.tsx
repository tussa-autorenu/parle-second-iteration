"use client";

import Image from "next/image";
import { motion } from "motion/react";
import type { VehicleLiveStatus, VehiclePermissions } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { formatExpiry, useNow } from "@/lib/format";

export type VehicleAction = "wake" | "lock" | "unlock" | "ready";

type VehicleStatusCardProps = {
  year: string;
  model: string;
  vin: string;
  imageSrc: string;
  /** Live status from the backend, or null while loading / on error. */
  live: VehicleLiveStatus | null;
  loading: boolean;
  /** Readable error from the last status fetch or command, if any. */
  error: string | null;
  /** Which command is currently running for this vehicle (disables the others). */
  busyAction: VehicleAction | null;
  /** Sample weekly earnings shown for context (not yet backed by an endpoint). */
  earnings: number;
  /** True when this vehicle is accessed via a temporary ride-share. */
  shared?: boolean;
  /** Allowed commands; defaults to everything for owned vehicles. */
  permissions?: VehiclePermissions;
  /** ISO expiry for a shared vehicle's temporary access. */
  expiresAt?: string;
  onRetry: () => void;
  onWake: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onReady: () => void;
};

/** Soft 5-layer purple drop shadow that lights up an online card. */
const ONLINE_SHADOW =
  "0 73px 118px rgba(211,164,255,0.11), 0 27px 43px rgba(211,164,255,0.08), 0 13px 21px rgba(211,164,255,0.06), 0 6px 10px rgba(211,164,255,0.05), 0 3px 4px rgba(211,164,255,0.03)";

function stateLabel(state: string | undefined, loading: boolean): string {
  if (loading) return "Checking…";
  if (!state) return "Unknown";
  if (state === "online") return "Online";
  if (state === "asleep") return "Asleep";
  if (state === "offline") return "Offline";
  return state.charAt(0).toUpperCase() + state.slice(1);
}

/**
 * One vehicle's card on the owner dashboard.
 *
 * Shows live state + battery from the backend and exposes the real Tesla
 * commands: Wake when asleep/offline, and Lock / Unlock / Ready when online.
 * Earnings are sample figures until an earnings endpoint exists.
 */
export function VehicleStatusCard({
  year,
  model,
  vin,
  imageSrc,
  live,
  loading,
  error,
  busyAction,
  earnings,
  shared = false,
  permissions,
  expiresAt,
  onRetry,
  onWake,
  onLock,
  onUnlock,
  onReady,
}: VehicleStatusCardProps) {
  const now = useNow();
  const isOnline = live?.state === "online";
  const battery = live?.batteryLevel;
  const busy = busyAction !== null;

  // Owned vehicles allow every command; shared vehicles follow permissions.
  const canWake = permissions?.wake ?? true;
  const canLock = permissions?.lock ?? true;
  const canUnlock = permissions?.unlock ?? true;
  const canReady = permissions?.ready ?? true;

  const expiry = shared && expiresAt ? formatExpiry(expiresAt, now) : null;

  return (
    <div
      className={`relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border bg-white p-4 transition-colors duration-300 ${
        isOnline ? "border-accent-light" : "border-desat-3"
      }`}
      style={{ boxShadow: isOnline ? ONLINE_SHADOW : undefined }}
    >
      {/* Status indicator */}
      <div className="pointer-events-none absolute top-[23px] left-[23px] z-10 flex items-center gap-1">
        <StatusDot online={isOnline} />
        <span
          className={`text-xs font-medium uppercase leading-3 tracking-[0.96px] ${
            isOnline ? "text-accent-primary" : "text-desat-7"
          }`}
        >
          {stateLabel(live?.state, loading)}
        </span>
      </div>

      {/* Temporary-access badge (shared vehicles only) */}
      {shared && (
        <div className="absolute top-[18px] right-[18px] z-10">
          <Badge tone={expiry ? (expiry.tone === "ok" ? "temporary" : expiry.tone) : "temporary"}>
            {expiry?.tone === "expired" ? "Expired" : expiry?.label ?? "Temporary"}
          </Badge>
        </div>
      )}

      {/* Image area */}
      <div className="flex h-[160px] w-full items-center justify-center overflow-hidden rounded-xl bg-desat-1">
        <div className="relative size-[210px] shrink-0 mix-blend-multiply">
          <Image src={imageSrc} alt="" fill sizes="210px" className="object-cover" />
        </div>
      </div>

      {/* Title block */}
      <div className="flex flex-col gap-2 px-2">
        <p className="text-xl font-bold leading-tight tracking-[-0.5px] text-accent-dark">
          {`${year} ${model}`.trim()}
        </p>
        <p className="font-mono text-sm leading-[14px] text-desat-7">{vin}</p>
      </div>

      {/* Stats row — Battery (live) + Earnings (sample) */}
      <div className="flex w-full gap-3">
        <div className="flex w-[110px] flex-col gap-2 border-r border-desat-3 p-2">
          <p className="font-mono text-sm leading-[14px] text-accent-dark">Battery</p>
          <p className="text-4xl font-normal leading-tight tracking-[-0.5px] text-accent-primary">
            {typeof battery === "number" ? `${battery}%` : "—"}
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-2">
          <p className="font-mono text-sm leading-[14px] text-accent-dark">Earnings</p>
          <p className="text-4xl font-normal leading-tight tracking-[-0.5px] text-accent-primary">
            ${earnings.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Control area */}
      <div className="min-h-[48px] w-full">
        {error ? (
          <div className="flex flex-col gap-2 rounded-xl border border-[#dc2626]/20 bg-[#dc2626]/5 px-3 py-2">
            <p role="alert" className="text-sm leading-[18px] text-[#dc2626]">
              {error}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="self-start text-sm font-medium text-accent-dark underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : isOnline ? (
          <div className="flex items-center gap-2 rounded-xl bg-accent-light/15 p-2">
            {canLock && (
              <ActionButton label="Lock" onClick={onLock} loading={busyAction === "lock"} disabled={busy} />
            )}
            {canUnlock && (
              <ActionButton label="Unlock" onClick={onUnlock} loading={busyAction === "unlock"} disabled={busy} />
            )}
            {canReady && (
              <ActionButton label="Ready" primary onClick={onReady} loading={busyAction === "ready"} disabled={busy} />
            )}
            {!canLock && !canUnlock && !canReady && (
              <span className="px-1 text-sm text-desat-7">View-only access</span>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-desat-3 px-3 py-2">
            <span className="text-sm font-medium text-accent-dark">
              {loading
                ? "Checking vehicle…"
                : canWake
                ? "Wake to send commands"
                : "Vehicle is asleep"}
            </span>
            {canWake && (
              <ActionButton
                label="Wake"
                primary
                onClick={onWake}
                loading={busyAction === "wake"}
                disabled={busy || loading}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  primary = false,
  loading = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-[opacity,background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-accent-dark text-white hover:opacity-90"
          : "border border-desat-3 bg-white text-accent-dark hover:bg-desat-1"
      }`}
    >
      {loading && (
        <span
          aria-hidden
          className={`size-3.5 animate-spin rounded-full border-2 ${
            primary ? "border-white/40 border-t-white" : "border-desat-3 border-t-accent-primary"
          }`}
        />
      )}
      {label}
    </button>
  );
}

function StatusDot({ online }: { online: boolean }) {
  if (!online) {
    return <span className="size-3 shrink-0 rounded-full bg-desat-7" />;
  }
  return (
    <span className="relative inline-flex size-3 shrink-0">
      <motion.span
        className="absolute inset-0 rounded-full bg-accent-primary"
        animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
      />
      <span className="relative size-3 rounded-full bg-accent-primary" />
    </span>
  );
}
