<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { t } from "$lib/i18n";
  import { invoke } from '@tauri-apps/api/core';
  import {
    Hammer,
    Table2,
    FileText,
    Presentation,
    Theater,
    Upload,
    Save,
    X,
    Undo,
    Redo,
    Loader2,
    MessageSquare,
    PanelRightClose,
    PanelRightOpen,
    Unplug,
    AlertCircle,
    FilePlus2,
    ChevronDown
  } from "@lucide/svelte";
  import {
    docStore,
    openDocument,
    closeDocument,
    undo,
    redo,
    saveDocument,
    setTextContent,
    commitChanges,
    discardChanges,
    type PatchPreview
  } from "$lib/stores/document.svelte";
  import { store as gatewayStore, setForgeDocument, updateForgeContent, sendMessage } from "$lib/gateway/store.svelte";

  import DocPreview from "$lib/components/Document/DocPreview.svelte";
  import WordEditor from "$lib/components/Forge/WordEditor.svelte";
  import MarkdownEditor from "$lib/components/Forge/MarkdownEditor.svelte";
  import JsonEditor from "$lib/components/Forge/JsonEditor.svelte";
  import PlainTextEditor from "$lib/components/Forge/PlainTextEditor.svelte";
  import PdfViewer from "$lib/components/Forge/PdfViewer.svelte";
  import PptxViewer from "$lib/components/Forge/PptxViewer.svelte";
  import ApprovalModal from "$lib/components/Document/ApprovalModal.svelte";
  import ChatPanel from "$lib/components/Chat/ChatPanel.svelte";
  import { pdfEditorStore } from "$lib/stores/pdfEditor.svelte";
  import type { PdfLayoutResultRaw } from "$lib/types/pdfEditor";

  // Derived state
  const activeDoc = $derived(docStore.activeDocument);
  const isLoading = $derived(docStore.isLoading);
  const pendingPatch = $derived(gatewayStore.forgeState.pendingPatch);
  const isAgentEditing = $derived(gatewayStore.forgeState.isAgentEditing);

  // Chat panel state
  let chatOpen = $state(true);
  let workspaceEl = $state<HTMLDivElement | null>(null);
  let chatPaneWidth = $state(520);
  let isResizingPane = $state(false);
  let openFileError = $state<string | null>(null);
  let pendingTextContent = $state<string | null>(null);
  let textSyncTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  let isTextSyncing = $state(false);
  let isFileDragOver = $state(false);
  let fileDragDepth = $state(0);

  // PDF OCR editing state
  let pdfOcrMode = $state(false);
  let pdfOcrText = $state("");
  let pdfOcrLoading = $state(false);

  // PDF AI editing state
  let pendingRewriteBlockId = $state<string | null>(null);
  type InlineRewritePending = {
    requestId: string;
    baseAssistantCount: number;
    timeoutId: ReturnType<typeof setTimeout>;
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  };
  let pendingInlineRewrite = $state<InlineRewritePending | null>(null);
  let prevIsStreaming = $state(false);

  const CHAT_PANE_MIN = 360;
  const CHAT_PANE_MAX_RATIO = 0.52;
  const MOBILE_BREAKPOINT = 980;
  const WORD_RICH_MAX_HTML = 1_500_000;
  const OPEN_DOC_TIMEOUT_MS = 15_000;
  const INLINE_REWRITE_TIMEOUT_MS = 90_000;
  const DOC_WINDOW_TARGET_WIDTH = 1720;
  const DOC_WINDOW_TARGET_HEIGHT = 1040;
  const DOC_WINDOW_EDGE_MARGIN = 64;
  const WINDOW_RESIZE_ANIM_MS = 240;
  const WINDOW_RESIZE_FRAME_MS = 16;
  const SUPPORTED_DROP_EXTENSIONS = new Set([
    "xlsx",
    "xls",
    "csv",
    "ods",
    "txt",
    "md",
    "markdown",
    "json",
    "pdf",
    "docx",
    "doc",
    "hwp",
    "hwpx",
    "pptx",
    "ppt",
  ]);

  type WindowApiRef = {
    appWindow: any;
    LogicalSize: new (width: number, height: number) => any;
    currentMonitor: () => Promise<any>;
  };

  type WindowSnapshot = {
    width: number;
    height: number;
    maximized: boolean;
  };

  let windowApi = $state<WindowApiRef | null>(null);
  let windowBeforeDoc = $state<WindowSnapshot | null>(null);
  let didAutoResizeWindow = $state(false);
  let windowResizeSeq = 0;
  let prevDocIdForWindow = $state<string | null>(null);
  let unlistenNativeFileDrop: (() => void) | null = null;

  function tr(key: string, vars?: Record<string, string | number>): string {
    let text: string = $t(key);
    if (!vars) return text;
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }

  function htmlToPlainText(input: string): string {
    if (!input) return "";
    return input
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeDroppedPath(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim().replace(/^"+|"+$/g, "");
    if (!trimmed) return null;

    if (trimmed.startsWith("file://")) {
      try {
        const url = new URL(trimmed);
        let path = decodeURIComponent(url.pathname);
        if (/^\/[a-zA-Z]:\//.test(path)) {
          path = path.slice(1); // Windows drive letter path
        }
        return path || null;
      } catch {
        return null;
      }
    }

    return trimmed;
  }

  function isSupportedDroppedPath(path: string): boolean {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return SUPPORTED_DROP_EXTENSIONS.has(ext);
  }

  function extractDroppedPaths(e: DragEvent): string[] {
    const paths = new Set<string>();
    const dt = e.dataTransfer;
    if (!dt) return [];

    // 1) Native dropped files
    if (dt.files && dt.files.length > 0) {
      for (const file of Array.from(dt.files)) {
        const fromPath = normalizeDroppedPath((file as File & { path?: string }).path);
        if (fromPath) paths.add(fromPath);
      }
    }

    // 2) URI list (file://...)
    const uriList = dt.getData("text/uri-list");
    if (uriList) {
      for (const line of uriList.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const path = normalizeDroppedPath(line);
        if (path) paths.add(path);
      }
    }

    // 3) Plain text path fallback
    const plainText = dt.getData("text/plain");
    if (plainText) {
      for (const line of plainText.split(/\r?\n/)) {
        const path = normalizeDroppedPath(line);
        if (path) paths.add(path);
      }
    }

    return [...paths];
  }

  function dragContainsFiles(dt: DataTransfer | null | undefined): boolean {
    if (!dt) return false;
    if (dt.files?.length) return true;
    if (dt.items?.length > 0 && Array.from(dt.items).some((item) => item.kind === "file")) return true;

    const types = dt.types;
    if (!types) return false;

    const maybeDomStringList = types as unknown as { contains?: (value: string) => boolean };
    if (typeof maybeDomStringList.contains === "function") {
      return maybeDomStringList.contains("Files");
    }
    return Array.from(types).includes("Files");
  }

  function toLogicalSize(width: number, height: number): { width: number; height: number } {
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  async function animateWindowSize(
    api: WindowApiRef,
    from: { width: number; height: number },
    to: { width: number; height: number },
    seq: number,
  ): Promise<boolean> {
    const start = toLogicalSize(from.width, from.height);
    const end = toLogicalSize(to.width, to.height);

    if (start.width === end.width && start.height === end.height) return true;

    const { appWindow, LogicalSize } = api;
    const startTime = nowMs();
    let lastW = -1;
    let lastH = -1;

    while (true) {
      if (seq !== windowResizeSeq) return false;

      const elapsed = nowMs() - startTime;
      const t = Math.min(1, elapsed / WINDOW_RESIZE_ANIM_MS);
      const k = easeOutCubic(t);

      const width = Math.round(start.width + (end.width - start.width) * k);
      const height = Math.round(start.height + (end.height - start.height) * k);

      if (width !== lastW || height !== lastH) {
        await appWindow.setSize(new LogicalSize(width, height));
        lastW = width;
        lastH = height;
      }

      if (t >= 1) return true;
      await sleep(WINDOW_RESIZE_FRAME_MS);
    }
  }

  async function readWindowLogicalSize(api: WindowApiRef): Promise<{ width: number; height: number }> {
    const scale = await api.appWindow.scaleFactor();
    const physical = await api.appWindow.innerSize();
    const logical = physical.toLogical(scale);
    return toLogicalSize(logical.width, logical.height);
  }

  async function computeDocTargetSize(api: WindowApiRef): Promise<{ width: number; height: number }> {
    let width = DOC_WINDOW_TARGET_WIDTH;
    let height = DOC_WINDOW_TARGET_HEIGHT;

    const monitor = await api.currentMonitor();
    if (monitor?.workArea?.size && monitor.scaleFactor) {
      const workW = monitor.workArea.size.width / monitor.scaleFactor;
      const workH = monitor.workArea.size.height / monitor.scaleFactor;
      const availableW = Math.max(420, workW - DOC_WINDOW_EDGE_MARGIN);
      const availableH = Math.max(340, workH - DOC_WINDOW_EDGE_MARGIN);
      const maxW = Math.floor(Math.min(workW, availableW));
      const maxH = Math.floor(Math.min(workH, availableH));
      width = Math.min(width, maxW);
      height = Math.min(height, maxH);
    }

    return toLogicalSize(width, height);
  }

  async function resizeWindowForDocumentOpen(): Promise<void> {
    if (!windowApi) return;
    const seq = ++windowResizeSeq;

    try {
      const { appWindow, LogicalSize } = windowApi;
      const isMaximized = await appWindow.isMaximized();
      const current = await readWindowLogicalSize(windowApi);

      if (!windowBeforeDoc) {
        windowBeforeDoc = {
          width: current.width,
          height: current.height,
          maximized: isMaximized,
        };
      }

      if (isMaximized) {
        didAutoResizeWindow = false;
        return;
      }

      const target = await computeDocTargetSize(windowApi);
      const next = toLogicalSize(
        Math.max(current.width, target.width),
        Math.max(current.height, target.height),
      );

      if (seq !== windowResizeSeq) return;
      if (next.width === current.width && next.height === current.height) {
        didAutoResizeWindow = false;
        return;
      }

      const animated = await animateWindowSize(windowApi, current, next, seq);
      if (!animated) return;
      await appWindow.center().catch(() => {});
      didAutoResizeWindow = true;
    } catch {
      // Ignore if not running in desktop shell.
    }
  }

  async function restoreWindowAfterDocumentClose(): Promise<void> {
    if (!windowApi || !windowBeforeDoc) return;
    const seq = ++windowResizeSeq;
    const snapshot = windowBeforeDoc;
    windowBeforeDoc = null;

    try {
      const { appWindow } = windowApi;
      const isMaximized = await appWindow.isMaximized();
      if (seq !== windowResizeSeq) return;

      if (snapshot.maximized) {
        if (!isMaximized) {
          await appWindow.maximize();
        }
        didAutoResizeWindow = false;
        return;
      }

      if (isMaximized) {
        await appWindow.unmaximize();
      }

      if (didAutoResizeWindow) {
        const current = await readWindowLogicalSize(windowApi);
        const target = toLogicalSize(snapshot.width, snapshot.height);
        const animated = await animateWindowSize(windowApi, current, target, seq);
        if (!animated) return;
        await appWindow.center().catch(() => {});
      }
    } catch {
      // Ignore window API failures.
    } finally {
      didAutoResizeWindow = false;
    }
  }

  // Gateway connection
  const activeGateway = $derived(gatewayStore.gateways.find(g => g.id === gatewayStore.activeGatewayId) ?? null);
  const activeGatewayState = $derived(gatewayStore.activeGatewayId ? gatewayStore.gatewayStates.get(gatewayStore.activeGatewayId) ?? null : null);
  const isConnected = $derived(activeGatewayState?.status === "connected");
  const activeExtension = $derived(
    activeDoc ? activeDoc.fileName.split(".").pop()?.toLowerCase() ?? "" : ""
  );
  const isWordDoc = $derived(["docx", "doc", "hwp", "hwpx"].includes(activeExtension));
  const isLegacyDoc = $derived(activeExtension === "doc");
  const isHanwordDoc = $derived(activeExtension === "hwp" || activeExtension === "hwpx");
  const isMarkdownDoc = $derived(activeExtension === "md" || activeExtension === "markdown");
  const isJsonDoc = $derived(activeExtension === "json");
  const canSave = $derived(activeDoc ? activeDoc.docType !== "pdf" && activeDoc.docType !== "presentation" && !isLegacyDoc && !isHanwordDoc : false);

  onMount(() => {
    import("@tauri-apps/api/window").then((mod) => {
      const appWindow = mod.getCurrentWindow();
      windowApi = {
        appWindow,
        LogicalSize: mod.LogicalSize,
        currentMonitor: mod.currentMonitor,
      };

      void appWindow.onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "leave") {
          fileDragDepth = 0;
          isFileDragOver = false;
          return;
        }

        const inChat = "position" in payload && isDropInsideChatAtPhysicalPosition(payload.position);
        if (payload.type === "enter" || payload.type === "over") {
          isFileDragOver = !inChat;
          return;
        }

        if (payload.type === "drop") {
          fileDragDepth = 0;
          isFileDragOver = false;
          if (!inChat) {
            void handleDroppedPaths(payload.paths);
          }
        }
      }).then((unlisten) => {
        unlistenNativeFileDrop = unlisten;
      }).catch(() => {
        // If native drop listener is unavailable, HTML5 drag-drop handlers still apply.
      });

      if (activeDoc) {
        void resizeWindowForDocumentOpen();
      }
    }).catch(() => {
      // Running in browser preview / non-tauri environment.
    });
  });

  onDestroy(() => {
    if (unlistenNativeFileDrop) {
      unlistenNativeFileDrop();
      unlistenNativeFileDrop = null;
    }
    if (pendingInlineRewrite) {
      clearTimeout(pendingInlineRewrite.timeoutId);
      pendingInlineRewrite = null;
    }
    if (textSyncTimer) {
      clearTimeout(textSyncTimer);
      textSyncTimer = null;
    }
    if (windowBeforeDoc) {
      void restoreWindowAfterDocumentClose();
    }
  });

  $effect(() => {
    const nextDocId = activeDoc?.id ?? null;
    const prevDocId = prevDocIdForWindow;
    prevDocIdForWindow = nextDocId;

    if (nextDocId && !prevDocId) {
      void resizeWindowForDocumentOpen();
      return;
    }
    if (!nextDocId && prevDocId) {
      void restoreWindowAfterDocumentClose();
      return;
    }
    if (nextDocId && prevDocId && nextDocId !== prevDocId) {
      void resizeWindowForDocumentOpen();
    }
  });

  function rowsToPlainText(rows: Array<Array<{ value: unknown }>> | undefined): string {
    if (!rows || rows.length === 0) return "";
    return rows
      .map((row) => {
        const first = row?.[0];
        if (!first || first.value === null || first.value === undefined) return "";
        return String(first.value);
      })
      .join("\n");
  }

  const plainTextContent = $derived.by(() => {
    const doc = activeDoc;
    if (!doc || doc.docType !== "text") return "";
    const rows = doc.sheets[0]?.rows as Array<Array<{ value: unknown }>> | undefined;
    return rowsToPlainText(rows);
  });

  const wordEditorContent = $derived.by(() => {
    if (!activeDoc || activeDoc.docType !== "text" || !isWordDoc) return "";
    const value = activeDoc.sheets[0]?.rows?.[0]?.[0]?.value;
    return typeof value === "string" ? value : "";
  });

  const useRichWordEditor = $derived(!isWordDoc || wordEditorContent.length <= WORD_RICH_MAX_HTML);

  const wordPlainFallbackContent = $derived.by(() => {
    if (!isWordDoc) return plainTextContent;
    return useRichWordEditor ? plainTextContent : htmlToPlainText(wordEditorContent);
  });

  const presentationSlides = $derived.by(() => {
    if (!activeDoc || activeDoc.docType !== 'presentation') return [];
    return activeDoc.sheets.map(sheet => ({
      name: sheet.name,
      content: (sheet.rows[0]?.[0]?.value as string) ?? "",
    }));
  });

  function getChatPaneMaxWidth(): number {
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
    const baseWidth = workspaceEl?.clientWidth ?? viewportWidth;
    return Math.max(CHAT_PANE_MIN, Math.floor(baseWidth * CHAT_PANE_MAX_RATIO));
  }

  function clampChatPaneWidth(next: number): number {
    if (!Number.isFinite(next)) {
      return CHAT_PANE_MIN;
    }
    return Math.min(Math.max(next, CHAT_PANE_MIN), getChatPaneMaxWidth());
  }

  function startPaneResize(event: MouseEvent): void {
    if (typeof window === "undefined" || window.innerWidth < MOBILE_BREAKPOINT) return;
    isResizingPane = true;
    event.preventDefault();
  }

  function handlePaneResize(event: MouseEvent): void {
    if (!isResizingPane || !workspaceEl) return;
    const rect = workspaceEl.getBoundingClientRect();
    const next = rect.right - event.clientX;
    chatPaneWidth = clampChatPaneWidth(next);
  }

  function stopPaneResize(): void {
    if (!isResizingPane) return;
    isResizingPane = false;
  }

  function handleWindowResize(): void {
    if (typeof window === "undefined" || window.innerWidth < MOBILE_BREAKPOINT) return;
    const clamped = clampChatPaneWidth(chatPaneWidth);
    if (!Object.is(clamped, chatPaneWidth)) {
      chatPaneWidth = clamped;
    }
  }

  function toggleChatPane(): void {
    chatOpen = !chatOpen;
    if (!chatOpen) {
      isResizingPane = false;
      return;
    }
    if (typeof window === "undefined" || window.innerWidth < MOBILE_BREAKPOINT) return;
    const clamped = clampChatPaneWidth(chatPaneWidth);
    if (!Object.is(clamped, chatPaneWidth)) {
      chatPaneWidth = clamped;
    }
  }

  type ForgeOpenedDocument = Awaited<ReturnType<typeof openDocument>>;

  function applyForgeDocumentContext(doc: ForgeOpenedDocument): void {
    if (doc.docType === "presentation") {
      const fullContent = doc.sheets
        .map((s) => (s.rows[0]?.[0]?.value as string) ?? "")
        .join("\n---\n");
      const excerpt = fullContent.slice(0, 2000);
      setForgeDocument(doc.id, { name: doc.fileName, type: doc.docType, excerpt });
      updateForgeContent(fullContent);
      return;
    }

    const isWord = ["docx", "doc", "hwp", "hwpx"].some((ext) => doc.fileName.toLowerCase().endsWith(ext));
    const fullContent = isWord
      ? (doc.sheets[0]?.rows?.[0]?.[0]?.value as string) ?? ""
      : doc.sheets[0]?.rows?.map((r) => r.map((c) => c.value ?? "").join("\t")).join("\n") ?? "";
    const excerpt = fullContent.slice(0, 2000);
    setForgeDocument(doc.id, { name: doc.fileName, type: doc.docType, excerpt });
    updateForgeContent(fullContent);
  }

  async function openDocumentByPath(path: string): Promise<void> {
    const doc = await Promise.race([
      openDocument(path),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), OPEN_DOC_TIMEOUT_MS);
      }),
    ]);

    if (!doc) {
      docStore.isLoading = false;
      openFileError = tr("forge.error.open_timeout", { seconds: Math.round(OPEN_DOC_TIMEOUT_MS / 1000) });
      return;
    }

    applyForgeDocumentContext(doc);
  }

  async function handleDroppedPaths(paths: string[]): Promise<void> {
    openFileError = null;

    const droppedPaths = paths
      .map((path) => normalizeDroppedPath(path))
      .filter((path): path is string => !!path)
      .filter((path) => isSupportedDroppedPath(path));

    if (droppedPaths.length === 0) {
      openFileError = $t("forge.error.unsupported_drop");
      return;
    }

    try {
      await openDocumentByPath(droppedPaths[0]);
    } catch (err: unknown) {
      console.error("Failed to open dropped file:", err);
      openFileError = err instanceof Error ? err.message : $t("forge.error.drop_open_failed");
    }
  }

  function isDropInsideChatAtPhysicalPosition(position: { x: number; y: number } | null | undefined): boolean {
    if (!position || typeof window === "undefined") return false;
    const dpr = window.devicePixelRatio || 1;
    const target = document.elementFromPoint(position.x / dpr, position.y / dpr) as HTMLElement | null;
    return !!target?.closest(".chat-side");
  }

  function shouldHandleForgeDrop(e: DragEvent): boolean {
    if (e.defaultPrevented) return false;
    const target = e.target as HTMLElement | null;
    if (target?.closest(".chat-side")) return false;
    return dragContainsFiles(e.dataTransfer);
  }

  function handleForgeDragEnter(e: DragEvent): void {
    if (!shouldHandleForgeDrop(e)) return;
    e.preventDefault();
    fileDragDepth += 1;
    isFileDragOver = true;
  }

  function handleForgeDragOver(e: DragEvent): void {
    if (!shouldHandleForgeDrop(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    isFileDragOver = true;
  }

  function handleForgeDragLeave(e: DragEvent): void {
    if (!isFileDragOver) return;
    e.preventDefault();
    fileDragDepth = Math.max(0, fileDragDepth - 1);
    if (fileDragDepth === 0) {
      isFileDragOver = false;
    }
  }

  async function handleForgeDrop(e: DragEvent): Promise<void> {
    if (!shouldHandleForgeDrop(e)) return;
    e.preventDefault();
    fileDragDepth = 0;
    isFileDragOver = false;
    await handleDroppedPaths(extractDroppedPaths(e));
  }

  // File opening logic
  async function handleOpenFile(filterType?: 'spreadsheet' | 'document' | 'presentation') {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      openFileError = null;

      let filters;
      switch (filterType) {
        case 'spreadsheet':
          filters = [{ name: $t('forge.filter.spreadsheets'), extensions: ['xlsx', 'xls', 'csv', 'ods'] }];
          break;
        case 'document':
          filters = [{ name: $t('forge.filter.documents'), extensions: ['txt', 'md', 'json', 'pdf', 'docx', 'doc', 'hwp', 'hwpx'] }];
          break;
        case 'presentation':
          filters = [{ name: $t('forge.filter.presentations'), extensions: ['pptx', 'ppt'] }];
          break;
        default:
          filters = [
            { name: $t('forge.filter.all_supported'), extensions: ['xlsx', 'xls', 'csv', 'ods', 'txt', 'md', 'json', 'pdf', 'docx', 'doc', 'hwp', 'hwpx', 'pptx', 'ppt'] },
            { name: $t('forge.filter.spreadsheets'), extensions: ['xlsx', 'xls', 'csv', 'ods'] },
            { name: $t('forge.filter.text'), extensions: ['txt', 'md', 'json', 'pdf', 'docx', 'doc', 'hwp', 'hwpx'] },
            { name: $t('forge.filter.presentations'), extensions: ['pptx', 'ppt'] }
          ];
      }

      const selected = await open({ filters });

      if (selected && typeof selected === 'string') {
        await openDocumentByPath(selected);
      }
    } catch (err: unknown) {
      console.error("Failed to open file dialog:", err);
      openFileError = err instanceof Error ? err.message : $t("forge.error.open_failed");
    }
  }

  let showNewDocMenu = $state(false);

  const newDocTypes = $derived([
    { ext: 'txt', label: $t('forge.new_doc.text'), icon: 'txt' },
    { ext: 'md', label: $t('forge.new_doc.markdown'), icon: 'md' },
    { ext: 'docx', label: $t('forge.new_doc.word'), icon: 'docx' },
    { ext: 'xlsx', label: $t('forge.new_doc.spreadsheet'), icon: 'xlsx' },
  ] as const);

  async function handleNewDocument(ext: string) {
    showNewDocMenu = false;
    try {
      openFileError = null;
      const tempPath = await invoke<string>('create_temp_document', { ext });
      const doc = await openDocument(tempPath);
      if (doc) {
        setForgeDocument(doc.id, { name: doc.fileName, type: doc.docType, excerpt: '' });
        updateForgeContent('');
      }
    } catch (err: unknown) {
      console.error("Failed to create new document:", err);
      openFileError = err instanceof Error ? err.message : $t("forge.error.new_doc_failed");
    }
  }

  async function flushTextSync(): Promise<void> {
    if (!activeDoc || activeDoc.docType !== 'text' || pendingTextContent === null) return;
    if (isTextSyncing) return;

    const content = pendingTextContent;
    pendingTextContent = null;
    isTextSyncing = true;
    try {
      await setTextContent(activeDoc.id, content, isWordDoc ? 'html' : 'plain');
    } finally {
      isTextSyncing = false;
    }
  }

  // Toolbar actions
  async function handleSave() {
    if (activeDoc) {
      if (activeDoc.docType === 'text') {
        await flushTextSync();
      }
      await saveDocument(activeDoc.id);
    }
  }

  async function handleClose() {
    if (activeDoc) {
      if (textSyncTimer) {
        clearTimeout(textSyncTimer);
        textSyncTimer = null;
      }
      if (activeDoc.docType === 'text') {
        await flushTextSync();
      }
      // Reset PDF state
      pdfOcrMode = false;
      pdfOcrText = "";
      setForgeDocument(null);
      await closeDocument(activeDoc.id);
    }
  }

  async function handleUndo() {
    if (activeDoc) {
      await undo(activeDoc.id);
    }
  }

  async function handleRedo() {
    if (activeDoc) {
      await redo(activeDoc.id);
    }
  }

  function handleTextChange(newContent: string) {
    if (!activeDoc || activeDoc.docType !== 'text') return;
    activeDoc.modified = true;
    pendingTextContent = newContent;

    // Keep forge context fresh for next chat message
    updateForgeContent(newContent);

    if (textSyncTimer) {
      clearTimeout(textSyncTimer);
    }
    textSyncTimer = setTimeout(() => {
      textSyncTimer = null;
      void flushTextSync();
    }, 350);
  }

  function assistantMessageCount(): number {
    return gatewayStore.chatMessages.filter((msg) => msg.role === "assistant" && msg.content?.trim()).length;
  }

  function buildInlineRewritePrompt(instruction: string, selectedText: string): string {
    return [
      $t("forge.inline_prompt.line1"),
      $t("forge.inline_prompt.line2"),
      $t("forge.inline_prompt.line3"),
      "",
      $t("forge.inline_prompt.instruction_label"),
      instruction,
      "",
      $t("forge.inline_prompt.selected_text_label"),
      selectedText,
    ].join("\n");
  }

  async function handleInlineRewrite(selectedText: string, instruction: string): Promise<string> {
    const cleanText = selectedText.trim();
    const cleanInstruction = instruction.trim();
    if (!cleanText) throw new Error($t("forge.error.inline_no_selection"));
    if (!cleanInstruction) throw new Error($t("forge.error.inline_no_instruction"));
    if (!gatewayStore.activeGatewayId) throw new Error($t("forge.error.inline_gateway_disconnected"));
    if (gatewayStore.isStreaming || pendingRewriteBlockId || pendingInlineRewrite) {
      throw new Error($t("forge.error.inline_busy"));
    }

    const prompt = buildInlineRewritePrompt(cleanInstruction, cleanText);
    const requestId = crypto.randomUUID();
    const baseAssistantCount = assistantMessageCount();

    return await new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!pendingInlineRewrite || pendingInlineRewrite.requestId !== requestId) return;
        pendingInlineRewrite = null;
        reject(new Error($t("forge.error.inline_timeout")));
      }, INLINE_REWRITE_TIMEOUT_MS);

      pendingInlineRewrite = {
        requestId,
        baseAssistantCount,
        timeoutId,
        resolve,
        reject,
      };

      sendMessage(prompt).catch((err: unknown) => {
        if (pendingInlineRewrite?.requestId === requestId) {
          clearTimeout(timeoutId);
          pendingInlineRewrite = null;
        }
        reject(err instanceof Error ? err : new Error($t("forge.error.inline_send_failed")));
      });
    });
  }

  function collectOcrLayoutText(layout: PdfLayoutResultRaw): string {
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
  }

  async function extractPdfTextViaRasterOcr(
    sessionId: string,
    lang: string,
    tessdataDir: string | null,
  ): Promise<string> {
    const [{ default: workerSrc }, pdfjs] = await Promise.all([
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      import("pdfjs-dist"),
    ]);
    (pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc;

    const bytes = await invoke<number[] | Uint8Array>("doc_get_pdf_bytes", { id: sessionId });
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const loadingTask = (pdfjs as any).getDocument({ data });
    const pdfDoc = await loadingTask.promise;

    try {
      const OCR_SCALE = 300 / 72;
      const pageImages: string[] = [];
      const pageHeights: number[] = [];

      for (let i = 1; i <= pdfDoc.numPages; i++) {
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
        lang,
        tessdataDir,
        pageHeights,
        pageImages,
      });
      return collectOcrLayoutText(layout);
    } finally {
      if (pdfDoc?.destroy) await pdfDoc.destroy();
    }
  }

  // PDF OCR editing
  async function handlePdfOcrEdit() {
    if (!activeDoc || activeDoc.docType !== 'pdf') return;
    pdfOcrLoading = true;
    try {
      const langs = ["kor", "eng"];
      const lang = langs.join("+");

      let effectiveTessdataDir: string | null = null;
      try {
        effectiveTessdataDir = await invoke<string>("doc_ocr_ensure_langs", { langs });
      } catch (e) {
        console.warn("Failed to auto-prepare OCR language data:", e);
      }

      let text = "";
      try {
        text = await invoke<string>("doc_pdf_ocr_extract", {
          id: activeDoc.id,
          lang,
          tessdataDir: effectiveTessdataDir,
        });
      } catch (directErr) {
        console.warn("Direct PDF OCR extract failed, falling back to page-image OCR:", directErr);
      }

      if (!text.trim()) {
        text = await extractPdfTextViaRasterOcr(activeDoc.id, lang, effectiveTessdataDir);
      }
      if (!text.trim()) {
        throw new Error($t("forge.error.ocr_empty"));
      }

      pdfOcrText = text;
      pdfOcrMode = true;
      // Update forge context with OCR text for agent awareness
      updateForgeContent(text);
    } catch (err: any) {
      console.error("OCR extraction failed:", err);
      openFileError = tr("forge.error.ocr_extract_failed", { error: err.message || err });
    } finally {
      pdfOcrLoading = false;
    }
  }

  function handlePdfOcrBack() {
    pdfOcrMode = false;
  }

  function handlePdfOcrTextChange(newContent: string) {
    pdfOcrText = newContent;
    updateForgeContent(newContent);
  }

  async function handleSaveAsDocx() {
    if (!pdfOcrText) return;
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const savePath = await save({
        filters: [{ name: $t('forge.new_doc.word'), extensions: ['docx'] }],
        defaultPath: activeDoc?.fileName.replace(/\.pdf$/i, '.docx') ?? 'document.docx',
      });
      if (savePath) {
        await invoke('doc_save_text_as_docx', { content: pdfOcrText, savePath });
      }
    } catch (err: any) {
      console.error("Save as DOCX failed:", err);
      openFileError = tr("forge.error.save_docx_failed", { error: err.message || err });
    }
  }

  // PDF AI Rewrite handler
  function handlePdfAiRewrite(blockId: string, text: string) {
    if (!gatewayStore.activeGatewayId) {
      openFileError = $t("forge.error.ai_rewrite_gateway");
      return;
    }
    pendingRewriteBlockId = blockId;
    sendMessage(tr("forge.ai_rewrite.prompt", { text }));
  }

  // Watch for AI response to apply rewrite
  $effect(() => {
    const streaming = gatewayStore.isStreaming;
    // Detect streaming end: was streaming, now stopped, and we have a pending rewrite
    if (prevIsStreaming && !streaming && pendingRewriteBlockId) {
      const msgs = gatewayStore.chatMessages;
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && lastMsg.content?.trim()) {
        pdfEditorStore.pushOp({
          t: "replaceText",
          targetId: pendingRewriteBlockId,
          text: lastMsg.content.trim(),
        });
        pendingRewriteBlockId = null;
      }
    }
    prevIsStreaming = streaming;
  });

  $effect(() => {
    const pending = pendingInlineRewrite;
    const streaming = gatewayStore.isStreaming;
    const messages = gatewayStore.chatMessages;
    if (!pending || streaming) return;

    const assistants = messages.filter((msg) => msg.role === "assistant" && msg.content?.trim());
    if (assistants.length <= pending.baseAssistantCount) return;

    const latest = assistants[assistants.length - 1];
    clearTimeout(pending.timeoutId);
    pendingInlineRewrite = null;

    const rewritten = latest.content?.trim();
    if (!rewritten) {
      pending.reject(new Error($t("forge.error.inline_empty_response")));
      return;
    }
    pending.resolve(rewritten);
  });

  // PDF Export handler
  async function handlePdfExport() {
    const state = pdfEditorStore.exportState();
    if (!state || !activeDoc) return;

    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const savePath = await save({
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultPath: activeDoc.fileName.replace(/\.pdf$/i, '-edited.pdf'),
      });
      if (!savePath) return;

      const adjustmentById = new Map<string, { dx: number; dy: number; dw: number; dh: number }>();
      for (const op of state.ops) {
        if (!("targetId" in op)) continue;
        const prev = adjustmentById.get(op.targetId) ?? { dx: 0, dy: 0, dw: 0, dh: 0 };
        if (op.t === "move") {
          prev.dx += op.dx;
          prev.dy += op.dy;
        } else if (op.t === "resize") {
          prev.dw += op.dw;
          prev.dh += op.dh;
        }
        adjustmentById.set(op.targetId, prev);
      }

      const blocks = Object.values(state.blocks).map((b) => {
        const adj = adjustmentById.get(b.id) ?? { dx: 0, dy: 0, dw: 0, dh: 0 };
        return {
          id: b.id,
          page: b.page,
          bbox: {
            x: b.bbox.x + adj.dx,
            y: b.bbox.y + adj.dy,
            w: Math.max(8, b.bbox.w + adj.dw),
            h: Math.max(8, b.bbox.h + adj.dh),
          },
          fontSize: b.fontSize,
          bgColor: b.bgColor,
          fontName: b.fontName,
        };
      });
      const blockById = new Map(blocks.map((block) => [block.id, block]));

      const wrapMeasuredText = (
        ctx: CanvasRenderingContext2D,
        text: string,
        maxWidth: number,
      ): string[] => {
        if (maxWidth <= 1) return text.split(/\r?\n/);
        const wrapped: string[] = [];
        for (const paragraph of text.split(/\r?\n/)) {
          if (paragraph.length === 0) {
            wrapped.push("");
            continue;
          }
          let line = "";
          for (const ch of Array.from(paragraph)) {
            const next = line + ch;
            if (line && ctx.measureText(next).width > maxWidth) {
              wrapped.push(line);
              line = ch;
            } else {
              line = next;
            }
          }
          wrapped.push(line);
        }
        return wrapped.length > 0 ? wrapped : [text];
      };

      const createTextRasterJpeg = (
        text: string,
        width: number,
        height: number,
        bgColor?: string,
        preferredFontSize?: number,
      ): { dataUrl: string; width: number; height: number } | null => {
        if (!text.trim()) return null;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(8, Math.ceil(width));
        canvas.height = Math.max(8, Math.ceil(height));
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        const padding = 1;
        const maxW = Math.max(1, canvas.width - padding * 2);
        const maxH = Math.max(1, canvas.height - padding * 2);
        const lineHeightFactor = 1.1;

        ctx.fillStyle = bgColor ?? "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const preferred = typeof preferredFontSize === "number" && Number.isFinite(preferredFontSize)
          ? preferredFontSize
          : null;
        let fontSize = preferred
          ? Math.max(6, Math.min(72, preferred))
          : Math.max(8, Math.min(46, canvas.height * 0.9));
        let lines: string[] = [];
        const recompute = () => {
          ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
          lines = wrapMeasuredText(ctx, text, maxW);
        };
        const fits = (): boolean => lines.length * fontSize * lineHeightFactor <= maxH + 0.5;
        recompute();
        while (fontSize > 6 && !fits()) {
          fontSize -= 0.5;
          recompute();
        }

        ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = "#111827";
        ctx.textBaseline = "top";
        const lineHeight = fontSize * lineHeightFactor;
        let y = padding;
        for (const line of lines) {
          if (y + lineHeight > canvas.height + 0.5) break;
          ctx.fillText(line, padding, y);
          y += lineHeight;
        }

        return {
          dataUrl: canvas.toDataURL("image/jpeg", 0.94),
          width: canvas.width,
          height: canvas.height,
        };
      };

      const exportOps: any[] = state.ops.map((op) => {
        if (op.t !== "replaceText") return op;
        const block = blockById.get(op.targetId);
        const source = state.blocks[op.targetId];
        if (!block || !source) return op;
        const raster = createTextRasterJpeg(
          op.text,
          block.bbox.w,
          block.bbox.h,
          source.bgColor,
          op.fontSize,
        );
        if (!raster) return op;
        return {
          ...op,
          rasterJpeg: raster.dataUrl,
          rasterWidth: raster.width,
          rasterHeight: raster.height,
        };
      });

      await invoke('doc_pdf_export_overlay', {
        id: activeDoc.id,
        ops: exportOps,
        blocks,
        pageHeights: state.pageHeights,
        outputPath: savePath,
      });
    } catch (err: any) {
      console.error("PDF export failed:", err);
      openFileError = tr("forge.error.pdf_export_failed", { error: err.message || err });
    }
  }

  // Slide editing handler for PPTX
  function handleSlideChange(slideIndex: number, content: string) {
    if (!activeDoc || activeDoc.docType !== 'presentation') return;
    // Update local state
    if (activeDoc.sheets[slideIndex]) {
      activeDoc.sheets[slideIndex].rows = [[{ type: 'string' as const, value: content }]];
      activeDoc.modified = true;
    }
    // Sync to backend
    setTextContent(activeDoc.id, content, 'html', slideIndex);
    // Update forge context
    const fullContent = activeDoc.sheets.map(s =>
      (s.rows[0]?.[0]?.value as string) ?? ""
    ).join('\n---\n');
    updateForgeContent(fullContent);
  }

  // Approval Modal Handlers
  async function handleApprovePatch() {
    if (activeDoc && pendingPatch) {
      try {
        if (pendingPatch.type === "content_replace") {
          // Content replacement from agent
          const fmt = pendingPatch.format === "html" ? "html" : "plain";
          await setTextContent(activeDoc.id, pendingPatch.content, fmt);
          // Reload the document to reflect changes
          const doc = await openDocument(activeDoc.filePath);
          if (doc) {
            updateForgeContent(pendingPatch.content);
          }
        } else {
          // Existing spreadsheet patch flow
          await commitChanges(activeDoc.id);
        }
        gatewayStore.forgeState.pendingPatch = null;
      } catch (e) {
        console.error("Failed to commit patch:", e);
      }
    }
  }

  async function handleRejectPatch() {
    if (activeDoc && pendingPatch) {
      try {
        await discardChanges(activeDoc.id);
        gatewayStore.forgeState.pendingPatch = null;
      } catch (e) {
        console.error("Failed to discard patch:", e);
      }
    }
  }
</script>

<svelte:head>
  <title>{$t("nav.forge")} | {$t("app.title")}</title>
</svelte:head>

<svelte:window
  onmousemove={handlePaneResize}
  onmouseup={stopPaneResize}
  onresize={handleWindowResize}
/>

<div
  class="forge-page"
  role="main"
  aria-label={$t("forge.workspace_aria")}
  class:resizing-pane={isResizingPane}
  class:file-drag-over={isFileDragOver}
  ondragenter={handleForgeDragEnter}
  ondragover={handleForgeDragOver}
  ondragleave={handleForgeDragLeave}
  ondrop={handleForgeDrop}
>
  {#if activeDoc}
    <!-- Document View Mode -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="doc-title">{activeDoc.fileName}</span>
        {#if activeDoc.modified}
          <span class="modified-badge">{$t("forge.toolbar.modified")}</span>
        {/if}
      </div>

      <div class="toolbar-center">
        {#if activeDoc.docType === 'pdf'}
          {#if pdfOcrMode}
            <button class="tool-btn active" onclick={handlePdfOcrBack} title={$t("forge.toolbar.pdf_view_original_title")}>
              <FileText size={18} />
            </button>
            <button class="action-btn ocr-save" onclick={handleSaveAsDocx} title={$t("forge.toolbar.save_docx_title")}>
              <Save size={16} />
              {$t("forge.toolbar.save_docx")}
            </button>
          {:else}
            <button
              class="action-btn ocr-btn"
              onclick={handlePdfOcrEdit}
              disabled={pdfOcrLoading}
              title={$t("forge.toolbar.ocr_edit_title")}
            >
              {#if pdfOcrLoading}
                <Loader2 size={16} class="spin" />
                {$t("forge.toolbar.ocr_loading")}
              {:else}
                <FileText size={16} />
                {$t("forge.toolbar.ocr_edit")}
              {/if}
            </button>
            {#if pdfEditorStore.hasLayout}
              <button
                class="action-btn pdf-export-btn"
                onclick={handlePdfExport}
                title={$t("forge.toolbar.export_pdf_title")}
              >
                <Save size={16} />
                {$t("forge.toolbar.export_pdf")}
              </button>
            {/if}
          {/if}
        {:else}
          <button class="tool-btn" onclick={handleUndo} title={$t("forge.toolbar.undo")}>
            <Undo size={18} />
          </button>
          <button class="tool-btn" onclick={handleRedo} title={$t("forge.toolbar.redo")}>
            <Redo size={18} />
          </button>
        {/if}
      </div>

      <div class="toolbar-right">
        <button class="tool-btn" onclick={toggleChatPane} title={chatOpen ? $t("forge.toolbar.chat_hide") : $t("forge.toolbar.chat_show")}>
          {#if chatOpen}
            <PanelRightClose size={18} />
          {:else}
            <PanelRightOpen size={18} />
          {/if}
        </button>
        <button class="action-btn secondary" onclick={handleClose}>
          <X size={16} />
          {$t("forge.toolbar.close")}
        </button>
        <button
          class="action-btn primary"
          onclick={handleSave}
          disabled={!canSave}
          title={
            !canSave
              ? (
                  isLegacyDoc
                    ? $t("forge.toolbar.save_disabled_doc")
                    : isHanwordDoc
                      ? $t("forge.toolbar.save_disabled_hwp")
                      : activeDoc?.docType === "presentation"
                        ? $t("forge.toolbar.save_disabled_presentation")
                        : $t("forge.toolbar.save_disabled_pdf")
                )
              : $t("forge.toolbar.save")
          }
        >
          <Save size={16} />
          {$t("forge.toolbar.save")}
        </button>
      </div>
    </div>

    <div
      class="workspace"
      class:chat-open={chatOpen}
      bind:this={workspaceEl}
      style={`--chat-pane-width: ${chatPaneWidth}px;`}
    >
      <div class="main-area">
        {#if isAgentEditing && activeDoc.docType !== 'presentation'}
          <div class="agent-editing-banner">
            <div class="agent-editing-spinner"></div>
            <span>{$t("forge.banner.agent_editing")}</span>
          </div>
        {/if}
        {#if activeDoc.docType === 'excel'}
          <DocPreview
            sessionId={activeDoc.id}
            docType="excel"
            fileName={activeDoc.fileName}
          />
        {:else if activeDoc.docType === 'pdf'}
          {#if pdfOcrMode}
            <PlainTextEditor
              content={pdfOcrText}
              editable={true}
              onchange={handlePdfOcrTextChange}
            />
          {:else}
            <PdfViewer sessionId={activeDoc.id} onAiRewrite={handlePdfAiRewrite} />
          {/if}
        {:else if activeDoc.docType === 'presentation'}
          <PptxViewer
            slides={presentationSlides}
            editable={true}
            isAgentEditing={isAgentEditing}
            onchange={handleSlideChange}
          />
        {:else if activeDoc.docType === 'text'}
          {#if isWordDoc}
            {#if useRichWordEditor}
              <WordEditor
                content={wordEditorContent}
                editable={true}
                onchange={handleTextChange}
                onInlinePrompt={handleInlineRewrite}
              />
            {:else}
              <div class="word-fallback-banner">
                {$t("forge.banner.word_fallback")}
              </div>
              <PlainTextEditor
                content={wordPlainFallbackContent}
                editable={true}
                onchange={handleTextChange}
                onInlinePrompt={handleInlineRewrite}
              />
            {/if}
          {:else if isMarkdownDoc}
            <MarkdownEditor
              content={plainTextContent}
              editable={true}
              onchange={handleTextChange}
            />
          {:else if isJsonDoc}
            <JsonEditor
              content={plainTextContent}
              editable={true}
              onchange={handleTextChange}
            />
          {:else}
            <PlainTextEditor
              content={plainTextContent}
              editable={true}
              onchange={handleTextChange}
              onInlinePrompt={handleInlineRewrite}
            />
          {/if}
        {:else}
          <div class="placeholder-view">
            <FileText size={48} />
            <p>{tr("forge.placeholder.preview_unavailable", { type: activeDoc.docType })}</p>
          </div>
        {/if}
      </div>

      {#if chatOpen}
        <button
          type="button"
          class="pane-resizer"
          aria-label={$t("forge.chat.resize_panel")}
          onmousedown={startPaneResize}
        ></button>
        <div class="chat-side">
          {#if isConnected}
            <ChatPanel />
          {:else if activeGateway}
            <div class="chat-status">
              <div class="chat-status-icon">
                {#if activeGatewayState?.status === "connecting" || activeGatewayState?.status === "authenticating"}
                  <Loader2 size={24} class="spin" />
                {:else if activeGatewayState?.status === "error"}
                  <AlertCircle size={24} />
                {:else}
                  <Unplug size={24} />
                {/if}
              </div>
              <p>{activeGatewayState?.status === "error" ? $t("gateway.status.error") : $t("gateway.status.disconnected")}</p>
              <span class="chat-status-hint">{$t("forge.chat.connect_hint")}</span>
            </div>
          {:else}
            <div class="chat-status">
              <div class="chat-status-icon">
                <MessageSquare size={24} />
              </div>
              <p>{$t("forge.chat.no_gateway")}</p>
              <a href="/settings" class="chat-status-link">{$t("forge.chat.add_gateway")}</a>
            </div>
          {/if}
        </div>
      {/if}
    </div>

  {:else}
    <!-- Landing State -->
    <div class="landing-wrapper" bind:this={workspaceEl}>
      <div class="landing">
        <div class="icon-container">
          <Hammer size={32} strokeWidth={1.5} />
        </div>
        <h2>{$t("forge.landing.title")}</h2>
        <p>{$t("forge.landing.subtitle")}</p>
        {#if openFileError}
          <div class="open-error">
            <AlertCircle size={14} />
            <span>{openFileError}</span>
          </div>
        {/if}

        <div class="collab-hero">
          <div class="collab-hero-left">
            <h3>{$t("forge.landing.hero_title")}</h3>
            <p>{$t("forge.landing.hero_desc")}</p>
          </div>
          <div class="collab-hero-actions">
            <button class="collab-open-btn" onclick={() => handleOpenFile('document')}>
              <Upload size={18} />
              {$t("forge.landing.open_document")}
            </button>
            <div class="new-doc-dropdown">
              <button class="collab-new-btn" onclick={() => showNewDocMenu = !showNewDocMenu}>
                <FilePlus2 size={18} />
                {$t("forge.landing.new_document")}
                <ChevronDown size={14} />
              </button>
              {#if showNewDocMenu}
                <div class="new-doc-menu">
                  {#each newDocTypes as t}
                    <button class="new-doc-item" onclick={() => handleNewDocument(t.ext)}>
                      <span class="new-doc-ext">.{t.ext}</span>
                      <span>{t.label}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>

        <div class="features-grid">
          <a href="/forge/npc" class="feature-card npc">
            <div class="feature-icon">
              <Theater size={24} strokeWidth={1.5} />
            </div>
            <h3>{$t("forge.feature.npc_title")}</h3>
            <p>{$t("forge.feature.npc_desc")}</p>
            <span class="badge">{$t("forge.feature.badge_ready")}</span>
          </a>

          <button class="feature-card" onclick={() => handleOpenFile('spreadsheet')}>
            <div class="feature-icon">
              <Table2 size={24} strokeWidth={1.5} />
            </div>
            <h3>{$t("forge.feature.sheets_title")}</h3>
            <p>{$t("forge.feature.sheets_desc")}</p>
          </button>

          <button class="feature-card collab" onclick={() => handleOpenFile('document')}>
            <div class="feature-icon">
              <FileText size={24} strokeWidth={1.5} />
            </div>
            <h3>{$t("forge.feature.doc_collab_title")}</h3>
            <p>{$t("forge.feature.doc_collab_desc")}</p>
            <span class="badge">{$t("forge.feature.badge_core")}</span>
          </button>

          <button class="feature-card" onclick={() => handleOpenFile('presentation')}>
            <div class="feature-icon">
              <Presentation size={24} strokeWidth={1.5} />
            </div>
            <h3>{$t("forge.feature.presentation_title")}</h3>
            <p>{$t("forge.feature.presentation_desc")}</p>
          </button>
        </div>

        <div class="actions">
          <button class="open-btn" onclick={() => handleOpenFile()}>
            {#if isLoading}
              <Loader2 size={20} class="spin" />
              {$t("forge.action.opening")}
            {:else}
              <Upload size={20} />
              {$t("forge.action.open_file")}
            {/if}
          </button>
        </div>
      </div>

    </div>
  {/if}

  <!-- Approval Modal Overlay (only for spreadsheet patches and non-auto-applied content) -->
  {#if pendingPatch && activeDoc}
    <ApprovalModal
      fileName={activeDoc.fileName}
      preview={{
        changes: pendingPatch.changes || [],
        summary: pendingPatch.summary || $t("forge.approval.proposed_changes")
      }}
      onApprove={handleApprovePatch}
      onReject={handleRejectPatch}
    />
  {/if}

  {#if isFileDragOver}
    <div class="forge-drop-overlay">
      <div class="forge-drop-content">
        <Upload size={26} />
        <strong>{$t("file.drop")}</strong>
        <span>{$t("forge.drop.hint")}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .forge-page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--color-bg);
    position: relative;
  }

  .forge-page.resizing-pane {
    cursor: col-resize;
    user-select: none;
  }

  .forge-page.file-drag-over {
    background: color-mix(in srgb, var(--color-bg) 86%, rgba(99, 102, 241, 0.24));
    transition: background 120ms var(--ease-out);
  }

  .forge-drop-overlay {
    position: absolute;
    inset: 0;
    z-index: 1200;
    pointer-events: none;
    background: rgba(15, 23, 42, 0.28);
    border: 2px dashed rgba(99, 102, 241, 0.45);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
    animation: forge-drop-in 140ms var(--ease-out);
  }

  .forge-drop-content {
    min-width: 320px;
    max-width: min(90vw, 560px);
    margin: 16px;
    padding: 20px 24px;
    border-radius: 14px;
    border: 1px solid rgba(129, 140, 248, 0.42);
    background: rgba(15, 23, 42, 0.8);
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    box-shadow: 0 12px 36px rgba(2, 6, 23, 0.35);
  }

  .forge-drop-content strong {
    font-size: 14px;
    font-weight: 700;
    color: #c7d2fe;
  }

  .forge-drop-content span {
    font-size: 12px;
    color: #cbd5e1;
    line-height: 1.45;
  }

  /* Toolbar */
  .toolbar {
    height: 48px;
    padding: 0 16px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .toolbar-left, .toolbar-right, .toolbar-center {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar-center {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    gap: 6px;
  }

  .action-btn.ocr-btn {
    background: rgba(99, 102, 241, 0.1);
    border-color: rgba(99, 102, 241, 0.3);
    color: var(--color-primary);
  }

  .action-btn.ocr-btn:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.18);
  }

  .action-btn.ocr-save {
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.3);
    color: #10b981;
  }

  .action-btn.ocr-save:hover {
    background: rgba(16, 185, 129, 0.2);
  }

  .action-btn.pdf-export-btn {
    background: rgba(99, 102, 241, 0.1);
    border-color: rgba(99, 102, 241, 0.3);
    color: var(--color-primary);
  }

  .action-btn.pdf-export-btn:hover {
    background: rgba(99, 102, 241, 0.18);
  }

  .tool-btn.active {
    background: rgba(99, 102, 241, 0.12);
    color: var(--color-primary);
  }

  .doc-title {
    font-weight: 600;
    font-size: 13px;
    color: var(--color-text);
  }

  .modified-badge {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--color-warning);
    color: black;
    border-radius: 4px;
    font-weight: 600;
  }

  .tool-btn {
    padding: 6px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--color-text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tool-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .action-btn.secondary {
    background: var(--color-surface-elevated);
    border-color: var(--color-border);
    color: var(--color-text);
  }

  .action-btn.secondary:hover {
    background: var(--color-surface-hover);
  }

  .action-btn.primary {
    background: var(--color-primary);
    color: white;
  }

  .action-btn.primary:hover {
    background: var(--color-primary-hover);
  }

  .action-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  /* Workspace */
  .workspace {
    flex: 1;
    display: flex;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }

  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 16px;
    background: var(--color-bg);
    position: relative;
    height: 100%;
    width: 100%;
    min-width: 0;
    min-height: 0;
    transition: padding-right var(--duration-normal) var(--ease-out);
  }

  .workspace.chat-open .main-area {
    padding-right: calc(var(--chat-pane-width, 520px) + 28px);
  }

  .agent-editing-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    margin-bottom: 8px;
    background: rgba(99, 102, 241, 0.1);
    border: 1px solid rgba(99, 102, 241, 0.25);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-primary);
  }

  .agent-editing-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(99, 102, 241, 0.3);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .pane-resizer {
    width: 12px;
    cursor: col-resize;
    position: absolute;
    top: 20px;
    bottom: 20px;
    right: calc(var(--chat-pane-width, 520px) + 10px);
    background: transparent;
    border: none;
    padding: 0;
    z-index: 5;
  }

  .pane-resizer::before {
    content: "";
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 5px;
    width: 2px;
    background: var(--color-border);
    transition: background var(--duration-fast) var(--ease-out);
    border-radius: 999px;
  }

  .pane-resizer:hover::before,
  .forge-page.resizing-pane .pane-resizer::before {
    background: var(--color-primary);
  }

  /* Chat Side Panel */
  .chat-side {
    position: absolute;
    top: 12px;
    right: 12px;
    bottom: 12px;
    width: var(--chat-pane-width, 520px);
    border: 1px solid var(--color-border);
    border-radius: 14px;
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    box-shadow: 0 18px 44px rgba(2, 6, 23, 0.2);
    backdrop-filter: blur(7px);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    z-index: 4;
    animation: chat-dock-in 180ms var(--ease-out);
  }

  .chat-status {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--color-text-muted);
    padding: 24px;
    text-align: center;
  }

  .chat-status-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    color: var(--color-text-subtle);
    margin-bottom: 4px;
  }

  .chat-status p {
    margin: 0;
    font-size: 13px;
  }

  .chat-status-hint {
    font-size: 11px;
    color: var(--color-text-subtle);
  }

  .chat-status-link {
    font-size: 12px;
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
  }

  .chat-status-link:hover {
    text-decoration: underline;
  }

  .placeholder-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    gap: 16px;
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-lg);
  }

  .word-fallback-banner {
    margin-bottom: 8px;
    padding: 8px 10px;
    border: 1px solid rgba(245, 158, 11, 0.35);
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
  }

  /* Landing State */
  .landing-wrapper {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .landing {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: 40px;
    overflow-y: auto;
  }

  .landing-chat {
    flex-shrink: 0;
  }

  .icon-container {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    color: var(--color-text-subtle);
    margin-bottom: var(--space-sm);
  }

  .landing h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--color-text);
  }

  .landing p {
    margin: 0;
    color: var(--color-text-muted);
  }

  .open-error {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.08);
    border-radius: 8px;
    color: #ef4444;
    font-size: 12px;
    width: 100%;
    max-width: 600px;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin: 40px 0;
    max-width: 600px;
    width: 100%;
  }

  .feature-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 20px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    text-align: left;
    transition: all 0.2s;
    text-decoration: none;
    cursor: pointer;
    position: relative;
  }

  .feature-card:hover {
    border-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .feature-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--color-surface-elevated);
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }

  .feature-card h3 {
    margin: 0 0 4px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .feature-card p {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .feature-card.npc .feature-icon {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.1));
    color: #a78bfa;
  }

  .feature-card.collab .feature-icon {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(16, 185, 129, 0.1));
    color: #34d399;
  }

  .collab-hero {
    width: 100%;
    max-width: 600px;
    border: 1px solid var(--color-border);
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), var(--color-surface));
    border-radius: var(--radius-lg);
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .collab-hero-left h3 {
    margin: 0 0 6px 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
  }

  .collab-hero-left p {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .collab-open-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid rgba(16, 185, 129, 0.35);
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .collab-open-btn:hover {
    background: rgba(16, 185, 129, 0.22);
  }

  .collab-hero-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .collab-new-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid rgba(99, 102, 241, 0.35);
    background: rgba(99, 102, 241, 0.15);
    color: #6366f1;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .collab-new-btn:hover {
    background: rgba(99, 102, 241, 0.22);
  }

  .new-doc-dropdown {
    position: relative;
  }

  .new-doc-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--color-bg-secondary, #1e1e2e);
    border: 1px solid var(--color-border, rgba(255,255,255,0.1));
    border-radius: 8px;
    padding: 4px;
    min-width: 160px;
    z-index: 10;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }

  .new-doc-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-text, #e0e0e0);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .new-doc-item:hover {
    background: rgba(99, 102, 241, 0.15);
  }

  .new-doc-ext {
    font-weight: 700;
    font-size: 11px;
    color: #6366f1;
    min-width: 36px;
  }

  @media (max-width: 900px) {
    .collab-hero {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  @media (max-width: 980px) {
    .workspace,
    .landing-wrapper {
      display: flex;
      flex-direction: column;
    }

    .workspace.chat-open .main-area {
      padding-right: 16px;
    }

    .pane-resizer {
      display: none;
    }

    .chat-side {
      position: static;
      width: 100% !important;
      height: 44vh;
      border-radius: 0;
      box-shadow: none;
      backdrop-filter: none;
      border-left: none;
      border-top: 1px solid var(--color-border);
    }
  }

  .badge {
    position: absolute;
    top: 12px;
    right: 12px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    border-radius: 4px;
  }

  .open-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .open-btn:hover {
    background: var(--color-primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes chat-dock-in {
    from {
      opacity: 0;
      transform: translateX(14px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }

  @keyframes forge-drop-in {
    from {
      opacity: 0;
      transform: scale(0.992);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
