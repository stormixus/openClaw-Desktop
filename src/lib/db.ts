/**
 * SQLite Data Access Layer
 * Wraps Tauri invoke calls to the Rust database backend.
 * Falls back to localStorage when running outside Tauri (web-only dev mode).
 */

// ============================================================================
// Tauri Detection & Invoke
// ============================================================================

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !== undefined
  );
}

let _invoke: typeof import("@tauri-apps/api/core").invoke | null = null;

async function getInvoke() {
  if (!_invoke) {
    const mod = await import("@tauri-apps/api/core");
    _invoke = mod.invoke;
  }
  return _invoke;
}

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const fn = await getInvoke();
  return fn<T>(cmd, args);
}

// ============================================================================
// Types matching Rust models (camelCase via serde rename_all)
// ============================================================================

export interface GatewayRow {
  id: string;
  name: string;
  url: string;
  authMethod: string;
  token?: string | null;
  password?: string | null;
  deviceToken?: string | null;
  activeSessionKey: string;
  activeNpcThemeId: string;
  deviceId?: string | null;
  sortOrder: number;
  createdAt?: number | null;
  updatedAt?: number | null;
}

export interface SettingsRow {
  autoUpdate: boolean;
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  apiKeys: string; // JSON string
}

export interface DeviceIdentityRow {
  deviceId: string;
  publicKey: string;
  privateKey: string;
  createdAt?: number | null;
}

export interface DeviceAuthRow {
  deviceId: string;
  role: string;
  token: string;
  scopes: string; // JSON array string
  updatedAt?: number | null;
}

export interface NpcThemeRow {
  id: string;
  name: string;
  description?: string | null;
  data: string; // JSON string of theme data
  createdAt?: number | null;
}

export interface GameRow {
  id: string;
  emoji: string;
  titleKey: string;
  descKey: string;
  status: string;
  source: string;
  visible: boolean;
  sortOrder: number;
  createdAt?: number | null;
}

export interface BgPathEntry {
  themeId: string;
  filePath: string;
}

export interface GatewaySessionEntry {
  gatewayId: string;
  sessionKey: string;
}

export interface GatewayThemeEntry {
  gatewayId: string;
  themeId: string;
}

export interface GatewayDeviceIdEntry {
  gatewayId: string;
  deviceId: string;
}

export interface MigrationPayload {
  gateways?: GatewayRow[];
  activeGatewayId?: string;
  settings?: SettingsRow;
  deviceIdentity?: DeviceIdentityRow;
  deviceAuthEntries?: DeviceAuthRow[];
  customThemes?: NpcThemeRow[];
  bgPaths?: BgPathEntry[];
  gatewaySessions?: GatewaySessionEntry[];
  gatewayThemeIds?: GatewayThemeEntry[];
  gatewayDeviceIds?: GatewayDeviceIdEntry[];
}

// ============================================================================
// localStorage Fallback (for web-only dev mode without Tauri)
// ============================================================================

const LS_PREFIX = "openclaw.db.";

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

function lsRemove(key: string): void {
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    // ignore
  }
}

const DEFAULT_SETTINGS: SettingsRow = {
  autoUpdate: true,
  launchOnStartup: false,
  minimizeToTray: true,
  apiKeys: "{}",
};

const lsFallback = {
  migrate: async (_data: MigrationPayload) => {
    /* no-op in web mode — data is already in localStorage */
  },

  gateways: {
    list: async (): Promise<GatewayRow[]> => lsGet<GatewayRow[]>("gateways", []),
    save: async (gateway: GatewayRow) => {
      const list = lsGet<GatewayRow[]>("gateways", []);
      const idx = list.findIndex((g) => g.id === gateway.id);
      if (idx >= 0) list[idx] = gateway;
      else list.push(gateway);
      lsSet("gateways", list);
    },
    delete: async (id: string) => {
      const list = lsGet<GatewayRow[]>("gateways", []);
      lsSet(
        "gateways",
        list.filter((g) => g.id !== id),
      );
    },
    getActiveId: async (): Promise<string | null> =>
      lsGet<string | null>("activeGatewayId", null),
    setActiveId: async (id: string) => {
      lsSet("activeGatewayId", id);
    },
    updateState: async (id: string, key: string, value: string) => {
      const list = lsGet<GatewayRow[]>("gateways", []);
      const gw = list.find((g) => g.id === id);
      if (gw) {
        (gw as unknown as Record<string, unknown>)[key] = value;
        lsSet("gateways", list);
      }
    },
    updateOrders: async (updates: [string, number][]) => {
      const list = lsGet<GatewayRow[]>("gateways", []);
      for (const [id, order] of updates) {
        const gw = list.find((g) => g.id === id);
        if (gw) gw.sortOrder = order;
      }
      lsSet("gateways", list);
    },
  },

  settings: {
    get: async (): Promise<SettingsRow> =>
      lsGet<SettingsRow>("settings", DEFAULT_SETTINGS),
    save: async (settings: SettingsRow) => {
      lsSet("settings", settings);
    },
  },

  identity: {
    get: async (): Promise<DeviceIdentityRow | null> =>
      lsGet<DeviceIdentityRow | null>("identity", null),
    save: async (identity: DeviceIdentityRow) => {
      lsSet("identity", identity);
    },
  },

  auth: {
    get: async (
      deviceId: string,
      role: string,
    ): Promise<DeviceAuthRow | null> =>
      lsGet<DeviceAuthRow | null>(`auth.${deviceId}.${role}`, null),
    save: async (entry: DeviceAuthRow) => {
      lsSet(`auth.${entry.deviceId}.${entry.role}`, entry);
    },
    clear: async (deviceId: string, role: string) => {
      lsRemove(`auth.${deviceId}.${role}`);
    },
  },

  themes: {
    listCustom: async (): Promise<NpcThemeRow[]> =>
      lsGet<NpcThemeRow[]>("customThemes", []),
    save: async (theme: NpcThemeRow) => {
      const list = lsGet<NpcThemeRow[]>("customThemes", []);
      const idx = list.findIndex((t) => t.id === theme.id);
      if (idx >= 0) list[idx] = theme;
      else list.push(theme);
      lsSet("customThemes", list);
    },
    delete: async (id: string) => {
      const list = lsGet<NpcThemeRow[]>("customThemes", []);
      lsSet(
        "customThemes",
        list.filter((t) => t.id !== id),
      );
    },
  },

  bgPaths: {
    get: async (themeId: string): Promise<string | null> =>
      lsGet<string | null>(`bgPath.${themeId}`, null),
    set: async (themeId: string, path: string) => {
      lsSet(`bgPath.${themeId}`, path);
    },
  },

  games: {
    list: async (): Promise<GameRow[]> => lsGet<GameRow[]>("games_registry", []),
    upsert: async (game: GameRow) => {
      const list = lsGet<GameRow[]>("games_registry", []);
      const idx = list.findIndex((g) => g.id === game.id);
      if (idx >= 0) list[idx] = game;
      else list.push(game);
      lsSet("games_registry", list);
    },
    updateVisibility: async (id: string, visible: boolean) => {
      const list = lsGet<GameRow[]>("games_registry", []);
      const g = list.find((x) => x.id === id);
      if (g) g.visible = visible;
      lsSet("games_registry", list);
    },
    updateOrders: async (updates: [string, number][]) => {
      const list = lsGet<GameRow[]>("games_registry", []);
      for (const [id, order] of updates) {
        const g = list.find((x) => x.id === id);
        if (g) g.sortOrder = order;
      }
      lsSet("games_registry", list);
    },
    seed: async (games: GameRow[]) => {
      const existing = lsGet<GameRow[]>("games_registry", []);
      const ids = new Set(existing.map((g) => g.id));
      for (const g of games) {
        if (!ids.has(g.id)) existing.push(g);
      }
      lsSet("games_registry", existing);
    },
  },
};

// ============================================================================
// Data Access Object — auto-selects Tauri invoke or localStorage fallback
// ============================================================================

type DbApi = typeof lsFallback;

const tauriDb: DbApi = {
  migrate: (data) => tauriInvoke("db_migrate_from_json", { data }),

  gateways: {
    list: () => tauriInvoke<GatewayRow[]>("db_get_gateways"),
    save: (gateway) => tauriInvoke("db_save_gateway", { gateway }),
    delete: (id) => tauriInvoke("db_delete_gateway", { id }),
    getActiveId: () => tauriInvoke<string | null>("db_get_active_gateway_id"),
    setActiveId: (id) => tauriInvoke("db_set_active_gateway_id", { id }),
    updateState: (id, key, value) =>
      tauriInvoke("db_update_gateway_state", { id, key, value }),
    updateOrders: (updates) =>
      tauriInvoke("db_update_gateway_orders", { updates }),
  },

  settings: {
    get: () => tauriInvoke<SettingsRow>("db_get_settings"),
    save: (settings) => tauriInvoke("db_save_settings", { settings }),
  },

  identity: {
    get: () => tauriInvoke<DeviceIdentityRow | null>("db_get_device_identity"),
    save: (identity) =>
      tauriInvoke("db_save_device_identity", { identity }),
  },

  auth: {
    get: (deviceId, role) =>
      tauriInvoke<DeviceAuthRow | null>("db_get_device_auth", {
        deviceId,
        role,
      }),
    save: (entry) => tauriInvoke("db_save_device_auth", { entry }),
    clear: (deviceId, role) =>
      tauriInvoke("db_clear_device_auth", { deviceId, role }),
  },

  themes: {
    listCustom: () => tauriInvoke<NpcThemeRow[]>("db_get_custom_themes"),
    save: (theme) => tauriInvoke("db_save_custom_theme", { theme }),
    delete: (id) => tauriInvoke("db_delete_custom_theme", { id }),
  },

  bgPaths: {
    get: (themeId) => tauriInvoke<string | null>("db_get_bg_path", { themeId }),
    set: (themeId, path) =>
      tauriInvoke("db_set_bg_path", { themeId, path }),
  },

  games: {
    list: () => tauriInvoke<GameRow[]>("db_get_games"),
    upsert: (game) => tauriInvoke("db_upsert_game", { game }),
    updateVisibility: (id, visible) =>
      tauriInvoke("db_update_game_visibility", { id, visible }),
    updateOrders: (updates) =>
      tauriInvoke("db_update_game_orders", { updates }),
    seed: (games) => tauriInvoke("db_seed_games", { games }),
  },
};

export const db: DbApi = new Proxy({} as DbApi, {
  get(_target, prop: string) {
    const backend = isTauri() ? tauriDb : lsFallback;
    return backend[prop as keyof DbApi];
  },
});
