"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { fadeOnly, sceneStagger, slideUp } from "@/components/animations";

type FinalInstructionsSceneProps = {
  onBack?: () => void;
  onActivate?: () => void;
};

/** Soft 6-layer purple drop shadow on the content card (matches screen 3). */
const CARD_SHADOW =
  "0 100px 217px rgba(211,164,255,0.08), 0 42px 91px rgba(211,164,255,0.06), 0 22px 48px rgba(211,164,255,0.05), 0 13px 27px rgba(211,164,255,0.04), 0 7px 14px rgba(211,164,255,0.03), 0 3px 6px rgba(211,164,255,0.02)";

const GUIDELINES = [
  {
    icon: "/assets/BatteryCharging.svg",
    title: "Keep Vehicles Charged",
    description: "Maintain at least 50% battery before each rental period begins.",
  },
  {
    icon: "/assets/Map_Pin.svg",
    title: "Designated Pickup Zones",
    description: "Set pickup/drop-off locations in the dashboard. Renters will be guided there.",
  },
  {
    icon: "/assets/Shield_Check.svg",
    title: "Insurance Coverage",
    description: "All rentals are covered by Parle's comprehensive insurance policy up to $100K.",
  },
  {
    icon: "/assets/Credit_Card_01.svg",
    title: "Earnings & Payouts",
    description: "Earnings are deposited weekly. Track real-time revenue in your dashboard.",
  },
  {
    icon: "/assets/Bell_Ring.svg",
    title: "Notifications",
    description: "You'll receive alerts for new bookings, trip starts, and any incidents.",
  },
];

/**
 * Step 4 — Final Instructions / Fleet Guidelines.
 *
 * Heading + copy fade in place; content card slides up from below.
 * Inside the card: a list of 5 guideline rows, an agreement checkbox, the
 * "Activate My Fleet" CTA (disabled until the checkbox is ticked), and a
 * back link to the previous screen.
 */
export function FinalInstructionsScene({
  onBack,
  onActivate,
}: FinalInstructionsSceneProps) {
  const [agreed, setAgreed] = useState(false);

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
          Almost there!
        </h1>
        <p className="text-base leading-[22px] text-desat-7">
          Review these important guidelines before your fleet goes live on Parle.
        </p>
      </motion.div>

      {/* Content card — slide up */}
      <motion.div
        variants={slideUp}
        className="mt-12 flex w-[520px] flex-col gap-6 rounded-[20px] border border-desat-3 bg-white px-8 pt-8 pb-6"
        style={{ boxShadow: CARD_SHADOW }}
      >
        {/* Guideline list */}
        <div className="flex flex-col gap-[26px] py-4">
          {GUIDELINES.map((g) => (
            <div key={g.title} className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-desat-1">
                <Image
                  src={g.icon}
                  alt=""
                  width={20}
                  height={20}
                  className="size-5"
                />
              </div>
              <div className="flex w-[370px] flex-col gap-1">
                <p className="text-base font-bold leading-4 text-accent-dark">
                  {g.title}
                </p>
                <p className="text-sm font-normal leading-[18px] text-desat-7">
                  {g.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Agreement checkbox */}
        <button
          type="button"
          onClick={() => setAgreed((prev) => !prev)}
          aria-pressed={agreed}
          className="flex cursor-pointer items-center gap-3"
        >
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
              agreed
                ? "bg-accent-primary"
                : "border border-desat-3 bg-white"
            }`}
          >
            {agreed && (
              <svg
                viewBox="0 0 16 16"
                className="size-4"
                fill="none"
                aria-hidden
              >
                <path
                  d="M3.33 8.5l3 3 6.34-6.34"
                  stroke="white"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <span className="text-base font-medium leading-[22px] text-accent-dark">
            {`I've read and understand the fleet guidelines`}
          </span>
        </button>

        {/* Activate CTA */}
        <button
          type="button"
          disabled={!agreed}
          onClick={onActivate}
          className="flex h-14 w-full items-center justify-center rounded-[14px] bg-accent-dark text-base font-bold text-white shadow-[0_4px_12px_rgba(29,6,51,0.25)] transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(29,6,51,0.3)] active:translate-y-0 active:shadow-[0_4px_12px_rgba(29,6,51,0.25)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_12px_rgba(29,6,51,0.25)]"
        >
          Activate My Fleet
        </button>

        {/* Back link */}
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 cursor-pointer items-center justify-center text-base text-accent-dark transition-opacity duration-150 hover:opacity-70"
        >
          ← Back to 3rd Party Access
        </button>
      </motion.div>
    </motion.div>
  );
}
