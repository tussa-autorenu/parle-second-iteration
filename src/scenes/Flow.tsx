import { useEffect, useReducer } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useAvailableFleet } from '@/lib/useAvailableFleet';
import { flowReducer, INITIAL_FLOW } from '@/src/lib/flow';
import { LoadingScene } from './LoadingScene';
import { RideStartedScene } from './RideStartedScene';
import { VehicleDetailScene } from './VehicleDetailScene';
import { VehicleListScene } from './VehicleListScene';

/** DEV-only flow log — safe (ids + access type only, never secrets/tokens). */
function flowLog(event: string, data?: Record<string, unknown>): void {
  if (__DEV__) console.log(`[Flow] ${event}`, data ?? '');
}

/**
 * The Flow orchestrator owns the step-machine state for the renter MVP and
 * decides which scene is currently mounted. Each scene receives a small set
 * of event callbacks; it never knows about the other scenes.
 *
 * Vehicle data is loaded once here from Supabase (`fleet_available_vehicles`,
 * public + owner rows) and shared access, then handed down to the scenes so
 * the list, detail, and ride screens all render the same live row the renter
 * tapped.
 */
export function Flow() {
  const [state, dispatch] = useReducer(flowReducer, INITIAL_FLOW);
  const { signOut } = useAuth();
  const {
    vehicles,
    publicCount,
    ownerCount,
    sharedCount,
    status,
    error,
    isRefreshing,
    refresh,
    redeem,
  } = useAvailableFleet();

  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === state.selectedVehicleId) ?? null;

  // DEV: log which scene is mounted (route) on every transition.
  useEffect(() => {
    flowLog('selected scene', { scene: state.scene });
  }, [state.scene]);

  // Same live-store lookup for every access type: whichever card was tapped,
  // we render the SAME detail + ride scenes with the SAME live Vehicle object.
  const handleSelectVehicle = (id: string) => {
    const tapped = vehicles.find((vehicle) => vehicle.id === id) ?? null;
    flowLog('vehicle tapped', {
      vehicleId: id,
      accessType: tapped?.accessType ?? '(unknown)',
      sourceVehicleIdExists: !!tapped?.sourceVehicleId,
      commandVehicleIdExists: !!tapped?.commandVehicleId,
      route: 'vehicleDetail',
    });
    dispatch({ type: 'VEHICLE_SELECTED', id });
  };

  const handleStartRide = () => {
    flowLog('Start Ride requested', {
      vehicleId: selectedVehicle?.id ?? '(none)',
      accessType: selectedVehicle?.accessType ?? '(unknown)',
      sourceVehicleIdExists: !!selectedVehicle?.sourceVehicleId,
    });
    dispatch({ type: 'RIDE_STARTED' });
    flowLog('Start Ride result', { route: 'rideStarted', started: true });
  };

  const handleEndRide = () => {
    flowLog('End Ride result', { route: 'vehicleList' });
    dispatch({ type: 'RIDE_ENDED' });
  };

  const handleBackToList = () => {
    flowLog('X/back on detail', { route: 'vehicleList' });
    dispatch({ type: 'BACK_TO_LIST' });
  };

  return (
    <View className="flex-1 bg-white">
      {state.scene === 'loading' && (
        <LoadingScene
          onComplete={() => dispatch({ type: 'LOADING_COMPLETE' })}
        />
      )}

      {state.scene === 'vehicleList' && (
        <VehicleListScene
          vehicles={vehicles}
          publicCount={publicCount}
          ownerCount={ownerCount}
          sharedCount={sharedCount}
          status={status}
          error={error}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
          onRedeemCode={redeem}
          onSelectVehicle={handleSelectVehicle}
          onLogoTap={() => dispatch({ type: 'LOGO_TAPPED' })}
          onSignOut={signOut}
        />
      )}

      {state.scene === 'vehicleDetail' && (
        <VehicleDetailScene
          vehicle={selectedVehicle}
          onBack={handleBackToList}
          onStartRide={handleStartRide}
        />
      )}

      {state.scene === 'rideStarted' && (
        <RideStartedScene
          vehicle={selectedVehicle}
          rideStartedAt={state.rideStartedAt}
          onEndRide={handleEndRide}
        />
      )}
    </View>
  );
}
