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

// ── Derived ────────────────────────────────────────────────────────
const hasLayout = $derived(docState !== null && Object.keys(docState.words).length > 0);

const selectedBlock = $derived.by(() => {
  if (!docState || !selectedBlockId) return null;
  return docState.blocks[selectedBlockId] ?? null;
});

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
      };
    }

    docState = {
      scaleBase: 1,
      pages: pageHeights.length,
      pageHeights: [...pageHeights],
      words,
      lines,
      blocks,
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
function getModifiedBlock(blockId: string): { text: string; dx: number; dy: number; deleted: boolean } | null {
  if (!docState) return null;
  const block = docState.blocks[blockId];
  if (!block) return null;

  let text = block.text;
  let dx = 0;
  let dy = 0;
  let deleted = false;

  for (const op of docState.ops) {
    if (op.t === "replaceText" && op.targetId === blockId) {
      text = op.text;
    } else if (op.t === "move" && op.targetId === blockId) {
      dx += op.dx;
      dy += op.dy;
    } else if (op.t === "delete" && op.targetId === blockId) {
      deleted = true;
    }
  }

  return { text, dx, dy, deleted };
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
  reset,
};
