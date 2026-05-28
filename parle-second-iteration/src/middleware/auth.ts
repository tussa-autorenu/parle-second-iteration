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

/**
 * Build the set of accepted API keys from config.
 * Includes PARLE_API_KEY (always) and PARLE_EXTERNAL_API_KEY (if set).
 * Trims each value to defend against .env trailing whitespace.
 * Empty strings are filtered out so an unset external key never validates "".
 */
function buildValidApiKeys(): string[] {
  return [config.parleApiKey, config.parleExternalApiKey]
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .map((k) => k.trim());
}

export const authPlugin: FastifyPluginAsync = fp(async (app) => {
  // ── Startup diagnostic (never prints the raw secrets) ──
  const internalLoaded =
    typeof config.parleApiKey === "string" && config.parleApiKey.length > 0;
  const externalLoaded =
    typeof config.parleExternalApiKey === "string" &&
    config.parleExternalApiKey.length > 0;
  app.log.info(
    `PARLE_API_KEY loaded: ${internalLoaded}, length=${
      config.parleApiKey?.length ?? 0
    }; PARLE_EXTERNAL_API_KEY loaded: ${externalLoaded}, length=${
      config.parleExternalApiKey?.length ?? 0
    }`,
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

    // Accept either the internal PARLE_API_KEY or the external (frontend-safe)
    // PARLE_EXTERNAL_API_KEY. Trim both sides to defend against .env trailing
    // whitespace / header padding.
    const provided = rawApiKey.trim();
    const validKeys = buildValidApiKeys();
    if (!validKeys.includes(provided)) {
      throw new ApiError(401, "auth_error", "Invalid x-parle-api-key");
    }

    // Tag which key matched so logs/audits can distinguish internal vs frontend
    // traffic, without ever logging the key value itself.
    const matchedExternal =
      externalLoaded &&
      provided === (config.parleExternalApiKey ?? "").trim();
    req.log.debug(
      `x-parle-api-key matched: source=${matchedExternal ? "external" : "internal"}`,
    );

    setIdentity(req);
  });
});
