"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { VehicleRow, type VehicleRowState } from "@/components/VehicleRow";
import { fadeOnly, sceneStagger, slideUp } from "@/components/animations";
import { VEHICLES } from "@/data/vehicles";

type EnableAccessSceneProps = {
  /** IDs of vehicles selected on the previous screen. */
  vehicleIds: string[];
  onBack?: () => void;
  onContinue?: (connectedIds: string[]) => void;
};

/** Soft 6-layer purple drop shadow on the content card (Figma node 178:76). */
const CARD_SHADOW =
  "0 100px 217px rgba(211,164,255,0.08), 0 42px 91px rgba(211,164,255,0.06), 0 22px 48px rgba(211,164,255,0.05), 0 13px 27px rgba(211,164,255,0.04), 0 7px 14px rgba(211,164,255,0.03), 0 3px 6px rgba(211,164,255,0.02)";

// Cascade timing: click → selected immediately → loading after this many ms
// → connected after the loading duration completes.
const SELECTED_TO_LOADING_MS = 600;
const LOADING_DURATION_MS = 2000;

/**
 * Step 3 — Enable Third-Party Access.
 *
 * Each row is its own little state machine. Clicking a default row triggers
 * the cascade: selected (purple highlight) → loading (spinner) → connected
 * (green text). Once connected, the row is locked.
 *
 * The CTA enables the moment any one row hits `connected`.
 */
export function EnableAccessScene({
  vehicleIds,
  onBack,
  onContinue,
}: EnableAccessSceneProps) {
  // Per-row state, keyed by vehicle id
  const [rowStates, setRowStates] = useState<Record<string, VehicleRowState>>(
    () => Object.fromEntries(vehicleIds.map((id) => [id, "default"])),
  );

  const vehicles = VEHICLES.filter((v) => vehicleIds.includes(v.id));

  function trigger(id: string) {
    // Guard: only act on rows that haven't started yet.
    if (rowStates[id] !== "default") return;

    setRowStates((prev) => ({ ...prev, [id]: "selected" }));

    window.setTimeout(() => {
      setRowStates((prev) => ({ ...prev, [id]: "loading" }));
    }, SELECTED_TO_LOADING_MS);

    window.setTimeout(() => {
      setRowStates((prev) => ({ ...prev, [id]: "connected" }));
    }, SELECTED_TO_LOADING_MS + LOADING_DURATION_MS);
  }

  const connectedIds = Object.entries(rowStates)
    .filter(([, s]) => s === "connected")
    .map(([id]) => id);
  const ctaDisabled = connectedIds.length === 0;

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center px-8 pt-8 pb-16"
      variants={sceneStagger}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Heading + copy — fade only */}
      <motion.div
        variants={fadeOnly}
        className="flex w-[432px] flex-col gap-3 text-center"
      >
        <h1 className="text-[28px] font-bold leading-tight tracking-[-1px] text-accent-dark">
          Enable Third-Party Access
        </h1>
        <p className="text-base leading-[22px] text-desat-7">
          Go to your vehicle and enable Parle within
          <br />
          {`Settings > Third-Party Access`}
        </p>
      </motion.div>

      {/* Content card — slide up */}
      <motion.div
        variants={slideUp}
        className="mt-12 flex w-[520px] flex-col gap-6 rounded-[20px] border border-desat-3 bg-white px-8 pt-8 pb-6"
        style={{ boxShadow: CARD_SHADOW }}
      >
        <h2 className="text-center text-base font-bold tracking-[-0.5px] text-accent-dark">
          Select vehicles that you have enabled
        </h2>

        <div className="flex flex-col gap-4">
          {vehicles.map((v) => (
            <VehicleRow
              key={v.id}
              year={v.year}
              model={v.model}
              vin={v.vin}
              imageSrc={v.image}
              imageScale={v.imageScale}
              state={rowStates[v.id] ?? "default"}
              onTrigger={() => trigger(v.id)}
            />
          ))}
        </div>

        <p className="text-base leading-[22px] text-desat-7">
          You can revoke these permissions at any time from your Tesla account
          or the Parle dashboard.
        </p>

        <button
          type="button"
          disabled={ctaDisabled}
          onClick={() => onContinue?.(connectedIds)}
          className="flex h-14 w-full items-center justify-center rounded-[14px] bg-accent-dark text-base font-bold text-white shadow-[0_4px_12px_rgba(29,6,51,0.25)] transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(29,6,51,0.3)] active:translate-y-0 active:shadow-[0_4px_12px_rgba(29,6,51,0.25)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_12px_rgba(29,6,51,0.25)]"
        >
          Continue
        </button>

        <button
          type="button"
          onClick={onBack}
          className="flex h-10 cursor-pointer items-center justify-center text-base text-accent-dark transition-opacity duration-150 hover:opacity-70"
        >
          ← Back to vehicle selection
        </button>
      </motion.div>
    </motion.div>
  );
}
