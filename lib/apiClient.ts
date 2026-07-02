import { supabase } from './supabase';

/**
 * Thin authenticated client for the Parlé backend (the same REST service the
 * web app talks to). Shared by lib/shareAccess.ts and lib/vehicleCommands.ts
 * so share-code redemption and vehicle commands use one consistent transport:
 *
 *   • base URL     → EXPO_PUBLIC_API_BASE_URL
 *   • auth         → Supabase session access token (Bearer) + user id header
 *   • envelope     → { ok: true, data } | { ok: false, error }
 *
 * No tokens or secrets are ever logged here.
 */

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');

export const isApiConfigured = API_BASE.length > 0;

/** Backend response envelope. Plain payloads (no envelope) are also accepted. */
type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error?: { reason?: string; message?: string; details?: unknown } };

export async function getAuthContext(): Promise<{ token: string | null; userId: string | null }> {
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

export async function apiRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> {
  if (!isApiConfigured) {
    throw new Error(
      'Parlé backend is unavailable: EXPO_PUBLIC_API_BASE_URL is not set. Add it to .env and restart with `npx expo start -c`.'
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

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return (payload as unknown as T) ?? (undefined as T);
}
