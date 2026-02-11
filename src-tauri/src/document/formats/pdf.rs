use super::DocumentAdapter;
use crate::document::types::*;
use crate::document::error::DocError;
use std::path::Path;

pub struct PdfAdapter;

impl DocumentAdapter for PdfAdapter {
    fn read(path: &Path) -> Result<DocState, DocError> {
        const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024; // 50MB
        let metadata = std::fs::metadata(path).map_err(|e| DocError::ParseError(format!("Failed to read file metadata: {}", e)))?;
        if metadata.len() > MAX_FILE_SIZE {
             return Err(DocError::ValidationError(format!("File too large ({:.1} MB). Maximum supported size is 50 MB.",
                metadata.len() as f64 / 1024.0 / 1024.0)));
        }

        let content = pdf_extract::extract_text(path)
            .map_err(|e| DocError::ParseError(format!("Failed to extract PDF text: {}", e)))?;

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("untitled.pdf")
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
            doc_type: DocumentType::Pdf,
            file_path: path.to_string_lossy().to_string(),
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

    fn save(_state: &DocState, _path: &Path) -> Result<(), DocError> {
        Err(DocError::UnsupportedFormat("PDF saving is not supported".to_string()))
    }
}
