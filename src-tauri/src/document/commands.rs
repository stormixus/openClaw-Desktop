use tauri::State;
use crate::document::types::*;
use crate::document::manager::SessionManager;
use crate::document::formats::excel::ExcelAdapter;
use crate::document::formats::pdf::PdfAdapter;
use crate::document::formats::docx::DocxAdapter;
use crate::document::formats::DocumentAdapter;
use std::path::Path;

#[tauri::command]
pub async fn doc_open(
    path: String,
    state: State<'_, SessionManager>,
) -> Result<DocState, String> {
    let file_path = Path::new(&path);
    let extension = file_path.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    let doc_state = match extension.as_str() {
        "xlsx" | "xls" | "ods" => {
             ExcelAdapter::read(file_path).map_err(|e| e.to_string())?
        },
        "pdf" => {
             PdfAdapter::read(file_path).map_err(|e| e.to_string())?
        },
        "docx" => {
             DocxAdapter::read(file_path).map_err(|e| e.to_string())?
        },
        "csv" => {
            read_csv_file(file_path)?
        },
        "txt" | "md" | "json" => {
            read_text_file(file_path)?
        },
        _ => {
            return Err(format!("Unsupported file type: .{}", extension));
        }
    };

    state.create_session(doc_state.clone());
    Ok(doc_state)
}

fn read_text_file(file_path: &Path) -> Result<DocState, String> {
    const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB
    let metadata = std::fs::metadata(file_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!("File too large ({:.1} MB). Maximum supported size is 10 MB.",
            metadata.len() as f64 / 1024.0 / 1024.0));
    }

    let content = std::fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("untitled.txt")
        .to_string();

    let rows: Vec<Vec<CellValue>> = content
        .lines()
        .map(|line| vec![CellValue::String(line.to_string())])
        .collect();

    let total_rows = rows.len();
    let id = format!("{}-{}", file_name, std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());

    Ok(DocState {
        id,
        doc_type: DocumentType::Text,
        file_path: file_path.to_string_lossy().to_string(),
        file_name,
        sheets: vec![SheetData {
            name: "Content".to_string(),
            rows,
            total_rows,
            total_cols: 1,
        }],
        modified: false,
    })
}

fn read_csv_file(file_path: &Path) -> Result<DocState, String> {
    const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB
    let metadata = std::fs::metadata(file_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!("File too large ({:.1} MB). Maximum supported size is 10 MB.",
            metadata.len() as f64 / 1024.0 / 1024.0));
    }

    let content = std::fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read CSV: {}", e))?;

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("untitled.csv")
        .to_string();

    let mut rows: Vec<Vec<CellValue>> = Vec::new();
    let mut max_cols = 0usize;

    for line in content.lines() {
        let cells: Vec<CellValue> = line
            .split(',')
            .map(|field| {
                let trimmed = field.trim().trim_matches('"');
                if trimmed.is_empty() {
                    CellValue::Empty
                } else if let Ok(n) = trimmed.parse::<f64>() {
                    CellValue::Number(n)
                } else if trimmed.eq_ignore_ascii_case("true") || trimmed.eq_ignore_ascii_case("false") {
                    CellValue::Bool(trimmed.eq_ignore_ascii_case("true"))
                } else {
                    CellValue::String(trimmed.to_string())
                }
            })
            .collect();
        if cells.len() > max_cols {
            max_cols = cells.len();
        }
        rows.push(cells);
    }

    let total_rows = rows.len();
    let id = format!("{}-{}", file_name, std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());

    Ok(DocState {
        id,
        doc_type: DocumentType::Excel,
        file_path: file_path.to_string_lossy().to_string(),
        file_name,
        sheets: vec![SheetData {
            name: "Sheet1".to_string(),
            rows,
            total_rows,
            total_cols: max_cols,
        }],
        modified: false,
    })
}

#[tauri::command]
pub async fn doc_read_view(
    id: String,
    opts: ViewOptions,
    state: State<'_, SessionManager>,
) -> Result<ViewData, String> {
    state.get_session(&id, |session| {
        let sheet_idx = opts.sheet_index.unwrap_or(0);
        if let Some(sheet) = session.state.sheets.get(sheet_idx) {
            let start = opts.start_row.unwrap_or(0);
            let max = std::cmp::min(opts.max_rows.unwrap_or(100), 1000);
            let end = std::cmp::min(start + max, sheet.rows.len());

            let rows = if start < sheet.rows.len() {
                sheet.rows[start..end].to_vec()
            } else {
                vec![]
            };

            ViewData {
                sheet_name: sheet.name.clone(),
                rows,
                start_row: start,
                total_rows: sheet.total_rows,
                total_cols: sheet.total_cols,
            }
        } else {
             // If no sheets or invalid index, return empty
             ViewData {
                sheet_name: "".to_string(),
                rows: vec![],
                start_row: 0,
                total_rows: 0,
                total_cols: 0,
            }
        }
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn doc_stage_patch(
    id: String,
    patch: JsonPatch,
    state: State<'_, SessionManager>,
) -> Result<PatchPreview, String> {
    state.stage_patch(&id, patch).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn doc_commit(
    id: String,
    save_path: Option<String>,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    state.commit_staged(&id).map_err(|e| e.to_string())?;

    // Optionally save to disk after committing
    if let Some(path) = save_path {
        doc_save_inner(&id, &path, &*state)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn doc_save(
    id: String,
    save_path: Option<String>,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    state.get_session(&id, |session| {
        let path = save_path.as_deref().unwrap_or(&session.state.file_path);
        let file_path = Path::new(path);
        match session.state.doc_type {
            DocumentType::Excel => {
                ExcelAdapter::save(&session.state, file_path)
                    .map_err(|e| e.to_string())
            },
            DocumentType::Text => {
                save_text_file(&session.state, file_path)
            },
            _ => Err("Save not supported for this document type".to_string()),
        }
    }).map_err(|e| e.to_string())??;
    Ok(())
}

fn doc_save_inner(id: &str, path: &str, state: &SessionManager) -> Result<(), String> {
    state.get_session(id, |session| {
        let file_path = Path::new(path);
        match session.state.doc_type {
            DocumentType::Excel => {
                ExcelAdapter::save(&session.state, file_path)
                    .map_err(|e| e.to_string())
            },
            DocumentType::Text => {
                save_text_file(&session.state, file_path)
            },
            _ => Err("Save not supported for this document type".to_string()),
        }
    }).map_err(|e| e.to_string())?
}

fn save_text_file(state: &DocState, path: &Path) -> Result<(), String> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if ext.eq_ignore_ascii_case("docx") {
        return Err("Cannot save as .docx format. Use 'Save As' with a .txt or .md extension.".to_string());
    }

    let content: String = state.sheets.first()
        .map(|sheet| {
            sheet.rows.iter()
                .map(|row| {
                    row.first()
                        .map(|cell| match cell {
                            CellValue::String(s) => s.as_str(),
                            _ => "",
                        })
                        .unwrap_or("")
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    std::fs::write(path, content)
        .map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
pub async fn doc_discard(
    id: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    state.discard_staged(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn doc_close(
    id: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    state.close_session(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn doc_undo(
    id: String,
    state: State<'_, SessionManager>,
) -> Result<DocState, String> {
    state.undo(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn doc_redo(
    id: String,
    state: State<'_, SessionManager>,
) -> Result<DocState, String> {
    state.redo(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn doc_list_sessions(
    state: State<'_, SessionManager>,
) -> Result<Vec<SessionSummary>, String> {
    Ok(state.list_sessions())
}
