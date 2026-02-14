/**
 * OpenClaw Game Plugin System — Type definitions
 */

// ============================================================================
// Message Protocol
// ============================================================================

export interface OcMessage<T = unknown> {
  v: '0.1';
  id: string;
  type: string;
  payload?: T;
  replyTo?: string;
}

// ============================================================================
// Plugin Manifest (mirrors manifest.json inside .ocpkg)
// ============================================================================

export interface PluginPermissions {
  storage?: 'scoped' | 'none';
  clipboard?: 'read' | 'write' | 'readwrite';
  network?: { mode: 'deny' | 'allow'; allowlist?: string[] };
  llm?: { mode: 'deny' | 'ask' | 'allow'; models?: string[] };
  notifications?: boolean;
}

export interface PluginCapabilities {
  saveState?: boolean;
  replay?: boolean;
  leaderboard?: boolean;
}

export interface PluginManifest {
  schemaVersion: string;
  id: string;
  name: string;
  version: string;
  description?: string;
  entry: string;
  icon?: string;
  authors?: { name: string }[];
  categories?: string[];
  minHostVersion?: string;
  permissions: PluginPermissions;
  capabilities?: PluginCapabilities;
}

// ============================================================================
// Plugin Metadata (returned by Tauri backend after install)
// ============================================================================

export interface PluginMeta {
  id: string;
  name: string;
  version: string;
  description: string;
  icon?: string;
  entry: string;
  permissions: PluginPermissions;
  capabilities: PluginCapabilities;
  installPath: string;
}

// ============================================================================
// Granted Permissions (resolved after user approval)
// ============================================================================

export interface GrantedPermissions {
  storage: boolean;
  clipboard: 'read' | 'write' | 'readwrite' | false;
  network: boolean;
  llm: boolean;
  notifications: boolean;
}

// ============================================================================
// Init Payload (host → plugin on oc:init)
// ============================================================================

export interface InitPayload {
  pluginId: string;
  sessionId: string;
  locale: string;
  theme: Record<string, string>;
  capabilities: string[];
  grantedPermissions: GrantedPermissions;
}

// ============================================================================
// LLM Invoke Payload (plugin → host)
// ============================================================================

export interface LlmInvokePayload {
  model?: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  json?: boolean;
}

export interface LlmInvokeResult {
  content: string;
  tokensUsed?: number;
}

// ============================================================================
// Storage Payloads
// ============================================================================

export interface StorageGetPayload { key: string }
export interface StorageSetPayload { key: string; value: unknown }
export interface StorageDeletePayload { key: string }
export interface StorageListPayload { prefix?: string }
