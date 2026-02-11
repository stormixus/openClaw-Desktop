# Technical Specification: Agent Document Modification System

## 1. Architecture Overview

Human-in-the-Loop (HITL) Review Pattern. Agents operate on in-memory Document Sessions producing Diff Previews for user approval.

```
User <-> Svelte Frontend <-> Tauri Commands <-> Rust Backend <-> File System
                                                    |
                                              Session Manager
                                              (In-Memory State)
                                              (Undo/Redo Stack)
```

### Module Boundaries
1. **Frontend (UI Layer)**: Visualize diffs, handle user approval, render previews
2. **Gateway (Protocol Layer)**: Intercept agent tool calls, route document operations
3. **Document Engine (Core Layer)**: File I/O, parsing, patching, session state

## 2. Rust Module Design

```
src-tauri/src/document/
├── mod.rs           # Module registration and high-level types
├── commands.rs      # Tauri commands (exposed to frontend)
├── error.rs         # Custom error types
├── manager.rs       # Session lifecycle & state management
├── patch.rs         # JSON Patch implementation & diff logic
├── formats/
│   ├── mod.rs
│   ├── excel.rs     # calamine (read) + rust_xlsxwriter (write)
│   ├── pdf.rs       # pdf-extract (read) + typst (gen)
│   └── text.rs      # Plain text/Markdown handling
└── types.rs         # Shared structs (DTOs)
```

### Key Types

```rust
#[derive(Serialize, Deserialize, Clone)]
pub enum DocumentType { Excel, Pdf, Text }

#[derive(Serialize, Deserialize)]
pub struct DocSessionId(pub String);

pub trait DocumentAdapter {
    fn read(&self, path: &Path) -> Result<serde_json::Value>;
    fn apply_patch(&mut self, patch: JsonPatch) -> Result<DiffSummary>;
    fn save(&self, path: &Path) -> Result<()>;
}
```

## 3. Tauri Commands

| Command | Parameters | Return | Description |
|---------|-----------|--------|-------------|
| `doc_open` | `path: String` | `DocState` | Open file, detect type, create session |
| `doc_read_view` | `id: String, opts: ViewOptions` | `ViewData` | Get data for UI (sheet/range) |
| `doc_stage_patch` | `id: String, patch: JsonPatch` | `PatchPreview` | Apply patch in memory, return diff |
| `doc_commit` | `id: String` | `()` | Write to disk |
| `doc_discard` | `id: String` | `()` | Discard unsaved changes |
| `doc_close` | `id: String` | `()` | Clean up session |
| `doc_undo` | `id: String` | `DocState` | Undo last patch |
| `doc_redo` | `id: String` | `DocState` | Redo undone patch |

## 4. Frontend Components

```
src/lib/components/Document/
├── DocPreview.svelte       # Container - switches Excel/PDF/Text
├── ExcelGrid.svelte        # Spreadsheet grid view
├── DiffViewer.svelte       # Before/After diff visualization
└── ApprovalModal.svelte    # Approve/Reject/Edit controls
```

Store: `src/lib/stores/document.svelte.ts`

## 5. Crate Dependencies

```toml
calamine = "0.24"          # Excel reading
rust_xlsxwriter = "0.68"   # Excel writing
serde_json = "1.0"
json-patch = "1.2"         # RFC 6902 patches
pdf-extract = "0.7"        # PDF text extraction
dashmap = "5.5"            # Concurrent session map
```

## 6. Agent Protocol (JSON Patch)

```json
{
  "operation": "batch_update",
  "file_id": "uuid-1234",
  "changes": [
    { "type": "excel_cell_update", "sheet": "Sheet1", "coordinate": "B2", "value": 500 },
    { "type": "excel_row_delete", "sheet": "Sheet1", "index": 5 },
    { "type": "pdf_annotation", "page": 1, "rect": [100,200,300,250], "text": "Note", "color": "yellow" }
  ]
}
```

## 7. Implementation Phases

### Phase 1: Foundations (Read-Only Excel)
1. Document module structure + error types
2. calamine integration for reading Excel → JSON
3. `doc_open` and `doc_read_view` commands
4. ExcelGrid component for viewing

### Phase 2: Patching (Write-Memory)
1. json-patch logic on JSON representation
2. SessionManager with undo/redo
3. `doc_stage_patch` command
4. DiffViewer UI + ApprovalModal

### Phase 3: Persistence & PDF
1. rust_xlsxwriter for JSON State → .xlsx
2. `doc_commit` command
3. pdf-extract for PDF text reading
4. DocPreview for PDF

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Large files (50MB+) | Memory spike, UI freeze | Pagination in doc_read_view, viewport-only to frontend |
| Excel formatting loss | User data corruption | "Save As New Version" default, warn about format loss |
| Concurrency | External edits conflict | Check mtime before commit, warn if changed |
| Agent hallucination | Invalid patches | Strict validation in patch.rs, clear error messages |
