# openClaw Desktop

openClaw Desktop is a Tauri + SvelteKit desktop application that combines:

- Multi-gateway AI chat (including NPC mode)
- A document workspace (Forge) with OCR and agent-assisted editing
- A built-in game hub with 14 game modules under `/play`

This README documents the current implementation in this repository.
Snapshot date: February 14, 2026.

## Project Snapshot

- Product name: `openClaw Desktop`
- App version: `0.1.0`
- Frontend: Svelte 5 + SvelteKit 2 + TypeScript + Vite
- Desktop shell: Tauri 2 (Rust backend)
- Primary package manager: Bun
- Persistence:
  - Desktop: SQLite through Tauri commands
  - Web-only dev fallback: localStorage-backed adapters

## Main Areas

The app is organized around five top-level routes:

- `/` Home dashboard
- `/chat` Multi-gateway chat workspace
- `/play` Game hub
- `/forge` Document editing workspace
- `/settings` Appearance/system/gateway/API-key controls

## What Is Implemented

### 1) Chat + Gateway Workspace

The chat stack supports multiple OpenClaw gateways at once.

Core capabilities:

- Multiple gateway configs with active gateway switching
- Connection states per gateway: disconnected, connecting, authenticating, connected, reconnecting, error
- Auth modes: `token`, `password`, `tailscale`
- Device identity/auth flow using Ed25519 keys (`@noble/ed25519`)
- Session support:
  - load sessions
  - switch sessions
  - create new session keys
  - persist active session per gateway
- Server-driven model snapshot + model switching
- Streaming response handling with watchdog and hard deadline recovery
- User message optimistic rendering + server-authoritative history reload
- File/image attachments (base64 transport)
- Inline button selection support (single-select and multi-select confirmation)
- Cross-gateway forwarding (`sendMessageToGateway`) and tab drag/drop forwarding
- Desktop notifications with sound preference

Gateway protocol and client details are implemented in:

- `src/lib/gateway/client.ts`
- `src/lib/gateway/store.svelte.ts`
- `src/lib/gateway/types.ts`

### 2) NPC Chat Mode

NPC mode is implemented in chat UI/state and theme stores.

Implemented behavior:

- Chat mode toggle: standard chat vs NPC
- NPC directive parsing in messages:
  - `[face:...]`
  - `[act:...]`
  - `[bg:...]`
- Emotion/action extraction and visual rendering support
- Built-in NPC themes and custom theme persistence
- Per-gateway active NPC theme ID persistence
- Dynamic NPC background generation service

Background generation currently supports provider adapters for:

- Google Imagen
- Nanobanana

Paths are cached in SQLite and resolved as Tauri file assets.

Relevant files:

- `src/lib/components/Chat/ChatPanel.svelte`
- `src/lib/gateway/npcThemeStore.svelte.ts`
- `src/lib/gateway/npcBackgroundService.ts`

### 3) Forge (Document Workspace)

Forge is a document-oriented workspace with file-open/edit/review flows and agent integration.

Implemented capabilities:

- Open from picker and drag/drop
- Extension-aware routing to document adapters
- Session-based document management in Rust backend
- Save, undo/redo, stage patch, commit, discard
- Agent-driven edits:
  - staged patch approval flow
  - auto-apply mode for `write_document` style tool output
- Split workspace with integrated chat panel
- Window auto-resize behavior while in document editing context

Supported formats (current behavior):

- Spreadsheet/grid:
  - `xlsx`, `xls`, `ods`, `csv`
- Text-like/rich-text pipeline:
  - `txt`, `md`, `markdown`, `json`
  - `docx`, `doc`
  - `hwp`, `hwpx`
- PDF:
  - view + OCR extract
  - OCR layout extraction
  - PDF overlay export from annotation ops
  - save OCR text to DOCX
- Presentation:
  - `pptx` parsing/view pipeline
  - legacy `ppt` is currently rejected by the Rust adapter and should be converted to `pptx`

OCR notes:

- Tesseract runtime resolution order is documented in `src-tauri/resources/tesseract/README.md`.
- Language pack provisioning uses `doc_ocr_ensure_langs`.

Relevant files:

- `src/routes/forge/+page.svelte`
- `src/lib/stores/document.svelte.ts`
- `src/lib/stores/pdfEditor.svelte.ts`
- `src-tauri/src/document/*`

### 4) Games Hub

The `/play` lobby is data-driven by `meta.json` files under `src/routes/play/*`.

- The registry auto-discovers `meta.json` files via `import.meta.glob`
- Metadata is seeded to the `games` table in SQLite
- Visibility and ordering are DB-backed

Registry implementation:

- `src/lib/play/registry.ts`
- `src/lib/play/module.ts`

### 5) Built-in Games (Current)

Game IDs and status are read from `src/routes/play/*/meta.json`.

| ID | Route | Status | Current implementation highlights |
|---|---|---|---|
| `checkers` | `/play/checkers` | playable | 3D board, legal move/capture logic, agent move parsing + offline fallback |
| `chess` | `/play/chess` | playable | `chess.js` engine, styled 3D pieces, move animations, placement sound, Player vs Agent + Agent vs Agent |
| `cube` | `/play/cube` | playable | 3D Rubik's Cube, scramble/undo/state, agent hint chat panel |
| `go3d` | `/play/go3d` | playable | 9/13/19 board sizes, ko handling, scoring/pass logic, agent/offline/AvA modes, coach prompt |
| `gostop` | `/play/gostop` | playable | 3-player go-stop engine, Go/Stop phase, Program/Agent/Human seat presets, 48-card hwatu pack |
| `janggi` | `/play/janggi` | soon | Korean chess logic + 3D board, per-piece geometry scaling, move animations, placement sound, agent/offline mode |
| `lightsout` | `/play/lightsout` | playable | 3D board interactions, local hinting, AI assistant panel |
| `matgo` | `/play/matgo` | playable | 2-player engine, Program vs Human and Agent vs Human setup, auto-play toggle, emote button UI, 48-card hwatu pack |
| `mines3d` | `/play/mines3d` | playable | 3D minesweeper, multi-level hints + AI coach panel |
| `nonogram3d` | `/play/nonogram3d` | playable | 3D nonogram puzzle logic + AI coach panel |
| `rules3d` | `/play/rules3d` | playable | "Baba Is You"-style rule parser/engine, level system, hints, AI coach panel |
| `slitherlink` | `/play/slitherlink` | playable | Loop puzzle engine + AI coach panel |
| `sokoban3d` | `/play/sokoban3d` | playable | 3D sokoban levels + AI hint panel |
| `texaspoker` | `/play/texaspoker` | playable | 3-seat Texas Hold'em simulation, hand ranking/showdown, Program/Agent/Human seat presets |

#### Seat/Agent Participation (Matgo, Go-Stop, Texas Poker)

Implemented seat presets:

- `program-program-human`
- `program-agent-human`
- `agent-agent-human` (requires at least 2 connected gateways)

Matgo uses 2 seats (`opponent`, `human`) and supports:

- `program-human`
- `agent-human` (requires at least 1 gateway)

#### Board Audio / Move Feedback

Implemented game-local sound modules:

- `src/routes/play/matgo/sounds.ts`
- `src/routes/play/gostop/sounds.ts`
- `src/routes/play/janggi/sounds.ts`
- `src/routes/play/chess/sounds.ts`

Janggi and Chess 3D boards currently include move animation and piece placement sound triggers.

### 6) Hwatu Card Asset Pipeline

Matgo and Go-Stop load local 48-card hwatu PNG packs from game-local folders:

- `src/routes/play/matgo/hwatu/`
- `src/routes/play/gostop/hwatu/`

Loader modules:

- `src/routes/play/matgo/hwatu.ts`
- `src/routes/play/gostop/hwatu.ts`

Asset metadata/licensing notes are documented in:

- `static/hwatu/README.md`

### 7) Onboarding / First-Run Setup

A first-run setup wizard is implemented and mounted from the root layout.

Current flow includes:

- Locale selection (`en`, `ko`)
- Theme selection (`system`, `light`, `dark`)
- Local OpenClaw gateway auto-detection (`detect_local_openclaw` Tauri command)
- Optional gateway bootstrap and auto-connect

Relevant files:

- `src/lib/components/Wizard/SetupWizard.svelte`
- `src/lib/tauri.ts`
- `src-tauri/src/lib.rs` (`detect_local_openclaw`)

## Game Packaging Rule

This repository currently treats each game as a self-contained module inside route space.

Required placement rule for built-in games:

- Put game code under `src/routes/play/<game-id>/`
- Keep game-specific engine/UI/state/sound/theme/assets in that folder
- Keep `src/lib/play` limited to shared game module typing + registry logic

This is intentionally aligned with a future store/plugin packaging model.

## Plugin Runtime (Current State)

Frontend scaffolding for plugin hosting exists:

- Route: `src/routes/play/plugin/[pluginId]/+page.svelte`
- Host container: `src/lib/plugin/PluginHost.svelte`
- Message bridge: `src/lib/plugin/bridge.ts`
- Protocol/types: `src/lib/plugin/types.ts`

The bridge includes permission-gated patterns for storage + LLM proxy messages.

Important current status:

- The Rust-side installer/registry/storage command surface for plugin lifecycle is not fully wired in `src-tauri/src/lib.rs` yet.
- The plugin host layer is therefore best considered scaffold/in-progress in this snapshot.

## Data Model and Persistence

SQLite schema includes:

- `gateways`
- `app_state`
- `settings`
- `device_identity`
- `device_auth`
- `npc_themes`
- `npc_bg_paths`
- `games`

Schema source:

- `src-tauri/src/database/schema.rs`

Migration path:

- One-time localStorage -> SQLite migration in `src/lib/migration.ts`

## Repository Structure

```text
src/
  lib/
    components/
      Chat/
      Document/
      Forge/
      Gateway/
      Wizard/
    db.ts
    gateway/
      client.ts
      store.svelte.ts
      npcThemeStore.svelte.ts
      npcBackgroundService.ts
      device-identity.ts
      device-auth.ts
      types.ts
    play/
      module.ts
      registry.ts
    plugin/
      PluginHost.svelte
      bridge.ts
      types.ts
    stores/
      document.svelte.ts
      pdfEditor.svelte.ts
    i18n.ts
    theme.ts
    settings.ts
  routes/
    +layout.svelte
    +page.svelte
    chat/+page.svelte
    forge/+page.svelte
    play/
      +page.svelte
      <game-id>/
      plugin/[pluginId]/+page.svelte
    settings/+page.svelte
src-tauri/
  src/
    lib.rs
    database/
    document/
  tauri.conf.json
static/
  hwatu/
```

## Development

### Prerequisites

- Bun 1.x
- Rust toolchain (`rustup`, `cargo`)
- Tauri system dependencies for your OS
  - https://tauri.app/start/prerequisites/

Optional but useful for full feature coverage:

- Tesseract runtime + language files (`eng`, `kor`) for OCR
- `textutil` (macOS) for some legacy document conversion paths

### Install

```bash
bun install
```

### Run

```bash
# Web-only dev server
bun run dev

# Desktop app (Tauri)
bun run tauri dev
```

### Build

```bash
# Frontend build
bun run build

# Desktop bundle
bun run tauri build
```

### Type Check

```bash
bun run check
```

### Utility Scripts

```bash
# Generate themed app icons
bun run icon:light
bun run icon:dark
```

## Notes for Contributors

### Built-in game registration

To add a built-in game:

1. Create `src/routes/play/<new-id>/`
2. Add `meta.json` with at least:
   - `id`
   - `emoji`
   - `titleKey`
   - `descKey`
   - `status`
3. Add `+page.svelte` and game implementation files
4. Registry seeding will discover it automatically

### Keep game code local to route folders

Do not place game-specific runtime logic in `src/lib/play/*`.
That directory is reserved for shared game module typing and registry loading.
