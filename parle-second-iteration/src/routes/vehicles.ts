import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getUserAccessToken, fetchUserVehicles } from "../services/teslaAccountService.js";
import { getVehicleOrThrow } from "../services/vehicleService.js";
import { createTeslaClient } from "../clients/teslaClient.js";
import { TeslaApi } from "../tesla/teslaApi.js";
import { getCachedTelemetry, refreshTelemetry } from "../services/telemetryService.js";
import { ok } from "../utils/http.js";

// Legacy TeslaApi using global bearer token — only used by /vehicles/:id
// TODO: migrate /vehicles/:id to per-user token flow too
const legacyTeslaApi = new TeslaApi(createTeslaClient());

export async function vehiclesRoutes(app: FastifyInstance) {
  // ── GET /vehicles ───────────────────────────────────────
  // Lists the current user's Tesla vehicles using their per-user
  // OAuth access token from TeslaAccount (NOT the old global token).
  app.get("/vehicles", { schema: { tags: ["vehicles"] } }, async (req, reply) => {
    const userId = req.triggeredBy?.trim() ?? "system";

    // ── Diagnostic log: user identity ──
    req.log.info({ triggeredBy: userId }, "GET /vehicles: user identity");

    // Load per-user Tesla access token (with auto-refresh if expired)
    const tokenResult = await getUserAccessToken(userId);

    // ── Diagnostic log: account lookup result ──
    req.log.info(
      {
        hasAccount: tokenResult.ok,
        reason: tokenResult.ok ? undefined : tokenResult.reason,
        tokenRefreshed: tokenResult.ok ? tokenResult.refreshed : false,
      },
      "GET /vehicles: Tesla account lookup",
    );

    if (!tokenResult.ok) {
      // User has no linked Tesla account (or token refresh failed)
      // Return empty list — the frontend checks /auth/tesla/status for details
      return ok(reply, []);
    }

    // Fetch vehicle list from Tesla Fleet API using per-user token
    try {
      const vehicles = await fetchUserVehicles(tokenResult.accessToken);

      // ── Diagnostic log: Tesla API result ──
      req.log.info(
        { vehicleCount: vehicles.length },
        "GET /vehicles: Tesla API vehicle list",
      );

      // Normalize to the shape the frontend expects
      const results = vehicles.map((v) => ({
        id: v.id,
        teslaVehicleId: v.id,
        vin: v.vin,
        friendlyName: v.displayName,
        state: v.state,
      }));

      return ok(reply, results);
    } catch (err: unknown) {
      // ── Diagnostic log: Tesla API error (no token leak) ──
      const status = (err as { response?: { status?: number } })?.response?.status;
      req.log.warn(
        { teslaStatus: status ?? null },
        "GET /vehicles: Tesla Fleet API call failed",
      );
      return ok(reply, []);
    }
  });

  // ── GET /vehicles/:id ──────────────────────────────────
  // Single vehicle detail by local DB ID.
  // NOTE: still uses legacy global Tesla bearer token for telemetry.
  // TODO: migrate to per-user token flow.
  app.get("/vehicles/:id", { schema: { tags: ["vehicles"] } }, async (req, reply) => {
    const id = z.object({ id: z.string() }).parse(req.params).id;
    const v = await getVehicleOrThrow(id);
    const cached = await getCachedTelemetry(v.id);
    const state = cached ?? await refreshTelemetry(v.id, v.teslaVehicleId, legacyTeslaApi);
    return ok(reply, { id: v.id, teslaVehicleId: v.teslaVehicleId, vin: v.vin, friendlyName: v.friendlyName, state });
  });
}
