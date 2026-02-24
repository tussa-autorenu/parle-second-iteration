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
const DEV_PUBLIC_PREFIXES = ["/healthz", "/docs"];

export const authPlugin: FastifyPluginAsync = fp(async (app) => {
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

    const apiKey = req.headers["x-parle-api-key"];

    if (typeof apiKey !== "string" || !apiKey) {
      throw new ApiError(
        401,
        "auth_error",
        'Missing header: send "x-parle-api-key"',
      );
    }

    if (apiKey !== config.parleApiKey) {
      throw new ApiError(401, "auth_error", "Invalid x-parle-api-key");
    }

    req.triggeredBy = String(req.headers["x-triggered-by"] ?? "system");
    req.requestId = String(req.headers["x-request-id"] ?? "");
  });
});
