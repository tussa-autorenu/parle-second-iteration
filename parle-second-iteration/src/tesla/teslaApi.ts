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

export class TeslaApi {
  constructor(private client: AxiosInstance) {}

  async getState(teslaVehicleId: string): Promise<TeslaVehicleState> {
    try {
      const r = await this.client.get(`/fleet/vehicles/${encodeURIComponent(teslaVehicleId)}/status`);
      const data = (r.data ?? {}) as JsonObject;

      // Support multiple response shapes (real Tesla vs mock)
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
        lastSeenAt: new Date().toISOString()
      };
    } catch (e: unknown) {
      const st = axiosStatus(e);
      if (st === 401 || st === 403) throw new ApiError(502, "auth_error", "Tesla auth failed", { teslaStatus: st });
      throw new ApiError(502, "tesla_error", "Tesla status fetch failed", { teslaStatus: st });
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
        body ?? {}
      );
      return { teslaStatus: r.status, data: (r.data ?? {}) as JsonObject };
    } catch (e: unknown) {
      const st = axiosStatus(e);
      if (st === 401 || st === 403) throw new ApiError(502, "auth_error", "Tesla auth failed", { teslaStatus: st });
      if (st !== null && [408, 429, 500, 502, 503, 504].includes(st)) {
        throw new ApiError(502, "tesla_error", "Transient Tesla error", { teslaStatus: st });
      }
      throw new ApiError(502, "command_rejected", "Tesla command rejected", {
        teslaStatus: st,
        body: axiosBody(e)
      });
    }
  }
}
