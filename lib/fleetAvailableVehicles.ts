import type { PostgrestError } from '@supabase/supabase-js';

import {
  DEFAULT_FEATURES,
  DEFAULT_SEATS,
  type Vehicle,
  type VehicleColor,
} from '@/src/data/vehicles';
import { supabase } from './supabase';

/**
 * Row shape of the Supabase `fleet_available_vehicles` table. These are the
 * vehicles owners have published to the shared renter fleet.
 */
export type FleetAvailableVehicle = {
  id: string;
  owner_user_id: string;
  source_vehicle_id: string | null;
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
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS =
  'id, owner_user_id, source_vehicle_id, vin, display_name, model, color, battery_level, range_miles, is_locked, hourly_rate, distance_miles, is_available, created_at, updated_at';

export type FleetLoadResult = {
  vehicles: Vehicle[];
  publicCount: number;
  ownerCount: number;
};

function logSupabaseError(context: string, error: PostgrestError): void {
  console.warn(`[Fleet] ${context} error:`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

/** Deduplicate fleet rows by source_vehicle_id, falling back to row id. */
export function dedupeFleetRows(rows: FleetAvailableVehicle[]): FleetAvailableVehicle[] {
  const seen = new Set<string>();
  const merged: FleetAvailableVehicle[] = [];

  for (const row of rows) {
    const key = row.source_vehicle_id?.trim() || row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  return merged;
}

/**
 * Fetch every currently available fleet vehicle, newest first.
 */
export async function getAvailableFleetVehicles(): Promise<FleetAvailableVehicle[]> {
  const { data, error } = await supabase
    .from('fleet_available_vehicles')
    .select(SELECT_COLUMNS)
    .eq('is_available', true)
    .order('created_at', { ascending: false });

  if (error) {
    logSupabaseError('public fleet_available_vehicles', error);
    throw new Error(error.message);
  }

  return (data ?? []) as FleetAvailableVehicle[];
}

/**
 * Fetch fleet rows owned by the signed-in user (any availability flag).
 * Returns [] when there is no session. Logs — but does not throw — on error.
 */
export async function getOwnerFleetVehicles(
  ownerUserId: string
): Promise<FleetAvailableVehicle[]> {
  const { data, error } = await supabase
    .from('fleet_available_vehicles')
    .select(SELECT_COLUMNS)
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false });

  if (error) {
    logSupabaseError('owner fleet_available_vehicles', error);
    return [];
  }

  return (data ?? []) as FleetAvailableVehicle[];
}

/**
 * Fetch a single available vehicle by its row id (or matching source vehicle
 * id). Returns null when nothing matches.
 */
export async function getAvailableFleetVehicleById(
  vehicleId: string
): Promise<FleetAvailableVehicle | null> {
  const { data, error } = await supabase
    .from('fleet_available_vehicles')
    .select(SELECT_COLUMNS)
    .or(`id.eq.${vehicleId},source_vehicle_id.eq.${vehicleId}`)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as FleetAvailableVehicle | null) ?? null;
}

/* ------------------------------------------------------------------ */
/* Mapping helpers: DB row -> the `Vehicle` shape the scenes consume.  */
/* ------------------------------------------------------------------ */

/** Card / detail title. display_name → model → VIN tail → "Tesla Vehicle". */
export function getVehicleTitle(row: FleetAvailableVehicle): string {
  if (row.display_name?.trim()) return row.display_name.trim();
  if (row.model?.trim()) return row.model.trim();
  if (row.vin?.trim()) return `Tesla ${row.vin.trim().slice(-4)}`;
  return 'Tesla Vehicle';
}

/** Pick the closest Tesla image asset we have for this row's color. */
export function getVehicleColor(row: FleetAvailableVehicle): VehicleColor {
  const color = (row.color ?? '').toLowerCase();
  if (color.includes('red')) return 'Red';
  if (color.includes('black')) return 'Black';
  return 'White';
}

/**
 * Convert a Supabase fleet row into the `Vehicle` object the renter scenes
 * were originally written against, so the UI is byte-for-byte the prototype.
 */
export function mapFleetVehicleToVehicle(row: FleetAvailableVehicle): Vehicle {
  return {
    id: row.id,
    source: 'public',
    isSharedAccess: false,
    // Command endpoints key off the real vehicle id / VIN, not the fleet row id.
    commandVehicleId: row.source_vehicle_id ?? row.vin ?? row.id,
    access: null,
    model: getVehicleTitle(row),
    color: getVehicleColor(row),
    distanceMi: row.distance_miles == null ? null : Number(row.distance_miles),
    batteryPct: row.battery_level == null ? null : Math.round(Number(row.battery_level)),
    hourlyRate: row.hourly_rate == null ? null : Number(row.hourly_rate),
    rangeMi: row.range_miles == null ? null : Math.round(Number(row.range_miles)),
    seats: DEFAULT_SEATS,
    isLocked: row.is_locked,
    features: [...DEFAULT_FEATURES],
    owner: {
      name: 'Parlé Host',
      role: 'Verified fleet owner',
      email: null,
    },
  };
}

/**
 * Load the renter fleet feed from Supabase:
 *   • Public rows (is_available = true)
 *   • Owner rows for the signed-in user (owner_user_id = auth user id)
 *
 * Merges and deduplicates before mapping into the scene `Vehicle` shape.
 * Surfaces an error only when every query fails and no rows are returned.
 */
export async function getAvailableVehicles(): Promise<FleetLoadResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userIdExists = !!user?.id;
  console.log(`[Fleet] current user id exists: ${userIdExists}`);

  const publicPromise = supabase
    .from('fleet_available_vehicles')
    .select(SELECT_COLUMNS)
    .eq('is_available', true)
    .order('created_at', { ascending: false });

  const ownerPromise = user?.id
    ? supabase
        .from('fleet_available_vehicles')
        .select(SELECT_COLUMNS)
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false })
    : null;

  const [publicResult, ownerResult] = await Promise.all([
    publicPromise,
    ownerPromise ?? Promise.resolve({ data: [], error: null }),
  ]);

  let publicRows: FleetAvailableVehicle[] = [];
  let ownerRows: FleetAvailableVehicle[] = [];
  let publicError: PostgrestError | null = null;
  let ownerError: PostgrestError | null = null;

  if (publicResult.error) {
    publicError = publicResult.error;
    logSupabaseError('public fleet_available_vehicles', publicResult.error);
  } else {
    publicRows = (publicResult.data ?? []) as FleetAvailableVehicle[];
  }

  if (ownerResult.error) {
    ownerError = ownerResult.error;
    logSupabaseError('owner fleet_available_vehicles', ownerResult.error);
  } else {
    ownerRows = (ownerResult.data ?? []) as FleetAvailableVehicle[];
  }

  const publicCount = publicRows.length;
  const ownerCount = ownerRows.length;
  console.log(`[Fleet] public fleet count: ${publicCount}`);
  console.log(`[Fleet] owner fleet count: ${ownerCount}`);

  const mergedRows = dedupeFleetRows([...publicRows, ...ownerRows]);

  if (mergedRows.length === 0) {
    const blockingError = publicError ?? ownerError;
    if (blockingError) {
      throw new Error(blockingError.message);
    }
    console.log(
      '[Fleet] No rows returned from fleet_available_vehicles. ' +
        'Either no owner has published a vehicle yet, ' +
        'or RLS is blocking the read for this user.'
    );
  }

  return {
    vehicles: mergedRows.map(mapFleetVehicleToVehicle),
    publicCount,
    ownerCount,
  };
}

/** Fetch + map a single vehicle by id. Returns null when not found. */
export async function getAvailableVehicleById(
  vehicleId: string
): Promise<Vehicle | null> {
  const row = await getAvailableFleetVehicleById(vehicleId);
  return row ? mapFleetVehicleToVehicle(row) : null;
}
