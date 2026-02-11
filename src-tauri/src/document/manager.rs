use std::collections::HashMap;
use std::sync::Mutex;
use crate::document::types::*;
use crate::document::error::DocError;

pub struct DocumentSession {
    pub state: DocState,
    pub undo_stack: Vec<DocState>,
    pub redo_stack: Vec<DocState>,
    pub staged_state: Option<DocState>,
    pub staged_patch: Option<JsonPatch>,
}

pub struct SessionManager {
    pub sessions: Mutex<HashMap<String, DocumentSession>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn create_session(&self, state: DocState) -> String {
        let id = state.id.clone();
        let session = DocumentSession {
            state,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            staged_state: None,
            staged_patch: None,
        };
        self.sessions.lock().unwrap().insert(id.clone(), session);
        id
    }

    pub fn get_session<F, R>(&self, id: &str, f: F) -> Result<R, DocError>
    where
        F: FnOnce(&DocumentSession) -> R,
    {
        let sessions = self.sessions.lock().unwrap();
        match sessions.get(id) {
            Some(session) => Ok(f(session)),
            None => Err(DocError::SessionNotFound(id.to_string())),
        }
    }

    pub fn get_session_mut<F, R>(&self, id: &str, f: F) -> Result<R, DocError>
    where
        F: FnOnce(&mut DocumentSession) -> R,
    {
        let mut sessions = self.sessions.lock().unwrap();
        match sessions.get_mut(id) {
            Some(session) => Ok(f(session)),
            None => Err(DocError::SessionNotFound(id.to_string())),
        }
    }

    pub fn close_session(&self, id: &str) -> Result<(), DocError> {
        let mut sessions = self.sessions.lock().unwrap();
        if sessions.remove(id).is_some() {
            Ok(())
        } else {
            Err(DocError::SessionNotFound(id.to_string()))
        }
    }

    pub fn list_sessions(&self) -> Vec<SessionSummary> {
        let sessions = self.sessions.lock().unwrap();
        sessions.values().map(|s| SessionSummary {
            id: s.state.id.clone(),
            file_name: s.state.file_name.clone(),
            doc_type: s.state.doc_type.clone(),
            modified: s.state.modified,
        }).collect()
    }

    pub fn stage_patch(&self, id: &str, patch: JsonPatch) -> Result<PatchPreview, DocError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(id).ok_or_else(|| DocError::SessionNotFound(id.to_string()))?;

        let mut staged = session.state.clone();

        for op in &patch.operations {
            Self::apply_op(&mut staged, op)?;
        }

        let changes = Self::diff_states(&session.state, &staged);
        let summary = format!("{} changes staged", changes.len());

        session.staged_state = Some(staged);
        session.staged_patch = Some(patch);

        Ok(PatchPreview { changes, summary })
    }

    pub fn commit_staged(&self, id: &str) -> Result<(), DocError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(id).ok_or_else(|| DocError::SessionNotFound(id.to_string()))?;

        if let Some(staged) = session.staged_state.take() {
            session.undo_stack.push(session.state.clone());

            const MAX_UNDO_DEPTH: usize = 20;
            if session.undo_stack.len() > MAX_UNDO_DEPTH {
                session.undo_stack.remove(0);
            }

            session.redo_stack.clear();
            session.state = staged;
            session.state.modified = true;
            session.staged_patch = None;
            Ok(())
        } else {
            Ok(())
        }
    }

    pub fn discard_staged(&self, id: &str) -> Result<(), DocError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(id).ok_or_else(|| DocError::SessionNotFound(id.to_string()))?;
        session.staged_state = None;
        session.staged_patch = None;
        Ok(())
    }

    pub fn undo(&self, id: &str) -> Result<DocState, DocError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(id).ok_or_else(|| DocError::SessionNotFound(id.to_string()))?;

        if let Some(prev) = session.undo_stack.pop() {
            session.redo_stack.push(session.state.clone());
            session.state = prev;
        }
        Ok(session.state.clone())
    }

    pub fn redo(&self, id: &str) -> Result<DocState, DocError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(id).ok_or_else(|| DocError::SessionNotFound(id.to_string()))?;

        if let Some(next) = session.redo_stack.pop() {
            session.undo_stack.push(session.state.clone());
            session.state = next;
        }
        Ok(session.state.clone())
    }

    fn apply_op(state: &mut DocState, op: &PatchOperation) -> Result<(), DocError> {
        match op {
            PatchOperation::CellUpdate { sheet, row, col, value } => {
                const MAX_ROWS: usize = 1_048_576; // Excel max
                const MAX_COLS: usize = 16_384;    // Excel max
                const MAX_TOTAL_CELLS: usize = 5_000_000;

                if *row >= MAX_ROWS || *col >= MAX_COLS {
                    return Err(DocError::PatchError(format!("Dimensions exceed limits: row={}, col={}", row, col)));
                }

                let sheet_data = state.sheets.iter_mut().find(|s| s.name == *sheet)
                    .ok_or_else(|| DocError::PatchError(format!("Sheet not found: {}", sheet)))?;

                // Check total cells limit
                let current_rows = sheet_data.rows.len();
                let current_cols = sheet_data.total_cols;
                let new_rows = std::cmp::max(current_rows, *row + 1);
                let new_cols = std::cmp::max(current_cols, *col + 1);

                if new_rows * new_cols > MAX_TOTAL_CELLS {
                    return Err(DocError::PatchError(format!("Operation would exceed max cell limit of {}", MAX_TOTAL_CELLS)));
                }

                // Expand if needed
                while sheet_data.rows.len() <= *row {
                    sheet_data.rows.push(vec![CellValue::Empty; sheet_data.total_cols]);
                }
                while sheet_data.rows[*row].len() <= *col {
                    sheet_data.rows[*row].push(CellValue::Empty);
                }

                // Update max dims
                if sheet_data.rows.len() > sheet_data.total_rows {
                    sheet_data.total_rows = sheet_data.rows.len();
                }
                if *col >= sheet_data.total_cols {
                    sheet_data.total_cols = *col + 1;
                    // Pad other rows?
                    for r in &mut sheet_data.rows {
                        if r.len() < sheet_data.total_cols {
                            r.resize(sheet_data.total_cols, CellValue::Empty);
                        }
                    }
                }

                sheet_data.rows[*row][*col] = value.clone();
                remove_formula_at(sheet_data, *row, *col);
            },
            PatchOperation::CellFormulaUpdate { sheet, row, col, formula } => {
                const MAX_ROWS: usize = 1_048_576;
                const MAX_COLS: usize = 16_384;
                const MAX_TOTAL_CELLS: usize = 5_000_000;

                if *row >= MAX_ROWS || *col >= MAX_COLS {
                    return Err(DocError::PatchError(format!("Dimensions exceed limits: row={}, col={}", row, col)));
                }

                let sheet_data = state.sheets.iter_mut().find(|s| s.name == *sheet)
                    .ok_or_else(|| DocError::PatchError(format!("Sheet not found: {}", sheet)))?;

                let current_rows = sheet_data.rows.len();
                let current_cols = sheet_data.total_cols;
                let new_rows = std::cmp::max(current_rows, *row + 1);
                let new_cols = std::cmp::max(current_cols, *col + 1);
                if new_rows * new_cols > MAX_TOTAL_CELLS {
                    return Err(DocError::PatchError(format!("Operation would exceed max cell limit of {}", MAX_TOTAL_CELLS)));
                }

                while sheet_data.rows.len() <= *row {
                    sheet_data.rows.push(vec![CellValue::Empty; sheet_data.total_cols]);
                }
                while sheet_data.rows[*row].len() <= *col {
                    sheet_data.rows[*row].push(CellValue::Empty);
                }

                if sheet_data.rows.len() > sheet_data.total_rows {
                    sheet_data.total_rows = sheet_data.rows.len();
                }
                if *col >= sheet_data.total_cols {
                    sheet_data.total_cols = *col + 1;
                    for r in &mut sheet_data.rows {
                        if r.len() < sheet_data.total_cols {
                            r.resize(sheet_data.total_cols, CellValue::Empty);
                        }
                    }
                }

                let clean_formula = formula.trim().trim_start_matches('=').to_string();
                if clean_formula.is_empty() {
                    remove_formula_at(sheet_data, *row, *col);
                    sheet_data.rows[*row][*col] = CellValue::Empty;
                } else {
                    upsert_formula(sheet_data, *row, *col, clean_formula.clone());
                    // Keep a visible marker value until workbook recalculates.
                    sheet_data.rows[*row][*col] = CellValue::String(format!("={}", clean_formula));
                }
            },
            PatchOperation::RowDelete { sheet, index } => {
                let sheet_data = state.sheets.iter_mut().find(|s| s.name == *sheet)
                    .ok_or_else(|| DocError::PatchError(format!("Sheet not found: {}", sheet)))?;
                if *index < sheet_data.rows.len() {
                    sheet_data.rows.remove(*index);
                    sheet_data.total_rows = sheet_data.rows.len();
                    invalidate_sheet_metadata(sheet_data);
                }
            },
            PatchOperation::RowInsert { sheet, index, values } => {
                let sheet_data = state.sheets.iter_mut().find(|s| s.name == *sheet)
                    .ok_or_else(|| DocError::PatchError(format!("Sheet not found: {}", sheet)))?;
                let mut new_row = values.clone();
                new_row.resize(sheet_data.total_cols, CellValue::Empty);

                if *index <= sheet_data.rows.len() {
                    sheet_data.rows.insert(*index, new_row);
                } else {
                    sheet_data.rows.push(new_row);
                }
                sheet_data.total_rows = sheet_data.rows.len();
                invalidate_sheet_metadata(sheet_data);
            },
            PatchOperation::ColInsert { sheet, index } => {
                let sheet_data = state.sheets.iter_mut().find(|s| s.name == *sheet)
                    .ok_or_else(|| DocError::PatchError(format!("Sheet not found: {}", sheet)))?;

                for row in &mut sheet_data.rows {
                    if *index <= row.len() {
                        row.insert(*index, CellValue::Empty);
                    } else {
                        row.push(CellValue::Empty);
                    }
                }

                sheet_data.total_cols = sheet_data.total_cols.saturating_add(1);
                for row in &mut sheet_data.rows {
                    if row.len() < sheet_data.total_cols {
                        row.resize(sheet_data.total_cols, CellValue::Empty);
                    }
                }

                invalidate_sheet_metadata(sheet_data);
            },
            PatchOperation::ColDelete { sheet, index } => {
                let sheet_data = state.sheets.iter_mut().find(|s| s.name == *sheet)
                    .ok_or_else(|| DocError::PatchError(format!("Sheet not found: {}", sheet)))?;
                if *index < sheet_data.total_cols {
                    for row in &mut sheet_data.rows {
                        if *index < row.len() {
                            row.remove(*index);
                        }
                    }
                    if sheet_data.total_cols > 0 {
                        sheet_data.total_cols -= 1;
                    }
                    invalidate_sheet_metadata(sheet_data);
                }
            }
        }
        Ok(())
    }

    fn diff_states(old: &DocState, new: &DocState) -> Vec<DiffEntry> {
        let mut changes = Vec::new();
        for new_sheet in &new.sheets {
            if let Some(old_sheet) = old.sheets.iter().find(|s| s.name == new_sheet.name) {
                let max_rows = std::cmp::max(old_sheet.rows.len(), new_sheet.rows.len());
                for r in 0..max_rows {
                    let max_cols = if r < old_sheet.rows.len() && r < new_sheet.rows.len() {
                        std::cmp::max(old_sheet.rows[r].len(), new_sheet.rows[r].len())
                    } else if r < old_sheet.rows.len() {
                        old_sheet.rows[r].len()
                    } else {
                        new_sheet.rows[r].len()
                    };

                    for c in 0..max_cols {
                         let old_val = if r < old_sheet.rows.len() && c < old_sheet.rows[r].len() {
                             &old_sheet.rows[r][c]
                         } else {
                             &CellValue::Empty
                         };
                         let new_val = if r < new_sheet.rows.len() && c < new_sheet.rows[r].len() {
                             &new_sheet.rows[r][c]
                         } else {
                             &CellValue::Empty
                         };

                         if old_val != new_val {
                             changes.push(DiffEntry {
                                 sheet: new_sheet.name.clone(),
                                 row: r,
                                 col: c,
                                 old_value: old_val.clone(),
                                 new_value: new_val.clone(),
                             });
                         }
                    }
                }
            }
        }
        changes
    }
}

fn invalidate_sheet_metadata(sheet: &mut SheetData) {
    // Spreadsheet structural edits invalidate formula/merge coordinates.
    // Recompute on reopen to avoid showing stale positions.
    sheet.formulas.clear();
    sheet.merged_ranges.clear();
    sheet.styled_cells.clear();
    sheet.row_heights.clear();
    sheet.col_widths.clear();
}

fn remove_formula_at(sheet: &mut SheetData, row: usize, col: usize) {
    sheet.formulas.retain(|f| !(f.row == row && f.col == col));
}

fn upsert_formula(sheet: &mut SheetData, row: usize, col: usize, formula: String) {
    if let Some(existing) = sheet.formulas.iter_mut().find(|f| f.row == row && f.col == col) {
        existing.formula = formula;
    } else {
        sheet.formulas.push(FormulaCell { row, col, formula });
    }
}
