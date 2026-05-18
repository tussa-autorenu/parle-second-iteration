"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";

/**
 * The four states a vehicle row can be in on the Enable Access screen.
 *
 *  - `default`   : nothing selected. Gray bg, no visible border, empty checkbox.
 *  - `selected`  : user just clicked the row. Light bg, purple border + filled
 *                  purple checkbox. Brief — auto-advances to `loading`.
 *  - `loading`   : mock "asking the car" round-trip. Light bg, purple border,
 *                  spinning ring icon in place of the checkbox.
 *  - `connected` : car confirmed access. Light bg, green border, "Connected"
 *                  text label. Terminal — clicking does nothing.
 */
export type VehicleRowState =
  | "default"
  | "selected"
  | "loading"
  | "connected";

type VehicleRowProps = {
  year: string;
  model: string;
  vin: string;
  imageSrc: string;
  /** See VehicleCard — same trick to compensate for inconsistent source crops. */
  imageScale?: number;
  state: VehicleRowState;
  /** Fired only when the row is in `default` state. */
  onTrigger?: () => void;
};

/**
 * Compact horizontal vehicle row used inside the Enable Access content card.
 *
 * Spec (Figma frame 271:368, "Card states"):
 *  - rounded-2xl, padding pl-16 pr-24, gap-16 between thumbnail/text/right-slot
 *  - 92×92 thumbnail on left, rounded-xl, bg matches row
 *  - Year/model + VIN in middle (flex-1)
 *  - Right slot swaps between: empty checkbox / filled checkbox / spinner / "Connected" label
 */
export function VehicleRow({
  year,
  model,
  vin,
  imageSrc,
  imageScale = 1,
  state,
  onTrigger,
}: VehicleRowProps) {
  const isClickable = state === "default" && Boolean(onTrigger);

  // bg + border colors per state. Border is always 1px so dimensions stay
  // identical between states; default just renders it transparent.
  const containerColors =
    state === "default"
      ? "bg-desat-1 border-transparent"
      : state === "connected"
      ? "bg-desat-0 border-success"
      : "bg-desat-0 border-accent-primary";

  // Thumbnail bg matches row bg so the rounded-xl corners blend in.
  const thumbBg = state === "default" ? "bg-desat-1" : "bg-desat-0";

  return (
    <button
      type="button"
      onClick={isClickable ? onTrigger : undefined}
      disabled={!isClickable}
      aria-pressed={state === "selected" || state === "connected"}
      className={`flex h-[92px] w-full items-center gap-4 overflow-hidden rounded-2xl border pr-6 pl-4 text-left transition-colors duration-300 ${containerColors} ${
        isClickable ? "cursor-pointer" : "cursor-default"
      }`}
    >
      {/* Thumbnail */}
      <div
        className={`flex size-[92px] shrink-0 items-center justify-center overflow-hidden rounded-xl transition-colors duration-300 ${thumbBg}`}
      >
        <Image
          src={imageSrc}
          alt=""
          width={92}
          height={92}
          className="h-full w-full object-contain mix-blend-multiply"
          style={imageScale !== 1 ? { transform: `scale(${imageScale})` } : undefined}
        />
      </div>

      {/* Text block */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xl font-bold leading-tight tracking-[-0.5px] text-accent-dark">
          {year} {model}
        </p>
        <p className="font-mono text-sm leading-[14px] text-desat-7">{vin}</p>
      </div>

      {/* Right slot — swaps based on state */}
      <div className="flex shrink-0 items-center justify-end">
        <AnimatePresence mode="wait" initial={false}>
          {state === "default" && (
            <motion.div
              key="default"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="size-7 rounded-lg border border-desat-3 bg-white"
              aria-hidden
            />
          )}
          {state === "selected" && (
            <motion.div
              key="selected"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.15 }}
              className="flex size-7 items-center justify-center rounded-lg bg-accent-primary"
              aria-hidden
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none">
                <path
                  d="M3.33 8.5l3 3 6.34-6.34"
                  stroke="white"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          )}
          {state === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="size-6 animate-spin rounded-full border-[2.5px] border-desat-3 border-t-accent-primary"
              role="status"
              aria-label="Connecting"
            />
          )}
          {state === "connected" && (
            <motion.span
              key="connected"
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.2 }}
              className="font-mono text-sm leading-[14px] text-success"
            >
              Connected
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </button>
  );
}
