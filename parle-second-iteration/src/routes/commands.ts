import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getVehicleOrThrow } from "../services/vehicleService.js";
import { createTeslaClient } from "../clients/teslaClient.js";
import { TeslaApi } from "../tesla/teslaApi.js";
import { runCommand, type CommandName } from "../services/commandService.js";
import { ok } from "../utils/http.js";

const teslaApi = new TeslaApi(createTeslaClient());

const ParamsSchema = z.object({ id: z.string().min(1) });
const BodySchema = z.object({ requestId: z.string().min(8).optional() });

type CmdParams = { id: string };
type CmdBody = { requestId?: string };

async function handleCommand(
  req: FastifyRequest<{ Params: CmdParams; Body: CmdBody }>,
  reply: FastifyReply,
  command: CommandName
) {
  const { id } = ParamsSchema.parse(req.params);
  const body = BodySchema.parse(req.body ?? {});

  req.log.info(
    { routeParamId: id, command },
    "handleCommand: received route param",
  );

  const v = await getVehicleOrThrow(id);

  req.log.info(
    {
      resolvedDbId: v.id,
      teslaVehicleId: v.teslaVehicleId,
      matchedVia: v.id === id ? "id" : "teslaVehicleId",
    },
    "handleCommand: resolved vehicle",
  );

  const requestId = body.requestId ?? req.requestId ?? randomUUID();
  const triggeredBy = req.triggeredBy ?? "system";

  const res = await runCommand({
    vehicleId: v.id,
    teslaVehicleId: v.teslaVehicleId,
    command,
    requestId,
    triggeredBy,
    tesla: teslaApi,
  });

  return ok(reply, { ...res, vehicleId: v.id, command, requestId });
}

export async function commandsRoutes(app: FastifyInstance) {
  app.post("/vehicles/:id/wake", { schema: { tags: ["commands"] } }, (req, reply) =>
    handleCommand(req as FastifyRequest<{ Params: CmdParams; Body: CmdBody }>, reply, "wake")
  );

  app.post("/vehicles/:id/unlock", { schema: { tags: ["commands"] } }, (req, reply) =>
    handleCommand(req as FastifyRequest<{ Params: CmdParams; Body: CmdBody }>, reply, "unlock")
  );

  app.post("/vehicles/:id/enable-drive", { schema: { tags: ["commands"] } }, (req, reply) =>
    handleCommand(req as FastifyRequest<{ Params: CmdParams; Body: CmdBody }>, reply, "enable-drive")
  );

  app.post("/vehicles/:id/lock", { schema: { tags: ["commands"] } }, (req, reply) =>
    handleCommand(req as FastifyRequest<{ Params: CmdParams; Body: CmdBody }>, reply, "lock")
  );

  app.post("/vehicles/:id/ready", { schema: { tags: ["commands"] } }, (req, reply) =>
    handleCommand(req as FastifyRequest<{ Params: CmdParams; Body: CmdBody }>, reply, "ready-vehicle")
  );
}