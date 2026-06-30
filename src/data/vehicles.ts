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

export type Vehicle = {
  id: string;
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
  name: string;
  role: string;
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
