"use client";

import Image from "next/image";
import Link from "next/link";
import { UserMenu } from "./UserMenu";

type DashboardNavProps = {
  /**
   * Optional click handler for the Parle logo. When set, the logo renders as
   * a button — used by `OnboardingFlow` to reset its step state. When omitted,
   * the logo falls back to a `Link` to `/`.
   */
  onLogoClick?: () => void;
};

/**
 * Dark-variant top nav used on the owner dashboard.
 *
 * Spec (Figma node 267:108):
 *  - 64px tall, 32px horizontal padding
 *  - Background: accent-dark; bottom border: accent-primary
 *  - Logo on left (inverted to white via CSS filter)
 *  - UserMenu on right (avatar + name + placeholder dropdown)
 */
export function DashboardNav({ onLogoClick }: DashboardNavProps) {
  const logo = (
    <Image
      src="/assets/Parle_Logo.svg"
      alt="Parle"
      width={105}
      height={30}
      priority
      className="brightness-0 invert"
    />
  );

  const interactiveClasses =
    "cursor-pointer transition-opacity duration-150 hover:opacity-70";

  return (
    <nav className="flex h-16 w-full items-center justify-between border-b border-accent-primary bg-accent-dark px-8">
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

      <UserMenu name="Todd Pritts" avatarSrc="/assets/avatar@2x.png" />
    </nav>
  );
}
