"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { VehicleCard } from "@/components/VehicleCard";
import { fadeOnly, sceneStagger, slideUp } from "@/components/animations";
import { getOnboardingVehicles, type ApiVehicle } from "@/lib/api";

type VehicleSelectionSceneProps = {
  /**
   * Optional — called when the user clicks the Continue CTA. Receives the
   * full vehicle objects (not just ids) so downstream scenes can render
   * without re-fetching.
   */
  onContinue?: (selected: ApiVehicle[]) => void;
};

/**
 * Step 2 — Vehicle selection.
 *
 * Heading + copy fade in place; cards and CTA slide up from below.
 * `sceneStagger` on the wrapper means heading lands first, cards next, CTA last.
 */
export function VehicleSelectionScene({
  onContinue,
}: VehicleSelectionSceneProps = {}) {
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getOnboardingVehicles()
      .then((list) => {
        if (cancelled) return;
        setVehicles(list);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "We couldn’t load your vehicles. Please try again.",
        );
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const count = selected.size;
  const total = vehicles.length;
  const ctaDisabled = count === 0 || status !== "ready";

  function handleContinue() {
    if (!onContinue) return;
    const selectedVehicles = vehicles.filter((v) => selected.has(v.id));
    onContinue(selectedVehicles);
  }

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center px-8 pt-8 pb-16"
      variants={sceneStagger}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Heading + copy — fade only, locked in place */}
      <motion.div
        variants={fadeOnly}
        className="flex w-[432px] flex-col gap-3 text-center"
      >
        <h1 className="text-[28px] font-bold leading-tight tracking-[-1px] text-accent-dark">
          Select your vehicles
        </h1>
        <p className="text-base leading-[22px] text-desat-7">
          {status === "ready"
            ? `We found ${total} ${
                total === 1 ? "vehicle" : "vehicles"
              } in your Tesla account. Select the ones you'd like to add to your Parle fleet.`
            : status === "loading"
            ? "Loading vehicles from your Tesla account…"
            : "We couldn’t load your vehicles. Please try again."}
        </p>
      </motion.div>

      {/* Cards — slide up */}
      <motion.div variants={slideUp} className="mt-12 flex gap-8">
        {vehicles.map((v) => (
          <VehicleCard
            key={v.id}
            year={v.year}
            model={v.model}
            vin={v.vin}
            imageSrc={v.image}
            selected={selected.has(v.id)}
            onToggle={() => toggle(v.id)}
          />
        ))}
      </motion.div>

      {/* CTA + status — slide up */}
      <motion.div
        variants={slideUp}
        className="mt-16 flex w-[280px] flex-col items-center gap-4"
      >
        <button
          type="button"
          disabled={ctaDisabled}
          onClick={handleContinue}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-accent-dark px-6 text-base font-medium text-white transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(29,6,51,0.18)] active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          Continue with {count} vehicles
        </button>
        <p className="text-center text-base leading-[22px] text-accent-dark">
          {status === "ready"
            ? `${count} of ${total} vehicles selected`
            : status === "loading"
            ? "Loading vehicles…"
            : errorMessage ?? "Something went wrong."}
        </p>
      </motion.div>
    </motion.div>
  );
}
