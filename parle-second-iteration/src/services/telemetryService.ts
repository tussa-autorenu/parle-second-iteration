import { createCache } from "../cache/cache.js";
import { config } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import type { TeslaApi, TeslaVehicleState } from "../tesla/teslaApi.js";
import { OnlineStatus, LockStatus } from "@prisma/client";

const cache = createCache();

const keyFor = (vehicleId: string) => `telemetry:${vehicleId}`;

function toOnlineStatus(v: TeslaVehicleState["onlineStatus"]): OnlineStatus {
  const values = Object.values(OnlineStatus) as string[];
  return values.includes(v) ? (v as OnlineStatus) : OnlineStatus.UNKNOWN;
}

function toLockStatus(v: TeslaVehicleState["lockStatus"]): LockStatus {
  const values = Object.values(LockStatus) as string[];
  return values.includes(v) ? (v as LockStatus) : LockStatus.UNKNOWN;
}

export async function getCachedTelemetry(vehicleId: string): Promise<TeslaVehicleState | null> {
  const raw = await cache.get(keyFor(vehicleId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TeslaVehicleState;
  } catch {
    return null;
  }
}

export async function setCachedTelemetry(vehicleId: string, state: TeslaVehicleState) {
  await cache.setex(keyFor(vehicleId), config.cacheTtlSeconds, JSON.stringify(state));
}

export async function refreshTelemetry(vehicleId: string, teslaVehicleId: string, tesla: TeslaApi) {
  const state = await tesla.getState(teslaVehicleId);
  await setCachedTelemetry(vehicleId, state);

  await prisma.telemetrySnapshot.create({
    data: {
      vehicleId,
      batteryPercent: state.batteryPercent ?? undefined,
      onlineStatus: toOnlineStatus(state.onlineStatus),
      lockStatus: toLockStatus(state.lockStatus),
      lastLat: state.lastLat ?? undefined,
      lastLng: state.lastLng ?? undefined,
      lastSeenAt: new Date(state.lastSeenAt),
      source: "tesla"
    }
  });

  return state;
}
