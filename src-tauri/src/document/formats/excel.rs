use super::DocumentAdapter;
use crate::document::types::*;
use crate::document::error::DocError;
use std::path::Path;
use calamine::{open_workbook_auto, Reader, Data};
use rust_xlsxwriter::Workbook;

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

                sheets.push(SheetData {
                    name,
                    rows,
                    total_rows,
                    total_cols,
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

            for (r_idx, row) in sheet.rows.iter().enumerate() {
                for (c_idx, cell) in row.iter().enumerate() {
                    let r = r_idx as u32;
                    let c: u16 = c_idx.try_into().map_err(|_| DocError::ParseError(format!("Column index {} exceeds u16 max", c_idx)))?;
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
