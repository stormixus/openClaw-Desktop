/**
 * OpenClaw Gateway WebSocket Client
 * Protocol Version 3
 */

import type {
  GatewayConfig,
  ConnectionStatus,
  ConnectChallenge,
  ConnectParams,
  HelloOkResult,
  GatewaySnapshot,
  RequestMessage,
  NotificationMessage,
  AgentEvent,
  ChatSendParams,
  ChatSendResult,
  ChatMessage,
  ModelsSnapshot,
  SessionInfo,
  ToolCall,
} from "./types";

import {
  loadOrCreateDeviceIdentity,
  signDevicePayload,
  buildDeviceAuthPayload,
  isSecureContext,
  type DeviceIdentity,
} from "./device-identity";

import {
  loadDeviceAuthToken,
  storeDeviceAuthToken,
  clearDeviceAuthToken,
} from "./device-auth";
import { db } from "$lib/db";

const PROTOCOL_VERSION = 3;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const UI_LOCALE_STORAGE_KEY = "openclaw.locale";

type UnknownRecord = Record<string, unknown>;

type EventCallback<T> = (data: T) => void;

function normalizeLocale(raw?: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.trim().replace(/_/g, "-");
  if (!normalized) return null;
  return normalized;
}

function resolveClientLocale(): string {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = normalizeLocale(localStorage.getItem(UI_LOCALE_STORAGE_KEY));
      if (saved) {
        if (saved === "ko") return "ko-KR";
        if (saved === "en") return "en-US";
        return saved;
      }
    }
  } catch {
    // Ignore storage access issues and continue with runtime locale detection.
  }

  if (typeof navigator !== "undefined") {
    const candidates = [
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language,
    ];
    for (const candidate of candidates) {
      const normalized = normalizeLocale(candidate);
      if (normalized) return normalized;
    }
  }

  return "en-US";
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private config: GatewayConfig;
  private connectionStatus: ConnectionStatus = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequests = new Map<string | number, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private requestId = 0;
  private connectNonce: string | null = null;  // Challenge nonce for device auth

  // Event callbacks
  private onStatusChange?: EventCallback<ConnectionStatus>;
  private onSnapshot?: EventCallback<GatewaySnapshot>;
  private onChatEvent?: EventCallback<AgentEvent>;
  private onChatMessage?: EventCallback<ChatMessage>;
  private onError?: EventCallback<string>;

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  // ========== Event Handlers ==========

  onStatusChanged(callback: EventCallback<ConnectionStatus>): this {
    this.onStatusChange = callback;
    return this;
  }

  onSnapshotReceived(callback: EventCallback<GatewaySnapshot>): this {
    this.onSnapshot = callback;
    return this;
  }

  onChat(callback: EventCallback<AgentEvent>): this {
    this.onChatEvent = callback;
    return this;
  }

  onMessage(callback: EventCallback<ChatMessage>): this {
    this.onChatMessage = callback;
    return this;
  }

  onErrorOccurred(callback: EventCallback<string>): this {
    this.onError = callback;
    return this;
  }

  on(event: string, callback: EventCallback<unknown>): this {
    switch (event) {
      case "status": this.onStatusChange = callback as EventCallback<ConnectionStatus>; break;
      case "snapshot": this.onSnapshot = callback as EventCallback<GatewaySnapshot>; break;
      case "chat": this.onChatEvent = callback as EventCallback<AgentEvent>; break;
      case "message": this.onChatMessage = callback as EventCallback<ChatMessage>; break;
      case "error": this.onError = callback as EventCallback<string>; break;
      case "tool": this.onToolCall = callback as EventCallback<ToolCall>; break;
    }
    return this;
  }

  private onToolCall?: EventCallback<ToolCall>;

  onTool(callback: EventCallback<ToolCall>): this {
    this.onToolCall = callback;
    return this;
  }

  // ========== Connection ==========

  connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.setStatus("connecting");
    
    try {
      // Build WebSocket URL with token as query parameter
      const wsUrl = this.buildWebSocketUrl();
      console.log("[Gateway] Connecting to:", this.sanitizeUrl(wsUrl));
      
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => this.handleOpen();
      this.ws.onclose = (e) => this.handleClose(e);
      this.ws.onerror = (e) => this.handleError(e);
      this.ws.onmessage = (e) => this.handleMessage(e);
    } catch (err) {
      this.setStatus("error");
      this.onError?.(`Connection failed: ${err}`);
    }
  }

  /**
   * Build WebSocket URL with token as query parameter.
   * openClaw expects: ws://host:port/?token=xxx
   * Note: 127.0.0.1 is converted to localhost for secure context compatibility
   */
  private buildWebSocketUrl(): string {
    const url = new URL(this.config.url);

    // Convert 127.0.0.1 to localhost for secure context compatibility
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
    }

    // Normalize path only when empty/root. Preserve query params as-is.
    if (!url.pathname || url.pathname === "") {
      url.pathname = "/";
    }

    // Prefer explicit auth config but keep existing URL params when already present.
    if (this.config.token && !url.searchParams.has("token")) {
      url.searchParams.set("token", this.config.token);
    } else if (this.config.deviceToken && !url.searchParams.has("deviceToken")) {
      url.searchParams.set("deviceToken", this.config.deviceToken);
    }

    return url.toString();
  }

  /** Strip sensitive query params (token, deviceToken, password) from URLs before logging. */
  private sanitizeUrl(url: string): string {
    try {
      const u = new URL(url);
      for (const key of ["token", "deviceToken", "password"]) {
        if (u.searchParams.has(key)) u.searchParams.set(key, "***");
      }
      return u.toString();
    } catch {
      return url.replace(/([?&])(token|deviceToken|password)=[^&]*/gi, "$1$2=***");
    }
  }

  private extractTextFromContent(content: unknown): string | null {
    if (typeof content === "string") {
      return content;
    }

    if (!Array.isArray(content)) {
      return null;
    }

    const parts: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const entry = item as UnknownRecord;
      const type = typeof entry.type === "string" ? entry.type : "";
      if ((type === "text" || type === "output_text" || type === "input_text") && typeof entry.text === "string") {
        parts.push(entry.text);
      } else if (type === "tool_result") {
        // tool_result can have nested content array or a string content
        const resultText = this.extractTextFromContent(entry.content);
        if (resultText) parts.push(resultText);
      }
    }

    return parts.length > 0 ? parts.join("\n") : null;
  }

  private extractToolCalls(content: unknown): ToolCall[] | undefined {
    if (!Array.isArray(content)) return undefined;

    const tools: ToolCall[] = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const entry = item as UnknownRecord;
      const type = typeof entry.type === "string" ? entry.type : "";

      if (type === "tool_use") {
        const id = typeof entry.id === "string" ? entry.id : `tool-${tools.length}`;
        const name = typeof entry.name === "string" ? entry.name : "unknown";
        const args = (entry.input && typeof entry.input === "object"
          ? entry.input
          : {}) as Record<string, unknown>;

        const toolCall: ToolCall = { id, name, args, status: "complete" };
        tools.push(toolCall);

        // Notify listener about new tool call (for Forge integration)
        this.onToolCall?.(toolCall);
      }
    }

    // Match tool_result blocks to their corresponding tool_use
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const entry = item as UnknownRecord;
      if (typeof entry.type === "string" && entry.type === "tool_result") {
        const toolUseId = typeof entry.tool_use_id === "string" ? entry.tool_use_id : "";
        const matchingTool = tools.find(t => t.id === toolUseId);
        if (matchingTool) {
          const resultText = this.extractTextFromContent(entry.content);
          matchingTool.result = resultText ?? entry.content;
          if (typeof entry.is_error === "boolean" && entry.is_error) {
            matchingTool.status = "error";
          }
        }
      }
    }

    return tools.length > 0 ? tools : undefined;
  }

  /**
   * Normalize a server history message into our ChatMessage format.
   * Server returns messages as: { role, content (string | array), timestamp (number) }
   * We need to extract text and normalize the format.
   */
  private normalizeHistoryMessage(raw: unknown, index: number): ChatMessage | null {
    if (!raw || typeof raw !== "object") return null;

    const entry = raw as UnknownRecord;

    const roleRaw = typeof entry.role === "string" ? entry.role : "assistant";
    const role = roleRaw === "user" || roleRaw === "assistant" || roleRaw === "system"
      ? roleRaw
      : "assistant";

    const text = this.extractTextFromContent(entry.content) ??
      (typeof entry.text === "string" ? entry.text : null);

    const toolCalls = this.extractToolCalls(entry.content);

    // Allow messages that have either text or tool calls
    const content = (text ?? (toolCalls ? "" : "[non-text message]")).trim();
    if (!content && !toolCalls) return null;

    const ts = entry.timestamp;
    let timestamp = new Date().toISOString();
    if (typeof ts === "number") {
      timestamp = new Date(ts).toISOString();
    } else if (typeof ts === "string") {
      const parsed = new Date(ts);
      if (!Number.isNaN(parsed.getTime())) {
        timestamp = parsed.toISOString();
      }
    }

    // Server messages don't include IDs; generate stable ones from position
    const id = typeof entry.id === "string"
      ? entry.id
      : `msg-${index}-${timestamp}`;

    return { id, role, content, timestamp, toolCalls };
  }

  disconnect(): void {
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close(1000, "User disconnect");
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  private setStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    this.onStatusChange?.(status);
  }

  getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  // ========== WebSocket Handlers ==========

  private handleOpen(): void {
    console.log("[Gateway] WebSocket opened, waiting for server messages...");
    this.setStatus("authenticating");
    // Server will send connect.challenge or directly authenticate via token in URL
  }

  private handleClose(event: CloseEvent): void {
    console.log(`[Gateway] WebSocket closed. Code: ${event.code}, Reason: ${event.reason || 'none'}`);
    if (event.code === 1000) {
      this.setStatus("disconnected");
      return;
    }

    // Attempt reconnect
    this.setStatus("reconnecting");
    this.scheduleReconnect();
  }

  private handleError(event: Event): void {
    console.error("WebSocket error:", event);
    this.onError?.("WebSocket connection error");
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      // Log message type/id only; full payload may contain auth tokens
      const preview = event.data.substring(0, 200);
      console.log("[Gateway] Received message (preview):", preview.replace(/"(token|password|deviceToken)"\s*:\s*"[^"]*"/gi, '"$1":"***"'));
      const data = JSON.parse(event.data);
      
      // Handle openClaw event format: {type:"event", event:"name", payload:{}}
      if (data.type === "event" && data.event) {
        console.log("[Gateway] Event received:", data.event);
        await this.handleEvent(data.event, data.payload);
        return;
      }
      
      // Handle openClaw response format: {type:"res", id:..., ok:true/false, payload:...}
      if ((data.type === "res" || data.type === "response") && data.id !== undefined) {
        console.log(`[Gateway] Response for request ${data.id}:`, data.ok ? 'OK' : 'ERROR');
        const pending = this.pendingRequests.get(data.id);
        if (pending) {
          this.pendingRequests.delete(data.id);
          if (data.ok === false || data.error) {
            console.error("[Gateway] Request error:", data.error);
            pending.reject(new Error(data.error?.message || data.error || "Request failed"));
          } else {
            pending.resolve(data.payload);
          }
        }
        return;
      }
      
      // Handle JSON-RPC notifications (no id)
      if (!data.id && data.method) {
        console.log("[Gateway] Notification received:", data.method);
        await this.handleNotification(data as NotificationMessage);
        return;
      }

      // Handle JSON-RPC response (fallback)
      if (data.id !== undefined) {
        console.log(`[Gateway] JSON-RPC Response for request ${data.id}:`, data.error ? 'ERROR' : 'OK');
        const pending = this.pendingRequests.get(data.id);
        if (pending) {
          this.pendingRequests.delete(data.id);
          if (data.error) {
            console.error("[Gateway] Request error:", data.error);
            pending.reject(new Error(data.error.message));
          } else {
            pending.resolve(data.result);
          }
        }
      }
    } catch (err) {
      console.error("Failed to parse message:", err, event.data);
    }
  }

  /**
   * Handle openClaw event format messages
   */
  private async handleEvent(eventName: string, payload: unknown): Promise<void> {
    switch (eventName) {
      case "connect.challenge":
        await this.respondToChallenge(payload as ConnectChallenge);
        break;

      case "connect.ok":
        // Connection successful, server authenticated us via token in URL
        console.log("[Gateway] Connection OK via token");
        this.reconnectAttempt = 0;
        this.setStatus("connected");
        // Request snapshot if available
        if (payload && typeof payload === 'object') {
          this.onSnapshot?.(payload as GatewaySnapshot);
        }
        break;

      case "agent":
        // Legacy agent events (fallback)
        this.onChatEvent?.(payload as AgentEvent);
        break;

      case "chat":
        // openClaw chat events with ChatEventPayload format
        // { runId, sessionKey, state: "delta"|"final"|"aborted"|"error", message?, errorMessage? }
        console.log("[Gateway] Chat event payload:", JSON.stringify(payload));
        this.onChatEvent?.(payload as AgentEvent);
        break;

      default:
        console.log("[Gateway] Unhandled event:", eventName, payload);
    }
  }

  private async handleNotification(msg: NotificationMessage): Promise<void> {
    switch (msg.method) {
      case "connect.challenge":
        await this.respondToChallenge(msg.params as unknown as ConnectChallenge);
        break;

      case "agent":
        this.onChatEvent?.(msg.params as unknown as AgentEvent);
        break;

      case "chat":
        // Chat notifications use ChatEventPayload format, route to onChatEvent
        console.log("[Gateway] Chat notification:", JSON.stringify(msg.params));
        this.onChatEvent?.(msg.params as unknown as AgentEvent);
        break;

      default:
        console.log("Unhandled notification:", msg.method);
    }
  }

  private async respondToChallenge(challenge: ConnectChallenge): Promise<void> {
    console.log("[Gateway] Responding to challenge:", challenge);
    
    // Store the nonce for device signing
    if (challenge.nonce) {
      this.connectNonce = challenge.nonce;
    }
    
    const requestId = `req-${++this.requestId}`;
    const role = "operator";
    const scopes = ["operator.read", "operator.write", "operator.approvals", "operator.pairing"];
    const clientId = "openclaw-control-ui";
    const clientMode = "webchat";
    
    // Check if we have a secure context (required for crypto.subtle)
    const secureContext = isSecureContext();
    console.log("[Gateway] Secure context:", secureContext);
    
    let deviceIdentity: DeviceIdentity | null = null;
    let authToken = this.config.token;
    let canFallbackToShared = false;
    
    // In secure contexts, use device identity for authentication
    if (secureContext) {
      try {
        deviceIdentity = await loadOrCreateDeviceIdentity();
        console.log("[Gateway] Device identity loaded:", deviceIdentity.deviceId.substring(0, 16) + "...");
        
        // Try to load stored device auth token
        const storedEntry = await loadDeviceAuthToken({
          deviceId: deviceIdentity.deviceId,
          role,
        });
        const storedToken = storedEntry?.token;
        
        authToken = storedToken ?? this.config.token;
        canFallbackToShared = Boolean(storedToken && this.config.token);
      } catch (err) {
        console.warn("[Gateway] Failed to load device identity:", err);
      }
    }
    
    // Build auth payload
    const auth = authToken || this.config.password
      ? { token: authToken, password: this.config.password }
      : undefined;
    
    // Build device signing payload (only in secure contexts)
    let device: {
      id: string;
      publicKey: string;
      signature: string;
      signedAt: number;
      nonce: string | undefined;
    } | undefined;
    
    if (secureContext && deviceIdentity) {
      const signedAtMs = Date.now();
      const nonce = this.connectNonce ?? undefined;
      
      const payload = buildDeviceAuthPayload({
        deviceId: deviceIdentity.deviceId,
        clientId,
        clientMode,
        role,
        scopes,
        signedAtMs,
        token: authToken ?? null,
        nonce,
      });
      
      try {
        const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
        device = {
          id: deviceIdentity.deviceId,
          publicKey: deviceIdentity.publicKey,
          signature,
          signedAt: signedAtMs,
          nonce,
        };
        console.log("[Gateway] Device signature created");
      } catch (err) {
        console.warn("[Gateway] Failed to sign device payload:", err);
      }
    }
    
    // Build connect request params
    const params = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: clientId,
        version: "0.1.0",
        platform: navigator.platform ?? "web",
        mode: clientMode,
      },
      role,
      scopes,
      device,  // Device identity and signature
      caps: [],
      auth,
      userAgent: "openclaw-desktop/0.1.0",
      locale: resolveClientLocale(),
    };
    
    const connectRequest = {
      type: "req",
      id: requestId,
      method: "connect",
      params,
    };

    const logSafe = { ...connectRequest, params: { ...connectRequest.params, auth: connectRequest.params.auth ? { ...connectRequest.params.auth, token: "***", password: "***" } : undefined } };
    console.log("[Gateway] Sending connect request:", JSON.stringify(logSafe, null, 2));
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: (result: unknown) => {
          console.log("[Gateway] Connect response received (auth redacted)");
          const res = result as HelloOkResult & { auth?: { deviceToken?: string; role?: string; scopes?: string[] } };
          
          // Save device token for future connections
          if (res?.auth?.deviceToken && deviceIdentity) {
            storeDeviceAuthToken({
              deviceId: deviceIdentity.deviceId,
              role: res.auth.role ?? role,
              token: res.auth.deviceToken,
              scopes: res.auth.scopes ?? [],
            }).then(() => console.log("[Gateway] Stored device auth token"))
              .catch(e => console.warn("[Gateway] Failed to store device auth token:", e));
          } else if (res?.deviceToken && !this.config.deviceToken) {
            this.config.deviceToken = res.deviceToken;
          }

          this.reconnectAttempt = 0;
          this.setStatus("connected");
          if (res?.snapshot) {
            this.onSnapshot?.(res.snapshot);
          }
          resolve();
        },
        reject: (error: Error) => {
          console.error("[Gateway] Connect failed:", error);
          
          // Clear device auth token on failure if we can fall back
          if (canFallbackToShared && deviceIdentity) {
            clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role })
              .catch(e => console.warn("[Gateway] Failed to clear device auth token:", e));
          }
          
          this.setStatus("error");
          this.onError?.(`Authentication failed: ${error.message}`);
          reject(error);
        }
      });

      // Send the message
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(connectRequest));
        
        // Timeout after 30s
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            this.setStatus("error");
            this.onError?.("Authentication timeout");
            reject(new Error("Authentication timeout"));
          }
        }, 30000);
      } else {
        reject(new Error("WebSocket not open"));
      }
    });
  }

  private async getDeviceId(): Promise<string> {
    try {
      // Try to get from the gateway's stored state in SQLite
      const rows = await db.gateways.list();
      const gw = rows.find(r => r.id === this.config.id);
      if (gw?.deviceId) return gw.deviceId;
    } catch {
      // fall through
    }
    // Generate and store a new one
    const id = crypto.randomUUID();
    db.gateways.updateState(this.config.id, "device_id", id).catch(() => {});
    return id;
  }

  // ========== Reconnection ==========

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    
    const delay = RECONNECT_DELAYS[
      Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
    ];
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ========== Request/Response ==========

  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }

      // Use openClaw format: { type: "req", id, method, params }
      const id = `req-${++this.requestId}`;
      const msg = {
        type: "req",
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
      });

      console.log(`[Gateway] Sending request: ${method}`);
      this.ws.send(JSON.stringify(msg));

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 30000);
    });
  }

  // ========== API Methods ==========

  async getHealth(): Promise<unknown> {
    return this.request("health");
  }

  async fetchStatus(): Promise<unknown> {
    return this.request("status");
  }

  async getSessions(params?: { limit?: number; includeDerivedTitles?: boolean; includeLastMessage?: boolean }): Promise<SessionInfo[]> {
    const result = await this.request<{ sessions: SessionInfo[] }>("sessions.list", params ?? {});
    return result?.sessions ?? [];
  }

  async getSessionsRaw(params?: { limit?: number; includeDerivedTitles?: boolean; includeLastMessage?: boolean }): Promise<{ sessions: SessionInfo[]; defaults?: unknown }> {
    return this.request<{ sessions: SessionInfo[]; defaults?: unknown }>("sessions.list", params ?? {});
  }

  async getModels(): Promise<ModelsSnapshot> {
    return this.request<ModelsSnapshot>("models.list");
  }

  async setModel(modelId: string): Promise<void> {
    await this.request("models.set", { model: modelId });
  }

  async getChatHistory(sessionKey: string, limit = 200): Promise<ChatMessage[]> {
    const result = await this.request<unknown>("chat.history", {
      sessionKey,
      limit,
    });

    // Handle different response formats from various gateway versions:
    // - Array directly: [msg1, msg2, ...]
    // - Object with messages: { messages: [...] }
    // - Object with history: { history: [...] }
    let rawMessages: unknown[];
    if (Array.isArray(result)) {
      rawMessages = result;
    } else if (result && typeof result === "object") {
      const obj = result as Record<string, unknown>;
      if (Array.isArray(obj.messages)) {
        rawMessages = obj.messages;
      } else if (Array.isArray(obj.history)) {
        rawMessages = obj.history;
      } else {
        rawMessages = [];
      }
    } else {
      rawMessages = [];
    }

    return rawMessages
      .map((message, index) => this.normalizeHistoryMessage(message, index))
      .filter((message): message is ChatMessage => message !== null);
  }

  async sendChat(params: ChatSendParams): Promise<ChatSendResult> {
    return this.request<ChatSendResult>("chat.send", params as unknown as Record<string, unknown>);
  }

  async abortChat(sessionKey?: string, runId?: string): Promise<void> {
    await this.request("chat.abort", { sessionKey, runId });
  }

  async injectNote(message: string, sessionKey: string): Promise<void> {
    await this.request("chat.inject", { message, sessionKey });
  }

  /**
   * Fetch assistant identity metadata from the gateway's web UI.
   * OpenClaw injects window.__OPENCLAW_ASSISTANT_NAME__ and
   * window.__OPENCLAW_ASSISTANT_AVATAR__ in the served HTML at /chat.
   * Uses Tauri invoke (Rust-side HTTP) to bypass CORS.
   */
  async fetchAssistantMeta(): Promise<{ name: string | null; avatar: string | null }> {
    try {
      // Try Tauri invoke first (CORS-free, Rust-side HTTP fetch)
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ name: string | null; avatar: string | null }>(
        "fetch_assistant_meta",
        { url: this.config.url }
      );
      return result;
    } catch (e) {
      // Fallback to browser fetch (works when not in Tauri or invoke fails)
      try {
        const wsUrl = new URL(this.config.url);
        const protocol = wsUrl.protocol === "wss:" ? "https" : "http";
        const httpUrl = `${protocol}://${wsUrl.host}/chat`;

        const res = await fetch(httpUrl, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return { name: null, avatar: null };

        const html = await res.text();
        if (!html) return { name: null, avatar: null };

        const nameMatch = html.match(/__OPENCLAW_ASSISTANT_NAME__\s*=\s*"([^"]+)"/);
        const avatarMatch = html.match(/__OPENCLAW_ASSISTANT_AVATAR__\s*=\s*"([^"]+)"/);

        return {
          name: nameMatch?.[1] ?? null,
          avatar: avatarMatch?.[1] ?? null,
        };
      } catch (fallbackErr) {
        console.warn("[Gateway] Failed to fetch assistant meta:", fallbackErr);
        return { name: null, avatar: null };
      }
    }
  }
}
