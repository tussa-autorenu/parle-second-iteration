"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Toggle } from "@/components/Toggle";

export type VehicleStatus = "offline" | "online";

type VehicleStatusCardProps = {
  year: string;
  model: string;
  vin: string;
  imageSrc: string;
  trips: number;
  earnings: number;
  status: VehicleStatus;
  onToggle?: () => void;
};

/** Soft 5-layer purple drop shadow that lights up the online card. */
const ONLINE_SHADOW =
  "0 73px 118px rgba(211,164,255,0.11), 0 27px 43px rgba(211,164,255,0.08), 0 13px 21px rgba(211,164,255,0.06), 0 6px 10px rgba(211,164,255,0.05), 0 3px 4px rgba(211,164,255,0.03)";

/**
 * One vehicle's "fleet card" on the owner dashboard.
 *
 * Spec (Figma nodes 267:177 offline / 276:407 online):
 *  - 360 wide, p-4 outer, gap-12 stack
 *  - Border + shadow shift on toggle: gray/none → accent-light/purple-glow
 *  - Status indicator absolute in upper-left (gray dot/OFFLINE → pulsing purple/Online)
 *  - Image area (160 tall, bg-desat-1) shows the vehicle thumbnail at 210px,
 *    cropped to the 160 container vertically
 *  - Trips + Earnings columns (Space Mono labels, accent-primary numbers)
 *  - Bottom bar swaps content + style based on status, fading between the two
 */
export function VehicleStatusCard({
  year,
  model,
  vin,
  imageSrc,
  trips,
  earnings,
  status,
  onToggle,
}: VehicleStatusCardProps) {
  const isOnline = status === "online";

  return (
    <div
      className={`relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border bg-white p-4 transition-colors duration-300 ${
        isOnline ? "border-accent-light" : "border-desat-3"
      }`}
      style={{ boxShadow: isOnline ? ONLINE_SHADOW : undefined }}
    >
      {/* Status indicator — absolute upper-left, sits on top of the image area */}
      <div className="pointer-events-none absolute top-[23px] left-[23px] z-10 flex items-center gap-1">
        <StatusDot online={isOnline} />
        <span
          className={`text-xs font-medium uppercase leading-3 tracking-[0.96px] ${
            isOnline ? "text-accent-primary" : "text-desat-7"
          }`}
        >
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>

      {/* Image area */}
      <div className="flex h-[160px] w-full items-center justify-center overflow-hidden rounded-xl bg-desat-1">
        <div className="relative size-[210px] shrink-0 mix-blend-multiply">
          <Image src={imageSrc} alt="" fill sizes="210px" className="object-cover" />
        </div>
      </div>

      {/* Title block */}
      <div className="flex flex-col gap-2 px-2">
        <p className="text-xl font-bold leading-tight tracking-[-0.5px] text-accent-dark">
          {year} {model}
        </p>
        <p className="font-mono text-sm leading-[14px] text-desat-7">{vin}</p>
      </div>

      {/* Stats row */}
      <div className="flex w-full gap-3">
        <div className="flex w-[84px] flex-col gap-2 border-r border-desat-3 p-2">
          <p className="font-mono text-sm leading-[14px] text-accent-dark">
            Trips
          </p>
          <p className="text-4xl font-normal leading-tight tracking-[-0.5px] text-accent-primary">
            {trips}
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-2">
          <p className="font-mono text-sm leading-[14px] text-accent-dark">
            Earnings
          </p>
          <p className="text-4xl font-normal leading-tight tracking-[-0.5px] text-accent-primary">
            ${earnings.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Bottom bar — fades between offline/online variants */}
      <div className="relative h-12 w-full">
        <AnimatePresence mode="wait" initial={false}>
          {isOnline ? (
            <motion.div
              key="online-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex items-center justify-between rounded-xl bg-accent-light/20 px-3"
            >
              <span className="text-sm font-medium text-accent-primary">
                Vehicle is Online
              </span>
              <Toggle
                on
                onChange={onToggle}
                ariaLabel={`Toggle ${year} ${model} online`}
              />
            </motion.div>
          ) : (
            <motion.div
              key="offline-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex items-center justify-between border-t border-desat-3 pl-2 pt-2"
            >
              <span className="text-sm font-medium text-accent-dark">
                Set vehicle to Online to start earning
              </span>
              <Toggle
                on={false}
                onChange={onToggle}
                ariaLabel={`Toggle ${year} ${model} online`}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusDot({ online }: { online: boolean }) {
  if (!online) {
    return <span className="size-3 shrink-0 rounded-full bg-desat-7" />;
  }
  return (
    <span className="relative inline-flex size-3 shrink-0">
      <motion.span
        className="absolute inset-0 rounded-full bg-accent-primary"
        animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />
      <span className="relative size-3 rounded-full bg-accent-primary" />
    </span>
  );
}
