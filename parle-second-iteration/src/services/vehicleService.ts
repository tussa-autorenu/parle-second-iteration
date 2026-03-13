import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/errors.js";
import type { TeslaVehicleSummary } from "./teslaAccountService.js";

/**
 * Try to find a local Vehicle row by PK or by teslaVehicleId.
 * Returns null when no row matches — callers decide whether that is fatal.
 */
export async function resolveVehicle(id: string) {
  const byPk = await prisma.vehicle.findUnique({ where: { id } });
  if (byPk) return byPk;

  const byTeslaId = await prisma.vehicle.findFirst({ where: { teslaVehicleId: id } });
  return byTeslaId ?? null;
}

/**
 * Throwing variant — used by routes that require a local DB row
 * (e.g. GET /vehicles/:id which needs stored telemetry).
 */
export async function getVehicleOrThrow(id: string) {
  const v = await resolveVehicle(id);
  if (!v) throw new ApiError(404, "not_found", `Vehicle not found for id="${id}"`);
  return v;
}

export async function listVehicles() {
  return prisma.vehicle.findMany({ orderBy: { id: "asc" } });
}

/**
 * Upsert Tesla Fleet vehicles into the local Vehicle table.
 * Matches on teslaVehicleId so manually-seeded rows (e.g. "derby-01")
 * are updated in place rather than duplicated.
 * New vehicles get id = teslaVehicleId so the frontend's Tesla ID
 * resolves by PK on future command calls.
 * Returns { total, created, updated } for logging.
 */
export async function syncVehiclesToDb(vehicles: TeslaVehicleSummary[]) {
  let created = 0;
  let updated = 0;

  for (const v of vehicles) {
    const existing = await prisma.vehicle.findFirst({
      where: { teslaVehicleId: v.id },
    });

    if (existing) {
      await prisma.vehicle.update({
        where: { id: existing.id },
        data: {
          vin: v.vin,
          friendlyName: v.displayName,
        },
      });
      updated++;
    } else {
      await prisma.vehicle.create({
        data: {
          id: v.id,
          teslaVehicleId: v.id,
          vin: v.vin,
          friendlyName: v.displayName,
        },
      });
      created++;
    }
  }

  return { total: vehicles.length, created, updated };
}
