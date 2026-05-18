"use client";

import { AnimatePresence, motion } from "motion/react";

/**
 * Onboarding stepper for the nav.
 *
 * Spec (Figma nodes 215:528 and 260:152):
 *  - Active step: 78×24 pill, white bg, 1px desat-4 border, with number
 *  - Inactive step: 78×8 pill, solid desat-4 fill
 *  - Connector: 16px wide × 1px tall line, bg desat-4
 *
 * Each step's pill morphs between active/inactive states using motion's
 * `animate` prop (height + background) plus an inset box-shadow that's
 * always present — visible as a border on the white active pill, invisible
 * against the desat-4 fill of the inactive pill. This keeps the dimensions
 * stable across the transition and avoids any flicker from border-width
 * animation.
 *
 * The step number fades in/out via AnimatePresence so it appears only when
 * the pill is tall enough to hold it.
 */

type StepperProps = {
  currentStep: 1 | 2 | 3;
  totalSteps?: 1 | 2 | 3;
};

export function Stepper({ currentStep, totalSteps = 3 }: StepperProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className="flex items-center justify-center">
      {steps.map((step, idx) => (
        <div key={step} className="flex items-center">
          <Step number={step} active={step === currentStep} />
          {idx < steps.length - 1 && <Connector />}
        </div>
      ))}
    </div>
  );
}

function Step({ number, active }: { number: number; active: boolean }) {
  return (
    <motion.div
      animate={{
        height: active ? 24 : 8,
        backgroundColor: active ? "#ffffff" : "#d6cfdd",
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="flex w-[78px] items-center justify-center overflow-hidden rounded-full"
      style={{ boxShadow: "inset 0 0 0 1px #d6cfdd" }}
    >
      <AnimatePresence mode="wait">
        {active && (
          <motion.span
            key={`step-num-${number}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="text-sm font-medium leading-[14px] text-accent-dark"
          >
            {number}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Connector() {
  return <div className="h-px w-4 bg-desat-4" />;
}
