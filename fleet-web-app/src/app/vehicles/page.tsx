import { Nav } from "@/components/Nav";
import { VehicleSelectionScene } from "@/components/scenes/VehicleSelectionScene";

/**
 * Standalone deep-link to the vehicle-selection screen.
 *
 * Skips the orchestrator at `/`, so there are no entry/exit animations —
 * useful when developing or sharing this screen in isolation.
 */
export default function VehiclesPage() {
  return (
    <>
      <Nav currentStep={1} />
      <main className="relative flex flex-1 overflow-hidden">
        <VehicleSelectionScene />
      </main>
    </>
  );
}
