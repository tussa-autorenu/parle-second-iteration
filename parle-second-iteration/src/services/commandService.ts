import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/errors.js";
import type { TeslaApi } from "../tesla/teslaApi.js";
import { config } from "../config/env.js";
import { getCachedTelemetry, refreshTelemetry } from "./telemetryService.js";
import pino from "pino";

const log = pino({ name: "commandService" });

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
  return reason === "tesla_error" || reason === "vehicle_asleep_or_offline";
}

function isVehicleAsleepOrOffline(err: ApiError): boolean {
  return err.reason === "vehicle_asleep_or_offline" || err.reason === "offline";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getTeslaStatus(err: ApiError | null): number | null {
  if (!err?.details) return null;
  const v = err.details["teslaStatus"];
  return typeof v === "number" ? v : null;
}


export async function runCommand(params: {
  vehicleId: string | undefined;
  teslaVehicleId: string;
  command: CommandName;
  requestId: string;
  triggeredBy: string;
  tesla: TeslaApi;
  body?: unknown;
}) {
  const commandEnum = mapToEnum(params.command);
  const hasDbRow = params.vehicleId !== undefined;

  // Idempotency check — only possible when we have a local Vehicle row (FK)
  if (hasDbRow) {
    const existing = await prisma.commandLog.findUnique({
      where: { vehicleId_requestId_command: { vehicleId: params.vehicleId!, requestId: params.requestId, command: commandEnum } }
    }).catch(() => null);

    if (existing) {
      return {
        replay: true,
        result: existing.result,
        errorReason: existing.errorReason,
        teslaStatus: existing.teslaStatus
      };
    }
  }

  // Wake-before-command: full telemetry-polling path when DB row exists,
  // lightweight polling path when it doesn't.
  if (params.command !== "wake") {
    if (hasDbRow) {
      await ensureAwake(params.vehicleId!, params.teslaVehicleId, params.tesla);
    } else {
      await ensureAwakeLightweight(params.teslaVehicleId, params.tesla);
    }
  }

  let attempt = 0;
  let lastErr: ApiError | null = null;

  while (attempt <= config.commandRetryCount) {
    try {
      const res = await execute(params);
      if (hasDbRow) {
        await prisma.commandLog.create({
          data: {
            vehicleId: params.vehicleId!,
            requestId: params.requestId,
            command: commandEnum,
            triggeredBy: params.triggeredBy,
            result: "SUCCESS",
            teslaStatus: res.teslaStatus,
          },
        });
      }

      if (attempt > 0) {
        log.info(
          { command: params.command, teslaVehicleId: params.teslaVehicleId, attempt: attempt + 1 },
          "runCommand: command succeeded after wake-retry",
        );
      }

      return { replay: false, result: "SUCCESS", teslaStatus: res.teslaStatus };
    } catch (e: unknown) {
      const err = e instanceof ApiError ? e : new ApiError(502, "unknown", "Command failed");
      lastErr = err;

      log.warn(
        {
          command: params.command,
          teslaVehicleId: params.teslaVehicleId,
          attempt: attempt + 1,
          errorReason: err.reason,
          errorMessage: err.message,
          teslaStatus: err.details?.["teslaStatus"] ?? null,
          teslaError: err.details?.["teslaError"] ?? null,
          teslaMessage: err.details?.["teslaMessage"] ?? null,
          origin: err.details?.["teslaStatus"] != null ? "tesla_upstream" : "pre_tesla",
        },
        "runCommand: attempt failed",
      );

      const shouldRetry = attempt < config.commandRetryCount && isTransient(err.reason);
      if (!shouldRetry) { attempt += 1; break; }

      // Vehicle fell back asleep between wake and command — re-wake before retry
      if (isVehicleAsleepOrOffline(err)) {
        log.info(
          { command: params.command, teslaVehicleId: params.teslaVehicleId, attempt: attempt + 1 },
          "runCommand: vehicle asleep/offline during command, re-waking before retry",
        );
        try {
          if (hasDbRow) {
            await ensureAwake(params.vehicleId!, params.teslaVehicleId, params.tesla);
          } else {
            await ensureAwakeLightweight(params.teslaVehicleId, params.tesla);
          }
        } catch (wakeErr: unknown) {
          log.warn(
            {
              command: params.command,
              teslaVehicleId: params.teslaVehicleId,
              wakeError: wakeErr instanceof Error ? wakeErr.message : String(wakeErr),
            },
            "runCommand: re-wake failed, aborting retry",
          );
          break;
        }
      }

      attempt += 1;
      await sleep(250 * attempt);
    }
  }

  const finalErr = lastErr ?? new ApiError(502, "unknown", "Command failed");

  log.error(
    {
      command: params.command,
      teslaVehicleId: params.teslaVehicleId,
      triggeredBy: params.triggeredBy,
      totalAttempts: attempt,
      errorReason: finalErr.reason,
      errorMessage: finalErr.message,
      teslaStatus: finalErr.details?.["teslaStatus"] ?? null,
      teslaError: finalErr.details?.["teslaError"] ?? null,
      teslaMessage: finalErr.details?.["teslaMessage"] ?? null,
      origin: finalErr.details?.["teslaStatus"] != null ? "tesla_upstream" : "pre_tesla",
    },
    "runCommand: command failed after all attempts",
  );

  // Don't persist a FAIL CommandLog for vcp_required or auth_expired_or_invalid —
  // the caller may switch to proxy mode or refresh the token and retry with the
  // same requestId. Writing a FAIL here would cause the idempotency check to
  // short-circuit the retry.
  const skipFailPersist = finalErr.reason === "vcp_required" || finalErr.reason === "auth_expired_or_invalid";
  if (hasDbRow && !skipFailPersist) {
    await prisma.commandLog.create({
      data: {
        vehicleId: params.vehicleId!,
        requestId: params.requestId,
        command: commandEnum,
        triggeredBy: params.triggeredBy,
        result: "FAIL",
        errorReason: finalErr.reason,
        errorMessage: finalErr.message,
        teslaStatus: getTeslaStatus(finalErr),
      },
    });
  }

  throw finalErr;
}

async function ensureAwake(vehicleId: string, teslaVehicleId: string, tesla: TeslaApi) {
  const cached = await getCachedTelemetry(vehicleId);
  if (cached?.onlineStatus === "AWAKE") return;

  log.info(
    { vehicleId, teslaVehicleId, cachedStatus: cached?.onlineStatus ?? "no_cache" },
    "ensureAwake: vehicle not confirmed awake, sending wake command",
  );

  await tesla.wake(teslaVehicleId);

  const deadline = Date.now() + config.wakeTimeoutSeconds * 1000;
  while (Date.now() < deadline) {
    await sleep(config.wakePollIntervalMs);
    try {
      const state = await refreshTelemetry(vehicleId, teslaVehicleId, tesla);
      if (state.onlineStatus === "AWAKE") {
        log.info({ vehicleId, teslaVehicleId }, "ensureAwake: vehicle is now awake");
        return;
      }
      log.info(
        { vehicleId, teslaVehicleId, onlineStatus: state.onlineStatus },
        "ensureAwake: vehicle not yet awake, continuing to poll",
      );
    } catch (pollErr: unknown) {
      const apiErr = pollErr instanceof ApiError ? pollErr : null;
      if (apiErr && isVehicleAsleepOrOffline(apiErr)) {
        log.info(
          { vehicleId, teslaVehicleId, errorReason: apiErr.reason },
          "ensureAwake: 408/unavailable during poll (vehicle still waking), continuing",
        );
        continue;
      }
      throw pollErr;
    }
  }

  throw new ApiError(409, "asleep_timeout", "Vehicle did not wake in time; use key card fallback.");
}

async function ensureAwakeLightweight(teslaVehicleId: string, tesla: TeslaApi) {
  log.info({ teslaVehicleId }, "ensureAwakeLightweight: sending wake command");
  await tesla.wake(teslaVehicleId);

  const deadline = Date.now() + config.wakeTimeoutSeconds * 1000;
  while (Date.now() < deadline) {
    await sleep(config.wakePollIntervalMs);
    try {
      const state = await tesla.getState(teslaVehicleId);
      if (state.onlineStatus === "AWAKE") {
        log.info({ teslaVehicleId }, "ensureAwakeLightweight: vehicle is now awake");
        return;
      }
      log.info(
        { teslaVehicleId, onlineStatus: state.onlineStatus },
        "ensureAwakeLightweight: vehicle not yet awake, continuing to poll",
      );
    } catch (pollErr: unknown) {
      const apiErr = pollErr instanceof ApiError ? pollErr : null;
      if (apiErr && isVehicleAsleepOrOffline(apiErr)) {
        log.info(
          { teslaVehicleId, errorReason: apiErr.reason },
          "ensureAwakeLightweight: 408/unavailable during poll (vehicle still waking), continuing",
        );
        continue;
      }
      throw pollErr;
    }
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
