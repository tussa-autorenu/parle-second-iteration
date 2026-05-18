"use client";

import * as Switch from "@radix-ui/react-switch";

type ToggleProps = {
  on: boolean;
  onChange?: () => void;
  /** Optional accessible label for the switch. */
  ariaLabel?: string;
};

/**
 * Pill toggle built on Radix UI's Switch primitive.
 *
 * Radix handles keyboard, focus, and ARIA. We only paint the visuals.
 *
 * Spec (Figma nodes 275:403 off / 276:422 on):
 *   - Track: 45×28, bg-desat-0 with 1px desat-3 border, rounded-full.
 *     Identical in both states.
 *   - Thumb: 22×22 circle, parked 2px from the inside edge.
 *       - Off → bg-desat-4, on the LEFT  (translate-x: 2px)
 *       - On  → bg-accent-primary, on the RIGHT (translate-x: 19px)
 *   - Position math: 45 outer − 2 border − 2 right padding − 22 thumb = 19px
 */
export function Toggle({ on, onChange, ariaLabel }: ToggleProps) {
  return (
    <Switch.Root
      checked={on}
      onCheckedChange={onChange}
      aria-label={ariaLabel}
      className="relative h-[28px] w-[45px] shrink-0 cursor-pointer rounded-full border border-desat-3 bg-desat-0"
    >
      <Switch.Thumb
        className="
          absolute top-[2px] block h-[22px] w-[22px]
          translate-x-[2px] rounded-full
          bg-desat-4 shadow-[0_1px_2px_rgba(0,0,0,0.08)]
          transition-[transform,background-color] duration-200 ease-out
          data-[state=checked]:translate-x-[19px]
          data-[state=checked]:bg-accent-primary
        "
      />
    </Switch.Root>
  );
}
