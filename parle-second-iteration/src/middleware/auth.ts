import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
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
 * Includes OAuth endpoints, health check, and Tesla domain verification.
 */
const ALWAYS_PUBLIC_PREFIXES = [
  "/healthz",
  "/auth/tesla/start",
  "/auth/tesla/callback",
  "/.well-known",
];

/** Routes that skip API-key auth in non-production environments only. */
const DEV_PUBLIC_PREFIXES = ["/docs", "/documentation", "/debug"];

/**
 * Extract the pathname from the raw Node.js HTTP URL.
 * Uses req.raw.url (not req.url) because Fastify/plugins may rewrite req.url
 * and this must work reliably behind proxies (AWS ALB, etc.).
 */
function rawPath(req: FastifyRequest): string {
  const raw = req.raw.url ?? req.url;
  return raw.split("?")[0];
}

function isPublicRoute(req: FastifyRequest): boolean {
  const path = rawPath(req);
  return ALWAYS_PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

function isDevPublicRoute(req: FastifyRequest): boolean {
  const path = rawPath(req);
  return DEV_PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

/** Set identity headers with safe defaults. */
function setIdentity(req: FastifyRequest): void {
  req.triggeredBy = String(req.headers["x-triggered-by"] ?? "system");
  req.requestId = String(req.headers["x-request-id"] ?? "");
}

export const authPlugin: FastifyPluginAsync = fp(async (app) => {
  // ── Startup diagnostic (never prints the raw secret) ──
  const keyLoaded = typeof config.parleApiKey === "string" && config.parleApiKey.length > 0;
  app.log.info(
    `PARLE_API_KEY loaded: ${keyLoaded}, length=${config.parleApiKey?.length ?? 0}`,
  );

  app.addHook("onRequest", async (req) => {
    // Always-public routes — skip auth in every environment
    if (isPublicRoute(req)) {
      setIdentity(req);
      return;
    }

    // In non-production environments, allow dev-public routes without auth
    if (config.nodeEnv !== "production" && isDevPublicRoute(req)) {
      setIdentity(req);
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

    setIdentity(req);
  });
});
