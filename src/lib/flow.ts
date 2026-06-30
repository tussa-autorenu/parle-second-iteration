/**
 * Step-machine for the Parle renter flow.
 *
 * The whole app is a linear-but-resettable sequence of 4 scenes:
 *
 *   loading  →  vehicleList  →  vehicleDetail  →  rideStarted  →  back to vehicleList
 *
 * Tapping the Parle logo from any scene that renders it resets the entire
 * flow back through the loading screen.
 *
 * State + events live here as plain TypeScript so the reducer is easy to test
 * and the scene components can stay dumb (just dispatching events).
 */

export type SceneId =
  | "loading"
  | "vehicleList"
  | "vehicleDetail"
  | "rideStarted";

export type FlowState = {
  scene: SceneId;
  /**
   * The currently selected vehicle's id. Only meaningful in the
   * `vehicleDetail` and `rideStarted` scenes — survives the detail → ride
   * transition so the ride screen knows which car is unlocked.
   */
  selectedVehicleId: string | null;
};

export const INITIAL_FLOW: FlowState = {
  scene: "loading",
  selectedVehicleId: null,
};

export type FlowEvent =
  /** Splash animation finished → show the vehicle list. */
  | { type: "LOADING_COMPLETE" }
  /** User tapped a vehicle card on the list. */
  | { type: "VEHICLE_SELECTED"; id: string }
  /** Back button on the detail screen. */
  | { type: "BACK_TO_LIST" }
  /** User tapped "Unlock & Start Ride" on the detail screen. */
  | { type: "RIDE_STARTED" }
  /** User tapped "End Ride" on the ride screen. */
  | { type: "RIDE_ENDED" }
  /** User tapped the Parle logo — full reset, replay loading. */
  | { type: "LOGO_TAPPED" };

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "LOADING_COMPLETE":
      return { ...state, scene: "vehicleList" };
    case "VEHICLE_SELECTED":
      return { scene: "vehicleDetail", selectedVehicleId: event.id };
    case "BACK_TO_LIST":
      return { scene: "vehicleList", selectedVehicleId: null };
    case "RIDE_STARTED":
      return { ...state, scene: "rideStarted" };
    case "RIDE_ENDED":
      return { scene: "vehicleList", selectedVehicleId: null };
    case "LOGO_TAPPED":
      // Full reset — replay through loading. Per Donovan's spec: any logo
      // instance resets the flow.
      return INITIAL_FLOW;
    default:
      return state;
  }
}
