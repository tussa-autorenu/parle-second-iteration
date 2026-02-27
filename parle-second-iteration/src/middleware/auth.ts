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

/**
 * Routes that NEVER require x-parle-api-key (all environments).
 * These are user-facing OAuth endpoints, not service-to-service.
 */
const ALWAYS_PUBLIC_PREFIXES = [
  "/healthz",
  "/auth/tesla/start",
  "/auth/tesla/callback",
];

/** Routes that skip API-key auth in non-production environments only. */
const DEV_PUBLIC_PREFIXES = ["/docs", "/documentation", "/debug"];

function isPublicRoute(url: string): boolean {
  // Strip querystring so "/auth/tesla/start?userId=x" matches the prefix
  const path = url.split("?")[0];
  return ALWAYS_PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

function isDevPublicRoute(url: string): boolean {
  return DEV_PUBLIC_PREFIXES.some((p) => url.startsWith(p));
}

export const authPlugin: FastifyPluginAsync = fp(async (app) => {
  // ── Startup diagnostic (never prints the raw secret) ──
  const keyLoaded = typeof config.parleApiKey === "string" && config.parleApiKey.length > 0;
  app.log.info(
    `PARLE_API_KEY loaded: ${keyLoaded}, length=${config.parleApiKey?.length ?? 0}`,
  );

  app.addHook("preHandler", async (req) => {
    // Always-public routes (OAuth redirects) — skip auth in every environment
    if (isPublicRoute(req.url)) {
      req.triggeredBy = String(req.headers["x-triggered-by"] ?? "system");
      req.requestId = String(req.headers["x-request-id"] ?? "");
      return;
    }

    // In non-production environments, allow dev-public routes without auth
    if (config.nodeEnv !== "production" && isDevPublicRoute(req.url)) {
      req.triggeredBy = String(req.headers["x-triggered-by"] ?? "system");
      req.requestId = String(req.headers["x-request-id"] ?? "");
      return;
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
