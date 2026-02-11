/**
 * Device Auth Token Management for openClaw Gateway Protocol
 *
 * Stores and retrieves device-specific authentication tokens from SQLite.
 * Based on the official openClaw control-ui implementation.
 */

import { db } from "$lib/db";

export type DeviceAuthEntry = {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
};

function normalizeRole(role: string): string {
  return role.trim();
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  const out = new Set<string>();
  for (const scope of scopes) {
    const trimmed = scope.trim();
    if (trimmed) {
      out.add(trimmed);
    }
  }
  return [...out].sort();
}

export async function loadDeviceAuthToken(params: {
  deviceId: string;
  role: string;
}): Promise<DeviceAuthEntry | null> {
  const role = normalizeRole(params.role);
  try {
    const row = await db.auth.get(params.deviceId, role);
    if (!row || !row.token) return null;
    let scopes: string[] = [];
    try {
      scopes = JSON.parse(row.scopes);
    } catch {
      // keep empty
    }
    return {
      token: row.token,
      role: row.role,
      scopes,
      updatedAtMs: (row.updatedAt ?? 0) * 1000,
    };
  } catch {
    return null;
  }
}

export async function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): Promise<DeviceAuthEntry> {
  const role = normalizeRole(params.role);
  const scopes = normalizeScopes(params.scopes);
  const entry: DeviceAuthEntry = {
    token: params.token,
    role,
    scopes,
    updatedAtMs: Date.now(),
  };
  try {
    await db.auth.save({
      deviceId: params.deviceId,
      role,
      token: params.token,
      scopes: JSON.stringify(scopes),
    });
  } catch (e) {
    console.error("Failed to store device auth token:", e);
  }
  return entry;
}

export async function clearDeviceAuthToken(params: { deviceId: string; role: string }) {
  const role = normalizeRole(params.role);
  try {
    await db.auth.clear(params.deviceId, role);
  } catch (e) {
    console.error("Failed to clear device auth token:", e);
  }
}
