/**
 * Gateway Store - Multi-gateway state management (Svelte 5 Runes)
 */

import { browser } from "$app/environment";
import { GatewayClient } from "./client";
import type {
  GatewayConfig,
  GatewayState,
  ConnectionStatus,
  GatewaySnapshot,
  ChatMessage,
  ChatEventPayload,
  ModelsSnapshot,
} from "./types";

const STORAGE_KEY = "openclaw.gateways";

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

export function getActiveClient(): GatewayClient | null {
  return store.activeGatewayId ? clients.get(store.activeGatewayId) ?? null : null;
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

export function addGateway(config: Omit<GatewayConfig, "id">): string {
  const id = crypto.randomUUID();
  const gateway: GatewayConfig = { ...config, id };
  
  store.gateways = [...store.gateways, gateway];
  saveGateways();
  
  return id;
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

function handleSnapshot(id: string, snapshot: GatewaySnapshot): void {
  const newStates = new Map(store.gatewayStates);
  const state = newStates.get(id);
  if (state) {
    newStates.set(id, { ...state, snapshot });
  }
  store.gatewayStates = newStates;

  // Load models if this is the active gateway
  if (id === store.activeGatewayId) {
    store.modelsSnapshot = snapshot.models;
    
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
const STREAM_IDLE_TIMEOUT_MS = 2500;
const STREAM_HARD_TIMEOUT_MS = 15000;

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
          console.log("[Store] chatMessages updated, count:", store.chatMessages.length);
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
}

function handleError(id: string, error: string): void {
  const newStates = new Map(store.gatewayStates);
  const state = newStates.get(id);
  if (state) {
    newStates.set(id, { ...state, error });
  }
  store.gatewayStates = newStates;
}

async function loadChatHistory(client: GatewayClient): Promise<void> {
  try {
    const currentSessionKey = store.sessionKey;
    console.log("[Store] Loading chat history for session:", currentSessionKey);
    const messages = await client.getChatHistory(currentSessionKey);
    console.log("[Store] Chat history loaded, message count:", messages.length);
    if (messages.length > 0) {
      console.log("[Store] Last message:", messages[messages.length - 1]);
    }
    store.chatMessages = messages;
    stopStreaming();
  } catch (e) {
    console.error("Failed to load chat history:", e);
  }
}

// ============================================================================
// Chat Actions
// ============================================================================

export async function sendMessage(content: string): Promise<void> {
  const id = store.activeGatewayId;
  if (!id) return;

  const client = clients.get(id);
  if (!client) return;

  const message = content.trim();
  if (!message) return;

  const idempotencyKey = crypto.randomUUID();
  const currentSessionKey = store.sessionKey;

  const userMessage: ChatMessage = {
    id: idempotencyKey,
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  };
  
  store.chatMessages = [...store.chatMessages, userMessage];
  console.log("[Store] User message added, count:", store.chatMessages.length);

  try {
    store.isStreaming = true;
    store.streamingContent = "";
    currentRunId = idempotencyKey;
    armStreamWatchdog();
    armStreamHardDeadline();
    
    const result = await client.sendChat({
      sessionKey: currentSessionKey,
      message,
      idempotencyKey,
      deliver: false,
    });
    
    console.log("[Store] sendChat result:", JSON.stringify(result));

    if (result?.runId) {
      currentRunId = result.runId;
    }

    if (result?.status === "ok" || !result?.runId) {
      stopStreaming();
      const active = store.activeGatewayId ? clients.get(store.activeGatewayId) : null;
      if (active) {
        try {
          const currentSK = store.sessionKey;
          const history = await active.getChatHistory(currentSK);
          if (history.length > 0) {
            store.chatMessages = history;
          }
        } catch (_) {
          // If history load fails, keep locally-added messages
        }
      }
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
    await client.setModel(modelId);
    const models = await client.getModels();
    store.modelsSnapshot = models;
  } catch (e) {
    console.error("Failed to set model:", e);
  }
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
}
