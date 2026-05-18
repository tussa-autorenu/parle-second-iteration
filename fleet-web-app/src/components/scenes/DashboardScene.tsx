"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { fadeOnly, sceneStagger, slideUp } from "@/components/animations";
import {
  VehicleStatusCard,
  type VehicleStatus,
} from "@/components/VehicleStatusCard";
import { EarningsCard } from "@/components/EarningsCard";
import { VEHICLES } from "@/data/vehicles";

type DashboardSceneProps = {
  /** Vehicles the user successfully connected on the Enable Access screen. */
  vehicleIds: string[];
};

/**
 * Hardcoded demo trip / earnings stats per vehicle id. In a real app these
 * would come from the backend. The numbers come from the Figma frame.
 */
const STATS: Record<string, { trips: number; earnings: number }> = {
  "1": { trips: 8, earnings: 1120 },
  "2": { trips: 12, earnings: 1840 },
  "3": { trips: 5, earnings: 2400 },
};

/**
 * Step 5 — Owner Dashboard.
 *
 * Heading + copy fade in place; the row of vehicle cards slides up from
 * below. Each card defaults to OFFLINE; the toggle on a card flips it
 * to ONLINE (and back).
 */
export function DashboardScene({ vehicleIds }: DashboardSceneProps) {
  const [statuses, setStatuses] = useState<Record<string, VehicleStatus>>(
    () => Object.fromEntries(vehicleIds.map((id) => [id, "offline"])),
  );

  const vehicles = VEHICLES.filter((v) => vehicleIds.includes(v.id));

  // With a single vehicle, swap the proportions: vehicle takes 1/3, chart 2/3.
  // The chart becomes the visual centerpiece since there's only one car to show.
  // Sizing math (1200 container, 44px gap between vehicles area and chart):
  //   single: 392 vehicles + 44 gap + 764 chart = 1200
  //   multi:  764 vehicles + 44 gap + 392 chart = 1200
  const singleVehicle = vehicles.length === 1;
  const vehiclesAreaClass = singleVehicle
    ? "grid w-[392px] grid-cols-1 gap-11"
    : "grid w-[764px] grid-cols-2 gap-11";
  const chartAreaClass = singleVehicle ? "w-[764px]" : "w-[392px]";

  function toggle(id: string) {
    setStatuses((prev) => ({
      ...prev,
      [id]: prev[id] === "online" ? "offline" : "online",
    }));
  }

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center overflow-y-auto px-8 pt-8 pb-16"
      variants={sceneStagger}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Heading + copy — fade only, left-aligned */}
      <motion.div
        variants={fadeOnly}
        className="flex w-[1200px] flex-col gap-3"
      >
        <h1 className="text-[28px] font-bold leading-tight tracking-[-1px] text-accent-dark">
          My Fleet
        </h1>
        <p className="text-base leading-[22px] text-desat-7">
          Manage vehicles online status, and track earnings.
        </p>
      </motion.div>

      {/*
       * Cards section — slide up.
       *
       * Outer flex row, top-aligned:
       *   - Multiple vehicles: vehicles area is 2/3, 2-col grid; chart is 1/3.
       *   - Single vehicle:    vehicles area is 1/3, 1-col;       chart is 2/3.
       * The chart always gets the leftover width via flex-1, so the proportions
       * swap automatically based on vehicle count.
       */}
      <motion.div
        variants={slideUp}
        className="mt-12 flex w-[1200px] items-start gap-11"
      >
        {/* Vehicles — width and column count depend on how many vehicles we have */}
        <div className={vehiclesAreaClass}>
          {vehicles.map((v) => {
            const stats = STATS[v.id] ?? { trips: 0, earnings: 0 };
            return (
              <VehicleStatusCard
                key={v.id}
                year={v.year}
                model={v.model}
                vin={v.vin}
                imageSrc={v.image}
                trips={stats.trips}
                earnings={stats.earnings}
                status={statuses[v.id] ?? "offline"}
                onToggle={() => toggle(v.id)}
              />
            );
          })}
        </div>

        {/* Earnings chart — width depends on how many vehicles we have */}
        <div className={chartAreaClass}>
          <EarningsCard vehicleIds={vehicleIds} />
        </div>
      </motion.div>
    </motion.div>
  );
}
