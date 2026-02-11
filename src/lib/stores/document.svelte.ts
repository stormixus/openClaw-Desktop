import { invoke } from '@tauri-apps/api/core';

// --- Rust Types (Serialization) ---

export type RustCellValue =
  | { String: string }
  | { Number: number }
  | { Bool: boolean }
  | { DateTime: string }
  | "Empty";

export type RustDocumentType = "Excel" | "Pdf" | "Text";

export interface RustSheetData {
  name: string;
  rows: RustCellValue[][];
  total_rows: number;
  total_cols: number;
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
}

export interface Document {
  id: string;
  docType: 'excel' | 'pdf' | 'text';
  filePath: string;
  fileName: string;
  sheets: Sheet[];
  modified: boolean;
  activeSheetName?: string;
}

export interface SessionSummary {
  id: string;
  fileName: string;
  docType: 'excel' | 'pdf' | 'text';
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
  | { RowDelete: { sheet: string; index: number } }
  | { RowInsert: { sheet: string; index: number; values: RustCellValue[] } }
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

function convertDocType(rust: RustDocumentType): 'excel' | 'pdf' | 'text' {
  switch (rust) {
    case 'Excel': return 'excel';
    case 'Pdf': return 'pdf';
    case 'Text': return 'text';
  }
}

function convertSheetData(rust: RustSheetData): Sheet {
  return {
    name: rust.name,
    rows: rust.rows.map(row => row.map(convertCellValue)),
    totalRows: rust.total_rows,
    totalCols: rust.total_cols,
    startRow: 0
  };
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
