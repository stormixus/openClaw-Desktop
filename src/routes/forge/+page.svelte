<script lang="ts">
  import { t } from "$lib/i18n";
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
    AlertCircle
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
  import { store as gatewayStore, setForgeDocument } from "$lib/gateway/store.svelte";

  import DocPreview from "$lib/components/Document/DocPreview.svelte";
  import WordEditor from "$lib/components/Forge/WordEditor.svelte";
  import MarkdownEditor from "$lib/components/Forge/MarkdownEditor.svelte";
  import JsonEditor from "$lib/components/Forge/JsonEditor.svelte";
  import PlainTextEditor from "$lib/components/Forge/PlainTextEditor.svelte";
  import PdfViewer from "$lib/components/Forge/PdfViewer.svelte";
  import ApprovalModal from "$lib/components/Document/ApprovalModal.svelte";
  import ChatPanel from "$lib/components/Chat/ChatPanel.svelte";

  // Derived state
  const activeDoc = $derived(docStore.activeDocument);
  const isLoading = $derived(docStore.isLoading);
  const pendingPatch = $derived(gatewayStore.forgeState.pendingPatch);

  // Chat panel state
  let chatOpen = $state(true);
  let workspaceEl = $state<HTMLDivElement | null>(null);
  let chatPaneWidth = $state(520);
  let isResizingPane = $state(false);
  let openFileError = $state<string | null>(null);
  let pendingTextContent = $state<string | null>(null);
  let textSyncTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  let isTextSyncing = $state(false);

  const CHAT_PANE_MIN = 360;
  const CHAT_PANE_MAX_RATIO = 0.72;
  const MOBILE_BREAKPOINT = 980;
  const WORD_RICH_MAX_HTML = 1_500_000;
  const OPEN_DOC_TIMEOUT_MS = 15_000;

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
  const canSave = $derived(activeDoc ? activeDoc.docType !== "pdf" && !isLegacyDoc && !isHanwordDoc : false);

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

  // File opening logic
  async function handleOpenFile(filterType?: 'spreadsheet' | 'document' | 'presentation') {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      openFileError = null;

      let filters;
      switch (filterType) {
        case 'spreadsheet':
          filters = [{ name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv', 'ods'] }];
          break;
        case 'document':
          filters = [{ name: 'Documents', extensions: ['txt', 'md', 'json', 'pdf', 'docx', 'doc', 'hwp', 'hwpx'] }];
          break;
        case 'presentation':
          filters = [{ name: 'Presentations', extensions: ['pptx', 'ppt'] }];
          break;
        default:
          filters = [
            { name: 'All Supported', extensions: ['xlsx', 'xls', 'csv', 'ods', 'txt', 'md', 'json', 'pdf', 'docx', 'doc', 'hwp', 'hwpx'] },
            { name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv', 'ods'] },
            { name: 'Text', extensions: ['txt', 'md', 'json', 'pdf', 'docx', 'doc', 'hwp', 'hwpx'] }
          ];
      }

      const selected = await open({ filters });

      if (selected && typeof selected === 'string') {
        const lowerPath = selected.toLowerCase();
        if (lowerPath.endsWith('.ppt') || lowerPath.endsWith('.pptx')) {
          openFileError = "PPT/PPTX는 아직 Forge에서 직접 열 수 없습니다. PDF로 변환해서 열어주세요.";
          return;
        }

        const doc = await Promise.race([
          openDocument(selected),
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), OPEN_DOC_TIMEOUT_MS);
          })
        ]);
        if (!doc) {
          docStore.isLoading = false;
          openFileError = `문서 열기 시간이 초과되었습니다 (${Math.round(OPEN_DOC_TIMEOUT_MS / 1000)}초). 파일이 너무 복잡하거나 변환이 지연되고 있습니다.`;
          return;
        }
        if (doc) {
          const excerpt = doc.sheets[0]?.rows
            .slice(0, 50)
            .map(r => r.map(c => c.value ?? '').join('\t'))
            .join('\n') ?? '';
          setForgeDocument(doc.id, { name: doc.fileName, type: doc.docType, excerpt });
        }
      }
    } catch (err: unknown) {
      console.error("Failed to open file dialog:", err);
      openFileError = err instanceof Error ? err.message : "파일을 열지 못했습니다.";
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

    if (textSyncTimer) {
      clearTimeout(textSyncTimer);
    }
    textSyncTimer = setTimeout(() => {
      textSyncTimer = null;
      void flushTextSync();
    }, 350);
  }

  // Approval Modal Handlers
  async function handleApprovePatch() {
    if (activeDoc && pendingPatch) {
      try {
        await commitChanges(activeDoc.id);
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

<div class="forge-page" class:resizing-pane={isResizingPane}>
  {#if activeDoc}
    <!-- Document View Mode -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="doc-title">{activeDoc.fileName}</span>
        {#if activeDoc.modified}
          <span class="modified-badge">Modified</span>
        {/if}
      </div>

      <div class="toolbar-center">
        <button class="tool-btn" onclick={handleUndo} title="Undo">
          <Undo size={18} />
        </button>
        <button class="tool-btn" onclick={handleRedo} title="Redo">
          <Redo size={18} />
        </button>
      </div>

      <div class="toolbar-right">
        <button class="tool-btn" onclick={toggleChatPane} title={chatOpen ? 'Hide Chat' : 'Show Chat'}>
          {#if chatOpen}
            <PanelRightClose size={18} />
          {:else}
            <PanelRightOpen size={18} />
          {/if}
        </button>
        <button class="action-btn secondary" onclick={handleClose}>
          <X size={16} />
          Close
        </button>
        <button
          class="action-btn primary"
          onclick={handleSave}
          disabled={!canSave}
          title={
            !canSave
              ? (
                  isLegacyDoc
                    ? ".doc 저장은 지원되지 않습니다. .docx로 저장하세요."
                    : isHanwordDoc
                      ? ".hwp/.hwpx 직접 저장은 아직 지원되지 않습니다. .docx로 저장하세요."
                      : "PDF는 저장이 지원되지 않습니다."
                )
              : "Save"
          }
        >
          <Save size={16} />
          Save
        </button>
      </div>
    </div>

    <div class="workspace" bind:this={workspaceEl}>
      <div class="main-area">
        {#if activeDoc.docType === 'excel'}
          <DocPreview
            sessionId={activeDoc.id}
            docType="excel"
            fileName={activeDoc.fileName}
          />
        {:else if activeDoc.docType === 'pdf'}
          <PdfViewer sessionId={activeDoc.id} />
        {:else if activeDoc.docType === 'text'}
          {#if isWordDoc}
            {#if useRichWordEditor}
              <WordEditor
                content={wordEditorContent}
                editable={true}
                onchange={handleTextChange}
              />
            {:else}
              <div class="word-fallback-banner">
                문서가 복잡해서 안정 모드(텍스트 편집)로 열었습니다.
              </div>
              <PlainTextEditor
                content={wordPlainFallbackContent}
                editable={true}
                onchange={handleTextChange}
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
            />
          {/if}
        {:else}
          <div class="placeholder-view">
            <FileText size={48} />
            <p>Preview not available for {activeDoc.docType} files yet.</p>
          </div>
        {/if}
      </div>

      {#if chatOpen}
        <button
          type="button"
          class="pane-resizer"
          aria-label="Resize chat panel"
          onmousedown={startPaneResize}
        ></button>
        <div class="chat-side" style:width={`${chatPaneWidth}px`}>
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
              <span class="chat-status-hint">Connect a gateway to chat</span>
            </div>
          {:else}
            <div class="chat-status">
              <div class="chat-status-icon">
                <MessageSquare size={24} />
              </div>
              <p>No gateway configured</p>
              <a href="/settings" class="chat-status-link">Add Gateway</a>
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
        <h2>문서 협업 도구</h2>
        <p>파일을 열고 AI와 함께 수정안을 만들고 승인하세요</p>
        {#if openFileError}
          <div class="open-error">
            <AlertCircle size={14} />
            <span>{openFileError}</span>
          </div>
        {/if}

        <div class="collab-hero">
          <div class="collab-hero-left">
            <h3>Forge Document Collaboration</h3>
            <p>문서/스프레드시트를 열어 AI 제안 패치를 검토하고, 승인/반려로 협업 흐름을 관리할 수 있습니다.</p>
          </div>
          <button class="collab-open-btn" onclick={() => handleOpenFile('document')}>
            <Upload size={18} />
            문서 열기
          </button>
        </div>

        <div class="features-grid">
          <a href="/forge/npc" class="feature-card npc">
            <div class="feature-icon">
              <Theater size={24} strokeWidth={1.5} />
            </div>
            <h3>NPC Personas</h3>
            <p>Create and customize AI characters</p>
            <span class="badge">Ready</span>
          </a>

          <button class="feature-card" onclick={() => handleOpenFile('spreadsheet')}>
            <div class="feature-icon">
              <Table2 size={24} strokeWidth={1.5} />
            </div>
            <h3>Spreadsheets</h3>
            <p>Edit Excel and CSV files</p>
          </button>

          <button class="feature-card collab" onclick={() => handleOpenFile('document')}>
            <div class="feature-icon">
              <FileText size={24} strokeWidth={1.5} />
            </div>
            <h3>문서 협업</h3>
            <p>Text/Markdown/PDF/DOCX/HWP 문서 열기</p>
            <span class="badge">Core</span>
          </button>

          <button class="feature-card" onclick={() => handleOpenFile('presentation')}>
            <div class="feature-icon">
              <Presentation size={24} strokeWidth={1.5} />
            </div>
            <h3>Presentations</h3>
            <p>PPT/PPTX는 PDF 변환 후 열기</p>
          </button>
        </div>

        <div class="actions">
          <button class="open-btn" onclick={() => handleOpenFile()}>
            {#if isLoading}
              <Loader2 size={20} class="spin" />
              Opening...
            {:else}
              <Upload size={20} />
              Open File...
            {/if}
          </button>
        </div>
      </div>

      {#if chatOpen}
        <button
          type="button"
          class="pane-resizer"
          aria-label="Resize chat panel"
          onmousedown={startPaneResize}
        ></button>
        <div class="chat-side landing-chat" style:width={`${chatPaneWidth}px`}>
          {#if isConnected}
            <ChatPanel />
          {:else if activeGateway}
            <div class="chat-status">
              <div class="chat-status-icon">
                <Unplug size={24} />
              </div>
              <p>{$t("gateway.status.disconnected")}</p>
              <span class="chat-status-hint">Connect a gateway to chat</span>
            </div>
          {:else}
            <div class="chat-status">
              <div class="chat-status-icon">
                <MessageSquare size={24} />
              </div>
              <p>No gateway configured</p>
              <a href="/settings" class="chat-status-link">Add Gateway</a>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Approval Modal Overlay -->
  {#if pendingPatch && activeDoc}
    <ApprovalModal
      fileName={activeDoc.fileName}
      preview={{
        changes: pendingPatch.changes || [],
        summary: pendingPatch.summary || "Proposed changes"
      }}
      onApprove={handleApprovePatch}
      onReject={handleRejectPatch}
    />
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
    overflow: hidden;
  }

  .main-area {
    flex: 1;
    overflow: hidden;
    padding: 16px;
    background: var(--color-bg);
  }

  .pane-resizer {
    width: 8px;
    cursor: col-resize;
    flex-shrink: 0;
    position: relative;
    background: transparent;
    border: none;
    padding: 0;
  }

  .pane-resizer::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: 2px;
    background: var(--color-border);
    transition: background var(--duration-fast) var(--ease-out);
  }

  .pane-resizer:hover::before,
  .forge-page.resizing-pane .pane-resizer::before {
    background: var(--color-primary);
  }

  /* Chat Side Panel */
  .chat-side {
    width: clamp(360px, 34vw, 520px);
    flex-shrink: 0;
    border-left: 1px solid var(--color-border);
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    min-height: 0;
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

  @media (max-width: 900px) {
    .collab-hero {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  @media (max-width: 980px) {
    .workspace,
    .landing-wrapper {
      flex-direction: column;
    }

    .pane-resizer {
      display: none;
    }

    .chat-side {
      width: 100% !important;
      height: 44vh;
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
</style>
