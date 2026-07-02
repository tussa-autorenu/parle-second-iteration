/**
 * Vehicle shape consumed by the renter scenes (list / detail / ride).
 *
 * This used to hold hardcoded Figma mock data. The live app now sources
 * vehicles from Supabase (`fleet_available_vehicles`) and maps each row into
 * this shape via `mapFleetVehicleToVehicle` in `lib/fleetAvailableVehicles.ts`,
 * so the scenes render identically to the original prototype without knowing
 * where the data came from.
 */

export type VehicleColor = 'White' | 'Red' | 'Black';

/**
 * Where a vehicle came from:
 *   • 'public' → public.fleet_available_vehicles (is_available = true)
 *   • 'shared' → a vehicle the renter unlocked via a share code (backend
 *                /share/access). Rendered with a "Shared access" label.
 */
export type VehicleSource = 'public' | 'shared';

export type Vehicle = {
  id: string;
  /** Defaults to 'public'. */
  source: VehicleSource;
  /** Convenience mirror of `source === 'shared'`. */
  isSharedAccess: boolean;
  /**
   * Identifier the backend command endpoints expect (VIN / source vehicle id).
   * Used by lib/vehicleCommands.ts for Lock / Unlock / Ready Drive.
   */
  commandVehicleId: string | null;
  /** Temporary access window for shared vehicles (null for the public fleet). */
  access: VehicleAccess | null;
  /** Display title — real display_name / model, falling back to "Tesla Vehicle". */
  model: string;
  /** One of the three exterior colors we have image assets for. */
  color: VehicleColor;
  /** Straight-line distance from the user, miles (null when unknown). */
  distanceMi: number | null;
  /** Current state of charge, percentage 0–100 (null when unknown). */
  batteryPct: number | null;
  /** Rental rate in USD per hour (null when unknown). */
  hourlyRate: number | null;
  /** Estimated remaining range at current charge, miles (null when unknown). */
  rangeMi: number | null;
  seats: number;
  /** Whether the car is currently locked (null when unknown). */
  isLocked: boolean | null;
  /** Included features displayed on the detail screen. */
  features: string[];
  owner: VehicleOwner;
};

export type VehicleOwner = {
  /** Empty string when the backend didn't return a host name. */
  name: string;
  role: string;
  /** Only set when the backend safely returns an email for renter display. */
  email: string | null;
};

/** Temporary shared-access window returned by the backend `/share/access`. */
export type VehicleAccess = {
  /** ISO timestamp access began (null when unknown). */
  startsAt: string | null;
  /** ISO timestamp access ends (null when unknown). */
  expiresAt: string | null;
  /** Total granted duration in minutes (null when unknown). */
  durationMinutes: number | null;
  /** The redeemed share code, for local display only (null when unknown). */
  shareCode: string | null;
};

/** Standard Tesla amenities shown on the detail screen. */
export const DEFAULT_FEATURES = [
  'Autopilot',
  'Premium Sound',
  'Heated Seats',
  'Sentry Mode',
] as const;

/** Teslas are 5-seaters; the DB doesn't track seat count. */
export const DEFAULT_SEATS = 5;

/* ------------------------------------------------------------------ */
/* Access / duration formatting helpers (pure, UI-agnostic).          */
/* ------------------------------------------------------------------ */

/**
 * Human label for a total granted duration, e.g. "4 hours", "90 minutes",
 * "2h 30m". Returns null when the duration is unknown.
 */
export function formatAccessDuration(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} minute${m === 1 ? '' : 's'}`;
  if (m === 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${h}h ${m}m`;
}

/**
 * Human label for time left until `expiresAt`, e.g. "2h 14m", "14m".
 * Returns "Expired" once past, null when the timestamp is unknown/invalid.
 */
export function formatTimeRemaining(
  expiresAtISO: string | null | undefined,
  now: number = Date.now()
): string | null {
  if (!expiresAtISO) return null;
  const expiresMs = Date.parse(expiresAtISO);
  if (Number.isNaN(expiresMs)) return null;
  const diffMs = expiresMs - now;
  if (diffMs <= 0) return 'Expired';
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Derive a granted duration (minutes) from start/expiry timestamps when the
 * backend didn't send an explicit duration. Returns null when unknown.
 */
export function deriveDurationMinutes(
  startsAtISO: string | null | undefined,
  expiresAtISO: string | null | undefined
): number | null {
  if (!startsAtISO || !expiresAtISO) return null;
  const start = Date.parse(startsAtISO);
  const end = Date.parse(expiresAtISO);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.round((end - start) / 60000);
}
