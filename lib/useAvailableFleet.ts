import { useCallback, useEffect, useState } from 'react';

import type { Vehicle } from '@/src/data/vehicles';
import { getAvailableVehicles } from './fleetAvailableVehicles';

export type FleetStatus = 'loading' | 'ready' | 'error';

export type AvailableFleet = {
  vehicles: Vehicle[];
  status: FleetStatus;
  error: string | null;
  isRefreshing: boolean;
  refresh: () => void;
};

/**
 * Loads the available fleet from Supabase and exposes loading / error state
 * plus pull-to-refresh. Used by the renter home (vehicle list) scene.
 */
export function useAvailableFleet(): AvailableFleet {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [status, setStatus] = useState<FleetStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setStatus('loading');
    if (mode === 'refresh') setIsRefreshing(true);
    setError(null);

    try {
      const rows = await getAvailableVehicles();
      setVehicles(rows);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load vehicles.');
      setStatus('error');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const refresh = useCallback(() => {
    void load('refresh');
  }, [load]);

  return { vehicles, status, error, isRefreshing, refresh };
}
