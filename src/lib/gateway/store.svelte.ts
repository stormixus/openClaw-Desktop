/**
 * Gateway Store - Multi-gateway state management (Svelte 5 Runes)
 */

import { browser } from "$app/environment";
import { notifications } from "$lib/services/notifications";
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

const STORAGE_KEY = "openclaw.gateways";
const MESSAGES_KEY_PREFIX = "openclaw.chat";

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
  sessionKey: "main",
  sessions: [] as SessionInfo[],  // Available sessions
  notificationsEnabled: true,     // Notification setting
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
// Chat Message Persistence (localStorage cache)
// ============================================================================

function getChatCacheKey(gatewayId: string, sessionKey: string): string {
  return `${MESSAGES_KEY_PREFIX}.${gatewayId}.${sessionKey}`;
}

function saveChatMessages(): void {
  if (!browser || !store.activeGatewayId) return;
  const key = getChatCacheKey(store.activeGatewayId, store.sessionKey);
  try {
    const userMsgCount = store.chatMessages.filter(m => m.role === 'user').length;
    
    // Safety check: never save if we'd lose user messages
    const existing = localStorage.getItem(key);
    if (existing) {
      const cached = JSON.parse(existing) as ChatMessage[];
      const cachedUserCount = cached.filter(m => m.role === 'user').length;
      if (userMsgCount < cachedUserCount) {
        console.warn(`[Store] saveChatMessages BLOCKED: would lose user messages (${cachedUserCount} -> ${userMsgCount})`);
        return;
      }
    }
    
    localStorage.setItem(key, JSON.stringify(store.chatMessages));
  } catch (e) {
    console.warn("[Store] Failed to save chat messages to cache:", e);
  }
}

function loadCachedMessages(gatewayId: string, sessionKey: string): ChatMessage[] {
  if (!browser) return [];
  const key = getChatCacheKey(gatewayId, sessionKey);
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved) as ChatMessage[];
    }
  } catch (e) {
    console.warn("[Store] Failed to load cached messages:", e);
  }
  return [];
}

/**
 * Merge server messages with local messages.
 * Local user messages are CANONICAL (they have UUID IDs from sendMessage).
 * Server may return user messages with different generated IDs (e.g. user-0-timestamp).
 * We keep ALL local user messages and only add server user messages if content doesn't match.
 * For assistant messages, server takes priority (has updated content).
 */
function mergeMessages(serverMessages: ChatMessage[], localMessages: ChatMessage[]): ChatMessage[] {
  const merged = new Map<string, ChatMessage>();
  
  // 1. Add ALL local messages first (these are our source of truth for user messages)
  for (const msg of localMessages) {
    merged.set(msg.id, msg);
  }
  
  // Build a set of local user message content for dedup
  const localUserContents = new Set(
    localMessages
      .filter(m => m.role === 'user')
      .map(m => m.content.trim().toLowerCase())
  );
  
  // 2. Add server messages
  for (const msg of serverMessages) {
    if (msg.role === 'user') {
      // Only add server user messages if their content doesn't already exist locally
      // (server may return user messages with different IDs like user-0-timestamp)
      const contentKey = msg.content.trim().toLowerCase();
      if (!localUserContents.has(contentKey)) {
        merged.set(msg.id, msg);
        localUserContents.add(contentKey); // prevent future dupes
      }
      // If content already exists locally, skip (keep local version with UUID)
    } else {
      // For assistant/system messages, server takes priority (may have updated content)
      merged.set(msg.id, msg);
    }
  }
  
  // Sort by timestamp
  return Array.from(merged.values()).sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

// ============================================================================
// Gateway Management
// ============================================================================

export function loadGateways(): void {
  if (!browser) return;
  
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      store.gateways = data.gateways ?? [];
      store.activeGatewayId = data.activeId ?? null;
    } catch (e) {
      console.error("Failed to load gateways:", e);
    }
  }
}

export function saveGateways(): void {
  if (!browser) return;
  
  const data = {
    gateways: store.gateways,
    activeId: store.activeGatewayId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function addGateway(config: Omit<GatewayConfig, "id">): { id: string; error?: string } {
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
  
  store.gateways = [...store.gateways, gateway];
  saveGateways();
  
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

export function updateGateway(id: string, updates: Partial<GatewayConfig>): void {
  store.gateways = store.gateways.map(g => g.id === id ? { ...g, ...updates } : g);
  saveGateways();
}

export function removeGateway(id: string): void {
  // Disconnect first
  disconnectGateway(id);
  
  store.gateways = store.gateways.filter(g => g.id !== id);
  
  // If removed gateway was active, set to first available
  if (store.activeGatewayId === id) {
    store.activeGatewayId = store.gateways[0]?.id ?? null;
  }
  
  saveGateways();
}

export function setActiveGateway(id: string): void {
  store.activeGatewayId = id;
  saveGateways();
  
  // Load chat history for new active gateway
  const client = clients.get(id);
  if (client && client.getStatus() === "connected") {
    loadChatHistory(client);
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
      .on("chat", (event) => handleChatEvent(event as ChatEventPayload))
      .on("message", (message) => handleChatMessage(message as ChatMessage))
      .on("error", (error) => handleError(id, error as string));
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

function handleStatusChange(id: string, status: ConnectionStatus): void {
  const newStates = new Map(store.gatewayStates);
  const state = newStates.get(id);
  if (state) {
    newStates.set(id, { ...state, status });
  }
  store.gatewayStates = newStates;
}

async function handleSnapshot(id: string, snapshot: GatewaySnapshot): Promise<void> {
  const newStates = new Map(store.gatewayStates);
  const state = newStates.get(id);
  if (state) {
    newStates.set(id, { ...state, snapshot });
  }
  store.gatewayStates = newStates;

  // Load models if this is the active gateway
  if (id === store.activeGatewayId) {
    // First try from snapshot, then fetch if empty
    if (snapshot.models?.available?.length) {
      store.modelsSnapshot = snapshot.models;
    } else {
      // Fetch models separately
      const client = clients.get(id);
      if (client) {
        try {
          const models = await client.getModels();
          store.modelsSnapshot = models;
        } catch (e) {
          console.warn("[Store] Failed to load models:", e);
        }
      }
    }
    
    // Load sessions list
    loadSessions();
    
    // Load chat history
    const client = clients.get(id);
    if (client) {
      loadChatHistory(client);
    }
  }
}

// Current runId being tracked
let currentRunId: string | null = null;
let streamWatchdog: ReturnType<typeof setTimeout> | null = null;
let streamHardDeadline: ReturnType<typeof setTimeout> | null = null;
const STREAM_IDLE_TIMEOUT_MS = 1500;
const STREAM_HARD_TIMEOUT_MS = 10000;

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
  }, STREAM_IDLE_TIMEOUT_MS);
}

function armStreamHardDeadline(): void {
  clearStreamHardDeadline();
  streamHardDeadline = setTimeout(() => {
    console.warn("[Store] Stream hard deadline reached, forcing stop");
    stopStreaming();
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
function handleChatEvent(payload: ChatEventPayload): void {
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

  if (eventState === "delta" && currentRunId && payload.runId && payload.runId !== currentRunId) {
    console.log("[Store] Ignoring delta event for different run:", payload.runId, "expected:", currentRunId);
    return;
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
      const savedContent = store.streamingContent;
      console.log("[Store] Final: savedContent length:", savedContent?.length);
      stopStreaming();

      const finalText = extractText(payload.message) || savedContent;
      console.log("[Store] Final text extracted:", finalText?.substring(0, 100));
      console.log("[Store] Final: payload.runId:", payload.runId);
      
      if (finalText) {
        const newMessage: ChatMessage = {
          id: payload.runId || crypto.randomUUID(),
          role: "assistant",
          content: finalText,
          timestamp: new Date().toISOString(),
        };
        
        const existingIdx = store.chatMessages.findIndex(m => m.id === newMessage.id && m.role === "assistant");
        if (existingIdx < 0) {
          store.chatMessages = [...store.chatMessages, newMessage];
          saveChatMessages();
          console.log("[Store] chatMessages updated, count:", store.chatMessages.length);
          
          // Send notification if enabled and app is not focused
          if (store.notificationsEnabled) {
            const agent = getCurrentAgent();
            notifications.notifyNewMessage(
              agent?.name || "Assistant",
              finalText.substring(0, 100)
            );
          }
        } else {
          console.log("[Store] Final: duplicate assistant message found at index:", existingIdx);
        }
      } else {
        console.log("[Store] Final: no finalText, skipping message add");
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
      saveChatMessages();
      break;
  }
}

function handleChatMessage(message: ChatMessage): void {
  const exists = store.chatMessages.some(m => m.id === message.id);
  if (exists) {
    store.chatMessages = store.chatMessages.map(m => m.id === message.id ? message : m);
  } else {
    store.chatMessages = [...store.chatMessages, message];
  }
  saveChatMessages();
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

async function loadChatHistory(client: GatewayClient): Promise<void> {
  const gatewayId = store.activeGatewayId;
  if (!gatewayId) return;
  
  // Prevent concurrent calls (connect.ok and connect response both trigger this)
  if (isLoadingHistory) {
    console.log("[Store] loadChatHistory: skipping, already in progress");
    return;
  }
  isLoadingHistory = true;
  
  const currentSessionKey = store.sessionKey;
  
  // Always load cached messages as baseline (includes user messages the server doesn't return)
  const cached = loadCachedMessages(gatewayId, currentSessionKey);
  
  try {
    const serverMessages = await client.getChatHistory(currentSessionKey);
    
    // 3-way merge: cache (has user msgs) + current store + server (has latest assistant msgs)
    const allLocal = mergeMessages(cached, store.chatMessages);
    const merged = mergeMessages(serverMessages, allLocal);
    
    store.chatMessages = merged;
    
    saveChatMessages();
    stopStreaming();
  } catch (e) {
    console.error("Failed to load chat history:", e);
    // On error, use cached messages if we have nothing
    if (store.chatMessages.length === 0 && cached.length > 0) {
      store.chatMessages = cached;
    }
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
  saveChatMessages();
  console.log("[Store] User message added, count:", store.chatMessages.length);

  try {
    store.isStreaming = true;
    store.streamingContent = "";
    currentRunId = idempotencyKey;
    armStreamWatchdog();
    armStreamHardDeadline();
    
    // Convert files to attachments
    const attachments = hasFiles ? await filesToAttachments(files) : undefined;
    
    const result = await client.sendChat({
      sessionKey: currentSessionKey,
      message: message || "Please analyze these files.",
      idempotencyKey,
      deliver: false,
      attachments,
    });
    
    console.log("[Store] sendChat result:", JSON.stringify(result));

    if (result?.runId) {
      currentRunId = result.runId;
    }

    // Reload history after send, merging with local messages
    setTimeout(async () => {
      const activeId = store.activeGatewayId;
      const active = activeId ? clients.get(activeId) : null;
      if (active && activeId) {
        try {
          const currentSK = store.sessionKey;
          const serverHistory = await active.getChatHistory(currentSK);
          // Also load cache to ensure user messages are never lost
          const cached = loadCachedMessages(activeId, currentSK);
          const allLocal = mergeMessages(cached, store.chatMessages);
          store.chatMessages = mergeMessages(serverHistory, allLocal);
        } catch (_) {
          // If history load fails, keep locally-added messages
        }
      }
      saveChatMessages();
      // Always stop streaming after history reload
      stopStreaming();
    }, 500);
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
    await client.sendChat({
      sessionKey: "main",  // Send to main session of target gateway
      message: content,
      idempotencyKey,
      deliver: false,
    });
    console.log("[Store] Message forwarded to gateway:", gatewayId);
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

  try {
    const sessions = await client.getSessions({ limit: 50, messageLimit: 1 });
    store.sessions = sessions;
    console.log("[Store] Sessions loaded:", sessions.length);
  } catch (e) {
    console.error("Failed to load sessions:", e);
  }
}

export async function switchSession(sessionKey: string): Promise<void> {
  const id = store.activeGatewayId;
  if (!id) return;

  const client = clients.get(id);
  if (!client) return;

  // Save current session messages before switching
  saveChatMessages();

  store.sessionKey = sessionKey;
  store.streamingContent = "";
  store.isStreaming = false;
  
  // Load cached messages for the new session immediately
  const cached = loadCachedMessages(id, sessionKey);
  store.chatMessages = cached;

  try {
    const serverMessages = await client.getChatHistory(sessionKey);
    // 3-way merge: cache + current + server
    const allLocal = mergeMessages(cached, store.chatMessages);
    store.chatMessages = mergeMessages(serverMessages, allLocal);
    saveChatMessages();
    console.log("[Store] Switched to session:", sessionKey, "messages:", store.chatMessages.length);
  } catch (e) {
    console.error("Failed to load session history:", e);
    // Keep cached messages on error
  }
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

export function initGatewayStore(): void {
  loadGateways();
  
  // Auto-connect to saved gateways
  store.gateways.forEach(g => {
    if (g.deviceToken) {
      connectGateway(g.id);
    }
  });
  
  // Request notification permission on startup
  if (store.notificationsEnabled) {
    notifications.requestPermission();
  }
}
