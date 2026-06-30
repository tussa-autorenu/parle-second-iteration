"use client";

/**
 * Signed-in fleet dashboard (old Parlé flow):
 *   1. Connect Tesla (if not linked).
 *   2. Select which Teslas belong to your fleet (persisted per user).
 *   3. Selected vehicles render as cards — each with live status, commands,
 *      share-access controls and scheduled-access drafts directly underneath.
 *
 * Guests (no Tesla needed) redeem a ride-share code from the header area and
 * their shared vehicles appear in a dedicated section, clearly labeled.
 */

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  ApiError,
  disconnectTesla,
  getTeslaStatus,
  getTemporaryAccess,
  getVehicles,
  startTeslaOAuth,
  type ShareAccess,
  type TeslaStatus,
  type Vehicle,
} from "@/lib/api";
import { VehicleControlCard } from "./VehicleControlCard";
import { RedeemCodeForm } from "./RedeemCodeForm";
import { syncSelectedFleetVehiclesToSupabase } from "@/lib/fleetAvailability";

type Banner = { kind: "success" | "error"; text: string } | null;

const SHARED_VEHICLE_IMAGE = "/assets/vehicle_white_thumbnail@2x.png";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** Surface ApiError / Supabase error messages without leaking internals. */
function readErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
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
    // Storage unavailable — selection just won't persist.
  }
}

export function Dashboard() {
  const { user, userId, signOut } = useAuth();

  const [banner, setBanner] = useState<Banner>(null);

  const [status, setStatus] = useState<TeslaStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusVersion, setStatusVersion] = useState(0);

  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehiclesVersion, setVehiclesVersion] = useState(0);

  const [fleet, setFleet] = useState<Set<string>>(new Set());
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingFleet, setSavingFleet] = useState(false);

  const [access, setAccess] = useState<ShareAccess | null>(null);
  const [accessVersion, setAccessVersion] = useState(0);

  const linked = status?.linked === true;

  const refreshAccess = useCallback(() => setAccessVersion((v) => v + 1), []);

  // ── OAuth return banner (?linked=1 / ?linked=0&error=…) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedParam = params.get("linked");
    if (linkedParam === null) return;
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

  // ── Temporary share access (both roles) ──
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getTemporaryAccess(userId)
      .then((a) => {
        if (!cancelled) setAccess(a);
      })
      .catch(() => {
        // No access / endpoint unavailable — treat as empty rather than erroring.
        if (!cancelled) setAccess({ asGuest: [], asOwner: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, accessVersion]);

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

  // Publish the current selection to Supabase so the renter app can see the
  // available cars. Selected → is_available true, unselected → false.
  async function saveFleet() {
    if (!userId || !vehicles || savingFleet) return;
    setSavingFleet(true);
    try {
      await syncSelectedFleetVehiclesToSupabase({
        ownerUserId: userId,
        allVehicles: vehicles,
        selectedVehicleIds: [...fleet],
      });
      setBanner({
        kind: "success",
        text: fleet.size
          ? `Fleet saved. ${fleet.size} car${fleet.size === 1 ? "" : "s"} now visible to renters.`
          : "Fleet saved. No cars are listed for renters right now.",
      });
    } catch (err) {
      setBanner({
        kind: "error",
        text: readErrorMessage(err, "Could not save your fleet. Please try again."),
      });
    } finally {
      setSavingFleet(false);
    }
  }

  async function handleDisconnect() {
    if (!userId || disconnecting) return;
    if (!window.confirm("Disconnect your Tesla account from Parle?")) return;
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

  if (!userId) return null;

  const selectedVehicles = vehicles?.filter((v) => fleet.has(v.id)) ?? [];
  const guestAccess = access?.asGuest ?? [];
  const ownerGrants = access?.asOwner ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-desat-0">
      {/* ── Top bar ── */}
      <header className="border-b border-desat-2 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
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

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
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

        {/* ── Guest redemption (near header) ── */}
        <section className="flex flex-col gap-3 rounded-2xl border border-desat-2 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-accent-dark">
              Have a ride-share code?
            </h2>
            <p className="text-sm text-desat-7">
              Redeem a code to control a Tesla someone shared with you. No Tesla
              account needed.
            </p>
          </div>
          <RedeemCodeForm
            userId={userId}
            compact
            onRedeemed={() => {
              setBanner({ kind: "success", text: "Ride-share access added." });
              refreshAccess();
            }}
          />
        </section>

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
                  onClick={() => startTeslaOAuth(userId)}
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

        {/* ── Fleet selection ── */}
        {linked && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-accent-dark">
                  Select your fleet
                </h2>
                <p className="text-sm text-desat-7">
                  Choose which cars to manage. Selected cars appear below.
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
                  Your Tesla account is connected but returned no vehicles. Make
                  sure your car appears in the Tesla app, then refresh.
                </p>
              </div>
            )}

            {vehicles !== null && vehicles.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vehicles.map((v) => {
                  const inFleet = fleet.has(v.id);
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => toggleFleet(v.id)}
                        aria-pressed={inFleet}
                        className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left transition-colors ${
                          inFleet
                            ? "border-accent-primary ring-1 ring-accent-primary"
                            : "border-desat-2 hover:border-desat-3"
                        }`}
                      >
                        <div className="relative h-10 w-16 shrink-0">
                          <Image
                            src={v.image}
                            alt={v.name}
                            fill
                            sizes="64px"
                            className="object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-accent-dark">
                            {v.name}
                          </p>
                          <p className="truncate text-xs text-desat-7">
                            {v.vin || v.state}
                          </p>
                        </div>
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                            inFleet
                              ? "border-accent-primary bg-accent-primary text-white"
                              : "border-desat-3 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {vehicles !== null && vehicles.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-desat-2 bg-white p-4">
                <p className="text-sm text-desat-7">
                  {fleet.size === 0
                    ? "No cars selected — saving will hide your cars from renters."
                    : `${fleet.size} car${fleet.size === 1 ? "" : "s"} selected. Save to make them visible to renters.`}
                </p>
                <button
                  type="button"
                  onClick={() => void saveFleet()}
                  disabled={savingFleet}
                  className="rounded-xl bg-accent-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingFleet ? "Saving…" : "Save fleet"}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Your fleet (selected owned vehicles) ── */}
        {linked && selectedVehicles.length > 0 && (
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold text-accent-dark">Your fleet</h2>
              <p className="text-sm text-desat-7">
                {selectedVehicles.length} car
                {selectedVehicles.length === 1 ? "" : "s"} selected.
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {selectedVehicles.map((v) => (
                <VehicleControlCard
                  key={v.id}
                  userId={userId}
                  vehicle={v}
                  guestAccesses={ownerGrants.filter((a) => a.vehicleId === v.id)}
                  onAccessChanged={refreshAccess}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Prompt to select when linked but none chosen ── */}
        {linked &&
          vehicles !== null &&
          vehicles.length > 0 &&
          selectedVehicles.length === 0 && (
            <p className="text-center text-sm text-desat-7">
              Select one or more cars above to start managing them.
            </p>
          )}

        {/* ── Shared with you (guest access) ── */}
        {guestAccess.length > 0 && (
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold text-accent-dark">
                Shared with you
              </h2>
              <p className="text-sm text-desat-7">
                Temporary access to {guestAccess.length} vehicle
                {guestAccess.length === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {guestAccess.map((a) => {
                const vehicle: Vehicle = {
                  id: a.vehicleId,
                  name: a.friendlyName ?? "Shared Tesla",
                  image: SHARED_VEHICLE_IMAGE,
                  vin: a.vin ?? "",
                  state: "",
                };
                return (
                  <VehicleControlCard
                    key={a.id}
                    userId={userId}
                    vehicle={vehicle}
                    shared
                    permissions={a.permissions}
                    expiresAt={a.expiresAt}
                  />
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
