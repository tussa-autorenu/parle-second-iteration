import axios from "axios";
import http from "node:http";
import https from "node:https";
import { config } from "../config/env.js";

export function createTeslaClient() {
  const isHttps = config.teslaBaseUrl.startsWith("https://");
  const agent = isHttps
    ? new https.Agent({ keepAlive: true, maxSockets: 200 })
    : new http.Agent({ keepAlive: true, maxSockets: 200 });

  return axios.create({
    baseURL: config.teslaBaseUrl,
    timeout: config.httpTimeoutMs,
    httpAgent: !isHttps ? agent : undefined,
    httpsAgent: isHttps ? agent : undefined,
    headers: { Authorization: `Bearer ${config.teslaBearerToken}` }
  });
}
