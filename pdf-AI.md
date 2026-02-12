# OpenClaw Desktop: AI PDF Editor Extended Architecture Spec

- Version: `0.9` (Expanded Engineering Spec)
- Target Stack: `Tauri + Rust + Svelte + PDF.js + OCR + Local AI`
- Primary Goal: Transform static PDFs into an AI-editable virtual document system using overlay modeling rather than destructive editing.

---

## 0. Philosophy

Do **not** edit PDF internals directly.

- PDF = Immutable background
- Document model = Truth
- Overlay rendering = UI
- Ops log = Editing state

The system behaves like a hybrid of:

- Acrobat AI
- Notion Editor
- Figma overlay model
- Word-style editing illusion

---

## 1. High-Level Architecture

```text
+--------------------------------------------------------------+
|                       Svelte Frontend                        |
|                    PdfViewport / Page Layers                 |
+----------------------------+---------------------------------+
                             |
                             v
+--------------------------------------------------------------+
|                   Document Store (JS/Svelte)                |
|            DocState(words, lines, blocks, ops, cache)       |
+----------------------------+---------------------------------+
                             |
                             v
+--------------------------------------------------------------+
|                      Tauri Rust Backend                      |
|                  OCR / Layout / Export Services              |
+--------------------------------------------------------------+
```

---

## 2. Rendering Layers

### 2.1 Background Layer

PDF rendered via `pdfjs-dist`.

Each page:

```html
<canvas class="pdf-page-canvas" />
```

Never mutate this layer.

### 2.2 TextSelectLayer (Invisible Selection Engine)

Purpose:

- Enable drag-select
- Enable copy/paste
- Provide caret anchors

Rules:

- Render **line spans**, not word spans
- Text is transparent but selectable

CSS:

```css
position: absolute;
color: transparent;
user-select: text;
white-space: pre;
pointer-events: auto;
```

### 2.3 EditLayer

Contains:

- Block bounding boxes
- Drag handles
- Active selection highlight
- AI rewrite anchors

This layer reads `DocState + Ops`.

### 2.4 AnnotLayer

Visual overlays only:

- Highlight rects
- Comment pins
- Drawings

---

## 3. Document Pipeline

### Step 1: Load PDF

Use:

```ts
pdfjsLib.getDocument()
```

Per page:

- `viewport = page.getViewport({ scale })`
- Render canvas
- Attempt `page.getTextContent()`
- If text exists, skip OCR

### Step 2: OCR (Fallback Only)

Rust command:

```rust
ocr_page(pdfHash, pageNo, imageBytes)
```

Preferred output:

- TSV (bbox-based)

Recommended params:

```bash
--psm 6
```

Return structure:

- `Word[]`

### Step 3: Layout Engine

Goal: transform noisy words into semantic units.

Hierarchy:

`Word -> Line -> Paragraph -> Block`

#### Line Grouping Algorithm

Sort words:

- by `y ASC`, then `x ASC`

Cluster words into lines if:

- `verticalOverlapRatio > 0.5`
- OR `abs(wordY - baselineY) < 0.5 * medianWordHeight`

Baseline estimation:

- `baselineY = average(word.bottom)`

#### Paragraph Grouping

Group lines when:

- line spacing variance is small
- and indentation is similar

#### Block Detection

Heuristics:

- Title: `bbox.h > medianLineHeight * 1.3`
- Header/Footer: near page edges and repeated across pages
- Table: aligned x-clusters repeating vertically

---

## 4. Coordinate System

All model coordinates are stored in:

- viewport pixel space at `scaleBase = 1.0`

Render transform:

```ts
scaleFactor = currentScale / scaleBase
```

Apply to:

- `x, y, w, h`

---

## 5. Data Model (Extended)

### BBox

```ts
type BBox = {
  x: number
  y: number
  w: number
  h: number
}
```

### Word

```ts
type Word = {
  id: string
  page: number
  text: string
  bbox: BBox
  conf: number
  source: "pdf-text" | "ocr"
  lineId?: string
  blockId?: string
}
```

### Line

```ts
type Line = {
  id: string
  page: number
  wordIds: string[]
  bbox: BBox
  text: string
  baselineY?: number
}
```

### Block

Editing unit:

```ts
type Block = {
  id: string
  page: number
  kind: "paragraph" | "title" | "table" | "header" | "footer" | "unknown"
  lineIds: string[]
  bbox: BBox
  text: string
  source: "pdf-text" | "ocr"
}
```

### Operation Log

```ts
type Op =
  | { t: "move"; targetId: string; dx: number; dy: number }
  | { t: "replaceText"; targetId: string; text: string }
  | { t: "delete"; targetId: string }
  | { t: "insertText"; page: number; at: { x: number; y: number }; text: string }
  | { t: "highlight"; page: number; rects: BBox[] }
  | { t: "comment"; page: number; at: { x: number; y: number }; text: string }
```

### DocState

```ts
type DocState = {
  pdfHash: string
  scaleBase: number
  pages: number
  words: Record<string, Word>
  lines: Record<string, Line>
  blocks: Record<string, Block>
  ops: Op[]
}
```

---

## 6. Svelte Component Structure

```text
/components
  PdfViewport.svelte
  PageLayer.svelte
  TextSelectLayer.svelte
  EditLayer.svelte
  AnnotLayer.svelte

/stores
  docStore.ts
```

### TextSelectLayer Rendering Logic

Render lines:

```svelte
{#each visibleLines as line}
  <span
    style="
      position:absolute;
      left:{line.bbox.x}px;
      top:{line.bbox.y}px;
      color:transparent;
      user-select:text;
    "
  >
    {line.text}
  </span>
{/each}
```

### EditLayer Logic

- On click: `selectBlock(blockId)`
- On drag: `pushOp({ t: "move" })`
- On AI rewrite: `pushOp({ t: "replaceText" })`

---

## 7. Rust Backend Structure

```text
src/
  commands/
    ocr.rs
    layout.rs
    export.rs
  models/
    word.rs
    block.rs
  cache/
    sqlite.rs
```

### OCR Command Signature

```rust
fn ocr_page(
  pdf_hash: String,
  page_no: u32,
  image: Vec<u8>
) -> Vec<Word>
```

### Layout Command

```rust
fn layout_page(words: Vec<Word>) -> (Vec<Line>, Vec<Block>)
```

### Export Command

```rust
fn export_pdf(
  pdf_path: String,
  doc_state: DocState
) -> String
```

---

## 8. AI Integration

Input:

- `selectedBlock.text`
- `contextBlocks` (optional)
- `instruction` (prompt)

Expected AI output:

```json
{
  "newText": "string"
}
```

Apply:

- `Op.replaceText`

MVP rule:

- Original text layer stays untouched
- New text is drawn on top

---

## 9. Export Engine (Overlay Mode)

Process:

For each page:

1. Draw original page
2. Apply ops sequentially

Rules:

- `replaceText`:
  - draw white rect over old bbox
  - draw new text at `bbox.x, bbox.y`
- `highlight`:
  - draw semi-transparent rect
- `comment`:
  - draw icon + text bubble

---

## 10. SQLite Schema

```sql
documents(id TEXT PRIMARY KEY, pdfHash TEXT, path TEXT);
pages(documentId TEXT, pageNo INT, hasTextLayer INT);
models(documentId TEXT, pageNo INT, json TEXT);
ops(documentId TEXT, json TEXT);
```

---

## 11. Performance Rules

- OCR only pages without text layer
- Lazy-load pages in viewport
- Cache layout results by:
  - `pdfHash + page + ocrVersion`
- Store DocState incrementally

---

## 12. MVP Implementation Order

1. PDF rendering
2. Text layer extraction
3. OCR fallback
4. Line span overlay
5. Block selection + drag ops
6. AI replaceText
7. Highlight/comment
8. Export overlay PDF

---

## 13. Known Pitfalls

- Word-level spans feel broken -> use line spans
- Tesseract spacing errors -> normalize via line model
- PDF coordinate origin mismatch -> unify in viewport px
- Avoid editing PDF streams directly

---

## 14. Definition of Done

User can:

- Open scanned PDF
- Drag-select text
- Copy text successfully
- Move a block visually
- AI rewrite a block
- Export new PDF with overlays preserved
