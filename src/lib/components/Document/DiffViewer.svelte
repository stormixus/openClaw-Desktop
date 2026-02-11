<script lang="ts">
  import type { DiffEntry, CellValue } from '$lib/stores/document.svelte';
  import { ArrowRight } from '@lucide/svelte';

  interface Props {
    changes: DiffEntry[];
    summary: string;
  }

  const { changes, summary }: Props = $props();

  function formatVal(cell: CellValue): string {
    if (cell.value === null) return '(empty)';
    return String(cell.value);
  }

  function colLabel(index: number): string {
    let label = '';
    let n = index;
    while (n >= 0) {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26) - 1;
    }
    return label;
  }
</script>

<div class="diff-viewer">
  <div class="diff-header">
    <h3 class="summary">{summary}</h3>
  </div>

  <div class="diff-table-wrapper">
    <table class="diff-table">
      <thead>
        <tr>
          <th>Location</th>
          <th>Old Value</th>
          <th class="arrow-col"></th>
          <th>New Value</th>
        </tr>
      </thead>
      <tbody>
        {#each changes as change}
          <tr>
            <td class="location">
              <span class="sheet-tag">{change.sheet}</span>
              <span class="cell-coord">{colLabel(change.col)}{change.row + 1}</span>
            </td>
            <td class="old-val">
              {formatVal(change.oldValue)}
            </td>
            <td class="arrow-col">
              <ArrowRight size={14} />
            </td>
            <td class="new-val">
              {formatVal(change.newValue)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .diff-viewer {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .diff-header {
    padding: 12px 16px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .summary {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .diff-table-wrapper {
    max-height: 300px;
    overflow-y: auto;
  }

  .diff-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    text-align: left;
    padding: 8px 16px;
    color: var(--color-text-muted);
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
    position: sticky;
    top: 0;
  }

  td {
    padding: 10px 16px;
    border-bottom: 1px solid var(--color-border);
    vertical-align: top;
  }

  tr:last-child td {
    border-bottom: none;
  }

  .location {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 120px;
  }

  .sheet-tag {
    font-size: 10px;
    color: var(--color-text-muted);
    background: var(--color-surface);
    padding: 2px 6px;
    border-radius: 4px;
    width: fit-content;
  }

  .cell-coord {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--color-primary);
  }

  .old-val {
    color: #ef4444; /* red-500 */
    background: rgba(239, 68, 68, 0.05);
    font-family: var(--font-mono);
    width: 40%;
  }

  .new-val {
    color: #22c55e; /* green-500 */
    background: rgba(34, 197, 94, 0.05);
    font-family: var(--font-mono);
    width: 40%;
  }

  .arrow-col {
    width: 24px;
    padding: 0;
    text-align: center;
    color: var(--color-text-muted);
  }
</style>
