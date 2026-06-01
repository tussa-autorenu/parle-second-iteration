"use client";

import type { User } from "@supabase/supabase-js";
import { motion } from "motion/react";
import { LoginForm } from "@/components/LoginForm";
import { slideUp } from "@/components/animations";

type LoginSceneProps = {
  onAuthenticated: (user: User) => void;
};

/**
 * Step 0 — Supabase sign-in.
 *
 * Reuses the same `absolute inset-0` centered layout as the OAuth scene
 * (without the decorative cars, which belong to the Tesla step) so the
 * modal lands and exits with the same slideUp transition users see
 * everywhere else in the flow.
 */
export function LoginScene({ onAuthenticated }: LoginSceneProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <motion.div
        variants={slideUp}
        initial="initial"
        animate="animate"
        exit="exit"
        className="relative z-10"
      >
        <LoginForm onAuthenticated={onAuthenticated} />
      </motion.div>
    </div>
  );
}
