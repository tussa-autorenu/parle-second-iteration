import axios from "axios";
import http from "node:http";
import https from "node:https";
import { config } from "../config/env.js";

const isHttps = config.teslaBaseUrl.startsWith("https://");
const sharedAgent = isHttps
  ? new https.Agent({ keepAlive: true, maxSockets: 200 })
  : new http.Agent({ keepAlive: true, maxSockets: 200 });

/**
 * Create an Axios instance pointed at the Tesla Fleet API.
 * When `accessToken` is provided, it is used as the Bearer token (per-user flow).
 * Otherwise falls back to the global TESLA_BEARER_TOKEN env var (legacy).
 */
export function createTeslaClient(accessToken?: string) {
  const token = accessToken ?? config.teslaBearerToken;

  return axios.create({
    baseURL: config.teslaBaseUrl,
    timeout: config.httpTimeoutMs,
    httpAgent: !isHttps ? sharedAgent : undefined,
    httpsAgent: isHttps ? sharedAgent : undefined,
    headers: { Authorization: `Bearer ${token}` },
  });
}
