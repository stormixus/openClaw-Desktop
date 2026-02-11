<script lang="ts">
  import { docStore, loadView } from '$lib/stores/document.svelte';
  import ExcelGrid from './ExcelGrid.svelte';
  import { Loader2, AlertCircle, FileText } from '@lucide/svelte';

  interface Props {
    sessionId: string;
    docType: 'excel' | 'pdf' | 'text';
    fileName: string;
  }

  const { sessionId, docType, fileName }: Props = $props();

  let activeTab = $state<string | null>(null);

  // Derived state from store
  const isLoading = $derived(docStore.isLoading);
  const error = $derived(docStore.error);
  const activeDoc = $derived(docStore.activeDocument);

  // Ensure we are looking at the right document
  const isCorrectSession = $derived(activeDoc?.id === sessionId);

  // Set initial active tab when sheets are loaded
  $effect(() => {
    if (isCorrectSession && activeDoc?.sheets && activeDoc.sheets.length > 0 && !activeTab) {
      activeTab = activeDoc.sheets[0].name;
    }
  });

  // Get active sheet data
  const activeSheetData = $derived(
    isCorrectSession ? activeDoc?.sheets?.find(s => s.name === activeTab) : undefined
  );

  function handleTabClick(sheetName: string) {
    activeTab = sheetName;
    if (activeDoc && isCorrectSession) {
      const sheetIndex = activeDoc.sheets.findIndex(s => s.name === sheetName);
      if (sheetIndex !== -1) {
         // Load first page of the tab
         loadView(sessionId, { sheet_index: sheetIndex, start_row: 0, max_rows: 50 });
      }
    }
  }

  function handlePaginate(newStartRow: number) {
    if (docType === 'excel' && activeTab && activeDoc && isCorrectSession) {
      const sheetIndex = activeDoc.sheets.findIndex(s => s.name === activeTab);
      if (sheetIndex !== -1) {
        loadView(sessionId, {
          sheet_index: sheetIndex,
          start_row: newStartRow,
          max_rows: 50
        });
      }
    }
  }
</script>

<div class="doc-preview">
  <div class="preview-header">
    <div class="file-info">
      <FileText size={18} />
      <span class="filename">{fileName}</span>
    </div>
    <div class="status">
      {#if isLoading}
        <span class="loading-badge">
          <Loader2 size={12} class="spin" /> Loading...
        </span>
      {/if}
    </div>
  </div>

  {#if error}
    <div class="error-state">
      <AlertCircle size={32} />
      <p>{error}</p>
      <!-- Retry logic would go here if we had path -->
    </div>
  {:else if !isCorrectSession}
    <div class="loading-state">
      <Loader2 size={32} class="spin" />
      <p>Opening document...</p>
    </div>
  {:else}
    <div class="preview-content">
      {#if docType === 'excel' && activeDoc?.sheets}
        <div class="excel-view">
          {#if activeDoc.sheets.length > 1}
            <div class="sheet-tabs">
              {#each activeDoc.sheets as sheet}
                <button
                  class="tab-btn"
                  class:active={sheet.name === activeTab}
                  onclick={() => handleTabClick(sheet.name)}
                >
                  {sheet.name}
                </button>
              {/each}
            </div>
          {/if}

          <div class="grid-wrapper">
            {#if activeSheetData}
              <ExcelGrid
                rows={activeSheetData.rows}
                totalRows={activeSheetData.totalRows}
                totalCols={activeSheetData.totalCols}
                startRow={activeSheetData.startRow || 0}
                onpaginate={handlePaginate}
              />
            {:else}
              <div class="empty-sheet">No data in this sheet</div>
            {/if}
          </div>
        </div>
      {:else if docType === 'text'}
        <div class="text-view">
          {#if activeDoc?.sheets[0]}
             <pre>{activeDoc.sheets[0].rows.map(row => row.map(c => c.value).join(' ')).join('\n')}</pre>
          {/if}
        </div>
      {:else}
        <div class="unsupported-view">
          <p>Preview for {docType} not fully implemented yet.</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .doc-preview {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text);
    font-weight: 500;
  }

  .loading-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-text-muted);
    background: var(--color-surface-elevated);
    padding: 4px 8px;
    border-radius: 12px;
  }

  .preview-content {
    flex: 1;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* States */
  .error-state, .loading-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    gap: 16px;
  }

  .error-state {
    color: var(--color-error);
  }

  /* Excel View */
  .excel-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .sheet-tabs {
    display: flex;
    gap: 2px;
    background: var(--color-surface);
    padding: 4px 8px 0;
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
  }

  .tab-btn {
    padding: 6px 16px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    font-size: 12px;
    color: var(--color-text-muted);
    cursor: pointer;
    white-space: nowrap;
  }

  .tab-btn.active {
    background: var(--color-bg);
    color: var(--color-primary);
    font-weight: 500;
    border-top: 2px solid var(--color-primary);
    margin-bottom: -1px;
    padding-bottom: 7px;
  }

  .grid-wrapper {
    flex: 1;
    overflow: hidden;
    padding: 1px; /* Avoid border overlap issues */
  }

  /* Text View */
  .text-view {
    padding: 24px;
    overflow: auto;
    background: var(--color-bg);
  }

  .text-view pre {
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-text);
    white-space: pre-wrap;
  }

  /* Animations */
  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
