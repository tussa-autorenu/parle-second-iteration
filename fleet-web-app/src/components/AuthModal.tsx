"use client";

import Image from "next/image";

type AuthModalProps = {
  /** Called when the user clicks "Connect with Tesla". */
  onConnect?: () => void;
};

/**
 * Tesla OAuth sign-in modal.
 *
 * Spec (Figma node 177:78):
 *  - 440 × 480, white bg, 1px border in accent-light, 16px radius
 *  - 5-layer lavender drop shadow
 *  - Tesla logo → heading → description → CTA → footer
 */
export function AuthModal({ onConnect }: AuthModalProps = {}) {
  return (
    <div
      className="flex h-[480px] w-[440px] flex-col items-center gap-3 overflow-hidden rounded-2xl border border-accent-light bg-white px-4 pt-12 pb-8"
      style={{
        boxShadow:
          "0 73px 118px rgba(211,164,255,0.11), 0 27px 43px rgba(211,164,255,0.08), 0 13px 21px rgba(211,164,255,0.06), 0 6px 10px rgba(211,164,255,0.05), 0 3px 4px rgba(211,164,255,0.03)",
      }}
    >
      {/* Tesla logo */}
      <div className="relative size-16 shrink-0">
        <Image
          src="/assets/Tesla logo@2x.png"
          alt="Tesla"
          fill
          sizes="64px"
          className="object-contain"
          priority
        />
      </div>

      {/* Heading + description */}
      <div className="flex w-full flex-col gap-3 text-center text-accent-dark">
        <h1 className="text-[28px] font-bold tracking-[-1px] leading-tight">
          Create your account
        </h1>
        <p className="text-base leading-[22px]">
          Connect your Tesla account to register your
          <br />
          vehicles on the Parle network.
        </p>
      </div>

      {/* CTA */}
      <div className="flex w-[384px] flex-col items-center py-4">
        <button
          type="button"
          onClick={onConnect}
          className="flex h-14 items-center justify-center gap-2 rounded-xl bg-accent-dark px-6 text-white transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(29,6,51,0.18)] active:translate-y-0 active:shadow-none"
        >
          <span className="relative h-[23px] w-6 shrink-0">
            <Image
              src="/assets/Tesla logo@2x.png"
              alt=""
              fill
              sizes="24px"
              className="object-contain brightness-0 invert"
            />
          </span>
          <span className="text-base font-medium">Connect with Tesla</span>
        </button>
      </div>

      {/* Footer */}
      <div className="flex w-full flex-1 items-end justify-center">
        <p className="text-center text-sm leading-[20px] text-desat-7">
          {`By continuing, you agree to Parle's Terms of Service`}
          <br />
          and acknowledge our Privacy Policy.
        </p>
      </div>
    </div>
  );
}
