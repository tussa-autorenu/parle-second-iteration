import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import cookie from "@fastify/cookie";

import { config } from "./config/env.js";
import { authPlugin } from "./middleware/auth.js";
import { vehiclesRoutes } from "./routes/vehicles.js";
import { commandsRoutes } from "./routes/commands.js";
import { logsRoutes } from "./routes/logs.js";
import { teslaAuthRoutes } from "./routes/teslaAuth.js";

import { fail, ok } from "./utils/http.js";

export async function buildApp() {
  const app = Fastify({
    trustProxy: config.nodeEnv !== "development",
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === "development"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  // Cookies (must be before routes that use setCookie)
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET ?? "dev_cookie_secret_change_me",
  });

  // Security + CORS
  await app.register(helmet);
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: (req) => String(req.headers["x-forwarded-for"] ?? req.ip),
  });

  // Swagger
  await app.register(swagger, {
    openapi: {
      info: { title: "Parle Tesla Control Service", version: "0.1.0" },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  // Service-to-service auth (x-parle-api-key)
  await app.register(authPlugin);

  // Health (public in dev, protected in production — handled by authPlugin)
  app.get("/healthz", async (_req, reply) => ok(reply, { ok: true }));

  // ── Debug route (development only) ──────────────────────
  if (config.nodeEnv === "development") {
    app.get("/debug/env", async (_req, reply) => {
      return ok(reply, {
        NODE_ENV: config.nodeEnv,
        PORT: config.port,
        LOG_LEVEL: config.logLevel,
        PARLE_API_KEY_set: typeof config.parleApiKey === "string" && config.parleApiKey.length > 0,
        PARLE_API_KEY_length: config.parleApiKey?.length ?? 0,
        DATABASE_URL_set: typeof config.databaseUrl === "string" && config.databaseUrl.length > 0,
        TESLA_BASE_URL: config.teslaBaseUrl,
        TESLA_BEARER_TOKEN_set: typeof config.teslaBearerToken === "string" && config.teslaBearerToken.length > 0,
        REDIS_URL_set: typeof config.redisUrl === "string" && config.redisUrl.length > 0,
      });
    });
  }

  // Routes
  await app.register(teslaAuthRoutes);
  await app.register(vehiclesRoutes);
  await app.register(commandsRoutes);
  await app.register(logsRoutes);

  // Central error handler
  app.setErrorHandler((err, _req, reply) => fail(reply, err));

  return app;
}
