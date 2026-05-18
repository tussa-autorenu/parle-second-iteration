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
  // Vehicle IDs the user picked on the selection screen — threaded through
  // to the enable-access screen so it shows only those vehicles.
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  // Vehicle IDs the user successfully *connected* on the Enable Access
  // screen — these become the user's fleet on the dashboard.
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
              onContinue={(ids) => {
                setSelectedVehicleIds(ids);
                setStep("enableAccess");
              }}
            />
          )}
          {step === "enableAccess" && (
            <EnableAccessScene
              key="enableAccess"
              vehicleIds={selectedVehicleIds}
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
              onBack={() => setStep("enableAccess")}
              onActivate={() => setStep("dashboard")}
            />
          )}
          {step === "dashboard" && (
            <DashboardScene
              key="dashboard"
              vehicleIds={connectedVehicleIds}
            />
          )}
        </AnimatePresence>
      </main>
    </>
  );
}
