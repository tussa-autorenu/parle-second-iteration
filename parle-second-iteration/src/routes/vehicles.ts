import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listVehicles, getVehicleOrThrow } from "../services/vehicleService.js";
import { createTeslaClient } from "../clients/teslaClient.js";
import { TeslaApi } from "../tesla/teslaApi.js";
import { getCachedTelemetry, refreshTelemetry } from "../services/telemetryService.js";
import { ok } from "../utils/http.js";

const teslaApi = new TeslaApi(createTeslaClient());

export async function vehiclesRoutes(app: FastifyInstance) {
  app.get("/vehicles", { schema: { tags: ["vehicles"] } }, async (_req, reply) => {
    const vehicles = await listVehicles();
    const results = await Promise.all(vehicles.map(async (v) => ({
      id: v.id,
      teslaVehicleId: v.teslaVehicleId,
      vin: v.vin,
      friendlyName: v.friendlyName,
      telemetry: await getCachedTelemetry(v.id)
    })));
    return ok(reply, results);
  });

  app.get("/vehicles/:id", { schema: { tags: ["vehicles"] } }, async (req, reply) => {
    const id = z.object({ id: z.string() }).parse(req.params).id;
    const v = await getVehicleOrThrow(id);
    const cached = await getCachedTelemetry(v.id);
    const state = cached ?? await refreshTelemetry(v.id, v.teslaVehicleId, teslaApi);
    return ok(reply, { id: v.id, teslaVehicleId: v.teslaVehicleId, vin: v.vin, friendlyName: v.friendlyName, state });
  });
}
