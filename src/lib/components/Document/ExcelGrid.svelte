<script lang="ts">
  import { tick } from "svelte";
  import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus, Minus } from "@lucide/svelte";

  interface CellValue {
    type: 'string' | 'number' | 'bool' | 'datetime' | 'empty';
    value: string | number | boolean | null;
  }

  interface FormulaCell {
    row: number;
    col: number;
    formula: string;
  }

  interface MergeRange {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  }

  interface MergeRenderInfo {
    row: number;
    col: number;
    rowspan: number;
    colspan: number;
  }

  interface RowHeight {
    row: number;
    height: number;
  }

  interface ColWidth {
    startCol: number;
    endCol: number;
    width: number;
  }

  interface CellStyle {
    fontName?: string | null;
    fontSize?: number | null;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    fontColor?: string | null;
    bgColor?: string | null;
    hAlign?: string | null;
    vAlign?: string | null;
    wrapText: boolean;
    borderLeft: boolean;
    borderRight: boolean;
    borderTop: boolean;
    borderBottom: boolean;
    numberFormatId?: number | null;
  }

  interface StyledCell {
    row: number;
    col: number;
    style: CellStyle;
  }

  type StructureAction = 'row_insert' | 'row_delete' | 'col_insert' | 'col_delete';

  interface ContextMenuState {
    kind: 'row' | 'col';
    index: number;
    x: number;
    y: number;
  }

  interface Props {
    rows: CellValue[][];
    startRow?: number;
    totalRows?: number;
    totalCols?: number;
    formulas?: FormulaCell[];
    mergedRanges?: MergeRange[];
    rowHeights?: RowHeight[];
    colWidths?: ColWidth[];
    styledCells?: StyledCell[];
    highlights?: { row: number; col: number; type: 'modified' | 'deleted' | 'added' }[];
    onpaginate?: (startRow: number) => void;
    oncellupdate?: (row: number, col: number, input: string) => void | Promise<void>;
    onstructurechange?: (
      action: StructureAction,
      index: number
    ) => void | Promise<void>;
  }

  let {
    rows,
    startRow = 0,
    totalRows = 0,
    totalCols = 0,
    formulas = [],
    mergedRanges = [],
    rowHeights = [],
    colWidths = [],
    styledCells = [],
    highlights = [],
    onpaginate,
    oncellupdate,
    onstructurechange,
  }: Props = $props();

  const PAGE_SIZE = 50;
  const EMPTY_CELL: CellValue = { type: 'empty', value: null };

  let selectedRow = $state<number | null>(null);
  let selectedCol = $state<number | null>(null);
  let selectionMode = $state<'cell' | 'row' | 'col'>('cell');
  let formulaInput = $state('');
  let isCommitting = $state(false);
  let isStructureApplying = $state(false);
  let formulaInputEl = $state<HTMLInputElement | null>(null);
  let inlineEditingRow = $state<number | null>(null);
  let inlineEditingCol = $state<number | null>(null);
  let inlineEditingValue = $state('');
  let inlineEditorEl = $state<HTMLInputElement | null>(null);
  let rootEl = $state<HTMLDivElement | null>(null);
  let contextMenuEl = $state<HTMLDivElement | null>(null);
  let contextMenu = $state<ContextMenuState | null>(null);

  const hasMore = $derived(startRow + rows.length < totalRows);
  const hasPrev = $derived(startRow > 0);
  const columnCount = $derived(
    Math.max(
      totalCols || 0,
      rows.reduce((max, row) => Math.max(max, row.length), 0),
      1,
    ),
  );

  function hasMeaningfulCell(cell: CellValue | undefined): boolean {
    if (!cell || cell.type === 'empty' || cell.value === null) return false;
    if (typeof cell.value === 'string') return cell.value.trim().length > 0;
    return true;
  }

  function getVisibleStartCol(): number {
    if (columnCount <= 1) return 0;

    let minCol = Number.POSITIVE_INFINITY;
    const pageStart = startRow;
    const pageEnd = startRow + rows.length - 1;

    for (const row of rows) {
      for (let c = 0; c < Math.min(row.length, columnCount); c++) {
        if (hasMeaningfulCell(row[c])) {
          minCol = Math.min(minCol, c);
          break;
        }
      }
    }

    for (const f of formulas) {
      if (f.row >= pageStart && f.row <= pageEnd) {
        minCol = Math.min(minCol, f.col);
      }
    }

    for (const m of mergedRanges) {
      if (m.endRow >= pageStart && m.startRow <= pageEnd) {
        minCol = Math.min(minCol, m.startCol);
      }
    }

    if (!Number.isFinite(minCol)) return 0;
    return Math.max(0, Math.min(columnCount - 1, minCol));
  }

  const displayColumnCount = $derived(
    Math.max(1, columnCount - getVisibleStartCol()),
  );

  function cellKey(row: number, col: number): string {
    return `${row}:${col}`;
  }

  const formulaByKey = $derived(() => {
    const map = new Map<string, string>();
    for (const cell of formulas) {
      if (!cell.formula) continue;
      map.set(cellKey(cell.row, cell.col), cell.formula);
    }
    return map;
  });

  const styledByKey = $derived(() => {
    const map = new Map<string, CellStyle>();
    for (const entry of styledCells) {
      map.set(cellKey(entry.row, entry.col), entry.style);
    }
    return map;
  });

  const rowHeightByRow = $derived(() => {
    const map = new Map<number, number>();
    for (const h of rowHeights) {
      if (h.height > 0) {
        map.set(h.row, h.height);
      }
    }
    return map;
  });

  const colWidthByCol = $derived(() => {
    const map = new Map<number, number>();
    for (const w of colWidths) {
      if (w.width <= 0) continue;
      const start = Math.max(0, w.startCol);
      const end = Math.max(start, w.endCol);
      for (let c = start; c <= end; c++) {
        map.set(c, w.width);
      }
    }
    return map;
  });

  const mergeLayout = $derived(() => {
    const startByKey = new Map<string, MergeRenderInfo>();
    const covered = new Set<string>();
    if (rows.length === 0 || displayColumnCount <= 0) {
      return { startByKey, covered };
    }

    const pageEnd = startRow + rows.length - 1;
    const visStart = getVisibleStartCol();
    const visEnd = getVisibleStartCol() + displayColumnCount - 1;

    for (const range of mergedRanges) {
      if (range.endRow < startRow || range.startRow > pageEnd) continue;
      if (range.startCol > visEnd || range.endCol < visStart) continue;

      if (range.startRow < startRow) continue;

      const startCol = Math.max(visStart, range.startCol);
      const endCol = Math.min(visEnd, range.endCol);
      const endRow = Math.min(pageEnd, range.endRow);

      const rowspan = endRow - range.startRow + 1;
      const colspan = endCol - startCol + 1;
      if (rowspan <= 1 && colspan <= 1) continue;

      const info: MergeRenderInfo = {
        row: range.startRow,
        col: startCol,
        rowspan,
        colspan,
      };

      startByKey.set(cellKey(info.row, info.col), info);

      for (let r = range.startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          if (r === info.row && c === info.col) continue;
          covered.add(cellKey(r, c));
        }
      }
    }

    return { startByKey, covered };
  });

  const highlightByKey = $derived(() => {
    const map = new Map<string, 'modified' | 'deleted' | 'added'>();
    for (const h of highlights) {
      map.set(cellKey(h.row, h.col), h.type);
    }
    return map;
  });

  function colLabel(index: number): string {
    let label = '';
    let n = index;
    while (n >= 0) {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26) - 1;
    }
    return label;
  }

  function cellAddress(row: number, col: number): string {
    return `${colLabel(col)}${row + 1}`;
  }

  function formatValue(cell: CellValue): string {
    if (cell.type === 'empty' || cell.value === null) return '';
    if (cell.type === 'number') return String(cell.value);
    if (cell.type === 'bool') return cell.value ? 'TRUE' : 'FALSE';
    return String(cell.value);
  }

  function excelColWidthToPx(width: number): number {
    return Math.min(520, Math.max(40, Math.round(width * 7 + 5)));
  }

  function excelRowHeightToPx(height: number): number {
    return Math.max(18, Math.round(height * (96 / 72)));
  }

  function normalizeColor(color?: string | null): string | null {
    if (!color) return null;
    const value = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    return null;
  }

  function normalizeAlign(value?: string | null): string | null {
    if (!value) return null;
    const v = value.toLowerCase();
    if (v === 'left' || v === 'center' || v === 'right' || v === 'justify') return v;
    if (v === 'distributed') return 'justify';
    return null;
  }

  function normalizeVAlign(value?: string | null): string | null {
    if (!value) return null;
    const v = value.toLowerCase();
    if (v === 'top' || v === 'middle' || v === 'bottom') return v;
    if (v === 'center') return 'middle';
    return null;
  }

  function getColumnSizeStyle(col: number): string {
    const width = colWidthByCol().get(col);
    if (width === undefined) return '';
    if (width <= 0) return 'display:none;';
    const px = excelColWidthToPx(width);
    return `min-width:${px}px;width:${px}px;`;
  }

  function getRowStyle(absRow: number): string | undefined {
    const height = rowHeightByRow().get(absRow);
    if (!height) return undefined;
    return `height:${excelRowHeightToPx(height)}px;`;
  }

  function getCellStyle(absRow: number, col: number): string {
    const css: string[] = [];
    const colStyle = getColumnSizeStyle(col);
    if (colStyle) css.push(colStyle);

    const style = styledByKey().get(cellKey(absRow, col));
    if (!style) return css.join('');

    if (style.fontName) css.push(`font-family:${JSON.stringify(style.fontName)};`);
    if (style.fontSize && style.fontSize > 0) css.push(`font-size:${style.fontSize}pt;`);
    if (style.bold) css.push('font-weight:700;');
    if (style.italic) css.push('font-style:italic;');
    if (style.underline) css.push('text-decoration:underline;');
    const fg = normalizeColor(style.fontColor);
    if (fg) css.push(`color:${fg};`);
    const bg = normalizeColor(style.bgColor);
    if (bg) css.push(`background:${bg};`);
    const hAlign = normalizeAlign(style.hAlign);
    if (hAlign) css.push(`text-align:${hAlign};`);
    const vAlign = normalizeVAlign(style.vAlign);
    if (vAlign) css.push(`vertical-align:${vAlign};`);
    if (style.wrapText) css.push('white-space:normal;word-break:break-word;');
    if (style.borderLeft) css.push('border-left:1px solid #6b7280;');
    if (style.borderRight) css.push('border-right:1px solid #6b7280;');
    if (style.borderTop) css.push('border-top:1px solid #6b7280;');
    if (style.borderBottom) css.push('border-bottom:1px solid #6b7280;');

    return css.join('');
  }

  function currentCellInput(absRow: number, col: number): string {
    const key = cellKey(absRow, col);
    const formula = formulaByKey().get(key);
    if (formula !== undefined) return `=${formula}`;

    const rel = absRow - startRow;
    const cell = rows[rel]?.[col] ?? EMPTY_CELL;
    return formatValue(cell);
  }

  function normalizeCell(absRow: number, col: number): { row: number; col: number } {
    const layout = mergeLayout();
    let normalizedCol = col;
    while (normalizedCol > 0 && layout.covered.has(cellKey(absRow, normalizedCol))) {
      normalizedCol--;
    }
    return { row: absRow, col: normalizedCol };
  }

  function selectCell(absRow: number, col: number): void {
    const normalized = normalizeCell(absRow, col);
    selectedRow = normalized.row;
    selectedCol = normalized.col;
    selectionMode = 'cell';
    formulaInput = currentCellInput(normalized.row, normalized.col);
  }

  function isInlineEditingCell(absRow: number, col: number): boolean {
    return inlineEditingRow === absRow && inlineEditingCol === col;
  }

  function stopInlineEdit(): void {
    inlineEditingRow = null;
    inlineEditingCol = null;
    inlineEditingValue = '';
    inlineEditorEl = null;
  }

  async function startInlineEdit(absRow: number, col: number, seed?: string): Promise<void> {
    const normalized = normalizeCell(absRow, col);
    selectCell(normalized.row, normalized.col);
    inlineEditingRow = normalized.row;
    inlineEditingCol = normalized.col;
    inlineEditingValue = seed ?? currentCellInput(normalized.row, normalized.col);
    formulaInput = inlineEditingValue;
    await tick();
    inlineEditorEl?.focus();
    if (seed === undefined) {
      inlineEditorEl?.select();
    } else {
      const end = inlineEditingValue.length;
      inlineEditorEl?.setSelectionRange(end, end);
    }
  }

  function cancelInlineEdit(): void {
    if (inlineEditingRow !== null && inlineEditingCol !== null) {
      formulaInput = currentCellInput(inlineEditingRow, inlineEditingCol);
    }
    stopInlineEdit();
  }

  async function commitInlineEdit(move: 'none' | 'down' | 'right' = 'none'): Promise<void> {
    if (inlineEditingRow === null || inlineEditingCol === null) return;
    formulaInput = inlineEditingValue;
    stopInlineEdit();
    await commitFormulaInput();
    if (move === 'down') moveSelection(1, 0);
    if (move === 'right') moveSelection(0, 1);
  }

  function handleInlineEditorKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitInlineEdit('down');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      void commitInlineEdit('right');
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelInlineEdit();
      return;
    }
  }

  function handleFormulaInput(): void {
    if (inlineEditingRow !== null && inlineEditingCol !== null) {
      inlineEditingValue = formulaInput;
    }
  }

  function selectRow(absRow: number): void {
    stopInlineEdit();
    const nextCol = selectedCol ?? Math.max(0, getVisibleStartCol());
    const normalized = normalizeCell(absRow, nextCol);
    selectedRow = normalized.row;
    selectedCol = normalized.col;
    selectionMode = 'row';
    formulaInput = currentCellInput(normalized.row, normalized.col);
  }

  function selectColumn(col: number): void {
    stopInlineEdit();
    const nextRow = selectedRow ?? startRow;
    const normalized = normalizeCell(nextRow, col);
    selectedRow = normalized.row;
    selectedCol = normalized.col;
    selectionMode = 'col';
    formulaInput = currentCellInput(normalized.row, normalized.col);
  }

  function openHeaderContextMenu(event: MouseEvent, kind: 'row' | 'col', index: number): void {
    event.preventDefault();
    event.stopPropagation();

    if (kind === 'row') {
      selectRow(index);
    } else {
      selectColumn(index);
    }

    const host = rootEl;
    if (!host) {
      contextMenu = { kind, index, x: event.clientX, y: event.clientY };
      return;
    }

    const rect = host.getBoundingClientRect();
    const menuWidth = 164;
    const menuHeight = 88;
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    const x = Math.min(Math.max(rawX, 8), Math.max(8, host.clientWidth - menuWidth - 8));
    const y = Math.min(Math.max(rawY, 8), Math.max(8, host.clientHeight - menuHeight - 8));
    contextMenu = { kind, index, x, y };
  }

  function closeContextMenu(): void {
    contextMenu = null;
  }

  function handleWindowMouseDown(event: MouseEvent): void {
    if (!contextMenu) return;
    const target = event.target as Node | null;
    if (contextMenuEl && target && contextMenuEl.contains(target)) return;
    closeContextMenu();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      closeContextMenu();
    }
  }

  async function applyStructureAction(
    action: StructureAction,
    index: number | null,
  ): Promise<void> {
    if (!onstructurechange || index === null || isStructureApplying) return;
    closeContextMenu();
    isStructureApplying = true;
    try {
      await onstructurechange(action, index);
      stopInlineEdit();
    } catch (err) {
      console.error('Failed to update structure', err);
    } finally {
      isStructureApplying = false;
    }
  }

  $effect(() => {
    if (rows.length === 0) {
      selectedRow = null;
      selectedCol = null;
      formulaInput = '';
      return;
    }

    const firstRow = startRow;
    const lastRow = startRow + rows.length - 1;
    const maxCol = Math.max(0, columnCount - 1);
    const minCol = Math.max(0, getVisibleStartCol());
    if (selectedRow === null || selectedCol === null) {
      selectCell(firstRow, minCol);
      return;
    }

    if (selectedRow < firstRow || selectedRow > lastRow || selectedCol < minCol || selectedCol > maxCol) {
      selectCell(
        Math.min(Math.max(selectedRow, firstRow), lastRow),
        Math.min(Math.max(selectedCol, minCol), maxCol),
      );
    } else if (inlineEditingRow === null || inlineEditingCol === null) {
      formulaInput = currentCellInput(selectedRow, selectedCol);
    }
  });

  async function commitFormulaInput(): Promise<void> {
    if (!oncellupdate || selectedRow === null || selectedCol === null || isCommitting) return;
    const next = formulaInput;
    const prev = currentCellInput(selectedRow, selectedCol);
    if (next === prev) return;

    isCommitting = true;
    try {
      await oncellupdate(selectedRow, selectedCol, next);
    } catch (err) {
      console.error('Failed to update cell', err);
    } finally {
      isCommitting = false;
      if (selectedRow !== null && selectedCol !== null) {
        formulaInput = currentCellInput(selectedRow, selectedCol);
      }
    }
  }

  function moveSelection(deltaRow: number, deltaCol: number): void {
    if (selectedRow === null || selectedCol === null || rows.length === 0) return;
    const minRow = startRow;
    const maxRow = startRow + rows.length - 1;
    const minCol = Math.max(0, getVisibleStartCol());
    const maxCol = Math.max(0, columnCount - 1);
    const nextRow = Math.min(Math.max(selectedRow + deltaRow, minRow), maxRow);
    const nextCol = Math.min(Math.max(selectedCol + deltaCol, minCol), maxCol);
    selectCell(nextRow, nextCol);
  }

  function handleGridKeydown(event: KeyboardEvent): void {
    if (rows.length === 0) return;
    if (inlineEditingRow !== null && inlineEditingCol !== null) return;

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1, 0);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, 0);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(0, -1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(0, 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitFormulaInput().then(() => moveSelection(1, 0));
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      if (selectedRow !== null && selectedCol !== null) {
        void startInlineEdit(selectedRow, selectedCol);
      }
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      formulaInput = '';
      void commitFormulaInput();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (selectedRow !== null && selectedCol !== null) {
        event.preventDefault();
        void startInlineEdit(selectedRow, selectedCol, event.key);
      }
    }
  }

  function handleFormulaKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitFormulaInput();
      return;
    }
    if (event.key === 'Escape' && selectedRow !== null && selectedCol !== null) {
      event.preventDefault();
      formulaInput = currentCellInput(selectedRow, selectedCol);
    }
  }

  function handlePage(direction: 'prev' | 'next' | 'first' | 'last') {
    if (!onpaginate) return;

    let newStart = startRow;
    if (direction === 'next' && hasMore) newStart += PAGE_SIZE;
    if (direction === 'prev' && hasPrev) newStart = Math.max(0, startRow - PAGE_SIZE);
    if (direction === 'first') newStart = 0;
    if (direction === 'last') {
      newStart = totalRows > 0 ? Math.floor((totalRows - 1) / PAGE_SIZE) * PAGE_SIZE : 0;
    }

    onpaginate(newStart);
  }

  function handleGridScroll(): void {
    if (contextMenu) {
      closeContextMenu();
    }
  }
</script>

<svelte:window onmousedown={handleWindowMouseDown} onkeydown={handleWindowKeydown} />

<div class="excel-grid-container" bind:this={rootEl}>
  <div class="formula-bar">
    <div class="name-box">
      {#if selectedRow !== null && selectedCol !== null}
        {cellAddress(selectedRow, selectedCol)}
      {:else}
        -
      {/if}
    </div>
    <div class="fx-label">fx</div>
    <input
      class="formula-input"
      bind:this={formulaInputEl}
      bind:value={formulaInput}
      placeholder="셀 값 또는 수식(=SUM(A1:A10))"
      disabled={selectedRow === null || selectedCol === null || isCommitting}
      oninput={handleFormulaInput}
      onkeydown={handleFormulaKeydown}
      onblur={() => void commitFormulaInput()}
    />
  </div>

  <div
    class="grid-scroll"
    tabindex="0"
    role="grid"
    aria-label="Spreadsheet grid"
    onkeydown={handleGridKeydown}
    onscroll={handleGridScroll}
  >
    <table class="excel-table">
      <thead>
        <tr>
          <th class="row-header corner"></th>
          {#each { length: displayColumnCount } as _, i}
            {@const actualCol = getVisibleStartCol() + i}
            <th
              class="col-header"
              class:selected-col={selectionMode === 'col' && selectedCol === actualCol}
              style={getColumnSizeStyle(actualCol)}
              onclick={() => selectColumn(actualCol)}
              oncontextmenu={(event) => openHeaderContextMenu(event, 'col', actualCol)}
            >
              {colLabel(actualCol)}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row, rIndex}
          {@const absRow = startRow + rIndex}
          <tr class:selected-row={selectionMode === 'row' && selectedRow === absRow} style={getRowStyle(absRow)}>
            <td
              class="row-header"
              class:selected-row={selectionMode === 'row' && selectedRow === absRow}
              onclick={() => selectRow(absRow)}
              oncontextmenu={(event) => openHeaderContextMenu(event, 'row', absRow)}
            >
              {absRow + 1}
            </td>
            {#each { length: displayColumnCount } as _, cIndex}
              {@const actualCol = getVisibleStartCol() + cIndex}
              {@const key = cellKey(absRow, actualCol)}
              {#if !mergeLayout().covered.has(key)}
                {@const merge = mergeLayout().startByKey.get(key)}
                {@const cell = row[actualCol] ?? EMPTY_CELL}
                {@const formula = formulaByKey().get(key)}
                {@const highlight = highlightByKey().get(key)}
                <td
                  class="cell type-{cell.type}"
                  class:has-formula={!!formula}
                  class:selected={selectedRow === absRow && selectedCol === actualCol}
                  class:selected-row={selectionMode === 'row' && selectedRow === absRow}
                  class:selected-col={selectionMode === 'col' && selectedCol === actualCol}
                  class:editing={isInlineEditingCell(absRow, actualCol)}
                  class:highlight-mod={highlight === 'modified'}
                  class:highlight-add={highlight === 'added'}
                  class:highlight-del={highlight === 'deleted'}
                  colspan={merge?.colspan}
                  rowspan={merge?.rowspan}
                  style={getCellStyle(absRow, actualCol)}
                  title={formula ? `=${formula}` : undefined}
                  onclick={() => selectCell(absRow, actualCol)}
                  ondblclick={() => void startInlineEdit(absRow, actualCol)}
                >
                  {#if isInlineEditingCell(absRow, actualCol)}
                    <input
                      class="cell-editor"
                      bind:this={inlineEditorEl}
                      bind:value={inlineEditingValue}
                      onkeydown={handleInlineEditorKeydown}
                      oninput={() => formulaInput = inlineEditingValue}
                      onblur={() => void commitInlineEdit()}
                      onclick={(e) => e.stopPropagation()}
                    />
                  {:else}
                    {#if formula}
                      <span class="formula-badge">fx</span>
                    {/if}
                    <span class="cell-value">{formatValue(cell)}</span>
                  {/if}
                </td>
              {/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if contextMenu}
    {@const menu = contextMenu}
    <div
      class="context-menu"
      bind:this={contextMenuEl}
      role="menu"
      aria-label="행열 컨텍스트 메뉴"
      tabindex="-1"
      style={`left:${menu.x}px;top:${menu.y}px;`}
      onmousedown={(event) => event.stopPropagation()}
    >
      {#if menu.kind === 'row'}
        <button
          class="context-item"
          disabled={isStructureApplying}
          onclick={() => void applyStructureAction('row_insert', menu.index)}
        >
          <Plus size={14} />
          행 삽입
        </button>
        <button
          class="context-item danger"
          disabled={isStructureApplying}
          onclick={() => void applyStructureAction('row_delete', menu.index)}
        >
          <Minus size={14} />
          행 삭제
        </button>
      {:else}
        <button
          class="context-item"
          disabled={isStructureApplying}
          onclick={() => void applyStructureAction('col_insert', menu.index)}
        >
          <Plus size={14} />
          열 삽입
        </button>
        <button
          class="context-item danger"
          disabled={isStructureApplying}
          onclick={() => void applyStructureAction('col_delete', menu.index)}
        >
          <Minus size={14} />
          열 삭제
        </button>
      {/if}
    </div>
  {/if}

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
    --excel-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Helvetica Neue", Arial, sans-serif;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    position: relative;
    font-family: var(--excel-font);
  }

  .formula-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .name-box {
    width: 84px;
    height: 30px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface-elevated);
    color: var(--color-text);
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--excel-font);
  }

  .fx-label {
    width: 32px;
    height: 30px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--excel-font);
  }

  .formula-input {
    flex: 1;
    height: 30px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    padding: 0 10px;
    font-family: var(--excel-font);
    font-size: 12px;
  }

  .formula-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 24%, transparent);
  }

  .formula-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .context-menu {
    position: absolute;
    min-width: 140px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
    padding: 6px;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .context-item {
    height: 30px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--color-text);
    font-size: 12px;
    text-align: left;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .context-item:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
    border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
  }

  .context-item.danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.28);
    color: #ef4444;
  }

  .context-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .grid-scroll {
    flex: 1;
    overflow: auto;
    position: relative;
    outline: none;
  }

  .excel-table {
    border-collapse: separate;
    border-spacing: 0;
    width: max-content;
    min-width: 100%;
    font-family: var(--excel-font);
    font-size: 13px;
  }

  th, td {
    padding: 4px 8px;
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    height: 24px;
    vertical-align: middle;
  }

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
    min-width: 88px;
    cursor: pointer;
  }

  .row-header {
    background: var(--color-surface-elevated);
    color: var(--color-text-muted);
    font-weight: 600;
    text-align: right;
    border-right: 2px solid var(--color-border);
    position: sticky;
    left: 0;
    z-index: 3;
    min-width: 48px;
    cursor: pointer;
  }

  .corner {
    z-index: 4;
    top: 0;
    left: 0;
    border-bottom: 2px solid var(--color-border);
    border-right: 2px solid var(--color-border);
  }

  td.cell {
    background: var(--color-bg);
    color: var(--color-text);
    min-width: 88px;
    position: relative;
    cursor: cell;
  }

  tbody tr:nth-child(even) td.cell {
    background: var(--color-surface);
  }

  .cell-value {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle;
  }

  .has-formula {
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg)) !important;
  }

  .selected {
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--color-primary) 85%, white);
    z-index: 1;
  }

  .selected-row {
    background: color-mix(in srgb, var(--color-primary) 16%, var(--color-bg)) !important;
  }

  .selected-col {
    background: color-mix(in srgb, var(--color-primary) 16%, var(--color-bg)) !important;
  }

  .editing {
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--color-primary) 85%, white);
    padding: 0;
  }

  .cell-editor {
    width: 100%;
    height: 100%;
    min-height: 24px;
    border: 0;
    outline: 0;
    padding: 4px 8px;
    margin: 0;
    background: #ffffff;
    color: #111827;
    font: inherit;
  }

  .formula-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--color-primary);
    border: 1px solid color-mix(in srgb, var(--color-primary) 55%, white);
    border-radius: 4px;
    padding: 0 4px;
    margin-right: 6px;
    line-height: 1.2;
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  .type-number { text-align: right; color: #a5b4fc; }
  .type-bool { text-align: center; color: #fcd34d; }
  .type-datetime { color: #86efac; }
  .type-string { color: var(--color-text); }
  .type-empty { color: transparent; }

  .highlight-mod {
    background: rgba(34, 197, 94, 0.15) !important;
    box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.3);
  }

  .highlight-add {
    background: rgba(34, 197, 94, 0.25) !important;
    box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.5);
  }

  .highlight-del {
    background: rgba(239, 68, 68, 0.15) !important;
    text-decoration: line-through;
    opacity: 0.7;
  }

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
