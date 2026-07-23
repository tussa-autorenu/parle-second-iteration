import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from './auth';
import type { Vehicle } from '@/src/data/vehicles';
import { getAvailableVehicles } from './fleetAvailableVehicles';
import { getTemporarySharedVehicles, redeemShareCode } from './shareAccess';

export type FleetStatus = 'loading' | 'ready' | 'error';

export type RedeemResult = { ok: boolean; message: string };

export type AvailableFleet = {
  /** Merged list: shared-access vehicles first, then the Supabase fleet feed. */
  vehicles: Vehicle[];
  publicCount: number;
  ownerCount: number;
  sharedCount: number;
  status: FleetStatus;
  error: string | null;
  isRefreshing: boolean;
  refresh: () => void;
  /** Redeem a share code, then reload shared access. */
  redeem: (code: string) => Promise<RedeemResult>;
};

/** Deduplicate scene vehicles by commandVehicleId, falling back to row id. */
function dedupeVehicles(vehicles: Vehicle[]): Vehicle[] {
  const seen = new Set<string>();
  const merged: Vehicle[] = [];

  for (const vehicle of vehicles) {
    const key = vehicle.commandVehicleId?.trim() || vehicle.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(vehicle);
  }

  return merged;
}

/**
 * Loads the renter home feed:
 *   • Public + owner fleet rows from Supabase (`fleet_available_vehicles`)
 *   • Vehicles shared with the renter via redeemed share codes (backend)
 *
 * Shared access is best-effort: if the backend is unconfigured or down,
 * we log and still show the Supabase fleet. No mock/fallback vehicles ever.
 */
export function useAvailableFleet(): AvailableFleet {
  const { userId, isInitialized } = useAuth();
  const [fleetVehicles, setFleetVehicles] = useState<Vehicle[]>([]);
  const [publicCount, setPublicCount] = useState(0);
  const [ownerCount, setOwnerCount] = useState(0);
  const [sharedVehicles, setSharedVehicles] = useState<Vehicle[]>([]);
  const [status, setStatus] = useState<FleetStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setStatus('loading');
    if (mode === 'refresh') setIsRefreshing(true);
    setError(null);

    const sharedPromise = getTemporarySharedVehicles();

    let nextFleetVehicles: Vehicle[] = [];
    let nextPublicCount = 0;
    let nextOwnerCount = 0;
    let loadFailed = false;

    try {
      const fleet = await getAvailableVehicles();
      nextFleetVehicles = fleet.vehicles;
      nextPublicCount = fleet.publicCount;
      nextOwnerCount = fleet.ownerCount;
      setFleetVehicles(fleet.vehicles);
      setPublicCount(fleet.publicCount);
      setOwnerCount(fleet.ownerCount);
      setStatus('ready');
    } catch (err) {
      loadFailed = true;
      setError(err instanceof Error ? err.message : 'Could not load vehicles.');
      setStatus('error');
    }

    const shared = await sharedPromise;
    setSharedVehicles(shared);

    const merged = dedupeVehicles([
      ...shared,
      ...(loadFailed ? [] : nextFleetVehicles),
    ]);
    const accessBreakdown = merged.reduce(
      (acc, v) => {
        acc[v.accessType] += 1;
        return acc;
      },
      { owner: 0, shared: 0, public: 0 }
    );

    console.log(`[Fleet] owned vehicle count: ${nextOwnerCount}`);
    console.log(`[Fleet] public vehicle count: ${nextPublicCount}`);
    console.log(`[Fleet] shared vehicle count: ${shared.length}`);
    console.log(`[Fleet] final merged vehicle count: ${merged.length}`);
    console.log('[Fleet] final access-type breakdown:', accessBreakdown);

    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    void load('initial');
  }, [load, isInitialized, userId]);

  const refresh = useCallback(() => {
    void load('refresh');
  }, [load]);

  const redeem = useCallback(
    async (code: string): Promise<RedeemResult> => {
      try {
        const { message } = await redeemShareCode(code);

        const [shared, fleet] = await Promise.all([
          getTemporarySharedVehicles(),
          getAvailableVehicles().catch((err) => {
            console.warn(
              '[Fleet] fleet refresh after redeem failed:',
              err instanceof Error ? err.message : err
            );
            return null;
          }),
        ]);

        if (fleet) {
          setFleetVehicles(fleet.vehicles);
          setPublicCount(fleet.publicCount);
          setOwnerCount(fleet.ownerCount);
        }
        setSharedVehicles(shared);

        if (shared.length === 0) {
          return {
            ok: true,
            message:
              'Code redeemed, but no shared vehicle is active yet. Pull down to refresh in a moment.',
          };
        }
        return { ok: true, message };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not redeem that code.',
        };
      }
    },
    []
  );

  const vehicles = useMemo(
    () => dedupeVehicles([...sharedVehicles, ...fleetVehicles]),
    [sharedVehicles, fleetVehicles]
  );

  return {
    vehicles,
    publicCount,
    ownerCount,
    sharedCount: sharedVehicles.length,
    status,
    error,
    isRefreshing,
    refresh,
    redeem,
  };
}
