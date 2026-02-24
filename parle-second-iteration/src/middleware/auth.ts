import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { config } from "../config/env.js";
import { ApiError } from "../utils/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    triggeredBy?: string;
    requestId?: string;
  }
}

/** Route prefixes that skip API-key auth in non-production environments. */
const DEV_PUBLIC_PREFIXES = ["/healthz", "/docs", "/debug"];

export const authPlugin: FastifyPluginAsync = fp(async (app) => {
  // ── Startup diagnostic (never prints the raw secret) ──
  const keyLoaded = typeof config.parleApiKey === "string" && config.parleApiKey.length > 0;
  app.log.info(
    `PARLE_API_KEY loaded: ${keyLoaded}, length=${config.parleApiKey?.length ?? 0}`,
  );

  app.addHook("preHandler", async (req) => {
    // In non-production environments, allow public routes without auth
    if (config.nodeEnv !== "production") {
      const isPublic = DEV_PUBLIC_PREFIXES.some((p) => req.url.startsWith(p));
      if (isPublic) {
        req.triggeredBy = String(req.headers["x-triggered-by"] ?? "system");
        req.requestId = String(req.headers["x-request-id"] ?? "");
        return;
      }
    }

    const rawApiKey = req.headers["x-parle-api-key"];

    // ── Per-request diagnostic (never prints the raw secret) ──
    if (typeof rawApiKey === "string") {
      req.log.debug(
        `Incoming x-parle-api-key: present=true, length=${rawApiKey.length}`,
      );
    } else {
      req.log.debug("Incoming x-parle-api-key: present=false");
    }

    if (typeof rawApiKey !== "string" || !rawApiKey.trim()) {
      throw new ApiError(
        401,
        "auth_error",
        'Missing header: send "x-parle-api-key"',
      );
    }

    // Trim both sides to defend against .env trailing whitespace / header padding
    if (rawApiKey.trim() !== config.parleApiKey.trim()) {
      throw new ApiError(401, "auth_error", "Invalid x-parle-api-key");
    }

    req.triggeredBy = String(req.headers["x-triggered-by"] ?? "system");
    req.requestId = String(req.headers["x-request-id"] ?? "");
  });
});
