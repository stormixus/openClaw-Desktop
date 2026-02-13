import { invoke } from "@tauri-apps/api/core";
import type {
  BBox,
  PdfWord,
  PdfLine,
  PdfBlock,
  PdfDocState,
  PdfLayoutResultRaw,
  Op,
} from "$lib/types/pdfEditor";

// ── State ──────────────────────────────────────────────────────────
let docState = $state<PdfDocState | null>(null);
let selectedBlockId = $state<string | null>(null);
let activeOp = $state<Op["t"] | null>(null);
let isAnalyzing = $state(false);
let undoneOps = $state<Op[]>([]);

// Detection calibration:
// OCR/pdf.js block boxes and font sizes tend to be slightly conservative.
// Apply a small global boost so defaults feel closer to source visual size.
const DETECT_BOX_PAD_RATIO = 0.10;
const DETECT_BOX_MIN_PAD_X = 2.0;
const DETECT_BOX_MIN_PAD_Y = 1.6;
const DETECT_FONT_SCALE = 1.10;

// ── Derived ────────────────────────────────────────────────────────
const hasLayout = $derived(docState !== null && Object.keys(docState.words).length > 0);

const selectedBlock = $derived.by(() => {
  if (!docState || !selectedBlockId) return null;
  return docState.blocks[selectedBlockId] ?? null;
});

function boostedBlock(block: PdfBlock): PdfBlock {
  const padX = Math.max(DETECT_BOX_MIN_PAD_X, block.bbox.w * DETECT_BOX_PAD_RATIO);
  const padY = Math.max(DETECT_BOX_MIN_PAD_Y, block.bbox.h * DETECT_BOX_PAD_RATIO);
  return {
    ...block,
    bbox: {
      x: Math.max(0, block.bbox.x - padX),
      y: Math.max(0, block.bbox.y - padY),
      w: block.bbox.w + padX * 2,
      h: block.bbox.h + padY * 2,
    },
    fontSize: Math.max(6, block.fontSize * DETECT_FONT_SCALE),
  };
}

function boostBlocks(blocks: Record<string, PdfBlock>): Record<string, PdfBlock> {
  const adjusted: Record<string, PdfBlock> = {};
  for (const [id, block] of Object.entries(blocks)) {
    adjusted[id] = boostedBlock(block);
  }
  return adjusted;
}

// ── Actions ────────────────────────────────────────────────────────

/** Invoke Rust OCR layout command and populate docState.
 *  pageImages: base64-encoded PNG images of each page rendered at 300 DPI */
async function analyzePages(
  sessionId: string,
  pageHeights: number[],
  pageImages: string[],
  lang?: string,
  tessdataDir?: string,
): Promise<void> {
  isAnalyzing = true;
  try {
    const raw = await invoke<PdfLayoutResultRaw>("doc_pdf_ocr_layout", {
      id: sessionId,
      lang: lang ?? null,
      tessdataDir: tessdataDir?.trim() || null,
      pageHeights,
      pageImages,
    });

    // Build lookup maps
    const words: Record<string, PdfWord> = {};
    for (const w of raw.words) {
      words[w.id] = { id: w.id, page: w.page, text: w.text, bbox: w.bbox, conf: w.conf };
    }

    const lines: Record<string, PdfLine> = {};
    for (const l of raw.lines) {
      lines[l.id] = {
        id: l.id,
        page: l.page,
        wordIds: l.word_ids,
        bbox: l.bbox,
        text: l.text,
        fontSize: l.font_size,
      };
    }

    const blocks: Record<string, PdfBlock> = {};
    for (const b of raw.blocks) {
      blocks[b.id] = {
        id: b.id,
        page: b.page,
        kind: b.kind,
        lineIds: b.line_ids,
        bbox: b.bbox,
        text: b.text,
        fontSize: b.font_size,
      };
    }

    docState = {
      scaleBase: 1,
      pages: pageHeights.length,
      pageHeights: [...pageHeights],
      words,
      lines,
      blocks: boostBlocks(blocks),
      ops: [],
    };
    undoneOps = [];
  } finally {
    isAnalyzing = false;
  }
}

/** Push a new operation onto the ops stack */
function pushOp(op: Op): void {
  if (!docState) return;
  docState.ops = [...docState.ops, op];
  undoneOps = [];
}

/** Undo the last operation */
function undoOp(): void {
  if (!docState || docState.ops.length === 0) return;
  const last = docState.ops[docState.ops.length - 1];
  docState.ops = docState.ops.slice(0, -1);
  undoneOps = [...undoneOps, last];
}

/** Redo a previously undone operation */
function redoOp(): void {
  if (!docState || undoneOps.length === 0) return;
  const last = undoneOps[undoneOps.length - 1];
  undoneOps = undoneOps.slice(0, -1);
  docState.ops = [...docState.ops, last];
}

/** Select a block by ID */
function selectBlock(blockId: string | null): void {
  selectedBlockId = blockId;
}

/** Set the active operation type */
function setActiveOp(opType: Op["t"] | null): void {
  activeOp = opType;
}

/** Compute effective block state after applying ops */
function getModifiedBlock(
  blockId: string
): { text: string; fontSize: number; dx: number; dy: number; dw: number; dh: number; deleted: boolean } | null {
  if (!docState) return null;
  const block = docState.blocks[blockId];
  if (!block) return null;

  let text = block.text;
  let fontSize = block.fontSize;
  let dx = 0;
  let dy = 0;
  let dw = 0;
  let dh = 0;
  let deleted = false;

  for (const op of docState.ops) {
    if (op.t === "replaceText" && op.targetId === blockId) {
      text = op.text;
      if (typeof op.fontSize === "number" && Number.isFinite(op.fontSize)) {
        fontSize = op.fontSize;
      }
    } else if (op.t === "move" && op.targetId === blockId) {
      dx += op.dx;
      dy += op.dy;
    } else if (op.t === "resize" && op.targetId === blockId) {
      dw += op.dw;
      dh += op.dh;
    } else if (op.t === "delete" && op.targetId === blockId) {
      deleted = true;
    }
  }

  return { text, fontSize, dx, dy, dw, dh, deleted };
}

/** Get all inserted text ops for a page */
function getInsertedTexts(page: number): Array<Op & { t: "insertText" }> {
  if (!docState) return [];
  return docState.ops.filter(
    (op): op is Op & { t: "insertText" } => op.t === "insertText" && op.page === page
  );
}

/** Get all highlight ops for a page */
function getHighlights(page: number): Array<Op & { t: "highlight" }> {
  if (!docState) return [];
  return docState.ops.filter(
    (op): op is Op & { t: "highlight" } => op.t === "highlight" && op.page === page
  );
}

/** Get all comment ops for a page */
function getComments(page: number): Array<Op & { t: "comment" }> {
  if (!docState) return [];
  return docState.ops.filter(
    (op): op is Op & { t: "comment" } => op.t === "comment" && op.page === page
  );
}

/** Export the complete document state */
function exportState(): PdfDocState | null {
  return docState ? { ...docState } : null;
}

/** Initialize an empty docState (no OCR data) so annotation ops can be stored */
function initEmpty(pages: number, heights?: number[]): void {
  if (docState) return;
  docState = {
    scaleBase: 1,
    pages,
    pageHeights: heights ?? Array(pages).fill(792),
    words: {},
    lines: {},
    blocks: {},
    ops: [],
  };
  undoneOps = [];
}

/** Sample background colors from rendered canvases for each block */
function sampleBlockBgColors(canvases: HTMLCanvasElement[]): void {
  if (!docState) return;

  for (const block of Object.values(docState.blocks)) {
    const pageIdx = block.page - 1;
    const canvas = canvases[pageIdx];
    if (!canvas) continue;

    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    const bbox = block.bbox;
    // Sample edge pixels of the block bbox to find dominant background color
    const colorCounts: Record<string, number> = {};
    const samplePoints: Array<[number, number]> = [];

    // Sample along 4 edges (top, bottom, left, right) - 5 points per edge
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      // Top edge
      samplePoints.push([bbox.x + bbox.w * t, bbox.y]);
      // Bottom edge
      samplePoints.push([bbox.x + bbox.w * t, bbox.y + bbox.h]);
      // Left edge
      samplePoints.push([bbox.x, bbox.y + bbox.h * t]);
      // Right edge
      samplePoints.push([bbox.x + bbox.w, bbox.y + bbox.h * t]);
    }

    for (const [sx, sy] of samplePoints) {
      const px = Math.round(sx);
      const py = Math.round(sy);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;

      const pixel = ctx.getImageData(px, py, 1, 1).data;
      // Quantize to reduce noise (round to nearest 8)
      const r = (pixel[0] & 0xf8).toString(16).padStart(2, "0");
      const g = (pixel[1] & 0xf8).toString(16).padStart(2, "0");
      const b = (pixel[2] & 0xf8).toString(16).padStart(2, "0");
      const hex = `#${r}${g}${b}`;
      colorCounts[hex] = (colorCounts[hex] ?? 0) + 1;
    }

    // Find the most frequent color
    let maxCount = 0;
    let dominant = "#ffffff";
    for (const [color, count] of Object.entries(colorCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = color;
      }
    }

    block.bgColor = dominant;
  }
}

/** Set font name on a block (called from PdfViewer after pdf.js font detection) */
function setBlockFontName(blockId: string, fontName: string): void {
  if (!docState) return;
  const block = docState.blocks[blockId];
  if (block) block.fontName = fontName;
}

/** Load pre-built layout data (e.g. from pdf.js text content) directly into the store */
function loadLayout(data: {
  pages: number;
  pageHeights: number[];
  words: Record<string, PdfWord>;
  lines: Record<string, PdfLine>;
  blocks: Record<string, PdfBlock>;
}): void {
  docState = {
    scaleBase: 1,
    pages: data.pages,
    pageHeights: data.pageHeights,
    words: data.words,
    lines: data.lines,
    blocks: boostBlocks(data.blocks),
    ops: [],
  };
  undoneOps = [];
}

/** Reset the store */
function reset(): void {
  docState = null;
  selectedBlockId = null;
  activeOp = null;
  isAnalyzing = false;
  undoneOps = [];
}

// ── Export ──────────────────────────────────────────────────────────
export const pdfEditorStore = {
  get docState() { return docState; },
  get selectedBlockId() { return selectedBlockId; },
  get selectedBlock() { return selectedBlock; },
  get activeOp() { return activeOp; },
  get isAnalyzing() { return isAnalyzing; },
  get hasLayout() { return hasLayout; },
  get canUndo() { return (docState?.ops.length ?? 0) > 0; },
  get canRedo() { return undoneOps.length > 0; },

  analyzePages,
  initEmpty,
  pushOp,
  undoOp,
  redoOp,
  selectBlock,
  setActiveOp,
  getModifiedBlock,
  getInsertedTexts,
  getHighlights,
  getComments,
  exportState,
  loadLayout,
  sampleBlockBgColors,
  setBlockFontName,
  reset,
};
