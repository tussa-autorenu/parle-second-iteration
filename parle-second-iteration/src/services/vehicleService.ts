import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/errors.js";

export async function getVehicleOrThrow(id: string) {
  const v = await prisma.vehicle.findUnique({ where: { id } });
  if (!v) throw new ApiError(404, "not_found", "Vehicle not found");
  return v;
}

export async function listVehicles() {
  return prisma.vehicle.findMany({ orderBy: { id: "asc" } });
}
