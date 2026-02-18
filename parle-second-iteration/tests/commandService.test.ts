import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma + telemetry modules *before* importing the module under test.
const prismaMock = {
  commandLog: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../src/db/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../src/db/prisma.ts", () => ({ prisma: prismaMock }));

const telemetryMock = {
  getCachedTelemetry: vi.fn(),
  refreshTelemetry: vi.fn(),
};

vi.mock("../src/services/telemetryService.js", () => telemetryMock);
vi.mock("../src/services/telemetryService.ts", () => telemetryMock);

function setRequiredEnv(overrides: Record<string, string> = {}) {
  process.env.PORT = "8080";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.PARLE_API_KEY = "dev_key_change_me";
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/postgres?schema=public";
  process.env.CACHE_TTL_SECONDS = "10";
  process.env.TESLA_BASE_URL = "http://localhost:9090";
  process.env.TESLA_BEARER_TOKEN = "mock_token";
  process.env.WAKE_TIMEOUT_SECONDS = "0.25";
  process.env.WAKE_POLL_INTERVAL_MS = "25";
  process.env.COMMAND_RETRY_COUNT = "0";
  process.env.HTTP_TIMEOUT_MS = "2000";
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
}

async function importRunCommand() {
  vi.resetModules();
  setRequiredEnv();
  const mod = await import("../src/services/commandService.js");
  return mod;
}

describe("commandService", () => {
  beforeEach(() => {
    prismaMock.commandLog.findUnique.mockReset();
    prismaMock.commandLog.create.mockReset();
    telemetryMock.getCachedTelemetry.mockReset();
    telemetryMock.refreshTelemetry.mockReset();
  });

  it("returns replay when the same (vehicleId, requestId, command) already exists (idempotency)", async () => {
    prismaMock.commandLog.findUnique.mockResolvedValue({
      id: "log1",
      result: "SUCCESS",
      errorReason: null,
      teslaStatus: 200,
    });

    const { runCommand } = await importRunCommand();

    const tesla = {
      wake: vi.fn(),
      unlock: vi.fn(),
      enableDrive: vi.fn(),
      lock: vi.fn(),
      honk: vi.fn(),
      flash: vi.fn(),
      preconditionOn: vi.fn(),
      sendDestination: vi.fn(),
      getState: vi.fn(),
    };

    const res = await runCommand({
      vehicleId: "veh_1",
      teslaVehicleId: "tesla_1",
      command: "unlock",
      requestId: "req_123",
      triggeredBy: "user_1",
      tesla,
    });

    expect(res.replay).toBe(true);
    expect(tesla.unlock).not.toHaveBeenCalled();
    expect(prismaMock.commandLog.create).not.toHaveBeenCalled();
  });

  it("throws asleep_timeout when vehicle never wakes within timeout", async () => {
    prismaMock.commandLog.findUnique.mockResolvedValue(null);
    prismaMock.commandLog.create.mockResolvedValue({});

    const { runCommand } = await importRunCommand();

    telemetryMock.getCachedTelemetry.mockResolvedValue({
      batteryPercent: null,
      onlineStatus: "ASLEEP",
      lockStatus: "UNKNOWN",
      lastLat: null,
      lastLng: null,
      lastSeenAt: new Date().toISOString(),
    });

    telemetryMock.refreshTelemetry.mockResolvedValue({
      batteryPercent: null,
      onlineStatus: "ASLEEP",
      lockStatus: "UNKNOWN",
      lastLat: null,
      lastLng: null,
      lastSeenAt: new Date().toISOString(),
    });

    const tesla = {
      wake: vi.fn().mockResolvedValue({ teslaStatus: 200, data: {} }),
      unlock: vi.fn(),
      enableDrive: vi.fn(),
      lock: vi.fn(),
      honk: vi.fn(),
      flash: vi.fn(),
      preconditionOn: vi.fn(),
      sendDestination: vi.fn(),
      getState: vi.fn(),
    };

    let caught: unknown = null;
    try {
      await runCommand({
        vehicleId: "veh_1",
        teslaVehicleId: "tesla_1",
        command: "unlock",
        requestId: "req_timeout",
        triggeredBy: "user_1",
        tesla,
      });
    } catch (e: unknown) {
      caught = e;
    }

    expect(caught).toBeTruthy();
    const err = caught as { reason?: string; statusCode?: number };
    expect(err.reason).toBe("asleep_timeout");
    expect(err.statusCode).toBe(409);
    expect(tesla.wake).toHaveBeenCalledTimes(1);
  });
});
