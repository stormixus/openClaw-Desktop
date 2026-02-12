<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import * as pdfjs from "pdfjs-dist";
  import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
  import {
    Loader2,
    AlertCircle,
    ZoomIn,
    ZoomOut,
    ScanText,
    RefreshCw,
    SlidersHorizontal,
    PanelRightClose,
    PanelRightOpen,
    MousePointer,
    Highlighter,
    MessageSquareText,
    Type,
    Sparkles,
    Undo,
    Redo,
  } from "@lucide/svelte";
  import { pdfEditorStore } from "$lib/stores/pdfEditor.svelte";
  import type { PdfBlock } from "$lib/types/pdfEditor";

  interface Props {
    sessionId: string;
    onBlockSelect?: (block: PdfBlock | null) => void;
    onAiRewrite?: (blockId: string, text: string) => void;
  }

  const { sessionId, onBlockSelect, onAiRewrite }: Props = $props();

  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

  // ── Core PDF state ─────────────────────────────────────────────
  let pagesContainer = $state<HTMLDivElement | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let zoom = $state(1.1);
  let pageCount = $state(0);
  let renderToken = 0;
  let pdfDoc: any = null;
  let pageViewports: Array<{ width: number; height: number }> = [];

  // ── OCR settings ───────────────────────────────────────────────
  let ocrLang = $state("kor+eng");
  let tessdataDir = $state("");
  let ocrResult = $state("");
  let ocrError = $state<string | null>(null);
  let ocrRunning = $state(false);
  let showOcrPanel = $state(false);
  let showOcrSettings = $state(false);

  // ── Editor mode ────────────────────────────────────────────────
  type EditorMode = "view" | "select" | "highlight" | "comment" | "insertText";
  let editorMode = $state<EditorMode>("view");
  let editingBlockId = $state<string | null>(null);
  let dragState: { blockId: string; startX: number; startY: number } | null = null;
  let highlightColor = $state("rgba(255, 235, 59, 0.35)");

  const TESSERACT_DPI = 300;
  const store = pdfEditorStore;
  const hasLayout = $derived(store.hasLayout);

  function formatError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  /** Scale factor: maps OCR pixel coords to displayed CSS pixels.
   *  When no OCR data exists, annotations use viewport coords directly (scale=1). */
  function tessScale(): number {
    return hasLayout ? zoom * 72 / TESSERACT_DPI : 1;
  }

  // ── PDF Loading ────────────────────────────────────────────────
  async function loadPdf(): Promise<void> {
    isLoading = true;
    error = null;
    ocrError = null;
    ocrResult = "";
    renderToken += 1;
    store.reset();
    editorMode = "view";

    try {
      const bytes = await invoke<number[]>("doc_get_pdf_bytes", { id: sessionId });
      const uint8 = new Uint8Array(bytes);
      const loadingTask = pdfjs.getDocument({ data: uint8 });
      pdfDoc = await loadingTask.promise;
      pageCount = pdfDoc.numPages ?? 0;

      pageViewports = [];
      for (let i = 1; i <= pageCount; i++) {
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        pageViewports.push({ width: vp.width, height: vp.height });
      }

      await renderPages();
    } catch (err) {
      error = formatError(err);
      isLoading = false;
      pageCount = 0;
      pagesContainer?.replaceChildren();
    }
  }

  async function renderPages(): Promise<void> {
    if (!pdfDoc || !pagesContainer) return;
    const token = ++renderToken;
    isLoading = true;
    error = null;
    pagesContainer.replaceChildren();

    try {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (token !== renderToken) return;
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: zoom });

        const pageWrap = document.createElement("div");
        pageWrap.className = "pdf-page";
        pageWrap.style.position = "relative";
        pageWrap.style.width = `${Math.ceil(viewport.width)}px`;
        pageWrap.style.height = `${Math.ceil(viewport.height)}px`;
        pageWrap.dataset.page = String(pageNumber);

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-bg-layer";
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.display = "block";
        pageWrap.appendChild(canvas);

        const textLayer = document.createElement("div");
        textLayer.className = "text-select-layer";
        pageWrap.appendChild(textLayer);

        const editLayer = document.createElement("div");
        editLayer.className = "edit-layer";
        pageWrap.appendChild(editLayer);

        const annotLayer = document.createElement("div");
        annotLayer.className = "annot-layer";
        pageWrap.appendChild(annotLayer);

        pagesContainer.appendChild(pageWrap);

        const context = canvas.getContext("2d");
        if (!context) continue;

        await page.render({ canvas, canvasContext: context, viewport }).promise;
      }
    } catch (err) {
      if (token === renderToken) error = formatError(err);
    } finally {
      if (token === renderToken) isLoading = false;
    }
  }

  // ── Overlay Rendering (reactive via $effect) ───────────────────
  $effect(() => {
    const ds = store.docState;
    const _ops = ds?.ops;
    const _sel = store.selectedBlockId;

    if (!ds || !pagesContainer || pagesContainer.children.length === 0) return;
    doRenderOverlays();
  });

  function doRenderOverlays(): void {
    if (!pagesContainer || !store.docState) return;
    const scale = tessScale();

    const pageWraps = pagesContainer.querySelectorAll<HTMLDivElement>(".pdf-page");
    pageWraps.forEach((wrap) => {
      const pageNum = parseInt(wrap.dataset.page ?? "0");
      if (!pageNum) return;

      const textLayer = wrap.querySelector<HTMLDivElement>(".text-select-layer");
      const editLayer = wrap.querySelector<HTMLDivElement>(".edit-layer");
      const annotLayer = wrap.querySelector<HTMLDivElement>(".annot-layer");

      if (textLayer) renderTextLayer(textLayer, pageNum, scale);
      if (editLayer) renderEditLayer(editLayer, pageNum, scale);
      if (annotLayer) renderAnnotLayer(annotLayer, pageNum, scale);
    });
  }

  function renderTextLayer(layer: HTMLDivElement, pageNum: number, scale: number): void {
    layer.replaceChildren();
    const ds = store.docState;
    if (!ds) return;

    for (const line of Object.values(ds.lines)) {
      if (line.page !== pageNum) continue;
      const span = document.createElement("span");
      span.className = "text-line";
      span.textContent = line.text;
      span.style.left = `${line.bbox.x * scale}px`;
      span.style.top = `${line.bbox.y * scale}px`;
      span.style.width = `${line.bbox.w * scale}px`;
      span.style.height = `${line.bbox.h * scale}px`;
      span.style.fontSize = `${line.bbox.h * scale * 0.85}px`;
      layer.appendChild(span);
    }
  }

  function renderEditLayer(layer: HTMLDivElement, pageNum: number, scale: number): void {
    layer.replaceChildren();
    const ds = store.docState;
    if (!ds) return;

    for (const block of Object.values(ds.blocks)) {
      if (block.page !== pageNum) continue;
      const mod = store.getModifiedBlock(block.id);
      if (!mod || mod.deleted) continue;

      const div = document.createElement("div");
      div.className = "block-overlay";
      div.dataset.blockId = block.id;

      div.style.left = `${(block.bbox.x * scale) + mod.dx}px`;
      div.style.top = `${(block.bbox.y * scale) + mod.dy}px`;
      div.style.width = `${block.bbox.w * scale}px`;
      div.style.height = `${block.bbox.h * scale}px`;

      if (store.selectedBlockId === block.id) div.classList.add("selected");
      if (mod.text !== block.text) {
        div.classList.add("modified");
        const overlay = document.createElement("div");
        overlay.className = "block-text-overlay";
        overlay.textContent = mod.text;
        overlay.style.fontSize = `${(block.bbox.h * scale * 0.85) / Math.max(1, block.lineIds.length)}px`;
        div.appendChild(overlay);
      }

      div.addEventListener("click", (e) => onBlockClick(e, block.id));
      div.addEventListener("dblclick", (e) => onBlockDblClick(e, block.id));
      div.addEventListener("mousedown", (e) => onBlockMouseDown(e, block.id));
      layer.appendChild(div);
    }

    // Inserted text boxes
    for (const op of store.getInsertedTexts(pageNum)) {
      const div = document.createElement("div");
      div.className = "inserted-text-overlay";
      div.textContent = op.text;
      div.style.left = `${op.at.x * scale}px`;
      div.style.top = `${op.at.y * scale}px`;
      div.style.fontSize = `${(op.fontSize ?? 14) * scale}px`;
      layer.appendChild(div);
    }

    // Selected block toolbar
    if (store.selectedBlockId && editingBlockId !== store.selectedBlockId) {
      const block = ds.blocks[store.selectedBlockId];
      if (block && block.page === pageNum) {
        const mod = store.getModifiedBlock(block.id);
        if (mod && !mod.deleted) {
          const tb = document.createElement("div");
          tb.className = "block-toolbar";
          tb.style.left = `${(block.bbox.x * scale) + mod.dx}px`;
          tb.style.top = `${(block.bbox.y * scale) + mod.dy - 32}px`;

          for (const [label, fn] of [
            ["Edit", () => onBlockDblClick(null, block.id)],
            ["Delete", () => onBlockDelete(block.id)],
            ["AI Rewrite", () => handleAiRewriteClick(block.id)],
          ] as [string, () => void][]) {
            const btn = document.createElement("button");
            btn.className = "block-tool-btn";
            btn.textContent = label;
            btn.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
            tb.appendChild(btn);
          }
          layer.appendChild(tb);
        }
      }
    }
  }

  function renderAnnotLayer(layer: HTMLDivElement, pageNum: number, scale: number): void {
    layer.replaceChildren();

    for (const hl of store.getHighlights(pageNum)) {
      for (const rect of hl.rects) {
        const div = document.createElement("div");
        div.className = "highlight-rect";
        div.style.left = `${rect.x * scale}px`;
        div.style.top = `${rect.y * scale}px`;
        div.style.width = `${rect.w * scale}px`;
        div.style.height = `${rect.h * scale}px`;
        div.style.background = hl.color ?? "rgba(255, 235, 59, 0.35)";
        layer.appendChild(div);
      }
    }

    for (const cm of store.getComments(pageNum)) {
      const pin = document.createElement("div");
      pin.className = "comment-pin";
      pin.style.left = `${cm.at.x * scale}px`;
      pin.style.top = `${cm.at.y * scale}px`;
      pin.title = cm.text;
      const bubble = document.createElement("div");
      bubble.className = "comment-bubble";
      bubble.textContent = cm.text;
      pin.appendChild(bubble);
      layer.appendChild(pin);
    }
  }

  // ── Block Interactions ─────────────────────────────────────────
  function onBlockClick(e: MouseEvent | null, blockId: string): void {
    if (editorMode !== "select" && editorMode !== "view") return;
    e?.stopPropagation();
    store.selectBlock(blockId);
    onBlockSelect?.(store.selectedBlock);
  }

  function onBlockDblClick(e: MouseEvent | null, blockId: string): void {
    e?.stopPropagation();
    e?.preventDefault();
    const mod = store.getModifiedBlock(blockId);
    if (!mod) return;

    editingBlockId = blockId;

    const el = pagesContainer?.querySelector<HTMLDivElement>(`[data-block-id="${blockId}"]`);
    if (!el) return;

    el.classList.add("editing");
    el.innerHTML = "";

    const ta = document.createElement("textarea");
    ta.className = "block-edit-textarea";
    ta.value = mod.text;
    ta.style.width = "100%";
    ta.style.height = "100%";
    el.appendChild(ta);
    ta.focus();

    ta.addEventListener("blur", () => {
      const newText = ta.value;
      if (newText !== store.docState?.blocks[blockId]?.text) {
        store.pushOp({ t: "replaceText", targetId: blockId, text: newText });
      }
      editingBlockId = null;
    });

    ta.addEventListener("keydown", (ke) => {
      if (ke.key === "Escape") {
        editingBlockId = null;
        doRenderOverlays();
      }
    });
  }

  function onBlockMouseDown(e: MouseEvent, blockId: string): void {
    if (editorMode !== "select" || editingBlockId) return;
    e.stopPropagation();

    dragState = { blockId, startX: e.clientX, startY: e.clientY };

    const onMove = (me: MouseEvent) => {
      if (!dragState) return;
      const dx = me.clientX - dragState.startX;
      const dy = me.clientY - dragState.startY;
      const el = pagesContainer?.querySelector<HTMLDivElement>(`[data-block-id="${blockId}"]`);
      if (el) el.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const onUp = (me: MouseEvent) => {
      if (dragState) {
        const dx = me.clientX - dragState.startX;
        const dy = me.clientY - dragState.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          store.pushOp({ t: "move", targetId: blockId, dx, dy });
        }
        dragState = null;
      }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onBlockDelete(blockId: string): void {
    store.pushOp({ t: "delete", targetId: blockId });
    store.selectBlock(null);
    onBlockSelect?.(null);
  }

  function handleAiRewriteClick(blockId: string): void {
    const mod = store.getModifiedBlock(blockId);
    if (!mod) return;
    onAiRewrite?.(blockId, mod.text);
  }

  // ── Canvas area interactions ───────────────────────────────────
  function handleCanvasAreaClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest(".block-overlay") && !target.closest(".block-toolbar")) {
      store.selectBlock(null);
      onBlockSelect?.(null);
    }
  }

  function handleCanvasAreaMouseDown(e: MouseEvent): void {
    const pageWrap = (e.target as HTMLElement).closest<HTMLDivElement>(".pdf-page");
    if (!pageWrap) return;
    const pageNum = parseInt(pageWrap.dataset.page ?? "0");
    if (!pageNum) return;
    const rect = pageWrap.getBoundingClientRect();
    const scale = tessScale();

    if (editorMode === "highlight") {
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;
      let endX = startX;
      let endY = startY;

      // Create visual preview rectangle
      const preview = document.createElement("div");
      preview.style.cssText = `
        position: absolute;
        border: 2px dashed rgba(255, 200, 0, 0.8);
        background: ${highlightColor};
        pointer-events: none;
        z-index: 10;
      `;
      pageWrap.appendChild(preview);

      const updatePreview = () => {
        preview.style.left = `${Math.min(startX, endX)}px`;
        preview.style.top = `${Math.min(startY, endY)}px`;
        preview.style.width = `${Math.abs(endX - startX)}px`;
        preview.style.height = `${Math.abs(endY - startY)}px`;
      };

      const onMove = (me: MouseEvent) => {
        endX = me.clientX - rect.left;
        endY = me.clientY - rect.top;
        updatePreview();
      };
      const onUp = () => {
        preview.remove();
        const hw = Math.abs(endX - startX) / scale;
        const hh = Math.abs(endY - startY) / scale;
        if (hw > 5 && hh > 5) {
          store.pushOp({
            t: "highlight",
            page: pageNum,
            rects: [{ x: Math.min(startX, endX) / scale, y: Math.min(startY, endY) / scale, w: hw, h: hh }],
            color: highlightColor,
          });
        }
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    if (editorMode === "comment") {
      const text = prompt("Comment:");
      if (text) {
        store.pushOp({
          t: "comment",
          page: pageNum,
          at: { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale },
          text,
        });
      }
    }

    if (editorMode === "insertText") {
      const text = prompt("Insert text:");
      if (text) {
        store.pushOp({
          t: "insertText",
          page: pageNum,
          at: { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale },
          text,
        });
      }
    }
  }

  // ── Keyboard ───────────────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent): void {
    if (editingBlockId) return;
    if ((e.key === "Delete" || e.key === "Backspace") && store.selectedBlockId) {
      e.preventDefault();
      onBlockDelete(store.selectedBlockId);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) store.redoOp();
      else store.undoOp();
    }
  }

  // ── Mode helper: init empty docState for annotation without OCR ──
  function ensureDocState(): void {
    if (store.docState) return;
    // Create a minimal empty docState so ops (highlight, comment, insertText) can be stored
    const pages = pageViewports.length || pageCount;
    store.initEmpty(pages);
  }

  function setModeWithInit(mode: EditorMode): void {
    ensureDocState();
    editorMode = mode;
  }

  // ── Toolbar Actions ────────────────────────────────────────────
  async function zoomIn(): Promise<void> {
    zoom = Math.min(2.5, Number((zoom + 0.1).toFixed(2)));
    await renderPages();
  }

  async function zoomOut(): Promise<void> {
    zoom = Math.max(0.5, Number((zoom - 0.1).toFixed(2)));
    await renderPages();
  }

  async function runOcr(): Promise<void> {
    ocrRunning = true;
    ocrError = null;
    showOcrPanel = true;
    try {
      const extracted = await invoke<string>("doc_pdf_ocr_extract", {
        id: sessionId,
        lang: ocrLang,
        tessdata_dir: tessdataDir.trim().length > 0 ? tessdataDir.trim() : null,
      });
      ocrResult = extracted;
      if (!ocrResult.trim()) ocrError = "OCR returned empty text.";
    } catch (err) {
      ocrError = formatError(err);
      ocrResult = "";
    } finally {
      ocrRunning = false;
    }
  }

  let analyzeError = $state<string | null>(null);

  async function analyze(): Promise<void> {
    if (!pdfDoc || pageViewports.length === 0) return;
    ocrError = null;
    analyzeError = null;
    try {
      // Render each page at 300 DPI for OCR
      const OCR_SCALE = 300 / 72; // 300 DPI / 72 PDF points per inch
      const pageImages: string[] = [];

      for (let i = 1; i <= pageCount; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: OCR_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error(`Failed to get canvas context for page ${i}`);
        await page.render({ canvasContext: ctx, viewport }).promise;
        pageImages.push(canvas.toDataURL("image/png"));
      }

      await store.analyzePages(
        sessionId,
        pageViewports.map((vp) => vp.height),
        pageImages,
        ocrLang,
        tessdataDir.trim().length > 0 ? tessdataDir.trim() : undefined,
      );
      editorMode = "select";
    } catch (err) {
      const msg = formatError(err);
      ocrError = msg;
      analyzeError = msg;
    }
  }

  onMount(() => void loadPdf());

  onDestroy(() => {
    renderToken += 1;
    if (pdfDoc?.destroy) void pdfDoc.destroy();
    pdfDoc = null;
    store.reset();
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="pdf-viewer">
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="tool-btn" onclick={zoomOut} title="Zoom out"><ZoomOut size={16} /></button>
      <button class="tool-btn" onclick={zoomIn} title="Zoom in"><ZoomIn size={16} /></button>
      <span class="meta">{Math.round(zoom * 100)}% · {pageCount} pages</span>
    </div>

    <div class="toolbar-center">
      {#if hasLayout}
        <button class="tool-btn" class:active={editorMode === "select"} onclick={() => (editorMode = "select")} title="블록 선택">
          <MousePointer size={16} />
        </button>
      {/if}
      <button class="tool-btn" class:active={editorMode === "highlight"} onclick={() => setModeWithInit("highlight")} title="하이라이트">
        <Highlighter size={16} />
      </button>
      <button class="tool-btn" class:active={editorMode === "comment"} onclick={() => setModeWithInit("comment")} title="코멘트">
        <MessageSquareText size={16} />
      </button>
      <button class="tool-btn" class:active={editorMode === "insertText"} onclick={() => setModeWithInit("insertText")} title="텍스트 삽입">
        <Type size={16} />
      </button>
      <div class="toolbar-divider"></div>
      <button class="tool-btn" onclick={() => store.undoOp()} disabled={!store.canUndo} title="Undo"><Undo size={16} /></button>
      <button class="tool-btn" onclick={() => store.redoOp()} disabled={!store.canRedo} title="Redo"><Redo size={16} /></button>
    </div>

    <div class="toolbar-right">
      <button class="tool-btn" class:active={store.isAnalyzing} onclick={analyze} disabled={store.isAnalyzing || isLoading} title="OCR 레이아웃 분석">
        {#if store.isAnalyzing}<Loader2 size={16} class="spin" />{:else}<Sparkles size={16} />{/if}
      </button>
      <button class="tool-btn" onclick={() => (showOcrSettings = !showOcrSettings)} title="OCR settings"><SlidersHorizontal size={16} /></button>
      <button class="tool-btn" onclick={runOcr} disabled={ocrRunning} title="Extract text (OCR)">
        {#if ocrRunning}<Loader2 size={16} class="spin" />{:else}<ScanText size={16} />{/if}
      </button>
      <button class="tool-btn" onclick={loadPdf} title="Reload PDF"><RefreshCw size={16} /></button>
      <button class="tool-btn" onclick={() => (showOcrPanel = !showOcrPanel)} title="Toggle OCR panel">
        {#if showOcrPanel}<PanelRightClose size={16} />{:else}<PanelRightOpen size={16} />{/if}
      </button>
    </div>
  </div>

  {#if showOcrSettings}
    <div class="ocr-settings">
      <label>
        OCR Language
        <input type="text" bind:value={ocrLang} placeholder="kor+eng" />
      </label>
      <label>
        Tessdata Dir (optional)
        <input type="text" bind:value={tessdataDir} placeholder="/path/to/tessdata" />
      </label>
      {#if editorMode === "highlight"}
        <label>
          Highlight Color
          <input type="color" bind:value={highlightColor} />
        </label>
      {/if}
    </div>
  {/if}

  {#if analyzeError}
    <div class="analyze-error-banner">
      <AlertCircle size={14} />
      <span>{analyzeError}</span>
      <button class="dismiss-btn" onclick={() => analyzeError = null}>&times;</button>
    </div>
  {/if}

  <div class="viewer-body">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pdf-canvas-area"
      class:mode-highlight={editorMode === "highlight"}
      class:mode-comment={editorMode === "comment"}
      class:mode-insert={editorMode === "insertText"}
      onclick={handleCanvasAreaClick}
      onmousedown={handleCanvasAreaMouseDown}
    >
      {#if error}
        <div class="error-state">
          <AlertCircle size={28} />
          <p>{error}</p>
        </div>
      {:else}
        <div class="pages" bind:this={pagesContainer}></div>
        {#if isLoading}
          <div class="loading-overlay">
            <Loader2 size={26} class="spin" />
            <span>Rendering PDF...</span>
          </div>
        {/if}
      {/if}
    </div>

    {#if showOcrPanel}
      <aside class="ocr-panel">
        <div class="ocr-header">
          <ScanText size={16} />
          <span>OCR Text</span>
        </div>
        {#if ocrError}
          <div class="ocr-error">{ocrError}</div>
        {/if}
        {#if ocrResult}
          <pre>{ocrResult}</pre>
        {:else if !ocrRunning}
          <div class="ocr-placeholder">OCR를 실행하면 추출 텍스트가 여기에 표시됩니다.</div>
        {/if}
      </aside>
    {/if}
  </div>
</div>

<style>
  .pdf-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-surface);
  }

  /* ── Toolbar ──────────────────────────────────────────────────── */

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
  }

  .toolbar-left,
  .toolbar-right,
  .toolbar-center {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .toolbar-center {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .toolbar-divider {
    width: 1px;
    height: 18px;
    background: var(--color-border);
    margin: 0 4px;
  }

  .tool-btn {
    width: 30px;
    height: 30px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface);
    color: var(--color-text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .tool-btn:hover { background: var(--color-surface-hover); }
  .tool-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .tool-btn.active {
    background: rgba(99, 102, 241, 0.12);
    border-color: rgba(99, 102, 241, 0.35);
    color: var(--color-primary);
  }

  .analyze-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid rgba(99, 102, 241, 0.3);
    background: rgba(99, 102, 241, 0.1);
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .analyze-btn:hover:not(:disabled) { background: rgba(99, 102, 241, 0.18); }
  .analyze-btn:disabled { opacity: 0.55; cursor: not-allowed; }

  .meta {
    margin-left: 6px;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  /* ── OCR settings ──────────────────────────────────────────── */

  .analyze-error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.12);
    border-bottom: 1px solid rgba(239, 68, 68, 0.3);
    color: #ef4444;
    font-size: 12px;
  }

  .analyze-error-banner span {
    flex: 1;
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: #ef4444;
    font-size: 16px;
    cursor: pointer;
    padding: 0 4px;
  }

  .ocr-settings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px;
    padding: 10px;
    border-bottom: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-surface) 80%, #0f172a);
  }

  .ocr-settings label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .ocr-settings input[type="text"] {
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    padding: 6px 8px;
    font-size: 12px;
  }

  .ocr-settings input[type="color"] {
    height: 28px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
  }

  /* ── Viewer body ───────────────────────────────────────────── */

  .viewer-body {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .pdf-canvas-area {
    flex: 1;
    min-width: 0;
    position: relative;
    overflow: auto;
    background: #1f2937;
    padding: 18px;
  }

  .pdf-canvas-area.mode-highlight { cursor: crosshair; }
  .pdf-canvas-area.mode-comment { cursor: cell; }
  .pdf-canvas-area.mode-insert { cursor: text; }

  .pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .pages :global(.pdf-page) {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.22);
    border-radius: 4px;
    overflow: hidden;
  }

  .pages :global(canvas) {
    display: block;
    max-width: 100%;
    height: auto;
  }

  /* ── Overlay layers (shared) ───────────────────────────────── */

  .pages :global(.text-select-layer),
  .pages :global(.edit-layer),
  .pages :global(.annot-layer) {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .pages :global(.edit-layer) {
    pointer-events: auto;
  }

  /* ── Text select layer ─────────────────────────────────────── */

  .pages :global(.text-line) {
    position: absolute;
    color: transparent;
    user-select: text;
    cursor: text;
    pointer-events: auto;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
  }

  /* ── Edit layer: block overlays ────────────────────────────── */

  .pages :global(.block-overlay) {
    position: absolute;
    border: 1px solid transparent;
    border-radius: 2px;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .pages :global(.block-overlay:hover) {
    border-color: rgba(99, 102, 241, 0.35);
    background: rgba(99, 102, 241, 0.04);
  }

  .pages :global(.block-overlay.selected) {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.06);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.18);
  }

  .pages :global(.block-overlay.modified) {
    background: #ffffff;
    border-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.18);
  }

  .pages :global(.block-overlay.editing) {
    z-index: 10;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
  }

  .pages :global(.block-text-overlay) {
    padding: 2px 4px;
    color: #1e293b;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .pages :global(.block-edit-textarea) {
    border: none;
    outline: none;
    background: rgba(255, 255, 255, 0.97);
    color: #1e293b;
    resize: none;
    padding: 4px;
    font-size: inherit;
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.4;
  }

  /* ── Block toolbar ─────────────────────────────────────────── */

  .pages :global(.block-toolbar) {
    position: absolute;
    display: flex;
    gap: 4px;
    z-index: 20;
    padding: 3px;
    background: var(--color-surface-elevated, #1e293b);
    border: 1px solid var(--color-border, #334155);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }

  .pages :global(.block-tool-btn) {
    padding: 3px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text, #e2e8f0);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .pages :global(.block-tool-btn:hover) {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
  }

  /* ── Inserted text overlay ─────────────────────────────────── */

  .pages :global(.inserted-text-overlay) {
    position: absolute;
    padding: 2px 4px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px dashed #6366f1;
    border-radius: 2px;
    color: #1e293b;
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  /* ── Annotation layer: highlights ──────────────────────────── */

  .pages :global(.highlight-rect) {
    position: absolute;
    border-radius: 2px;
    mix-blend-mode: multiply;
    pointer-events: none;
  }

  /* ── Annotation layer: comments ────────────────────────────── */

  .pages :global(.comment-pin) {
    position: absolute;
    width: 22px;
    height: 22px;
    margin-left: -11px;
    margin-top: -11px;
    border-radius: 50%;
    background: #f59e0b;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    pointer-events: auto;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: white;
    font-weight: 700;
  }

  .pages :global(.comment-pin::after) {
    content: "!";
  }

  .pages :global(.comment-bubble) {
    display: none;
    position: absolute;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    min-width: 120px;
    max-width: 220px;
    padding: 8px 10px;
    background: #1e293b;
    color: #f1f5f9;
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.4;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    white-space: pre-wrap;
    z-index: 30;
  }

  .pages :global(.comment-pin:hover .comment-bubble) {
    display: block;
  }

  /* ── Loading / Error ───────────────────────────────────────── */

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(15, 23, 42, 0.38);
    color: #ffffff;
    font-size: 12px;
  }

  .error-state {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #fecaca;
    text-align: center;
    padding: 20px;
  }

  /* ── OCR panel ─────────────────────────────────────────────── */

  .ocr-panel {
    width: 360px;
    border-left: 1px solid var(--color-border);
    background: var(--color-bg);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .ocr-header {
    padding: 10px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text);
  }

  .ocr-error {
    margin: 10px;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
    font-size: 12px;
  }

  .ocr-panel pre {
    flex: 1;
    margin: 0;
    padding: 12px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.55;
    color: var(--color-text);
    white-space: pre-wrap;
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  .ocr-placeholder {
    margin: 12px;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  /* ── Utilities ──────────────────────────────────────────────── */

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 1100px) {
    .ocr-panel { width: 300px; }
  }

  @media (max-width: 900px) {
    .viewer-body { flex-direction: column; }
    .ocr-panel {
      width: 100%;
      min-height: 200px;
      border-left: none;
      border-top: 1px solid var(--color-border);
    }
  }
</style>
