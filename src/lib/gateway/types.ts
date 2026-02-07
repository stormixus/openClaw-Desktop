/**
 * OpenClaw Gateway Protocol Types
 * Based on Protocol Version 3
 */

// ============================================================================
// Connection & Authentication
// ============================================================================

export type AuthMethod = "token" | "password" | "tailscale";

export interface GatewayConfig {
  id: string;
  name: string;
  url: string; // ws://IP:18789
  authMethod: AuthMethod;
  token?: string;
  password?: string;
  deviceToken?: string; // Saved after first connection
}

export type ConnectionStatus = 
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected"
  | "reconnecting"
  | "error";

export interface GatewayState {
  config: GatewayConfig;
  status: ConnectionStatus;
  error?: string;
  snapshot?: GatewaySnapshot;
}

// ============================================================================
// Protocol Messages
// ============================================================================

export interface BaseMessage {
  jsonrpc: "2.0";
  id?: string | number;
}

export interface RequestMessage extends BaseMessage {
  method: string;
  params?: Record<string, unknown>;
}

export interface ResponseMessage extends BaseMessage {
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface NotificationMessage {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// ============================================================================
// Connect Flow
// ============================================================================

export interface ConnectChallenge {
  nonce: string;
  serverVersion: number;
}

export interface ConnectParams {
  clientVersion: number;
  deviceId: string;
  mode: "operator" | "node";
  auth?: {
    token?: string;
    password?: string;
    deviceToken?: string;
  };
  device?: {
    name: string;
    type: string;
  };
}

export interface HelloOkResult {
  deviceToken: string;
  snapshot: GatewaySnapshot;
}

export interface GatewaySnapshot {
  health: HealthSnapshot;
  models: ModelsSnapshot;
  agents: AgentInfo[];
  sessions: SessionInfo[];
}

// ============================================================================
// Health & Status
// ============================================================================

export interface HealthSnapshot {
  status: "ok" | "degraded" | "error";
  gateway: {
    version: string;
    uptime: number;
  };
  providers: ProviderStatus[];
}

export interface ProviderStatus {
  name: string;
  status: "ok" | "error" | "missing_key";
  models: string[];
}

// ============================================================================
// Models
// ============================================================================

export interface ModelsSnapshot {
  current: ModelInfo;
  fallback: ModelInfo[];
  available: ModelInfo[];
}

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  displayName?: string;
  enabled?: boolean;  // false if API key not configured
}

// ============================================================================
// Agents & Sessions
// ============================================================================

export interface AgentInfo {
  id: string;
  name: string;
  description?: string;
  avatar?: string;  // URL to avatar image
  emoji?: string;   // Emoji to display
}

export interface SessionInfo {
  key: string;
  agentId: string;
  createdAt: string;
  lastActiveAt: string;
  settings?: SessionSettings;
}

export interface SessionSettings {
  thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  verbose?: "off" | "on" | "full";
  reasoning?: "off" | "on" | "stream";
}

// ============================================================================
// Chat
// ============================================================================

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  thinking?: string;
  buttons?: InlineButton[][];  // 2D array: rows of buttons
  selectedButton?: string;     // callback_data of selected button (single)
  selectedButtons?: string[];  // callback_data array (multi)
  selectMode?: "single" | "multi";  // default: single
}

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "complete" | "error";
}

export interface ChatSendParams {
  sessionKey: string;           // Required: session to send message to
  message: string;              // Required: the message text (not 'content')
  idempotencyKey: string;       // Required: unique ID for this message
  agentId?: string;             // Optional: specific agent to handle
  deliver?: boolean;            // Optional: whether to deliver immediately
  attachments?: ChatAttachment[]; // Optional: image/file attachments
}

export interface ChatAttachment {
  type: "image" | "file";
  mimeType: string;
  content: string;  // base64 data
  fileName?: string;
}

export interface FileAttachment {
  name: string;
  type: string;
  data: string; // base64
}

export interface ChatSendResult {
  runId: string;
  status: "started" | "in_flight" | "ok";
}

// openClaw chat event payload structure
export interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;  // The message content (can contain text blocks)
  errorMessage?: string;
}

// ============================================================================
// Agent Events (Streaming)
// ============================================================================

export type AgentEvent =
  | AgentTextEvent
  | AgentToolStartEvent
  | AgentToolOutputEvent
  | AgentToolEndEvent
  | AgentThinkingEvent
  | AgentDoneEvent
  | AgentErrorEvent;

export interface AgentTextEvent {
  type: "text";
  content: string;
  delta?: string;
}

export interface AgentToolStartEvent {
  type: "tool_start";
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentToolOutputEvent {
  type: "tool_output";
  toolCallId: string;
  output: string;
  delta?: string;
}

export interface AgentToolEndEvent {
  type: "tool_end";
  toolCallId: string;
  result: unknown;
}

export interface AgentThinkingEvent {
  type: "thinking";
  content: string;
  delta?: string;
}

export interface AgentDoneEvent {
  type: "done";
  runId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface AgentErrorEvent {
  type: "error";
  code: string;
  message: string;
}
