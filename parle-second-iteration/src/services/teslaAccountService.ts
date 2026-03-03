import axios from "axios";
import { prisma } from "../db/prisma.js";
import { config } from "../config/env.js";

// ── Public types ──────────────────────────────────────────

export interface TeslaLinkStatus {
  linked: boolean;
  vehicleCount: number;
  hasVehicles: boolean;
  tokenExpired?: boolean;
  linkedAt?: string;
  updatedAt?: string;
}

// ── Private types (Tesla API responses) ───────────────────

interface TeslaVehicleListItem {
  id: number;
  vehicle_id: number;
  vin: string;
  display_name: string | null;
  state: string;
}

interface TeslaVehicleListResponse {
  response: TeslaVehicleListItem[];
  count: number;
}

interface TeslaRefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// ── Internal helpers ──────────────────────────────────────

/**
 * Call the Tesla Fleet API to list the user's vehicles.
 * Uses the per-user access token (not the fleet bearer token).
 * Returns the vehicle count.
 */
async function fetchUserVehicleCount(accessToken: string): Promise<number> {
  const res = await axios.get<TeslaVehicleListResponse>(
    `${config.teslaBaseUrl}/api/1/vehicles`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: config.httpTimeoutMs,
    },
  );
  return res.data?.count ?? res.data?.response?.length ?? 0;
}

/**
 * Refresh an expired Tesla access token using the refresh_token grant.
 * Updates the TeslaAccount row in the database with the new credentials.
 * Returns the new access token, or null if refresh fails.
 * Never leaks tokens in logs.
 */
async function refreshAccessToken(
  userId: string,
  refreshToken: string,
): Promise<string | null> {
  const tokenUrl = process.env.TESLA_TOKEN_URL;
  const clientId = process.env.TESLA_CLIENT_ID;
  if (!tokenUrl || !clientId) return null;

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    });

    // Include client_secret if available (required by some Tesla app types)
    const clientSecret = process.env.TESLA_CLIENT_SECRET;
    if (clientSecret) {
      params.set("client_secret", clientSecret);
    }

    const res = await axios.post<TeslaRefreshTokenResponse>(tokenUrl, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: config.httpTimeoutMs,
    });

    const { access_token, refresh_token: newRefresh, expires_in } = res.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await prisma.teslaAccount.update({
      where: { userId },
      data: {
        accessToken: access_token,
        refreshToken: newRefresh,
        expiresAt,
      },
    });

    return access_token;
  } catch {
    return null;
  }
}

// ── Main export ───────────────────────────────────────────

/**
 * Get the Tesla link status for a user, including live vehicle count.
 * - If unlinked: { linked: false, vehicleCount: 0, hasVehicles: false }
 * - If linked:   { linked: true, vehicleCount, hasVehicles, ... }
 *
 * Attempts token refresh when expired.
 * Never leaks tokens or secrets in the response.
 */
export async function getTeslaLinkStatus(
  userId: string,
): Promise<TeslaLinkStatus> {
  const account = await prisma.teslaAccount.findUnique({
    where: { userId },
    select: {
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!account) {
    return { linked: false, vehicleCount: 0, hasVehicles: false };
  }

  const base = {
    linked: true as const,
    linkedAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };

  let accessToken = account.accessToken;
  let tokenExpired = account.expiresAt.getTime() < Date.now();

  // ── Token refresh if expired ──
  if (tokenExpired) {
    const refreshed = await refreshAccessToken(userId, account.refreshToken);
    if (refreshed) {
      accessToken = refreshed;
      tokenExpired = false;
    } else {
      // Refresh failed — still linked, but can't query vehicles
      return { ...base, vehicleCount: 0, hasVehicles: false, tokenExpired: true };
    }
  }

  // ── Fetch vehicle count from Tesla Fleet API ──
  try {
    const vehicleCount = await fetchUserVehicleCount(accessToken);
    return {
      ...base,
      vehicleCount,
      hasVehicles: vehicleCount > 0,
      tokenExpired: false,
    };
  } catch {
    // Tesla API error — still linked, return 0 vehicles gracefully
    return { ...base, vehicleCount: 0, hasVehicles: false, tokenExpired };
  }
}
