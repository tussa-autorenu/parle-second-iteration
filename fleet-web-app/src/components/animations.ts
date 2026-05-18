import type { Variants } from "motion/react";

/**
 * Shared scene-transition variants.
 *
 * Used by every Scene in the onboarding flow. Each Scene wraps its parts
 * in `motion.div`s with these variants and lets `AnimatePresence` (in
 * `OnboardingFlow`) drive enter/exit on mount/unmount.
 */

/**
 * Headline-style transition. Element stays put; only opacity changes.
 * Use for the page heading + supporting copy on each screen.
 */
export const fadeOnly: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.25, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/**
 * "Stage" transition — rises up from below to enter, falls down to exit.
 * Use for everything that isn't a headline: modals, cards, CTAs, decorative imagery.
 */
export const slideUp: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    y: 24,
    transition: { duration: 0.25, ease: "easeIn" },
  },
};

/**
 * Wrap a scene's contents with this on the outermost motion element to
 * stagger child enter animations. Children just declare `variants={fadeOnly}`
 * or `variants={slideUp}` — they inherit the active state ("initial",
 * "animate", "exit") from this parent, so each one fires ~80ms after the
 * previous child instead of all at once.
 *
 * Exit is intentionally NOT staggered — when leaving the screen, everything
 * should drop together so the next scene can take the stage cleanly.
 */
export const sceneStagger: Variants = {
  initial: {},
  animate: {
    transition: {
      delayChildren: 0.05,
      staggerChildren: 0.08,
    },
  },
  exit: {},
};
