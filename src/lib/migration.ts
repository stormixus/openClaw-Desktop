/**
 * One-time migration from localStorage to SQLite.
 * Runs on first boot after update; idempotent via a localStorage flag.
 */

import { db } from "./db";
import type {
  GatewayRow,
  SettingsRow,
  DeviceIdentityRow,
  DeviceAuthRow,
  NpcThemeRow,
  BgPathEntry,
  GatewaySessionEntry,
  GatewayThemeEntry,
  GatewayDeviceIdEntry,
  MigrationPayload,
} from "./db";

const MIGRATION_FLAG = "openclaw.db_migrated";

export async function migrateIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  console.log("[Migration] Starting localStorage → SQLite migration...");

  try {
    const payload = collectLegacyData();

    // Only migrate if there's actually data to migrate
    const hasData =
      payload.gateways?.length ||
      payload.settings ||
      payload.deviceIdentity ||
      payload.deviceAuthEntries?.length ||
      payload.customThemes?.length;

    if (hasData) {
      await db.migrate(payload);
      console.log("[Migration] Migration completed successfully");
    } else {
      console.log("[Migration] No legacy data found, skipping");
    }

    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch (e) {
    console.error("[Migration] Migration failed:", e);
    // Don't set the flag — retry on next boot
  }
}

function collectLegacyData(): MigrationPayload {
  const payload: MigrationPayload = {};

  // ── Gateways ──────────────────────────────────────────
  try {
    const raw = localStorage.getItem("openclaw.gateways");
    if (raw) {
      const data = JSON.parse(raw) as {
        gateways?: Array<{
          id: string;
          name: string;
          url: string;
          authMethod?: string;
          token?: string;
          password?: string;
          deviceToken?: string;
        }>;
        activeId?: string;
      };

      if (data.gateways?.length) {
        payload.gateways = data.gateways.map((g) => ({
          id: g.id,
          name: g.name,
          url: g.url,
          authMethod: g.authMethod ?? "token",
          token: g.token ?? null,
          password: g.password ?? null,
          deviceToken: g.deviceToken ?? null,
          activeSessionKey: "main",
          activeNpcThemeId: "default",
          deviceId: null,
          sortOrder: 0,
        }));
      }

      if (data.activeId) {
        payload.activeGatewayId = data.activeId;
      }
    }
  } catch (e) {
    console.warn("[Migration] Failed to read gateways:", e);
  }

  // ── Per-gateway session keys ──────────────────────────
  try {
    const sessions: GatewaySessionEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("openclaw.session.")) {
        const gatewayId = key.slice("openclaw.session.".length);
        const sessionKey = localStorage.getItem(key);
        if (gatewayId && sessionKey) {
          sessions.push({ gatewayId, sessionKey });
        }
      }
    }
    if (sessions.length) payload.gatewaySessions = sessions;
  } catch (e) {
    console.warn("[Migration] Failed to read sessions:", e);
  }

  // ── Per-gateway active NPC theme IDs ──────────────────
  try {
    const themeIds: GatewayThemeEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("openclaw.npcActiveTheme.")) {
        const gatewayId = key.slice("openclaw.npcActiveTheme.".length);
        const themeId = localStorage.getItem(key);
        if (gatewayId && themeId) {
          themeIds.push({ gatewayId, themeId });
        }
      }
    }
    if (themeIds.length) payload.gatewayThemeIds = themeIds;
  } catch (e) {
    console.warn("[Migration] Failed to read theme IDs:", e);
  }

  // ── Per-gateway device IDs ────────────────────────────
  try {
    const deviceIds: GatewayDeviceIdEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("openclaw.deviceId.")) {
        const gatewayId = key.slice("openclaw.deviceId.".length);
        const deviceId = localStorage.getItem(key);
        if (gatewayId && deviceId) {
          deviceIds.push({ gatewayId, deviceId });
        }
      }
    }
    if (deviceIds.length) payload.gatewayDeviceIds = deviceIds;
  } catch (e) {
    console.warn("[Migration] Failed to read device IDs:", e);
  }

  // ── Settings ──────────────────────────────────────────
  try {
    const raw = localStorage.getItem("openclaw.settings");
    if (raw) {
      const parsed = JSON.parse(raw) as {
        autoUpdate?: boolean;
        launchOnStartup?: boolean;
        minimizeToTray?: boolean;
        apiKeys?: Record<string, string>;
      };
      payload.settings = {
        autoUpdate: parsed.autoUpdate ?? true,
        launchOnStartup: parsed.launchOnStartup ?? false,
        minimizeToTray: parsed.minimizeToTray ?? true,
        apiKeys: JSON.stringify(parsed.apiKeys ?? {}),
      };
    }
  } catch (e) {
    console.warn("[Migration] Failed to read settings:", e);
  }

  // ── Device Identity ───────────────────────────────────
  try {
    const raw = localStorage.getItem("openclaw-device-identity-v1");
    if (raw) {
      const parsed = JSON.parse(raw) as {
        version: number;
        deviceId: string;
        publicKey: string;
        privateKey: string;
      };
      if (parsed.version === 1 && parsed.deviceId && parsed.publicKey && parsed.privateKey) {
        payload.deviceIdentity = {
          deviceId: parsed.deviceId,
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        };
      }
    }
  } catch (e) {
    console.warn("[Migration] Failed to read device identity:", e);
  }

  // ── Device Auth ───────────────────────────────────────
  try {
    const raw = localStorage.getItem("openclaw.device.auth.v1");
    if (raw) {
      const parsed = JSON.parse(raw) as {
        version: number;
        deviceId: string;
        tokens: Record<string, { token: string; role: string; scopes: string[] }>;
      };
      if (parsed.version === 1 && parsed.tokens) {
        const entries: DeviceAuthRow[] = [];
        for (const [role, entry] of Object.entries(parsed.tokens)) {
          entries.push({
            deviceId: parsed.deviceId,
            role,
            token: entry.token,
            scopes: JSON.stringify(entry.scopes ?? []),
          });
        }
        if (entries.length) payload.deviceAuthEntries = entries;
      }
    }
  } catch (e) {
    console.warn("[Migration] Failed to read device auth:", e);
  }

  // ── Custom NPC Themes ─────────────────────────────────
  try {
    const raw = localStorage.getItem("openclaw.npcThemes");
    if (raw) {
      const themes = JSON.parse(raw) as Array<{
        id: string;
        name: string;
        description?: string;
        [key: string]: unknown;
      }>;
      payload.customThemes = themes.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? null,
        data: JSON.stringify(t),
      }));
    }
  } catch (e) {
    console.warn("[Migration] Failed to read custom themes:", e);
  }

  // ── Background Paths ──────────────────────────────────
  try {
    const bgPaths: BgPathEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("openclaw.npcBgPath.")) {
        const themeId = key.slice("openclaw.npcBgPath.".length);
        const filePath = localStorage.getItem(key);
        if (themeId && filePath) {
          bgPaths.push({ themeId, filePath });
        }
      }
    }
    if (bgPaths.length) payload.bgPaths = bgPaths;
  } catch (e) {
    console.warn("[Migration] Failed to read bg paths:", e);
  }

  return payload;
}
