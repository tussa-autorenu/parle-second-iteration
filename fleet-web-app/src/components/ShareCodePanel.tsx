"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  getReadableErrorMessage,
  type ApiVehicle,
  type ShareCode,
} from "@/lib/api";
import { formatExpiry, useNow } from "@/lib/format";

type ShareCodePanelProps = {
  userId: string;
  /** Owned vehicles the owner can mint share codes for. */
  vehicles: ApiVehicle[];
};

function vehicleLabel(v: ApiVehicle): string {
  return v.name || `${v.year} ${v.model}`.trim() || v.vin || v.id;
}

/**
 * Owner-only panel: shows the active ride-share code for a chosen vehicle, with
 * copy and regenerate controls. Codes rotate every 24h or on demand.
 */
export function ShareCodePanel({ userId, vehicles }: ShareCodePanelProps) {
  const [vehicleId, setVehicleId] = useState<string>(vehicles[0]?.id ?? "");
  const [code, setCode] = useState<ShareCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const now = useNow();

  const load = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const c = await api.getShareCode(userId, id);
        setCode(c);
        setError(null);
      } catch (err) {
        setCode(null);
        setError(getReadableErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    // Wrapped in a local function so the loading/reset setState calls run inside
    // a callback boundary rather than synchronously in the effect body.
    const begin = () => {
      setLoading(true);
      setCopied(false);
      void load(vehicleId);
    };
    begin();
  }, [vehicleId, load]);

  async function regenerate() {
    if (!vehicleId) return;
    setRegenerating(true);
    setError(null);
    try {
      const c = await api.regenerateShareCode(userId, vehicleId);
      setCode(c);
      setCopied(false);
    } catch (err) {
      setError(getReadableErrorMessage(err));
    } finally {
      setRegenerating(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context) — ignore.
    }
  }

  const expiry = code ? formatExpiry(code.expiresAt, now) : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-desat-3 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-accent-dark">Ride-share code</p>
        {vehicles.length > 1 && (
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="h-8 max-w-[200px] rounded-lg border border-desat-3 bg-white px-2 text-xs text-accent-dark outline-none focus:border-accent-primary"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {vehicleLabel(v)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-3xl font-bold tracking-[2px] text-accent-primary">
          {loading ? "······" : code?.code ?? "—"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!code}
            className="h-9 rounded-lg border border-desat-3 bg-white px-3 text-sm font-medium text-accent-dark transition-colors hover:bg-desat-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => void regenerate()}
            disabled={regenerating || !vehicleId}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-accent-dark px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {regenerating && (
              <span
                aria-hidden
                className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            )}
            Regenerate
          </button>
        </div>
      </div>

      <p className="text-xs leading-[16px] text-desat-7">
        {error
          ? error
          : code
          ? `Share this code with a guest. ${expiry?.label ?? ""}. They pick how long their access lasts.`
          : "Generating a code…"}
      </p>
    </div>
  );
}
