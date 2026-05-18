"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Stepper } from "./Stepper";

type NavProps = {
  /** When provided, renders the onboarding stepper centered in the nav. */
  currentStep?: 1 | 2 | 3;
  /**
   * Optional click handler for the Parle logo. When set, the logo renders as
   * a button — used by `OnboardingFlow` to reset its step state without a
   * route change. When omitted, the logo falls back to a `Link` to `/`.
   */
  onLogoClick?: () => void;
};

/**
 * Top navigation bar.
 *
 * Spec (Figma nodes 177:74 and 215:365):
 *  - 64px tall, 32px horizontal padding
 *  - Background: desat-0; bottom border: desat-2
 *  - Logo on left, stepper center, invisible spacer on right (always rendered
 *    so the layout doesn't shift when the stepper appears/disappears)
 */
export function Nav({ currentStep, onLogoClick }: NavProps) {
  const logo = (
    <Image
      src="/assets/Parle_Logo.svg"
      alt="Parle"
      width={105}
      height={30}
      priority
    />
  );

  const interactiveClasses =
    "cursor-pointer transition-opacity duration-150 hover:opacity-70";

  return (
    <nav className="flex h-16 w-full items-center justify-between border-b border-desat-2 bg-desat-0 px-8">
      {onLogoClick ? (
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="Go to start"
          className={interactiveClasses}
        >
          {logo}
        </button>
      ) : (
        <Link href="/" aria-label="Go to start" className={interactiveClasses}>
          {logo}
        </Link>
      )}

      {/* Stepper slot — always rendered so layout stays stable; AnimatePresence
          fades the stepper in/out the first time it appears or leaves. */}
      <div className="flex items-center justify-center">
        <AnimatePresence mode="wait">
          {currentStep && (
            <motion.div
              key="stepper"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <Stepper currentStep={currentStep} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Invisible spacer matched to logo width — keeps stepper visually centered */}
      <div className="h-[30px] w-[105px] opacity-0" aria-hidden />
    </nav>
  );
}
