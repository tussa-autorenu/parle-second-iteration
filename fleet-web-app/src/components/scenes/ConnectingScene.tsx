"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { fadeOnly, sceneStagger, slideUp } from "@/components/animations";

type ConnectingSceneProps = {
  onComplete: () => void;
  /** How long to wait before auto-advancing. Defaults to 2000ms. */
  durationMs?: number;
};

/**
 * Transitional loading state shown after the user clicks "Connect with Tesla".
 *
 * Mocks the OAuth round-trip with a fixed 2s delay before advancing.
 * Spinner enters first, then the caption fades in just behind it.
 */
export function ConnectingScene({
  onComplete,
  durationMs = 2000,
}: ConnectingSceneProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onComplete, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [onComplete, durationMs]);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4"
      variants={sceneStagger}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <motion.div
        variants={slideUp}
        aria-hidden
        className="size-12 animate-spin rounded-full border-4 border-desat-2 border-t-accent-primary"
      />
      <motion.p variants={fadeOnly} className="text-base text-desat-7">
        Connecting to your Tesla account…
      </motion.p>
    </motion.div>
  );
}
