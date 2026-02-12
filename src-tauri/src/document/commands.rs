use tauri::{Manager, State};
use crate::document::types::*;
use crate::document::manager::SessionManager;
use crate::document::formats::excel::ExcelAdapter;
use crate::document::formats::pdf::PdfAdapter;
use crate::document::formats::docx::DocxAdapter;
use crate::document::formats::hwp::HwpAdapter;
use crate::document::formats::DocumentAdapter;
use std::path::{Path, PathBuf};
use std::process::Command;

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
        "docx" | "doc" => {
             DocxAdapter::read(file_path).map_err(|e| e.to_string())?
        },
        "hwp" | "hwpx" => {
             HwpAdapter::read(file_path).map_err(|e| e.to_string())?
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

    state.create_session(doc_state.clone()).map_err(|e| e.to_string())?;
    Ok(doc_state)
}

#[tauri::command]
pub async fn doc_get_pdf_bytes(
    id: String,
    state: State<'_, SessionManager>,
) -> Result<Vec<u8>, String> {
    const MAX_FILE_SIZE: u64 = 200 * 1024 * 1024; // 200MB
    let bytes = state
        .get_session(&id, |session| -> Result<Vec<u8>, String> {
            if !matches!(session.state.doc_type, DocumentType::Pdf) {
                return Err("Document is not a PDF session".to_string());
            }

            let file_path = Path::new(&session.state.file_path);
            let metadata = std::fs::metadata(file_path)
                .map_err(|e| format!("Failed to read PDF metadata: {}", e))?;

            if metadata.len() > MAX_FILE_SIZE {
                return Err(format!(
                    "PDF is too large ({:.1} MB). Maximum supported size is 200 MB.",
                    metadata.len() as f64 / 1024.0 / 1024.0
                ));
            }

            std::fs::read(file_path).map_err(|e| format!("Failed to read PDF bytes: {}", e))
        })
        .map_err(|e| e.to_string())??;

    Ok(bytes)
}

#[tauri::command]
pub async fn doc_pdf_ocr_extract(
    app: tauri::AppHandle,
    id: String,
    lang: Option<String>,
    tessdata_dir: Option<String>,
    state: State<'_, SessionManager>,
) -> Result<String, String> {
    let file_path = state
        .get_session(&id, |session| -> Result<String, String> {
            if !matches!(session.state.doc_type, DocumentType::Pdf) {
                return Err("Document is not a PDF session".to_string());
            }
            Ok(session.state.file_path.clone())
        })
        .map_err(|e| e.to_string())??;

    let pdf_path = Path::new(&file_path);
    let binary_path = resolve_tesseract_bin(&app, None);
    let lang_value = lang
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("kor+eng");

    // Validate lang to prevent argument injection (allow alphanumeric, +, -, _)
    if !lang_value.chars().all(|c| c.is_alphanumeric() || c == '+' || c == '-' || c == '_') {
        return Err(format!("Invalid OCR language value: {}", lang_value));
    }

    let mut cmd = Command::new(&binary_path);
    cmd.arg(pdf_path).arg("stdout").arg("-l").arg(lang_value);

    if let Some(dir) = resolve_tessdata_dir(&app, tessdata_dir) {
        cmd.arg("--tessdata-dir").arg(dir);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute tesseract: {}", e))?;

    if output.status.success() {
        let extracted = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !extracted.is_empty() {
            return Ok(extracted);
        }
    }

    // If OCR fails (often due to missing PDF support in tesseract build),
    // return parser text as a fallback so the user still gets usable content.
    let fallback = pdf_extract::extract_text(pdf_path)
        .map_err(|e| {
            let stderr = String::from_utf8_lossy(&output.stderr);
            format!(
                "OCR failed and fallback extraction also failed. tesseract stderr: {} / fallback error: {}",
                stderr.trim(),
                e
            )
        })?
        .trim()
        .to_string();

    if fallback.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "OCR returned empty text. tesseract stderr: {}",
            stderr.trim()
        ));
    }

    Ok(fallback)
}

fn resolve_tesseract_bin(app: &tauri::AppHandle, configured: Option<String>) -> PathBuf {
    if let Some(path) = configured
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
    {
        return path;
    }

    if let Ok(from_env) = std::env::var("OPENCLAW_TESSERACT_BIN") {
        let trimmed = from_env.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let executable = if cfg!(target_os = "windows") {
            "tesseract.exe"
        } else {
            "tesseract"
        };

        let candidates = [
            resource_dir.join("tesseract").join("bin").join(executable),
            resource_dir.join("tesseract").join(executable),
            resource_dir.join(executable),
        ];

        for candidate in candidates {
            if candidate.exists() {
                return candidate;
            }
        }
    }

    PathBuf::from(if cfg!(target_os = "windows") {
        "tesseract.exe"
    } else {
        "tesseract"
    })
}

fn resolve_tessdata_dir(app: &tauri::AppHandle, configured: Option<String>) -> Option<PathBuf> {
    if let Some(path) = configured
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
    {
        // Only accept absolute paths that actually exist to prevent traversal
        if path.is_absolute() && path.exists() {
            return Some(path);
        }
        return None;
    }

    if let Ok(from_env) = std::env::var("TESSDATA_PREFIX") {
        let trimmed = from_env.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join("tesseract").join("tessdata");
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

#[tauri::command]
pub async fn doc_set_text_content(
    id: String,
    content: String,
    format: Option<String>,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    state
        .get_session_mut(&id, |session| -> Result<(), String> {
            if !matches!(session.state.doc_type, DocumentType::Text) {
                return Err("Document is not a text-like document".to_string());
            }

            if session.state.sheets.is_empty() {
                session.state.sheets.push(SheetData {
                    name: "Content".to_string(),
                    rows: vec![],
                    total_rows: 0,
                    total_cols: 1,
                    formulas: vec![],
                    merged_ranges: vec![],
                    row_heights: vec![],
                    col_widths: vec![],
                    styled_cells: vec![],
                });
            }

            let sheet = &mut session.state.sheets[0];
            let is_html = format
                .as_deref()
                .map(|f| f.eq_ignore_ascii_case("html"))
                .unwrap_or(false);

            if is_html {
                sheet.rows = vec![vec![CellValue::String(content)]];
            } else {
                let mut rows: Vec<Vec<CellValue>> = content
                    .split('\n')
                    .map(|line| vec![CellValue::String(line.to_string())])
                    .collect();
                if rows.is_empty() {
                    rows.push(vec![CellValue::String(String::new())]);
                }
                sheet.rows = rows;
            }

            sheet.total_rows = sheet.rows.len();
            sheet.total_cols = 1;
            sheet.formulas.clear();
            sheet.merged_ranges.clear();
            sheet.row_heights.clear();
            sheet.col_widths.clear();
            sheet.styled_cells.clear();
            session.state.modified = true;
            Ok(())
        })
        .map_err(|e| e.to_string())??;

    Ok(())
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
            formulas: vec![],
            merged_ranges: vec![],
            row_heights: vec![],
            col_widths: vec![],
            styled_cells: vec![],
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
            formulas: vec![],
            merged_ranges: vec![],
            row_heights: vec![],
            col_widths: vec![],
            styled_cells: vec![],
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
    if ext.eq_ignore_ascii_case("doc") {
        return Err("Legacy .doc 저장은 지원되지 않습니다. .docx로 저장해 주세요.".to_string());
    }
    if ext.eq_ignore_ascii_case("hwp") || ext.eq_ignore_ascii_case("hwpx") {
        return Err(
            ".hwp/.hwpx 직접 저장은 아직 지원되지 않습니다. .docx로 변환 저장해 주세요."
                .to_string(),
        );
    }
    if ext.eq_ignore_ascii_case("docx") {
        let rich_content = state.sheets.first()
            .and_then(|sheet| sheet.rows.first())
            .and_then(|row| row.first())
            .and_then(|cell| match cell {
                CellValue::String(s) => Some(s.clone()),
                _ => None,
            })
            .unwrap_or_default();

        return DocxAdapter::save(path, &rich_content).map_err(|e| e.to_string());
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
    state.list_sessions().map_err(|e| e.to_string())
}
