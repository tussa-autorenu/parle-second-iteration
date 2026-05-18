"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "motion/react";
import {
  generateEarnings,
  summarize,
  type TimeRange,
  type VehicleFilter,
} from "@/data/earnings";
import { VEHICLES } from "@/data/vehicles";

type EarningsCardProps = {
  vehicleIds: string[];
};

const RANGE_OPTIONS: TimeRange[] = ["7d", "30d", "90d"];

/**
 * Earnings card — dashboard's primary trend visual.
 *
 * Spec:
 *  - 360 × 577, white bg, desat-3 border, 16px radius (matches sibling cards)
 *  - Header: "Earnings" label + big total + trend pill (↑/↓ % vs prior period)
 *  - Time-range segmented control (7d / 30d / 90d)
 *  - Vehicle filter chips (hidden when only 1 vehicle is connected)
 *  - Area chart: purple stroke with a vertical gradient fill, monotone curve
 *  - Stats row: Best day + Avg/day
 *
 * Data is mocked client-side via `generateEarnings`. The chart re-derives on
 * range/filter change, and recharts handles the entry animation natively.
 */
export function EarningsCard({ vehicleIds }: EarningsCardProps) {
  const [range, setRange] = useState<TimeRange>("7d");
  const [filter, setFilter] = useState<VehicleFilter>("all");

  // Re-key the AreaChart whenever range or filter changes so recharts plays
  // its built-in animation from scratch (otherwise it just morphs).
  const animationKey = `${range}-${filter}`;

  const { data, summary } = useMemo(() => {
    const current = generateEarnings(range, vehicleIds, filter, 0);
    const previous = generateEarnings(
      range,
      vehicleIds,
      filter,
      current.length, // shift back by the same window length
    );
    return { data: current, summary: summarize(current, previous) };
  }, [range, vehicleIds, filter]);

  const showVehicleChips = vehicleIds.length > 1;
  const visibleVehicles = VEHICLES.filter((v) => vehicleIds.includes(v.id));

  return (
    <div className="flex w-full flex-col gap-4 rounded-2xl border border-desat-3 bg-white p-4">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-desat-7">Earnings</p>
          <TrendPill value={summary.trendPct} range={range} />
        </div>
        <p className="text-4xl font-bold tracking-[-0.5px] text-accent-dark">
          ${summary.total.toLocaleString()}
        </p>
      </div>

      {/* Time range tabs */}
      <div className="inline-flex w-fit gap-1 rounded-lg bg-desat-1 p-1">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setRange(opt)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              range === opt
                ? "bg-white text-accent-dark shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                : "text-desat-7 hover:text-accent-dark"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Vehicle filter chips (only when >1 vehicle) */}
      {showVehicleChips && (
        <div className="flex flex-wrap gap-2">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </Chip>
          {visibleVehicles.map((v) => (
            <Chip
              key={v.id}
              active={filter === v.id}
              onClick={() => setFilter(v.id)}
            >
              {v.model.replace("Tesla ", "")}
            </Chip>
          ))}
        </div>
      )}

      {/* Chart — fixed height so the card can size to its content naturally */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            key={animationKey}
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#bd77ff" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#bd77ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="#ebe7ee"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#7a757f" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#7a757f" }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              cursor={{ stroke: "#bd77ff", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as { label: string; value: number };
                return (
                  <div className="rounded-lg border border-desat-3 bg-white px-3 py-2 shadow-md">
                    <p className="text-xs text-desat-7">{point.label}</p>
                    <p className="text-sm font-bold text-accent-dark">
                      ${point.value.toLocaleString()}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#911cff"
              strokeWidth={2}
              fill="url(#earningsGradient)"
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 border-t border-desat-3 pt-3">
        <Stat
          label="Best day"
          value={`${summary.bestDay.label} — $${summary.bestDay.value.toLocaleString()}`}
        />
        <div className="w-px self-stretch bg-desat-3" />
        <Stat label="Avg/day" value={`$${Math.round(summary.avgPerDay).toLocaleString()}`} />
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-accent-primary bg-accent-primary text-white"
          : "border-desat-3 bg-white text-desat-7 hover:border-desat-4"
      }`}
    >
      {children}
    </button>
  );
}

function TrendPill({ value, range }: { value: number; range: TimeRange }) {
  const isUp = value >= 0;
  const labelByRange: Record<TimeRange, string> = {
    "7d": "vs last 7d",
    "30d": "vs last 30d",
    "90d": "vs last 90d",
  };

  return (
    <motion.span
      key={`${range}-${isUp}-${Math.round(value)}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        isUp
          ? "bg-success/15 text-success"
          : "bg-[#dc2626]/15 text-[#dc2626]"
      }`}
      title={`${labelByRange[range]}`}
    >
      <span aria-hidden>{isUp ? "↑" : "↓"}</span>
      {Math.abs(value).toFixed(1)}%
    </motion.span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <p className="font-mono text-xs text-desat-7">{label}</p>
      <p className="text-sm font-bold text-accent-dark">{value}</p>
    </div>
  );
}
