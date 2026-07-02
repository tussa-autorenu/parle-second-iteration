import { apiRequest, isApiConfigured } from './apiClient';

/**
 * Real vehicle commands against the Parlé backend (same REST service the web
 * app uses). No command is ever mocked — each call hits the backend and
 * surfaces a readable result.
 *
 * Command routes mirror the web app's structure:
 *   • POST /vehicles/{id}/commands/lock
 *   • POST /vehicles/{id}/commands/unlock
 *   • POST /vehicles/{id}/commands/ready-drive   (enable keyless drive)
 *
 * The backend resolves `{id}` (VIN / source vehicle id) to the Tesla vehicle
 * and forwards the corresponding Tesla Fleet command. Auth (Supabase session
 * token + user id) is attached by lib/apiClient.ts. No secrets are logged.
 */

export type VehicleCommand = 'lock' | 'unlock' | 'ready-drive';

export type CommandResult = { ok: boolean; message: string };

const SUCCESS_COPY: Record<VehicleCommand, string> = {
  lock: 'Vehicle locked.',
  unlock: 'Vehicle unlocked.',
  'ready-drive': 'Ready to drive.',
};

/**
 * Send a single command. Returns a `CommandResult` rather than throwing so the
 * UI can show inline success/error and let the user retry. Never logs tokens.
 */
async function sendCommand(
  vehicleId: string | null | undefined,
  command: VehicleCommand
): Promise<CommandResult> {
  if (!isApiConfigured) {
    return {
      ok: false,
      message: 'Commands are unavailable: the Parlé backend URL is not configured.',
    };
  }
  if (!vehicleId) {
    return { ok: false, message: 'This vehicle can’t receive commands right now.' };
  }

  try {
    await apiRequest(`/vehicles/${encodeURIComponent(vehicleId)}/commands/${command}`, {
      method: 'POST',
      body: { vehicleId, command },
    });
    console.log(`[Command] ${command} succeeded for vehicle ${vehicleId}.`);
    return { ok: true, message: SUCCESS_COPY[command] };
  } catch (err) {
    const message = err instanceof Error ? err.message : `Could not ${command} the vehicle.`;
    console.warn(`[Command] ${command} failed:`, message);
    return { ok: false, message };
  }
}

export function lockVehicle(vehicleId: string | null | undefined): Promise<CommandResult> {
  return sendCommand(vehicleId, 'lock');
}

export function unlockVehicle(vehicleId: string | null | undefined): Promise<CommandResult> {
  return sendCommand(vehicleId, 'unlock');
}

/**
 * "Ready Drive" — enables keyless driving on the vehicle (Tesla's
 * remote-start / enable-drive command flow). Matches the web app's ready-drive
 * behavior.
 */
export function readyDriveVehicle(vehicleId: string | null | undefined): Promise<CommandResult> {
  return sendCommand(vehicleId, 'ready-drive');
}
