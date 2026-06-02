/**
 * Backend API client for the Parle fleet web app.
 *
 * All requests target the URL in `NEXT_PUBLIC_API_BASE_URL`. Tesla OAuth
 * secrets and any other credentials live on the backend — the frontend only
 * needs the public base URL and a session cookie issued by our own API.
 *
 * Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local`, e.g.
 *   NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
 */

/**
 * Local fallback vehicle thumbnails. Used when the backend does not provide
 * an `image` for a vehicle so the UI degrades to the existing Figma artwork.
 */
const FALLBACK_THUMBNAILS = [
  "/assets/vehicle_white_thumbnail@2x.png",
  "/assets/vehicle_red_thumbnail@2x.png",
  "/assets/vehicle_black_thumbnail@2x.png",
] as const;

/**
 * Vehicle shape the UI expects. We normalize whatever the backend returns
 * into this shape so the existing card components don't need to change.
 */
export type ApiVehicle = {
  id: string;
  vin: string;
  year: string;
  model: string;
  /** Optional human-friendly nickname coming from the backend. */
  name?: string;
  /** Resolved thumbnail URL — either backend-provided or a local fallback. */
  image: string;
  /** Optional fleet stats — populated by the active-fleet endpoint when available. */
  trips?: number;
  earnings?: number;
};

/** Shape we accept from the backend before normalization. Permissive on purpose. */
type RawVehicle = {
  id?: string | number;
  vin?: string;
  year?: string | number;
  model?: string;
  name?: string;
  image?: string | null;
  thumbnail?: string | null;
  trips?: number;
  earnings?: number;
};

function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return base.replace(/\/+$/, "");
}

/** Stable hash so the same vehicle id always picks the same fallback. */
function pickFallbackThumbnail(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return FALLBACK_THUMBNAILS[Math.abs(h) % FALLBACK_THUMBNAILS.length];
}

function normalizeVehicle(raw: RawVehicle, index: number): ApiVehicle {
  const id = String(raw.id ?? raw.vin ?? `vehicle-${index}`);
  const vin = String(raw.vin ?? "");
  const year = raw.year != null ? String(raw.year) : "";
  const model = String(raw.model ?? raw.name ?? "");
  const name = raw.name != null ? String(raw.name) : undefined;
  const backendImage =
    typeof raw.image === "string" && raw.image.length > 0
      ? raw.image
      : typeof raw.thumbnail === "string" && raw.thumbnail.length > 0
      ? raw.thumbnail
      : null;
  return {
    id,
    vin,
    year,
    model,
    name,
    image: backendImage ?? pickFallbackThumbnail(id),
    trips: typeof raw.trips === "number" ? raw.trips : undefined,
    earnings: typeof raw.earnings === "number" ? raw.earnings : undefined,
  };
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    // Session is cookie-based after Tesla OAuth completes on the backend.
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError(
      `Request to ${path} failed (${res.status} ${res.statusText})`,
      res.status,
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Extract a vehicle list whether the backend returns an array or `{ vehicles: [...] }`. */
function unwrapVehicleList(
  data: RawVehicle[] | { vehicles?: RawVehicle[] } | null | undefined,
): RawVehicle[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.vehicles)) return data.vehicles;
  return [];
}

/**
 * Build the backend Tesla OAuth start URL for the web flow. Appends
 * `returnTo=web` so the backend redirects back to the web app (not the mobile
 * deep link) once the OAuth handshake completes.
 */
export function getOAuthStartUrl(userId?: string): string {
  const params = new URLSearchParams({ returnTo: "web" });
  if (userId) params.set("userId", userId);
  return `${getApiBaseUrl()}/auth/tesla/start?${params.toString()}`;
}

/**
 * Redirect the browser to the backend's Tesla OAuth start endpoint. The
 * backend handles the OAuth handshake and redirects back to the frontend
 * once a session is established.
 */
export function startTeslaOAuth(userId?: string): void {
  if (typeof window === "undefined") return;
  window.location.assign(getOAuthStartUrl(userId));
}

/** GET /vehicles?scope=onboarding — vehicles available to add to the fleet. */
export async function getOnboardingVehicles(): Promise<ApiVehicle[]> {
  const data = await apiFetch<RawVehicle[] | { vehicles?: RawVehicle[] }>(
    "/vehicles?scope=onboarding",
  );
  return unwrapVehicleList(data).map((raw, i) => normalizeVehicle(raw, i));
}

/** POST /onboarding/third-party-access/confirm — confirm the user has enabled Parle in the car. */
export async function confirmThirdPartyAccess(
  vehicleIds: string[],
): Promise<void> {
  await apiFetch<void>("/onboarding/third-party-access/confirm", {
    method: "POST",
    body: JSON.stringify({ vehicleIds }),
  });
}

/** POST /onboarding/activate — finalize the fleet so it goes live. */
export async function activateFleet(vehicleIds: string[]): Promise<void> {
  await apiFetch<void>("/onboarding/activate", {
    method: "POST",
    body: JSON.stringify({ vehicleIds }),
  });
}

/** GET /vehicles?status=active — vehicles that belong to the user's live fleet. */
export async function getActiveFleetVehicles(): Promise<ApiVehicle[]> {
  const data = await apiFetch<RawVehicle[] | { vehicles?: RawVehicle[] }>(
    "/vehicles?status=active",
  );
  return unwrapVehicleList(data).map((raw, i) => normalizeVehicle(raw, i));
}

export { ApiError };
