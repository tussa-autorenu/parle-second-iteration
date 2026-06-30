import type { Vehicle } from '@/src/data/vehicles';
import { supabase } from './supabase';

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

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');

export const isShareApiConfigured = API_BASE.length > 0;

/** Backend response envelope: { ok: true, data } | { ok: false, error }. */
type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error?: { reason?: string; message?: string; details?: unknown } };

/** A temporary access record as returned by the backend (best-effort shape). */
type TemporaryAccessRecord = {
  id?: string;
  vehicleId?: string;
  vin?: string | null;
  friendlyName?: string | null;
  displayName?: string | null;
  model?: string | null;
  color?: string | null;
  ownerUserId?: string;
  expiresAt?: string | null;
};

type ShareAccessResponse =
  | TemporaryAccessRecord[]
  | { asGuest?: TemporaryAccessRecord[]; asOwner?: TemporaryAccessRecord[] };

async function getAuthContext(): Promise<{ token: string | null; userId: string | null }> {
  const { data } = await supabase.auth.getSession();
  return {
    token: data.session?.access_token ?? null,
    userId: data.session?.user?.id ?? null,
  };
}

/** Build auth headers without leaking secrets into logs. */
function buildHeaders(token: string | null, userId: string | null, hasBody: boolean) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (hasBody) headers['Content-Type'] = 'application/json';
  // Supabase session token if the backend gates on it.
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // The signed-in Supabase user id the backend uses to scope access.
  if (userId) headers['x-triggered-by'] = userId;
  return headers;
}

async function request<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> {
  if (!isShareApiConfigured) {
    throw new Error(
      'Share codes are unavailable: EXPO_PUBLIC_API_BASE_URL is not set. Add it to .env and restart with `npx expo start -c`.'
    );
  }

  const { method = 'GET', body } = options;
  const { token, userId } = await getAuthContext();

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: buildHeaders(token, userId, body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Can’t reach Parlé right now. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;

  let payload: Envelope<T> | null = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text) as Envelope<T>;
    } catch {
      payload = null;
    }
  }

  if (!res.ok || (payload && payload.ok === false)) {
    const message =
      (payload && payload.ok === false && payload.error?.message) ||
      `Request to ${path} failed (${res.status}).`;
    throw new Error(message);
  }

  if (payload && 'data' in payload) return payload.data;
  return (payload as unknown as T) ?? (undefined as T);
}

/** Map a backend access record into the renter `Vehicle` display shape. */
function mapAccessToVehicle(record: TemporaryAccessRecord, index: number): Vehicle {
  const color = (record.color ?? '').toLowerCase();
  const mappedColor =
    color.includes('red') ? 'Red' : color.includes('black') ? 'Black' : 'White';

  const title =
    record.displayName?.trim() ||
    record.friendlyName?.trim() ||
    record.model?.trim() ||
    (record.vin ? `Tesla ${record.vin.slice(-4)}` : 'Shared Tesla');

  return {
    id: `shared:${record.vehicleId ?? record.id ?? index}`,
    source: 'shared',
    sharedExpiresAt: record.expiresAt ?? null,
    model: title,
    color: mappedColor,
    // Backend share access doesn't currently carry these specs; leave null
    // rather than inventing values. The card/detail null-guard handles it.
    distanceMi: null,
    batteryPct: null,
    hourlyRate: null,
    rangeMi: null,
    seats: 5,
    isLocked: null,
    features: [],
    owner: { name: 'Shared with you', role: 'Direct access' },
  };
}

function extractGuestRecords(data: ShareAccessResponse | null | undefined): TemporaryAccessRecord[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.asGuest)) return data.asGuest;
  return [];
}

/**
 * Redeem a share code. Returns a human-readable confirmation message. Throws a
 * readable Error on failure (caller shows it inline).
 */
export async function redeemShareCode(code: string): Promise<{ message: string }> {
  const clean = code.trim();
  if (!clean) throw new Error('Enter a share code first.');

  await request('/share/redeem', { method: 'POST', body: { code: clean } });
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
    const data = await request<ShareAccessResponse>('/share/access');
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
