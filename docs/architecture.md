# Architecture

## Overview

openClaw Desktop is a **Tauri 2** desktop application with a **SvelteKit 5** frontend and **Rust** backend. It functions as a multi-gateway AI hub combining real-time chat, document editing, and a game platform.

```
┌─────────────────────────────────────────────────┐
│                   Tauri Shell                    │
│  ┌───────────────────────────────────────────┐   │
│  │           SvelteKit Frontend              │   │
│  │  ┌─────────┬─────────┬────────┬────────┐  │   │
│  │  │  Chat   │  Forge  │ Games  │Settings│  │   │
│  │  └────┬────┴────┬────┴───┬────┴────────┘  │   │
│  │       │         │        │                │   │
│  │  ┌────▼─────────▼────────▼──────────────┐ │   │
│  │  │         Gateway Store (WS)           │ │   │
│  │  └────┬─────────────────────────────────┘ │   │
│  └───────┼───────────────────────────────────┘   │
│          │  Tauri invoke                         │
│  ┌───────▼───────────────────────────────────┐   │
│  │            Rust Backend                   │   │
│  │  ┌──────────┬──────────┬───────────────┐  │   │
│  │  │ Document │ Database │  Font/System  │  │   │
│  │  │ Manager  │ (SQLite) │   Services    │  │   │
│  │  └──────────┴──────────┴───────────────┘  │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
         │                          │
    WebSocket (v3)            File System
         │                          │
   ┌─────▼─────┐            ┌──────▼──────┐
   │  openClaw  │            │ Local Files │
   │  Gateway   │            │ (.xlsx, etc)│
   └───────────┘            └─────────────┘
```

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| Svelte | 5.x | UI framework (runes mode) |
| SvelteKit | 2.x | Application framework |
| Vite | 6.x | Build tool / dev server |
| TipTap | 3.x | Rich text editor (Word/Markdown) |
| Three.js | 0.182 | 3D rendering (games) |
| PDF.js | 5.x | PDF viewing |
| marked | 17.x | Markdown parsing |
| DOMPurify | 3.x | HTML sanitization |
| chess.js | 1.4 | Chess engine |
| highlight.js | 11.x | Code syntax highlighting |
| @noble/ed25519 | 3.x | Device identity signing |
| @lucide/svelte | 0.563 | Icon library |

### Backend (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| tauri | 2.x | Desktop framework |
| rusqlite | 0.31 | SQLite database |
| calamine | 0.26 | Excel reading |
| rust_xlsxwriter | 0.79 | Excel writing |
| pdf-extract | 0.7 | PDF text extraction |
| lopdf | 0.34 | PDF manipulation |
| font-kit | 0.14 | System font enumeration |
| roxmltree | 0.20 | XML parsing (DOCX, PPTX) |
| cfb | 0.7 | OLE compound files (HWP) |
| zip | 0.6 | Archive handling |
| reqwest | 0.12 | HTTP client |
| json-patch | 3.x | JSON patch operations |

## Directory Structure

```
src/
├── routes/                     # SvelteKit pages
│   ├── +layout.svelte          # Root layout (sidebar, titlebar, init)
│   ├── +page.svelte            # Home dashboard
│   ├── chat/+page.svelte       # Chat interface
│   ├── forge/                  # Document editor
│   │   ├── +page.svelte        # Main forge page
│   │   └── npc/+page.svelte    # NPC character editor
│   ├── play/                   # Game hub
│   │   ├── +page.svelte        # Game lobby
│   │   ├── chess/              # Chess game
│   │   ├── checkers/           # Checkers game
│   │   ├── poker/              # Texas Hold'em
│   │   ├── gostop/             # Go-Stop (Hwatu)
│   │   ├── matgo/              # Matgo (2-player Hwatu)
│   │   ├── janggi/             # Korean chess
│   │   ├── go3d/               # 3D Go
│   │   ├── cube/               # 3D Cube puzzle
│   │   ├── mines3d/            # 3D Minesweeper
│   │   ├── nonogram3d/         # 3D Nonogram
│   │   ├── rules3d/            # 3D Rules puzzle
│   │   ├── lightsout/          # Lights Out
│   │   ├── sokoban3d/          # 3D Sokoban
│   │   ├── slitherlink/        # Slitherlink puzzle
│   │   └── plugin/             # Community plugins
│   ├── settings/+page.svelte   # Settings page
│   └── onboarding/+page.svelte # First-run wizard
│
├── lib/
│   ├── components/
│   │   ├── Chat/               # ChatPanel, ChatMessage, etc.
│   │   ├── Forge/              # WordEditor, MarkdownEditor, JsonEditor, etc.
│   │   ├── Document/           # DocPreview, DiffView, GridView
│   │   ├── Gateway/            # GatewayPanel, GatewayDialog
│   │   ├── FileUpload/         # FileDropZone, FilePreview
│   │   ├── Wizard/             # SetupWizard
│   │   ├── Sidebar.svelte
│   │   ├── TitleBar.svelte
│   │   └── StatusBar.svelte
│   │
│   ├── stores/                 # Svelte 5 rune stores
│   │   ├── document.svelte.ts  # Document state + Rust bindings
│   │   ├── pdfEditor.svelte.ts # PDF annotation state
│   │   └── fonts.svelte.ts     # System fonts
│   │
│   ├── gateway/                # Gateway protocol layer
│   │   ├── store.svelte.ts     # Multi-gateway reactive store
│   │   ├── client.ts           # WebSocket client
│   │   ├── types.ts            # Protocol type definitions
│   │   ├── device-identity.ts  # Ed25519 device keys
│   │   ├── device-auth.ts      # Token storage
│   │   ├── npcThemeStore.svelte.ts
│   │   └── npcThemeTypes.ts
│   │
│   ├── lang/                   # i18n dictionaries
│   │   ├── en/index.ts         # English (500+ keys)
│   │   └── ko/index.ts         # Korean (500+ keys)
│   │
│   ├── i18n.ts                 # i18n setup & helpers
│   ├── settings.ts             # App settings
│   ├── theme.ts                # Theme management
│   ├── db.ts                   # SQLite wrapper
│   └── migration.ts            # localStorage → SQLite migration

src-tauri/
├── src/
│   ├── lib.rs                  # Tauri command registration
│   ├── main.rs                 # App entry point
│   ├── database/               # SQLite operations
│   │   ├── mod.rs
│   │   ├── schema.rs           # Table definitions
│   │   ├── migration.rs        # Schema versioning
│   │   ├── gateways.rs         # Gateway CRUD
│   │   ├── games.rs            # Game state persistence
│   │   ├── auth.rs             # Auth tokens
│   │   ├── identity.rs         # Device identity
│   │   └── settings.rs         # App settings
│   └── document/               # Document processing
│       ├── mod.rs
│       ├── manager.rs          # Document lifecycle
│       ├── commands.rs         # Tauri IPC handlers
│       ├── patch.rs            # Patch application
│       └── formats/
│           ├── excel.rs        # XLSX read/write
│           ├── docx.rs         # DOCX parsing
│           ├── pdf.rs          # PDF extraction
│           ├── pdf_export.rs   # PDF generation
│           ├── pdf_layout.rs   # PDF layout engine
│           ├── pptx.rs         # PPTX parsing
│           ├── hwp.rs          # HWP format
│           └── xlsx_visuals.rs # Excel styling
├── tauri.conf.json             # Tauri configuration
└── capabilities/               # Permission capabilities
```

## State Management

All frontend state uses **Svelte 5 runes** (`$state`, `$derived`, `$effect`).

### Store Hierarchy

```
Gateway Store (store.svelte.ts)
├── gateways[]              # Gateway configs
├── activeGatewayId         # Currently selected
├── gatewayStates{}         # Per-gateway connection + snapshot
├── chatMessages[]          # Server-authoritative messages
├── streamingContent        # Real-time delta stream
├── chatMode                # "chat" | "npc"
├── npcEmotion/Action/Bg    # NPC rendering state
└── forgeState              # Document editing context
    ├── activeDocId
    ├── fullContent
    ├── pendingPatch
    └── isAgentEditing

Document Store (document.svelte.ts)
├── activeDocument          # Current open document
├── isLoading               # Loading state
└── documents[]             # Open document list

NPC Theme Store (npcThemeStore.svelte.ts)
├── themes[]                # Character definitions
├── activeThemeId           # Current character
└── CRUD operations         # SQLite-backed persistence

Settings (settings.ts)
├── theme                   # light | dark | system
├── language                # en | ko
├── thinkingLevel           # none | low | medium | high
└── system prefs            # auto-update, tray, startup
```

### Data Flow

```
User Action → Component → Store → Gateway (WebSocket)
                                      ↓
                                  AI Response
                                      ↓
                              Gateway Event → Store → Component → UI Update
```

For documents:
```
File Open → Tauri invoke → Rust parser → JSON → Document Store → Editor Component
                                                                       ↓
                                                                  User Edits
                                                                       ↓
File Save ← Tauri invoke ← Rust writer ← JSON ← Document Store ← onChange
```

## Database Schema (SQLite)

Tables managed by Rust backend:

| Table | Purpose |
|-------|---------|
| `gateways` | Gateway connection configs |
| `device_identity` | Ed25519 key pair per device |
| `device_auth` | Cached device tokens per gateway |
| `game_state` | Persistent game saves |
| `npc_themes` | Character/persona definitions |
| `settings` | App preferences (key-value) |
| `schema_version` | Migration tracking |

## Security Model

- **Tauri Capabilities**: Fine-grained permission system via `capabilities/` directory
- **Device Identity**: Ed25519 keypair generated once, stored in SQLite
- **Gateway Auth**: Token-based + device signature challenge-response
- **HTML Sanitization**: DOMPurify on all rendered HTML content
- **File Dialogs**: Native OS dialogs via `@tauri-apps/plugin-dialog`
