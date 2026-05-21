"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Nav } from "@/components/Nav";
import { DashboardNav } from "@/components/DashboardNav";
import { OAuthScene } from "@/components/scenes/OAuthScene";
import { ConnectingScene } from "@/components/scenes/ConnectingScene";
import { VehicleSelectionScene } from "@/components/scenes/VehicleSelectionScene";
import { EnableAccessScene } from "@/components/scenes/EnableAccessScene";
import { FinalInstructionsScene } from "@/components/scenes/FinalInstructionsScene";
import { DashboardScene } from "@/components/scenes/DashboardScene";
import type { ApiVehicle } from "@/lib/api";

type Step =
  | "oauth"
  | "connecting"
  | "vehicles"
  | "enableAccess"
  | "finalInstructions"
  | "dashboard";

/**
 * Top-level orchestrator for the onboarding flow.
 *
 * Holds which step we're on and renders the matching Scene.
 * `AnimatePresence` keeps an exiting scene mounted long enough for its
 * exit animation to play, while the entering scene's enter animation runs
 * simultaneously — so transitions feel like elements switching out, not
 * a full page reload.
 */
export function OnboardingFlow() {
  const [step, setStep] = useState<Step>("oauth");
  // Vehicles the user picked on the selection screen — threaded through
  // to the enable-access screen so it shows only those vehicles without
  // re-fetching.
  const [selectedVehicles, setSelectedVehicles] = useState<ApiVehicle[]>([]);
  // Vehicle IDs the user successfully *connected* on the Enable Access
  // screen — these get passed to the activate endpoint on Final Instructions.
  const [connectedVehicleIds, setConnectedVehicleIds] = useState<string[]>([]);

  // The stepper in the nav is only meaningful during the onboarding steps.
  // Pre-flow (oauth/connecting) has no stepper; the dashboard uses a
  // different nav entirely.
  const navStep: 1 | 2 | 3 | undefined =
    step === "vehicles"
      ? 1
      : step === "enableAccess"
      ? 2
      : step === "finalInstructions"
      ? 3
      : undefined;

  const isDashboard = step === "dashboard";

  function resetFlow() {
    setStep("oauth");
  }

  return (
    <>
      {isDashboard ? (
        <DashboardNav onLogoClick={resetFlow} />
      ) : (
        <Nav currentStep={navStep} onLogoClick={resetFlow} />
      )}
      <main className="relative flex flex-1 overflow-hidden">
        <AnimatePresence>
          {step === "oauth" && (
            <OAuthScene
              key="oauth"
              onConnect={() => setStep("connecting")}
            />
          )}
          {step === "connecting" && (
            <ConnectingScene
              key="connecting"
              onComplete={() => setStep("vehicles")}
            />
          )}
          {step === "vehicles" && (
            <VehicleSelectionScene
              key="vehicles"
              onContinue={(vehicles) => {
                setSelectedVehicles(vehicles);
                setStep("enableAccess");
              }}
            />
          )}
          {step === "enableAccess" && (
            <EnableAccessScene
              key="enableAccess"
              vehicles={selectedVehicles}
              onBack={() => setStep("vehicles")}
              onContinue={(ids) => {
                setConnectedVehicleIds(ids);
                setStep("finalInstructions");
              }}
            />
          )}
          {step === "finalInstructions" && (
            <FinalInstructionsScene
              key="finalInstructions"
              vehicleIds={connectedVehicleIds}
              onBack={() => setStep("enableAccess")}
              onActivate={() => setStep("dashboard")}
            />
          )}
          {step === "dashboard" && <DashboardScene key="dashboard" />}
        </AnimatePresence>
      </main>
    </>
  );
}
