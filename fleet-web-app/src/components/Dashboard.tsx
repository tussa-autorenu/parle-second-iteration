"use client";

/**
 * Signed-in home: Tesla connection status, connect/disconnect, and the
 * vehicle list. Mirrors the Rork app flow — connect Tesla first, then load
 * the cars and pick which ones belong to the active fleet.
 *
 * Fleet selection is stored per-user in localStorage for the MVP; commands
 * and telemetry continue to live on the backend.
 */

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  ApiError,
  disconnectTesla,
  getTeslaStatus,
  getVehicles,
  startTeslaOAuth,
  type TeslaStatus,
  type Vehicle,
} from "@/lib/api";

type Banner = { kind: "success" | "error"; text: string } | null;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function fleetStorageKey(userId: string) {
  return `parle.fleet.${userId}`;
}

function loadFleetSelection(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(fleetStorageKey(userId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveFleetSelection(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(fleetStorageKey(userId), JSON.stringify([...ids]));
  } catch {
    // Storage unavailable (private mode etc.) — selection just won't persist.
  }
}

export function Dashboard() {
  const { user, userId, signOut } = useAuth();

  const [banner, setBanner] = useState<Banner>(null);

  const [status, setStatus] = useState<TeslaStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  // Bumped by retry/disconnect handlers to re-run the status effect.
  const [statusVersion, setStatusVersion] = useState(0);

  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehiclesVersion, setVehiclesVersion] = useState(0);

  const [fleet, setFleet] = useState<Set<string>>(new Set());
  const [disconnecting, setDisconnecting] = useState(false);

  const linked = status?.linked === true;

  // ── OAuth return banner (?linked=1 / ?linked=0&error=…) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedParam = params.get("linked");
    if (linkedParam === null) return;

    // Clean the query string so refreshes don't re-show the banner.
    window.history.replaceState(null, "", window.location.pathname);

    const reason = params.get("error");
    const next: Banner =
      linkedParam === "1"
        ? { kind: "success", text: "Tesla account connected." }
        : {
            kind: "error",
            text: reason
              ? `Tesla connection failed: ${reason.replace(/_/g, " ")}`
              : "Tesla connection failed. Please try again.",
          };

    // Deferred so the state update happens outside the effect body
    // (react-hooks/set-state-in-effect).
    const timer = window.setTimeout(() => setBanner(next), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // ── Tesla status ──
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getTeslaStatus(userId)
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setStatusError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus(null);
        setStatusError(errorMessage(err, "Could not load Tesla status."));
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, statusVersion]);

  function retryStatus() {
    setStatusLoading(true);
    setStatusError(null);
    setStatusVersion((v) => v + 1);
  }

  // ── Vehicles (auto-load once linked) ──
  useEffect(() => {
    if (!userId || !linked) return;
    let cancelled = false;
    getVehicles(userId)
      .then((list) => {
        if (cancelled) return;
        setVehicles(list);
        setVehiclesError(null);
        setFleet(loadFleetSelection(userId));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setVehicles(null);
        setVehiclesError(errorMessage(err, "Could not load vehicles."));
      })
      .finally(() => {
        if (!cancelled) setVehiclesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, linked, vehiclesVersion]);

  function refreshVehicles() {
    setVehiclesLoading(true);
    setVehiclesError(null);
    setVehiclesVersion((v) => v + 1);
  }

  function toggleFleet(vehicleId: string) {
    if (!userId) return;
    setFleet((prev) => {
      const next = new Set(prev);
      if (next.has(vehicleId)) next.delete(vehicleId);
      else next.add(vehicleId);
      saveFleetSelection(userId, next);
      return next;
    });
  }

  async function handleDisconnect() {
    if (!userId || disconnecting) return;
    setDisconnecting(true);
    try {
      await disconnectTesla(userId);
      setVehicles(null);
      setBanner({ kind: "success", text: "Tesla account disconnected." });
      retryStatus();
    } catch (err) {
      setBanner({
        kind: "error",
        text: errorMessage(err, "Could not disconnect Tesla."),
      });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-desat-0">
      {/* ── Header ── */}
      <header className="border-b border-desat-2 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Image
            src="/assets/Parle_Logo.svg"
            alt="Parle"
            width={96}
            height={28}
            priority
          />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-desat-7 sm:block">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-desat-3 px-3 py-1.5 text-sm font-medium text-accent-dark transition-colors hover:bg-desat-1"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
        {/* ── OAuth / action banner ── */}
        {banner && (
          <div
            role="status"
            className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${
              banner.kind === "success"
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-700"
            }`}
          >
            <span>{banner.text}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="ml-4 font-medium underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Tesla connection card ── */}
        <section className="rounded-2xl border border-desat-2 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative size-10 shrink-0">
                <Image
                  src="/assets/Tesla logo@2x.png"
                  alt="Tesla"
                  fill
                  sizes="40px"
                  className="object-contain"
                />
              </div>
              <div>
                <h2 className="text-lg font-bold text-accent-dark">
                  Tesla account
                </h2>
                {statusLoading ? (
                  <p className="text-sm text-desat-7">Checking connection…</p>
                ) : statusError ? (
                  <p className="text-sm text-red-600">{statusError}</p>
                ) : linked ? (
                  <p className="text-sm text-success">
                    Connected
                    {status?.tokenExpired
                      ? " — session expired, reconnect to refresh"
                      : ""}
                  </p>
                ) : (
                  <p className="text-sm text-desat-7">
                    Not connected. Link your Tesla account to load your cars.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {statusError && (
                <button
                  type="button"
                  onClick={retryStatus}
                  className="rounded-xl border border-desat-3 px-4 py-2.5 text-sm font-medium text-accent-dark transition-colors hover:bg-desat-1"
                >
                  Retry
                </button>
              )}
              {!statusLoading && !statusError && !linked && (
                <button
                  type="button"
                  onClick={() => userId && startTeslaOAuth(userId)}
                  className="rounded-xl bg-accent-dark px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Connect Tesla
                </button>
              )}
              {linked && (
                <button
                  type="button"
                  onClick={() => void handleDisconnect()}
                  disabled={disconnecting}
                  className="rounded-xl border border-desat-3 px-4 py-2.5 text-sm font-medium text-accent-dark transition-colors hover:bg-desat-1 disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Vehicles ── */}
        {linked && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-accent-dark">
                  Your cars
                </h2>
                <p className="text-sm text-desat-7">
                  Select the cars you want in your Parle fleet.
                </p>
              </div>
              <button
                type="button"
                onClick={refreshVehicles}
                disabled={vehiclesLoading}
                className="rounded-xl border border-desat-3 px-4 py-2 text-sm font-medium text-accent-dark transition-colors hover:bg-desat-1 disabled:opacity-50"
              >
                {vehiclesLoading ? "Loading…" : "Refresh"}
              </button>
            </div>

            {vehiclesError && (
              <div className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                <span>{vehiclesError}</span>
                <button
                  type="button"
                  onClick={refreshVehicles}
                  className="ml-4 font-medium underline-offset-2 hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            {vehiclesLoading && vehicles === null && (
              <div className="rounded-2xl border border-desat-2 bg-white p-10 text-center text-sm text-desat-7">
                Loading your cars…
              </div>
            )}

            {!vehiclesLoading && vehicles !== null && vehicles.length === 0 && (
              <div className="rounded-2xl border border-dashed border-desat-3 bg-white p-10 text-center">
                <p className="font-medium text-accent-dark">No cars found</p>
                <p className="mt-1 text-sm text-desat-7">
                  Your Tesla account is connected but returned no vehicles.
                  Make sure your car appears in the Tesla app, then refresh.
                </p>
              </div>
            )}

            {vehicles !== null && vehicles.length > 0 && (
              <ul className="grid gap-4 sm:grid-cols-2">
                {vehicles.map((v) => {
                  const inFleet = fleet.has(v.id);
                  return (
                    <li
                      key={v.id}
                      className={`rounded-2xl border bg-white p-5 transition-colors ${
                        inFleet ? "border-accent-primary" : "border-desat-2"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative h-14 w-24 shrink-0">
                          <Image
                            src={v.image}
                            alt={v.name}
                            fill
                            sizes="96px"
                            className="object-contain"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-accent-dark">
                            {v.name}
                          </p>
                          {v.vin && (
                            <p className="truncate font-mono text-xs text-desat-7">
                              {v.vin}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs capitalize text-desat-7">
                            {v.state}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleFleet(v.id)}
                        className={`mt-4 w-full rounded-xl py-2.5 text-sm font-medium transition-colors ${
                          inFleet
                            ? "bg-desat-1 text-accent-dark hover:bg-desat-2"
                            : "bg-accent-dark text-white hover:opacity-90"
                        }`}
                      >
                        {inFleet ? "Remove from fleet" : "Add to fleet"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {vehicles !== null && fleet.size > 0 && (
              <p className="text-sm text-desat-7">
                {fleet.size} car{fleet.size === 1 ? "" : "s"} in your fleet.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
