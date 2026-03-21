import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { resolveVehicle, markVcpRequired } from "../services/vehicleService.js";
import { createTeslaClient, createTeslaProxyClient } from "../clients/teslaClient.js";
import { TeslaApi, type CommandMode } from "../tesla/teslaApi.js";
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

  // ── Per-user Tesla token ──
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

  // ── Vehicle resolution ──
  const vehicle = await resolveVehicle(id);

  const vehicleId = vehicle?.id ?? undefined;
  const teslaVehicleId = vehicle?.teslaVehicleId ?? id;
  const vin = vehicle?.vin ?? null;

  // ── Build TeslaApi with both clients ──
  let currentAccessToken = tokenResult.accessToken;
  const fleetClient = createTeslaClient(currentAccessToken);
  const proxyClient = createTeslaProxyClient(currentAccessToken);
  const tesla = new TeslaApi(fleetClient, proxyClient, vin);

  // ── Per-vehicle command mode selection ──
  // true  → vehicle known to need proxy
  // false → vehicle known to work with direct REST
  // null  → unknown, try direct REST first and auto-detect
  const vcpFlag = vehicle?.vcpRequired ?? null;
  let chosenMode: CommandMode;
  if (vcpFlag === true && tesla.proxyConfigured) {
    chosenMode = "command_protocol_proxy";
  } else {
    chosenMode = "direct_fleet_rest";
  }
  tesla.commandMode = chosenMode;

  req.log.info(
    {
      routeParamId: id,
      command,
      resolvedVia: vehicle ? (vehicle.id === id ? "db_pk" : "db_tesla_id") : "tesla_id_fallback",
      vehicleId: vehicleId ?? null,
      teslaVehicleId,
      vin,
      vcpRequired: vcpFlag,
      commandMode: chosenMode,
      proxyConfigured: tesla.proxyConfigured,
      lastCapabilityCheckedAt: vehicle?.lastCapabilityCheckedAt?.toISOString() ?? null,
    },
    "handleCommand: vehicle + command routing",
  );

  const runParams = { vehicleId, teslaVehicleId, command, requestId, triggeredBy, tesla };

  // Re-fetch the user's Tesla token and update both Axios clients when it
  // has been refreshed since we last captured it. Returns true when the
  // TeslaAccount was found (even if no refresh was needed), false on failure.
  const refreshTokenForRetry = async (reason: string): Promise<boolean> => {
    const fresh = await getUserAccessToken(triggeredBy);
    if (!fresh.ok) {
      req.log.warn(
        { triggeredBy, reason: fresh.reason, retryReason: reason },
        "handleCommand: token re-fetch failed before retry",
      );
      return false;
    }
    if (fresh.accessToken !== currentAccessToken) {
      currentAccessToken = fresh.accessToken;
      tesla.refreshAuthHeader(currentAccessToken);
      req.log.info(
        { triggeredBy, tokenRefreshed: true, commandMode: tesla.commandMode, retryReason: reason },
        "handleCommand: refreshed auth header before retry",
      );
    }
    return true;
  };

  try {
    const res = await runCommand(runParams);
    return ok(reply, { ...res, vehicleId: vehicleId ?? teslaVehicleId, command, requestId });
  } catch (e: unknown) {
    const err = e instanceof ApiError ? e : new ApiError(502, "unknown", "Command failed");

    // ── VCP auto-detection: direct REST failed → retry via proxy ──
    if (
      err.reason === "vcp_required" &&
      chosenMode === "direct_fleet_rest" &&
      tesla.proxyConfigured &&
      vin
    ) {
      req.log.info(
        {
          vehicleId: vehicleId ?? null,
          teslaVehicleId,
          vin,
          command,
          previousMode: "direct_fleet_rest",
          retryMode: "command_protocol_proxy",
        },
        "handleCommand: VCP required — auto-switching to command_protocol_proxy",
      );

      if (vehicleId) {
        await markVcpRequired(vehicleId).catch((dbErr) =>
          req.log.warn({ vehicleId, err: String(dbErr) }, "handleCommand: failed to persist vcpRequired flag"),
        );
      }

      tesla.commandMode = "command_protocol_proxy";
      await refreshTokenForRetry("vcp_proxy_switch");

      try {
        const retryRes = await runCommand(runParams);
        return ok(reply, {
          ...retryRes,
          vehicleId: vehicleId ?? teslaVehicleId,
          command,
          requestId,
          vcpAutoDetected: true,
        });
      } catch (retryE: unknown) {
        const retryErr = retryE instanceof ApiError ? retryE : new ApiError(502, "unknown", "Command failed");
        req.log.warn(
          {
            triggeredBy,
            command,
            teslaVehicleId,
            vin,
            via: "command_protocol_proxy",
            errorReason: retryErr.reason,
            errorMessage: retryErr.message,
            teslaStatus: retryErr.details?.["teslaStatus"] ?? null,
            authHeaderPresent: retryErr.details?.["authHeaderPresent"] ?? null,
            retryAfterVcpDetect: true,
          },
          "handleCommand: command failed after VCP retry",
        );
        return fail(reply, retryErr);
      }
    }

    // ── Auth failure in proxy mode → refresh token + one retry ──
    if (
      err.reason === "auth_expired_or_invalid" &&
      tesla.commandMode === "command_protocol_proxy"
    ) {
      req.log.info(
        {
          triggeredBy,
          command,
          teslaVehicleId,
          vin,
          commandMode: tesla.commandMode,
          teslaStatus: err.details?.["teslaStatus"] ?? null,
        },
        "handleCommand: auth failed in proxy mode, attempting token refresh + retry",
      );

      const tokenOk = await refreshTokenForRetry("proxy_auth_401");
      if (tokenOk) {
        try {
          const retryRes = await runCommand(runParams);
          req.log.info(
            { command, teslaVehicleId, vin },
            "handleCommand: proxy command succeeded after auth refresh",
          );
          return ok(reply, {
            ...retryRes,
            vehicleId: vehicleId ?? teslaVehicleId,
            command,
            requestId,
            authRefreshed: true,
          });
        } catch (retryE: unknown) {
          const retryErr = retryE instanceof ApiError ? retryE : new ApiError(502, "unknown", "Command failed");
          req.log.warn(
            {
              triggeredBy,
              command,
              teslaVehicleId,
              vin,
              via: tesla.commandMode,
              errorReason: retryErr.reason,
              errorMessage: retryErr.message,
              teslaStatus: retryErr.details?.["teslaStatus"] ?? null,
              authHeaderPresent: retryErr.details?.["authHeaderPresent"] ?? null,
              retryAfterAuthRefresh: true,
            },
            "handleCommand: command still failed after auth refresh retry",
          );
          return fail(reply, retryErr);
        }
      }
    }

    req.log.warn(
      {
        triggeredBy,
        command,
        teslaVehicleId,
        vin,
        via: err.details?.["via"] ?? chosenMode,
        errorReason: err.reason,
        errorMessage: err.message,
        teslaStatus: err.details?.["teslaStatus"] ?? null,
        teslaError: err.details?.["teslaError"] ?? null,
        authHeaderPresent: err.details?.["authHeaderPresent"] ?? null,
        commandMode: tesla.commandMode,
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
