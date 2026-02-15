<script lang="ts">
  import { mount, onDestroy, onMount, unmount } from "svelte";
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
    Pencil,
    Minus,
    Plus,
    Trash2,
    PaintBucket,
    WandSparkles,
  } from "@lucide/svelte";
  import { pdfEditorStore } from "$lib/stores/pdfEditor.svelte";
  import { t } from "$lib/i18n";
  import type { PdfBlock, PdfLayoutResultRaw } from "$lib/types/pdfEditor";

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
  let renderedZoom = $state(1.1);
  let pageCount = $state(0);
  let renderToken = 0;
  let thumbnailRenderToken = 0;
  let pdfDoc: any = null;
  let pageViewports: Array<{ width: number; height: number }> = [];
  let renderedTextLayerDocRef: object | null = null;
  const mountedToolbarIcons: Record<string, any>[] = [];
  let zoomTransitioning = $state(false);
  let zoomTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  let zoomRenderTimer: ReturnType<typeof setTimeout> | null = null;
  let canvasAreaEl = $state<HTMLDivElement | null>(null);
  let activePage = $state(1);
  interface PageThumbnail {
    page: number;
    dataUrl: string | null;
  }
  let pageThumbnails = $state<PageThumbnail[]>([]);
  type ViewAnchor = { x: number; y: number };
  let pendingZoomAnchor: ViewAnchor | null = null;

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.1;
  const ZOOM_RENDER_DEBOUNCE_MS = 90;

  // ── OCR settings ───────────────────────────────────────────────
  let ocrLang = $state("kor+eng");
  let tessdataDir = $state("");
  let ocrResult = $state("");
  let ocrError = $state<string | null>(null);
  let ocrRunning = $state(false);
  let showOcrPanel = $state(false);
  let showOcrSettings = $state(false);
  let availableLangs = $state<string[]>([]);
  let selectedLangs = $state<Set<string>>(new Set(["kor", "eng"]));

  type AnalysisMethod = "idle" | "pdfjsText" | "tesseractOcr";
  type LangDetectionSource = "embeddedText" | "weakEmbeddedText" | "noEmbeddedText";
  interface LangDetectionResult {
    langs: string[];
    source: LangDetectionSource;
    totalChars: number;
    rawChars: number;
    recognizedRatio: number;
    sampledPages: number;
    scriptCounts: Record<string, number>;
    fontHints: string[];
  }

  // Prioritized languages shown at top of the list.
  const PRIORITY_LANGS = ["kor", "eng", "jpn", "chi_sim", "chi_tra", "deu", "fra", "spa"];
  let autoDetectedLangs = $state<string[]>([]);
  let detectedLangSource = $state<LangDetectionSource | null>(null);
  let lastLangDetection = $state<LangDetectionResult | null>(null);
  let analysisMethod = $state<AnalysisMethod>("idle");
  let analysisMethodNote = $state<string>($t("forge.pdf.analysis.ready"));
  let analysisStatus = $state<string>("");
  let analysisRunning = $state(false);
  let effectiveOcrLangs = $state<string[]>(["kor", "eng"]);
  let showAnalysisBanner = $state(false);
  let analysisBannerClosing = $state(false);
  let analysisBannerHideTimer: ReturnType<typeof setTimeout> | null = null;
  let analysisBannerCloseTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Editor mode ────────────────────────────────────────────────
  type EditorMode = "view" | "select" | "highlight" | "comment" | "insertText";
  let editorMode = $state<EditorMode>("view");
  let editingBlockId = $state<string | null>(null);
  let dragState: { blockId: string; startX: number; startY: number } | null = null;
  let highlightColor = $state("#ffeb3b");

  const TESSERACT_DPI = 300;
  const store = pdfEditorStore;
  const hasLayout = $derived(store.hasLayout);
  const isAnalyzing = $derived(analysisRunning || store.isAnalyzing);

  function tr(key: string, vars?: Record<string, string | number>): string {
    let text: string = $t(key);
    if (!vars) return text;
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }

  function formatError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  /** Scale factor: maps OCR pixel coords to displayed CSS pixels.
   *  When no OCR data exists, annotations use viewport coords directly (scale=1). */
  function tessScale(): number {
    return hasLayout ? renderedZoom * 72 / TESSERACT_DPI : 1;
  }

  function langLabel(lang: string): string {
    const translated = $t(`forge.pdf.lang.${lang}`);
    return translated === `forge.pdf.lang.${lang}` ? lang : translated;
  }

  function orderedAvailableLangs(): string[] {
    if (availableLangs.length === 0) return [];
    return [
      ...PRIORITY_LANGS.filter((l) => availableLangs.includes(l)),
      ...availableLangs.filter((l) => !PRIORITY_LANGS.includes(l)),
    ];
  }

  function persistSelectedLangs(langs: string[]): void {
    try {
      localStorage.setItem("openclaw-ocr-langs", JSON.stringify(langs));
    } catch {
      // Ignore storage failures in private mode / restricted environments.
    }
  }

  function setSelectedLangs(next: Set<string>): void {
    // Keep at least one fallback language active.
    if (next.size === 0) next.add("eng");
    selectedLangs = next;
    const selected = [...next];
    ocrLang = selected.join("+");
    effectiveOcrLangs = selected;
    persistSelectedLangs(selected);
  }

  function toggleLang(lang: string): void {
    const next = new Set(selectedLangs);
    if (next.has(lang)) next.delete(lang);
    else next.add(lang);
    setSelectedLangs(next);
  }

  function applyLangPreset(langs: string[]): void {
    const normalized = langs.map((lang) => lang.trim()).filter(Boolean);
    setSelectedLangs(new Set(normalized.length > 0 ? normalized : ["eng"]));
  }

  function methodLabel(method: AnalysisMethod): string {
    if (method === "pdfjsText") return $t("forge.pdf.method.pdfjs");
    if (method === "tesseractOcr") return $t("forge.pdf.method.tesseract");
    return $t("forge.pdf.method.idle");
  }

  function sourceLabel(source: LangDetectionSource | null): string {
    if (source === "embeddedText") return $t("forge.pdf.source.embedded_high");
    if (source === "weakEmbeddedText") return $t("forge.pdf.source.embedded_low");
    if (source === "noEmbeddedText") return $t("forge.pdf.source.none");
    return $t("forge.pdf.source.not_analyzed");
  }

  function scriptSummary(counts: Record<string, number>): string {
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (ranked.length === 0) return $t("forge.pdf.script.none");
    return ranked.map(([lang, count]) => `${langLabel(lang)} ${count}`).join(" · ");
  }

  function fontHintSummary(hints: string[]): string {
    if (!hints || hints.length === 0) return "";
    return tr("forge.pdf.font_hint_prefix", { langs: hints.map((lang) => langLabel(lang)).join(", ") });
  }

  function mergeLangs(primary: Iterable<string>, secondary: Iterable<string>): string[] {
    const merged = new Set<string>();
    for (const lang of primary) {
      const normalized = lang.trim();
      if (normalized.length > 0) merged.add(normalized);
    }
    for (const lang of secondary) {
      const normalized = lang.trim();
      if (normalized.length > 0) merged.add(normalized);
    }
    if (merged.size === 0) merged.add("eng");
    return [...merged];
  }

  function ensureCoreOcrLangs(langs: Iterable<string>): string[] {
    const merged = new Set<string>();
    for (const lang of langs) {
      const normalized = lang.trim();
      if (normalized.length === 0) continue;
      merged.add(normalized);
    }

    for (const core of ["kor", "eng"]) {
      merged.add(core);
    }

    if (merged.size === 0) merged.add("eng");
    return [...merged];
  }

  function composeSegmentText(words: Array<{ x: number; w: number; text: string }>): string {
    if (words.length === 0) return "";
    if (words.length === 1) return words[0].text.trim();

    const sorted = [...words].sort((a, b) => a.x - b.x);
    let result = sorted[0].text;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const prevChars = Math.max(1, [...prev.text].length);
      const curChars = Math.max(1, [...cur.text].length);
      const prevCharW = prev.w / prevChars;
      const curCharW = cur.w / curChars;
      const charUnit = Math.max(1, Math.min(prevCharW, curCharW));
      const gap = cur.x - (prev.x + prev.w);
      const needsSpace = gap > charUnit * 0.9;
      result += `${needsSpace ? " " : ""}${cur.text}`;
    }

    return result.trim();
  }

  function clearAnalysisBannerTimers(): void {
    if (analysisBannerHideTimer) {
      clearTimeout(analysisBannerHideTimer);
      analysisBannerHideTimer = null;
    }
    if (analysisBannerCloseTimer) {
      clearTimeout(analysisBannerCloseTimer);
      analysisBannerCloseTimer = null;
    }
  }

  function cleanupToolbarIcons(): void {
    if (mountedToolbarIcons.length === 0) return;
    for (const icon of mountedToolbarIcons.splice(0)) {
      void unmount(icon);
    }
  }

  function fitOverlayFontSize(
    overlay: HTMLDivElement,
    baseFontSize: number,
    minFontSize = 8,
    shrinkFloorRatio = 0.82,
  ): void {
    const max = Math.max(minFontSize, baseFontSize);
    const min = Math.max(minFontSize, max * shrinkFloorRatio);
    const fits = (): boolean =>
      overlay.scrollWidth <= overlay.clientWidth + 2
      && overlay.scrollHeight <= overlay.clientHeight + 2;

    overlay.style.fontSize = `${max}px`;
    if (fits()) return;

    overlay.style.fontSize = `${min}px`;
    if (!fits()) return;

    let lo = min;
    let hi = max;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      overlay.style.fontSize = `${mid}px`;
      if (fits()) lo = mid;
      else hi = mid;
    }
    overlay.style.fontSize = `${lo.toFixed(2)}px`;
  }

  function blockRenderFontSizePx(
    block: Pick<PdfBlock, "bbox" | "fontSize">,
    mod: { text: string; fontSize: number; dh: number },
    scale: number,
  ): number {
    const textLineCount = Math.max(1, mod.text.split(/\r?\n/).length);
    const boxHeight = Math.max(8, block.bbox.h + mod.dh);
    const fallbackFs = (boxHeight * scale * 0.9) / textLineCount;
    const sourceFs = Number.isFinite(mod.fontSize) ? mod.fontSize : block.fontSize;
    const baseFs = sourceFs > 0 ? sourceFs * scale * 1.12 : fallbackFs;
    return Math.max(9, baseFs);
  }

  function estimateRequiredBoxPx(
    text: string,
    fontPx: number,
    prefersSingleLine: boolean,
    currentWidthPx: number,
  ): { width: number; height: number } {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const lineHeight = Math.max(1, fontPx * 1.12);
    const hPad = 6; // .block-text-overlay horizontal padding (3px * 2)
    const vPad = 2; // .block-text-overlay vertical padding (1px * 2)

    if (!ctx) {
      return {
        width: Math.ceil(Math.max(1, currentWidthPx)),
        height: Math.ceil(lineHeight + vPad),
      };
    }

    ctx.font = `${fontPx}px system-ui, -apple-system, sans-serif`;
    const safeText = text.length > 0 ? text : " ";

    if (prefersSingleLine) {
      return {
        width: Math.ceil(ctx.measureText(safeText).width + hPad),
        height: Math.ceil(lineHeight + vPad),
      };
    }

    const maxContentWidth = Math.max(1, currentWidthPx - hPad);
    const lines: string[] = [];

    for (const paragraph of safeText.split(/\r?\n/)) {
      if (paragraph.length === 0) {
        lines.push("");
        continue;
      }
      if (ctx.measureText(paragraph).width <= maxContentWidth) {
        lines.push(paragraph);
        continue;
      }

      let line = "";
      for (const ch of Array.from(paragraph)) {
        const next = line + ch;
        if (line && ctx.measureText(next).width > maxContentWidth) {
          lines.push(line);
          line = ch;
        } else {
          line = next;
        }
      }
      lines.push(line);
    }

    const contentWidth = lines.reduce((max, line) => {
      const w = ctx.measureText(line.length > 0 ? line : " ").width;
      return Math.max(max, w);
    }, 0);

    return {
      width: Math.ceil(Math.max(currentWidthPx, contentWidth + hPad)),
      height: Math.ceil(Math.max(lineHeight + vPad, lines.length * lineHeight + vPad)),
    };
  }

  function showAnalysisBannerNow(): void {
    clearAnalysisBannerTimers();
    showAnalysisBanner = true;
    analysisBannerClosing = false;
  }

  function hideAnalysisBannerSoon(delayMs = 1400): void {
    clearAnalysisBannerTimers();
    analysisBannerHideTimer = setTimeout(() => {
      analysisBannerHideTimer = null;
      analysisBannerClosing = true;
      analysisBannerCloseTimer = setTimeout(() => {
        analysisBannerCloseTimer = null;
        analysisBannerClosing = false;
        showAnalysisBanner = false;
      }, 220);
    }, delayMs);
  }

  function hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace("#", "");
    const normalized = clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(255, 235, 59, ${alpha})`;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function highlightFillColor(): string {
    return hexToRgba(highlightColor, 0.35);
  }

  function seedThumbnails(totalPages: number): void {
    pageThumbnails = Array.from({ length: Math.max(0, totalPages) }, (_, idx) => ({
      page: idx + 1,
      dataUrl: null,
    }));
  }

  function updateThumbnail(page: number, dataUrl: string): void {
    const idx = page - 1;
    if (idx < 0 || idx >= pageThumbnails.length) return;
    const next = pageThumbnails.slice();
    next[idx] = { ...next[idx], dataUrl };
    pageThumbnails = next;
  }

  async function renderThumbnails(): Promise<void> {
    if (!pdfDoc || pageCount <= 0) {
      pageThumbnails = [];
      return;
    }
    const token = ++thumbnailRenderToken;
    seedThumbnails(pageCount);
    const targetWidth = 92;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (token !== thumbnailRenderToken) return;
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1, targetWidth / Math.max(1, baseViewport.width));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        updateThumbnail(pageNumber, canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        // Keep placeholder thumbnail on per-page failures.
      }
    }
  }

  function updateActivePageFromScroll(): void {
    if (!canvasAreaEl || !pagesContainer) return;
    const pageNodes = pagesContainer.querySelectorAll<HTMLDivElement>(".pdf-page");
    if (pageNodes.length === 0) return;

    const areaRect = canvasAreaEl.getBoundingClientRect();
    const focusY = areaRect.top + areaRect.height * 0.35;
    let bestPage = activePage;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const node of pageNodes) {
      const page = parseInt(node.dataset.page ?? "0", 10);
      if (!page) continue;
      const rect = node.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const dist = Math.abs(centerY - focusY);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestPage = page;
      }
    }

    activePage = bestPage;
  }

  function handleCanvasScroll(): void {
    updateActivePageFromScroll();
  }

  function scrollToPage(page: number): void {
    if (!pagesContainer) return;
    const target = pagesContainer.querySelector<HTMLDivElement>(`.pdf-page[data-page="${page}"]`);
    if (!target) return;
    activePage = page;
    target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return Boolean(el.closest("input, textarea, select, [contenteditable], [role='textbox']"));
  }

  function captureViewportAnchor(scale: number): ViewAnchor | null {
    if (!canvasAreaEl || scale <= 0) return null;
    const centerX = canvasAreaEl.scrollLeft + canvasAreaEl.clientWidth / 2;
    const centerY = canvasAreaEl.scrollTop + canvasAreaEl.clientHeight / 2;
    return { x: centerX / scale, y: centerY / scale };
  }

  function restoreViewportAnchor(anchor: ViewAnchor | null, scale: number): void {
    if (!anchor || !canvasAreaEl || scale <= 0) return;
    const nextLeft = anchor.x * scale - canvasAreaEl.clientWidth / 2;
    const nextTop = anchor.y * scale - canvasAreaEl.clientHeight / 2;
    canvasAreaEl.scrollLeft = Math.max(0, nextLeft);
    canvasAreaEl.scrollTop = Math.max(0, nextTop);
  }

  function queueZoomRender(): void {
    if (!pdfDoc) return;
    if (zoomRenderTimer) {
      clearTimeout(zoomRenderTimer);
      zoomRenderTimer = null;
    }

    zoomRenderTimer = setTimeout(() => {
      zoomRenderTimer = null;
      const anchor = pendingZoomAnchor ?? captureViewportAnchor(renderedZoom);
      pendingZoomAnchor = null;
      const nextRenderedZoom = zoom;
      renderedZoom = nextRenderedZoom;
      startZoomTransition();
      void renderPages({ showLoader: false, anchor }).then(() => {
        if (Math.abs(renderedZoom - nextRenderedZoom) > 0.0001) return;
        restoreViewportAnchor(anchor, renderedZoom);
      });
    }, ZOOM_RENDER_DEBOUNCE_MS);
  }

  function updateZoom(nextZoom: number): void {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(nextZoom.toFixed(2))));
    if (Math.abs(clamped - zoom) < 0.0001) return;
    pendingZoomAnchor = captureViewportAnchor(renderedZoom);
    zoom = clamped;
    queueZoomRender();
  }

  // ── PDF Loading ────────────────────────────────────────────────
  async function loadPdf(): Promise<void> {
    if (zoomRenderTimer) {
      clearTimeout(zoomRenderTimer);
      zoomRenderTimer = null;
    }
    pendingZoomAnchor = null;
    renderedZoom = zoom;
    isLoading = true;
    error = null;
    activePage = 1;
    thumbnailRenderToken += 1;
    pageThumbnails = [];
    ocrError = null;
    ocrResult = "";
    analyzeError = null;
    autoDetectedLangs = [];
    detectedLangSource = null;
    lastLangDetection = null;
    analysisMethod = "idle";
    analysisMethodNote = $t("forge.pdf.analysis.ready");
    analysisStatus = "";
    analysisRunning = false;
    effectiveOcrLangs = ensureCoreOcrLangs(selectedLangs);
    clearAnalysisBannerTimers();
    analysisBannerClosing = false;
    showAnalysisBanner = false;
    renderToken += 1;
    renderedTextLayerDocRef = null;
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
      void renderThumbnails();
    } catch (err) {
      error = formatError(err);
      isLoading = false;
      pageCount = 0;
      pageThumbnails = [];
      pagesContainer?.replaceChildren();
    }
  }

  async function renderPages(options?: { showLoader?: boolean; anchor?: ViewAnchor | null }): Promise<void> {
    if (!pdfDoc || !pagesContainer) return;
    const token = ++renderToken;
    const showLoader = options?.showLoader ?? true;
    if (showLoader) isLoading = true;
    error = null;
    renderedTextLayerDocRef = null;
    const nextPages: HTMLDivElement[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (token !== renderToken) return;
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: renderedZoom });

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

        const context = canvas.getContext("2d");
        if (context) {
          await page.render({ canvas, canvasContext: context, viewport }).promise;
        }

        nextPages.push(pageWrap);
      }
    } catch (err) {
      if (token === renderToken) error = formatError(err);
      return;
    } finally {
      if (token === renderToken && showLoader) {
        isLoading = false;
      }
    }

    if (token !== renderToken) return;
    pagesContainer.replaceChildren(...nextPages);

    // Zoom/pager re-render rebuilds page DOM and clears overlay nodes.
    // Repaint OCR/edit overlays explicitly after page rendering completes.
    if (store.docState && pagesContainer.children.length > 0) {
      doRenderOverlays();
    }
    restoreViewportAnchor(options?.anchor ?? null, renderedZoom);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => updateActivePageFromScroll());
    } else {
      updateActivePageFromScroll();
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
    const ds = store.docState;
    const shouldRenderTextLayer = renderedTextLayerDocRef !== ds;
    cleanupToolbarIcons();

    const pageWraps = pagesContainer.querySelectorAll<HTMLDivElement>(".pdf-page");
    pageWraps.forEach((wrap) => {
      const pageNum = parseInt(wrap.dataset.page ?? "0");
      if (!pageNum) return;

      const textLayer = wrap.querySelector<HTMLDivElement>(".text-select-layer");
      const editLayer = wrap.querySelector<HTMLDivElement>(".edit-layer");
      const annotLayer = wrap.querySelector<HTMLDivElement>(".annot-layer");

      if (textLayer && shouldRenderTextLayer) renderTextLayer(textLayer, pageNum, scale);
      if (editLayer) renderEditLayer(editLayer, pageNum, scale);
      if (annotLayer) renderAnnotLayer(annotLayer, pageNum, scale);
    });

    if (shouldRenderTextLayer) renderedTextLayerDocRef = ds;
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
      span.style.fontSize = `${(line.fontSize || line.bbox.h * 0.85) * scale}px`;
      layer.appendChild(span);
    }
  }

  function renderEditLayer(layer: HTMLDivElement, pageNum: number, scale: number): void {
    layer.replaceChildren();
    const ds = store.docState;
    if (!ds) return;
    const fitTargets: Array<{
      overlay: HTMLDivElement;
      baseFontSize: number;
      minFontSize: number;
      shrinkFloorRatio: number;
    }> = [];

    for (const block of Object.values(ds.blocks)) {
      if (block.page !== pageNum) continue;
      const mod = store.getModifiedBlock(block.id);
      if (!mod || mod.deleted) continue;

      const div = document.createElement("div");
      div.className = "block-overlay";
      div.dataset.blockId = block.id;

      const bw = Math.max(8, block.bbox.w + mod.dw);
      const bh = Math.max(8, block.bbox.h + mod.dh);
      div.style.left = `${(block.bbox.x + mod.dx) * scale}px`;
      div.style.top = `${(block.bbox.y + mod.dy) * scale}px`;
      div.style.width = `${bw * scale}px`;
      div.style.height = `${bh * scale}px`;

      if (store.selectedBlockId === block.id) div.classList.add("selected");
      const fontSizeChanged = Math.abs(mod.fontSize - block.fontSize) > 0.15;
      if (mod.text !== block.text || fontSizeChanged) {
        div.classList.add("modified");
        // Use detected background color instead of hardcoded white
        div.style.background = block.bgColor ?? "#ffffff";
        const overlay = document.createElement("div");
        overlay.className = "block-text-overlay";
        overlay.textContent = mod.text;
        const prefersSingleLine = block.lineIds.length <= 1 && !/\r?\n/.test(mod.text);
        if (prefersSingleLine) {
          overlay.style.whiteSpace = "pre";
          overlay.style.wordBreak = "normal";
        }
        const fs = blockRenderFontSizePx(block, mod, scale);
        overlay.style.fontSize = `${fs}px`;
        overlay.style.background = block.bgColor ?? "#ffffff";
        fitTargets.push({
          overlay,
          baseFontSize: fs,
          minFontSize: prefersSingleLine ? 6 : 8,
          shrinkFloorRatio: prefersSingleLine ? 0.45 : 0.82,
        });
        div.appendChild(overlay);
      }

      if (store.selectedBlockId === block.id && editorMode === "select" && editingBlockId !== block.id) {
        const handle = document.createElement("div");
        handle.className = "block-resize-handle";
        handle.title = $t("forge.pdf.tool.resize_box");
        handle.addEventListener("mousedown", (e) => onBlockResizeMouseDown(e, block.id));
        div.appendChild(handle);
      }

      div.addEventListener("click", (e) => onBlockClick(e, block.id));
      div.addEventListener("dblclick", (e) => onBlockDblClick(e, block.id));
      div.addEventListener("mousedown", (e) => onBlockMouseDown(e, block.id));
      layer.appendChild(div);
    }

    for (const target of fitTargets) {
      fitOverlayFontSize(
        target.overlay,
        target.baseFontSize,
        target.minFontSize,
        target.shrinkFloorRatio,
      );
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
          tb.style.left = `${(block.bbox.x + mod.dx) * scale}px`;
          tb.style.top = `${((block.bbox.y + mod.dy) * scale) - 32}px`;

          const previewFontPx = blockRenderFontSizePx(block, mod, scale);
          const createIconBtn = (
            title: string,
            icon: typeof Pencil,
            action: () => void,
            extraClass?: string,
          ): HTMLButtonElement => {
            const btn = document.createElement("button");
            btn.className = `block-tool-btn icon-only${extraClass ? ` ${extraClass}` : ""}`;
            btn.title = title;
            btn.setAttribute("aria-label", title);
            btn.addEventListener("click", (e) => { e.stopPropagation(); action(); });
            const mounted = mount(icon, { target: btn, props: { size: 14, strokeWidth: 2 } });
            mountedToolbarIcons.push(mounted);
            return btn;
          };

          const downBtn = createIconBtn($t("forge.pdf.tool.font_down"), Minus, () => onBlockAdjustFontSize(block.id, -1));
          const upBtn = createIconBtn($t("forge.pdf.tool.font_up"), Plus, () => onBlockAdjustFontSize(block.id, 1));
          tb.appendChild(downBtn);

          const fontChip = document.createElement("span");
          fontChip.className = "block-tool-font-size";
          fontChip.textContent = `${Math.round(previewFontPx)}px`;
          fontChip.title = $t("forge.pdf.tool.font_current");
          tb.appendChild(fontChip);

          tb.appendChild(upBtn);

          const tools: Array<{
            title: string;
            icon: typeof Pencil;
            action: () => void;
            extraClass?: string;
          }> = [
            { title: $t("forge.pdf.tool.edit"), icon: Pencil, action: () => onBlockDblClick(null, block.id) },
            { title: $t("forge.pdf.tool.fill_bg"), icon: PaintBucket, action: () => onBlockFillBackground(block.id) },
            { title: $t("forge.pdf.tool.delete"), icon: Trash2, action: () => onBlockDelete(block.id), extraClass: "danger" },
            { title: $t("forge.pdf.tool.ai_rewrite"), icon: WandSparkles, action: () => handleAiRewriteClick(block.id) },
          ];

          for (const tool of tools) {
            const btn = createIconBtn(tool.title, tool.icon, tool.action, tool.extraClass);
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
    const originalText = mod.text;
    ta.value = originalText;
    ta.style.width = "100%";
    ta.style.height = "100%";
    // Use detected background color for inline editing
    const block = store.docState?.blocks[blockId];
    if (block?.bgColor) {
      ta.style.background = block.bgColor;
    }
    const editScale = tessScale();
    const editFs = block ? blockRenderFontSizePx(block, mod, editScale) : Math.max(9, 12 * editScale);
    ta.style.fontSize = `${editFs}px`;
    const prefersSingleLine = (block?.lineIds.length ?? 0) <= 1 && !/\r?\n/.test(originalText);
    if (prefersSingleLine) {
      ta.wrap = "off";
      ta.style.whiteSpace = "pre";
      ta.style.wordBreak = "normal";
      ta.style.overflowX = "auto";
      ta.style.overflowY = "hidden";
    } else {
      ta.wrap = "soft";
      ta.style.whiteSpace = "pre-wrap";
      ta.style.wordBreak = "break-word";
      ta.style.overflow = "auto";
    }
    el.appendChild(ta);
    ta.focus();

    let finished = false;
    const finishEditing = (save: boolean): void => {
      if (finished) return;
      finished = true;
      const newText = ta.value;
      if (save && newText !== originalText) {
        store.pushOp({ t: "replaceText", targetId: blockId, text: newText, fontSize: mod.fontSize });
      }
      editingBlockId = null;
      doRenderOverlays();
    };

    ta.addEventListener("blur", () => {
      finishEditing(true);
    });

    ta.addEventListener("keydown", (ke) => {
      if (ke.key === "Enter" && !ke.shiftKey) {
        ke.preventDefault();
        finishEditing(true);
        return;
      }
      if (ke.key === "Escape") {
        ke.preventDefault();
        ta.value = originalText;
        finishEditing(false);
        return;
      }
      if (ke.key === "Enter" && ke.shiftKey) {
        // Keep default textarea newline behavior on Shift+Enter.
        return;
      }
    });
  }

  function onBlockMouseDown(e: MouseEvent, blockId: string): void {
    if (editorMode !== "select" || editingBlockId) return;
    if ((e.target as HTMLElement).closest(".block-resize-handle")) return;
    e.stopPropagation();
    const scale = tessScale();

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
        const dxPx = me.clientX - dragState.startX;
        const dyPx = me.clientY - dragState.startY;
        const dx = dxPx / Math.max(0.01, scale);
        const dy = dyPx / Math.max(0.01, scale);
        const el = pagesContainer?.querySelector<HTMLDivElement>(`[data-block-id="${blockId}"]`);
        if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) {
          store.pushOp({ t: "move", targetId: blockId, dx, dy });
        } else {
          // Keep clicked element alive so click/dblclick can fire normally.
          if (el) el.style.transform = "";
        }
        dragState = null;
      }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onBlockResizeMouseDown(e: MouseEvent, blockId: string): void {
    if (editorMode !== "select" || editingBlockId) return;
    e.stopPropagation();
    e.preventDefault();

    const el = pagesContainer?.querySelector<HTMLDivElement>(`[data-block-id="${blockId}"]`);
    const block = store.docState?.blocks[blockId];
    const mod = store.getModifiedBlock(blockId);
    if (!el || !block || !mod) return;

    const scale = tessScale();
    const minSize = 8;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = Math.max(minSize, block.bbox.w + mod.dw);
    const startH = Math.max(minSize, block.bbox.h + mod.dh);

    const onMove = (me: MouseEvent) => {
      const dwPx = me.clientX - startX;
      const dhPx = me.clientY - startY;
      const wPx = Math.max(minSize * scale, (startW * scale) + dwPx);
      const hPx = Math.max(minSize * scale, (startH * scale) + dhPx);
      el.style.width = `${wPx}px`;
      el.style.height = `${hPx}px`;
    };

    const onUp = (me: MouseEvent) => {
      const dwPx = me.clientX - startX;
      const dhPx = me.clientY - startY;
      const wPx = Math.max(minSize * scale, (startW * scale) + dwPx);
      const hPx = Math.max(minSize * scale, (startH * scale) + dhPx);
      const finalW = wPx / Math.max(0.01, scale);
      const finalH = hPx / Math.max(0.01, scale);
      const dw = finalW - startW;
      const dh = finalH - startH;

      if (Math.abs(dw) > 0.5 || Math.abs(dh) > 0.5) {
        store.pushOp({ t: "resize", targetId: blockId, dw, dh });
      } else {
        // Revert temporary preview size without forcing a full rerender.
        el.style.width = `${startW * scale}px`;
        el.style.height = `${startH * scale}px`;
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

  function onBlockAdjustFontSize(blockId: string, direction: 1 | -1): void {
    const block = store.docState?.blocks[blockId];
    const mod = store.getModifiedBlock(blockId);
    if (!block || !mod || mod.deleted) return;

    const current = Number.isFinite(mod.fontSize) ? mod.fontSize : block.fontSize;
    const step = Math.max(0.8, current * 0.08);
    const next = Math.round((current + (step * direction)) * 10) / 10;
    const clamped = Math.max(6, Math.min(180, next));
    if (Math.abs(clamped - current) < 0.05) return;

    const scale = Math.max(0.01, tessScale());
    const currentW = Math.max(8, block.bbox.w + mod.dw);
    const currentH = Math.max(8, block.bbox.h + mod.dh);
    const prefersSingleLine = block.lineIds.length <= 1 && !/\r?\n/.test(mod.text);
    const previewFontPx = blockRenderFontSizePx(block, { text: mod.text, fontSize: clamped, dh: mod.dh }, scale);
    const requiredPx = estimateRequiredBoxPx(mod.text, previewFontPx, prefersSingleLine, currentW * scale);
    const requiredW = requiredPx.width / scale;
    const requiredH = requiredPx.height / scale;
    const autoDw = Math.max(0, requiredW - currentW);
    const autoDh = Math.max(0, requiredH - currentH);

    store.pushOp({
      t: "replaceText",
      targetId: blockId,
      text: mod.text,
      fontSize: clamped,
    });

    if (autoDw > 0.5 || autoDh > 0.5) {
      store.pushOp({
        t: "resize",
        targetId: blockId,
        dw: autoDw,
        dh: autoDh,
      });
    }
  }

  function onBlockFillBackground(blockId: string): void {
    const mod = store.getModifiedBlock(blockId);
    if (!mod) return;
    if (mod.text === "") return;
    store.pushOp({ t: "replaceText", targetId: blockId, text: "", fontSize: mod.fontSize });
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
        background: ${highlightFillColor()};
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
            color: highlightFillColor(),
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
    if (isEditableTarget(e.target)) return;
    if (editingBlockId) return;
    const modKey = e.metaKey || e.ctrlKey;
    if (modKey && (e.key === "=" || e.key === "+" || e.key === "Add")) {
      e.preventDefault();
      void zoomIn();
      return;
    }
    if (modKey && (e.key === "-" || e.key === "_" || e.key === "Subtract")) {
      e.preventDefault();
      void zoomOut();
      return;
    }
    if (modKey && e.key === "0") {
      e.preventDefault();
      void resetZoom();
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && store.selectedBlockId) {
      e.preventDefault();
      onBlockDelete(store.selectedBlockId);
    }
    if (modKey && e.key === "z") {
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
  function startZoomTransition(): void {
    zoomTransitioning = true;
    if (zoomTransitionTimer) {
      clearTimeout(zoomTransitionTimer);
    }
    zoomTransitionTimer = setTimeout(() => {
      zoomTransitionTimer = null;
      zoomTransitioning = false;
    }, 220);
  }

  async function zoomIn(): Promise<void> {
    updateZoom(zoom + ZOOM_STEP);
  }

  async function zoomOut(): Promise<void> {
    updateZoom(zoom - ZOOM_STEP);
  }

  async function resetZoom(): Promise<void> {
    updateZoom(1.1);
  }

  async function runOcr(): Promise<void> {
    ocrRunning = true;
    ocrError = null;
    showOcrPanel = true;
    const langs = ensureCoreOcrLangs(ocrLang.split("+").map((s) => s.trim()).filter(Boolean));
    ocrLang = langs.join("+");
    effectiveOcrLangs = langs;
    try {
      let autoTessdataDir: string | undefined;
      try {
        autoTessdataDir = await invoke<string>("doc_ocr_ensure_langs", { langs });
      } catch (dlErr) {
        console.warn("Auto-download tessdata failed in runOcr:", dlErr);
      }

      const effectiveTessdataDir = tessdataDir.trim().length > 0
        ? tessdataDir.trim()
        : autoTessdataDir ?? null;

      const collectLayoutText = (layout: PdfLayoutResultRaw): string => {
        const sorted = [...layout.lines].sort((a, b) => {
          if (a.page !== b.page) return a.page - b.page;
          if (Math.abs(a.bbox.y - b.bbox.y) > 1) return a.bbox.y - b.bbox.y;
          return a.bbox.x - b.bbox.x;
        });
        const byPage = new Map<number, string[]>();
        for (const line of sorted) {
          const text = (line.text ?? "").trim();
          if (!text) continue;
          if (!byPage.has(line.page)) byPage.set(line.page, []);
          byPage.get(line.page)!.push(text);
        }
        return [...byPage.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, lines]) => lines.join("\n"))
          .join("\n\n")
          .trim();
      };

      const fallbackFromRenderedPages = async (): Promise<string> => {
        if (!pdfDoc || pageCount <= 0) return "";
        const OCR_SCALE = 300 / 72;
        const pageImages: string[] = [];
        const pageHeights: number[] = [];

        for (let i = 1; i <= pageCount; i++) {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: OCR_SCALE });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          pageImages.push(canvas.toDataURL("image/png"));
          pageHeights.push(canvas.height);
        }

        if (pageImages.length === 0) return "";

        const layout = await invoke<PdfLayoutResultRaw>("doc_pdf_ocr_layout", {
          id: sessionId,
          lang: langs.join("+"),
          tessdataDir: effectiveTessdataDir,
          pageHeights,
          pageImages,
        });
        return collectLayoutText(layout);
      };

      try {
        const extracted = await invoke<string>("doc_pdf_ocr_extract", {
          id: sessionId,
          lang: langs.join("+"),
          tessdataDir: effectiveTessdataDir,
        });
        if (extracted.trim()) {
          ocrResult = extracted;
        } else {
          throw new Error($t("forge.pdf.error.empty_ocr_result"));
        }
      } catch (directErr) {
        const fallbackText = await fallbackFromRenderedPages();
        if (fallbackText.trim()) {
          ocrResult = fallbackText;
          ocrError = null;
          return;
        }
        throw directErr;
      }
    } catch (err) {
      ocrError = formatError(err);
      ocrResult = "";
    } finally {
      ocrRunning = false;
    }
  }

  let analyzeError = $state<string | null>(null);

  function detectScriptLang(code: number): string | null {
    // Hangul syllables + full Jamo ranges.
    if (
      (code >= 0xAC00 && code <= 0xD7AF)
      || (code >= 0x1100 && code <= 0x11FF)
      || (code >= 0x3130 && code <= 0x318F)
      || (code >= 0xA960 && code <= 0xA97F)
      || (code >= 0xD7B0 && code <= 0xD7FF)
      || (code >= 0xFFA0 && code <= 0xFFDC)
    ) {
      return "kor";
    }
    // Hiragana / Katakana.
    if (
      (code >= 0x3040 && code <= 0x309F)
      || (code >= 0x30A0 && code <= 0x30FF)
      || (code >= 0x31F0 && code <= 0x31FF)
    ) {
      return "jpn";
    }
    // CJK Unified Ideographs + compatibility.
    if (
      (code >= 0x3400 && code <= 0x4DBF)
      || (code >= 0x4E00 && code <= 0x9FFF)
      || (code >= 0xF900 && code <= 0xFAFF)
    ) {
      return "chi_sim";
    }
    // Latin scripts.
    if (
      (code >= 0x0041 && code <= 0x005A)
      || (code >= 0x0061 && code <= 0x007A)
      || (code >= 0x00C0 && code <= 0x024F)
      || (code >= 0x1E00 && code <= 0x1EFF)
    ) {
      return "eng";
    }
    if ((code >= 0x0400 && code <= 0x04FF) || (code >= 0x0500 && code <= 0x052F)) return "rus";
    if ((code >= 0x0600 && code <= 0x06FF) || (code >= 0x0750 && code <= 0x077F) || (code >= 0x08A0 && code <= 0x08FF)) return "ara";
    if (code >= 0x0E00 && code <= 0x0E7F) return "tha";
    if (code >= 0x0900 && code <= 0x097F) return "hin";
    return null;
  }

  function normalizeFontToken(value: string): string {
    return value
      .toLowerCase()
      .replace(/^[a-z]{6}\+/, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function inferLangFromFontName(fontName: string): string | null {
    const token = normalizeFontToken(fontName);
    if (!token) return null;
    const has = (candidates: string[]) => candidates.some((candidate) => token.includes(candidate));
    if (has([
      "malgungothic",
      "applesdgothic",
      "applesdgothicneo",
      "applemyungjo",
      "nanum",
      "gulim",
      "batang",
      "dotum",
      "gungseo",
      "notosanscjkkr",
      "notoserifcjkkr",
      "sourcehansansk",
      "sourcehanserifk",
    ])) {
      return "kor";
    }
    if (has([
      "hiragino",
      "yugothic",
      "yumincho",
      "meiryo",
      "msmincho",
      "msgothic",
      "kozuka",
      "ipam",
      "ipaex",
      "notosanscjkjp",
      "notoserifcjkjp",
      "sourcehansansjp",
      "sourcehanserifjp",
    ])) {
      return "jpn";
    }
    if (has([
      "simsun",
      "simhei",
      "fangsong",
      "kaiti",
      "songti",
      "heiti",
      "notosanscjksc",
      "notoserifcjksc",
      "sourcehansanssc",
      "sourcehanserifsc",
      "notosanscjkcn",
      "notoserifcjkcn",
      "sourcehansanscn",
      "sourcehanserifcn",
    ])) {
      return "chi_sim";
    }
    if (has([
      "mingliu",
      "pmingliu",
      "jhenghei",
      "notosanscjktc",
      "notoserifcjktc",
      "sourcehansanstc",
      "sourcehanseriftc",
      "notosanscjkhk",
      "notoserifcjkhk",
      "sourcehansanshk",
      "sourcehanserifhk",
    ])) {
      return "chi_tra";
    }
    return null;
  }

  /** Detect likely OCR languages from embedded PDF text, if present. */
  async function detectDocumentLanguages(): Promise<LangDetectionResult> {
    if (!pdfDoc) {
      return {
        langs: [],
        source: "noEmbeddedText",
        totalChars: 0,
        rawChars: 0,
        recognizedRatio: 0,
        sampledPages: 0,
        scriptCounts: {},
        fontHints: [],
      };
    }

    const scriptCounts: Record<string, number> = {};
    const fontHints = new Set<string>();
    const seenFonts = new Set<string>();
    const maxPages = Math.min(pageCount, 5);
    let totalChars = 0;
    let rawChars = 0;

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if ("fontName" in item && typeof item.fontName === "string" && item.fontName.length > 0) {
          const fontName = item.fontName;
          const style = textContent.styles?.[fontName];
          const fontFamily = typeof style?.fontFamily === "string" ? style.fontFamily : null;
          const candidates = [fontName, fontFamily].filter((value): value is string => Boolean(value));
          for (const candidate of candidates) {
            const key = normalizeFontToken(candidate);
            if (!key || seenFonts.has(key)) continue;
            seenFonts.add(key);
            const hint = inferLangFromFontName(candidate);
            if (hint) fontHints.add(hint);
          }
        }
        if (!("str" in item) || typeof item.str !== "string" || item.str.length === 0) continue;
        for (const ch of item.str.normalize("NFC")) {
          const code = ch.codePointAt(0);
          if (!code) continue;
          if (/\s/u.test(ch)) continue;
          rawChars += 1;
          const lang = detectScriptLang(code);
          if (!lang) continue;
          scriptCounts[lang] = (scriptCounts[lang] ?? 0) + 1;
          totalChars += 1;
        }
      }
    }

    if (rawChars === 0 || totalChars === 0) {
      return {
        langs: [],
        source: "noEmbeddedText",
        totalChars,
        rawChars,
        recognizedRatio: 0,
        sampledPages: maxPages,
        scriptCounts,
        fontHints: [...fontHints],
      };
    }

    const recognizedRatio = totalChars / rawChars;
    const ranked = Object.entries(scriptCounts).sort((a, b) => b[1] - a[1]);
    let detected: string[] = [];
    for (const [lang, count] of ranked) {
      const ratio = count / totalChars;
      if (lang === "eng") {
        if (count >= 14 || ratio >= 0.28) detected.push(lang);
        continue;
      }
      // Keep non-Latin thresholds lower to preserve minority language hints.
      if (count >= 4 || ratio >= 0.025) detected.push(lang);
    }

    // If Hangul appears at all, include Korean explicitly.
    if ((scriptCounts.kor ?? 0) >= 1 && !detected.includes("kor")) {
      detected.push("kor");
    }

    const nonLatinChars = totalChars - (scriptCounts.eng ?? 0);
    const weakSignal = totalChars < 24 || recognizedRatio < 0.35;
    if (weakSignal && nonLatinChars === 0 && detected.length === 1 && detected[0] === "eng") {
      // Typical for sparse/noisy hidden text layers; avoid misleading "Detected: eng".
      detected = [];
    }

    if (!weakSignal && detected.length === 0 && ranked.length > 0 && ranked[0][1] >= 8) {
      detected = [ranked[0][0]];
    }

    const detectedFromScripts = new Set(detected);
    const addedFontHints = [...fontHints].filter((hint) => !detectedFromScripts.has(hint));
    if (addedFontHints.length > 0) {
      detected = [...detected, ...addedFontHints];
    }

    const englishOnly = detectedFromScripts.size === 1 && detectedFromScripts.has("eng");
    const usedFontHints = addedFontHints.length > 0;

    return {
      langs: detected,
      source: weakSignal || (usedFontHints && (detectedFromScripts.size === 0 || englishOnly))
        ? "weakEmbeddedText"
        : "embeddedText",
      totalChars,
      rawChars,
      recognizedRatio,
      sampledPages: maxPages,
      scriptCounts,
      fontHints: [...fontHints],
    };
  }

  function canTrustEmbeddedText(langDetection: LangDetectionResult): boolean {
    const englishOnly = langDetection.langs.length === 1 && langDetection.langs[0] === "eng";
    if (englishOnly && langDetection.fontHints.length > 0) return false;
    if (langDetection.source === "embeddedText") return true;
    if (langDetection.source === "noEmbeddedText") return false;
    return langDetection.totalChars >= 120 && langDetection.recognizedRatio >= 0.5;
  }

  /** Build layout directly from pdf.js text content (no tesseract needed).
   *  Returns true if successful (enough text found), false to fall back to OCR. */
  async function tryBuildLayoutFromPdfJs(langDetection: LangDetectionResult): Promise<boolean> {
    if (!pdfDoc) return false;
    if (!canTrustEmbeddedText(langDetection)) return false;

    const OCR_SCALE = TESSERACT_DPI / 72;
    let totalChars = 0;

    // First pass: check if PDF has enough embedded text
    for (let i = 1; i <= Math.min(pageCount, 3); i++) {
      const page = await pdfDoc.getPage(i);
      const tc = await page.getTextContent();
      for (const item of tc.items) {
        if ("str" in item && item.str) totalChars += item.str.length;
      }
    }

    // If very little text, this is probably a scanned PDF → need OCR
    if (totalChars < 20) return false;

    // Build word/line/block layout from pdf.js text items
    const words: Record<string, import("$lib/types/pdfEditor").PdfWord> = {};
    const lines: Record<string, import("$lib/types/pdfEditor").PdfLine> = {};
    const blocks: Record<string, import("$lib/types/pdfEditor").PdfBlock> = {};
    let wordIdx = 0;
    let lineIdx = 0;
    let blockIdx = 0;

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfDoc.getPage(i);
      const tc = await page.getTextContent();
      const vp = page.getViewport({ scale: 1 });
      const genericFamilies = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);
      const pageNum = i;

      // Collect text items as words (in PDF point coordinates, converted to 300 DPI pixel coords)
      type WordItem = { id: string; x: number; y: number; w: number; h: number; text: string; fontName: string };
      const pageWords: WordItem[] = [];

      for (const item of tc.items) {
        if (!("str" in item) || !item.str?.trim()) continue;
        const tx = item.transform[4]; // x in PDF points (bottom-left origin)
        const ty = item.transform[5]; // y in PDF points (bottom-left origin)
        const tw = item.width ?? 0;
        const th = item.height ?? (Math.abs(item.transform[3]) || 12);

        // Convert from PDF coords (bottom-left origin) to top-left origin, then scale to 300 DPI
        const topY = vp.height - ty;
        const x = tx * OCR_SCALE;
        const y = (topY - th) * OCR_SCALE;
        const w = tw * OCR_SCALE;
        const h = th * OCR_SCALE;

        if (w <= 0 || h <= 0) continue;

        const wid = `w-${pageNum}-${wordIdx}`;
        wordIdx++;
        pageWords.push({ id: wid, x, y, w, h, text: item.str, fontName: item.fontName ?? "" });
        words[wid] = { id: wid, page: pageNum, text: item.str, bbox: { x, y, w, h }, conf: 100 };
      }

      if (pageWords.length === 0) continue;

      // Group words into lines (same y-band, vertical overlap > 50%)
      pageWords.sort((a, b) => a.y - b.y);
      const lineGroups: WordItem[][] = [];
      let curLine: WordItem[] = [pageWords[0]];

      for (let j = 1; j < pageWords.length; j++) {
        const word = pageWords[j];
        const prev = curLine[curLine.length - 1];
        const overlapStart = Math.max(prev.y, word.y);
        const overlapEnd = Math.min(prev.y + prev.h, word.y + word.h);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        const minH = Math.min(prev.h, word.h);
        if (minH > 0 && overlap / minH > 0.5) {
          curLine.push(word);
        } else {
          lineGroups.push(curLine);
          curLine = [word];
        }
      }
      lineGroups.push(curLine);

      // Split lines at large horizontal gaps (table columns).
      // Use character-width-aware thresholds instead of median-gap scaling,
      // because table rows often have consistently large gaps that should all split.
      const allWordHeights = pageWords.map((w) => w.h).sort((a, b) => a - b);
      const medianWordH = allWordHeights[Math.floor(allWordHeights.length / 2)] || 20;

      const splitLines: WordItem[][] = [];
      for (const lineWords of lineGroups) {
        lineWords.sort((a, b) => a.x - b.x);
        if (lineWords.length < 2) {
          splitLines.push(lineWords);
          continue;
        }
        const charUnits = lineWords.map((w) => {
          const chars = Math.max(1, Array.from(w.text || "").length);
          return Math.max(1, w.w / chars);
        });
        const gaps: number[] = [];
        for (let j = 1; j < lineWords.length; j++) {
          gaps.push(Math.max(0, lineWords[j].x - (lineWords[j - 1].x + lineWords[j - 1].w)));
        }
        const sortedGaps = [...gaps].sort((a, b) => a - b);
        const q25Idx = Math.floor((sortedGaps.length - 1) * 0.25);
        const gapP25 = sortedGaps[Math.max(0, q25Idx)] ?? 0;
        const lineThreshold = Math.max(medianWordH * 0.6, gapP25 * 2.4);
        const allLargeTableGaps = sortedGaps.length >= 2 && sortedGaps[0] > medianWordH * 0.9;

        let seg: WordItem[] = [lineWords[0]];
        for (let j = 1; j < lineWords.length; j++) {
          const localCharThreshold = Math.min(charUnits[j - 1], charUnits[j]) * 2.6;
          const threshold = allLargeTableGaps
            ? Math.max(medianWordH * 0.75, Math.min(charUnits[j - 1], charUnits[j]) * 1.8)
            : Math.max(lineThreshold, localCharThreshold);
          if (gaps[j - 1] > threshold) {
            splitLines.push(seg);
            seg = [lineWords[j]];
          } else {
            seg.push(lineWords[j]);
          }
        }
        splitLines.push(seg);
      }

      // Convert line groups to PdfLine
      const pageLineObjs: Array<{ id: string; bbox: import("$lib/types/pdfEditor").BBox; fontSize: number; y: number; h: number; x: number }> = [];
      const rowBuckets = new Map<number, number>();
      const rowBand = Math.max(12, medianWordH * 0.8);

      for (const seg of splitLines) {
        const lid = `l-${pageNum}-${lineIdx}`;
        lineIdx++;
        const minX = Math.min(...seg.map((w) => w.x));
        const maxX = Math.max(...seg.map((w) => w.x + w.w));
        const minY = Math.min(...seg.map((w) => w.y));
        const maxY = Math.max(...seg.map((w) => w.y + w.h));
        const lh = maxY - minY;
        const text = composeSegmentText(seg);
        if (!text) continue;

        lines[lid] = {
          id: lid,
          page: pageNum,
          wordIds: seg.map((w) => w.id),
          bbox: { x: minX, y: minY, w: maxX - minX, h: lh },
          text,
          fontSize: lh * 0.85,
        };
        pageLineObjs.push({ id: lid, bbox: lines[lid].bbox, fontSize: lines[lid].fontSize, y: minY, h: lh, x: minX });
        const rowKey = Math.round(minY / rowBand);
        rowBuckets.set(rowKey, (rowBuckets.get(rowKey) ?? 0) + 1);
      }

      // Group lines into blocks.
      // For dense multi-column pages (table-like), keep each line as its own block.
      pageLineObjs.sort((a, b) => a.y - b.y);
      const blockGroups: string[][] = [];

      const rowSegmentCounts = [...rowBuckets.values()];
      const avgSegmentsPerRow = rowSegmentCounts.length > 0
        ? rowSegmentCounts.reduce((acc, count) => acc + count, 0) / rowSegmentCounts.length
        : 1;
      const denseRowRatio = rowSegmentCounts.length > 0
        ? rowSegmentCounts.filter((count) => count >= 3).length / rowSegmentCounts.length
        : 0;
      const tableLike = rowSegmentCounts.length >= 3 && (avgSegmentsPerRow >= 2.2 || denseRowRatio >= 0.35);

      if (tableLike) {
        for (const line of pageLineObjs) {
          blockGroups.push([line.id]);
        }
      } else {
        const lineHeights = pageLineObjs.map((l) => l.h).sort((a, b) => a - b);
        const medianLineH = lineHeights[Math.floor(lineHeights.length / 2)] || 20;
        const pageWidth = Math.max(...pageLineObjs.map((l) => l.x + (lines[l.id].bbox.w ?? 0)), 1);
        const vGapThreshold = 0.5 * medianLineH;
        const xShiftThreshold = pageWidth * 0.15;

        let curBlock: string[] = [pageLineObjs[0]?.id].filter(Boolean);

        for (let j = 1; j < pageLineObjs.length; j++) {
          const line = pageLineObjs[j];
          const prevLine = pageLineObjs[j - 1];
          const gap = line.y - (prevLine.y + prevLine.h);
          const firstIdx = curBlock.length > 0 ? j - curBlock.length : 0;
          const xShift = Math.abs(line.x - (pageLineObjs[firstIdx]?.x ?? 0));
          const hRatio = prevLine.h > 0 ? Math.abs(line.h - prevLine.h) / prevLine.h : 0;

          if (gap > vGapThreshold || xShift > xShiftThreshold || hRatio > 0.35 || curBlock.length >= 4) {
            if (curBlock.length > 0) blockGroups.push(curBlock);
            curBlock = [line.id];
          } else {
            curBlock.push(line.id);
          }
        }
        if (curBlock.length > 0) blockGroups.push(curBlock);
      }

      // Convert block groups to PdfBlock
      for (const group of blockGroups) {
        const bid = `b-${pageNum}-${blockIdx}`;
        blockIdx++;
        const groupLines = group.map((lid) => lines[lid]).filter(Boolean);
        if (groupLines.length === 0) continue;
        const minX = Math.min(...groupLines.map((l) => l.bbox.x));
        const maxX = Math.max(...groupLines.map((l) => l.bbox.x + l.bbox.w));
        const minY = Math.min(...groupLines.map((l) => l.bbox.y));
        const maxY = Math.max(...groupLines.map((l) => l.bbox.y + l.bbox.h));
        const fontSizes = groupLines.map((l) => l.fontSize).sort((a, b) => a - b);
        const blockFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12;
        const text = groupLines.map((l) => l.text).join("\n");

        blocks[bid] = {
          id: bid,
          page: pageNum,
          kind: "paragraph",
          lineIds: group,
          bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
          text,
          fontSize: blockFontSize,
        };
      }
    }

    if (Object.keys(blocks).length === 0) return false;

    // Load directly into the store
    store.loadLayout({
      pages: pageCount,
      // Blocks are normalized into OCR pixel coordinates (300 DPI),
      // so export conversion must use heights from the same coordinate space.
      pageHeights: pageViewports.map((vp) => vp.height * OCR_SCALE),
      words,
      lines,
      blocks,
    });
    return true;
  }

  async function analyze(): Promise<void> {
    if (!pdfDoc || pageViewports.length === 0) return;
    ocrError = null;
    analyzeError = null;
    analysisRunning = true;
    showAnalysisBannerNow();
    analysisStatus = $t("forge.pdf.analysis.checking_embedded");
    analysisMethod = "idle";
    analysisMethodNote = $t("forge.pdf.analysis.preparing");
    autoDetectedLangs = [];
    detectedLangSource = null;
    lastLangDetection = null;
    try {
      const langDetection = await detectDocumentLanguages();
      lastLangDetection = langDetection;
      autoDetectedLangs = langDetection.langs;
      detectedLangSource = langDetection.source;

      // First: try building layout from pdf.js embedded text (fast, accurate for text PDFs)
      analysisStatus = $t("forge.pdf.analysis.building_layout_embedded");
      const builtFromPdfJs = await tryBuildLayoutFromPdfJs(langDetection);

      if (builtFromPdfJs) {
        analysisMethod = "pdfjsText";
        analysisMethodNote = $t("forge.pdf.analysis.layout_ready_embedded");
        if (langDetection.source === "embeddedText" || langDetection.source === "weakEmbeddedText") {
          analysisStatus = tr("forge.pdf.analysis.detected_embedded_detail", {
            total: langDetection.totalChars,
            raw: langDetection.rawChars,
            ratio: Math.round(langDetection.recognizedRatio * 100),
          });
        } else {
          analysisStatus = $t("forge.pdf.analysis.layout_built_embedded");
        }
        // Even in pdf.js mode, keep user's OCR language selection visible to avoid "Detected: eng" confusion.
        effectiveOcrLangs = ensureCoreOcrLangs(mergeLangs(selectedLangs, autoDetectedLangs));

        // Successfully built from pdf.js text content — detect fonts and bg colors
        // Render canvases for bg color sampling
        const OCR_SCALE = 300 / 72;
        const ocrCanvases: HTMLCanvasElement[] = [];
        for (let i = 1; i <= pageCount; i++) {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: OCR_SCALE });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
          }
          ocrCanvases.push(canvas);
        }
        store.sampleBlockBgColors(ocrCanvases);
        await detectFonts();
        editorMode = "select";
        return;
      }

      // Fallback: use tesseract OCR for scanned/image PDFs
      analysisMethod = "tesseractOcr";
      analysisMethodNote = $t("forge.pdf.analysis.fallback_note");
      if (langDetection.source === "noEmbeddedText") {
        analysisStatus = $t("forge.pdf.analysis.no_embedded_use_ocr");
      } else if (langDetection.source === "weakEmbeddedText") {
        analysisStatus = langDetection.fontHints.length > 0
          ? $t("forge.pdf.analysis.weak_embedded_with_hint")
          : $t("forge.pdf.analysis.weak_embedded");
      } else {
        analysisStatus = $t("forge.pdf.analysis.insufficient_embedded");
      }

      // Merge auto-detected with user-selected languages
      const allLangs = ensureCoreOcrLangs(mergeLangs(selectedLangs, langDetection.langs));
      ocrLang = allLangs.join("+");
      effectiveOcrLangs = allLangs;

      // Auto-download missing tessdata files
      analysisStatus = tr("forge.pdf.analysis.checking_lang_data", {
        langs: allLangs.join(", "),
      });
      let autoTessdataDir: string | undefined;
      try {
        autoTessdataDir = await invoke<string>("doc_ocr_ensure_langs", { langs: allLangs });
        analysisStatus = tr("forge.pdf.analysis.ready_langs", {
          langs: allLangs.join(" + "),
        });
      } catch (dlErr) {
        // Non-fatal: continue with whatever tessdata is available
        console.warn("Auto-download tessdata failed:", dlErr);
        analysisStatus = tr("forge.pdf.analysis.partial_lang_download", {
          langs: allLangs.join(" + "),
        });
      }

      const effectiveTessdataDir = tessdataDir.trim().length > 0
        ? tessdataDir.trim()
        : autoTessdataDir ?? undefined;

      // Render each page at 300 DPI for OCR
      const OCR_SCALE = 300 / 72; // 300 DPI / 72 PDF points per inch
      const pageImages: string[] = [];
      const ocrCanvases: HTMLCanvasElement[] = [];

      for (let i = 1; i <= pageCount; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: OCR_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error(tr("forge.pdf.error.canvas_context", { page: i }));
        await page.render({ canvasContext: ctx, viewport }).promise;
        pageImages.push(canvas.toDataURL("image/png"));
        ocrCanvases.push(canvas);
      }

      await store.analyzePages(
        sessionId,
        // OCR engine returns block coordinates in 300 DPI pixel space.
        // Keep pageHeights in the same space for stable PDF export mapping.
        ocrCanvases.map((canvas) => canvas.height),
        pageImages,
        ocrLang,
        effectiveTessdataDir,
      );
      analysisStatus = tr("forge.pdf.analysis.layout_done", { pages: pageCount });

      // Sample background colors from rendered canvases
      store.sampleBlockBgColors(ocrCanvases);

      // Detect font names via pdf.js getTextContent
      await detectFonts();

      editorMode = "select";
    } catch (err) {
      const msg = formatError(err);
      ocrError = msg;
      analyzeError = msg;
      analysisMethod = "idle";
      analysisMethodNote = $t("forge.pdf.analysis.failed_note");
      analysisStatus = $t("forge.pdf.analysis.failed_status");
    } finally {
      analysisRunning = false;
      hideAnalysisBannerSoon(analyzeError ? 2200 : 1400);
    }
  }

  /** Detect fonts by matching pdf.js text items to OCR block bboxes */
  async function detectFonts(): Promise<void> {
    if (!pdfDoc || !store.docState) return;
    const ds = store.docState;
    const genericFamilies = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const vp = page.getViewport({ scale: 1 });

      // Collect page blocks
      const pageBlocks = Object.values(ds.blocks).filter((b) => b.page === i);
      if (pageBlocks.length === 0) continue;

      // For each block, find overlapping text items and pick most common font
      const OCR_SCALE = 300 / 72;
      for (const block of pageBlocks) {
        // Block bbox is in OCR pixel coords (300 DPI). Convert to PDF points for matching.
        const bx1 = block.bbox.x / OCR_SCALE;
        const by1 = block.bbox.y / OCR_SCALE;
        const bx2 = bx1 + block.bbox.w / OCR_SCALE;
        const by2 = by1 + block.bbox.h / OCR_SCALE;

        const fontCounts: Record<string, number> = {};
        for (const item of textContent.items) {
          if (!("transform" in item) || !item.str) continue;
          const tx = item.transform[4];
          // pdf.js transform y is from bottom, convert to top-origin
          const ty = vp.height - item.transform[5];
          const tw = item.width ?? 0;
          const th = item.height ?? 0;

          // Check overlap
          const ix1 = Math.max(bx1, tx);
          const iy1 = Math.max(by1, ty - th);
          const ix2 = Math.min(bx2, tx + tw);
          const iy2 = Math.min(by2, ty);
          if (ix1 < ix2 && iy1 < iy2) {
            const pdfJsFontName = item.fontName ?? "unknown";
            const style = textContent.styles?.[pdfJsFontName];
            const family = typeof style?.fontFamily === "string" ? style.fontFamily.trim() : "";
            const preferredFontName = family.length > 0 && !genericFamilies.has(family.toLowerCase())
              ? family
              : pdfJsFontName;
            fontCounts[preferredFontName] = (fontCounts[preferredFontName] ?? 0) + item.str.length;
          }
        }

        // Pick the most common font
        let bestFont = "";
        let bestCount = 0;
        for (const [font, count] of Object.entries(fontCounts)) {
          if (count > bestCount) {
            bestCount = count;
            bestFont = font;
          }
        }
        if (bestFont) {
          store.setBlockFontName(block.id, bestFont);
        }
      }
    }
  }

  onMount(() => {
    void loadPdf();
    // Restore saved language selection from localStorage
    try {
      const saved = localStorage.getItem("openclaw-ocr-langs");
      if (saved) {
        const langs = JSON.parse(saved) as string[];
        if (Array.isArray(langs) && langs.length > 0) {
          setSelectedLangs(new Set(langs));
        }
      }
    } catch {}
    // Load available tesseract languages
    invoke<string[]>("doc_ocr_list_langs")
      .then((langs) => {
        const merged = new Set(langs);
        merged.add("kor");
        merged.add("eng");
        availableLangs = [...merged];
      })
      .catch(() => { /* tesseract not available, keep text input fallback */ });
  });

  onDestroy(() => {
    renderToken += 1;
    thumbnailRenderToken += 1;
    clearAnalysisBannerTimers();
    cleanupToolbarIcons();
    if (zoomRenderTimer) {
      clearTimeout(zoomRenderTimer);
      zoomRenderTimer = null;
    }
    if (zoomTransitionTimer) {
      clearTimeout(zoomTransitionTimer);
      zoomTransitionTimer = null;
    }
    if (pdfDoc?.destroy) void pdfDoc.destroy();
    pdfDoc = null;
    store.reset();
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="pdf-viewer">
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="tool-btn" onclick={zoomOut} title={$t("forge.pdf.toolbar.zoom_out")}><ZoomOut size={16} /></button>
      <button class="tool-btn" onclick={zoomIn} title={$t("forge.pdf.toolbar.zoom_in")}><ZoomIn size={16} /></button>
      <span class="meta">{tr("forge.pdf.toolbar.meta", { zoom: Math.round(zoom * 100), pages: pageCount })}</span>
    </div>

    <div class="toolbar-center">
      {#if hasLayout}
        <button class="tool-btn" class:active={editorMode === "select"} onclick={() => (editorMode = "select")} title={$t("forge.pdf.toolbar.mode_select")}>
          <MousePointer size={16} />
        </button>
      {/if}
      <button class="tool-btn" class:active={editorMode === "highlight"} onclick={() => setModeWithInit("highlight")} title={$t("forge.pdf.toolbar.mode_highlight")}>
        <Highlighter size={16} />
      </button>
      <button class="tool-btn" class:active={editorMode === "comment"} onclick={() => setModeWithInit("comment")} title={$t("forge.pdf.toolbar.mode_comment")}>
        <MessageSquareText size={16} />
      </button>
      <button class="tool-btn" class:active={editorMode === "insertText"} onclick={() => setModeWithInit("insertText")} title={$t("forge.pdf.toolbar.mode_insert_text")}>
        <Type size={16} />
      </button>
      <div class="toolbar-divider"></div>
      <button class="tool-btn" onclick={() => store.undoOp()} disabled={!store.canUndo} title={$t("forge.pdf.toolbar.undo")}><Undo size={16} /></button>
      <button class="tool-btn" onclick={() => store.redoOp()} disabled={!store.canRedo} title={$t("forge.pdf.toolbar.redo")}><Redo size={16} /></button>
    </div>

    <div class="toolbar-right">
      <button class="tool-btn" class:active={isAnalyzing} onclick={analyze} disabled={isAnalyzing || isLoading} title={$t("forge.pdf.toolbar.analyze_layout")}>
        {#if isAnalyzing}<Loader2 size={16} class="spin" />{:else}<Sparkles size={16} />{/if}
      </button>
      <button class="tool-btn" onclick={() => (showOcrSettings = !showOcrSettings)} title={$t("forge.pdf.toolbar.ocr_settings")}><SlidersHorizontal size={16} /></button>
      <button class="tool-btn" onclick={runOcr} disabled={ocrRunning} title={$t("forge.pdf.toolbar.ocr_extract")}>
        {#if ocrRunning}<Loader2 size={16} class="spin" />{:else}<ScanText size={16} />{/if}
      </button>
      <button class="tool-btn" onclick={loadPdf} title={$t("forge.pdf.toolbar.reload")}><RefreshCw size={16} /></button>
      <button class="tool-btn" onclick={() => (showOcrPanel = !showOcrPanel)} title={$t("forge.pdf.toolbar.toggle_panel")}>
        {#if showOcrPanel}<PanelRightClose size={16} />{:else}<PanelRightOpen size={16} />{/if}
      </button>
    </div>
  </div>

  {#if showOcrSettings}
    <div class="ocr-settings">
      <div class="ocr-settings-head">
        <div>
          <div class="ocr-settings-title">{$t("forge.pdf.ocr.settings_title")}</div>
          <div class="ocr-settings-subtitle">{$t("forge.pdf.ocr.settings_subtitle")}</div>
        </div>
        <div class="method-pill" class:pdfjs={analysisMethod === "pdfjsText"} class:tesseract={analysisMethod === "tesseractOcr"}>
          {methodLabel(analysisMethod)}
        </div>
      </div>

      <div class="ocr-section">
        <div class="ocr-section-title">{$t("forge.pdf.ocr.language_title")}</div>
        <div class="ocr-quick-presets">
          <button class="preset-btn" type="button" onclick={() => applyLangPreset(["kor", "eng"])}>{$t("forge.pdf.ocr.preset_ko_en")}</button>
          <button class="preset-btn" type="button" onclick={() => applyLangPreset(["eng"])}>{$t("forge.pdf.ocr.preset_en")}</button>
          <button class="preset-btn" type="button" onclick={() => applyLangPreset(["jpn", "eng"])}>{$t("forge.pdf.ocr.preset_ja_en")}</button>
        </div>

        <div class="ocr-langs-meta">
          <div class="ocr-langs-meta-item">
            <span class="ocr-settings-label">{$t("forge.pdf.ocr.user_selected")}</span>
            <span class="ocr-meta-value">{[...selectedLangs].map((lang) => langLabel(lang)).join(", ")}</span>
          </div>
          <div class="ocr-langs-meta-item">
            <span class="ocr-settings-label">{$t("forge.pdf.ocr.auto_detected")}</span>
            <span class="ocr-meta-value">
              {#if detectedLangSource === "embeddedText" || detectedLangSource === "weakEmbeddedText"}
                {autoDetectedLangs.length > 0 ? autoDetectedLangs.map((lang) => langLabel(lang)).join(", ") : $t("forge.pdf.ocr.auto_no_signal")}
              {:else if detectedLangSource === "noEmbeddedText"}
                {$t("forge.pdf.ocr.auto_no_embedded")}
              {:else}
                {$t("forge.pdf.ocr.auto_not_analyzed")}
              {/if}
            </span>
            {#if lastLangDetection}
              <small class="ocr-meta-sub">
                {tr("forge.pdf.ocr.sample_meta", {
                  source: sourceLabel(lastLangDetection.source),
                  total: lastLangDetection.totalChars,
                  raw: lastLangDetection.rawChars,
                  ratio: Math.round(lastLangDetection.recognizedRatio * 100),
                })}
              </small>
              <small class="ocr-meta-sub">{scriptSummary(lastLangDetection.scriptCounts)}</small>
              {#if lastLangDetection.fontHints.length > 0}
                <small class="ocr-meta-sub">{fontHintSummary(lastLangDetection.fontHints)}</small>
              {/if}
            {/if}
          </div>
          <div class="ocr-langs-meta-item">
            <span class="ocr-settings-label">{$t("forge.pdf.ocr.run_lang")}</span>
            <span class="ocr-meta-value">{effectiveOcrLangs.map((lang) => langLabel(lang)).join(", ") || $t("forge.pdf.none")}</span>
            <small class="ocr-meta-sub">{tr("forge.pdf.ocr.code_prefix", { codes: effectiveOcrLangs.join(" + ") || ocrLang || "eng" })}</small>
          </div>
        </div>

        {#if availableLangs.length > 0}
          <div class="lang-select-section">
            <span class="ocr-settings-label">{$t("forge.pdf.ocr.lang_list")}</span>
            <div class="lang-checkboxes">
              {#each orderedAvailableLangs() as lang}
                <label class="lang-checkbox" class:priority={PRIORITY_LANGS.includes(lang)} class:selected={selectedLangs.has(lang)}>
                  <input type="checkbox" checked={selectedLangs.has(lang)} onchange={() => toggleLang(lang)} />
                  <span>{langLabel(lang)}</span>
                  <small>{lang}</small>
                </label>
              {/each}
            </div>
          </div>
        {:else}
          <label class="ocr-field">
            {$t("forge.pdf.ocr.lang_code")}
            <input type="text" bind:value={ocrLang} placeholder={$t("forge.pdf.ocr.lang_code_placeholder")} />
          </label>
        {/if}
      </div>

      <div class="ocr-section">
        <div class="ocr-section-title">{$t("forge.pdf.ocr.tessdata_title")}</div>
        <label class="ocr-field">
          {$t("forge.pdf.ocr.tessdata_path")}
          <input type="text" bind:value={tessdataDir} placeholder={$t("forge.pdf.ocr.tessdata_placeholder")} />
        </label>
      </div>

      {#if editorMode === "highlight"}
        <div class="ocr-section">
          <div class="ocr-section-title">{$t("forge.pdf.ocr.highlight_title")}</div>
          <label class="ocr-field">
            {$t("forge.pdf.ocr.highlight_color")}
            <input type="color" bind:value={highlightColor} />
          </label>
        </div>
      {/if}
    </div>
  {/if}

  {#if showAnalysisBanner && (analysisStatus || analysisMethod !== "idle")}
    <div class="analysis-status-banner" class:running={isAnalyzing} class:closing={analysisBannerClosing}>
      {#if isAnalyzing}
        <Loader2 size={14} class="spin" />
      {/if}
      <div class="analysis-status-copy">
        <span class="analysis-status-label">{$t("forge.pdf.analysis.status_label")}</span>
        <strong>{methodLabel(analysisMethod)}</strong>
        <span>{analysisStatus || analysisMethodNote}</span>
        {#if lastLangDetection}
          <span class="analysis-detected">{tr("forge.pdf.analysis.auto_detect_basis", { summary: scriptSummary(lastLangDetection.scriptCounts) })}</span>
          {#if lastLangDetection.fontHints.length > 0}
            <span class="analysis-detected">{fontHintSummary(lastLangDetection.fontHints)}</span>
          {/if}
        {/if}
      </div>
      <div class="analysis-used-langs">
        {tr("forge.pdf.analysis.run_lang", { langs: effectiveOcrLangs.join(" + ") || ocrLang || "eng" })}
        {#if detectedLangSource}
          <small>{sourceLabel(detectedLangSource)}</small>
        {/if}
      </div>
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
    <aside class="page-sidebar" aria-label={$t("forge.pdf.sidebar.aria")}>
      <div class="page-sidebar-scroll">
        {#each pageThumbnails as thumb}
          <button
            type="button"
            class="thumb-item"
            class:active={activePage === thumb.page}
            title={tr("forge.pdf.sidebar.page_title", { page: thumb.page })}
            onclick={() => scrollToPage(thumb.page)}
          >
            <div class="thumb-sheet">
              {#if thumb.dataUrl}
                <img src={thumb.dataUrl} alt={tr("forge.pdf.sidebar.page_preview_alt", { page: thumb.page })} />
              {:else}
                <div class="thumb-placeholder"></div>
              {/if}
            </div>
            <span class="thumb-index">{thumb.page}</span>
          </button>
        {/each}
      </div>
    </aside>

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pdf-canvas-area"
      class:mode-highlight={editorMode === "highlight"}
      class:mode-comment={editorMode === "comment"}
      class:mode-insert={editorMode === "insertText"}
      bind:this={canvasAreaEl}
      onscroll={handleCanvasScroll}
      onclick={handleCanvasAreaClick}
      onmousedown={handleCanvasAreaMouseDown}
    >
      {#if error}
        <div class="error-state">
          <AlertCircle size={28} />
          <p>{error}</p>
        </div>
      {:else}
        <div class="pages" class:zoom-transitioning={zoomTransitioning} bind:this={pagesContainer}></div>
        {#if isLoading}
          <div class="loading-overlay">
            <Loader2 size={26} class="spin" />
            <span>{$t("forge.pdf.loading_render")}</span>
          </div>
        {/if}
      {/if}
    </div>

    {#if showOcrPanel}
      <aside class="ocr-panel">
        <div class="ocr-header">
          <ScanText size={16} />
          <span>{$t("forge.pdf.ocr_text_title")}</span>
        </div>
        {#if ocrError}
          <div class="ocr-error">{ocrError}</div>
        {/if}
        {#if ocrResult}
          <pre>{ocrResult}</pre>
        {:else if !ocrRunning}
          <div class="ocr-placeholder">{$t("forge.pdf.ocr_placeholder")}</div>
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

  .meta {
    margin-left: 6px;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  /* ── OCR settings ──────────────────────────────────────────── */

  .analysis-status-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    background: rgba(99, 102, 241, 0.08);
    border-bottom: 1px solid rgba(99, 102, 241, 0.2);
    color: var(--color-text);
    font-size: 12px;
    opacity: 1;
    transform: translateY(0);
    max-height: 120px;
    overflow: hidden;
    transition:
      opacity 220ms ease,
      transform 220ms ease,
      max-height 220ms ease,
      padding 220ms ease,
      border-bottom-color 220ms ease;
  }

  .analysis-status-banner.running {
    background: rgba(59, 130, 246, 0.12);
    border-bottom-color: rgba(59, 130, 246, 0.28);
  }

  .analysis-status-banner.closing {
    opacity: 0;
    transform: translateY(-6px);
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    border-bottom-color: transparent;
    pointer-events: none;
  }

  .analysis-status-copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .analysis-status-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .analysis-status-copy strong {
    color: var(--color-primary);
    font-size: 12px;
  }

  .analysis-detected {
    margin-top: 1px;
    font-size: 10px;
    color: var(--color-text-muted);
    line-height: 1.35;
  }

  .analysis-used-langs {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 11px;
    color: var(--color-primary);
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.25);
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
  }

  .analysis-used-langs small {
    margin-top: 2px;
    font-size: 10px;
    color: var(--color-text-muted);
    font-family: inherit;
  }

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
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-surface) 80%, #0f172a);
  }

  .ocr-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .ocr-section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .ocr-settings-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  .ocr-settings-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text);
  }

  .ocr-settings-subtitle {
    margin-top: 2px;
    font-size: 11px;
    color: var(--color-text-muted);
    line-height: 1.4;
    max-width: 640px;
  }

  .method-pill {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text);
    background: var(--color-surface);
    white-space: nowrap;
  }

  .method-pill.pdfjs {
    border-color: rgba(16, 185, 129, 0.35);
    background: rgba(16, 185, 129, 0.12);
    color: #34d399;
  }

  .method-pill.tesseract {
    border-color: rgba(59, 130, 246, 0.35);
    background: rgba(59, 130, 246, 0.12);
    color: #60a5fa;
  }

  .ocr-quick-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .preset-btn {
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    color: var(--color-text);
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .preset-btn:hover {
    background: var(--color-surface-hover);
    border-color: rgba(99, 102, 241, 0.35);
  }

  .ocr-langs-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
  }

  .ocr-langs-meta-item {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 8px;
    background: var(--color-surface-elevated);
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .ocr-meta-value {
    font-size: 12px;
    color: var(--color-text);
    line-height: 1.4;
    word-break: break-word;
  }

  .ocr-meta-sub {
    color: var(--color-text-muted);
    font-size: 10px;
    line-height: 1.35;
  }

  .ocr-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .ocr-field input[type="text"] {
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    padding: 6px 8px;
    font-size: 12px;
  }

  .ocr-field input[type="color"] {
    height: 28px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
  }

  .ocr-settings-label {
    font-size: 10px;
    color: var(--color-text-muted);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .lang-select-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .lang-checkboxes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px;
  }

  .lang-checkbox {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 8px;
    row-gap: 2px;
    align-items: center;
    font-size: 11px;
    color: var(--color-text);
    cursor: pointer;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    min-width: 0;
  }

  .lang-checkbox:hover {
    background: var(--color-surface-hover);
    border-color: rgba(99, 102, 241, 0.35);
  }

  .lang-checkbox.selected {
    border-color: rgba(99, 102, 241, 0.4);
    background: rgba(99, 102, 241, 0.1);
  }

  .lang-checkbox.priority span {
    font-weight: 600;
  }

  .lang-checkbox span {
    grid-column: 2;
    grid-row: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lang-checkbox small {
    grid-column: 2;
    grid-row: 2;
    color: var(--color-text-muted);
    font-size: 10px;
    line-height: 1;
  }

  @media (max-width: 850px) {
    .analysis-status-banner {
      align-items: flex-start;
      flex-direction: column;
    }

    .analysis-used-langs {
      align-items: flex-start;
      white-space: normal;
    }
  }

  .lang-checkbox input[type="checkbox"] {
    grid-column: 1;
    grid-row: 1 / span 2;
    width: 14px;
    height: 14px;
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  /* ── Viewer body ───────────────────────────────────────────── */

  .viewer-body {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .page-sidebar {
    width: 114px;
    flex-shrink: 0;
    border-right: 1px solid var(--color-border);
    background: linear-gradient(180deg, #e5e7eb 0%, #dbe2ea 100%);
    padding: 8px 6px;
    display: flex;
    min-height: 0;
  }

  .page-sidebar-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 2px;
  }

  .thumb-item {
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    padding: 5px 4px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    color: #334155;
    cursor: pointer;
    transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
  }

  .thumb-item:hover {
    background: rgba(148, 163, 184, 0.18);
    border-color: rgba(100, 116, 139, 0.22);
  }

  .thumb-item.active {
    background: rgba(59, 130, 246, 0.16);
    border-color: rgba(59, 130, 246, 0.42);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2) inset;
  }

  .thumb-sheet {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    overflow: hidden;
    background: #ffffff;
    box-shadow: 0 2px 7px rgba(15, 23, 42, 0.18);
  }

  .thumb-sheet img {
    display: block;
    width: 100%;
    height: auto;
  }

  .thumb-placeholder {
    width: 100%;
    aspect-ratio: 0.707;
    background:
      linear-gradient(180deg, rgba(148, 163, 184, 0.26), rgba(148, 163, 184, 0.12));
  }

  .thumb-index {
    font-size: 10px;
    font-weight: 700;
    color: #1e293b;
    line-height: 1;
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

  .pages.zoom-transitioning :global(.pdf-page) {
    animation: page-zoom-transition 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
    transform-origin: center top;
    will-change: transform, opacity;
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
    /* background set dynamically from detected bgColor */
    border-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.18);
  }

  .pages :global(.block-overlay.editing) {
    z-index: 10;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
  }

  .pages :global(.block-text-overlay) {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 1px 3px;
    color: #1e293b;
    line-height: 1.12;
    white-space: pre-wrap;
    overflow: hidden;
    word-break: break-word;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .pages :global(.block-edit-textarea) {
    border: none;
    outline: none;
    /* background set dynamically from detected bgColor, fallback white */
    background: rgba(255, 255, 255, 0.97);
    color: #1e293b;
    resize: none;
    padding: 2px 3px;
    font-size: inherit;
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.15;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .pages :global(.block-resize-handle) {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 12px;
    height: 12px;
    border-radius: 999px;
    border: 2px solid #10b981;
    background: #ffffff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
    cursor: nwse-resize;
    pointer-events: auto;
    z-index: 12;
  }

  .pages :global(.block-overlay.editing .block-resize-handle) {
    display: none;
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

  .pages :global(.block-tool-btn.icon-only) {
    width: 24px;
    height: 24px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .pages :global(.block-tool-btn.icon-only svg) {
    width: 14px;
    height: 14px;
  }

  .pages :global(.block-tool-btn.danger) {
    color: #f87171;
  }

  .pages :global(.block-tool-btn:hover) {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
  }

  .pages :global(.block-tool-btn.danger:hover) {
    background: rgba(239, 68, 68, 0.16);
    color: #fca5a5;
  }

  .pages :global(.block-tool-font-size) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 46px;
    padding: 0 6px;
    border-radius: 5px;
    border: 1px solid rgba(99, 102, 241, 0.25);
    background: rgba(99, 102, 241, 0.08);
    color: var(--color-text, #e2e8f0);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.02em;
    white-space: nowrap;
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

  @keyframes page-zoom-transition {
    from {
      opacity: 0.76;
      transform: scale(0.986) translateY(6px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @media (max-width: 1100px) {
    .page-sidebar { width: 102px; }
    .ocr-panel { width: 300px; }
    .ocr-langs-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (max-width: 900px) {
    .page-sidebar { display: none; }
    .viewer-body { flex-direction: column; }
    .ocr-panel {
      width: 100%;
      min-height: 200px;
      border-left: none;
      border-top: 1px solid var(--color-border);
    }
    .ocr-langs-meta { grid-template-columns: 1fr; }
    .analysis-status-banner {
      flex-wrap: wrap;
      align-items: flex-start;
    }
    .analysis-used-langs {
      width: 100%;
      text-align: center;
    }
  }
</style>
