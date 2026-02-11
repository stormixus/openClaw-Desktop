use super::DocumentAdapter;
use super::xlsx_visuals::extract_sheet_visual_meta;
use crate::document::types::*;
use crate::document::error::DocError;
use std::path::Path;
use calamine::{open_workbook_auto, Reader, Data, Sheets};
use rust_xlsxwriter::Workbook;
use std::collections::HashMap;

pub struct ExcelAdapter;

impl DocumentAdapter for ExcelAdapter {
    fn read(path: &Path) -> Result<DocState, DocError> {
        let mut workbook = open_workbook_auto(path)
            .map_err(|e| DocError::ParseError(e.to_string()))?;

        let mut sheets = Vec::new();
        let sheet_names = workbook.sheet_names().to_vec();

        for name in sheet_names {
            if let Ok(range) = workbook.worksheet_range(&name) {
                let (total_rows, total_cols) = range.get_size();
                let range_start = range.start().unwrap_or((0, 0));
                let mut rows = Vec::with_capacity(total_rows);

                for r in range.rows() {
                    let mut row_data = Vec::with_capacity(total_cols);
                    for cell in r {
                        let value = match cell {
                            Data::Int(i) => CellValue::Number(*i as f64),
                            Data::Float(f) => CellValue::Number(*f),
                            Data::String(s) => CellValue::String(s.clone()),
                            Data::Bool(b) => CellValue::Bool(*b),
                            Data::DateTime(d) => CellValue::DateTime(d.to_string()),
                            Data::DateTimeIso(d) => CellValue::DateTime(d.clone()),
                            Data::DurationIso(d) => CellValue::String(d.clone()),
                            Data::Error(e) => CellValue::String(format!("Error: {:?}", e)),
                            Data::Empty => CellValue::Empty,
                        };
                        row_data.push(value);
                    }
                    rows.push(row_data);
                }

                let formulas = workbook
                    .worksheet_formula(&name)
                    .map(|f| collect_formula_cells(&f, range_start, total_rows, total_cols))
                    .unwrap_or_default();

                let merged_ranges = collect_merged_ranges(
                    &mut workbook,
                    &name,
                    range_start,
                    total_rows,
                    total_cols,
                );

                let visuals = extract_sheet_visual_meta(
                    path,
                    &name,
                    range_start,
                    total_rows,
                    total_cols,
                ).unwrap_or_default();

                sheets.push(SheetData {
                    name,
                    rows,
                    total_rows,
                    total_cols,
                    formulas,
                    merged_ranges,
                    row_heights: visuals.row_heights,
                    col_widths: visuals.col_widths,
                    styled_cells: visuals.styled_cells,
                });
            }
        }

        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Simple ID generation
        let id = format!("{}-{}", file_name, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());

        Ok(DocState {
            id,
            doc_type: DocumentType::Excel,
            file_path: path.to_string_lossy().to_string(),
            file_name,
            sheets,
            modified: false,
        })
    }

    fn save(state: &DocState, path: &Path) -> Result<(), DocError> {
        let mut workbook = Workbook::new();

        for sheet in &state.sheets {
            let worksheet = workbook.add_worksheet();
            // Set sheet name if valid, otherwise use default
            if !sheet.name.is_empty() {
                let _ = worksheet.set_name(&sheet.name);
            }

            let mut formula_map = HashMap::new();
            for f in &sheet.formulas {
                formula_map.insert((f.row, f.col), f.formula.as_str());
            }

            for (r_idx, row) in sheet.rows.iter().enumerate() {
                for (c_idx, cell) in row.iter().enumerate() {
                    let r = r_idx as u32;
                    let c: u16 = c_idx.try_into().map_err(|_| DocError::ParseError(format!("Column index {} exceeds u16 max", c_idx)))?;
                    if let Some(formula) = formula_map.get(&(r_idx, c_idx)) {
                        worksheet
                            .write_formula(r, c, *formula)
                            .map_err(|e| DocError::ParseError(e.to_string()))?;
                        continue;
                    }
                    match cell {
                        CellValue::String(s) => {
                            worksheet.write_string(r, c, s).map_err(|e| DocError::ParseError(e.to_string()))?;
                        },
                        CellValue::Number(n) => {
                            worksheet.write_number(r, c, *n).map_err(|e| DocError::ParseError(e.to_string()))?;
                        },
                        CellValue::Bool(b) => {
                            worksheet.write_boolean(r, c, *b).map_err(|e| DocError::ParseError(e.to_string()))?;
                        },
                        CellValue::DateTime(dt) => {
                            worksheet.write_string(r, c, dt).map_err(|e| DocError::ParseError(e.to_string()))?;
                        },
                        CellValue::Empty => {}
                    }
                }
            }
        }

        workbook.save(path).map_err(|e| DocError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))
    }
}

fn collect_formula_cells(
    range: &calamine::Range<String>,
    range_start: (u32, u32),
    total_rows: usize,
    total_cols: usize,
) -> Vec<FormulaCell> {
    if total_rows == 0 || total_cols == 0 {
        return Vec::new();
    }
    let row_end = range_start.0.saturating_add(total_rows as u32).saturating_sub(1);
    let col_end = range_start.1.saturating_add(total_cols as u32).saturating_sub(1);

    range
        .used_cells()
        .filter_map(|(row, col, value)| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else if (row as u32) < range_start.0
                || (row as u32) > row_end
                || (col as u32) < range_start.1
                || (col as u32) > col_end
            {
                None
            } else {
                Some(FormulaCell {
                    row: (row as u32).saturating_sub(range_start.0) as usize,
                    col: (col as u32).saturating_sub(range_start.1) as usize,
                    formula: trimmed.to_string(),
                })
            }
        })
        .collect()
}

fn collect_merged_ranges(
    workbook: &mut Sheets<std::io::BufReader<std::fs::File>>,
    sheet_name: &str,
    range_start: (u32, u32),
    total_rows: usize,
    total_cols: usize,
) -> Vec<MergeRange> {
    let mut out = Vec::new();

    let dims = match workbook {
        Sheets::Xlsx(xlsx) => xlsx
            .worksheet_merge_cells(sheet_name)
            .and_then(|res| res.ok())
            .unwrap_or_default(),
        _ => Vec::new(),
    };

    for dim in dims {
        if dim.end.0 < range_start.0 || dim.end.1 < range_start.1 {
            continue;
        }

        let start_row = dim.start.0.saturating_sub(range_start.0) as usize;
        let start_col = dim.start.1.saturating_sub(range_start.1) as usize;
        let end_row = dim.end.0.saturating_sub(range_start.0) as usize;
        let end_col = dim.end.1.saturating_sub(range_start.1) as usize;

        if start_row >= total_rows || start_col >= total_cols {
            continue;
        }

        out.push(MergeRange {
            start_row,
            start_col,
            end_row: end_row.min(total_rows.saturating_sub(1)),
            end_col: end_col.min(total_cols.saturating_sub(1)),
        });
    }

    out
}
