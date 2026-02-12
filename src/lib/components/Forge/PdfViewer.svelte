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
  } from "@lucide/svelte";

  interface Props {
    sessionId: string;
  }

  const { sessionId }: Props = $props();

  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

  let pagesContainer = $state<HTMLDivElement | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let zoom = $state(1.1);
  let pageCount = $state(0);
  let renderToken = 0;
  let pdfDoc: any = null;

  let ocrLang = $state("kor+eng");
  let tessdataDir = $state("");
  let ocrResult = $state("");
  let ocrError = $state<string | null>(null);
  let ocrRunning = $state(false);
  let showOcrPanel = $state(false);
  let showOcrSettings = $state(false);

  function formatError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  async function loadPdf(): Promise<void> {
    isLoading = true;
    error = null;
    ocrError = null;
    ocrResult = "";
    renderToken += 1;

    try {
      const bytes = await invoke<number[]>("doc_get_pdf_bytes", { id: sessionId });
      const uint8 = new Uint8Array(bytes);
      const loadingTask = pdfjs.getDocument({ data: uint8 });
      pdfDoc = await loadingTask.promise;
      pageCount = pdfDoc.numPages ?? 0;
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

        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        pageWrap.appendChild(canvas);
        pagesContainer.appendChild(pageWrap);

        const context = canvas.getContext("2d");
        if (!context) continue;

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise;
      }
    } catch (err) {
      if (token === renderToken) {
        error = formatError(err);
      }
    } finally {
      if (token === renderToken) {
        isLoading = false;
      }
    }
  }

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
      if (!ocrResult.trim()) {
        ocrError = "OCR returned empty text.";
      }
    } catch (err) {
      ocrError = formatError(err);
      ocrResult = "";
    } finally {
      ocrRunning = false;
    }
  }

  onMount(() => {
    void loadPdf();
  });

  onDestroy(() => {
    renderToken += 1;
    if (pdfDoc?.destroy) {
      void pdfDoc.destroy();
    }
    pdfDoc = null;
  });
</script>

<div class="pdf-viewer">
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="tool-btn" onclick={zoomOut} title="Zoom out">
        <ZoomOut size={16} />
      </button>
      <button class="tool-btn" onclick={zoomIn} title="Zoom in">
        <ZoomIn size={16} />
      </button>
      <span class="meta">{Math.round(zoom * 100)}% · {pageCount} pages</span>
    </div>

    <div class="toolbar-right">
      <button class="tool-btn" onclick={() => (showOcrSettings = !showOcrSettings)} title="OCR settings">
        <SlidersHorizontal size={16} />
      </button>
      <button class="tool-btn" onclick={runOcr} disabled={ocrRunning} title="Run OCR">
        {#if ocrRunning}
          <Loader2 size={16} class="spin" />
        {:else}
          <ScanText size={16} />
        {/if}
      </button>
      <button class="tool-btn" onclick={loadPdf} title="Reload PDF">
        <RefreshCw size={16} />
      </button>
      <button class="tool-btn" onclick={() => (showOcrPanel = !showOcrPanel)} title="Toggle OCR panel">
        {#if showOcrPanel}
          <PanelRightClose size={16} />
        {:else}
          <PanelRightOpen size={16} />
        {/if}
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
    </div>
  {/if}

  <div class="viewer-body">
    <div class="pdf-canvas-area">
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
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
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

  .tool-btn:hover {
    background: var(--color-surface-hover);
  }

  .tool-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .meta {
    margin-left: 6px;
    font-size: 12px;
    color: var(--color-text-muted);
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

  .ocr-settings input {
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    padding: 6px 8px;
    font-size: 12px;
  }

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

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 1100px) {
    .ocr-panel {
      width: 300px;
    }
  }

  @media (max-width: 900px) {
    .viewer-body {
      flex-direction: column;
    }

    .ocr-panel {
      width: 100%;
      min-height: 200px;
      border-left: none;
      border-top: 1px solid var(--color-border);
    }
  }
</style>
