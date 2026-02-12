import { invoke } from '@tauri-apps/api/core';

// --- Rust Types (Serialization) ---

export type RustCellValue =
  | { String: string }
  | { Number: number }
  | { Bool: boolean }
  | { DateTime: string }
  | "Empty";

export type RustDocumentType = "Excel" | "Pdf" | "Text" | "Presentation";

export interface RustSheetData {
  name: string;
  rows: RustCellValue[][];
  total_rows: number;
  total_cols: number;
  formulas: RustFormulaCell[];
  merged_ranges: RustMergeRange[];
  row_heights: RustRowHeight[];
  col_widths: RustColWidth[];
  styled_cells: RustStyledCell[];
}

export interface RustFormulaCell {
  row: number;
  col: number;
  formula: string;
}

export interface RustMergeRange {
  start_row: number;
  start_col: number;
  end_row: number;
  end_col: number;
}

export interface RustRowHeight {
  row: number;
  height: number;
}

export interface RustColWidth {
  start_col: number;
  end_col: number;
  width: number;
}

export interface RustCellStyle {
  font_name?: string | null;
  font_size?: number | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  font_color?: string | null;
  bg_color?: string | null;
  h_align?: string | null;
  v_align?: string | null;
  wrap_text: boolean;
  border_left: boolean;
  border_right: boolean;
  border_top: boolean;
  border_bottom: boolean;
  number_format_id?: number | null;
}

export interface RustStyledCell {
  row: number;
  col: number;
  style: RustCellStyle;
}

export interface RustDocState {
  id: string;
  doc_type: RustDocumentType;
  file_path: string;
  file_name: string;
  sheets: RustSheetData[];
  modified: boolean;
}

export interface RustViewData {
  sheet_name: string;
  rows: RustCellValue[][];
  start_row: number;
  total_rows: number;
  total_cols: number;
}

export interface RustViewOptions {
  sheet_index?: number;
  start_row?: number;
  max_rows?: number;
}

export interface RustSessionSummary {
  id: string;
  file_name: string;
  doc_type: RustDocumentType;
  modified: boolean;
}

// --- Frontend Types (UI) ---

export interface CellValue {
  type: 'string' | 'number' | 'bool' | 'datetime' | 'empty';
  value: string | number | boolean | null;
}

export interface Sheet {
  name: string;
  rows: CellValue[][];
  totalRows: number;
  totalCols: number;
  startRow: number;
  formulas: FormulaCell[];
  mergedRanges: MergeRange[];
  rowHeights: RowHeight[];
  colWidths: ColWidth[];
  styledCells: StyledCell[];
}

export interface FormulaCell {
  row: number;
  col: number;
  formula: string;
}

export interface MergeRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface RowHeight {
  row: number;
  height: number;
}

export interface ColWidth {
  startCol: number;
  endCol: number;
  width: number;
}

export interface CellStyle {
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

export interface StyledCell {
  row: number;
  col: number;
  style: CellStyle;
}

export interface Document {
  id: string;
  docType: 'excel' | 'pdf' | 'text' | 'presentation';
  filePath: string;
  fileName: string;
  sheets: Sheet[];
  modified: boolean;
  activeSheetName?: string;
}

export interface SessionSummary {
  id: string;
  fileName: string;
  docType: 'excel' | 'pdf' | 'text' | 'presentation';
  modified: boolean;
}

// --- Patch Types ---

export interface RustDiffEntry {
  sheet: string;
  row: number;
  col: number;
  old_value: RustCellValue;
  new_value: RustCellValue;
}

export interface RustPatchPreview {
  changes: RustDiffEntry[];
  summary: string;
}

export interface DiffEntry {
  sheet: string;
  row: number;
  col: number;
  oldValue: CellValue;
  newValue: CellValue;
}

export interface PatchPreview {
  changes: DiffEntry[];
  summary: string;
}

export type PatchOperation =
  | { CellUpdate: { sheet: string; row: number; col: number; value: RustCellValue } }
  | { CellFormulaUpdate: { sheet: string; row: number; col: number; formula: string } }
  | { RowDelete: { sheet: string; index: number } }
  | { RowInsert: { sheet: string; index: number; values: RustCellValue[] } }
  | { ColInsert: { sheet: string; index: number } }
  | { ColDelete: { sheet: string; index: number } };

export interface JsonPatch {
  operations: PatchOperation[];
}

// --- Store Implementation ---

export const docStore = $state({
  sessions: [] as SessionSummary[],
  activeDocument: null as Document | null,
  isLoading: false,
  error: null as string | null,
});

// --- Converters ---

function convertCellValue(rust: RustCellValue): CellValue {
  if (rust === "Empty") {
    return { type: 'empty', value: null };
  }
  if ('String' in rust) {
    return { type: 'string', value: rust.String };
  }
  if ('Number' in rust) {
    return { type: 'number', value: rust.Number };
  }
  if ('Bool' in rust) {
    return { type: 'bool', value: rust.Bool };
  }
  if ('DateTime' in rust) {
    return { type: 'datetime', value: rust.DateTime };
  }
  return { type: 'empty', value: null };
}

function convertToRustCellValue(cell: CellValue): RustCellValue {
  switch (cell.type) {
    case 'string': return { String: cell.value as string };
    case 'number': return { Number: cell.value as number };
    case 'bool': return { Bool: cell.value as boolean };
    case 'datetime': return { DateTime: cell.value as string };
    case 'empty': return "Empty";
    default: return "Empty";
  }
}

function convertDocType(rust: RustDocumentType): 'excel' | 'pdf' | 'text' | 'presentation' {
  switch (rust) {
    case 'Excel': return 'excel';
    case 'Pdf': return 'pdf';
    case 'Text': return 'text';
    case 'Presentation': return 'presentation';
  }
}

function convertSheetData(rust: RustSheetData): Sheet {
  return {
    name: rust.name,
    rows: rust.rows.map(row => row.map(convertCellValue)),
    totalRows: rust.total_rows,
    totalCols: rust.total_cols,
    startRow: 0,
    formulas: (rust.formulas ?? []).map((f) => ({
      row: f.row,
      col: f.col,
      formula: f.formula,
    })),
    mergedRanges: (rust.merged_ranges ?? []).map((m) => ({
      startRow: m.start_row,
      startCol: m.start_col,
      endRow: m.end_row,
      endCol: m.end_col,
    })),
    rowHeights: (rust.row_heights ?? []).map((h) => ({
      row: h.row,
      height: h.height,
    })),
    colWidths: (rust.col_widths ?? []).map((w) => ({
      startCol: w.start_col,
      endCol: w.end_col,
      width: w.width,
    })),
    styledCells: (rust.styled_cells ?? []).map((s) => ({
      row: s.row,
      col: s.col,
      style: {
        fontName: s.style.font_name,
        fontSize: s.style.font_size,
        bold: s.style.bold,
        italic: s.style.italic,
        underline: s.style.underline,
        fontColor: s.style.font_color,
        bgColor: s.style.bg_color,
        hAlign: s.style.h_align,
        vAlign: s.style.v_align,
        wrapText: s.style.wrap_text,
        borderLeft: s.style.border_left,
        borderRight: s.style.border_right,
        borderTop: s.style.border_top,
        borderBottom: s.style.border_bottom,
        numberFormatId: s.style.number_format_id,
      },
    })),
  };
}

function removeFormulaAt(sheet: Sheet, row: number, col: number): void {
  sheet.formulas = sheet.formulas.filter((f) => !(f.row === row && f.col === col));
}

function upsertFormula(sheet: Sheet, row: number, col: number, formula: string): void {
  const idx = sheet.formulas.findIndex((f) => f.row === row && f.col === col);
  if (idx >= 0) {
    sheet.formulas[idx] = { row, col, formula };
  } else {
    sheet.formulas = [...sheet.formulas, { row, col, formula }];
  }
}

function parseInputToCellValue(input: string): RustCellValue {
  const raw = input ?? '';
  const trimmed = raw.trim();

  if (trimmed.length === 0) return "Empty";
  if (/^(true|false)$/i.test(trimmed)) {
    return { Bool: trimmed.toLowerCase() === 'true' };
  }

  // Keep number parsing conservative to avoid surprising string conversion.
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) {
      return { Number: n };
    }
  }

  return { String: raw };
}

function ensureVisibleCell(sheet: Sheet, row: number, col: number): void {
  const relRow = row - sheet.startRow;
  if (relRow < 0 || relRow >= sheet.rows.length) return;
  while (sheet.rows[relRow].length <= col) {
    sheet.rows[relRow].push({ type: 'empty', value: null });
  }
}

// --- Actions ---

export async function listSessions(): Promise<void> {
  docStore.isLoading = true;
  try {
    const sessions = await invoke<RustSessionSummary[]>('doc_list_sessions');
    docStore.sessions = sessions.map(s => ({
      id: s.id,
      fileName: s.file_name,
      docType: convertDocType(s.doc_type),
      modified: s.modified
    }));
  } catch (err: any) {
    console.error('Failed to list sessions', err);
    docStore.error = err.message || 'Failed to list sessions';
  } finally {
    docStore.isLoading = false;
  }
}

export async function openDocument(path: string): Promise<Document> {
  docStore.isLoading = true;
  docStore.error = null;
  try {
    const rustState = await invoke<RustDocState>('doc_open', { path });

    const doc: Document = {
      id: rustState.id,
      docType: convertDocType(rustState.doc_type),
      filePath: rustState.file_path,
      fileName: rustState.file_name,
      sheets: rustState.sheets.map(convertSheetData),
      modified: rustState.modified,
      activeSheetName: rustState.sheets.length > 0 ? rustState.sheets[0].name : undefined
    };

    docStore.activeDocument = doc;

    // Refresh sessions list
    await listSessions();

    return doc;
  } catch (err: any) {
    console.error('Failed to open document', err);
    docStore.error = err.message || 'Failed to open document';
    throw err;
  } finally {
    docStore.isLoading = false;
  }
}

export async function loadView(id: string, opts: { sheet_index?: number; start_row?: number; max_rows?: number }): Promise<void> {
  docStore.isLoading = true;
  try {
    const viewData = await invoke<RustViewData>('doc_read_view', { id, opts });

    // Update the local document state with the new view data
    if (docStore.activeDocument && docStore.activeDocument.id === id) {
      const sheetIndex = docStore.activeDocument.sheets.findIndex(s => s.name === viewData.sheet_name);
      if (sheetIndex !== -1) {
        const sheet = docStore.activeDocument.sheets[sheetIndex];
        const convertedRows = viewData.rows.map(row => row.map(convertCellValue));

        docStore.activeDocument.sheets[sheetIndex] = {
          ...sheet,
          rows: convertedRows,
          startRow: viewData.start_row,
          totalRows: viewData.total_rows,
          totalCols: viewData.total_cols,
        };

        docStore.activeDocument.activeSheetName = viewData.sheet_name;
      }
    }
  } catch (err: any) {
    docStore.error = err.message || 'Failed to load view';
  } finally {
    docStore.isLoading = false;
  }
}

export async function updateCellValue(
  id: string,
  sheetName: string,
  row: number,
  col: number,
  input: string,
): Promise<void> {
  const activeDoc = docStore.activeDocument;
  if (!activeDoc || activeDoc.id !== id) {
    throw new Error('Active document not found');
  }

  const sheetIndex = activeDoc.sheets.findIndex((s) => s.name === sheetName);
  if (sheetIndex === -1) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const sheet = activeDoc.sheets[sheetIndex];
  const trimmed = (input ?? '').trim();
  const isFormula = trimmed.startsWith('=');

  let op: PatchOperation;
  if (isFormula) {
    op = {
      CellFormulaUpdate: {
        sheet: sheetName,
        row,
        col,
        formula: trimmed.slice(1),
      },
    };
  } else {
    op = {
      CellUpdate: {
        sheet: sheetName,
        row,
        col,
        value: parseInputToCellValue(input),
      },
    };
  }

  await stagePatch(id, { operations: [op] });
  await commitChanges(id);

  // Optimistic local patch so UX stays responsive before view reload.
  ensureVisibleCell(sheet, row, col);
  const relRow = row - sheet.startRow;
  if (relRow >= 0 && relRow < sheet.rows.length) {
    if (isFormula) {
      const formula = trimmed.slice(1).trim();
      if (formula.length === 0) {
        sheet.rows[relRow][col] = { type: 'empty', value: null };
        removeFormulaAt(sheet, row, col);
      } else {
        sheet.rows[relRow][col] = { type: 'string', value: `=${formula}` };
        upsertFormula(sheet, row, col, formula);
      }
    } else {
      sheet.rows[relRow][col] = convertCellValue(parseInputToCellValue(input));
      removeFormulaAt(sheet, row, col);
    }
  }

  if (row + 1 > sheet.totalRows) {
    sheet.totalRows = row + 1;
  }
  if (col + 1 > sheet.totalCols) {
    sheet.totalCols = col + 1;
  }

  await loadView(id, {
    sheet_index: sheetIndex,
    start_row: sheet.startRow,
    max_rows: Math.max(sheet.rows.length, 50),
  });
}

export async function updateSheetStructure(
  id: string,
  sheetName: string,
  action: 'row_insert' | 'row_delete' | 'col_insert' | 'col_delete',
  index: number,
): Promise<void> {
  const activeDoc = docStore.activeDocument;
  if (!activeDoc || activeDoc.id !== id) {
    throw new Error('Active document not found');
  }

  const sheetIndex = activeDoc.sheets.findIndex((s) => s.name === sheetName);
  if (sheetIndex === -1) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }
  const sheet = activeDoc.sheets[sheetIndex];
  const clampedIndex = Math.max(0, index);

  let op: PatchOperation;
  if (action === 'row_insert') {
    op = { RowInsert: { sheet: sheetName, index: clampedIndex, values: [] } };
  } else if (action === 'row_delete') {
    op = { RowDelete: { sheet: sheetName, index: clampedIndex } };
  } else if (action === 'col_insert') {
    op = { ColInsert: { sheet: sheetName, index: clampedIndex } };
  } else {
    op = { ColDelete: { sheet: sheetName, index: clampedIndex } };
  }

  await stagePatch(id, { operations: [op] });
  await commitChanges(id);

  const maxRows = Math.max(sheet.rows.length, 50);
  const safeStart = Math.max(
    0,
    Math.min(sheet.startRow, Math.max(0, sheet.totalRows - maxRows)),
  );
  await loadView(id, {
    sheet_index: sheetIndex,
    start_row: safeStart,
    max_rows: maxRows,
  });
}

export async function setTextContent(
  id: string,
  content: string,
  format: 'plain' | 'html' = 'plain',
  sheetIndex?: number,
): Promise<void> {
  await invoke('doc_set_text_content', { id, content, format, sheetIndex: sheetIndex ?? null });
  if (docStore.activeDocument?.id === id) {
    docStore.activeDocument.modified = true;
    // Update local sheet state so UI refreshes immediately
    if (sheetIndex !== undefined && docStore.activeDocument.sheets[sheetIndex]) {
      docStore.activeDocument.sheets[sheetIndex].rows = [[{ type: 'string', value: content }]];
      docStore.activeDocument.sheets[sheetIndex].totalRows = 1;
    }
  }
}

export async function stagePatch(id: string, patch: JsonPatch): Promise<PatchPreview> {
  const rustPreview = await invoke<RustPatchPreview>('doc_stage_patch', { id, patch });
  return {
    summary: rustPreview.summary,
    changes: rustPreview.changes.map(c => ({
      sheet: c.sheet,
      row: c.row,
      col: c.col,
      oldValue: convertCellValue(c.old_value),
      newValue: convertCellValue(c.new_value),
    })),
  };
}

export async function commitChanges(id: string): Promise<void> {
  docStore.isLoading = true;
  try {
    await invoke('doc_commit', { id });
    if (docStore.activeDocument && docStore.activeDocument.id === id) {
        docStore.activeDocument.modified = true;
    }
    await listSessions();
  } catch (err: any) {
    docStore.error = err.message || 'Failed to commit changes';
    throw err;
  } finally {
    docStore.isLoading = false;
  }
}

export async function saveDocument(id: string): Promise<void> {
  docStore.isLoading = true;
  try {
    await invoke('doc_save', { id });
    if (docStore.activeDocument && docStore.activeDocument.id === id) {
        docStore.activeDocument.modified = false;
    }
    await listSessions();
  } catch (err: any) {
    docStore.error = err.message || 'Failed to save document';
    throw err;
  } finally {
    docStore.isLoading = false;
  }
}

export async function discardChanges(id: string): Promise<void> {
  await invoke('doc_discard', { id });
  // Reload view
  if (docStore.activeDocument?.filePath) {
      await openDocument(docStore.activeDocument.filePath);
  }
}

export async function closeDocument(id: string): Promise<void> {
  await invoke('doc_close', { id });
  if (docStore.activeDocument?.id === id) {
    docStore.activeDocument = null;
  }
  await listSessions();
}

export async function undo(id: string): Promise<void> {
    const state = await invoke<RustDocState>('doc_undo', { id });
    if (docStore.activeDocument && docStore.activeDocument.id === id) {
        // Update sheets
        docStore.activeDocument.sheets = state.sheets.map(convertSheetData);
        docStore.activeDocument.modified = state.modified;
    }
}

export async function redo(id: string): Promise<void> {
    const state = await invoke<RustDocState>('doc_redo', { id });
    if (docStore.activeDocument && docStore.activeDocument.id === id) {
        docStore.activeDocument.sheets = state.sheets.map(convertSheetData);
        docStore.activeDocument.modified = state.modified;
    }
}
