/**
 * Backend API client for the Parle fleet web app.
 *
 * Every request goes to the backend at `NEXT_PUBLIC_API_BASE_URL` — never to
 * a frontend route and never to a localhost fallback. Protected endpoints
 * require two headers:
 *
 *   x-parle-api-key:  NEXT_PUBLIC_PARLE_API_KEY (frontend-safe external key)
 *   x-triggered-by:   the Supabase user id (identifies the user)
 *
 * Tesla secrets and the Supabase service-role key never appear here.
 */

export class ApiError extends Error {
  status: number;
  reason: string;
  constructor(message: string, status: number, reason = "unknown") {
    super(message);
    this.status = status;
    this.reason = reason;
    this.name = "ApiError";
  }
}

/** Backend success/failure envelope: { ok: true, data } | { ok: false, error }. */
type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error?: { reason?: string; message?: string } };

function getApiBaseUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();
  if (!base) {
    throw new ApiError(
      "Backend URL is not configured. Set NEXT_PUBLIC_API_BASE_URL.",
      0,
      "not_configured",
    );
  }
  return base.replace(/\/+$/, "");
}

function getApiKey(): string {
  return (process.env.NEXT_PUBLIC_PARLE_API_KEY ?? "").trim();
}

/**
 * Centralized request helper. Prefixes `path` with the backend base URL,
 * attaches auth headers, unwraps the `{ ok, data }` envelope, and converts
 * failures into readable ApiError messages.
 */
async function apiFetch<T>(
  path: string,
  opts: { userId?: string; method?: string; body?: unknown } = {},
): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-parle-api-key": getApiKey(),
  };
  if (opts.userId) headers["x-triggered-by"] = opts.userId;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(
      "Could not reach the Parle backend. Check your connection and try again.",
      0,
      "network_error",
    );
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await res.json()) as Envelope<T>;
  } catch {
    // Non-JSON body — fall through to the status-based error below.
  }

  if (!res.ok || !payload || payload.ok !== true) {
    const reason =
      (payload && payload.ok === false && payload.error?.reason) || "unknown";
    const message =
      (payload && payload.ok === false && payload.error?.message) ||
      `Request failed (${res.status} ${res.statusText})`;
    throw new ApiError(message, res.status, reason);
  }

  return payload.data;
}

// ── Tesla OAuth ─────────────────────────────────────────────

/**
 * Backend Tesla OAuth start URL for the web flow. Always absolute
 * (`${API_BASE}/auth/tesla/start?...`), with `returnTo=web` so the backend
 * redirects back to this web app instead of the mobile deep link.
 */
export function getOAuthStartUrl(userId: string): string {
  const params = new URLSearchParams({ userId, returnTo: "web" });
  return `${getApiBaseUrl()}/auth/tesla/start?${params.toString()}`;
}

/** Full-page redirect to the backend OAuth start endpoint. */
export function startTeslaOAuth(userId: string): void {
  if (typeof window === "undefined") return;
  window.location.assign(getOAuthStartUrl(userId));
}

// ── Tesla link status ───────────────────────────────────────

export type TeslaStatus = {
  linked: boolean;
  vehicleCount: number;
  hasVehicles: boolean;
  tokenExpired?: boolean;
  linkedAt?: string;
  updatedAt?: string;
};

/** GET /auth/tesla/status — is this user's Tesla account linked? */
export function getTeslaStatus(userId: string): Promise<TeslaStatus> {
  return apiFetch<TeslaStatus>("/auth/tesla/status", { userId });
}

/** POST /auth/tesla/disconnect — remove the user's stored Tesla tokens. */
export function disconnectTesla(
  userId: string,
): Promise<{ disconnected: boolean }> {
  return apiFetch<{ disconnected: boolean }>("/auth/tesla/disconnect", {
    userId,
    method: "POST",
  });
}

// ── Vehicles ────────────────────────────────────────────────

/** Local thumbnails so cards always have an image. */
const FALLBACK_THUMBNAILS = [
  "/assets/vehicle_white_thumbnail@2x.png",
  "/assets/vehicle_red_thumbnail@2x.png",
  "/assets/vehicle_black_thumbnail@2x.png",
] as const;

export type Vehicle = {
  id: string;
  vin: string;
  name: string;
  state: string;
  image: string;
};

/** Raw backend vehicle shape (GET /vehicles). Permissive on purpose. */
type RawVehicle = {
  id?: string | number;
  teslaVehicleId?: string | number;
  vin?: string;
  friendlyName?: string | null;
  state?: string | null;
};

/** Stable hash so the same vehicle id always picks the same thumbnail. */
function pickThumbnail(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return FALLBACK_THUMBNAILS[Math.abs(h) % FALLBACK_THUMBNAILS.length];
}

function normalizeVehicle(raw: RawVehicle, index: number): Vehicle {
  const id = String(raw.id ?? raw.teslaVehicleId ?? raw.vin ?? `vehicle-${index}`);
  return {
    id,
    vin: String(raw.vin ?? ""),
    name: raw.friendlyName?.trim() || `Tesla ${String(raw.vin ?? "").slice(-6)}`,
    state: String(raw.state ?? "unknown"),
    image: pickThumbnail(id),
  };
}

/** GET /vehicles — the user's Tesla vehicles (empty when not linked). */
export async function getVehicles(userId: string): Promise<Vehicle[]> {
  const data = await apiFetch<RawVehicle[]>("/vehicles", { userId });
  return (Array.isArray(data) ? data : []).map(normalizeVehicle);
}

// ── Vehicle live status ─────────────────────────────────────

/**
 * Live status for a single vehicle. Mirrors GET /vehicles/:id/status. Every
 * field is nullable because Tesla may not report it while the car is asleep.
 */
export type VehicleStatus = {
  state: string;
  batteryLevel: number | null;
  isLocked: boolean | null;
  chargingState: string | null;
  rangeKm: number | null;
  insideTemp: number | null;
  outsideTemp: number | null;
  lastSeenAt: string | null;
  lastLat: number | null;
  lastLng: number | null;
};

/** GET /vehicles/:id/status — live Tesla state for one vehicle. */
export function getVehicleStatus(
  userId: string,
  vehicleId: string,
): Promise<VehicleStatus> {
  return apiFetch<VehicleStatus>(
    `/vehicles/${encodeURIComponent(vehicleId)}/status`,
    { userId },
  );
}

// ── Commands ────────────────────────────────────────────────

/** Backend command response. Extra fields vary per command/route. */
export type CommandResult = {
  command?: string;
  requestId?: string;
  vehicleId?: string;
  [key: string]: unknown;
};

function runVehicleCommand(
  userId: string,
  vehicleId: string,
  command: "wake" | "lock" | "unlock" | "enable-drive" | "ready",
): Promise<CommandResult> {
  return apiFetch<CommandResult>(
    `/vehicles/${encodeURIComponent(vehicleId)}/${command}`,
    { userId, method: "POST", body: {} },
  );
}

/** POST /vehicles/:id/wake */
export function wakeVehicle(userId: string, vehicleId: string) {
  return runVehicleCommand(userId, vehicleId, "wake");
}

/** POST /vehicles/:id/lock */
export function lockVehicle(userId: string, vehicleId: string) {
  return runVehicleCommand(userId, vehicleId, "lock");
}

/** POST /vehicles/:id/unlock */
export function unlockVehicle(userId: string, vehicleId: string) {
  return runVehicleCommand(userId, vehicleId, "unlock");
}

/** POST /vehicles/:id/enable-drive */
export function enableDriveVehicle(userId: string, vehicleId: string) {
  return runVehicleCommand(userId, vehicleId, "enable-drive");
}

/** POST /vehicles/:id/ready — wake → unlock → enable-drive shortcut. */
export function readyVehicle(userId: string, vehicleId: string) {
  return runVehicleCommand(userId, vehicleId, "ready");
}

// ── Command logs ────────────────────────────────────────────

/** A row from GET /logs/commands (backend CommandLog). */
export type CommandLogEntry = {
  id: string;
  requestId: string;
  vehicleId: string;
  command: string;
  triggeredBy: string;
  result: string;
  errorReason: string | null;
  errorMessage: string | null;
  teslaStatus: number | null;
  createdAt: string;
};

/**
 * GET /logs/commands?vehicleId=&triggeredBy=&limit= — recent command history
 * for one vehicle. Returns newest-first (backend orders by createdAt desc).
 */
export async function getVehicleLogs(
  userId: string,
  vehicleId: string,
  limit = 10,
): Promise<CommandLogEntry[]> {
  const params = new URLSearchParams({
    vehicleId,
    triggeredBy: userId,
    limit: String(limit),
  });
  const data = await apiFetch<{ logs?: CommandLogEntry[] }>(
    `/logs/commands?${params.toString()}`,
    { userId },
  );
  return Array.isArray(data.logs) ? data.logs : [];
}

// NOTE: There is no backend access-scheduling endpoint yet. Scheduled access
// windows are stored locally per user+vehicle (see src/lib/schedules.ts) and
// are clearly labelled as local drafts in the UI. When a real endpoint exists,
// add e.g. saveAccessSchedule(userId, vehicleId, payload) here using apiFetch.
