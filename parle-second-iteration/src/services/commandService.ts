import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/errors.js";
import type { TeslaApi } from "../tesla/teslaApi.js";
import { config } from "../config/env.js";
import { getCachedTelemetry, refreshTelemetry } from "./telemetryService.js";

export type CommandName =
  | "wake"
  | "unlock"
  | "enable-drive"
  | "lock"
  | "honk"
  | "flash"
  | "precondition-on"
  | "send-destination"
  | "ready-vehicle";

function isTransient(reason: string) {
  return reason === "tesla_error";
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function getTeslaStatus(err: ApiError | null): number | null {
  if (!err?.details) return null;
  const v = err.details["teslaStatus"];
  return typeof v === "number" ? v : null;
}


export async function runCommand(params: {
  vehicleId: string;
  teslaVehicleId: string;
  command: CommandName;
  requestId: string;
  triggeredBy: string;
  tesla: TeslaApi;
  body?: unknown;
}) {
  const commandEnum = mapToEnum(params.command);

  const existing = await prisma.commandLog.findUnique({
    where: { vehicleId_requestId_command: { vehicleId: params.vehicleId, requestId: params.requestId, command: commandEnum } }
  }).catch(() => null);

  if (existing) {
    return {
      replay: true,
      result: existing.result,
      errorReason: existing.errorReason,
      teslaStatus: existing.teslaStatus
    };
  }

  if (params.command !== "wake") {
    await ensureAwake(params.vehicleId, params.teslaVehicleId, params.tesla);
  }

  let attempt = 0;
  let lastErr: ApiError | null = null;

  while (attempt <= config.commandRetryCount) {
    try {
      const res = await execute(params);
      await prisma.commandLog.create({
        data: {
          vehicleId: params.vehicleId,
          requestId: params.requestId,
          command: commandEnum,
          triggeredBy: params.triggeredBy,
          result: "SUCCESS",
          teslaStatus: res.teslaStatus
        }
      });
      return { replay: false, result: "SUCCESS", teslaStatus: res.teslaStatus };
    } catch (e: unknown) {
      const err = e instanceof ApiError ? e : new ApiError(502, "unknown", "Command failed");
      lastErr = err;

      const shouldRetry = attempt < config.commandRetryCount && isTransient(err.reason);
      attempt += 1;
      if (!shouldRetry) break;
      await sleep(250 * attempt);
    }
  }

  await prisma.commandLog.create({
    data: {
      vehicleId: params.vehicleId,
      requestId: params.requestId,
      command: commandEnum,
      triggeredBy: params.triggeredBy,
      result: "FAIL",
      errorReason: lastErr?.reason ?? "unknown",
      errorMessage: lastErr?.message ?? "Command failed",
      teslaStatus: getTeslaStatus(lastErr)
    }
  });

  throw lastErr ?? new ApiError(502, "unknown", "Command failed");
}

async function ensureAwake(vehicleId: string, teslaVehicleId: string, tesla: TeslaApi) {
  const cached = await getCachedTelemetry(vehicleId);
  if (cached?.onlineStatus === "AWAKE") return;
  if (cached?.onlineStatus === "OFFLINE") {
    throw new ApiError(409, "offline", "Vehicle appears offline; use key card fallback.");
  }

  await tesla.wake(teslaVehicleId);

  const deadline = Date.now() + config.wakeTimeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const state = await refreshTelemetry(vehicleId, teslaVehicleId, tesla);
    if (state.onlineStatus === "AWAKE") return;
    if (state.onlineStatus === "OFFLINE") throw new ApiError(409, "offline", "Vehicle is offline; use key card fallback.");
    await sleep(config.wakePollIntervalMs);
  }

  throw new ApiError(409, "asleep_timeout", "Vehicle did not wake in time; use key card fallback.");
}

async function execute(params: { teslaVehicleId: string; command: CommandName; tesla: TeslaApi; body?: unknown; }) {
  switch (params.command) {
    case "wake": return params.tesla.wake(params.teslaVehicleId);
    case "unlock": return params.tesla.unlock(params.teslaVehicleId);
    case "enable-drive": return params.tesla.enableDrive(params.teslaVehicleId);
    case "lock": return params.tesla.lock(params.teslaVehicleId);
    case "honk": return params.tesla.honk(params.teslaVehicleId);
    case "flash": return params.tesla.flash(params.teslaVehicleId);
    case "precondition-on": return params.tesla.preconditionOn(params.teslaVehicleId);
    case "send-destination": return params.tesla.sendDestination(params.teslaVehicleId, params.body);
    case "ready-vehicle":
      await params.tesla.wake(params.teslaVehicleId);
      await params.tesla.unlock(params.teslaVehicleId);
      return params.tesla.enableDrive(params.teslaVehicleId);
    default: throw new ApiError(400, "bad_request", "Unknown command");
  }
}

function mapToEnum(cmd: CommandName) {
  switch (cmd) {
    case "wake": return "WAKE";
    case "unlock": return "UNLOCK";
    case "enable-drive": return "ENABLE_DRIVE";
    case "lock": return "LOCK";
    case "honk": return "HONK";
    case "flash": return "FLASH";
    case "precondition-on": return "PRECONDITION_ON";
    case "send-destination": return "SEND_DESTINATION";
    case "ready-vehicle": return "READY_VEHICLE";
  }
}
