import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/errors.js";

export async function getVehicleOrThrow(id: string) {
  const byPk = await prisma.vehicle.findUnique({ where: { id } });
  if (byPk) return byPk;

  const byTeslaId = await prisma.vehicle.findFirst({ where: { teslaVehicleId: id } });
  if (byTeslaId) return byTeslaId;

  throw new ApiError(404, "not_found", `Vehicle not found for id="${id}"`);
}

export async function listVehicles() {
  return prisma.vehicle.findMany({ orderBy: { id: "asc" } });
}