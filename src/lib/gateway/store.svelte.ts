/**
 * Gateway Store - Multi-gateway state management (Svelte 5 Runes)
 */

import { browser } from "$app/environment";
import { invoke } from '@tauri-apps/api/core';
import { notifications } from "$lib/services/notifications";
import { db } from "$lib/db";
import type { GatewayRow } from "$lib/db";
import { GatewayClient } from "./client";
import type {
  GatewayConfig,
  GatewayState,
  ConnectionStatus,
  GatewaySnapshot,
  ChatMessage,
  ChatEventPayload,
  ModelsSnapshot,
  SessionInfo,
} from "./types";
import { getActiveTheme, loadThemeForGateway } from "./npcThemeStore.svelte";

const CHATMODE_KEY_PREFIX = "openclaw.chatmode";


// ============================================================================
// Reactive State (Svelte 5 Runes) - wrapped in object for export
// ============================================================================

// Store object containing all reactive state
export const store = $state({
  gateways: [] as GatewayConfig[],
  activeGatewayId: null as string | null,
  gatewayStates: new Map<string, GatewayState>(),
  chatMessages: [] as ChatMessage[],
  modelsSnapshot: null as ModelsSnapshot | null,
  isStreaming: false,
  streamingContent: "",
  sessionKey: "",
  sessions: [] as SessionInfo[],  // Available sessions
  notificationsEnabled: true,     // Notification setting
  chatMode: "chat" as "chat" | "npc",  // Chat display mode
  npcEmotion: "neutral" as string,      // Current NPC emotion state
  npcAction: null as string | null,     // Current NPC action (wave, nod, shake, bounce, bow)
  npcBackground: "default" as string,   // Current NPC background theme or image path
  assistantMeta: null as { name: string; emoji: string } | null,  // Agent identity from gateway
  // Forge State
  forgeState: {
    activeDocId: null as string | null,
    activeDocContext: null as { name: string; type: string; excerpt: string } | null,
    pendingPatch: null as any | null,
    history: [] as any[],
  }
});

// Active gateway clients (id -> client) - not reactive, just a cache
const clients = new Map<string, GatewayClient>();

// ============================================================================
// Exported Reactive Getters (for use in components)
// ============================================================================

// Legacy getter functions (for compatibility)
export function getGateways(): GatewayConfig[] {
  return store.gateways;
}

export function getActiveGatewayId(): string | null {
  return store.activeGatewayId;
}

export function getGatewayStates(): Map<string, GatewayState> {
  return store.gatewayStates;
}

export function getChatMessages(): ChatMessage[] {
  return store.chatMessages;
}

export function getModelsSnapshot(): ModelsSnapshot | null {
  return store.modelsSnapshot;
}

export function getIsStreaming(): boolean {
  return store.isStreaming;
}

export function getStreamingContent(): string {
  return store.streamingContent;
}

export function getSessionKey(): string {
  return store.sessionKey;
}

export function getChatMode(): "chat" | "npc" {
  return store.chatMode;
}

export function getNpcEmotion(): string {
  return store.npcEmotion;
}

// ============================================================================
// NPC Directing Tags Parser
// ============================================================================

/** Strip <npc_persona>...</npc_persona> and <npc_persona_end>...</npc_persona_end> prefix injected for NPC mode — keep display clean */
function stripSystemPrefix(msg: ChatMessage): ChatMessage {
  if (msg.role !== "user" || !msg.content) return msg;
  const stripped = msg.content
    .replace(/^<npc_persona>[\s\S]*?<\/npc_persona>\s*/s, "")
    .replace(/^<npc_persona_end>[\s\S]*?<\/npc_persona_end>\s*/s, "")
    .trim();
  if (stripped === msg.content) return msg;
  return { ...msg, content: stripped };
}

// Valid face/emotion values
const VALID_FACES = ["neutral", "happy", "thinking", "excited", "sad", "surprised", "angry", "calm"];
// Valid action values
const VALID_ACTIONS = ["wave", "nod", "shake", "bounce", "bow"];
// Valid preset background names
const VALID_BG_PRESETS = ["default", "forest", "space", "cozy", "ocean", "sunset"];

// Matches [face:happy], [act:wave], [bg:space], [bg:/path/to/image.png]
const DIRECTIVE_REGEX = /\[(face|act|bg):([^\]]+)\]/gi;
// Backward-compatible: standalone [happy], [sad], etc.
const LEGACY_EMOTION_REGEX = /\[(neutral|happy|thinking|excited|sad|surprised|angry|calm)\]/gi;

export interface NpcDirectives {
  cleanContent: string;
  face: string | null;
  act: string | null;
  bg: string | null;
}

/**
 * Parse and strip directing tags from message content.
 * Supports:
 *   [face:happy]  - expression/emotion
 *   [act:wave]    - character action animation
 *   [bg:space]    - preset background theme
 *   [bg:/path/to/image.png] - dynamic image background
 *   [happy]       - backward-compat emotion (mapped to face)
 */
export function parseNpcDirectives(content: string): NpcDirectives {
  let face: string | null = null;
  let act: string | null = null;
  let bg: string | null = null;

  // Parse [face:], [act:], [bg:] tags
  let cleaned = content.replace(DIRECTIVE_REGEX, (_match, type, value) => {
    const t = type.toLowerCase();
    const v = value.trim();
    if (t === "face" && VALID_FACES.includes(v.toLowerCase())) {
      face = v.toLowerCase();
    } else if (t === "act" && VALID_ACTIONS.includes(v.toLowerCase())) {
      act = v.toLowerCase();
    } else if (t === "bg") {
      // bg can be a preset name or an image file path
      bg = VALID_BG_PRESETS.includes(v.toLowerCase()) ? v.toLowerCase() : v;
    }
    return "";
  });

  // Backward compat: parse standalone [happy] style tags
  cleaned = cleaned.replace(LEGACY_EMOTION_REGEX, (_match, emotion) => {
    if (!face) face = emotion.toLowerCase();
    return "";
  });

  return { cleanContent: cleaned.trim(), face, act, bg };
}

/** @deprecated Use parseNpcDirectives instead */
export function parseNpcEmotion(content: string): { cleanContent: string; emotion: string | null } {
  const { cleanContent, face } = parseNpcDirectives(content);
  return { cleanContent, emotion: face };
}

export function toggleChatMode(): void {
  store.chatMode = store.chatMode === "chat" ? "npc" : "chat";
  // Persist per-gateway in localStorage (lightweight UI pref)
  if (browser && store.activeGatewayId) {
    localStorage.setItem(
      `${CHATMODE_KEY_PREFIX}.${store.activeGatewayId}`,
      store.chatMode
    );
  }
}

export function setNpcEmotion(emotion: string): void {
  store.npcEmotion = emotion;
}

export function setNpcAction(action: string | null): void {
  store.npcAction = action;
}

export function setNpcBackground(bg: string): void {
  store.npcBackground = bg;
}

export function setForgeDocument(id: string | null, context?: { name: string; type: string; excerpt: string }): void {
  store.forgeState.activeDocId = id;
  store.forgeState.activeDocContext = context ?? null;
}

export function getAssistantMeta(): { name: string; emoji: string } | null {
  return store.assistantMeta;
}

// Derived getters
export function getActiveGateway(): GatewayConfig | null {
  return store.gateways.find(g => g.id === store.activeGatewayId) ?? null;
}

export function getActiveGatewayState(): GatewayState | null {
  return store.activeGatewayId ? store.gatewayStates.get(store.activeGatewayId) ?? null : null;
}

export function getCurrentAgent(): import("./types").AgentInfo | null {
  const state = getActiveGatewayState();
  if (!state?.snapshot?.agents) return null;
  // For now, return the first agent or "main" agent
  const agentId = store.sessionKey.includes("/")
    ? store.sessionKey.split("/")[0]
    : "main";
  return state.snapshot.agents.find(a => a.id === agentId) ?? state.snapshot.agents[0] ?? null;
}

export function getActiveClient(): GatewayClient | null {
  return store.activeGatewayId ? clients.get(store.activeGatewayId) ?? null : null;
}

// ============================================================================
// Chat History (server-authoritative, matching official openClaw UI)
// ============================================================================

/**
 * Generate a unique session key for a new conversation.
 */
function generateSessionKey(): string {
  return `desktop-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Get or create a session key for a gateway.
 * Reads from the gateway's activeSessionKey (stored in SQLite).
 */
function resolveSessionKey(gatewayId: string): string {
  // The session key is loaded from the DB as part of the GatewayRow
  const gw = store.gateways.find(g => g.id === gatewayId);
  if (gw) {
    // Check if there's a per-gateway row with activeSessionKey
    const row = gatewayRowCache.get(gatewayId);
    if (row?.activeSessionKey && !row.activeSessionKey.startsWith("desktop-")) {
      return row.activeSessionKey;
    }
  }
  return "main";
}

/**
 * Persist the active session key for a gateway (to SQLite).
 */
function saveSessionKey(gatewayId: string, sessionKey: string): void {
  db.gateways.updateState(gatewayId, "active_session_key", sessionKey).catch((e) => {
    console.error("[Store] Failed to save session key:", e);
  });
  // Also update local cache
  const row = gatewayRowCache.get(gatewayId);
  if (row) row.activeSessionKey = sessionKey;
}

// ============================================================================
// Gateway Row Cache (keeps DB row data in sync with reactive state)
// ============================================================================

const gatewayRowCache = new Map<string, GatewayRow>();

/**
 * Convert a GatewayRow (from DB) to a GatewayConfig (for the store/client).
 */
function rowToConfig(row: GatewayRow): GatewayConfig {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    authMethod: row.authMethod as GatewayConfig["authMethod"],
    token: row.token ?? undefined,
    password: row.password ?? undefined,
    deviceToken: row.deviceToken ?? undefined,
  };
}

/**
 * Convert a GatewayConfig (from the store) to a GatewayRow (for DB).
 */
function configToRow(config: GatewayConfig): GatewayRow {
  const existing = gatewayRowCache.get(config.id);
  return {
    id: config.id,
    name: config.name,
    url: config.url,
    authMethod: config.authMethod,
    token: config.token ?? null,
    password: config.password ?? null,
    deviceToken: config.deviceToken ?? null,
    activeSessionKey: existing?.activeSessionKey ?? "main",
    activeNpcThemeId: existing?.activeNpcThemeId ?? "default",
    deviceId: existing?.deviceId ?? null,
    sortOrder: existing?.sortOrder ?? 0,
  };
}

// ============================================================================
// Gateway Management
// ============================================================================

export async function loadGateways(): Promise<void> {
  if (!browser) return;

  try {
    const rows = await db.gateways.list();
    const activeId = await db.gateways.getActiveId();

    // Cache rows and build configs
    gatewayRowCache.clear();
    for (const row of rows) {
      gatewayRowCache.set(row.id, row);
    }

    store.gateways = rows.map(rowToConfig);
    store.activeGatewayId = activeId ?? null;

    // Restore per-gateway chat mode preference (still in localStorage)
    if (store.activeGatewayId) {
      const savedMode = localStorage.getItem(`${CHATMODE_KEY_PREFIX}.${store.activeGatewayId}`);
      store.chatMode = (savedMode === "npc" ? "npc" : "chat") as "chat" | "npc";
      loadThemeForGateway(store.activeGatewayId);
    }
  } catch (e) {
    console.error("Failed to load gateways from DB:", e);
  }
}

export async function saveGateways(): Promise<void> {
  if (!browser) return;

  try {
    // Save active gateway ID
    if (store.activeGatewayId) {
      await db.gateways.setActiveId(store.activeGatewayId);
    }
    // Individual gateway saves are handled by addGateway/updateGateway/removeGateway
  } catch (e) {
    console.error("Failed to save gateways:", e);
  }
}

export async function addGateway(config: Omit<GatewayConfig, "id">): Promise<{ id: string; error?: string }> {
  // Check for duplicate URL
  const normalizedUrl = config.url.replace(/\/+$/, "").toLowerCase();
  const existing = store.gateways.find(g =>
    g.url.replace(/\/+$/, "").toLowerCase() === normalizedUrl
  );

  if (existing) {
    return { id: "", error: `Gateway already exists: ${existing.name}` };
  }

  const id = crypto.randomUUID();
  const gateway: GatewayConfig = { ...config, id };
  const row = configToRow(gateway);

  try {
    await db.gateways.save(row);
    gatewayRowCache.set(id, row);
    store.gateways = [...store.gateways, gateway];
    await saveGateways();
  } catch (e) {
    console.error("Failed to add gateway:", e);
    return { id: "", error: String(e) };
  }

  return { id };
}

export function isGatewayDuplicate(url: string): boolean {
  const normalizedUrl = url.replace(/\/+$/, "").toLowerCase();
  return store.gateways.some(g =>
    g.url.replace(/\/+$/, "").toLowerCase() === normalizedUrl
  );
}

export function getGatewayByUrl(url: string): GatewayConfig | undefined {
  const normalizedUrl = url.replace(/\/+$/, "").toLowerCase();
  return store.gateways.find(g =>
    g.url.replace(/\/+$/, "").toLowerCase() === normalizedUrl
  );
}

export async function updateGateway(id: string, updates: Partial<GatewayConfig>): Promise<void> {
  store.gateways = store.gateways.map(g => g.id === id ? { ...g, ...updates } : g);
  const updated = store.gateways.find(g => g.id === id);
  if (updated) {
    const row = configToRow(updated);
    try {
      await db.gateways.save(row);
      gatewayRowCache.set(id, row);
    } catch (e) {
      console.error("Failed to update gateway:", e);
    }
  }
}

export async function removeGateway(id: string): Promise<void> {
  // Disconnect first
  disconnectGateway(id);

  store.gateways = store.gateways.filter(g => g.id !== id);
  gatewayRowCache.delete(id);

  // If removed gateway was active, set to first available
  if (store.activeGatewayId === id) {
    store.activeGatewayId = store.gateways[0]?.id ?? null;
  }

  try {
    await db.gateways.delete(id);
    await saveGateways();
  } catch (e) {
    console.error("Failed to remove gateway:", e);
  }
}

export async function setActiveGateway(id: string): Promise<void> {
  store.activeGatewayId = id;
  lastSentMode = null;

  try {
    await db.gateways.setActiveId(id);
  } catch (e) {
    console.error("Failed to set active gateway:", e);
  }

  // Restore per-gateway chat mode preference (still in localStorage)
  if (browser) {
    const saved = localStorage.getItem(`${CHATMODE_KEY_PREFIX}.${id}`);
    store.chatMode = (saved === "npc" ? "npc" : "chat") as "chat" | "npc";
    loadThemeForGateway(id);
  }

  // Reload data for newly active gateway
  const client = clients.get(id);
  if (client && client.getStatus() === "connected") {
    // Reset current data
    store.modelsSnapshot = null;
    store.sessions = [];
    store.chatMessages = [];

    // Load everything for the new active gateway
    loadGatewayData(id);
  }
}

// ============================================================================
// Connection Management
// ============================================================================

export function connectGateway(id: string): void {
  const gateway = store.gateways.find(g => g.id === id);
  if (!gateway) return;

  // Create or get existing client
  let client = clients.get(id);
  if (!client) {
    client = new GatewayClient(gateway);
    clients.set(id, client);

    // Set up event handlers
    client
      .on("status", (status) => handleStatusChange(id, status as ConnectionStatus))
      .on("snapshot", (snapshot) => handleSnapshot(id, snapshot as GatewaySnapshot))
      .on("chat", (event) => handleChatEvent(id, event as ChatEventPayload))
      .on("message", (message) => handleChatMessage(id, message as ChatMessage))
      .on("error", (error) => handleError(id, error as string))
      .on("tool", (tool) => handleToolCall(id, tool as any));
  }

  // Initialize state
  const newStates = new Map(store.gatewayStates);
  newStates.set(id, {
    config: gateway,
    status: "connecting",
  });
  store.gatewayStates = newStates;

  client.connect();
}

export function disconnectGateway(id: string): void {
  const client = clients.get(id);
  if (client) {
    client.disconnect();
    clients.delete(id);
  }

  const newStates = new Map(store.gatewayStates);
  const state = newStates.get(id);
  if (state) {
    newStates.set(id, { ...state, status: "disconnected" });
  }
  store.gatewayStates = newStates;
}

// ============================================================================
// Event Handlers
// ============================================================================

function handleToolCall(gatewayId: string, tool: any): void {
  if (gatewayId !== store.activeGatewayId) return;

  // Intercept document editing tools
  if (tool.name === "edit_document" || tool.name === "update_spreadsheet") {
    console.log("[Store] Intercepted forge tool call:", tool);

    // Process operations and stage patch
    (async () => {
      try {
        const ops = tool.args.operations || [];
        if (!store.forgeState.activeDocId) {
          throw new Error("No active document to edit");
        }

        const patchOps = ops.map((op: any) => {
          if (op.op === 'cell_update') {
             // Value conversion for Rust enum
             let val: any = "Empty";
             if (op.value !== null && op.value !== undefined) {
                 if (typeof op.value === 'string') val = { String: op.value };
                 else if (typeof op.value === 'number') val = { Number: op.value };
                 else if (typeof op.value === 'boolean') val = { Bool: op.value };
                 // Basic date detection could go here but skipping for simplicity
             }
             return { CellUpdate: { sheet: op.sheet, row: op.row, col: op.col, value: val } };
          } else if (op.op === 'row_delete') {
             return { RowDelete: { sheet: op.sheet, index: op.index } };
          } else if (op.op === 'row_insert') {
             // Convert values array
             const values = (op.values || []).map((v: any) => {
                 if (v === null || v === undefined) return "Empty";
                 if (typeof v === 'string') return { String: v };
                 if (typeof v === 'number') return { Number: v };
                 if (typeof v === 'boolean') return { Bool: v };
                 return "Empty";
             });
             return { RowInsert: { sheet: op.sheet, index: op.index, values } };
          } else if (op.op === 'col_delete') {
             return { ColDelete: { sheet: op.sheet, index: op.index } };
          }
          return null;
        }).filter((x: any) => x !== null);

        // Call Rust backend
        const rustPreview = await invoke<any>('doc_stage_patch', {
            id: store.forgeState.activeDocId,
            patch: { operations: patchOps }
        });

        // Store patch for approval UI
        store.forgeState.pendingPatch = rustPreview;

        // Notify user via chat message (optimistic)
        store.chatMessages = [...store.chatMessages, {
          id: crypto.randomUUID(),
          role: "system",
          content: `📝 Proposed changes: ${rustPreview.summary || 'Updates ready'}. Please approve or reject in the Forge tab.`,
          timestamp: new Date().toISOString()
        }];
      } catch (e: any) {
        console.error("Failed to stage patch:", e);
        store.chatMessages = [...store.chatMessages, {
          id: crypto.randomUUID(),
          role: "system",
          content: `❌ Failed to apply changes: ${e.message || e}`,
          timestamp: new Date().toISOString()
        }];
      }
    })();
  }
}

function handleStatusChange(id: string, status: ConnectionStatus): void {
  const newStates = new Map(store.gatewayStates);
  const state = newStates.get(id);
  if (state) {
    newStates.set(id, { ...state, status });
  }
  store.gatewayStates = newStates;

  // When connected, load models/sessions/history for the active gateway
  if (status === "connected" && id === store.activeGatewayId) {
    loadGatewayData(id);
  }
}

/**
 * Load all gateway data (models, sessions, chat history) for the given gateway.
 * Called when a gateway first connects or when switching active gateways.
 */
async function loadGatewayData(id: string): Promise<void> {
  const client = clients.get(id);
  if (!client) return;

  // Resolve session key
  if (!store.sessionKey) {
    store.sessionKey = resolveSessionKey(id);
    console.log("[Store] Session key resolved:", store.sessionKey);
  }

  // Fetch models
  try {
    const models = await client.getModels();
    console.log("[Store] Models loaded:", JSON.stringify(models));
    if (models?.available?.length || models?.current) {
      store.modelsSnapshot = models;
    }
  } catch (e) {
    console.warn("[Store] Failed to load models:", e);
  }

  // Load sessions (also extracts model defaults as fallback)
  await loadSessionsWithDefaults(client);

  // Fetch assistant identity metadata from gateway HTML (non-blocking)
  client.fetchAssistantMeta().then(meta => {
    if (meta.name || meta.avatar) {
      store.assistantMeta = {
        name: meta.name ?? "Agent",
        emoji: meta.avatar ?? "🤖",
      };
      console.log("[Store] Assistant meta loaded:", store.assistantMeta);
    }
  }).catch(e => {
    console.warn("[Store] Failed to load assistant meta:", e);
  });

  // Load chat history
  loadChatHistory(client);
}

async function handleSnapshot(id: string, snapshot: GatewaySnapshot): Promise<void> {
  console.log("[Store] handleSnapshot called for:", id, "snapshot keys:", Object.keys(snapshot));
  console.log("[Store] snapshot.models:", JSON.stringify(snapshot.models));

  const newStates = new Map(store.gatewayStates);
  const state = newStates.get(id);
  if (state) {
    newStates.set(id, { ...state, snapshot });
  }
  store.gatewayStates = newStates;

  // Load models if this is the active gateway
  if (id === store.activeGatewayId) {
    // Resolve session key
    if (!store.sessionKey) {
      store.sessionKey = resolveSessionKey(id);
      console.log("[Store] Session key resolved:", store.sessionKey);
    }

    // First try from snapshot, then fetch if empty
    if (snapshot.models?.available?.length) {
      console.log("[Store] Models found in snapshot:", snapshot.models.available.length);
      store.modelsSnapshot = snapshot.models;
    } else {
      console.log("[Store] No models in snapshot, fetching via getModels...");
      // Fetch models separately
      const client = clients.get(id);
      if (client) {
        try {
          const models = await client.getModels();
          console.log("[Store] getModels response:", JSON.stringify(models));
          store.modelsSnapshot = models;
        } catch (e) {
          console.warn("[Store] Failed to load models:", e);
        }
      } else {
        console.warn("[Store] No client found for id:", id);
      }
    }

    // Load sessions list
    loadSessions();

    // Load chat history
    const client = clients.get(id);
    if (client) {
      loadChatHistory(client);
    }
  } else {
    console.log("[Store] Snapshot for non-active gateway, active is:", store.activeGatewayId);
  }
}

// Current runId being tracked
let currentRunId: string | null = null;
let lastSentMode: "chat" | "npc" | null = null;
let streamWatchdog: ReturnType<typeof setTimeout> | null = null;
let streamHardDeadline: ReturnType<typeof setTimeout> | null = null;
const STREAM_IDLE_TIMEOUT_MS = 8000;
const STREAM_HARD_TIMEOUT_MS = 120000;

function clearStreamWatchdog(): void {
  if (streamWatchdog) {
    clearTimeout(streamWatchdog);
    streamWatchdog = null;
  }
}

function clearStreamHardDeadline(): void {
  if (streamHardDeadline) {
    clearTimeout(streamHardDeadline);
    streamHardDeadline = null;
  }
}

function stopStreaming(): void {
  console.log("[Store] stopStreaming called, current isStreaming:", store.isStreaming, "streamingContent length:", store.streamingContent?.length);
  store.isStreaming = false;
  store.streamingContent = "";
  clearStreamWatchdog();
  clearStreamHardDeadline();
  currentRunId = null;
  console.log("[Store] stopStreaming complete, isStreaming:", store.isStreaming, "streamingContent:", store.streamingContent);
}

function armStreamWatchdog(): void {
  clearStreamWatchdog();
  streamWatchdog = setTimeout(() => {
    console.warn("[Store] Stream watchdog expired, forcing stop");
    stopStreaming();
    // Always reload history — the response may be on the server even if no deltas were received
    console.log("[Store] Watchdog: reloading history");
    const activeId = store.activeGatewayId;
    const activeClient = activeId ? clients.get(activeId) : null;
    if (activeClient) {
      loadChatHistory(activeClient);
    }
  }, STREAM_IDLE_TIMEOUT_MS);
}

function armStreamHardDeadline(): void {
  clearStreamHardDeadline();
  streamHardDeadline = setTimeout(() => {
    console.warn("[Store] Stream hard deadline reached, forcing stop");
    stopStreaming();
    // Always reload history — the response may be on the server even if no deltas were received
    console.log("[Store] Hard deadline: reloading history");
    const activeId = store.activeGatewayId;
    const activeClient = activeId ? clients.get(activeId) : null;
    if (activeClient) {
      loadChatHistory(activeClient);
    }
  }, STREAM_HARD_TIMEOUT_MS);
}

/**
 * Extract text content from openClaw message structure.
 */
function extractText(message: unknown): string | null {
  if (typeof message === 'string') return message;
  if (!message || typeof message !== 'object') return null;
  const m = message as Record<string, unknown>;

  if (typeof m.content === 'string') {
    return m.content;
  }

  if (Array.isArray(m.content)) {
    const parts: string[] = [];
    for (const p of m.content) {
      if (!p || typeof p !== 'object') continue;
      const item = p as Record<string, unknown>;
      const type = typeof item.type === 'string' ? item.type : '';
      if ((type === 'text' || type === 'output_text' || type === 'input_text') && typeof item.text === 'string') {
        parts.push(item.text);
      }
    }
    if (parts.length > 0) {
      return parts.join('\n');
    }
  }

  if (typeof m.text === 'string') {
    return m.text;
  }

  return null;
}

/**
 * Handle chat events from openClaw gateway
 */
function handleChatEvent(gatewayId: string, payload: ChatEventPayload): void {
  // Ignore events from non-active gateways (e.g. forwarded message responses)
  if (gatewayId !== store.activeGatewayId) return;
  const currentSessionKey = store.sessionKey;

  if (payload.sessionKey && payload.sessionKey !== currentSessionKey) {
    console.log("[Store] Ignoring chat event for different session:", payload.sessionKey);
    return;
  }

  const payloadAny = payload as unknown as Record<string, unknown>;

  console.log("[Store] handleChatEvent payload:", JSON.stringify({
    state: payload.state,
    runId: payload.runId,
    type: payloadAny.type,
    stream: payloadAny.stream,
    data: payloadAny.data,
    hasMessage: !!payload.message
  }));

  let eventState = payload.state;

  if (!eventState && typeof payloadAny.stream === "string") {
    const streamType = payloadAny.stream as string;
    const data = payloadAny.data as Record<string, unknown> | undefined;

    if (streamType === "assistant" && data) {
      eventState = "delta";
      const content = data.text || data.delta;
      if (content) {
        (payload as unknown as Record<string, unknown>).message = {
          content: content
        };
        console.log("[Store] Normalized agent assistant event -> delta, content:", String(content).substring(0, 50));
      }
    } else if (streamType === "lifecycle" && data?.phase === "end") {
      console.log("[Store] Agent lifecycle end event, stopping stream");
      eventState = "final";
      if (data.text || data.content) {
        (payload as unknown as Record<string, unknown>).message = {
          content: data.text || data.content
        };
      }
    } else {
      console.log("[Store] Ignoring agent stream event:", streamType);
      return;
    }
  }

  if (!eventState && payloadAny.type) {
    const agentType = payloadAny.type as string;
    if (agentType === "text" || agentType === "tool_output" || agentType === "thinking") {
      eventState = "delta";
      if (!payload.message && (payloadAny.content || payloadAny.delta)) {
        (payload as unknown as Record<string, unknown>).message = {
          content: payloadAny.delta || payloadAny.content
        };
      }
    } else if (agentType === "done") {
      eventState = "final";
    } else if (agentType === "error") {
      eventState = "error";
    }
    console.log("[Store] Normalized agent event type:", agentType, "->", eventState);
  }

  const validStates = ["delta", "final", "aborted", "error"];
  if (!eventState || !validStates.includes(eventState)) {
    console.log("[Store] Ignoring non-chat event with state:", eventState);
    return;
  }

  // Only filter runId mismatches when currentRunId was confirmed by the server (not idempotencyKey).
  // Before sendChat responds, currentRunId holds the idempotencyKey which will never match the
  // server-assigned runId, causing all deltas to be silently dropped.
  if (eventState === "delta" && currentRunId && payload.runId && payload.runId !== currentRunId) {
    // Accept and adopt the server's runId instead of filtering it out
    console.log("[Store] Adopting server runId:", payload.runId, "(was:", currentRunId, ")");
    currentRunId = payload.runId;
  }

  console.log("[Store] Chat event:", eventState, payload.runId);

  switch (eventState) {
    case "delta":
      const deltaText = extractText(payload.message);
      if (typeof deltaText === "string") {
        const trimmed = deltaText.trim();
        if (trimmed === "✓") {
          break;
        }

        store.isStreaming = true;
        armStreamHardDeadline();
        currentRunId = payload.runId;

        if (!store.streamingContent || deltaText.length >= store.streamingContent.length) {
          const changed = deltaText !== store.streamingContent;
          store.streamingContent = deltaText;
          if (changed) {
            armStreamWatchdog();
          }
        }
      }
      break;

    case "final": {
      console.log("[Store] Final event, reloading history from server");

      // Save streaming content BEFORE clearing it
      const savedContent = store.streamingContent;

      // Optimistic update: Add the completed message to the store immediately
      // This prevents the "disappearing message" glitch while waiting for history reload
      if (savedContent && currentRunId) {
        // Check if we already have a message with this runId (unlikely but safe to check)
        const exists = store.chatMessages.some(m => m.id === currentRunId);
        if (!exists) {
          const optimisticMsg: ChatMessage = {
            id: currentRunId,
            role: "assistant",
            content: savedContent,
            timestamp: new Date().toISOString(),
          };
          // Strip any system prefixes if present (though usually stripped at display time)
          const cleanMsg = stripSystemPrefix(optimisticMsg);
          store.chatMessages = [...store.chatMessages, cleanMsg];
          console.log("[Store] Optimistically added final message:", currentRunId);
        }
      }

      stopStreaming();

      // Send notification from saved streaming content
      if (savedContent && store.notificationsEnabled) {
        const agent = getCurrentAgent();
        notifications.notifyNewMessage(
          agent?.name || "Assistant",
          savedContent.substring(0, 100)
        );
      }

      // Reload history from server with a delay to ensure server consistency
      // Increased from 300ms to 1000ms to avoid race conditions where server hasn't committed yet
      const activeId = store.activeGatewayId;
      const activeClient = activeId ? clients.get(activeId) : null;
      if (activeClient) {
        setTimeout(() => loadChatHistory(activeClient), 1000);
      }
      break;
    }

    case "aborted":
      stopStreaming();
      console.log("[Store] Chat aborted");
      break;

    case "error":
      stopStreaming();
      console.error("[Store] Chat error:", payload.errorMessage);

      store.chatMessages = [...store.chatMessages, {
        id: payload.runId,
        role: "assistant",
        content: `Error: ${payload.errorMessage || "Unknown error"}`,
        timestamp: new Date().toISOString(),
      }];
      break;
  }
}

function handleChatMessage(gatewayId: string, message: ChatMessage): void {
  // Ignore messages from non-active gateways
  if (gatewayId !== store.activeGatewayId) return;
  const exists = store.chatMessages.some(m => m.id === message.id);
  const clean = stripSystemPrefix(message);
  if (exists) {
    store.chatMessages = store.chatMessages.map(m => m.id === message.id ? clean : m);
  } else {
    store.chatMessages = [...store.chatMessages, clean];
  }
}

function handleError(id: string, error: string): void {
  const newStates = new Map(store.gatewayStates);
  const state = newStates.get(id);
  if (state) {
    newStates.set(id, { ...state, error });
  }
  store.gatewayStates = newStates;
}

let isLoadingHistory = false;

/**
 * Load chat history from server (server-authoritative).
 * Matches the official openClaw UI pattern — server is the single source of truth.
 * Optimistic messages (from sendMessage) are preserved until server responds.
 */
async function loadChatHistory(client: GatewayClient): Promise<void> {
  if (!store.activeGatewayId) return;

  // Prevent concurrent calls (connect.ok and connect response both trigger this)
  if (isLoadingHistory) {
    console.log("[Store] loadChatHistory: skipping, already in progress");
    return;
  }
  isLoadingHistory = true;

  try {
    const serverMessages = await client.getChatHistory(store.sessionKey);
    store.chatMessages = serverMessages.map(stripSystemPrefix);
    stopStreaming();
    console.log("[Store] Chat history loaded from server:", serverMessages.length, "messages");
  } catch (e) {
    console.error("Failed to load chat history:", e);
    // On error, keep current messages (may include optimistic UI messages)
  } finally {
    isLoadingHistory = false;
  }
}

// ============================================================================
// File Utilities
// ============================================================================

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function filesToAttachments(files: File[]): Promise<import("./types").ChatAttachment[]> {
  const attachments: import("./types").ChatAttachment[] = [];

  for (const file of files) {
    const content = await fileToBase64(file);
    const isImage = file.type.startsWith('image/');

    attachments.push({
      type: isImage ? 'image' : 'file',
      mimeType: file.type || 'application/octet-stream',
      content,
      fileName: file.name,
    });
  }

  return attachments;
}

// ============================================================================
// Chat Actions
// ============================================================================

export async function sendMessage(content: string, files?: File[]): Promise<void> {
  const id = store.activeGatewayId;
  if (!id) return;

  const client = clients.get(id);
  if (!client) return;

  const message = content.trim();
  const hasFiles = files && files.length > 0;

  if (!message && !hasFiles) return;

  const idempotencyKey = crypto.randomUUID();
  const currentSessionKey = store.sessionKey;

  // Build display content with file names
  let displayContent = message;
  if (hasFiles) {
    const fileNames = files.map(f => `📎 ${f.name}`).join('\n');
    displayContent = message ? `${message}\n\n${fileNames}` : fileNames;
  }

  const userMessage: ChatMessage = {
    id: idempotencyKey,
    role: "user",
    content: displayContent,
    timestamp: new Date().toISOString(),
  };

  store.chatMessages = [...store.chatMessages, userMessage];
  console.log("[Store] User message added (optimistic), count:", store.chatMessages.length);

  try {
    store.isStreaming = true;
    store.streamingContent = "";
    currentRunId = idempotencyKey;
    armStreamWatchdog();
    armStreamHardDeadline();

    // Convert files to attachments
    const attachments = hasFiles ? await filesToAttachments(files) : undefined;

    // Build the actual message to send — inject NPC system prompt when entering NPC mode
    let gatewayMessage = message || "Please analyze these files.";

    // Inject Document Context if active
    if (store.forgeState.activeDocId && store.forgeState.activeDocContext) {
      const { name, type, excerpt } = store.forgeState.activeDocContext;
      const contextPreamble = `[Document Context] File: ${name} (${type})\nContent Preview:\n${excerpt}\n---\nUser message: `;
      gatewayMessage = contextPreamble + gatewayMessage;
    }

    if (store.chatMode === "npc") {
      const theme = getActiveTheme();
      // Inject if: first NPC message, or mode/session changed since last send
      const needsPrompt = lastSentMode !== "npc";
      if (needsPrompt) {
        const faceDirective = `You MUST include directing tags in EVERY response. Required tags:\n- [face:EMOTION] for facial expression (happy|sad|angry|thinking|surprised|excited|calm|neutral)\n- [act:ACTION] for gestures (bow|wave|nod|shrug|clap|point|laugh|cry)\n- [bg:SCENE] for scene mood (keep current or suggest change)\nPlace tags inline within your dialogue. Example: "[face:happy] Hello! [act:wave] Nice to meet you!"`;

        const persona = theme.systemPrompt
          ? `${theme.systemPrompt}\n\n${faceDirective}`
          : faceDirective;
        gatewayMessage = `<npc_persona>${persona}</npc_persona>\n\n${gatewayMessage}`;
      }
    } else if (lastSentMode === "npc") {
      // Exiting NPC mode — tell the LLM to stop using directing tags
      gatewayMessage = `<npc_persona_end>You are no longer in character mode. Stop using [face:], [act:], and [bg:] tags. Respond normally as a standard AI assistant.</npc_persona_end>\n\n${gatewayMessage}`;
    }
    lastSentMode = store.chatMode;

    const result = await client.sendChat({
      sessionKey: currentSessionKey,
      message: gatewayMessage,
      idempotencyKey,
      deliver: false,
      attachments,
    });

    console.log("[Store] sendChat result:", JSON.stringify(result));

    if (result?.runId) {
      currentRunId = result.runId;
    }

    // Fallback: schedule a history reload in case streaming events (delta/final) never arrive.
    // The 'final' event handler will also reload, but this ensures messages appear even if
    // the server doesn't send streaming events (e.g. synchronous response, event format mismatch).
    const fallbackClient = clients.get(id);
    if (fallbackClient) {
      setTimeout(() => {
        // Only reload if we're still waiting (streaming not yet resolved by events)
        if (store.isStreaming || store.chatMessages[store.chatMessages.length - 1]?.role === "user") {
          console.log("[Store] Fallback: reloading history (streaming events may have been missed)");
          loadChatHistory(fallbackClient);
        }
      }, 3000);
    }
  } catch (e) {
    console.error("Failed to send message:", e);
    stopStreaming();
  }
}

export async function abortMessage(): Promise<void> {
  const id = store.activeGatewayId;
  if (!id) return;

  const client = clients.get(id);
  if (!client) return;

  try {
    const currentSessionKey = store.sessionKey;
    await client.abortChat(currentSessionKey);
    stopStreaming();
  } catch (e) {
    console.error("Failed to abort:", e);
    stopStreaming();
  }
}

export async function setModel(modelId: string): Promise<void> {
  const id = store.activeGatewayId;
  if (!id) return;

  const client = clients.get(id);
  if (!client) return;

  try {
    console.log("[Store] Setting model to:", modelId);
    await client.setModel(modelId);
    const models = await client.getModels();
    store.modelsSnapshot = models;
    console.log("[Store] Model set successfully, current:", models.current?.name);
  } catch (e) {
    console.error("Failed to set model:", e);
  }
}

// ============================================================================
// Cross-Gateway Messaging
// ============================================================================

export async function sendMessageToGateway(gatewayId: string, content: string): Promise<void> {
  const client = clients.get(gatewayId);
  if (!client) {
    console.error("[Store] Gateway not connected:", gatewayId);
    return;
  }

  try {
    const idempotencyKey = crypto.randomUUID();
    const targetSessionKey = resolveSessionKey(gatewayId);
    await client.sendChat({
      sessionKey: targetSessionKey,
      message: content,
      idempotencyKey,
      deliver: false,
    });
    console.log("[Store] Message forwarded to gateway:", gatewayId, "session:", targetSessionKey);
  } catch (e) {
    console.error("[Store] Failed to forward message:", e);
  }
}

// ============================================================================
// Session Management
// ============================================================================

export async function loadSessions(): Promise<void> {
  const id = store.activeGatewayId;
  if (!id) return;

  const client = clients.get(id);
  if (!client) return;

  await loadSessionsWithDefaults(client);
}

/**
 * Load sessions and extract model defaults from the response.
 * The sessions.list response contains a 'defaults' field with model info.
 */
async function loadSessionsWithDefaults(client: GatewayClient): Promise<void> {
  try {
    const result = await client.getSessionsRaw({ limit: 50 });
    store.sessions = result?.sessions ?? [];
    console.log("[Store] Sessions loaded:", store.sessions.length);

    // Extract model info from defaults if modelsSnapshot is empty
    if (!store.modelsSnapshot?.current && result?.defaults) {
      const defaults = result.defaults as Record<string, unknown>;
      const modelName = (defaults.model as string) ?? "";
      const provider = (defaults.modelProvider as string) ?? "";

      if (modelName) {
        console.log("[Store] Setting current model from session defaults:", modelName);
        store.modelsSnapshot = {
          current: {
            id: modelName,
            provider: provider,
            name: modelName,
            displayName: modelName,
          },
          fallback: [],
          available: [{
            id: modelName,
            provider: provider,
            name: modelName,
            displayName: modelName,
          }],
        };
      }
    }
  } catch (e) {
    console.error("Failed to load sessions:", e);
  }
}

export async function switchSession(sessionKey: string): Promise<void> {
  const id = store.activeGatewayId;
  if (!id) return;

  const client = clients.get(id);
  if (!client) return;

  store.sessionKey = sessionKey;
  store.streamingContent = "";
  store.isStreaming = false;
  store.chatMessages = [];
  lastSentMode = null;
  saveSessionKey(id, sessionKey);

  try {
    const serverMessages = await client.getChatHistory(sessionKey);
    store.chatMessages = serverMessages.map(stripSystemPrefix);
    console.log("[Store] Switched to session:", sessionKey, "messages:", store.chatMessages.length);
  } catch (e) {
    console.error("Failed to load session history:", e);
  }
}

/**
 * Create a new conversation session.
 * Generates a fresh session key and clears chat messages.
 */
export function createNewSession(): string {
  const id = store.activeGatewayId;
  const newKey = generateSessionKey();

  store.sessionKey = newKey;
  store.chatMessages = [];
  store.streamingContent = "";
  store.isStreaming = false;
  lastSentMode = null;

  if (id) {
    saveSessionKey(id, newKey);
  }

  console.log("[Store] New session created:", newKey);
  return newKey;
}

// ============================================================================
// Inline Button Actions
// ============================================================================

export async function selectButton(messageId: string, callbackData: string, buttonText: string): Promise<void> {
  const msg = store.chatMessages.find(m => m.id === messageId);
  if (!msg) return;

  const isMulti = msg.selectMode === "multi";

  if (isMulti) {
    // Multi-select: toggle selection
    const currentSelections = msg.selectedButtons ?? [];
    const isSelected = currentSelections.includes(callbackData);

    store.chatMessages = store.chatMessages.map(m => {
      if (m.id === messageId) {
        const newSelections = isSelected
          ? currentSelections.filter(s => s !== callbackData)
          : [...currentSelections, callbackData];
        return { ...m, selectedButtons: newSelections };
      }
      return m;
    });
  } else {
    // Single-select: mark and send immediately
    store.chatMessages = store.chatMessages.map(m => {
      if (m.id === messageId) {
        return { ...m, selectedButton: callbackData };
      }
      return m;
    });

    await sendMessage(buttonText);
  }
}

export async function confirmMultiSelect(messageId: string): Promise<void> {
  const msg = store.chatMessages.find(m => m.id === messageId);
  if (!msg || !msg.selectedButtons?.length) return;

  // Get selected button texts
  const selectedTexts: string[] = [];
  for (const row of msg.buttons ?? []) {
    for (const btn of row) {
      if (btn.callback_data && msg.selectedButtons.includes(btn.callback_data)) {
        selectedTexts.push(btn.text);
      }
    }
  }

  // Mark as submitted
  store.chatMessages = store.chatMessages.map(m => {
    if (m.id === messageId) {
      return { ...m, selectedButton: "confirmed" };  // Lock buttons
    }
    return m;
  });

  // Send combined selection
  await sendMessage(selectedTexts.join(", "));
}

// ============================================================================
// Notification Settings
// ============================================================================

export function toggleNotifications(enabled?: boolean): void {
  store.notificationsEnabled = enabled ?? !store.notificationsEnabled;

  // Request permission if enabling
  if (store.notificationsEnabled) {
    notifications.requestPermission();
  }
}

export function getNotificationStatus(): { enabled: boolean; permitted: boolean } {
  return {
    enabled: store.notificationsEnabled,
    permitted: notifications.isEnabled(),
  };
}

export function setNotificationSound(sound: import("$lib/services/notifications").NotificationSound): void {
  notifications.sound = sound;
}

export function getNotificationSound(): import("$lib/services/notifications").NotificationSound {
  return notifications.sound;
}

export function getAvailableSounds(): import("$lib/services/notifications").NotificationSound[] {
  return notifications.getAvailableSounds();
}

// ============================================================================
// Initialize
// ============================================================================

export async function initGatewayStore(): Promise<void> {
  await loadGateways();

  // Auto-connect gateways that have saved credentials.
  // Connect the active gateway first for faster perceived load.
  const activeId = store.activeGatewayId;

  if (activeId) {
    const activeGw = store.gateways.find(g => g.id === activeId);
    if (activeGw && (activeGw.token || activeGw.deviceToken || activeGw.password)) {
      connectGateway(activeId);
    }
  }

  // Connect remaining gateways with credentials
  store.gateways.forEach(g => {
    if (g.id !== activeId && (g.token || g.deviceToken || g.password)) {
      connectGateway(g.id);
    }
  });

  // Request notification permission on startup
  if (store.notificationsEnabled) {
    notifications.requestPermission();
  }
}
