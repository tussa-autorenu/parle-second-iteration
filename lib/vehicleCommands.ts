import { apiRequest, isApiConfigured, randomRequestId } from './apiClient';

/**
 * Real vehicle commands against the Parlé backend (the same REST service and
 * routes the fleet web app uses). No command is ever mocked — each call hits
 * the backend and surfaces a readable result.
 *
 * Backend command routes (see fleet-web-app/src/lib/api.ts):
 *   • POST /vehicles/{id}/lock
 *   • POST /vehicles/{id}/unlock
 *   • POST /vehicles/{id}/ready    → wake → unlock → enable-drive ("Ready Drive")
 * Each takes a `{ requestId }` body + matching `x-request-id` header for
 * idempotency. Auth (x-parle-api-key + Supabase user id) is attached by
 * lib/apiClient.ts. No secrets are logged.
 */

export type VehicleCommand = 'lock' | 'unlock' | 'ready-drive';

export type CommandResult = { ok: boolean; message: string };

/** UI command → backend route segment + success copy. */
const COMMANDS: Record<VehicleCommand, { path: string; success: string }> = {
  lock: { path: 'lock', success: 'Vehicle locked.' },
  unlock: { path: 'unlock', success: 'Vehicle unlocked.' },
  'ready-drive': { path: 'ready', success: 'Ready to drive.' },
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

  const { path, success } = COMMANDS[command];
  const requestId = randomRequestId();

  try {
    await apiRequest(`/vehicles/${encodeURIComponent(vehicleId)}/${path}`, {
      method: 'POST',
      body: { requestId },
      requestId,
    });
    console.log(`[Command] ${command} succeeded for vehicle ${vehicleId}.`);
    return { ok: true, message: success };
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
