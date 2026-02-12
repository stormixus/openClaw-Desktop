use crate::document::types::*;
use crate::document::error::DocError;

/// Apply a JSON patch to a DocState, returning a preview of the changes.
/// This is a standalone utility; the SessionManager also has this logic integrated.
pub fn apply_patch(state: &DocState, patch: JsonPatch) -> Result<PatchPreview, DocError> {
    let mut staged = state.clone();

    for op in &patch.operations {
        apply_single_op(&mut staged, op)?;
    }

    let changes = diff_states(state, &staged);
    let summary = format!("{} changes staged", changes.len());

    Ok(PatchPreview { changes, summary })
}

pub fn apply_single_op(state: &mut DocState, op: &PatchOperation) -> Result<(), DocError> {
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

            sheet_data.rows[*row][*col] = value.clone();
            remove_formula_at(sheet_data, *row, *col);
        },
        PatchOperation::CellFormulaUpdate { sheet, row, col, formula } => {
            const MAX_ROWS: usize = 1_048_576; // Excel max
            const MAX_COLS: usize = 16_384;    // Excel max
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

fn invalidate_sheet_metadata(sheet: &mut SheetData) {
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
