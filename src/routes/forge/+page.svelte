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
    commitChanges,
    discardChanges,
    type PatchPreview
  } from "$lib/stores/document.svelte";
  import { store as gatewayStore, setForgeDocument } from "$lib/gateway/store.svelte";

  import DocPreview from "$lib/components/Document/DocPreview.svelte";
  import WordEditor from "$lib/components/Forge/WordEditor.svelte";
  import ApprovalModal from "$lib/components/Document/ApprovalModal.svelte";
  import ChatPanel from "$lib/components/Chat/ChatPanel.svelte";

  // Derived state
  const activeDoc = $derived(docStore.activeDocument);
  const isLoading = $derived(docStore.isLoading);
  const pendingPatch = $derived(gatewayStore.forgeState.pendingPatch);

  // Chat panel state
  let chatOpen = $state(true);

  // Gateway connection
  const activeGateway = $derived(gatewayStore.gateways.find(g => g.id === gatewayStore.activeGatewayId) ?? null);
  const activeGatewayState = $derived(gatewayStore.activeGatewayId ? gatewayStore.gatewayStates.get(gatewayStore.activeGatewayId) ?? null : null);
  const isConnected = $derived(activeGatewayState?.status === "connected");

  // File opening logic
  async function handleOpenFile(filterType?: 'spreadsheet' | 'document' | 'presentation') {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');

      let filters;
      switch (filterType) {
        case 'spreadsheet':
          filters = [{ name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv', 'ods'] }];
          break;
        case 'document':
          filters = [{ name: 'Documents', extensions: ['txt', 'md', 'json', 'pdf', 'docx'] }];
          break;
        case 'presentation':
          filters = [{ name: 'Presentations', extensions: ['pptx', 'ppt'] }];
          break;
        default:
          filters = [
            { name: 'All Supported', extensions: ['xlsx', 'xls', 'csv', 'ods', 'txt', 'md', 'json', 'pdf', 'docx'] },
            { name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv', 'ods'] },
            { name: 'Text', extensions: ['txt', 'md', 'json', 'pdf', 'docx'] }
          ];
      }

      const selected = await open({ filters });

      if (selected && typeof selected === 'string') {
        const doc = await openDocument(selected);
        if (doc) {
          const excerpt = doc.sheets[0]?.rows
            .slice(0, 50)
            .map(r => r.map(c => c.value ?? '').join('\t'))
            .join('\n') ?? '';
          setForgeDocument(doc.id, { name: doc.fileName, type: doc.docType, excerpt });
        }
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  }

  // Toolbar actions
  async function handleSave() {
    if (activeDoc) {
      await saveDocument(activeDoc.id);
    }
  }

  async function handleClose() {
    if (activeDoc) {
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
    console.log("Text changed (not yet synced to backend):", newContent);
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

<div class="forge-page">
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
        <button class="tool-btn" onclick={() => chatOpen = !chatOpen} title={chatOpen ? 'Hide Chat' : 'Show Chat'}>
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
        <button class="action-btn primary" onclick={handleSave}>
          <Save size={16} />
          Save
        </button>
      </div>
    </div>

    <div class="workspace">
      <div class="main-area">
        {#if activeDoc.docType === 'excel'}
          <DocPreview
            sessionId={activeDoc.id}
            docType="excel"
            fileName={activeDoc.fileName}
          />
        {:else if activeDoc.docType === 'text'}
          <WordEditor
            content={activeDoc.sheets[0]?.rows.map(r => r.map(c => c.value).join(' ')).join('\n') ?? ''}
            onchange={handleTextChange}
          />
        {:else}
          <div class="placeholder-view">
            <FileText size={48} />
            <p>Preview not available for {activeDoc.docType} files yet.</p>
          </div>
        {/if}
      </div>

      {#if chatOpen}
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
    <div class="landing-wrapper">
      <div class="landing">
        <div class="icon-container">
          <Hammer size={32} strokeWidth={1.5} />
        </div>
        <h2>문서 협업 도구</h2>
        <p>파일을 열고 AI와 함께 수정안을 만들고 승인하세요</p>

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
            <p>Text/Markdown/PDF/DOCX 문서 열기</p>
            <span class="badge">Core</span>
          </button>

          <button class="feature-card" onclick={() => handleOpenFile('presentation')}>
            <div class="feature-icon">
              <Presentation size={24} strokeWidth={1.5} />
            </div>
            <h3>Presentations</h3>
            <p>View presentation decks</p>
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
        <div class="chat-side landing-chat">
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

  /* Chat Side Panel */
  .chat-side {
    width: 380px;
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
