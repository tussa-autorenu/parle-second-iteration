import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const TEST_API_KEY = "test_api_key_12345";

function setTestEnv() {
  process.env.NODE_ENV = "development";
  process.env.LOG_LEVEL = "silent";
  process.env.PORT = "0";
  process.env.PARLE_API_KEY = TEST_API_KEY;
  process.env.DATABASE_URL =
    "postgresql://user:pass@localhost:5432/test?schema=public";
  process.env.TESLA_BASE_URL = "http://localhost:9090";
  process.env.CACHE_TTL_SECONDS = "10";
}

describe("auth – route protection (NODE_ENV=development)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    vi.resetModules();
    setTestEnv();

    const { authPlugin } = await import("../src/middleware/auth.js");
    const { ok, fail } = await import("../src/utils/http.js");

    app = Fastify({ logger: false });
    await app.register(authPlugin);

    app.get("/healthz", async (_req, reply) => ok(reply, { ok: true }));
    app.get("/vehicles", async (_req, reply) => ok(reply, []));

    app.setErrorHandler((err, _req, reply) => fail(reply, err));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── /healthz ──────────────────────────────────────────────

  it("/healthz returns 200 without any API key (dev mode)", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it("/healthz also works WITH the API key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-parle-api-key": TEST_API_KEY },
    });
    expect(res.statusCode).toBe(200);
  });

  // ── /vehicles (protected) ────────────────────────────────

  it("/vehicles returns 401 when API key is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/vehicles" });
    expect(res.statusCode).toBe(401);
    const body = res.json() as {
      ok: boolean;
      error: { reason: string; message: string };
    };
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("x-parle-api-key");
  });

  it("/vehicles returns 401 when API key is wrong", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/vehicles",
      headers: { "x-parle-api-key": "wrong_key_value" },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as {
      ok: boolean;
      error: { reason: string; message: string };
    };
    expect(body.error.message).toBe("Invalid x-parle-api-key");
  });

  it("/vehicles returns 200 with the correct API key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/vehicles",
      headers: { "x-parle-api-key": TEST_API_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });
});
