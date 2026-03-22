import axios from "axios";

export interface ProxyCheckResult {
  proxyUrl: string;
  reachable: boolean;
  /** true when the proxy URL is actually serving our Parle Fastify API — a fatal misconfiguration. */
  isFastifyApi: boolean;
  rootStatus: number | null;
  healthzStatus: number | null;
  serverHeader: string | null;
  error: string | null;
  verdict: string;
}

/**
 * Probe the configured TESLA_COMMAND_PROXY_URL to determine whether it is
 * backed by the official Tesla Vehicle Command proxy or by something else
 * (e.g. our own Fastify API, a dead host, a generic reverse-proxy, etc.).
 *
 * Heuristic:
 *   1. GET {proxyUrl}/healthz  — Parle returns 200 {"ok":true}; the real
 *      Tesla proxy does not serve this path (404 / connection-level rejection).
 *   2. GET {proxyUrl}/         — Parle returns Swagger HTML containing "Parle"
 *      or "fastify"; the real Tesla proxy returns 404 or a plain error.
 *
 * If either probe matches our API fingerprint → isFastifyApi = true.
 */
export async function checkProxyService(proxyUrl: string): Promise<ProxyCheckResult> {
  const result: ProxyCheckResult = {
    proxyUrl,
    reachable: false,
    isFastifyApi: false,
    rootStatus: null,
    healthzStatus: null,
    serverHeader: null,
    error: null,
    verdict: "unknown",
  };

  // Probe 1: GET /healthz
  try {
    const r = await axios.get(`${proxyUrl}/healthz`, {
      timeout: 5000,
      validateStatus: () => true,
    });
    result.reachable = true;
    result.healthzStatus = r.status;
    result.serverHeader = String(r.headers?.["server"] ?? "");

    if (r.status === 200 && r.data && typeof r.data === "object" && "ok" in r.data) {
      result.isFastifyApi = true;
    }
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.code === "ETIMEDOUT") {
      result.error = `${err.code}: proxy host unreachable`;
      result.verdict = "unreachable — proxy host is down or DNS does not resolve";
      return result;
    }
    // TLS errors, resets, etc. — proxy might still be there but unhealthy
    result.error = err.message ?? String(e);
    result.reachable = true;
  }

  // Probe 2: GET /
  try {
    const r = await axios.get(`${proxyUrl}/`, {
      timeout: 5000,
      validateStatus: () => true,
      maxRedirects: 0,
    });
    result.rootStatus = r.status;
    if (!result.serverHeader) {
      result.serverHeader = String(r.headers?.["server"] ?? "");
    }

    const body = typeof r.data === "string" ? r.data.slice(0, 500) : "";
    if (
      body.toLowerCase().includes("parle") ||
      body.toLowerCase().includes("swagger") ||
      body.toLowerCase().includes("fastify")
    ) {
      result.isFastifyApi = true;
    }
  } catch {
    // GET / failing is expected for the real Tesla proxy
  }

  if (result.isFastifyApi) {
    result.verdict =
      "MISCONFIGURED — proxy URL serves the Parle Fastify API, NOT the Tesla Vehicle Command proxy. " +
      "All proxy-mode commands will 401. Deploy the official tesla-http-proxy " +
      "(github.com/teslamotors/vehicle-command) at a separate origin.";
  } else if (result.reachable) {
    result.verdict = "reachable — does not look like Parle API (likely the real Tesla proxy)";
  } else {
    result.verdict = "unknown — could not determine proxy identity";
  }

  return result;
}
