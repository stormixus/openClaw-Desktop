/**
 * Tauri API bindings for openClaw Desktop
 */

import { invoke } from "@tauri-apps/api/core";

export interface LocalOpenClawConfig {
  found: boolean;
  port: number | null;
  token: string | null;
  config_path: string | null;
}

/**
 * Detect locally installed openClaw configuration
 * Scans common config locations for port and token
 */
export async function detectLocalOpenClaw(): Promise<LocalOpenClawConfig> {
  try {
    return await invoke<LocalOpenClawConfig>("detect_local_openclaw");
  } catch (e) {
    console.error("Failed to detect local openClaw:", e);
    return {
      found: false,
      port: null,
      token: null,
      config_path: null,
    };
  }
}

/**
 * Build WebSocket URL from local config
 */
export function buildLocalGatewayUrl(config: LocalOpenClawConfig): string {
  const port = config.port ?? 18789;
  return `ws://127.0.0.1:${port}`;
}
