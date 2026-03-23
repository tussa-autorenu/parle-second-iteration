import type { AxiosInstance } from "axios";
import pino from "pino";
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
  chargingState: string | null;
  rangeKm: number | null;
  insideTemp: number | null;
  outsideTemp: number | null;
}

export type CommandMode = "direct_fleet_rest" | "command_protocol_proxy";

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

const cmdLog = pino({ name: "teslaApi" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  if (status === null && !error) {
    const e = err as { code?: string; message?: string };
    if (typeof e.code === "string") error = e.code;
    if (!message && typeof e.message === "string") message = e.message;
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

function safeDetails(u: TeslaUpstreamError, extras?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...u, ...extras };
  for (const key of Object.keys(out)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) out[key] = "[REDACTED]";
  }
  return out;
}

/**
 * Combine teslaError + teslaMessage into a single lowercase string for pattern matching.
 */
function combinedErrorText(u: TeslaUpstreamError): string {
  return `${u.teslaError ?? ""} ${u.teslaMessage ?? ""}`.toLowerCase();
}

/**
 * Map our internal command names to the Tesla Fleet API command names.
 * Wake is handled separately (different URL pattern).
 */
const TESLA_CMD: Record<string, string> = {
  "unlock":         "door_unlock",
  "lock":           "door_lock",
  "enable-drive":   "remote_start_drive",
  "honk":           "honk_horn",
  "flash":          "flash_lights",
  "precondition-on":"auto_conditioning_start",
  "send-destination":"share",
};

export class TeslaApi {
  readonly fleetClient: AxiosInstance;
  readonly proxyClient: AxiosInstance | null;
  readonly proxyConfigured: boolean;
  readonly vin: string | null;

  commandMode: CommandMode;
  private _accessToken: string | null;

  /**
   * @param fleetClient  Axios instance for Fleet API (data queries + direct REST commands).
   * @param proxyClient  Optional Axios instance pointed at the official tesla-http-proxy.
   * @param vin          Vehicle VIN — required for proxy mode (proxy uses VIN-based paths).
   * @param accessToken  Current OAuth access token — stored so it can be injected per-request
   *                     and survive token refreshes independent of Axios header internals.
   */
  constructor(
    fleetClient: AxiosInstance,
    proxyClient?: AxiosInstance | null,
    vin?: string | null,
    accessToken?: string | null,
  ) {
    this.fleetClient = fleetClient;
    this.proxyClient = proxyClient ?? null;
    this.proxyConfigured = this.proxyClient != null;
    this.vin = vin ?? null;
    this._accessToken = accessToken ?? null;
    this.commandMode = "direct_fleet_rest";
  }

  /**
   * Update the stored access token so every subsequent request uses it.
   * Also attempts to patch Axios default headers as a belt-and-suspenders measure,
   * but the per-request injection in command()/getState() is the authoritative source.
   */
  refreshAuthHeader(newToken: string): void {
    this._accessToken = newToken;
    const value = `Bearer ${newToken}`;
    for (const client of [this.fleetClient, this.proxyClient]) {
      if (!client) continue;
      try { client.defaults.headers.common["Authorization"] = value; } catch { /* ignore */ }
      try { client.defaults.headers["Authorization"] = value; } catch { /* ignore */ }
    }
  }

  /** Build per-request auth headers from the stored token. */
  private authHeaders(): Record<string, string> | undefined {
    return this._accessToken ? { Authorization: `Bearer ${this._accessToken}` } : undefined;
  }

  async getState(teslaVehicleId: string): Promise<TeslaVehicleState> {
    const path = `/api/1/vehicles/${encodeURIComponent(teslaVehicleId)}/vehicle_data`;
    try {
      const r = await this.fleetClient.get(path, { headers: this.authHeaders() });
      const raw = (r.data ?? {}) as JsonObject;

      const response = (raw["response"] ?? raw) as JsonObject;
      const vehicleState = (response["vehicle_state"] ?? response["vehicleState"] ?? {}) as JsonObject;
      const chargeState = (response["charge_state"] ?? response["chargeState"] ?? {}) as JsonObject;
      const driveState = (response["drive_state"] ?? response["driveState"] ?? {}) as JsonObject;
      const climateState = (response["climate_state"] ?? response["climateState"] ?? {}) as JsonObject;

      const battery = chargeState["battery_level"] ?? vehicleState["batteryPercent"] ?? null;
      const batteryPercent = typeof battery === "number" ? battery : null;

      const rawOnline =
        response["state"] ??
        vehicleState["onlineStatus"] ??
        vehicleState["online_status"] ??
        null;

      const rawLock =
        vehicleState["locked"] ??
        vehicleState["lockStatus"] ??
        vehicleState["lock_status"] ??
        null;

      const lat = driveState["latitude"] ?? vehicleState["lastLat"] ?? null;
      const lng = driveState["longitude"] ?? vehicleState["lastLng"] ?? null;

      const rawChargingState = chargeState["charging_state"] ?? chargeState["chargingState"] ?? null;
      const rawRangeMiles = chargeState["battery_range"] ?? chargeState["ideal_battery_range"] ?? null;
      const insideTemp = climateState["inside_temp"] ?? climateState["insideTemp"] ?? null;
      const outsideTemp = climateState["outside_temp"] ?? climateState["outsideTemp"] ?? null;

      return {
        batteryPercent,
        onlineStatus: mapOnline(rawOnline),
        lockStatus: mapLock(rawLock),
        lastLat: typeof lat === "number" ? lat : null,
        lastLng: typeof lng === "number" ? lng : null,
        lastSeenAt: new Date().toISOString(),
        chargingState: typeof rawChargingState === "string" ? rawChargingState : null,
        rangeKm: typeof rawRangeMiles === "number" ? Math.round(rawRangeMiles * 1.60934) : null,
        insideTemp: typeof insideTemp === "number" ? insideTemp : null,
        outsideTemp: typeof outsideTemp === "number" ? outsideTemp : null,
      };
    } catch (e: unknown) {
      const u = extractTeslaError(e);
      const detail = describeUpstream(u);
      const extras = { path };

      if (u.teslaStatus === null) {
        throw new ApiError(502, "generic_tesla_upstream_error",
          `Tesla Fleet API unreachable for vehicle_data${detail || ": network error or timeout"}`,
          safeDetails(u, extras));
      }
      if (u.teslaStatus === 401 || u.teslaStatus === 403) {
        throw new ApiError(502, "auth_expired_or_invalid",
          `Tesla auth failed for vehicle_data${detail}`, safeDetails(u, extras));
      }
      if (u.teslaStatus === 404) {
        throw new ApiError(502, "vehicle_not_found",
          `Tesla returned 404 for vehicle_data${detail}`, safeDetails(u, extras));
      }
      if (u.teslaStatus === 408) {
        throw new ApiError(502, "vehicle_asleep_or_offline",
          `Vehicle is asleep or unavailable${detail}`, safeDetails(u, extras));
      }
      if (u.teslaStatus === 412) {
        throw new ApiError(502, "tesla_pairing_required",
          `Vehicle must be paired with this application${detail}`, safeDetails(u, extras));
      }
      if (u.teslaStatus === 429) {
        throw new ApiError(502, "tesla_rate_limited",
          `Tesla rate-limited vehicle_data; try again in a few minutes`, safeDetails(u, extras));
      }
      if (u.teslaStatus >= 500) {
        throw new ApiError(502, "generic_tesla_upstream_error",
          `Tesla Fleet API error (HTTP ${u.teslaStatus})${detail}`, safeDetails(u, extras));
      }
      throw new ApiError(502, "tesla_error",
        `Tesla status fetch failed (HTTP ${u.teslaStatus})${detail}`, safeDetails(u, extras));
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
    // wake_up is a Fleet API endpoint, not a VCP command — always use fleet client.
    // Only actual vehicle commands (lock, unlock, drive, etc.) go through the proxy.
    const isWake = cmd === "wake";
    const useProxy = !isWake && this.commandMode === "command_protocol_proxy" && this.proxyConfigured;
    const activeClient = useProxy ? this.proxyClient! : this.fleetClient;
    const vehicleTag = (useProxy && this.vin) ? this.vin : id;
    const via: CommandMode = useProxy ? "command_protocol_proxy" : "direct_fleet_rest";

    const reqHeaders = this.authHeaders();
    const authHeaderPresent = !!reqHeaders?.["Authorization"];

    const path = isWake
      ? `/api/1/vehicles/${encodeURIComponent(vehicleTag)}/wake_up`
      : `/api/1/vehicles/${encodeURIComponent(vehicleTag)}/command/${TESLA_CMD[cmd] ?? cmd}`;

    // Retry once on 5xx for direct REST commands (transient Tesla server errors).
    let retried = false;
    let lastRawError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await activeClient.post(path, body ?? {}, { headers: reqHeaders });
        if (retried) {
          cmdLog.info(
            { command: cmd, vehicleId: id, vin: this.vin, mode: via, teslaStatus: r.status },
            "tesla command succeeded on retry after 5xx",
          );
        }
        return { teslaStatus: r.status, data: (r.data ?? {}) as JsonObject, via, authHeaderPresent };
      } catch (err: unknown) {
        lastRawError = err;

        if (attempt === 0 && via === "direct_fleet_rest") {
          const probe = extractTeslaError(err);
          if (probe.teslaStatus !== null && probe.teslaStatus >= 500) {
            retried = true;
            cmdLog.warn(
              {
                command: cmd, vehicleId: id, vin: this.vin, mode: via,
                teslaStatus: probe.teslaStatus, teslaError: probe.teslaError,
              },
              "tesla 5xx on direct REST command, retrying once",
            );
            await sleep(1000);
            continue;
          }
        }
        break;
      }
    }

    // ── Classify the final error ──
    const u = extractTeslaError(lastRawError);
    const detail = describeUpstream(u);
    const combined = combinedErrorText(u);
    const proxyBaseUrl = useProxy ? activeClient.defaults.baseURL ?? null : null;
    const extras = {
      command: cmd, vehicleId: id, vin: this.vin, path, method: "POST",
      via, authHeaderPresent, retried,
      proxyBaseUrl,
      tokenLength: this._accessToken?.length ?? 0,
    };

    if (retried) {
      cmdLog.error(
        {
          command: cmd, vehicleId: id, vin: this.vin, mode: via,
          teslaStatus: u.teslaStatus, teslaError: u.teslaError, retried,
        },
        "tesla command failed after 5xx retry",
      );
    }

    if (u.teslaStatus === null) {
      throw new ApiError(502, "generic_tesla_upstream_error",
        `Tesla unreachable for ${cmd}${detail || ": network error or timeout"}`, safeDetails(u, extras));
    }

    // VCP detection — Tesla returns this on 403 or 422 depending on firmware.
    // Check before other 4xx handling so it's never misclassified.
    if (
      combined.includes("vehicle command protocol") ||
      combined.includes("unsigned command") ||
      combined.includes("unsigned_cmds_hardcoded")
    ) {
      throw new ApiError(502, "vcp_required",
        `Vehicle requires Tesla Vehicle Command Protocol for ${cmd}${detail}`, safeDetails(u, extras));
    }

    // Vehicle in service — Tesla refuses commands while the vehicle is serviced.
    if (combined.includes("currently in service") || combined.includes("vehicle is in service")) {
      throw new ApiError(502, "vehicle_in_service",
        `Vehicle is currently in service and cannot accept ${cmd}${detail}`, safeDetails(u, extras));
    }

    if (u.teslaStatus === 401 || u.teslaStatus === 403) {
      if (combined.includes("mobile_access_disabled") || combined.includes("mobile access")) {
        throw new ApiError(502, "mobile_access_disabled",
          `Mobile access is disabled on this vehicle${detail}`, safeDetails(u, extras));
      }
      const authMsg = useProxy
        ? `Proxy at ${proxyBaseUrl} rejected auth for ${cmd}${detail}. ` +
          "Verify: (1) proxy is the official tesla-http-proxy, (2) private key is configured, " +
          "(3) OAuth token has vehicle_cmds scope."
        : `Tesla rejected auth for ${cmd}${detail}`;
      throw new ApiError(502, "auth_expired_or_invalid", authMsg, safeDetails(u, extras));
    }

    if (u.teslaStatus === 404) {
      throw new ApiError(502, "vehicle_not_found",
        `Tesla returned 404 for ${cmd} — vehicle or endpoint not found${detail}`, safeDetails(u, extras));
    }
    if (u.teslaStatus === 408 || combined.includes("vehicle_unavailable") || combined.includes("not online")) {
      throw new ApiError(502, "vehicle_asleep_or_offline",
        `Vehicle is asleep or offline for ${cmd}${detail}`, safeDetails(u, extras));
    }
    if (u.teslaStatus === 412) {
      throw new ApiError(502, "tesla_pairing_required",
        `Vehicle must be paired with this application before ${cmd} can run${detail}`, safeDetails(u, extras));
    }
    if (u.teslaStatus === 429) {
      throw new ApiError(502, "tesla_rate_limited",
        `Tesla rate-limited ${cmd}; try again in a few minutes`, safeDetails(u, extras));
    }
    if ([500, 502, 503, 504].includes(u.teslaStatus)) {
      throw new ApiError(502, "generic_tesla_upstream_error",
        `Tesla upstream error during ${cmd} (HTTP ${u.teslaStatus})${detail}`, safeDetails(u, extras));
    }
    throw new ApiError(502, "command_rejected",
      `Tesla rejected ${cmd}${detail || " (no upstream detail)"}`, safeDetails(u, extras));
  }
}
