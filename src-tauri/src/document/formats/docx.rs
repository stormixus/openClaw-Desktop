use std::path::Path;
use std::fs::File;
use std::io::Read;
use crate::document::types::*;
use crate::document::error::DocError;

pub struct DocxAdapter;

impl DocxAdapter {
    pub fn read(path: &Path) -> Result<DocState, DocError> {
        const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB
        let metadata = std::fs::metadata(path).map_err(DocError::IoError)?;
        if metadata.len() > MAX_FILE_SIZE {
            return Err(DocError::ValidationError(format!("File too large ({:.1} MB). Maximum supported size is 10 MB.",
                metadata.len() as f64 / 1024.0 / 1024.0)));
        }

        let file = File::open(path).map_err(DocError::IoError)?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| DocError::ParseError(e.to_string()))?;

        // Read word/document.xml
        let mut document_xml = String::new();
        match archive.by_name("word/document.xml") {
            Ok(mut file) => {
                file.read_to_string(&mut document_xml)
                    .map_err(DocError::IoError)?;
            },
            Err(_) => return Err(DocError::ParseError("Invalid DOCX: missing word/document.xml".to_string())),
        }

        // Simple text extraction by finding <w:t> tags
        // We don't need a full XML parser for this simple requirement
        let mut rows = Vec::new();

        // This is a very naive extractor, but fits the "simple/robust" requirement
        // It splits by <w:p> to find paragraphs, then finds all <w:t> content within

        // Remove namespace prefixes to make it easier
        let clean_xml = document_xml.replace("w:", "w_");

        let parts: Vec<&str> = clean_xml.split("<w_p ").collect();

        // Skip the first part (header stuff)
        for part in parts.iter().skip(1) {
            // Find the end of the paragraph
            if let Some(end_idx) = part.find("</w_p>") {
                let paragraph_content = &part[..end_idx];

                // Extract text from <w_t> tags
                let mut paragraph_text = String::new();
                let text_parts: Vec<&str> = paragraph_content.split("<w_t>").collect();

                for text_part in text_parts.iter().skip(1) {
                    if let Some(text_end) = text_part.find("</w_t>") {
                        paragraph_text.push_str(&text_part[..text_end]);
                    } else if let Some(text_end) = text_part.find("</w_t ") {
                        // Handle case with attributes if simple split fails, though <w:t> usually has no attributes
                        paragraph_text.push_str(&text_part[..text_end]);
                    }
                }

                if !paragraph_text.is_empty() {
                    rows.push(vec![CellValue::String(paragraph_text)]);
                }
            }
        }

        // Fallback: if the split approach fails or returns nothing, try a simpler global replace
        // This handles cases where w:p might have different attributes or structure
        if rows.is_empty() {
             let text_parts: Vec<&str> = clean_xml.split("<w_t>").collect();
             for text_part in text_parts.iter().skip(1) {
                if let Some(text_end) = text_part.find("</w_t>") {
                    let text = &text_part[..text_end];
                    if !text.is_empty() {
                        rows.push(vec![CellValue::String(text.to_string())]);
                    }
                }
             }
        }

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("untitled.docx")
            .to_string();

        let total_rows = rows.len();
        let id = format!("{}-{}", file_name, std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());

        Ok(DocState {
            id,
            doc_type: DocumentType::Text, // Reuse Text type as requested
            file_path: path.to_string_lossy().to_string(),
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
}
