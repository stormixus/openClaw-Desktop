# Agent Document Modification System - Specification

## Project Context

openClaw-Desktop is a Tauri (Rust + Svelte 5) desktop application.
- **Backend**: Rust with `rusqlite`, Tauri commands for system access
- **Frontend**: Svelte 5 with Runes ($state, $derived), WebSocket-based agent communication
- **Agent Protocol**: Protocol v3 via GatewayClient, supports tool_use events (display only, not execution)

## Current Architecture Gaps

1. Agent tool calls are displayed but NOT executed client-side
2. No file processing pipeline exists
3. No mechanism to send tool results back to server from client
4. File access is limited to specific tasks (backgrounds)

---

## Requirements Analysis

### Functional Requirements

#### 1.1 Document Ingestion & Parsing (Rust Backend)
- **Excel**: Parse `.xlsx`, `.xls`, `.csv` via `calamine`
  - Extract sheet names, cell values (string, number, bool, date), basic styling
  - Output: structured JSON for Agent context
- **PDF**: Parse `.pdf` via `pdfium-render`
  - Text extraction with bounding box coordinates
  - Optional layout analysis via `ocrs`
- **File Handling**: Drag & Drop support in ChatPanel.svelte
  - Files processed locally in Rust; contents NOT sent to cloud unless explicitly in prompt

#### 1.2 Agent Interaction (Frontend & Protocol)
- **Context Window**: Truncate large docs (first 50 rows / user-selected range)
- **Schema**: Convert tabular data to Markdown tables or compact CSV
- **Agent returns**: JSON Patch objects describing specific changes

#### 1.3 Modification & Write-Back (Rust Backend)
- **Excel**: `rust_xlsxwriter` - Update/Delete/Insert cells/rows/cols, Format cells
- **PDF Annotation**: `pdfium-render` annotations
- **PDF Report Gen**: `typst` for new summary PDFs
- **Preview**: Shadow copy in memory for Diff View before saving

### Non-functional Requirements
- 10MB Excel parsing < 2 seconds
- UI never freezes (async/threads)
- 100% offline parsing (only prompt text sent to LLM)
- Never overwrite originals without explicit confirmation

### Agent Protocol (JSON Schema)

```json
{
  "operation": "batch_update",
  "file_id": "uuid-1234",
  "changes": [
    {
      "type": "excel_cell_update",
      "sheet": "Sheet1",
      "coordinate": "B2",
      "value": "john.doe@example.com",
      "style": { "font_color": "#000000" }
    },
    {
      "type": "excel_row_delete",
      "sheet": "Sheet1",
      "index": 5
    },
    {
      "type": "pdf_annotation",
      "page": 1,
      "rect": [100, 200, 300, 250],
      "text": "This figure seems incorrect",
      "color": "yellow"
    }
  ]
}
```

### MVP vs Full Vision

| Feature | MVP (Phase 1) | Full Vision (Phase 2+) |
|---------|---------------|----------------------|
| Excel | Read/Write values. No styling. | Formulas, Charts, Pivot Tables |
| PDF | Text extraction + Summary (Read-only) | Annotations, Form Filling, Re-gen |
| Context | First 50 rows as Markdown | RAG over full document |
| UI | Basic Grid View | Interactive Spreadsheet in Chat |
| Logic | JSON Patch (direct values) | Code Interpreter |

### Key Data Flow

```
User drops file → Rust parses → JSON summary → Agent context
User gives instruction → Agent reasons → JSON Patch returned
JSON Patch → Diff View in Svelte → User approves → Rust applies → Save
```

### Security
- Sandbox: workspace directory restriction
- No direct overwrite of originals
- User approval for all modifications
