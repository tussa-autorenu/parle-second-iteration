import axios, { type AxiosInstance } from "axios";
import http from "node:http";
import https from "node:https";
import { config } from "../config/env.js";

function makeAgent(url: string) {
  return url.startsWith("https://")
    ? new https.Agent({ keepAlive: true, maxSockets: 200 })
    : new http.Agent({ keepAlive: true, maxSockets: 200 });
}

const fleetIsHttps = config.teslaBaseUrl.startsWith("https://");
const fleetAgent = makeAgent(config.teslaBaseUrl);

const proxyUrl = config.teslaCommandProxyUrl;
const proxyIsHttps = proxyUrl?.startsWith("https://") ?? false;
const proxyAgent = proxyUrl ? makeAgent(proxyUrl) : null;

/**
 * Axios instance pointed at the Tesla Fleet API.
 * Used for data queries (vehicle_data) and direct REST commands.
 */
export function createTeslaClient(accessToken?: string) {
  const token = accessToken ?? config.teslaBearerToken;

  return axios.create({
    baseURL: config.teslaBaseUrl,
    timeout: config.httpTimeoutMs,
    httpAgent: !fleetIsHttps ? fleetAgent : undefined,
    httpsAgent: fleetIsHttps ? fleetAgent : undefined,
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Axios instance pointed at the official Tesla Vehicle Command HTTP proxy.
 * The proxy signs commands via the Vehicle Command Protocol for vehicles
 * that require it. Returns null when TESLA_COMMAND_PROXY_URL is not set.
 */
export function createTeslaProxyClient(accessToken: string): AxiosInstance | null {
  if (!proxyUrl || !proxyAgent) return null;

  return axios.create({
    baseURL: proxyUrl,
    timeout: config.httpTimeoutMs,
    httpAgent: !proxyIsHttps ? proxyAgent : undefined,
    httpsAgent: proxyIsHttps ? proxyAgent : undefined,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
