import { ApiClientError, apiRequest, isApiConfigured, randomRequestId } from './apiClient';
import type { VehicleAccessType } from '@/src/data/vehicles';

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

export type CommandResult = {
  ok: boolean;
  message: string;
  /** HTTP status of the backend response (0 = never reached the backend). */
  status?: number;
  /** Backend `reason` code, when the request failed with one. */
  reason?: string | null;
};

/** Optional context for safe diagnostics only — never sent to the backend. */
type CommandContext = { accessType?: VehicleAccessType };

/** UI command → backend route segment + success copy. */
const COMMANDS: Record<VehicleCommand, { path: string; success: string }> = {
  lock: { path: 'lock', success: 'Vehicle locked.' },
  unlock: { path: 'unlock', success: 'Vehicle unlocked.' },
  'ready-drive': { path: 'ready', success: 'Ready to drive.' },
};

/**
 * Map a backend `reason` code to a clear, renter-facing sentence. Falls back to
 * the backend's own message (which is already user-friendly) so we never hide
 * useful detail. Mirrors the fleet web app's `getReadableErrorMessage`.
 */
function readableCommandError(command: VehicleCommand, err: unknown): string {
  const fallback = `Could not ${command.replace('-', ' ')} the vehicle.`;
  if (!(err instanceof ApiClientError)) {
    return err instanceof Error && err.message ? err.message : fallback;
  }
  switch (err.reason) {
    case 'access_denied':
      return (
        err.message ||
        'You don’t have access to this vehicle, or your temporary access has expired.'
      );
    case 'auth_error':
      return 'Your session has expired. Please sign out and sign back in, then try again.';
    case 'tesla_auth_error':
    case 'auth_expired_or_invalid':
      return 'The Tesla connection for this vehicle has expired. The owner needs to reconnect Tesla.';
    case 'tesla_pairing_required':
    case 'vcp_required':
      return 'This vehicle needs to be paired with Parlé on the car’s touchscreen, then try again.';
    case 'mobile_access_disabled':
      return 'Mobile access is turned off for this vehicle. Enable it on the car’s screen and try again.';
    case 'vehicle_asleep_or_offline':
    case 'asleep_timeout':
    case 'offline':
      return 'The vehicle is asleep or offline. Wake it and try again.';
    case 'vehicle_in_service':
      return 'This vehicle is in service mode and can’t accept commands right now.';
    case 'vehicle_not_found':
    case 'not_found':
      return 'We couldn’t find that vehicle.';
    case 'tesla_rate_limited':
    case 'rate_limited':
      return 'Too many requests right now. Please wait a moment and try again.';
    case 'network_error':
      return 'Can’t reach Parlé right now. Check your connection and try again.';
    default:
      return err.message || fallback;
  }
}

/**
 * Send a single command. Returns a `CommandResult` rather than throwing so the
 * UI can show inline success/error and let the user retry. Never logs tokens.
 */
async function sendCommand(
  vehicleId: string | null | undefined,
  command: VehicleCommand,
  context: CommandContext = {}
): Promise<CommandResult> {
  const { path, success } = COMMANDS[command];
  const route = `/vehicles/:id/${path}`;

  // Safe diagnostics — identifier existence + accessType only, never the value.
  console.log('[Command] start', {
    command,
    route,
    accessType: context.accessType ?? '(unknown)',
    sourceVehicleIdExists: !!vehicleId,
  });

  if (!isApiConfigured) {
    return {
      ok: false,
      message: 'Commands are unavailable: the Parlé backend URL is not configured.',
    };
  }
  if (!vehicleId) {
    return {
      ok: false,
      message:
        'This vehicle is missing a connected vehicle identifier, so commands can’t be sent.',
    };
  }

  const requestId = randomRequestId();

  try {
    await apiRequest(`/vehicles/${encodeURIComponent(vehicleId)}/${path}`, {
      method: 'POST',
      body: { requestId },
      requestId,
    });
    console.log('[Command] success', { command, route, status: 200 });
    return { ok: true, message: success, status: 200, reason: null };
  } catch (err) {
    const status = err instanceof ApiClientError ? err.status : undefined;
    const reason = err instanceof ApiClientError ? err.reason : null;
    const message = readableCommandError(command, err);
    console.warn('[Command] failed', {
      command,
      route,
      status: status ?? '(none)',
      reason: reason ?? '(none)',
      message,
    });
    return { ok: false, message, status, reason };
  }
}

export function lockVehicle(
  vehicleId: string | null | undefined,
  context?: CommandContext
): Promise<CommandResult> {
  return sendCommand(vehicleId, 'lock', context);
}

export function unlockVehicle(
  vehicleId: string | null | undefined,
  context?: CommandContext
): Promise<CommandResult> {
  return sendCommand(vehicleId, 'unlock', context);
}

/**
 * "Ready Drive" — enables keyless driving on the vehicle (Tesla's
 * remote-start / enable-drive command flow). Matches the web app's ready-drive
 * behavior.
 */
export function readyDriveVehicle(
  vehicleId: string | null | undefined,
  context?: CommandContext
): Promise<CommandResult> {
  return sendCommand(vehicleId, 'ready-drive', context);
}

/** Live status returned by `GET /vehicles/:id/status`. */
export type VehicleTelemetry = {
  state: string | null;
  batteryLevel: number | null;
  isLocked: boolean | null;
  chargingState: string | null;
  rangeKm: number | null;
};

/**
 * Best-effort telemetry refresh after a command. Returns null (never throws) so
 * a failed status read can't break the control screen — the command result is
 * what matters. Never logs tokens.
 */
export async function fetchVehicleTelemetry(
  vehicleId: string | null | undefined
): Promise<VehicleTelemetry | null> {
  if (!isApiConfigured || !vehicleId) return null;
  try {
    const data = await apiRequest<VehicleTelemetry>(
      `/vehicles/${encodeURIComponent(vehicleId)}/status`,
      { method: 'GET' }
    );
    console.log('[Telemetry] refreshed', {
      route: '/vehicles/:id/status',
      hasBattery: data?.batteryLevel != null,
      hasLock: data?.isLocked != null,
    });
    return data ?? null;
  } catch (err) {
    console.warn(
      '[Telemetry] refresh failed:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
