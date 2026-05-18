"use client";

import Image from "next/image";
import { motion, type Variants } from "motion/react";
import { AuthModal } from "@/components/AuthModal";
import { slideUp } from "@/components/animations";

type OAuthSceneProps = {
  onConnect: () => void;
};

/**
 * Cars wait until after the modal has landed before fading in.
 * Modal animation runs ~0.35s (0.05s initial delay + 0.3s slideUp duration);
 * we then pause 0.6s before the cars start their fade.
 */
const CAR_ENTER_DELAY_S = 0.35 + 0.6;

const carEntry: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 1.5,
      delay: CAR_ENTER_DELAY_S,
      ease: "easeOut",
    },
  },
  // On exit, fall down with the rest of the scene so it leaves cleanly.
  exit: {
    opacity: 0,
    y: 24,
    transition: { duration: 0.25, ease: "easeIn" },
  },
};

/**
 * Step 1 — Tesla OAuth sign-in.
 *
 * Modal lands first (slideUp). After it settles, the cars fade in last —
 * a quiet "stage filling out" effect rather than everything moving together.
 *
 * Note: cars use `top-[calc(50%-22px+24px)]` rather than `top-1/2 -translate-y-1/2`
 * because motion sets `transform` directly and would clobber the centering translate.
 */
export function OAuthScene({ onConnect }: OAuthSceneProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Left-facing car — fades in last, after the modal lands */}
      <motion.div
        variants={carEntry}
        initial="initial"
        animate="animate"
        exit="exit"
        aria-hidden
        className="pointer-events-none absolute top-[calc(50%-22px+24px)] left-[calc(50%-458px)] z-0 h-[204px] w-[320px] overflow-hidden"
      >
        <Image
          src="/assets/vehicle_white_leftfacing@2x.png"
          alt=""
          fill
          sizes="320px"
          className="object-cover object-center"
        />
      </motion.div>

      {/* Right-facing car — same delayed fade */}
      <motion.div
        variants={carEntry}
        initial="initial"
        animate="animate"
        exit="exit"
        aria-hidden
        className="pointer-events-none absolute top-[calc(50%-22px+24px)] right-[calc(50%-458px)] z-0 h-[204px] w-[320px] overflow-hidden"
      >
        <Image
          src="/assets/vehicle_white_rightfacing@2x.png"
          alt=""
          fill
          sizes="320px"
          className="object-cover object-center"
        />
      </motion.div>

      {/* Modal — enters first, slides up + fades in */}
      <motion.div
        variants={slideUp}
        initial="initial"
        animate="animate"
        exit="exit"
        className="relative z-10"
      >
        <AuthModal onConnect={onConnect} />
      </motion.div>
    </div>
  );
}
