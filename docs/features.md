# Features

## Chat

Real-time messaging with AI agents via connected gateways.

### Capabilities
- Multi-gateway selection (switch active gateway per session)
- File upload and attachment (images, documents)
- Model selection dropdown (from gateway snapshot)
- Session management (create, switch, load history)
- Streaming message display with live deltas
- In-line button support (single/multi-select from AI)
- Code block rendering with syntax highlighting
- Message actions: copy, download, forward

### NPC Mode
Toggle between standard chat and NPC (character) mode:
- System prompt injection from active NPC theme
- Emotion parsing: `[face:happy]`, `[face:thinking]`
- Action parsing: `[act:wave]`, `[act:nod]`
- Background parsing: `[bg:space]`, `[bg:forest]`
- Visual avatar responds to directives in real-time
- Theme selection from NPC theme library

### Thinking Indicators
Rotating phrases while AI processes:
`Thinking...`, `Pondering...`, `Hmm...`, `Let me think...`, `Processing...`, `Considering...`, `Working on it...`

---

## Forge (Document Editor)

Full-featured document editing suite. See [forge.md](./forge.md) for detailed specs.

### Supported Formats
| Format | Extensions | Capabilities |
|--------|-----------|-------------|
| Excel | .xlsx | Grid view, formulas, cell styling, merged ranges |
| Word | .docx | Rich text (TipTap), tables, headings |
| PDF | .pdf | Viewer, OCR, annotations, text extraction |
| PowerPoint | .pptx | Slide viewer, editing |
| Korean HWP | .hwp, .hwpx | Text extraction, editing |
| Text | .txt | Plain text editing |
| Markdown | .md | WYSIWYG editor with toolbar |
| JSON | .json | Formatted view with validation |

### AI Integration
- AI agents can edit documents via `write_document` / `edit_document` tool calls
- Approval modal for reviewing AI-proposed changes
- Inline AI rewrite: select text, give instruction, apply suggestion
- Change history with version restore
- Agent editing banner when AI is actively modifying

---

## NPC / Persona System

Character-driven AI interaction with visual feedback.

### Theme Structure
Each NPC theme defines:
```
name            # Character name
systemPrompt    # Personality/behavior instructions
emotion         # Default emotion state
background      # Scene background
avatar          # Visual representation config
```

### Emotion States
`neutral` | `happy` | `thinking` | `excited` | `sad` | `surprised` | `angry` | `calm`

### Actions
`wave` | `nod` | `shake` | `bounce` | `bow`

### Backgrounds
Preset: `default` | `forest` | `space` | `cozy` | `ocean` | `sunset`
Custom: User-uploaded images

### Directive Parsing
AI responses can contain inline directives:
```
[face:happy] I'm glad to help!
[act:wave] Hello there!
[bg:sunset] Let's watch the sunset together.
```
These are stripped from displayed text and applied to the avatar/scene.

### Persistence
NPC themes are stored in SQLite via `npc_themes` table, synced through `npcThemeStore.svelte.ts`.

---

## Gateway Management

Multi-gateway connection system for AI backend flexibility.

### Connection Flow
1. User adds gateway (URL + auth credentials)
2. App establishes WebSocket connection
3. Challenge-response authentication with Ed25519 device identity
4. Server provides snapshot (models, agents, sessions)
5. Automatic reconnection on disconnect

### Auth Methods
| Method | Description |
|--------|-------------|
| Token | API key / bearer token |
| Password | Username + password |
| Tailscale | Network-level auth |
| Device | Ed25519 signature (automatic) |

### Gateway States
`disconnected` → `connecting` → `authenticating` → `connected` → `error`

### Features
- Add/edit/remove gateways
- Per-gateway connection status
- Drag-to-reorder gateway tabs
- Duplicate gateway config
- Health check / latency display

---

## Settings

### Sections

**Appearance**
- Theme: Light / Dark / System
- Language: English / Korean

**Chat**
- Thinking level: None / Low / Medium / High
- Verbose mode (show reasoning)

**API Keys**
Supported providers:
- OpenAI
- Anthropic
- Google
- Groq
- Mistral
- OpenRouter
- Custom endpoint

**Gateway**
- Gateway list management
- Connection configuration

**System**
- Auto-update
- Launch on startup
- Minimize to tray

---

## Home Dashboard

### Quick Access
- Agent overview (connected agents count)
- Workflow shortcuts
- Activity panel with connection status

### Status Display
- Active gateways count
- Last sync timestamp
- Latency indicators
- Message queue status

---

## Onboarding

Three-step first-run wizard:
1. Welcome & app introduction
2. Gateway connection setup
3. Configuration confirmation

Completion flag stored in localStorage. Can be re-accessed from navigation.
