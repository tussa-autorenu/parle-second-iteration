import { useCallback, useEffect, useState } from 'react';

import type { Vehicle } from '@/src/data/vehicles';
import { getAvailableVehicles } from './fleetAvailableVehicles';
import { getTemporarySharedVehicles, redeemShareCode } from './shareAccess';

export type FleetStatus = 'loading' | 'ready' | 'error';

export type RedeemResult = { ok: boolean; message: string };

export type AvailableFleet = {
  /** Merged list: shared-access vehicles first, then the public fleet. */
  vehicles: Vehicle[];
  publicCount: number;
  sharedCount: number;
  status: FleetStatus;
  error: string | null;
  isRefreshing: boolean;
  refresh: () => void;
  /** Redeem a share code, then reload shared access. */
  redeem: (code: string) => Promise<RedeemResult>;
};

/**
 * Loads the renter home feed:
 *   • Public fleet from Supabase (`fleet_available_vehicles`, is_available = true)
 *   • Vehicles shared with the renter via redeemed share codes (backend)
 *
 * The public fleet is the primary source — a failure there surfaces an error
 * state. Shared access is best-effort: if the backend is unconfigured or down,
 * we log and still show the public fleet. No mock/fallback vehicles ever.
 */
export function useAvailableFleet(): AvailableFleet {
  const [publicVehicles, setPublicVehicles] = useState<Vehicle[]>([]);
  const [sharedVehicles, setSharedVehicles] = useState<Vehicle[]>([]);
  const [status, setStatus] = useState<FleetStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setStatus('loading');
    if (mode === 'refresh') setIsRefreshing(true);
    setError(null);

    // Shared access never blocks the public fleet (best-effort, never throws).
    const sharedPromise = getTemporarySharedVehicles();

    let publicCount = 0;
    try {
      const pub = await getAvailableVehicles();
      publicCount = pub.length;
      setPublicVehicles(pub);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load vehicles.');
      setStatus('error');
    }

    const shared = await sharedPromise;
    setSharedVehicles(shared);

    // Safe count logging (no row contents / secrets).
    console.log(`[Fleet] fleet_available_vehicles count: ${publicCount}`);
    console.log(`[Fleet] shared access count: ${shared.length}`);

    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const refresh = useCallback(() => {
    void load('refresh');
  }, [load]);

  const redeem = useCallback(
    async (code: string): Promise<RedeemResult> => {
      try {
        const { message } = await redeemShareCode(code);
        const shared = await getTemporarySharedVehicles();
        setSharedVehicles(shared);
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

  const vehicles = [...sharedVehicles, ...publicVehicles];

  return {
    vehicles,
    publicCount: publicVehicles.length,
    sharedCount: sharedVehicles.length,
    status,
    error,
    isRefreshing,
    refresh,
    redeem,
  };
}
