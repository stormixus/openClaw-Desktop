<script lang="ts">
  import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "@lucide/svelte";

  interface CellValue {
    type: 'string' | 'number' | 'bool' | 'datetime' | 'empty';
    value: string | number | boolean | null;
  }

  interface Props {
    rows: CellValue[][];
    startRow?: number;
    totalRows?: number;
    totalCols?: number;
    highlights?: { row: number; col: number; type: 'modified' | 'deleted' | 'added' }[];
    onpaginate?: (startRow: number) => void;
  }

  let { rows, startRow = 0, totalRows = 0, totalCols = 0, highlights = [], onpaginate }: Props = $props();

  const PAGE_SIZE = 50;

  // Calculate pagination state
  // We use derived state for these
  const hasMore = $derived(startRow + rows.length < totalRows);
  const hasPrev = $derived(startRow > 0);

  // Column label generator (A, B, ... Z, AA, AB...)
  function colLabel(index: number): string {
    let label = '';
    let n = index;
    while (n >= 0) {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26) - 1;
    }
    return label;
  }

  function getCellHighlight(rowIndex: number, colIndex: number) {
    // rowIndex is relative to the current page (0..PAGE_SIZE)
    // we need to map it to absolute row index
    const absRow = rowIndex + startRow;
    return highlights.find(h => h.row === absRow && h.col === colIndex);
  }

  function formatValue(cell: CellValue): string {
    if (cell.type === 'empty' || cell.value === null) return '';
    if (cell.type === 'number') return typeof cell.value === 'number' ? cell.value.toLocaleString() : String(cell.value);
    if (cell.type === 'bool') return cell.value ? 'TRUE' : 'FALSE';
    if (cell.type === 'datetime') return String(cell.value); // Could format date better
    return String(cell.value);
  }

  function handlePage(direction: 'prev' | 'next' | 'first' | 'last') {
    if (!onpaginate) return;

    let newStart = startRow;
    if (direction === 'next' && hasMore) newStart += PAGE_SIZE;
    if (direction === 'prev' && hasPrev) newStart = Math.max(0, startRow - PAGE_SIZE);
    if (direction === 'first') newStart = 0;
    if (direction === 'last') newStart = Math.max(0, Math.floor(totalRows / PAGE_SIZE) * PAGE_SIZE);

    onpaginate(newStart);
  }
</script>

<div class="excel-grid-container">
  <div class="grid-scroll">
    <table class="excel-table">
      <thead>
        <tr>
          <th class="row-header corner"></th>
          {#each { length: Math.max(rows[0]?.length || 0, totalCols || 0) } as _, i}
            <th class="col-header">{colLabel(i)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row, rIndex}
          <tr>
            <td class="row-header">{startRow + rIndex + 1}</td>
            {#each row as cell, cIndex}
              {@const highlight = getCellHighlight(rIndex, cIndex)}
              <td
                class="cell type-{cell.type}"
                class:highlight-mod={highlight?.type === 'modified'}
                class:highlight-add={highlight?.type === 'added'}
                class:highlight-del={highlight?.type === 'deleted'}
              >
                {formatValue(cell)}
              </td>
            {/each}
          </tr>
        {/each}
        <!-- Fill empty rows if needed to maintain height visually, or just let it be -->
      </tbody>
    </table>
  </div>

  <div class="pagination-bar">
    <div class="stats">
      Rows {startRow + 1} - {Math.min(startRow + rows.length, totalRows)} of {totalRows}
    </div>
    <div class="controls">
      <button class="icon-btn" disabled={!hasPrev} onclick={() => handlePage('first')} aria-label="First page">
        <ChevronsLeft size={16} />
      </button>
      <button class="icon-btn" disabled={!hasPrev} onclick={() => handlePage('prev')} aria-label="Previous page">
        <ChevronLeft size={16} />
      </button>
      <button class="icon-btn" disabled={!hasMore} onclick={() => handlePage('next')} aria-label="Next page">
        <ChevronRight size={16} />
      </button>
      <button class="icon-btn" disabled={!hasMore} onclick={() => handlePage('last')} aria-label="Last page">
        <ChevronsRight size={16} />
      </button>
    </div>
  </div>
</div>

<style>
  .excel-grid-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .grid-scroll {
    flex: 1;
    overflow: auto;
    position: relative;
  }

  .excel-table {
    border-collapse: separate; /* Required for sticky headers */
    border-spacing: 0;
    width: max-content;
    min-width: 100%;
    font-family: var(--font-mono);
    font-size: 13px;
  }

  th, td {
    padding: 4px 8px;
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    height: 24px;
  }

  /* Headers */
  thead {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--color-surface);
  }

  .col-header {
    background: var(--color-surface-elevated);
    color: var(--color-text-muted);
    font-weight: 600;
    text-align: center;
    border-bottom: 2px solid var(--color-border);
  }

  .row-header {
    background: var(--color-surface-elevated);
    color: var(--color-text-muted);
    font-weight: 600;
    text-align: right;
    border-right: 2px solid var(--color-border);
    position: sticky;
    left: 0;
    z-index: 3; /* Higher than regular cells, but check vs thead */
    min-width: 40px;
  }

  .corner {
    z-index: 4; /* Top-left corner needs highest z-index */
    top: 0;
    left: 0;
    border-bottom: 2px solid var(--color-border);
    border-right: 2px solid var(--color-border);
  }

  /* Cell Styles */
  td.cell {
    background: var(--color-bg);
    color: var(--color-text);
  }

  /* Zebra striping */
  tbody tr:nth-child(even) td.cell {
    background: var(--color-surface);
  }

  /* Data Types */
  .type-number { text-align: right; color: #a5b4fc; } /* Indigo-300 */
  .type-bool { text-align: center; color: #fcd34d; } /* Amber-300 */
  .type-datetime { color: #86efac; } /* Green-300 */
  .type-string { color: var(--color-text); }
  .type-empty { color: transparent; }

  /* Highlights */
  .highlight-mod {
    background: rgba(34, 197, 94, 0.15) !important; /* Green tint */
    box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.3);
  }

  .highlight-add {
    background: rgba(34, 197, 94, 0.25) !important;
    box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.5);
  }

  .highlight-del {
    background: rgba(239, 68, 68, 0.15) !important; /* Red tint */
    text-decoration: line-through;
    opacity: 0.7;
  }

  /* Pagination Bar */
  .pagination-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .controls {
    display: flex;
    gap: 4px;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface-elevated);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.2s;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
