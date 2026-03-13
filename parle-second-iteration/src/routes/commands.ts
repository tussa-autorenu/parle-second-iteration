import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { resolveVehicle } from "../services/vehicleService.js";
import { createTeslaClient } from "../clients/teslaClient.js";
import { TeslaApi } from "../tesla/teslaApi.js";
import { getUserAccessToken } from "../services/teslaAccountService.js";
import { runCommand, type CommandName } from "../services/commandService.js";
import { ApiError } from "../utils/errors.js";
import { ok, fail } from "../utils/http.js";

const ParamsSchema = z.object({ id: z.string().min(1) });
const BodySchema = z.object({ requestId: z.string().min(8).optional() });

type CmdParams = { id: string };
type CmdBody = { requestId?: string };

async function handleCommand(
  req: FastifyRequest<{ Params: CmdParams; Body: CmdBody }>,
  reply: FastifyReply,
  command: CommandName,
) {
  const { id } = ParamsSchema.parse(req.params);
  const body = BodySchema.parse(req.body ?? {});

  const triggeredBy = req.triggeredBy?.trim() ?? "system";
  const requestId = body.requestId ?? req.requestId ?? randomUUID();

  req.log.info({ triggeredBy, command }, "handleCommand: user identity");

  // ── Per-user Tesla token (same flow as GET /vehicles) ──
  const tokenResult = await getUserAccessToken(triggeredBy);

  req.log.info(
    {
      triggeredBy,
      hasAccount: tokenResult.ok,
      reason: tokenResult.ok ? undefined : tokenResult.reason,
      tokenRefreshed: tokenResult.ok ? tokenResult.refreshed : false,
      authFlow: "per_user",
    },
    "handleCommand: Tesla account lookup",
  );

  if (!tokenResult.ok) {
    return fail(
      reply,
      new ApiError(
        401,
        "tesla_auth_error",
        tokenResult.reason === "not_linked"
          ? "No Tesla account linked. Please link your Tesla account first."
          : "Tesla token expired and refresh failed. Please re-link your Tesla account.",
      ),
    );
  }

  const tesla = new TeslaApi(createTeslaClient(tokenResult.accessToken));

  // ── Vehicle resolution ──
  const vehicle = await resolveVehicle(id);

  const vehicleId = vehicle?.id ?? undefined;
  const teslaVehicleId = vehicle?.teslaVehicleId ?? id;

  req.log.info(
    {
      routeParamId: id,
      command,
      resolvedVia: vehicle ? (vehicle.id === id ? "db_pk" : "db_tesla_id") : "tesla_id_fallback",
      vehicleId: vehicleId ?? null,
      teslaVehicleId,
    },
    "handleCommand: vehicle resolution",
  );

  try {
    const res = await runCommand({
      vehicleId,
      teslaVehicleId,
      command,
      requestId,
      triggeredBy,
      tesla,
    });

    return ok(reply, { ...res, vehicleId: vehicleId ?? teslaVehicleId, command, requestId });
  } catch (e: unknown) {
    const err = e instanceof ApiError ? e : new ApiError(502, "unknown", "Command failed");

    req.log.warn(
      {
        triggeredBy,
        command,
        teslaVehicleId,
        errorReason: err.reason,
        errorMessage: err.message,
        teslaStatus: err.details?.["teslaStatus"] ?? null,
        teslaError: err.details?.["teslaError"] ?? null,
        origin: err.details?.["teslaStatus"] != null ? "tesla_upstream" : "pre_tesla",
      },
      "handleCommand: command failed",
    );

    return fail(reply, err);
  }
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
