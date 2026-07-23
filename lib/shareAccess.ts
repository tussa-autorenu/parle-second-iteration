import {
  deriveDurationMinutes,
  type Vehicle,
  type VehicleColor,
} from '@/src/data/vehicles';
import { apiRequest, isApiConfigured } from './apiClient';

/**
 * Share-code access for the renter app.
 *
 * Public fleet vehicles come from Supabase (`fleet_available_vehicles`). A
 * renter can ALSO unlock a specific private/direct vehicle by redeeming a
 * share code, which is handled by the Parlé backend (NOT Supabase):
 *
 *   • POST /share/redeem   → redeem a code into time-boxed access
 *   • GET  /share/access   → vehicles currently shared with this renter
 *
 * We never fabricate vehicles here. If the backend isn't configured or returns
 * no usable display data, the renter simply sees no shared vehicles (and we
 * log the response shape safely so the wiring is ready when the backend does
 * return rows).
 */

export const isShareApiConfigured = isApiConfigured;

/** A temporary access record as returned by the backend (best-effort shape). */
type TemporaryAccessRecord = {
  id?: string;
  vehicleId?: string;
  vin?: string | null;
  friendlyName?: string | null;
  displayName?: string | null;
  model?: string | null;
  color?: string | null;
  batteryLevel?: number | null;
  rangeMiles?: number | null;
  isLocked?: boolean | null;
  ownerUserId?: string;
  // Host / owner details (any of these names the backend may use).
  ownerName?: string | null;
  hostName?: string | null;
  ownerEmail?: string | null;
  hostEmail?: string | null;
  // Access window (any of these names the backend may use).
  startsAt?: string | null;
  grantedAt?: string | null;
  expiresAt?: string | null;
  durationMinutes?: number | null;
  shareCode?: string | null;
  code?: string | null;
};

type ShareAccessResponse =
  | TemporaryAccessRecord[]
  | { asGuest?: TemporaryAccessRecord[]; asOwner?: TemporaryAccessRecord[] };

/* ------------------------------------------------------------------ */
/* Share-code formatting.                                             */
/* ------------------------------------------------------------------ */

/**
 * Normalize renter input into the web app's canonical share-code format
 * `XXX-XXX` (3 alphanumerics, a dash, 3 alphanumerics):
 *   • uppercases everything
 *   • strips spaces and stray separators
 *   • re-inserts the middle dash
 *   • caps at 6 significant characters
 *
 * "xehd3r" → "XEH-D3R", "XEH-D3R" → "XEH-D3R", " xeh d3r " → "XEH-D3R".
 */
export function formatShareCode(input: string): string {
  const alnum = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (alnum.length <= 3) return alnum;
  return `${alnum.slice(0, 3)}-${alnum.slice(3)}`;
}

/**
 * Default guest access length (minutes) sent with a redeem. Must be one of the
 * backend's allowed durations: [1, 15, 60, 1440, 2880, 10080]. One hour is a
 * sensible renter default; wire this to a picker later if the UI adds one.
 */
export const DEFAULT_ACCESS_DURATION_MINUTES = 60;

/** Turn a raw backend/transport error into a clear redeem message. */
function redeemErrorMessage(raw: string): string {
  const isGeneric = !raw.trim() || /failed \(\d+\)/i.test(raw);
  if (isGeneric) {
    return 'Share code could not be redeemed. Check that the code is active and not expired.';
  }
  return `Share code could not be redeemed: ${raw}`;
}

/** Map a backend access record into the renter `Vehicle` display shape. */
function mapAccessToVehicle(record: TemporaryAccessRecord, index: number): Vehicle {
  const color = (record.color ?? '').toLowerCase();
  const mappedColor: VehicleColor =
    color.includes('red') ? 'Red' : color.includes('black') ? 'Black' : 'White';

  const title =
    record.displayName?.trim() ||
    record.friendlyName?.trim() ||
    record.model?.trim() ||
    (record.vin ? `Tesla ${record.vin.slice(-4)}` : 'Shared Tesla');

  const startsAt = record.startsAt ?? record.grantedAt ?? null;
  const expiresAt = record.expiresAt ?? null;
  const durationMinutes =
    record.durationMinutes ?? deriveDurationMinutes(startsAt, expiresAt);

  const ownerName = (record.ownerName ?? record.hostName ?? '').trim();
  const ownerEmail = (record.ownerEmail ?? record.hostEmail ?? '').trim() || null;
  const shareCode = record.shareCode ?? record.code ?? null;

  // Backend identifier the command endpoints expect.
  const commandVehicleId = record.vehicleId ?? record.vin ?? record.id ?? null;

  return {
    id: `shared:${record.vehicleId ?? record.id ?? index}`,
    source: 'shared',
    accessType: 'shared',
    isSharedAccess: true,
    commandVehicleId,
    access: { startsAt, expiresAt, durationMinutes, shareCode },
    model: title,
    color: mappedColor,
    // Share access carries no proximity; leave null rather than inventing.
    distanceMi: null,
    batteryPct: record.batteryLevel == null ? null : Math.round(Number(record.batteryLevel)),
    // Never show pricing for shared vehicles.
    hourlyRate: null,
    rangeMi: record.rangeMiles == null ? null : Math.round(Number(record.rangeMiles)),
    seats: 5,
    isLocked: record.isLocked ?? null,
    features: [],
    owner: {
      name: ownerName,
      role: 'Host',
      email: ownerEmail,
    },
  };
}

function extractGuestRecords(data: ShareAccessResponse | null | undefined): TemporaryAccessRecord[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.asGuest)) return data.asGuest;
  return [];
}

/**
 * Redeem a share code against the real backend. Returns a human-readable
 * confirmation message. Throws a readable Error on failure (caller shows it
 * inline). The code is normalized to `XXX-XXX` before sending.
 */
export async function redeemShareCode(code: string): Promise<{ message: string }> {
  const clean = formatShareCode(code);
  if (!clean) throw new Error('Enter a share code first.');

  // Backend `/share/redeem` requires BOTH the code and a durationMinutes drawn
  // from its allowed set. The Supabase user id (x-triggered-by) + API key are
  // attached by lib/apiClient.ts.
  const body = { code: clean, durationMinutes: DEFAULT_ACCESS_DURATION_MINUTES };

  // Safe debug — path + normalized code + body keys only (no secrets/tokens).
  console.log('[Share] redeem →', {
    path: '/share/redeem',
    code: clean,
    bodyKeys: Object.keys(body),
  });

  try {
    await apiRequest('/share/redeem', { method: 'POST', body });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    throw new Error(redeemErrorMessage(raw));
  }

  return { message: 'Share code redeemed. Your vehicle will appear below.' };
}

/**
 * Fetch vehicles currently shared with the signed-in renter. Returns [] when
 * the backend isn't configured or the user has no shared access, and never
 * throws for the "no shared access" case so it can't break the home screen.
 */
export async function getTemporarySharedVehicles(): Promise<Vehicle[]> {
  if (!isShareApiConfigured) {
    console.log('[Share] EXPO_PUBLIC_API_BASE_URL not set — skipping shared-vehicle load.');
    return [];
  }

  try {
    const data = await apiRequest<ShareAccessResponse>('/share/access');
    const records = extractGuestRecords(data);

    // Safe shape logging — keys + counts only, never tokens/secrets.
    console.log('[Share] /share/access response shape:', {
      isArray: Array.isArray(data),
      keys: data && !Array.isArray(data) ? Object.keys(data) : undefined,
      guestRecordCount: records.length,
    });

    return records.map(mapAccessToVehicle);
  } catch (err) {
    // Shared access is optional — log and fall back to none so the public
    // fleet still renders.
    console.warn(
      '[Share] Could not load shared vehicles:',
      err instanceof Error ? err.message : err
    );
    return [];
  }
}
