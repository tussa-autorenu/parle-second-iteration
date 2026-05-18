"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { VehicleCard } from "@/components/VehicleCard";
import { fadeOnly, sceneStagger, slideUp } from "@/components/animations";
import { VEHICLES } from "@/data/vehicles";

type VehicleSelectionSceneProps = {
  /** Optional — called when the user clicks the Continue CTA. */
  onContinue?: (selectedIds: string[]) => void;
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
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
  const ctaDisabled = count === 0;

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
          We found 3 vehicles in your Tesla account. Select the ones
          you&apos;d like to add to your Parle fleet.
        </p>
      </motion.div>

      {/* Cards — slide up */}
      <motion.div variants={slideUp} className="mt-12 flex gap-8">
        {VEHICLES.map((v) => (
          <VehicleCard
            key={v.id}
            year={v.year}
            model={v.model}
            vin={v.vin}
            imageSrc={v.image}
            imageScale={v.imageScale}
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
          onClick={() => onContinue?.(Array.from(selected))}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-accent-dark px-6 text-base font-medium text-white transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(29,6,51,0.18)] active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          Continue with {count} vehicles
        </button>
        <p className="text-center text-base leading-[22px] text-accent-dark">
          {count} of 3 vehicles selected
        </p>
      </motion.div>
    </motion.div>
  );
}
