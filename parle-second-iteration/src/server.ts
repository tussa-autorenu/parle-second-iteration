import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { config } from "./config/env.js";
import { authPlugin } from "./middleware/auth.js";
import { vehiclesRoutes } from "./routes/vehicles.js";
import { commandsRoutes } from "./routes/commands.js";
import { logsRoutes } from "./routes/logs.js";
import { fail, ok } from "./utils/http.js";

const app = Fastify({
  trustProxy: config.nodeEnv !== "development",
  logger: {
    level: config.logLevel,
    transport: config.nodeEnv === "development" ? { target: "pino-pretty" } : undefined
  }
});

await app.register(helmet);
await app.register(cors, { origin: true });
await app.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute",
  keyGenerator: (req) => String(req.headers["x-forwarded-for"] ?? req.ip),
});

await app.register(swagger, { openapi: { info: { title: "Parle Tesla Control Service", version: "0.1.0" } } });
await app.register(swaggerUi, { routePrefix: "/docs" });

await app.register(authPlugin);

app.get("/healthz", async (_req, reply) => ok(reply, { ok: true }));

await app.register(vehiclesRoutes);
await app.register(commandsRoutes);
await app.register(logsRoutes);

app.setErrorHandler((err, _req, reply) => fail(reply, err));

await app.listen({ port: config.port, host: "0.0.0.0" });
