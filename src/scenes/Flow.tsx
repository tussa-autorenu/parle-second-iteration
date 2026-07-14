import { useReducer } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useAvailableFleet } from '@/lib/useAvailableFleet';
import { flowReducer, INITIAL_FLOW } from '@/src/lib/flow';
import { LoadingScene } from './LoadingScene';
import { RideStartedScene } from './RideStartedScene';
import { VehicleDetailScene } from './VehicleDetailScene';
import { VehicleListScene } from './VehicleListScene';

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
          onSelectVehicle={(id) => dispatch({ type: 'VEHICLE_SELECTED', id })}
          onLogoTap={() => dispatch({ type: 'LOGO_TAPPED' })}
          onSignOut={signOut}
        />
      )}

      {state.scene === 'vehicleDetail' && (
        <VehicleDetailScene
          vehicle={selectedVehicle}
          onBack={() => dispatch({ type: 'BACK_TO_LIST' })}
          onStartRide={() => dispatch({ type: 'RIDE_STARTED' })}
        />
      )}

      {state.scene === 'rideStarted' && (
        <RideStartedScene
          vehicle={selectedVehicle}
          rideStartedAt={state.rideStartedAt}
          onEndRide={() => dispatch({ type: 'RIDE_ENDED' })}
        />
      )}
    </View>
  );
}
