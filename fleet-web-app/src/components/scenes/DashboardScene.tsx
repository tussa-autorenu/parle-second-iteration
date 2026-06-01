"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { fadeOnly, sceneStagger, slideUp } from "@/components/animations";
import {
  VehicleStatusCard,
  type VehicleStatus,
} from "@/components/VehicleStatusCard";
import { EarningsCard } from "@/components/EarningsCard";
import { getActiveFleetVehicles, type ApiVehicle } from "@/lib/api";

/**
 * Step 5 — Owner Dashboard.
 *
 * Heading + copy fade in place; the row of vehicle cards slides up from
 * below. Each card defaults to OFFLINE; the toggle on a card flips it
 * to ONLINE (and back).
 *
 * Vehicles are fetched from the backend's active-fleet endpoint so the
 * dashboard reflects whatever the user just activated.
 */
export function DashboardScene() {
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, VehicleStatus>>({});

  useEffect(() => {
    let cancelled = false;
    getActiveFleetVehicles()
      .then((list) => {
        if (cancelled) return;
        setVehicles(list);
        setStatuses(Object.fromEntries(list.map((v) => [v.id, "offline"])));
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "We couldn’t load your fleet. Please try again.",
        );
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const vehicleIds = useMemo(() => vehicles.map((v) => v.id), [vehicles]);

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
          {status === "ready"
            ? "Manage vehicles online status, and track earnings."
            : status === "loading"
            ? "Loading your fleet…"
            : errorMessage ?? "We couldn’t load your fleet."}
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
          {vehicles.map((v) => (
            <VehicleStatusCard
              key={v.id}
              year={v.year}
              model={v.model}
              vin={v.vin}
              imageSrc={v.image}
              trips={v.trips ?? 0}
              earnings={v.earnings ?? 0}
              status={statuses[v.id] ?? "offline"}
              onToggle={() => toggle(v.id)}
            />
          ))}
        </div>

        {/* Earnings chart — width depends on how many vehicles we have */}
        <div className={chartAreaClass}>
          <EarningsCard vehicleIds={vehicleIds} />
        </div>
      </motion.div>
    </motion.div>
  );
}
