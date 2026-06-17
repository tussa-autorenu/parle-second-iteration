import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import {
  getOrCreateActiveCode,
  regenerateCode,
  redeemCode,
  getActiveAccessAsGuest,
  getActiveAccessAsOwner,
  revokeAccess,
} from "../services/shareService.js";

/** Pull the Supabase user id from the identity header, rejecting "system". */
function requireUserId(req: FastifyRequest): string {
  const userId = req.triggeredBy?.trim();
  if (!userId || userId === "system") {
    throw new ApiError(
      400,
      "bad_request",
      "x-triggered-by header must contain the user ID",
    );
  }
  return userId;
}

export async function shareRoutes(app: FastifyInstance) {
  // ── GET /share/code?vehicleId= ──────────────────────────
  // Owner only. Returns (or creates) the active 24h code for the vehicle.
  app.get<{ Querystring: { vehicleId?: string } }>(
    "/share/code",
    { schema: { tags: ["share"] } },
    async (req, reply) => {
      const userId = requireUserId(req);
      const vehicleId = z
        .object({ vehicleId: z.string().min(1) })
        .parse(req.query).vehicleId;

      const code = await getOrCreateActiveCode(userId, vehicleId);
      return ok(reply, code);
    },
  );

  // ── POST /share/code/regenerate ─────────────────────────
  // Owner only. Deactivates the old code and mints a fresh one.
  app.post<{ Body: { vehicleId?: string } }>(
    "/share/code/regenerate",
    { schema: { tags: ["share"] } },
    async (req, reply) => {
      const userId = requireUserId(req);
      const vehicleId = z
        .object({ vehicleId: z.string().min(1) })
        .parse(req.body ?? {}).vehicleId;

      const code = await regenerateCode(userId, vehicleId);
      return ok(reply, code);
    },
  );

  // ── POST /share/redeem ──────────────────────────────────
  // Guest. Redeems a code into a time-boxed access record.
  app.post<{ Body: { code?: string; durationMinutes?: number } }>(
    "/share/redeem",
    { schema: { tags: ["share"] } },
    async (req, reply) => {
      const userId = requireUserId(req);
      const body = z
        .object({
          code: z.string().min(1),
          durationMinutes: z.number().int().positive(),
        })
        .parse(req.body ?? {});

      const access = await redeemCode(userId, body.code, body.durationMinutes);
      req.log.info(
        { guestUserId: userId, ownerUserId: access.ownerUserId, vehicleId: access.vehicleId, accessId: access.id },
        "share: code redeemed",
      );
      return ok(reply, access);
    },
  );

  // ── GET /share/access ───────────────────────────────────
  // Active access records for the current user, split by role.
  app.get("/share/access", { schema: { tags: ["share"] } }, async (req, reply) => {
    const userId = requireUserId(req);
    const [asGuest, asOwner] = await Promise.all([
      getActiveAccessAsGuest(userId),
      getActiveAccessAsOwner(userId),
    ]);
    return ok(reply, { asGuest, asOwner });
  });

  // ── POST /share/revoke ──────────────────────────────────
  // Owner only. Revokes a guest's access by id.
  app.post<{ Body: { accessId?: string } }>(
    "/share/revoke",
    { schema: { tags: ["share"] } },
    async (req, reply) => {
      const userId = requireUserId(req);
      const accessId = z
        .object({ accessId: z.string().min(1) })
        .parse(req.body ?? {}).accessId;

      await revokeAccess(userId, accessId);
      req.log.info({ ownerUserId: userId, accessId }, "share: access revoked");
      return ok(reply, { revoked: true });
    },
  );
}
