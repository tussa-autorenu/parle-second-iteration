"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  isSupabaseConfigured,
  supabase,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/lib/supabase";

type LoginFormProps = {
  /** Fired after a successful sign-in or sign-up with a confirmed user. */
  onAuthenticated: (user: User) => void;
};

/** Same 5-layer lavender drop shadow used by `AuthModal` so cards match. */
const CARD_SHADOW =
  "0 73px 118px rgba(211,164,255,0.11), 0 27px 43px rgba(211,164,255,0.08), 0 13px 21px rgba(211,164,255,0.06), 0 6px 10px rgba(211,164,255,0.05), 0 3px 4px rgba(211,164,255,0.03)";

type Mode = "idle" | "signingIn" | "creating";

/**
 * Supabase email/password sign-in card.
 *
 * Visual language mirrors `AuthModal` exactly — 440 wide, white background,
 * accent-light border, 5-layer purple drop shadow, accent-dark primary
 * button. Inputs reuse the same desat-3 border + rounded-xl + h-14 sizing
 * that buttons already use in the app.
 */
export function LoginForm({ onAuthenticated }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const busy = mode !== "idle";
  const configured = isSupabaseConfigured();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErrorMessage(null);
    setInfoMessage(null);
    if (!configured || !supabase) {
      setErrorMessage(SUPABASE_NOT_CONFIGURED_MESSAGE);
      return;
    }
    setMode("signingIn");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.user) {
        setErrorMessage(
          error?.message ?? "We couldn’t sign you in. Please try again.",
        );
        return;
      }
      onAuthenticated(data.user);
    } finally {
      setMode("idle");
    }
  }

  async function handleCreateAccount() {
    if (busy) return;
    setErrorMessage(null);
    setInfoMessage(null);
    if (!configured || !supabase) {
      setErrorMessage(SUPABASE_NOT_CONFIGURED_MESSAGE);
      return;
    }
    setMode("creating");
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      // When email confirmation is required, signUp returns `user` but no
      // session. We surface that and ask the user to verify before continuing.
      if (data.session && data.user) {
        onAuthenticated(data.user);
        return;
      }
      setInfoMessage(
        "Account created. Check your email to confirm, then sign in.",
      );
    } finally {
      setMode("idle");
    }
  }

  return (
    <div
      className="flex w-[440px] flex-col gap-6 overflow-hidden rounded-2xl border border-accent-light bg-white px-4 pt-12 pb-8"
      style={{ boxShadow: CARD_SHADOW }}
    >
      {/* Heading + description */}
      <div className="flex w-full flex-col gap-3 text-center text-accent-dark">
        <h1 className="text-[28px] font-bold tracking-[-1px] leading-tight">
          Sign in to Parle
        </h1>
        <p className="text-base leading-[22px]">
          Use your email and password to access
          <br />
          your fleet.
        </p>
      </div>

      <form
        onSubmit={handleSignIn}
        className="flex w-full flex-col gap-3 px-4"
        noValidate
      >
        <label className="flex flex-col gap-2 text-left">
          <span className="text-sm font-medium text-accent-dark">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            autoComplete="email"
            placeholder="you@example.com"
            className="h-14 w-full rounded-xl border border-desat-3 bg-white px-4 text-base text-accent-dark placeholder:text-desat-7 transition-colors duration-150 focus:border-accent-primary focus:outline-none disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col gap-2 text-left">
          <span className="text-sm font-medium text-accent-dark">Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="current-password"
            placeholder="••••••••"
            className="h-14 w-full rounded-xl border border-desat-3 bg-white px-4 text-base text-accent-dark placeholder:text-desat-7 transition-colors duration-150 focus:border-accent-primary focus:outline-none disabled:opacity-50"
          />
        </label>

        {errorMessage && (
          <p
            role="alert"
            className="text-center text-sm leading-[18px] text-[#dc2626]"
          >
            {errorMessage}
          </p>
        )}
        {infoMessage && !errorMessage && (
          <p className="text-center text-sm leading-[18px] text-desat-7">
            {infoMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-accent-dark px-6 text-base font-medium text-white transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(29,6,51,0.18)] active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {mode === "signingIn" ? "Signing in…" : "Sign in"}
        </button>

        <button
          type="button"
          onClick={handleCreateAccount}
          disabled={busy}
          className="flex h-14 w-full items-center justify-center rounded-xl border border-accent-dark bg-white px-6 text-base font-medium text-accent-dark transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(29,6,51,0.10)] active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {mode === "creating" ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
