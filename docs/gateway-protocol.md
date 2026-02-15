# Gateway Protocol (v3)

## Overview

openClaw Desktop communicates with openClaw Gateway servers over **WebSocket**. The protocol supports authentication, real-time chat, model management, and document collaboration.

## Connection

### Endpoint
```
ws://<host>:<port>/?token=<auth_token>
```
Default port: `18789`

### Connection Lifecycle
```
Client                              Server
  │                                    │
  │──── WebSocket connect ────────────▶│
  │                                    │
  │◀─── connect.challenge (nonce) ─────│
  │                                    │
  │──── connect (signature + auth) ───▶│
  │                                    │
  │◀─── connect.ok (token + snapshot) ─│
  │                                    │
  │◀───── events (streaming) ─────────▶│
  │                                    │
```

### States
```
disconnected → connecting → authenticating → connected
                                                ↓
                                             error
                                                ↓
                                         (auto-reconnect)
```

## Authentication

### Device Identity

Each device generates a persistent **Ed25519** keypair on first run, stored in SQLite:

```typescript
interface DeviceIdentity {
  publicKey: string;   // hex-encoded
  privateKey: string;  // hex-encoded
}
```

### Challenge-Response

1. Server sends `connect.challenge` with random nonce
2. Client signs `nonce + timestamp + publicKey` with device private key
3. Server verifies signature and issues a `deviceToken`
4. Device token is cached locally for future connections

### Auth Payload
```json
{
  "method": "connect",
  "params": {
    "devicePublicKey": "<hex>",
    "signature": "<hex>",
    "timestamp": 1700000000,
    "authToken": "<user-provided-token>",
    "clientVersion": "1.0.0"
  }
}
```

## Message Format

### Request
```json
{
  "type": "req",
  "id": "req-<uuid>",
  "method": "<method-name>",
  "params": { ... }
}
```

### Response
```json
{
  "type": "res",
  "id": "req-<uuid>",
  "ok": true,
  "payload": { ... }
}
```

### Error Response
```json
{
  "type": "res",
  "id": "req-<uuid>",
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid token"
  }
}
```

### Server Event
```json
{
  "type": "event",
  "event": "<event-name>",
  "payload": { ... }
}
```

## API Methods

### Connection

| Method | Description |
|--------|-------------|
| `connect` | Authenticate and receive initial snapshot |
| `health` | Check gateway health and latency |

### Chat

| Method | Params | Description |
|--------|--------|-------------|
| `chat.send` | `sessionKey`, `content`, `attachments?` | Send a message |
| `chat.history` | `sessionKey`, `limit?` | Load message history |
| `chat.abort` | `sessionKey` | Stop streaming response |

### Models

| Method | Params | Description |
|--------|--------|-------------|
| `models.list` | — | List available AI models |
| `models.set` | `modelId` | Switch active model |

### Sessions

| Method | Params | Description |
|--------|--------|-------------|
| `sessions.list` | — | List all conversations |
| `sessions.create` | `title?` | Create new session |

## Events

### Chat Events
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "sessionKey": "sess-123",
    "state": "delta",
    "content": "Hello, ",
    "messageId": "msg-456"
  }
}
```

**States**:
| State | Description |
|-------|-------------|
| `delta` | Streaming content chunk |
| `final` | Message complete, includes full content |
| `error` | Processing failed |

### Snapshot Events
```json
{
  "type": "event",
  "event": "snapshot",
  "payload": {
    "models": [...],
    "agents": [...],
    "sessions": [...]
  }
}
```

Sent on connection and whenever server state changes (model added, session created, etc.).

### Tool Call Events
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "state": "tool_call",
    "tool": "write_document",
    "arguments": {
      "content": "...",
      "format": "markdown"
    }
  }
}
```

**Supported Tools**:
| Tool | Description |
|------|-------------|
| `write_document` | Replace document content |
| `edit_document` | Apply targeted patches |
| `send_file` | Send file to client |

## Reconnection

On disconnect, the client implements **exponential backoff**:

```
Attempt 1: 1s delay
Attempt 2: 2s delay
Attempt 3: 4s delay
Attempt 4: 8s delay
...
Max delay: 30s
```

Cached device tokens are used for reconnection (skips challenge-response).

## Multi-Gateway

The app supports connecting to multiple gateways simultaneously:

- Each gateway has independent WebSocket connection
- One gateway is "active" at a time for chat
- Gateway snapshots are stored per-connection
- Messages can be forwarded between gateways
- NPC themes are shared across gateways

### Gateway Store Structure
```typescript
interface GatewayState {
  id: string;
  config: GatewayConfig;
  status: ConnectionStatus;
  client: WebSocketClient | null;
  snapshot: {
    models: Model[];
    agents: Agent[];
    sessions: Session[];
  };
}
```
