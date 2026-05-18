"use client";

import Image from "next/image";

type VehicleCardProps = {
  year: string;
  model: string;
  vin: string;
  imageSrc: string;
  /**
   * CSS scale factor applied to the image only — useful when source PNGs
   * have inconsistent aspect ratios (e.g., a 1:1 squarer crop next to a 1.57:1
   * wider crop) and need to look the same visual size in the card.
   */
  imageScale?: number;
  selected: boolean;
  onToggle: () => void;
};

/**
 * One row of the vehicle list.
 *
 * Spec (Figma nodes 177:104 / 215:414 / 215:427):
 *  - 360 wide, white bg, 16px radius
 *  - Selected: border accent-light + 5-layer purple drop shadow
 *  - Unselected: border desat-3, no shadow
 *  - Checkbox upper-right: 28×28 rounded-lg
 *      • Selected: filled accent-primary, white tick
 *      • Unselected: white bg, desat-3 border
 *  - Image area: 140 tall, bg desat-1, rounded-12, mix-blend-multiply on the image
 */
const SELECTED_SHADOW =
  "0 73px 118px rgba(211,164,255,0.11), 0 27px 43px rgba(211,164,255,0.08), 0 13px 21px rgba(211,164,255,0.06), 0 6px 10px rgba(211,164,255,0.05), 0 3px 4px rgba(211,164,255,0.03)";

export function VehicleCard({
  year,
  model,
  vin,
  imageSrc,
  imageScale = 1,
  selected,
  onToggle,
}: VehicleCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`flex w-[360px] flex-col gap-3 rounded-2xl border bg-white px-4 pt-4 pb-6 text-left transition-colors duration-200 ${
        selected
          ? "border-accent-light"
          : "border-desat-3 hover:border-desat-4"
      }`}
      style={selected ? { boxShadow: SELECTED_SHADOW } : undefined}
    >
      {/* Checkbox (decorative only — the whole card is the click target) */}
      <div className="flex w-full justify-end">
        <div
          className={`flex size-7 items-center justify-center rounded-lg transition-colors duration-200 ${
            selected
              ? "bg-accent-primary"
              : "border border-desat-3 bg-white"
          }`}
        >
          {selected && (
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              aria-hidden
            >
              <path
                d="M3.33 8.5l3 3 6.34-6.34"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Image area */}
      <div className="flex h-[140px] w-full items-center justify-center overflow-hidden rounded-xl bg-desat-1">
        <Image
          src={imageSrc}
          alt=""
          width={280}
          height={140}
          className="h-full w-full object-contain mix-blend-multiply"
          style={imageScale !== 1 ? { transform: `scale(${imageScale})` } : undefined}
        />
      </div>

      {/* Text block */}
      <div className="flex w-full flex-col items-start gap-2 px-2">
        <p className="text-xl font-bold leading-tight tracking-[-0.5px] text-accent-dark">
          {year} {model}
        </p>
        <p className="font-mono text-sm leading-[14px] text-desat-7">{vin}</p>
      </div>
    </button>
  );
}
