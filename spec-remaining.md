# OpenClaw Desktop - Remaining Phases Technical Specification

This document outlines the technical design for the remaining features in Phases 2-4.

## Phase 2: Refinement

### 1. Status Bar
**Goal:** Display real-time status of the active gateway connection, current agent/model context, and token usage.

#### Component Architecture
- **Component:** `src/lib/components/StatusBar/StatusBar.svelte`
- **Location:** Fixed at the bottom of the `+layout.svelte`.
- **State:** Connects to `$lib/gateway/store.svelte.ts` to read:
  - `gatewayStates[activeId].status` (Connection: 🟢/🔴/🟡)
  - `modelsSnapshot.current` (Model: "Claude 3.5 Sonnet")
  - `sessionKey` (Session ID)
  - `assistantMeta` (Agent Name)
- **Token Usage:** Currently mocked. Will need `tokenUsage` in `GatewayState` updated via agent events.

#### Integration Points
- **Layout:** Integrated into `src/routes/+layout.svelte`.
- **Styling:** Global footer style, distinct from sidebar and chat panel.

---

### 2. Gateway API Keys UI
**Goal:** Interface to manage API keys (e.g., for external tools) stored in local settings.

#### Component Architecture
- **Component:** `src/lib/components/Chat/ApiKeysPanel.svelte`
- **State:**
  - Reads `settings.apiKeys` (JSON string) from `src/lib/settings.ts`.
  - Uses a local `$state` for form management.
  - Validates and saves back to SQLite as JSON string via `settings.save()`.

#### Integration Points
- **Settings Panel:** Added "API Keys" tab to `src/lib/components/Chat/SettingsPanel.svelte`.

---

### 3. Tab Reordering (Drag-and-Drop)
**Goal:** Allow users to rearrange Gateway tabs.

#### Component Architecture
- **Component:** `src/lib/components/Gateway/GatewayTabs.svelte`
- **Logic:**
  - Use HTML5 DnD API on `.tab` elements.
  - `ondragstart`: Set data `application/x-gateway-id`.
  - `ondrop`: Read ID, calculate new index, call `store.reorderGateways`.
- **Persistence:**
  - **Option A:** Add `sort_order` column to `gateways` table (cleanest).
  - **Option B:** Store `gatewayOrder: string[]` in `settings` table (easiest migration).
  - *Decision:* Option B is less invasive for now, but Option A is better long-term. Let's go with Option A (requires migration).

#### Database Changes
- **Migration:** `ALTER TABLE gateways ADD COLUMN sort_order INTEGER DEFAULT 0;`

#### Store Updates
- `reorderGateways(ids: string[])`: Updates local state and saves new order to DB.

---

## Phase 3: Enhanced File Handling

### 4. PDF Thumbnail Preview
**Goal:** Generate visual thumbnails for uploaded PDFs.

#### Dependencies
- `pdfjs-dist`: Render PDF page to Canvas.

#### Component Architecture
- **Component:** `src/lib/components/FileUpload/PdfThumbnail.svelte`
- **Logic:**
  - Load PDF via `pdfjs-dist`.
  - Render Page 1 to an off-screen `<canvas>`.
  - Export as Data URL.
  - Display in `ChatInput` file preview list.

---

### 5. Download Management
**Goal:** Handle file downloads from agents.

#### Architecture
- **Component:** `src/lib/components/Chat/FileDownload.svelte`
- **Logic:**
  - Agent sends tool output with file content (base64) or URL.
  - **Base64:** Convert to Blob -> Object URL -> `<a>` download.
  - **URL:** Proxy through Rust backend if needed (CORS) or direct download.
  - **Tauri:** Use `@tauri-apps/plugin-dialog` to save file to disk.

---

## Phase 4: Document Forge & Change History

### 6. Word Editor (TipTap)
**Goal:** Rich text editing for `.docx` and `.md`.

#### Dependencies
- `@tiptap/core`, `@tiptap/starter-kit`.

#### Component Architecture
- **Component:** `src/lib/components/Forge/WordEditor.svelte`
- **Logic:**
  - Initialize editor with content from Rust backend (`doc_open`).
  - Sync changes to backend via `doc_stage_patch`.

### 7. PowerPoint Viewer
**Goal:** View `.pptx` slides.

#### Dependencies
- `pptxgenjs` (if generation needed).
- Custom viewer using HTML/SVG conversion.

### 8. Forge Agent-Chat Integration
**Goal:** Connect Chat Tool Calls to Forge.

#### Architecture
- **Client:** Intercept `tool_use` events in `client.ts`.
- **Store:** If tool is `edit_document`, trigger `store.forge.stagePatch`.
- **UI:** Show "Review Changes" button in Chat.

### 9. Change History UI
**Goal:** Visual timeline.

#### Component Architecture
- **Component:** `src/lib/components/Forge/HistoryTimeline.svelte`
- **Backend:** `SessionManager` tracks undo/redo stack. Expose this as a list.
