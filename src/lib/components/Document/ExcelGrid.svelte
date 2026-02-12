<script lang="ts">
  import { tick, untrack } from "svelte";
  import { getSystemFonts, loadSystemFonts } from "$lib/stores/fonts.svelte";
  import {
    Plus, Minus,
    Bold, Italic, Underline, TextAlignStart, TextAlignCenter, TextAlignEnd,
    ChevronDown, PaintBucket, Grid3x3, Baseline,
    ArrowUp, ArrowDown, ArrowUpDown, ListFilter, Search, X, Replace, Snowflake,
    Hash, BarChart3, Palette, Sparkles, Trash2, Download, MessageSquare,
  } from "@lucide/svelte";

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

  interface ConditionalFormatRule {
    id: string;
    type: 'highlight' | 'colorScale' | 'dataBar';
    range: { minRow: number; maxRow: number; minCol: number; maxCol: number };
    operator?: 'greaterThan' | 'lessThan' | 'equal' | 'between' | 'textContains';
    values?: (string | number)[];
    highlightStyle?: { bgColor: string; fontColor?: string };
    minColor?: string;
    maxColor?: string;
    barColor?: string;
  }

  type StructureAction = 'row_insert' | 'row_delete' | 'col_insert' | 'col_delete';

  interface ContextMenuState {
    kind: 'row' | 'col';
    index: number;
    x: number;
    y: number;
  }

  interface UndoEntry {
    row: number;
    col: number;
    oldValue: string;
    newValue: string;
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
    onstylechange?: (cells: { row: number; col: number; style: Partial<CellStyle> }[]) => void;
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
    onstylechange,
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

  // Range selection
  let selectionEndRow = $state<number | null>(null);
  let selectionEndCol = $state<number | null>(null);
  let isMouseSelecting = $state(false);

  // Column resize
  let resizingCol = $state<number | null>(null);
  let resizeStartX = $state(0);
  let resizeStartWidth = $state(0);
  let localColWidths = $state(new Map<number, number>());

  // Undo/Redo
  let undoStack = $state<UndoEntry[]>([]);
  let redoStack = $state<UndoEntry[]>([]);

  // Toolbar state
  let localStyles = $state(new Map<string, Partial<CellStyle>>());
  let textColor = $state('#000000');
  let bgColorValue = $state('#ffffff');
  let activeDropdown = $state<string | null>(null);

  const FONT_FAMILIES = $derived(getSystemFonts());

  // Load system fonts on mount
  $effect(() => { loadSystemFonts(); });
  const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

  // Number format presets: { id, label, example }
  const NUMBER_FORMAT_PRESETS = [
    { id: 0, label: '일반', example: '1234.5' },
    { id: 1, label: '숫자', example: '1,235' },
    { id: 2, label: '소수', example: '1,234.50' },
    { id: 5, label: '₩ 통화', example: '₩1,235' },
    { id: 7, label: '$ 통화', example: '$1,234.50' },
    { id: 9, label: '백분율', example: '12%' },
    { id: 10, label: '백분율(소수)', example: '12.35%' },
    { id: 14, label: '날짜', example: '2024-01-15' },
  ];

  // Conditional formatting
  let conditionalRules = $state<ConditionalFormatRule[]>([]);
  let showCondFormatDialog = $state<'highlight' | 'colorScale' | 'dataBar' | null>(null);
  let cfOperator = $state<ConditionalFormatRule['operator']>('greaterThan');
  let cfValue1 = $state('');
  let cfValue2 = $state('');
  let cfBgColor = $state('#fecaca');
  let cfFontColor = $state('#991b1b');
  let cfBarColor = $state('#6366f1');
  let cfMinColor = $state('#f87171');
  let cfMaxColor = $state('#34d399');
  let showRuleManager = $state(false);

  // Sort
  let sortCol = $state<number | null>(null);
  let sortDir = $state<'asc' | 'desc' | null>(null);

  // Filter
  let activeFilters = $state(new Map<number, Set<string>>());
  let filterDropdownCol = $state<number | null>(null);

  // Find/Replace
  let showFindBar = $state(false);
  let findText = $state('');
  let replaceText = $state('');
  let showReplaceMode = $state(false);
  let currentMatchIndex = $state(0);
  let findInputEl = $state<HTMLInputElement | null>(null);

  // Drag fill
  let isFilling = $state(false);
  let fillStartRow = $state<number | null>(null);
  let fillEndRow = $state<number | null>(null);

  // Freeze
  let freezeRows = $state(0);

  // Row cache (accumulates loaded pages for seamless scrolling)
  let rowCache = $state(new Map<number, CellValue[]>());
  let isLoadingMore = $state(false);
  let scrollContainerEl = $state<HTMLDivElement | null>(null);

  // Merge incoming rows into cache whenever rows/startRow changes
  $effect(() => {
    const currentRows = rows;
    const currentStart = startRow;
    if (currentRows.length === 0) return;
    untrack(() => {
      const shouldReset = currentStart === 0 && rowCache.size > 0;
      const updated = shouldReset ? new Map<number, CellValue[]>() : new Map(rowCache);
      for (let i = 0; i < currentRows.length; i++) {
        updated.set(currentStart + i, currentRows[i]);
      }
      rowCache = updated;
      isLoadingMore = false;
    });
  });

  function getCachedRow(absRow: number): CellValue[] {
    return rowCache.get(absRow) ?? [];
  }

  const cachedRowKeys = $derived.by(() => {
    return Array.from(rowCache.keys()).sort((a, b) => a - b);
  });
  const cachedMinRow = $derived(cachedRowKeys.length > 0 ? cachedRowKeys[0] : 0);
  const cachedMaxRow = $derived(cachedRowKeys.length > 0 ? cachedRowKeys[cachedRowKeys.length - 1] : 0);
  const cachedRowCount = $derived(rowCache.size);

  const hasMore = $derived(cachedRowCount < totalRows && totalRows > 0);
  const columnCount = $derived.by(() => {
    let max = totalCols || 0;
    for (const row of rowCache.values()) {
      max = Math.max(max, row.length);
    }
    return Math.max(max, 1);
  });

  function hasMeaningfulCell(cell: CellValue | undefined): boolean {
    if (!cell || cell.type === 'empty' || cell.value === null) return false;
    if (typeof cell.value === 'string') return cell.value.trim().length > 0;
    return true;
  }

  function getVisibleStartCol(): number {
    if (columnCount <= 1) return 0;

    let minCol = Number.POSITIVE_INFINITY;

    for (const row of rowCache.values()) {
      for (let c = 0; c < Math.min(row.length, columnCount); c++) {
        if (hasMeaningfulCell(row[c])) {
          minCol = Math.min(minCol, c);
          break;
        }
      }
    }

    for (const f of formulas) {
      if (rowCache.has(f.row)) {
        minCol = Math.min(minCol, f.col);
      }
    }

    for (const m of mergedRanges) {
      if (m.endRow >= cachedMinRow && m.startRow <= cachedMaxRow) {
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
    for (const [key, local] of localStyles) {
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, ...local } as CellStyle);
      } else {
        const base: CellStyle = {
          bold: false, italic: false, underline: false, wrapText: false,
          borderLeft: false, borderRight: false, borderTop: false, borderBottom: false,
        };
        map.set(key, { ...base, ...local } as CellStyle);
      }
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
    for (const [col, width] of localColWidths) {
      map.set(col, width);
    }
    return map;
  });

  const mergeLayout = $derived(() => {
    const startByKey = new Map<string, MergeRenderInfo>();
    const covered = new Set<string>();
    if (rowCache.size === 0 || displayColumnCount <= 0) {
      return { startByKey, covered };
    }

    const visStart = getVisibleStartCol();
    const visEnd = getVisibleStartCol() + displayColumnCount - 1;

    for (const range of mergedRanges) {
      if (range.endRow < cachedMinRow || range.startRow > cachedMaxRow) continue;
      if (range.startCol > visEnd || range.endCol < visStart) continue;

      if (!rowCache.has(range.startRow)) continue;

      const startCol = Math.max(visStart, range.startCol);
      const endCol = Math.min(visEnd, range.endCol);
      const endRow = Math.min(cachedMaxRow, range.endRow);

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

  const currentCellStyle = $derived.by(() => {
    if (selectedRow === null || selectedCol === null) return null;
    return styledByKey().get(cellKey(selectedRow, selectedCol)) ?? null;
  });

  // --- Conditional formatting engine ---
  function matchesHighlightRule(rule: ConditionalFormatRule, cell: CellValue): boolean {
    const numVal = cell.type === 'number' && typeof cell.value === 'number' ? cell.value : null;
    const strVal = formatValue(cell).toLowerCase();
    switch (rule.operator) {
      case 'greaterThan':
        return numVal !== null && rule.values?.[0] !== undefined && numVal > Number(rule.values[0]);
      case 'lessThan':
        return numVal !== null && rule.values?.[0] !== undefined && numVal < Number(rule.values[0]);
      case 'equal':
        return numVal !== null
          ? numVal === Number(rule.values?.[0])
          : strVal === String(rule.values?.[0] ?? '').toLowerCase();
      case 'between':
        return numVal !== null && rule.values?.[0] !== undefined && rule.values?.[1] !== undefined &&
          numVal >= Number(rule.values[0]) && numVal <= Number(rule.values[1]);
      case 'textContains':
        return strVal.includes(String(rule.values?.[0] ?? '').toLowerCase());
      default:
        return false;
    }
  }

  function interpolateColor(c1: string, c2: string, ratio: number): string {
    const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  const conditionalStyles = $derived.by(() => {
    const map = new Map<string, { bgColor?: string; fontColor?: string; barWidth?: number; barColor?: string }>();
    if (conditionalRules.length === 0) return map;

    for (const rule of conditionalRules) {
      const { minRow, maxRow, minCol, maxCol } = rule.range;

      if (rule.type === 'colorScale' || rule.type === 'dataBar') {
        const values: number[] = [];
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const row = getCachedRow(r);
            const cell = row[c];
            if (cell?.type === 'number' && typeof cell.value === 'number') values.push(cell.value);
          }
        }
        if (values.length === 0) continue;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;

        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const row = getCachedRow(r);
            const cell = row[c];
            if (cell?.type !== 'number' || typeof cell.value !== 'number') continue;
            const ratio = Math.max(0, Math.min(1, (cell.value - min) / range));
            const key = cellKey(r, c);
            if (rule.type === 'colorScale') {
              map.set(key, { bgColor: interpolateColor(rule.minColor ?? '#f87171', rule.maxColor ?? '#34d399', ratio) });
            } else {
              map.set(key, { barWidth: Math.round(ratio * 100), barColor: rule.barColor ?? '#6366f1' });
            }
          }
        }
      } else if (rule.type === 'highlight') {
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const row = getCachedRow(r);
            const cell = row[c];
            if (!cell || cell.type === 'empty') continue;
            if (matchesHighlightRule(rule, cell)) {
              map.set(cellKey(r, c), {
                bgColor: rule.highlightStyle?.bgColor,
                fontColor: rule.highlightStyle?.fontColor,
              });
            }
          }
        }
      }
    }
    return map;
  });

  // --- Formula Engine ---
  function colLabelToIndex(label: string): number {
    let idx = 0;
    for (let i = 0; i < label.length; i++) {
      idx = idx * 26 + (label.toUpperCase().charCodeAt(i) - 64);
    }
    return idx - 1;
  }

  function resolveRef(colLabel: string, rowIdx: number): number | string {
    const colIdx = colLabelToIndex(colLabel);
    const row = getCachedRow(rowIdx);
    const cell = row[colIdx] ?? EMPTY_CELL;
    if (cell.type === 'number' && typeof cell.value === 'number') return cell.value;
    return formatValue(cell);
  }

  function resolveRange(rangeStr: string): (number | string)[] {
    const match = rangeStr.match(/^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i);
    if (!match) return [];
    const c1 = colLabelToIndex(match[1]);
    const r1 = parseInt(match[2]) - 1;
    const c2 = colLabelToIndex(match[3]);
    const r2 = parseInt(match[4]) - 1;
    const values: (number | string)[] = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      const row = getCachedRow(r);
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        const cell = row[c] ?? EMPTY_CELL;
        if (cell.type === 'number' && typeof cell.value === 'number') values.push(cell.value);
        else { const v = formatValue(cell); if (v) values.push(v); }
      }
    }
    return values;
  }

  function evalFormulaArgs(argsStr: string): (number | string)[] {
    const parts = argsStr.split(',').map(s => s.trim());
    const values: (number | string)[] = [];
    for (const part of parts) {
      if (/^\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+$/i.test(part)) {
        values.push(...resolveRange(part));
      } else if (/^\$?([A-Z]+)\$?(\d+)$/i.test(part)) {
        const m = part.match(/^\$?([A-Z]+)\$?(\d+)$/i)!;
        values.push(resolveRef(m[1], parseInt(m[2]) - 1));
      } else if (/^".*"$/.test(part)) {
        values.push(part.slice(1, -1));
      } else {
        const n = parseFloat(part);
        values.push(isNaN(n) ? part : n);
      }
    }
    return values;
  }

  function evalFunction(name: string, argsStr: string): number | string {
    const args = evalFormulaArgs(argsStr);
    const nums = args.filter((v): v is number => typeof v === 'number');
    switch (name) {
      case 'SUM': return nums.reduce((a, b) => a + b, 0);
      case 'AVERAGE': return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      case 'COUNT': return nums.length;
      case 'COUNTA': return args.filter(v => v !== '' && v !== 0).length;
      case 'MIN': return nums.length > 0 ? Math.min(...nums) : 0;
      case 'MAX': return nums.length > 0 ? Math.max(...nums) : 0;
      case 'ABS': return nums.length > 0 ? Math.abs(nums[0]) : 0;
      case 'ROUND': return nums.length >= 2 ? Number(nums[0].toFixed(Math.max(0, nums[1]))) : (nums[0] ?? 0);
      case 'LEN': return args.length > 0 ? String(args[0]).length : 0;
      case 'UPPER': return args.length > 0 ? String(args[0]).toUpperCase() : '';
      case 'LOWER': return args.length > 0 ? String(args[0]).toLowerCase() : '';
      case 'TRIM': return args.length > 0 ? String(args[0]).trim() : '';
      case 'CONCATENATE': return args.map(String).join('');
      case 'IF': {
        const cond = args[0];
        const isTrue = typeof cond === 'number' ? cond !== 0 : String(cond).length > 0;
        return isTrue ? (args[1] ?? '') : (args[2] ?? '');
      }
      default: return '#NAME?';
    }
  }

  function evalArithmetic(expr: string): number {
    const s = expr.replace(/\s/g, '').replace(/"[^"]*"/g, '0');
    let pos = 0;
    function parseExpr(): number {
      let result = parseTerm();
      while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
        const op = s[pos++];
        result = op === '+' ? result + parseTerm() : result - parseTerm();
      }
      return result;
    }
    function parseTerm(): number {
      let result = parseFactor();
      while (pos < s.length && (s[pos] === '*' || s[pos] === '/')) {
        const op = s[pos++];
        const right = parseFactor();
        result = op === '*' ? result * right : (right !== 0 ? result / right : NaN);
      }
      return result;
    }
    function parseFactor(): number {
      if (s[pos] === '(') { pos++; const r = parseExpr(); pos++; return r; }
      if (s[pos] === '-') { pos++; return -parseFactor(); }
      const start = pos;
      while (pos < s.length && ((s[pos] >= '0' && s[pos] <= '9') || s[pos] === '.')) pos++;
      return parseFloat(s.slice(start, pos)) || 0;
    }
    return parseExpr();
  }

  function evaluateFormula(formula: string): string {
    try {
      let expr = formula.slice(1).trim();
      let maxIter = 10;
      while (/[A-Z_]+\(/i.test(expr) && maxIter-- > 0) {
        expr = expr.replace(/([A-Z_]+)\(([^()]*)\)/gi, (_, fname, args) => {
          const result = evalFunction(fname.toUpperCase(), args);
          return typeof result === 'number' ? String(result) : `"${result}"`;
        });
      }
      expr = expr.replace(/\$?([A-Z]+)\$?(\d+)/gi, (_, col, row) => {
        const val = resolveRef(col, parseInt(row) - 1);
        return typeof val === 'number' ? String(val) : '0';
      });
      const result = evalArithmetic(expr);
      if (isNaN(result)) return '#DIV/0!';
      return Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/\.?0+$/, '');
    } catch {
      return '#ERROR';
    }
  }

  const formulaPreview = $derived.by(() => {
    if (!formulaInput.startsWith('=') || formulaInput.length < 2) return null;
    return evaluateFormula(formulaInput);
  });

  // --- Cell Notes ---
  let cellNotes = $state(new Map<string, string>());
  let editingNoteRow = $state<number | null>(null);
  let editingNoteCol = $state<number | null>(null);
  let editingNoteText = $state('');
  let hoveredNoteKey = $state<string | null>(null);

  function hasNote(absRow: number, col: number): boolean {
    return cellNotes.has(cellKey(absRow, col));
  }

  function getNoteText(absRow: number, col: number): string {
    return cellNotes.get(cellKey(absRow, col)) ?? '';
  }

  function openNoteEditor(absRow: number, col: number): void {
    editingNoteRow = absRow;
    editingNoteCol = col;
    editingNoteText = getNoteText(absRow, col);
  }

  function saveNote(): void {
    if (editingNoteRow === null || editingNoteCol === null) return;
    const key = cellKey(editingNoteRow, editingNoteCol);
    const updated = new Map(cellNotes);
    if (editingNoteText.trim()) {
      updated.set(key, editingNoteText.trim());
    } else {
      updated.delete(key);
    }
    cellNotes = updated;
    editingNoteRow = null;
    editingNoteCol = null;
    editingNoteText = '';
  }

  function deleteNote(absRow: number, col: number): void {
    const updated = new Map(cellNotes);
    updated.delete(cellKey(absRow, col));
    cellNotes = updated;
  }

  // --- CSV Export ---
  function exportCSV(): void {
    const lines: string[] = [];
    const visStart = getVisibleStartCol();
    // Header row
    const headers: string[] = [];
    for (let c = visStart; c < visStart + displayColumnCount; c++) {
      headers.push(colLabel(c));
    }
    lines.push(headers.join(','));
    // Data rows
    for (const absRow of cachedRowKeys) {
      const row = getCachedRow(absRow);
      const cols: string[] = [];
      for (let c = visStart; c < visStart + displayColumnCount; c++) {
        const cell = row[c] ?? EMPTY_CELL;
        const val = formatValue(cell);
        cols.push(val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"` : val);
      }
      lines.push(cols.join(','));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function addConditionalRule(): void {
    if (!selectionRange) return;
    const range = { ...selectionRange };
    const id = `cf-${Date.now()}`;

    if (showCondFormatDialog === 'highlight') {
      const values: (string | number)[] = [cfValue1];
      if (cfOperator === 'between') values.push(cfValue2);
      conditionalRules = [...conditionalRules, {
        id, type: 'highlight', range,
        operator: cfOperator, values,
        highlightStyle: { bgColor: cfBgColor, fontColor: cfFontColor },
      }];
    } else if (showCondFormatDialog === 'colorScale') {
      conditionalRules = [...conditionalRules, {
        id, type: 'colorScale', range,
        minColor: cfMinColor, maxColor: cfMaxColor,
      }];
    } else if (showCondFormatDialog === 'dataBar') {
      conditionalRules = [...conditionalRules, {
        id, type: 'dataBar', range,
        barColor: cfBarColor,
      }];
    }
    showCondFormatDialog = null;
  }

  function removeConditionalRule(ruleId: string): void {
    conditionalRules = conditionalRules.filter(r => r.id !== ruleId);
  }

  function applyStyleToSelection(styleUpdate: Partial<CellStyle>): void {
    const range = selectionRange;
    if (!range) return;

    const updated = new Map(localStyles);
    const cells: { row: number; col: number; style: Partial<CellStyle> }[] = [];

    for (let r = range.minRow; r <= range.maxRow; r++) {
      for (let c = range.minCol; c <= range.maxCol; c++) {
        const key = cellKey(r, c);
        const existing = updated.get(key) ?? {};
        const merged = { ...existing, ...styleUpdate };
        updated.set(key, merged);
        cells.push({ row: r, col: c, style: merged });
      }
    }

    localStyles = updated;
    onstylechange?.(cells);
  }

  function toggleStyle(prop: 'bold' | 'italic' | 'underline' | 'wrapText'): void {
    const current = currentCellStyle?.[prop] ?? false;
    applyStyleToSelection({ [prop]: !current });
  }

  function applyBorders(type: 'all' | 'outer' | 'none' | 'bottom'): void {
    if (type === 'none') {
      applyStyleToSelection({ borderLeft: false, borderRight: false, borderTop: false, borderBottom: false });
      return;
    }
    if (type === 'all') {
      applyStyleToSelection({ borderLeft: true, borderRight: true, borderTop: true, borderBottom: true });
      return;
    }
    if (type === 'bottom') {
      applyStyleToSelection({ borderBottom: true });
      return;
    }
    if (type === 'outer') {
      const range = selectionRange;
      if (!range) {
        applyStyleToSelection({ borderLeft: true, borderRight: true, borderTop: true, borderBottom: true });
        return;
      }
      const updated = new Map(localStyles);
      const cells: { row: number; col: number; style: Partial<CellStyle> }[] = [];
      for (let r = range.minRow; r <= range.maxRow; r++) {
        for (let c = range.minCol; c <= range.maxCol; c++) {
          const key = cellKey(r, c);
          const existing = updated.get(key) ?? {};
          const bs: Partial<CellStyle> = {};
          if (r === range.minRow) bs.borderTop = true;
          if (r === range.maxRow) bs.borderBottom = true;
          if (c === range.minCol) bs.borderLeft = true;
          if (c === range.maxCol) bs.borderRight = true;
          const merged = { ...existing, ...bs };
          updated.set(key, merged);
          cells.push({ row: r, col: c, style: merged });
        }
      }
      localStyles = updated;
      onstylechange?.(cells);
    }
  }

  function toggleDropdown(name: string): void {
    activeDropdown = activeDropdown === name ? null : name;
  }

  function closeDropdown(): void {
    activeDropdown = null;
  }

  const selectionRange = $derived.by(() => {
    if (selectedRow === null || selectedCol === null) return null;
    const endR = selectionEndRow ?? selectedRow;
    const endC = selectionEndCol ?? selectedCol;
    return {
      minRow: Math.min(selectedRow, endR),
      maxRow: Math.max(selectedRow, endR),
      minCol: Math.min(selectedCol, endC),
      maxCol: Math.max(selectedCol, endC),
    };
  });

  function isInRange(absRow: number, col: number): boolean {
    if (!selectionRange) return false;
    return absRow >= selectionRange.minRow && absRow <= selectionRange.maxRow &&
           col >= selectionRange.minCol && col <= selectionRange.maxCol;
  }

  const rangeStats = $derived.by(() => {
    if (!selectionRange) return null;
    const { minRow, maxRow, minCol, maxCol } = selectionRange;
    if (minRow === maxRow && minCol === maxCol) return null;

    let sum = 0;
    let count = 0;
    let numCount = 0;

    for (let r = minRow; r <= maxRow; r++) {
      const row = getCachedRow(r);
      if (row.length === 0) continue;
      for (let c = minCol; c <= maxCol; c++) {
        const cell = row[c];
        if (!cell || cell.type === 'empty' || cell.value === null) continue;
        count++;
        if (cell.type === 'number' && typeof cell.value === 'number') {
          sum += cell.value;
          numCount++;
        }
      }
    }

    if (count === 0) return null;
    return {
      sum: numCount > 0 ? sum : null,
      average: numCount > 0 ? sum / numCount : null,
      count,
    };
  });

  // --- Processed rows (sort + filter) ---
  const processedRowIndices = $derived.by(() => {
    let indices = cachedRowKeys.slice();

    if (activeFilters.size > 0) {
      indices = indices.filter(absRow => {
        for (const [col, allowed] of activeFilters) {
          const row = getCachedRow(absRow);
          const cell = row[col];
          const val = cell ? formatValue(cell) : '';
          if (!allowed.has(val)) return false;
        }
        return true;
      });
    }

    if (sortCol !== null && sortDir !== null) {
      const sc = sortCol;
      const sd = sortDir;
      indices.sort((a, b) => {
        const rowA = getCachedRow(a);
        const rowB = getCachedRow(b);
        const cellA = rowA[sc];
        const cellB = rowB[sc];
        const valA = cellA ? formatValue(cellA) : '';
        const valB = cellB ? formatValue(cellB) : '';
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return sd === 'asc' ? numA - numB : numB - numA;
        }
        const cmp = valA.localeCompare(valB);
        return sd === 'asc' ? cmp : -cmp;
      });
    }

    return indices;
  });

  // --- Find matches ---
  const findMatches = $derived.by(() => {
    if (!findText || !showFindBar) return [];
    const query = findText.toLowerCase();
    const matches: { row: number; col: number }[] = [];
    const visStart = getVisibleStartCol();

    for (const absRow of processedRowIndices) {
      const row = getCachedRow(absRow);
      for (let c = visStart; c < visStart + displayColumnCount; c++) {
        const cell = row[c];
        if (!cell || cell.type === 'empty') continue;
        if (formatValue(cell).toLowerCase().includes(query)) {
          matches.push({ row: absRow, col: c });
        }
      }
    }
    return matches;
  });

  function isFindMatch(absRow: number, col: number): boolean {
    return findMatches.some(m => m.row === absRow && m.col === col);
  }

  function isCurrentMatch(absRow: number, col: number): boolean {
    if (findMatches.length === 0) return false;
    const m = findMatches[currentMatchIndex];
    return m?.row === absRow && m?.col === col;
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

  function cellAddress(row: number, col: number): string {
    return `${colLabel(col)}${row + 1}`;
  }

  function formatValue(cell: CellValue): string {
    if (cell.type === 'empty' || cell.value === null) return '';
    if (cell.type === 'number') return String(cell.value);
    if (cell.type === 'bool') return cell.value ? 'TRUE' : 'FALSE';
    return String(cell.value);
  }

  function excelSerialToDate(serial: number): Date | null {
    if (serial < 1) return null;
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + serial * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  function applyNumberFormat(value: number, formatId: number): string {
    switch (formatId) {
      case 1: return value.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
      case 2: return value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 5: return '₩' + value.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
      case 7: return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 9: return Math.round(value * 100) + '%';
      case 10: return (value * 100).toFixed(2) + '%';
      case 14: {
        const d = excelSerialToDate(value);
        return d ? d.toISOString().split('T')[0] : String(value);
      }
      default: return String(value);
    }
  }

  function formatDisplayValue(cell: CellValue, absRow: number, col: number): string {
    if (cell.type === 'empty' || cell.value === null) {
      const formula = formulaByKey().get(cellKey(absRow, col));
      if (formula) return evaluateFormula('=' + formula);
      return '';
    }
    if (cell.type !== 'number' || typeof cell.value !== 'number') return formatValue(cell);
    const style = styledByKey().get(cellKey(absRow, col));
    const fmtId = style?.numberFormatId;
    if (fmtId === undefined || fmtId === null || fmtId === 0) return String(cell.value);
    return applyNumberFormat(cell.value, fmtId);
  }

  function adjustDecimalPlaces(delta: number): void {
    if (selectedRow === null || selectedCol === null) return;
    const style = styledByKey().get(cellKey(selectedRow, selectedCol));
    const currentFmt = style?.numberFormatId ?? 0;
    if (delta > 0 && (currentFmt === 0 || currentFmt === 1)) {
      applyStyleToSelection({ numberFormatId: 2 });
    } else if (delta < 0 && currentFmt === 2) {
      applyStyleToSelection({ numberFormatId: 1 });
    }
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

    // Conditional formatting overrides
    const cf = conditionalStyles.get(cellKey(absRow, col));
    if (cf) {
      if (cf.bgColor) css.push(`background:${cf.bgColor} !important;`);
      if (cf.fontColor) css.push(`color:${cf.fontColor};`);
      if (cf.barWidth !== undefined) {
        const bc = cf.barColor ?? '#6366f1';
        css.push(`background:linear-gradient(to right, ${bc}33 ${cf.barWidth}%, transparent ${cf.barWidth}%) !important;`);
      }
    }

    return css.join('');
  }

  function currentCellInput(absRow: number, col: number): string {
    const key = cellKey(absRow, col);
    const formula = formulaByKey().get(key);
    if (formula !== undefined) return `=${formula}`;

    const row = getCachedRow(absRow);
    const cell = row[col] ?? EMPTY_CELL;
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

  function selectCell(absRow: number, col: number, extend = false): void {
    const normalized = normalizeCell(absRow, col);
    if (extend && selectedRow !== null && selectedCol !== null) {
      selectionEndRow = normalized.row;
      selectionEndCol = normalized.col;
    } else {
      selectedRow = normalized.row;
      selectedCol = normalized.col;
      selectionEndRow = null;
      selectionEndCol = null;
    }
    selectionMode = 'cell';
    const anchorRow = extend ? selectedRow! : normalized.row;
    const anchorCol = extend ? selectedCol! : normalized.col;
    formulaInput = currentCellInput(anchorRow, anchorCol);
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
    const target = event.target as HTMLElement;
    if (activeDropdown) {
      if (!target.closest('.toolbar-dropdown')) closeDropdown();
    }
    if (filterDropdownCol !== null) {
      if (!target.closest('.filter-dropdown')) filterDropdownCol = null;
    }
    if (!contextMenu) return;
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
    if (rowCache.size === 0) {
      selectedRow = null;
      selectedCol = null;
      formulaInput = '';
      return;
    }

    const firstRow = cachedMinRow;
    const lastRow = cachedMaxRow;
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

    undoStack.push({ row: selectedRow, col: selectedCol, oldValue: prev, newValue: next });
    redoStack = [];

    isCommitting = true;
    try {
      await oncellupdate(selectedRow, selectedCol, next);
    } catch (err) {
      console.error('Failed to update cell', err);
      undoStack.pop();
    } finally {
      isCommitting = false;
      if (selectedRow !== null && selectedCol !== null) {
        formulaInput = currentCellInput(selectedRow, selectedCol);
      }
    }
  }

  function moveSelection(deltaRow: number, deltaCol: number, extend = false): void {
    if (selectedRow === null || selectedCol === null || rowCache.size === 0) return;
    const minRow = cachedMinRow;
    const maxRow = cachedMaxRow;
    const minCol = Math.max(0, getVisibleStartCol());
    const maxCol = Math.max(0, columnCount - 1);

    if (extend) {
      const baseRow = selectionEndRow ?? selectedRow;
      const baseCol = selectionEndCol ?? selectedCol;
      selectionEndRow = Math.min(Math.max(baseRow + deltaRow, minRow), maxRow);
      selectionEndCol = Math.min(Math.max(baseCol + deltaCol, minCol), maxCol);
    } else {
      const nextRow = Math.min(Math.max(selectedRow + deltaRow, minRow), maxRow);
      const nextCol = Math.min(Math.max(selectedCol + deltaCol, minCol), maxCol);
      selectCell(nextRow, nextCol);
    }
  }

  function handleGridKeydown(event: KeyboardEvent): void {
    if (rowCache.size === 0) return;
    if (inlineEditingRow !== null && inlineEditingCol !== null) return;

    const isShift = event.shiftKey;
    const isMod = event.metaKey || event.ctrlKey;

    if (isMod) {
      if (event.key === 'z' || event.key === 'Z') {
        event.preventDefault();
        if (isShift) redo(); else undo();
        return;
      }
      if (event.key === 'y' || event.key === 'Y') {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        openFindBar(false);
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        openFindBar(true);
        return;
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1, 0, isShift);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, 0, isShift);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(0, -1, isShift);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(0, 1, isShift);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitFormulaInput().then(() => moveSelection(1, 0));
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      if (isShift && selectedRow !== null && selectedCol !== null) {
        openNoteEditor(selectedRow, selectedCol);
        return;
      }
      if (selectedRow !== null && selectedCol !== null) {
        void startInlineEdit(selectedRow, selectedCol);
      }
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (selectedRow !== null && selectedCol !== null) {
        event.preventDefault();
        void startInlineEdit(selectedRow, selectedCol, event.key);
      }
    }
  }

  // --- Delete selection range ---
  function deleteSelection(): void {
    if (!oncellupdate) return;
    if (!selectionRange) {
      formulaInput = '';
      void commitFormulaInput();
      return;
    }
    const { minRow, maxRow, minCol, maxCol } = selectionRange;
    if (minRow === maxRow && minCol === maxCol) {
      formulaInput = '';
      void commitFormulaInput();
      return;
    }
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const prev = currentCellInput(r, c);
        if (prev !== '') {
          undoStack.push({ row: r, col: c, oldValue: prev, newValue: '' });
          oncellupdate(r, c, '');
        }
      }
    }
    redoStack = [];
  }

  // --- Copy ---
  function handleCopy(event: ClipboardEvent): void {
    if (!selectionRange) return;
    event.preventDefault();
    const { minRow, maxRow, minCol, maxCol } = selectionRange;
    const lines: string[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row = getCachedRow(r);
      const cols: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const cell = row[c] ?? EMPTY_CELL;
        cols.push(formatValue(cell));
      }
      lines.push(cols.join('\t'));
    }
    event.clipboardData?.setData('text/plain', lines.join('\n'));
  }

  // --- Cut ---
  function handleCut(event: ClipboardEvent): void {
    handleCopy(event);
    deleteSelection();
  }

  // --- Paste ---
  async function handlePaste(event: ClipboardEvent): Promise<void> {
    if (selectedRow === null || selectedCol === null || !oncellupdate) return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;

    const lines = text.split(/\r?\n/).filter((line, i, arr) => i < arr.length - 1 || line.length > 0);
    const parsed = lines.map(line => line.split('\t'));

    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        const targetRow = selectedRow + r;
        const targetCol = selectedCol + c;
        const prev = currentCellInput(targetRow, targetCol);
        const next = parsed[r][c];
        if (prev !== next) {
          undoStack.push({ row: targetRow, col: targetCol, oldValue: prev, newValue: next });
          await oncellupdate(targetRow, targetCol, next);
        }
      }
    }
    redoStack = [];
  }

  // --- Undo ---
  function undo(): void {
    if (undoStack.length === 0 || !oncellupdate) return;
    const entry = undoStack.pop()!;
    redoStack.push(entry);
    oncellupdate(entry.row, entry.col, entry.oldValue);
    selectCell(entry.row, entry.col);
  }

  // --- Redo ---
  function redo(): void {
    if (redoStack.length === 0 || !oncellupdate) return;
    const entry = redoStack.pop()!;
    undoStack.push(entry);
    oncellupdate(entry.row, entry.col, entry.newValue);
    selectCell(entry.row, entry.col);
  }

  // --- Column resize ---
  function startColResize(event: MouseEvent, col: number): void {
    event.preventDefault();
    event.stopPropagation();
    resizingCol = col;
    resizeStartX = event.clientX;
    const currentWidth = localColWidths.get(col) ?? colWidthByCol().get(col);
    resizeStartWidth = currentWidth ? excelColWidthToPx(currentWidth) : 88;
    window.addEventListener('mousemove', handleColResizeMove);
    window.addEventListener('mouseup', handleColResizeEnd);
  }

  function handleColResizeMove(event: MouseEvent): void {
    if (resizingCol === null) return;
    const delta = event.clientX - resizeStartX;
    const newPx = Math.max(40, resizeStartWidth + delta);
    const excelWidth = (newPx - 5) / 7;
    const updated = new Map(localColWidths);
    updated.set(resizingCol, excelWidth);
    localColWidths = updated;
  }

  function handleColResizeEnd(): void {
    resizingCol = null;
    window.removeEventListener('mousemove', handleColResizeMove);
    window.removeEventListener('mouseup', handleColResizeEnd);
  }

  function autoFitColumn(col: number): void {
    let maxLen = colLabel(col).length;
    for (const row of rowCache.values()) {
      const cell = row[col];
      if (cell && cell.value !== null) {
        maxLen = Math.max(maxLen, String(cell.value).length);
      }
    }
    const estimatedWidth = Math.max(8, Math.min(60, maxLen * 1.2 + 2));
    const updated = new Map(localColWidths);
    updated.set(col, estimatedWidth);
    localColWidths = updated;
  }

  // --- Mouse drag selection ---
  function handleCellMouseDown(event: MouseEvent, absRow: number, col: number): void {
    if (event.button !== 0) return;
    const normalized = normalizeCell(absRow, col);

    if (event.shiftKey) {
      selectCell(normalized.row, normalized.col, true);
      return;
    }

    selectedRow = normalized.row;
    selectedCol = normalized.col;
    selectionEndRow = null;
    selectionEndCol = null;
    selectionMode = 'cell';
    formulaInput = currentCellInput(normalized.row, normalized.col);
    isMouseSelecting = true;

    window.addEventListener('mousemove', handleCellMouseMove);
    window.addEventListener('mouseup', handleCellMouseUp);
  }

  function handleCellMouseMove(event: MouseEvent): void {
    if (!isMouseSelecting || !rootEl) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target) return;
    const td = (target as HTMLElement).closest('td.cell') as HTMLElement | null;
    if (!td || !td.dataset.row || !td.dataset.col) return;

    const absRow = parseInt(td.dataset.row);
    const col = parseInt(td.dataset.col);
    if (isNaN(absRow) || isNaN(col)) return;

    selectionEndRow = absRow;
    selectionEndCol = col;
  }

  function handleCellMouseUp(): void {
    isMouseSelecting = false;
    window.removeEventListener('mousemove', handleCellMouseMove);
    window.removeEventListener('mouseup', handleCellMouseUp);
  }

  // --- Sort ---
  function toggleSort(col: number): void {
    if (sortCol === col) {
      if (sortDir === 'asc') sortDir = 'desc';
      else { sortCol = null; sortDir = null; }
    } else {
      sortCol = col;
      sortDir = 'asc';
    }
  }

  // --- Filter ---
  function getUniqueValues(col: number): string[] {
    const values = new Set<string>();
    for (const row of rowCache.values()) {
      const cell = row[col];
      values.add(cell && cell.type !== 'empty' && cell.value !== null ? formatValue(cell) : '');
    }
    return Array.from(values).sort();
  }

  function isValueFiltered(col: number, value: string): boolean {
    const allowed = activeFilters.get(col);
    if (!allowed) return false;
    return !allowed.has(value);
  }

  function toggleFilterValue(col: number, value: string): void {
    const updated = new Map(activeFilters);
    let allowed = updated.get(col);
    const allValues = getUniqueValues(col);

    if (!allowed) {
      allowed = new Set(allValues);
      allowed.delete(value);
    } else {
      if (allowed.has(value)) allowed.delete(value);
      else allowed.add(value);
      if (allowed.size >= allValues.length) {
        updated.delete(col);
        activeFilters = updated;
        return;
      }
    }

    if (allowed.size === 0) updated.delete(col);
    else updated.set(col, new Set(allowed));
    activeFilters = updated;
  }

  function clearFilter(col: number): void {
    const updated = new Map(activeFilters);
    updated.delete(col);
    activeFilters = updated;
    filterDropdownCol = null;
  }

  function toggleFilterDropdown(col: number, event: MouseEvent): void {
    event.stopPropagation();
    filterDropdownCol = filterDropdownCol === col ? null : col;
  }

  // --- Find / Replace ---
  function openFindBar(replace = false): void {
    showFindBar = true;
    showReplaceMode = replace;
    currentMatchIndex = 0;
    tick().then(() => findInputEl?.focus());
  }

  function closeFindBar(): void {
    showFindBar = false;
    findText = '';
    replaceText = '';
    showReplaceMode = false;
    currentMatchIndex = 0;
  }

  function navigateMatch(direction: 1 | -1): void {
    if (findMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + direction + findMatches.length) % findMatches.length;
    const match = findMatches[currentMatchIndex];
    if (match) selectCell(match.row, match.col);
  }

  function replaceCurrentMatch(): void {
    if (findMatches.length === 0 || !oncellupdate) return;
    const match = findMatches[currentMatchIndex];
    if (!match) return;
    const prev = currentCellInput(match.row, match.col);
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const next = prev.replace(new RegExp(escaped, 'i'), replaceText);
    undoStack.push({ row: match.row, col: match.col, oldValue: prev, newValue: next });
    redoStack = [];
    oncellupdate(match.row, match.col, next);
  }

  function replaceAllMatches(): void {
    if (findMatches.length === 0 || !oncellupdate) return;
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    for (const match of findMatches) {
      const prev = currentCellInput(match.row, match.col);
      const next = prev.replace(regex, replaceText);
      if (prev !== next) {
        undoStack.push({ row: match.row, col: match.col, oldValue: prev, newValue: next });
        oncellupdate(match.row, match.col, next);
      }
    }
    redoStack = [];
    closeFindBar();
  }

  // --- Drag fill ---
  function handleFillMouseDown(event: MouseEvent): void {
    if (selectedRow === null || selectedCol === null) return;
    event.preventDefault();
    event.stopPropagation();
    isFilling = true;
    fillStartRow = selectedRow;
    fillEndRow = selectedRow;
    window.addEventListener('mousemove', handleFillMouseMove);
    window.addEventListener('mouseup', handleFillMouseUp);
  }

  function handleFillMouseMove(event: MouseEvent): void {
    if (!isFilling || !rootEl) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target) return;
    const td = (target as HTMLElement).closest('td.cell') as HTMLElement | null;
    if (!td || !td.dataset.row) return;
    const row = parseInt(td.dataset.row);
    if (!isNaN(row)) fillEndRow = row;
  }

  function handleFillMouseUp(): void {
    if (isFilling && fillStartRow !== null && fillEndRow !== null && selectedCol !== null && oncellupdate) {
      const startR = Math.min(fillStartRow, fillEndRow);
      const endR = Math.max(fillStartRow, fillEndRow);
      const col = selectedCol;
      const sourceInput = currentCellInput(fillStartRow, col);
      const sourceNum = parseFloat(sourceInput);
      const isNum = !isNaN(sourceNum) && sourceInput.trim() !== '';

      for (let r = startR; r <= endR; r++) {
        if (r === fillStartRow) continue;
        const distance = r - fillStartRow;
        const fillValue = isNum ? String(sourceNum + distance) : sourceInput;
        const prev = currentCellInput(r, col);
        if (prev !== fillValue) {
          undoStack.push({ row: r, col, oldValue: prev, newValue: fillValue });
          oncellupdate(r, col, fillValue);
        }
      }
      redoStack = [];
    }
    isFilling = false;
    fillStartRow = null;
    fillEndRow = null;
    window.removeEventListener('mousemove', handleFillMouseMove);
    window.removeEventListener('mouseup', handleFillMouseUp);
  }

  function isFillPreview(absRow: number, col: number): boolean {
    if (!isFilling || fillStartRow === null || fillEndRow === null || selectedCol === null) return false;
    if (col !== selectedCol) return false;
    const minR = Math.min(fillStartRow, fillEndRow);
    const maxR = Math.max(fillStartRow, fillEndRow);
    return absRow >= minR && absRow <= maxR && absRow !== fillStartRow;
  }

  // --- Freeze ---
  function toggleFreeze(): void {
    if (freezeRows > 0) {
      freezeRows = 0;
    } else {
      freezeRows = 1;
    }
  }

  function getFreezeStyle(viewIndex: number): string {
    if (freezeRows === 0 || viewIndex >= freezeRows) return '';
    const top = 30 + viewIndex * 26;
    return `position:sticky;top:${top}px;z-index:1;`;
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

  function handleGridScroll(): void {
    if (contextMenu) {
      closeContextMenu();
    }
    // Auto-load more rows when scrolling near the bottom
    if (!scrollContainerEl || !onpaginate || isLoadingMore) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerEl;
    if (scrollHeight - scrollTop - clientHeight < 200 && hasMore) {
      isLoadingMore = true;
      const nextStart = cachedMaxRow + 1;
      if (nextStart < totalRows) {
        onpaginate(nextStart);
      }
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
    {#if formulaPreview !== null}
      <span class="formula-preview">= {formulaPreview}</span>
    {/if}
  </div>

  <div class="format-toolbar">
    <!-- Bold / Italic / Underline -->
    <div class="toolbar-group">
      <button class="tb-btn" class:active={currentCellStyle?.bold} onclick={() => toggleStyle('bold')} title="굵게">
        <Bold size={14} />
      </button>
      <button class="tb-btn" class:active={currentCellStyle?.italic} onclick={() => toggleStyle('italic')} title="기울임">
        <Italic size={14} />
      </button>
      <button class="tb-btn" class:active={currentCellStyle?.underline} onclick={() => toggleStyle('underline')} title="밑줄">
        <Underline size={14} />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Font family / size -->
    <div class="toolbar-group">
      <select
        class="tb-select font-select"
        value={currentCellStyle?.fontName ?? 'Arial'}
        onchange={(e) => applyStyleToSelection({ fontName: e.currentTarget.value })}
      >
        {#each FONT_FAMILIES as font}
          <option value={font}>{font}</option>
        {/each}
      </select>
      <select
        class="tb-select size-select"
        value={String(currentCellStyle?.fontSize ?? 11)}
        onchange={(e) => applyStyleToSelection({ fontSize: parseInt(e.currentTarget.value) })}
      >
        {#each FONT_SIZES as size}
          <option value={String(size)}>{size}</option>
        {/each}
      </select>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Text color / Background color -->
    <div class="toolbar-group">
      <label class="tb-color-btn" title="글자색">
        <Baseline size={14} />
        <span class="color-indicator" style="background:{textColor}"></span>
        <input type="color" bind:value={textColor} onchange={() => applyStyleToSelection({ fontColor: textColor })} />
      </label>
      <label class="tb-color-btn" title="배경색">
        <PaintBucket size={14} />
        <span class="color-indicator" style="background:{bgColorValue}"></span>
        <input type="color" bind:value={bgColorValue} onchange={() => applyStyleToSelection({ bgColor: bgColorValue })} />
      </label>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Alignment -->
    <div class="toolbar-group">
      <button class="tb-btn" class:active={currentCellStyle?.hAlign === 'left'} onclick={() => applyStyleToSelection({ hAlign: 'left' })} title="왼쪽 정렬">
        <TextAlignStart size={14} />
      </button>
      <button class="tb-btn" class:active={currentCellStyle?.hAlign === 'center'} onclick={() => applyStyleToSelection({ hAlign: 'center' })} title="가운데 정렬">
        <TextAlignCenter size={14} />
      </button>
      <button class="tb-btn" class:active={currentCellStyle?.hAlign === 'right'} onclick={() => applyStyleToSelection({ hAlign: 'right' })} title="오른쪽 정렬">
        <TextAlignEnd size={14} />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Borders dropdown -->
    <div class="toolbar-group">
      <div class="toolbar-dropdown">
        <button class="tb-btn" onclick={() => toggleDropdown('border')} title="테두리">
          <Grid3x3 size={14} />
          <ChevronDown size={10} />
        </button>
        {#if activeDropdown === 'border'}
          <div class="dropdown-menu">
            <button class="dropdown-item" onclick={() => { applyBorders('all'); closeDropdown(); }}>전체 테두리</button>
            <button class="dropdown-item" onclick={() => { applyBorders('outer'); closeDropdown(); }}>외곽 테두리</button>
            <button class="dropdown-item" onclick={() => { applyBorders('none'); closeDropdown(); }}>테두리 없음</button>
            <button class="dropdown-item" onclick={() => { applyBorders('bottom'); closeDropdown(); }}>아래쪽 테두리</button>
          </div>
        {/if}
      </div>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Wrap text -->
    <div class="toolbar-group">
      <button class="tb-btn text-btn" class:active={currentCellStyle?.wrapText} onclick={() => toggleStyle('wrapText')} title="텍스트 줄바꿈">
        Wrap
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Freeze -->
    <div class="toolbar-group">
      <button class="tb-btn" class:active={freezeRows > 0} onclick={toggleFreeze} title="첫 행 고정">
        <Snowflake size={14} />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Find -->
    <div class="toolbar-group">
      <button class="tb-btn" onclick={() => openFindBar(false)} title="찾기 (Ctrl+F)">
        <Search size={14} />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Number format -->
    <div class="toolbar-group">
      <div class="toolbar-dropdown">
        <button class="tb-btn" onclick={() => toggleDropdown('numfmt')} title="숫자 형식">
          <Hash size={14} />
          <ChevronDown size={10} />
        </button>
        {#if activeDropdown === 'numfmt'}
          <div class="dropdown-menu numfmt-menu">
            {#each NUMBER_FORMAT_PRESETS as preset}
              <button
                class="dropdown-item"
                class:active-item={currentCellStyle?.numberFormatId === preset.id}
                onclick={() => { applyStyleToSelection({ numberFormatId: preset.id }); closeDropdown(); }}
              >
                <span class="numfmt-label">{preset.label}</span>
                <span class="numfmt-example">{preset.example}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <button class="tb-btn text-btn" onclick={() => adjustDecimalPlaces(1)} title="소수점 추가">.0</button>
      <button class="tb-btn text-btn" onclick={() => adjustDecimalPlaces(-1)} title="소수점 감소">.00</button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Conditional formatting -->
    <div class="toolbar-group">
      <div class="toolbar-dropdown">
        <button class="tb-btn" onclick={() => toggleDropdown('condfmt')} title="조건부 서식">
          <Sparkles size={14} />
          <ChevronDown size={10} />
        </button>
        {#if activeDropdown === 'condfmt'}
          <div class="dropdown-menu condfmt-menu">
            <button class="dropdown-item" onclick={() => { showCondFormatDialog = 'highlight'; closeDropdown(); }}>
              <Sparkles size={14} />셀 강조 규칙
            </button>
            <button class="dropdown-item" onclick={() => { showCondFormatDialog = 'colorScale'; closeDropdown(); }}>
              <Palette size={14} />색조 (Color Scale)
            </button>
            <button class="dropdown-item" onclick={() => { showCondFormatDialog = 'dataBar'; closeDropdown(); }}>
              <BarChart3 size={14} />데이터 막대
            </button>
            {#if conditionalRules.length > 0}
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" onclick={() => { showRuleManager = !showRuleManager; closeDropdown(); }}>
                규칙 관리 ({conditionalRules.length})
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Notes -->
    <div class="toolbar-group">
      <button
        class="tb-btn"
        onclick={() => { if (selectedRow !== null && selectedCol !== null) openNoteEditor(selectedRow, selectedCol); }}
        title="메모 추가/편집 (Shift+F2)"
      >
        <MessageSquare size={14} />
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Export -->
    <div class="toolbar-group">
      <button class="tb-btn" onclick={exportCSV} title="CSV 내보내기">
        <Download size={14} />
      </button>
    </div>
  </div>

  {#if showFindBar}
    <div class="find-bar">
      <div class="find-row">
        <Search size={14} />
        <input
          class="find-input"
          bind:this={findInputEl}
          bind:value={findText}
          placeholder="찾기..."
          oninput={() => { currentMatchIndex = 0; }}
          onkeydown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); navigateMatch(e.shiftKey ? -1 : 1); }
            if (e.key === 'Escape') { e.preventDefault(); closeFindBar(); }
          }}
        />
        <span class="find-count">
          {#if findText && findMatches.length > 0}
            {currentMatchIndex + 1} / {findMatches.length}
          {:else if findText}
            0 결과
          {/if}
        </span>
        <button class="find-nav-btn" onclick={() => navigateMatch(-1)} disabled={findMatches.length === 0} title="이전">
          <ArrowUp size={14} />
        </button>
        <button class="find-nav-btn" onclick={() => navigateMatch(1)} disabled={findMatches.length === 0} title="다음">
          <ArrowDown size={14} />
        </button>
        <button class="find-nav-btn" onclick={() => { showReplaceMode = !showReplaceMode; }} title="바꾸기 모드">
          <Replace size={14} />
        </button>
        <button class="find-nav-btn" onclick={closeFindBar} title="닫기">
          <X size={14} />
        </button>
      </div>
      {#if showReplaceMode}
        <div class="find-row replace-row">
          <Replace size={14} />
          <input
            class="find-input"
            bind:value={replaceText}
            placeholder="바꾸기..."
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); replaceCurrentMatch(); } }}
          />
          <button class="find-action-btn" onclick={replaceCurrentMatch} disabled={findMatches.length === 0}>바꾸기</button>
          <button class="find-action-btn" onclick={replaceAllMatches} disabled={findMatches.length === 0}>모두 바꾸기</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if showCondFormatDialog}
    <div class="cf-dialog">
      <div class="cf-dialog-header">
        {#if showCondFormatDialog === 'highlight'}셀 강조 규칙
        {:else if showCondFormatDialog === 'colorScale'}색조 (Color Scale)
        {:else}데이터 막대
        {/if}
        <button class="find-nav-btn" onclick={() => { showCondFormatDialog = null; }} title="닫기"><X size={14} /></button>
      </div>
      <div class="cf-dialog-body">
        {#if showCondFormatDialog === 'highlight'}
          <div class="cf-row">
            <select class="tb-select" bind:value={cfOperator}>
              <option value="greaterThan">보다 큼</option>
              <option value="lessThan">보다 작음</option>
              <option value="equal">같음</option>
              <option value="between">사이</option>
              <option value="textContains">텍스트 포함</option>
            </select>
          </div>
          <div class="cf-row">
            <input class="cf-input" bind:value={cfValue1} placeholder="값" />
            {#if cfOperator === 'between'}
              <span class="cf-and">~</span>
              <input class="cf-input" bind:value={cfValue2} placeholder="값 2" />
            {/if}
          </div>
          <div class="cf-row">
            <label class="cf-color-label">
              배경 <input type="color" bind:value={cfBgColor} />
            </label>
            <label class="cf-color-label">
              글자 <input type="color" bind:value={cfFontColor} />
            </label>
          </div>
          <div class="cf-preview" style="background:{cfBgColor};color:{cfFontColor};">미리보기 123</div>
        {:else if showCondFormatDialog === 'colorScale'}
          <div class="cf-row">
            <label class="cf-color-label">
              최솟값 <input type="color" bind:value={cfMinColor} />
            </label>
            <label class="cf-color-label">
              최댓값 <input type="color" bind:value={cfMaxColor} />
            </label>
          </div>
          <div class="cf-gradient-preview" style="background:linear-gradient(to right, {cfMinColor}, {cfMaxColor});"></div>
        {:else}
          <div class="cf-row">
            <label class="cf-color-label">
              막대 색 <input type="color" bind:value={cfBarColor} />
            </label>
          </div>
          <div class="cf-bar-preview">
            <div class="cf-bar-sample" style="width:75%;background:{cfBarColor}33;border-left:3px solid {cfBarColor};"></div>
          </div>
        {/if}
      </div>
      <div class="cf-dialog-footer">
        <button class="find-action-btn" onclick={() => { showCondFormatDialog = null; }}>취소</button>
        <button class="find-action-btn cf-apply-btn" onclick={addConditionalRule} disabled={!selectionRange}>적용</button>
      </div>
    </div>
  {/if}

  {#if showRuleManager && conditionalRules.length > 0}
    <div class="cf-rules-bar">
      <span class="cf-rules-title">조건부 서식 규칙</span>
      <div class="cf-rules-list">
        {#each conditionalRules as rule (rule.id)}
          <div class="cf-rule-item">
            <span class="cf-rule-type">
              {#if rule.type === 'highlight'}강조
              {:else if rule.type === 'colorScale'}색조
              {:else}막대
              {/if}
            </span>
            <span class="cf-rule-range">
              {cellAddress(rule.range.minRow, rule.range.minCol)}:{cellAddress(rule.range.maxRow, rule.range.maxCol)}
            </span>
            <button class="cf-rule-delete" onclick={() => removeConditionalRule(rule.id)} title="삭제">
              <Trash2 size={12} />
            </button>
          </div>
        {/each}
      </div>
      <button class="find-nav-btn" onclick={() => { showRuleManager = false; }} title="닫기"><X size={14} /></button>
    </div>
  {/if}

  {#if editingNoteRow !== null && editingNoteCol !== null}
    <div class="note-editor-bar">
      <MessageSquare size={14} />
      <span class="note-editor-label">{cellAddress(editingNoteRow, editingNoteCol)} 메모</span>
      <input
        class="note-editor-input"
        bind:value={editingNoteText}
        placeholder="메모 입력..."
        onkeydown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); saveNote(); }
          if (e.key === 'Escape') { e.preventDefault(); editingNoteRow = null; editingNoteCol = null; }
        }}
      />
      <button class="find-action-btn" onclick={saveNote}>저장</button>
      {#if hasNote(editingNoteRow, editingNoteCol)}
        <button class="find-action-btn" onclick={() => { deleteNote(editingNoteRow!, editingNoteCol!); editingNoteRow = null; editingNoteCol = null; }}>삭제</button>
      {/if}
      <button class="find-nav-btn" onclick={() => { editingNoteRow = null; editingNoteCol = null; }} title="닫기"><X size={14} /></button>
    </div>
  {/if}

  <div
    class="grid-scroll"
    bind:this={scrollContainerEl}
    tabindex="0"
    role="grid"
    aria-label="Spreadsheet grid"
    onkeydown={handleGridKeydown}
    onscroll={handleGridScroll}
    oncopy={handleCopy}
    oncut={handleCut}
    onpaste={(e) => void handlePaste(e)}
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
              class:sorted={sortCol === actualCol}
              class:filtered={activeFilters.has(actualCol)}
              style={getColumnSizeStyle(actualCol)}
              onclick={() => selectColumn(actualCol)}
              oncontextmenu={(event) => openHeaderContextMenu(event, 'col', actualCol)}
            >
              <span class="col-label">{colLabel(actualCol)}</span>
              {#if sortCol === actualCol}
                <span class="sort-icon">
                  {#if sortDir === 'asc'}<ArrowUp size={10} />{:else}<ArrowDown size={10} />{/if}
                </span>
              {/if}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <button class="col-sort-btn" onclick={(e) => { e.stopPropagation(); toggleSort(actualCol); }} title="정렬">
                <ArrowUpDown size={10} />
              </button>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="filter-dropdown">
                <button class="col-filter-btn" class:active={activeFilters.has(actualCol)} onclick={(e) => toggleFilterDropdown(actualCol, e)} title="필터">
                  <ListFilter size={10} />
                </button>
                {#if filterDropdownCol === actualCol}
                  <div class="filter-menu" onmousedown={(e) => e.stopPropagation()}>
                    <div class="filter-header">
                      <span>필터: {colLabel(actualCol)}</span>
                      <button class="filter-clear-btn" onclick={() => clearFilter(actualCol)}>초기화</button>
                    </div>
                    <div class="filter-values">
                      {#each getUniqueValues(actualCol) as val}
                        <label class="filter-value-item">
                          <input type="checkbox" checked={!isValueFiltered(actualCol, val)} onchange={() => toggleFilterValue(actualCol, val)} />
                          <span>{val || '(빈 셀)'}</span>
                        </label>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="col-resize-handle"
                onmousedown={(e) => startColResize(e, actualCol)}
                ondblclick={(e) => { e.stopPropagation(); autoFitColumn(actualCol); }}
              ></div>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each processedRowIndices as absRow, viewIndex (absRow)}
          {@const row = getCachedRow(absRow)}
          {@const fStyle = getFreezeStyle(viewIndex)}
          <tr class:selected-row={selectionMode === 'row' && selectedRow === absRow} style={getRowStyle(absRow)}>
            <td
              class="row-header"
              class:selected-row={selectionMode === 'row' && selectedRow === absRow}
              class:frozen-cell={freezeRows > 0 && viewIndex < freezeRows}
              style={fStyle ? `${fStyle}left:0;z-index:3;` : undefined}
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
                  class:in-range={isInRange(absRow, actualCol) && !(selectedRow === absRow && selectedCol === actualCol)}
                  class:selected-row={selectionMode === 'row' && selectedRow === absRow}
                  class:selected-col={selectionMode === 'col' && selectedCol === actualCol}
                  class:editing={isInlineEditingCell(absRow, actualCol)}
                  class:highlight-mod={highlight === 'modified'}
                  class:highlight-add={highlight === 'added'}
                  class:highlight-del={highlight === 'deleted'}
                  class:find-match={isFindMatch(absRow, actualCol)}
                  class:current-match={isCurrentMatch(absRow, actualCol)}
                  class:fill-preview={isFillPreview(absRow, actualCol)}
                  class:frozen-cell={freezeRows > 0 && viewIndex < freezeRows}
                  colspan={merge?.colspan}
                  rowspan={merge?.rowspan}
                  style={(freezeRows > 0 && viewIndex < freezeRows ? getFreezeStyle(viewIndex) : '') + getCellStyle(absRow, actualCol)}
                  title={formula ? `=${formula}` : undefined}
                  data-row={absRow}
                  data-col={actualCol}
                  onmousedown={(e) => handleCellMouseDown(e, absRow, actualCol)}
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
                    <span class="cell-value">{formatDisplayValue(cell, absRow, actualCol)}</span>
                    {#if hasNote(absRow, actualCol)}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="note-indicator"
                        onmouseenter={() => { hoveredNoteKey = cellKey(absRow, actualCol); }}
                        onmouseleave={() => { hoveredNoteKey = null; }}
                      ></div>
                      {#if hoveredNoteKey === cellKey(absRow, actualCol)}
                        <div class="note-tooltip">{getNoteText(absRow, actualCol)}</div>
                      {/if}
                    {/if}
                    {#if selectedRow === absRow && selectedCol === actualCol && !isFilling}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div class="fill-handle" onmousedown={handleFillMouseDown}></div>
                    {/if}
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
      {#if selectedRow !== null && selectedCol !== null}
        <div class="context-divider"></div>
        <button
          class="context-item"
          onclick={() => { openNoteEditor(selectedRow!, selectedCol!); closeContextMenu(); }}
        >
          <MessageSquare size={14} />
          {hasNote(selectedRow, selectedCol) ? '메모 편집' : '메모 추가'}
        </button>
        {#if hasNote(selectedRow, selectedCol)}
          <button
            class="context-item danger"
            onclick={() => { deleteNote(selectedRow!, selectedCol!); closeContextMenu(); }}
          >
            <Trash2 size={14} />
            메모 삭제
          </button>
        {/if}
      {/if}
    </div>
  {/if}

  <div class="pagination-bar">
    <div class="stats">
      {#if rangeStats}
        <span class="range-stat">Count: {rangeStats.count}</span>
        {#if rangeStats.sum !== null}
          <span class="range-stat">Sum: {rangeStats.sum.toLocaleString()}</span>
          <span class="range-stat">Avg: {rangeStats.average?.toFixed(2)}</span>
        {/if}
      {:else}
        {cachedRowCount.toLocaleString()} / {totalRows.toLocaleString()} rows
      {/if}
    </div>
    <div class="controls">
      {#if isLoadingMore}
        <span class="loading-indicator">Loading...</span>
      {:else if hasMore}
        <span class="rows-remaining">{(totalRows - cachedRowCount).toLocaleString()} more</span>
      {:else if totalRows > 0}
        <span class="all-loaded">All loaded</span>
      {/if}
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

  /* Format Toolbar */
  .format-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    flex-wrap: wrap;
    min-height: 34px;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .toolbar-divider {
    width: 1px;
    height: 20px;
    background: var(--color-border);
    margin: 0 4px;
    flex-shrink: 0;
  }

  .tb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 28px;
    height: 28px;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    font-size: 12px;
    transition: background 0.1s, border-color 0.1s;
  }

  .tb-btn:hover {
    background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
    border-color: var(--color-border);
  }

  .tb-btn.active {
    background: color-mix(in srgb, var(--color-primary) 18%, var(--color-surface));
    border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
    color: var(--color-primary);
  }

  .tb-btn.text-btn {
    font-size: 11px;
    font-weight: 600;
    padding: 0 8px;
  }

  .tb-select {
    height: 28px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 11px;
    padding: 0 4px;
    cursor: pointer;
    font-family: var(--excel-font);
  }

  .tb-select:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .font-select {
    width: 110px;
  }

  .size-select {
    width: 52px;
  }

  .tb-color-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    width: 32px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    position: relative;
    gap: 1px;
    transition: background 0.1s;
  }

  .tb-color-btn:hover {
    background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
    border-color: var(--color-border);
  }

  .tb-color-btn input[type="color"] {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  .color-indicator {
    width: 16px;
    height: 3px;
    border-radius: 1px;
    flex-shrink: 0;
  }

  .toolbar-dropdown {
    position: relative;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 20;
    min-width: 140px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    padding: 4px;
    margin-top: 2px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dropdown-item {
    height: 30px;
    padding: 0 10px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .dropdown-item:hover {
    background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
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
    position: relative;
  }

  .col-resize-handle {
    position: absolute;
    right: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    z-index: 5;
  }

  .col-resize-handle:hover {
    background: color-mix(in srgb, var(--color-primary) 40%, transparent);
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

  .in-range {
    background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg)) !important;
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

  .range-stat {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text);
    margin-right: 6px;
  }

  /* Sort & Filter header */
  .col-label { pointer-events: none; }

  .sort-icon {
    display: inline-flex;
    color: var(--color-primary);
    margin-left: 2px;
    vertical-align: middle;
  }

  .col-sort-btn, .col-filter-btn {
    display: none;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }

  .col-sort-btn { right: 22px; }
  .col-filter-btn { right: 8px; }

  .col-header:hover .col-sort-btn,
  .col-header:hover .col-filter-btn,
  .col-filter-btn.active {
    display: inline-flex;
  }

  .col-sort-btn:hover, .col-filter-btn:hover {
    background: color-mix(in srgb, var(--color-primary) 20%, transparent);
    color: var(--color-primary);
  }

  .col-filter-btn.active {
    color: var(--color-primary);
  }

  .col-header.sorted {
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-elevated));
  }

  .col-header.filtered {
    background: color-mix(in srgb, #f59e0b 12%, var(--color-surface-elevated));
  }

  /* Filter dropdown */
  .filter-dropdown { position: relative; display: inline; }

  .filter-menu {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 25;
    min-width: 180px;
    max-height: 280px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
    display: flex;
    flex-direction: column;
    margin-top: 2px;
  }

  .filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border);
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .filter-clear-btn {
    border: none;
    background: transparent;
    color: var(--color-primary);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .filter-clear-btn:hover {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .filter-values {
    overflow-y: auto;
    padding: 4px;
    max-height: 220px;
  }

  .filter-value-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    font-size: 12px;
    color: var(--color-text);
    cursor: pointer;
    border-radius: 4px;
  }

  .filter-value-item:hover {
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  }

  .filter-value-item input[type="checkbox"] {
    width: 14px;
    height: 14px;
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  .filter-value-item span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Find bar */
  .find-bar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .find-row {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-text-muted);
  }

  .find-input {
    flex: 1;
    height: 28px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg);
    color: var(--color-text);
    padding: 0 8px;
    font-size: 12px;
    font-family: var(--excel-font);
    min-width: 120px;
  }

  .find-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .find-count {
    font-size: 11px;
    color: var(--color-text-muted);
    min-width: 50px;
    text-align: center;
    white-space: nowrap;
  }

  .find-nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
  }

  .find-nav-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    border-color: var(--color-primary);
  }

  .find-nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .find-action-btn {
    height: 26px;
    padding: 0 10px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface-elevated);
    color: var(--color-text);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }

  .find-action-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    border-color: var(--color-primary);
  }

  .find-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .find-match {
    background: rgba(250, 204, 21, 0.25) !important;
    box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.5);
  }

  .current-match {
    background: rgba(250, 204, 21, 0.5) !important;
    box-shadow: inset 0 0 0 2px rgba(234, 179, 8, 0.8);
  }

  /* Fill handle */
  .fill-handle {
    position: absolute;
    right: -3px;
    bottom: -3px;
    width: 7px;
    height: 7px;
    background: var(--color-primary);
    border: 1px solid white;
    cursor: crosshair;
    z-index: 5;
  }

  .fill-preview {
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg)) !important;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  /* Frozen rows */
  .frozen-cell {
    background: var(--color-surface-elevated) !important;
  }

  .loading-indicator {
    font-size: 11px;
    color: var(--color-primary);
    font-weight: 500;
  }

  .rows-remaining {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .all-loaded {
    font-size: 11px;
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  /* Number format dropdown */
  .numfmt-menu { min-width: 180px; }

  .numfmt-label { flex: 1; }

  .numfmt-example {
    font-size: 10px;
    color: var(--color-text-muted);
    font-family: var(--excel-font);
  }

  .dropdown-item.active-item {
    background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
    color: var(--color-primary);
    font-weight: 500;
  }

  .condfmt-menu .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dropdown-divider {
    height: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }

  /* Conditional format dialog */
  .cf-dialog {
    padding: 8px 12px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cf-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text);
  }

  .cf-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cf-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cf-input {
    height: 28px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg);
    color: var(--color-text);
    padding: 0 8px;
    font-size: 12px;
    font-family: var(--excel-font);
    flex: 1;
    min-width: 80px;
  }

  .cf-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .cf-and {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .cf-color-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .cf-color-label input[type="color"] {
    width: 24px;
    height: 20px;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 0;
    cursor: pointer;
  }

  .cf-preview {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    text-align: center;
    font-weight: 500;
  }

  .cf-gradient-preview {
    height: 20px;
    border-radius: 4px;
  }

  .cf-bar-preview {
    height: 24px;
    background: var(--color-bg);
    border-radius: 4px;
    overflow: hidden;
  }

  .cf-bar-sample {
    height: 100%;
    border-radius: 2px;
  }

  .cf-dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .cf-apply-btn:not(:disabled) {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .cf-apply-btn:not(:disabled):hover {
    opacity: 0.9;
  }

  /* Rule manager bar */
  .cf-rules-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
  }

  .cf-rules-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .cf-rules-list {
    display: flex;
    gap: 4px;
    flex: 1;
    overflow-x: auto;
  }

  .cf-rule-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 11px;
    white-space: nowrap;
  }

  .cf-rule-type {
    font-weight: 600;
    color: var(--color-primary);
  }

  .cf-rule-range {
    color: var(--color-text-muted);
  }

  .cf-rule-delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
  }

  .cf-rule-delete:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  /* Formula preview */
  .formula-preview {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
    padding: 2px 8px;
    border-radius: 4px;
    font-family: var(--excel-font);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Note indicator */
  .note-indicator {
    position: absolute;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-top: 6px solid #f59e0b;
    cursor: pointer;
    z-index: 2;
  }

  .note-tooltip {
    position: absolute;
    top: -4px;
    right: 8px;
    transform: translateY(-100%);
    z-index: 30;
    max-width: 220px;
    padding: 6px 10px;
    background: #fefce8;
    color: #713f12;
    border: 1px solid #fcd34d;
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.4;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    white-space: pre-wrap;
    word-break: break-word;
    pointer-events: none;
  }

  /* Note editor bar */
  .note-editor-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: #fefce8;
    border-bottom: 1px solid #fcd34d;
    color: #713f12;
  }

  .note-editor-label {
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .note-editor-input {
    flex: 1;
    height: 28px;
    border: 1px solid #fcd34d;
    border-radius: 4px;
    background: white;
    color: #713f12;
    padding: 0 8px;
    font-size: 12px;
    font-family: var(--excel-font);
  }

  .note-editor-input:focus {
    outline: none;
    border-color: #f59e0b;
  }

  /* Context menu divider */
  .context-divider {
    height: 1px;
    background: var(--color-border);
    margin: 2px 0;
  }
</style>
