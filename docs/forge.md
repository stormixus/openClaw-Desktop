# Forge — Document Editor

## Overview

Forge is the integrated document editing suite within openClaw Desktop. It supports multiple file formats with AI-assisted editing capabilities.

## Architecture

```
forge/+page.svelte (Main orchestrator)
├── Document Store (document.svelte.ts)
│   └── Rust Backend (document/commands.rs)
│       └── Format Parsers (formats/*.rs)
├── Editor Components
│   ├── WordEditor.svelte       # .docx (TipTap rich text)
│   ├── MarkdownEditor.svelte   # .md (TipTap + markdown roundtrip)
│   ├── JsonEditor.svelte       # .json (formatted view)
│   ├── PlainTextEditor.svelte  # .txt (textarea)
│   ├── PdfViewer.svelte        # .pdf (PDF.js + OCR)
│   └── PptxViewer.svelte       # .pptx (slide viewer)
├── ChatPanel.svelte            # AI assistant sidebar
└── ApprovalModal.svelte        # AI edit review
```

## Document Lifecycle

```
Open File
  → Tauri dialog (native file picker)
  → Rust: parse file → internal model (sheets/rows/cells)
  → Frontend: Document Store receives parsed data
  → Route to appropriate editor component

Edit
  → User modifies content in editor
  → onchange callback → handleTextChange()
  → Debounced sync (350ms) → setTextContent()
  → Document Store updates activeDocument

Save
  → flushTextSync() → commit pending changes
  → Tauri invoke: save_document
  → Rust: serialize to format → write file

Close
  → Flush pending changes
  → Reset state (PDF, forge context)
  → Close document in store
```

## Format Specifications

### Excel (.xlsx)

**Rust Parser**: `calamine` (read) + `rust_xlsxwriter` (write)

**Internal Model**:
```typescript
interface Sheet {
  name: string;
  rows: Cell[][];
  colWidths: number[];
  rowHeights: number[];
  mergedRanges: MergeRange[];
}

interface Cell {
  value: string | number | boolean | null;
  formula?: string;
  style?: CellStyle;
}

interface CellStyle {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  bgColor?: string;
  hAlign?: "left" | "center" | "right";
  vAlign?: "top" | "middle" | "bottom";
  wrapText?: boolean;
  borders?: BorderSet;
}
```

**UI**: Grid view with virtual scrolling for large sheets. Cell selection, inline editing, formula bar.

**Patch Operations**:
- `CellUpdate { sheet, row, col, value }`
- `CellFormulaUpdate { sheet, row, col, formula }`
- `RowInsert { sheet, at }` / `RowDelete { sheet, at }`
- `ColInsert { sheet, at }` / `ColDelete { sheet, at }`

### Word (.docx)

**Rust Parser**: `roxmltree` + `zip` (reads OOXML)

**Editor**: TipTap 3 (ProseMirror-based) with extensions:
- StarterKit (paragraphs, headings, lists, code blocks)
- Table extension
- Text styling (bold, italic, underline, strike, sub/superscript)
- Font family & size selection
- Text color & highlight
- Alignment (left, center, right, justify)

**Rich Editor Threshold**: Documents under `WORD_RICH_MAX_HTML` characters use the full TipTap editor. Larger documents fall back to plain text editing with a warning banner.

**Content Flow**:
```
.docx → Rust OOXML parser → HTML string → TipTap editor
TipTap editor → HTML string → Rust OOXML writer → .docx
```

### Markdown (.md)

**Editor**: TipTap 3 with Markdown roundtrip.

**Toolbar**: Bold, Italic, H1, H2, Bullet List, Ordered List, Quote, Code Block

**Roundtrip Pipeline**:
```
Markdown → marked.parse() → HTML → DOMPurify → TipTap
TipTap → editor.getHTML() → custom htmlToMarkdown() → Markdown
```

**Custom HTML-to-Markdown converter** handles:
- Headings (H1-H6) → `#` syntax
- Bold/italic → `**` / `*`
- Code blocks → fenced ``` blocks
- Blockquotes → `>` prefix
- Lists (ordered/unordered, nested)
- Links → `[text](url)`
- Inline code → backticks

**Known Limitation**: Markdown↔HTML roundtrip can be lossy. The editor uses `lastEmittedMd` tracking to prevent infinite reactive loops when content normalizes differently.

**Important**: TipTap Editor is wrapped in `$state.raw(null)` (not `$state`) to prevent Svelte 5's deep proxy from tracking internal Editor mutations, which would cause `effect_update_depth_exceeded` errors.

### PDF (.pdf)

**Viewer**: PDF.js (`pdfjs-dist`)

**Features**:
- Page rendering to canvas
- Sidebar with page thumbnails
- Zoom in/out
- Text layer for selection

**OCR Integration** (Tesseract.js):
- Language presets: English, Korean+English, Japanese+English
- Custom tessdata path configuration
- Auto-detection of embedded text quality
- Layout analysis for structured extraction
- OCR text overlay with highlight controls

**Annotation Tools**:
- Select mode (default)
- Highlight mode (color selection)
- Comment mode
- Insert text mode

**PDF Export**: Rust-based PDF generation from document content.

### PowerPoint (.pptx)

**Rust Parser**: `roxmltree` + `zip` (reads OOXML slide XML)

**UI**:
- Slide viewer with navigation (prev/next)
- Thumbnail sidebar with slide count
- Editable content areas
- Agent editing support

**Model**:
```typescript
interface Slide {
  title: string;
  content: string;
  notes?: string;
}
```

### Korean HWP (.hwp / .hwpx)

**Rust Parser**: `cfb` (OLE compound binary) for .hwp, `roxmltree` + `zip` for .hwpx

**Support Level**: Read + basic editing. Complex formatting may be simplified.

**Save Limitation**: Toolbar shows "Save not supported for HWP" indicator.

### JSON (.json)

**Editor**: Formatted text view with:
- Syntax validation (valid/invalid indicator)
- Format (pretty-print) button
- Minify button
- Plain text editing

### Plain Text (.txt)

**Editor**: Simple textarea with monospace font. Supports inline AI prompt for text rewriting.

## AI Integration

### Inline Rewrite
1. User selects text in editor
2. Keyboard shortcut or button triggers inline prompt
3. User enters instruction (e.g., "make this more formal")
4. Request sent to gateway AI
5. Response replaces selected text (with undo support)

### Document Tool Calls
Gateway AI agents can use special tools:
- `write_document`: Replace full document content
- `edit_document`: Apply targeted patches

### Approval Flow
```
AI proposes edit → PatchPreview generated → ApprovalModal shown
  → User accepts → Patch applied to document
  → User rejects → Patch discarded
```

### Change History
- Every AI edit creates a history entry
- Author tracking (You / Assistant)
- Restore to any previous version
- Formatting update detection

## File Operations

### Open
```
Toolbar "Open" button
  → Native file dialog (filtered by supported types)
  → Tauri invoke: open_document(path)
  → Rust: detect format → parse → return JSON model
  → Frontend: create document in store → render editor
```

**Supported Filters**:
- All supported files
- Documents (.docx, .hwp, .hwpx)
- Spreadsheets (.xlsx)
- Presentations (.pptx)
- Text (.txt, .md, .json)

### Save
```
Toolbar "Save" button (or Cmd+S)
  → Flush pending text changes
  → Tauri invoke: save_document(id)
  → Rust: serialize active format → overwrite file
```

### Export PDF
Available for all text-based documents. Generates PDF via Rust backend.

### New Document
Quick-create options:
- New Text Document (.txt)
- New Markdown Document (.md)
- New Word Document (.docx)
- New Spreadsheet (.xlsx)

## Drag & Drop

Files can be dragged onto the Forge workspace:
- Supported formats open in the editor
- Unsupported formats show error toast
- Visual drop indicator with file type detection
