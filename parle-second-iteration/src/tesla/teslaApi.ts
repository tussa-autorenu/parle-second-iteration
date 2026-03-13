import type { AxiosInstance } from "axios";
import { ApiError } from "../utils/errors.js";

export type TeslaOnline = "AWAKE" | "ASLEEP" | "OFFLINE" | "UNKNOWN";
export type TeslaLock = "LOCKED" | "UNLOCKED" | "UNKNOWN";

export interface TeslaVehicleState {
  batteryPercent: number | null;
  onlineStatus: TeslaOnline;
  lockStatus: TeslaLock;
  lastLat: number | null;
  lastLng: number | null;
  lastSeenAt: string;
}

type JsonObject = Record<string, unknown>;

function toLowerString(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function mapOnline(raw: unknown): TeslaOnline {
  const s = toLowerString(raw);
  if (["awake", "online"].includes(s)) return "AWAKE";
  if (["asleep", "sleeping"].includes(s)) return "ASLEEP";
  if (["offline"].includes(s)) return "OFFLINE";
  return "UNKNOWN";
}

function mapLock(raw: unknown): TeslaLock {
  const s = toLowerString(raw);
  if (["locked", "true", "1", "yes"].includes(s)) return "LOCKED";
  if (["unlocked", "false", "0", "no"].includes(s)) return "UNLOCKED";
  return "UNKNOWN";
}

function axiosStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { response?: { status?: unknown } };
  const st = e.response?.status;
  return typeof st === "number" ? st : null;
}

function axiosBody(err: unknown): unknown {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { response?: { data?: unknown } };
  return e.response?.data ?? null;
}

/** Structured upstream error pulled from a Tesla Fleet API response. */
export interface TeslaUpstreamError {
  teslaStatus: number | null;
  teslaError: string | null;
  teslaMessage: string | null;
}

const REDACTED_KEYS = new Set([
  "access_token", "refresh_token", "token", "authorization", "secret",
]);

/**
 * Parse a Tesla Fleet API error response into structured fields.
 * Handles the common shapes:
 *   { error: "vehicle_unavailable", error_description: "Vehicle is not online." }
 *   { response: { result: false, reason: "could_not_wake_buses" } }
 *   { error: "mobile_access_disabled" }
 */
function extractTeslaError(err: unknown): TeslaUpstreamError {
  const status = axiosStatus(err);
  const body = axiosBody(err);

  let error: string | null = null;
  let message: string | null = null;

  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;

    error = typeof b["error"] === "string" ? b["error"] : null;
    message = typeof b["error_description"] === "string"
      ? b["error_description"]
      : typeof b["message"] === "string"
        ? b["message"]
        : null;

    if (!error && b["response"] && typeof b["response"] === "object") {
      const resp = b["response"] as Record<string, unknown>;
      error = typeof resp["reason"] === "string" ? resp["reason"] : error;
      message = typeof resp["message"] === "string" ? resp["message"] : message;
    }
  } else if (typeof body === "string" && body.length > 0 && body.length < 300) {
    message = body;
  }

  return { teslaStatus: status, teslaError: error, teslaMessage: message };
}

/** Build a human-readable suffix like `: vehicle_unavailable — Vehicle is not online.` */
function describeUpstream(u: TeslaUpstreamError): string {
  if (u.teslaError && u.teslaMessage) return `: ${u.teslaError} — ${u.teslaMessage}`;
  if (u.teslaError) return `: ${u.teslaError}`;
  if (u.teslaMessage) return `: ${u.teslaMessage}`;
  return "";
}

/**
 * Return a copy of the upstream error details that is safe to include in
 * API responses and logs (no tokens / secrets).
 */
function safeDetails(u: TeslaUpstreamError, extras?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...u, ...extras };
  for (const key of Object.keys(out)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) out[key] = "[REDACTED]";
  }
  return out;
}

export class TeslaApi {
  constructor(private client: AxiosInstance) {}

  async getState(teslaVehicleId: string): Promise<TeslaVehicleState> {
    try {
      const r = await this.client.get(`/fleet/vehicles/${encodeURIComponent(teslaVehicleId)}/status`);
      const data = (r.data ?? {}) as JsonObject;

      const vehicleState = (data["vehicle_state"] ?? data["vehicleState"] ?? data) as JsonObject;

      const battery = vehicleState["battery_level"] ?? vehicleState["batteryPercent"] ?? null;
      const batteryPercent = typeof battery === "number" ? battery : null;

      const rawOnline =
        vehicleState["state"] ??
        vehicleState["onlineStatus"] ??
        vehicleState["online_status"] ??
        vehicleState["vehicle_state"] ??
        null;

      const rawLock =
        vehicleState["locked"] ??
        vehicleState["lockStatus"] ??
        vehicleState["lock_status"] ??
        null;

      const lat = vehicleState["latitude"] ?? vehicleState["lastLat"] ?? null;
      const lng = vehicleState["longitude"] ?? vehicleState["lastLng"] ?? null;

      return {
        batteryPercent,
        onlineStatus: mapOnline(rawOnline),
        lockStatus: mapLock(rawLock),
        lastLat: typeof lat === "number" ? lat : null,
        lastLng: typeof lng === "number" ? lng : null,
        lastSeenAt: new Date().toISOString(),
      };
    } catch (e: unknown) {
      const u = extractTeslaError(e);
      if (u.teslaStatus === 401 || u.teslaStatus === 403) {
        throw new ApiError(502, "auth_error", `Tesla auth failed for getState${describeUpstream(u)}`, safeDetails(u));
      }
      throw new ApiError(502, "tesla_error", `Tesla status fetch failed${describeUpstream(u)}`, safeDetails(u));
    }
  }

  async wake(id: string) { return this.command(id, "wake"); }
  async unlock(id: string) { return this.command(id, "unlock"); }
  async enableDrive(id: string) { return this.command(id, "enable-drive"); }
  async lock(id: string) { return this.command(id, "lock"); }
  async honk(id: string) { return this.command(id, "honk"); }
  async flash(id: string) { return this.command(id, "flash"); }
  async preconditionOn(id: string) { return this.command(id, "precondition-on"); }
  async sendDestination(id: string, body: unknown) { return this.command(id, "send-destination", body); }

  private async command(id: string, cmd: string, body?: unknown) {
    try {
      const r = await this.client.post(
        `/fleet/vehicles/${encodeURIComponent(id)}/commands/${cmd}`,
        body ?? {},
      );
      return { teslaStatus: r.status, data: (r.data ?? {}) as JsonObject };
    } catch (e: unknown) {
      const u = extractTeslaError(e);
      const detail = describeUpstream(u);
      const extras = { command: cmd, vehicleId: id };

      if (u.teslaStatus === 401 || u.teslaStatus === 403) {
        throw new ApiError(502, "auth_error",
          `Tesla rejected auth for ${cmd}${detail}`, safeDetails(u, extras));
      }
      if (u.teslaStatus === 412) {
        throw new ApiError(502, "tesla_pairing_required",
          `Vehicle must be paired with this application before ${cmd} can run${detail}`, safeDetails(u, extras));
      }
      if (u.teslaStatus === 429) {
        throw new ApiError(502, "tesla_rate_limited",
          `Tesla rate-limited ${cmd}; try again in a few minutes`, safeDetails(u, extras));
      }
      if (u.teslaStatus !== null && [408, 500, 502, 503, 504].includes(u.teslaStatus)) {
        throw new ApiError(502, "tesla_error",
          `Tesla upstream error during ${cmd} (HTTP ${u.teslaStatus})${detail}`, safeDetails(u, extras));
      }
      throw new ApiError(502, "command_rejected",
        `Tesla rejected ${cmd}${detail || " (no upstream detail)"}`, safeDetails(u, extras));
    }
  }
}
