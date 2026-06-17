"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Nav } from "@/components/Nav";
import { DashboardNav } from "@/components/DashboardNav";
import { LoadingScene } from "@/components/scenes/LoadingScene";
import { LoginScene } from "@/components/scenes/LoginScene";
import { OAuthScene } from "@/components/scenes/OAuthScene";
import { VehicleSelectionScene } from "@/components/scenes/VehicleSelectionScene";
import { EnableAccessScene } from "@/components/scenes/EnableAccessScene";
import { FinalInstructionsScene } from "@/components/scenes/FinalInstructionsScene";
import { DashboardScene } from "@/components/scenes/DashboardScene";
import { useAuth } from "@/lib/auth";
import { api, getReadableErrorMessage, type ApiVehicle } from "@/lib/api";

/** Steps within the authenticated portion of the flow. */
type Step =
  | "init"
  | "connect"
  | "vehicles"
  | "enableAccess"
  | "finalInstructions"
  | "dashboard";

/**
 * Top-level orchestrator for the end-to-end flow.
 *
 * Drives a small step machine gated on Supabase auth and the backend's Tesla
 * link status:
 *
 *   1. not signed in            → login
 *   2. signed in, Tesla unlinked → connect (redirect to backend OAuth)
 *   3. returns ?linked=1 / linked → vehicles → enable access → guidelines
 *   4. activate                  → dashboard
 *
 * The Supabase `userId` is threaded into every backend call so vehicles,
 * status, and commands resolve to the right user.
 */
export function OnboardingFlow() {
  const { userId, isLoading, signOut } = useAuth();

  const [step, setStep] = useState<Step>("init");
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [selectedVehicles, setSelectedVehicles] = useState<ApiVehicle[]>([]);
  const [activatedVehicles, setActivatedVehicles] = useState<ApiVehicle[]>([]);

  // Tracks which user we've already done first-load routing for, so advancing
  // through the flow doesn't get yanked back to the start by the auth effect.
  const routedForUser = useRef<string | null>(null);

  /** Read (and clear) the `?linked` query the backend appends after OAuth. */
  function readOAuthReturn(): { linked: string | null; error: string | null } {
    if (typeof window === "undefined") return { linked: null, error: null };
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("linked");
    if (linked == null) return { linked: null, error: null };
    const error = params.get("error");
    // Strip the params so a refresh doesn't re-trigger the return handling.
    const url = new URL(window.location.href);
    url.searchParams.delete("linked");
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.toString());
    return { linked, error };
  }

  /**
   * Decide the first authenticated step. Always async so every resulting
   * setState lands after an await (no synchronous state updates in effects).
   */
  const decideStep = useCallback(
    async (uid: string): Promise<{ step: Step; error: string | null }> => {
      const { linked, error } = readOAuthReturn();
      if (linked === "1") return { step: "vehicles", error: null };
      if (linked === "0") {
        return {
          step: "connect",
          error: error ?? "Tesla connection was cancelled or failed.",
        };
      }
      // Owners go to vehicle selection; guests with active shared access go
      // straight to the dashboard; everyone else is asked to connect Tesla
      // (where they can also redeem a ride-share code).
      let teslaLinked = false;
      let statusError: string | null = null;
      try {
        const status = await api.getTeslaStatus(uid);
        teslaLinked = status.linked;
      } catch (err) {
        statusError = getReadableErrorMessage(err);
      }

      if (teslaLinked) return { step: "vehicles", error: null };

      let hasGuestAccess = false;
      try {
        const share = await api.getTemporaryAccess(uid);
        hasGuestAccess = share.asGuest.length > 0;
      } catch {
        // Sharing lookup is best-effort; fall through to connect.
      }
      if (hasGuestAccess) return { step: "dashboard", error: null };

      return { step: "connect", error: statusError };
    },
    [],
  );

  const routeForUser = useCallback(
    async (uid: string, isCancelled: () => boolean = () => false) => {
      const result = await decideStep(uid);
      if (isCancelled()) return;
      setOauthError(result.error);
      setStep(result.step);
    },
    [decideStep],
  );

  useEffect(() => {
    if (isLoading) return;
    if (!userId) {
      routedForUser.current = null;
      return;
    }
    if (routedForUser.current === userId) return;
    routedForUser.current = userId;
    let cancelled = false;
    void routeForUser(userId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [isLoading, userId, routeForUser]);

  const goHome = useCallback(() => {
    setOauthError(null);
    setStep("init");
    if (userId) void routeForUser(userId);
  }, [userId, routeForUser]);

  async function handleSignOut() {
    await signOut();
    routedForUser.current = null;
    setSelectedVehicles([]);
    setActivatedVehicles([]);
    setStep("init");
  }

  // Login + loading are derived from auth state at render time so we never
  // synchronously set step from the auth effect.
  const showLogin = !isLoading && !userId;
  const isDashboard = Boolean(userId) && step === "dashboard";

  const navStep: 1 | 2 | 3 | undefined =
    userId && step === "vehicles"
      ? 1
      : userId && step === "enableAccess"
      ? 2
      : userId && step === "finalInstructions"
      ? 3
      : undefined;

  return (
    <>
      {isDashboard ? (
        <DashboardNav onLogoClick={goHome} onSignOut={handleSignOut} />
      ) : (
        <Nav currentStep={navStep} onLogoClick={goHome} />
      )}
      <main className="relative flex flex-1 overflow-hidden">
        <AnimatePresence>
          {isLoading && <LoadingScene key="init" />}

          {showLogin && <LoginScene key="login" />}

          {!isLoading && userId && step === "init" && (
            <LoadingScene key="routing" message="Checking your Tesla connection…" />
          )}

          {!isLoading && userId && step === "connect" && (
            <OAuthScene
              key="connect"
              userId={userId}
              errorMessage={oauthError}
              onSignOut={handleSignOut}
              onRedeemed={() => setStep("dashboard")}
            />
          )}

          {!isLoading && userId && step === "vehicles" && (
            <VehicleSelectionScene
              key="vehicles"
              userId={userId}
              onConnectTesla={() => setStep("connect")}
              onContinue={(vehicles) => {
                setSelectedVehicles(vehicles);
                setStep("enableAccess");
              }}
            />
          )}

          {!isLoading && userId && step === "enableAccess" && (
            <EnableAccessScene
              key="enableAccess"
              vehicles={selectedVehicles}
              onBack={() => setStep("vehicles")}
              onContinue={(connectedIds) => {
                setActivatedVehicles(
                  selectedVehicles.filter((v) => connectedIds.includes(v.id)),
                );
                setStep("finalInstructions");
              }}
            />
          )}

          {!isLoading && userId && step === "finalInstructions" && (
            <FinalInstructionsScene
              key="finalInstructions"
              vehicleCount={activatedVehicles.length}
              onBack={() => setStep("enableAccess")}
              onActivate={() => setStep("dashboard")}
            />
          )}

          {!isLoading && userId && step === "dashboard" && (
            <DashboardScene key="dashboard" userId={userId} />
          )}
        </AnimatePresence>
      </main>
    </>
  );
}
