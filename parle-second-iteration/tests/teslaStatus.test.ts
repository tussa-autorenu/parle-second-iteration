import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const TEST_API_KEY = "test_api_key_12345";

// ── Module mocks (hoisted by vitest) ──────────────────────

const prismaMock = {
  teslaAccount: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("../src/db/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../src/db/prisma.ts", () => ({ prisma: prismaMock }));

const axiosMock = { get: vi.fn(), post: vi.fn(), create: vi.fn() };
vi.mock("axios", () => ({ default: axiosMock }));

// ── Env helpers ───────────────────────────────────────────

function setTestEnv() {
  process.env.NODE_ENV = "development";
  process.env.LOG_LEVEL = "silent";
  process.env.PORT = "0";
  process.env.PARLE_API_KEY = TEST_API_KEY;
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test?schema=public";
  process.env.TESLA_BASE_URL = "http://localhost:9090";
  process.env.TESLA_TOKEN_URL = "http://localhost:9090/oauth2/v3/token";
  process.env.TESLA_CLIENT_ID = "test_client_id";
  process.env.TESLA_CLIENT_SECRET = "test_secret";
  process.env.CACHE_TTL_SECONDS = "10";
  process.env.HTTP_TIMEOUT_MS = "2000";
}

function authHeaders(userId?: string): Record<string, string> {
  const h: Record<string, string> = { "x-parle-api-key": TEST_API_KEY };
  if (userId !== undefined) h["x-triggered-by"] = userId;
  return h;
}

// ── Test suite ────────────────────────────────────────────

describe("GET /auth/tesla/status", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    vi.resetModules();
    setTestEnv();

    const { authPlugin } = await import("../src/middleware/auth.js");
    const { ok, fail } = await import("../src/utils/http.js");
    const { getTeslaLinkStatus } = await import("../src/services/teslaAccountService.js");
    const { ApiError } = await import("../src/utils/errors.js");

    app = Fastify({ logger: false });
    await app.register(authPlugin);

    app.get("/auth/tesla/status", async (req, reply) => {
      const userId = req.triggeredBy?.trim();
      if (!userId || userId === "system") {
        throw new ApiError(
          400,
          "bad_request",
          "x-triggered-by header must contain the user ID",
        );
      }
      return ok(reply, await getTeslaLinkStatus(userId));
    });

    app.setErrorHandler((err, _req, reply) => fail(reply, err));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prismaMock.teslaAccount.findUnique.mockReset();
    prismaMock.teslaAccount.update.mockReset();
    axiosMock.get.mockReset();
    axiosMock.post.mockReset();
  });

  // ── Auth / identity validation ──────────────────────────

  it("returns 401 without x-parle-api-key", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/tesla/status" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when x-triggered-by is missing (defaults to 'system')", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/tesla/status",
      headers: { "x-parle-api-key": TEST_API_KEY },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { ok: boolean; error: { message: string } };
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("x-triggered-by");
  });

  it("returns 400 when x-triggered-by is 'system'", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/tesla/status",
      headers: authHeaders("system"),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when x-triggered-by is empty string", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/tesla/status",
      headers: authHeaders(""),
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Unlinked user ───────────────────────────────────────

  it("returns linked:false when no TeslaAccount exists", async () => {
    prismaMock.teslaAccount.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/auth/tesla/status",
      headers: authHeaders("user-1"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; data: Record<string, unknown> };
    expect(body).toMatchObject({
      ok: true,
      data: { linked: false, vehicleCount: 0, hasVehicles: false },
    });
    // Should NOT include linked-only fields
    expect(body.data.linkedAt).toBeUndefined();
    expect(body.data.updatedAt).toBeUndefined();
    expect(body.data.tokenExpired).toBeUndefined();
  });

  // ── Linked user, zero vehicles ──────────────────────────

  it("returns linked:true, vehicleCount:0 when Tesla returns empty vehicle list", async () => {
    prismaMock.teslaAccount.findUnique.mockResolvedValue({
      accessToken: "tok_valid",
      refreshToken: "ref_valid",
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date("2026-01-15T10:00:00Z"),
      updatedAt: new Date("2026-02-01T12:00:00Z"),
    });

    axiosMock.get.mockResolvedValue({
      data: { response: [], count: 0 },
    });

    const res = await app.inject({
      method: "GET",
      url: "/auth/tesla/status",
      headers: authHeaders("user-1"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      linked: true,
      vehicleCount: 0,
      hasVehicles: false,
      tokenExpired: false,
    });
    expect(body.data.linkedAt).toBeDefined();
    expect(body.data.updatedAt).toBeDefined();
  });

  // ── Linked user, vehicles available ─────────────────────

  it("returns linked:true with correct vehicleCount when Tesla returns vehicles", async () => {
    prismaMock.teslaAccount.findUnique.mockResolvedValue({
      accessToken: "tok_valid",
      refreshToken: "ref_valid",
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date("2026-01-15T10:00:00Z"),
      updatedAt: new Date("2026-02-01T12:00:00Z"),
    });

    axiosMock.get.mockResolvedValue({
      data: {
        response: [
          { id: 1, vehicle_id: 100, vin: "5YJ3E1EA1NF", display_name: "Model 3", state: "online" },
          { id: 2, vehicle_id: 200, vin: "5YJ3E1EB2PF", display_name: "Model Y", state: "asleep" },
        ],
        count: 2,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/auth/tesla/status",
      headers: authHeaders("user-1"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      linked: true,
      vehicleCount: 2,
      hasVehicles: true,
      tokenExpired: false,
    });
  });

  // ── Token refresh – success ─────────────────────────────

  it("refreshes an expired token then fetches vehicles", async () => {
    prismaMock.teslaAccount.findUnique.mockResolvedValue({
      accessToken: "expired_tok",
      refreshToken: "valid_refresh",
      expiresAt: new Date(Date.now() - 60_000), // expired 1 min ago
      createdAt: new Date("2026-01-15T10:00:00Z"),
      updatedAt: new Date("2026-02-01T12:00:00Z"),
    });

    // Token refresh succeeds
    axiosMock.post.mockResolvedValue({
      data: {
        access_token: "new_tok",
        refresh_token: "new_refresh",
        expires_in: 3600,
      },
    });
    prismaMock.teslaAccount.update.mockResolvedValue({});

    // Vehicle list with the refreshed token
    axiosMock.get.mockResolvedValue({
      data: { response: [{ id: 1 }], count: 1 },
    });

    const res = await app.inject({
      method: "GET",
      url: "/auth/tesla/status",
      headers: authHeaders("user-1"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      linked: true,
      vehicleCount: 1,
      hasVehicles: true,
      tokenExpired: false,
    });

    // Verify the refresh was attempted
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    // Verify the DB was updated with the new token
    expect(prismaMock.teslaAccount.update).toHaveBeenCalledTimes(1);

    // Verify the vehicle list was fetched with the NEW token
    expect(axiosMock.get).toHaveBeenCalledWith(
      "http://localhost:9090/api/1/vehicles",
      expect.objectContaining({
        headers: { Authorization: "Bearer new_tok" },
      }),
    );
  });

  // ── Token refresh – failure ─────────────────────────────

  it("returns tokenExpired:true when token refresh fails", async () => {
    prismaMock.teslaAccount.findUnique.mockResolvedValue({
      accessToken: "expired_tok",
      refreshToken: "bad_refresh",
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date("2026-01-15T10:00:00Z"),
      updatedAt: new Date("2026-02-01T12:00:00Z"),
    });

    // Token refresh fails
    axiosMock.post.mockRejectedValue(new Error("refresh_failed"));

    const res = await app.inject({
      method: "GET",
      url: "/auth/tesla/status",
      headers: authHeaders("user-1"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      linked: true,
      vehicleCount: 0,
      hasVehicles: false,
      tokenExpired: true,
    });

    // Tesla vehicle list API should NOT have been called
    expect(axiosMock.get).not.toHaveBeenCalled();
  });

  // ── Tesla API error (non-expired token) ─────────────────

  it("returns vehicleCount:0 gracefully when Tesla vehicle API fails", async () => {
    prismaMock.teslaAccount.findUnique.mockResolvedValue({
      accessToken: "tok_valid",
      refreshToken: "ref_valid",
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date("2026-01-15T10:00:00Z"),
      updatedAt: new Date("2026-02-01T12:00:00Z"),
    });

    axiosMock.get.mockRejectedValue(new Error("network_error"));

    const res = await app.inject({
      method: "GET",
      url: "/auth/tesla/status",
      headers: authHeaders("user-1"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      linked: true,
      vehicleCount: 0,
      hasVehicles: false,
    });
    // Still linked — the error is swallowed, not a 500
    expect(body.ok).toBe(true);
    expect(body.data.linked).toBe(true);
  });
});
