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

export const authPlugin: FastifyPluginAsync = fp(async (app) => {
  app.addHook("preHandler", async (req) => {
    const apiKey = req.headers["x-parle-api-key"];
    if (!apiKey || apiKey !== config.parleApiKey) {
      throw new ApiError(401, "auth_error", "Missing/invalid service API key");
    }
    req.triggeredBy = String(req.headers["x-triggered-by"] ?? "system");
    req.requestId = String(req.headers["x-request-id"] ?? "");
  });
});
