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

/**
 * Fetch every currently available fleet vehicle, newest first. Throws on a
 * Supabase error so callers can render an error state.
 */
export async function getAvailableFleetVehicles(): Promise<FleetAvailableVehicle[]> {
  const { data, error } = await supabase
    .from('fleet_available_vehicles')
    .select(SELECT_COLUMNS)
    .eq('is_available', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[Fleet] fleet_available_vehicles query failed:', error.message);
    throw new Error(error.message);
  }

  const rows = (data ?? []) as FleetAvailableVehicle[];
  console.log(`[Fleet] fleet_available_vehicles returned ${rows.length} row(s).`);
  if (rows.length === 0) {
    console.log(
      '[Fleet] No rows returned from fleet_available_vehicles. ' +
        'Either no owner has published a vehicle (is_available = true) yet, ' +
        'or RLS is blocking the read for this authenticated user.'
    );
  }

  return rows;
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
    },
  };
}

/** Fetch + map the available fleet in one call. */
export async function getAvailableVehicles(): Promise<Vehicle[]> {
  const rows = await getAvailableFleetVehicles();
  return rows.map(mapFleetVehicleToVehicle);
}

/** Fetch + map a single vehicle by id. Returns null when not found. */
export async function getAvailableVehicleById(
  vehicleId: string
): Promise<Vehicle | null> {
  const row = await getAvailableFleetVehicleById(vehicleId);
  return row ? mapFleetVehicleToVehicle(row) : null;
}
