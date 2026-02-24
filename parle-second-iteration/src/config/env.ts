import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  PORT: z.string().default("8080"),
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("info"),
  PARLE_API_KEY: z.string().min(8),
  DATABASE_URL: z.string().min(10),
  REDIS_URL: z.string().url().optional(),
  CACHE_TTL_SECONDS: z.string().default("10"),
  TESLA_BASE_URL: z.string().url(),
  TESLA_BEARER_TOKEN: z.string().min(1).optional(),
  WAKE_TIMEOUT_SECONDS: z.string().default("25"),
  WAKE_POLL_INTERVAL_MS: z.string().default("1500"),
  COMMAND_RETRY_COUNT: z.string().default("1"),
  HTTP_TIMEOUT_MS: z.string().default("8000"),
});

const env = Env.parse(process.env);

export const config = {
  port: Number(env.PORT),
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  parleApiKey: env.PARLE_API_KEY,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  cacheTtlSeconds: Number(env.CACHE_TTL_SECONDS),
  teslaBaseUrl: env.TESLA_BASE_URL,
  teslaBearerToken: env.TESLA_BEARER_TOKEN,
  wakeTimeoutSeconds: Number(env.WAKE_TIMEOUT_SECONDS),
  wakePollIntervalMs: Number(env.WAKE_POLL_INTERVAL_MS),
  commandRetryCount: Number(env.COMMAND_RETRY_COUNT),
  httpTimeoutMs: Number(env.HTTP_TIMEOUT_MS),
};
