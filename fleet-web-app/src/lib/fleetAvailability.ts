/**
 * Publishes the owner's selected fleet vehicles to Supabase so the renter
 * mobile app can list them.
 *
 * The renter app reads `public.fleet_available_vehicles` where
 * `is_available = true`. This module upserts a row per owned vehicle:
 *   - selected vehicles   → is_available = true
 *   - unselected vehicles → is_available = false
 *
 * Writes go through the existing browser Supabase client (anon key + the
 * signed-in user's session). Row Level Security only allows a user to write
 * rows where `owner_user_id = auth.uid()`, so no service-role key is ever
 * needed or referenced in the frontend. localStorage stays the source of
 * truth for the UI; this is the durable, cross-device/renter-visible copy.
 */

import { supabase } from "@/lib/supabase";
import type { Vehicle } from "@/lib/api";

/** Row shape for `public.fleet_available_vehicles` upserts. */
export type FleetAvailableVehicleInsert = {
  owner_user_id: string;
  source_vehicle_id: string;
  vin: string | null;
  display_name: string | null;
  model: string | null;
  color: string | null;
  battery_level: number | null;
  range_miles: number | null;
  is_locked: boolean | null;
  hourly_rate: number | null;
  distance_miles: number | null;
  is_available: boolean;
};

/**
 * A vehicle we can map to a fleet-availability row. The web app's `Vehicle`
 * type is intentionally narrow; the extra fields are optional so this keeps
 * working if richer vehicle/status data is threaded through later.
 */
export type SyncableVehicle = Vehicle & {
  displayName?: string | null;
  model?: string | null;
  color?: string | null;
  batteryLevel?: number | null;
  rangeMiles?: number | null;
  isLocked?: boolean | null;
  hourlyRate?: number | null;
  status?: {
    batteryLevel?: number | null;
    rangeMiles?: number | null;
    isLocked?: boolean | null;
  } | null;
};

/** Default hourly rate until owner pricing exists. */
const DEFAULT_HOURLY_RATE = 24;

function toRow(
  vehicle: SyncableVehicle,
  ownerUserId: string,
  isAvailable: boolean,
): FleetAvailableVehicleInsert {
  return {
    owner_user_id: ownerUserId,
    source_vehicle_id: vehicle.id,
    vin: vehicle.vin || null,
    display_name:
      vehicle.displayName ?? vehicle.name ?? vehicle.model ?? "Tesla Vehicle",
    model: vehicle.model ?? null,
    color: vehicle.color ?? null,
    battery_level: vehicle.batteryLevel ?? vehicle.status?.batteryLevel ?? null,
    range_miles: vehicle.rangeMiles ?? vehicle.status?.rangeMiles ?? null,
    is_locked: vehicle.isLocked ?? vehicle.status?.isLocked ?? null,
    hourly_rate: vehicle.hourlyRate ?? DEFAULT_HOURLY_RATE,
    distance_miles: null,
    is_available: isAvailable,
  };
}

/**
 * Upsert every owned vehicle into `fleet_available_vehicles`, flagging the
 * selected ones as available and the rest as unavailable. Conflicts resolve on
 * `source_vehicle_id` (the web app's vehicle id), so re-saving updates in place.
 *
 * Throws on a Supabase error so callers can surface a message in the UI.
 */
export async function syncSelectedFleetVehiclesToSupabase(params: {
  ownerUserId: string;
  allVehicles: SyncableVehicle[];
  selectedVehicleIds: string[];
}): Promise<void> {
  const { ownerUserId, allVehicles, selectedVehicleIds } = params;

  if (!supabase) {
    throw new Error(
      "Supabase isn’t configured, so the fleet could not be published.",
    );
  }
  if (!ownerUserId) {
    throw new Error("Missing owner user id; cannot publish fleet.");
  }
  if (allVehicles.length === 0) return;

  const selected = new Set(selectedVehicleIds);
  const rows = allVehicles.map((v) => toRow(v, ownerUserId, selected.has(v.id)));
  const selectedCount = rows.filter((r) => r.is_available).length;

  const { error } = await supabase
    .from("fleet_available_vehicles")
    .upsert(rows, { onConflict: "source_vehicle_id" });

  // Log safe counts only — never tokens, keys, or vehicle PII.
  if (error) {
    console.error("[fleetAvailability] upsert failed", {
      vehicleCount: rows.length,
      selectedCount,
    });
    throw error;
  }

  console.log("[fleetAvailability] synced fleet availability", {
    vehicleCount: rows.length,
    selectedCount,
  });
}
