use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum DocumentType {
    Excel,
    Pdf,
    Text,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum CellValue {
    String(String),
    Number(f64),
    Bool(bool),
    DateTime(String),
    Empty,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SheetData {
    pub name: String,
    pub rows: Vec<Vec<CellValue>>,
    pub total_rows: usize,
    pub total_cols: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocState {
    pub id: String,
    pub doc_type: DocumentType,
    pub file_path: String,
    pub file_name: String,
    pub sheets: Vec<SheetData>,
    pub modified: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ViewOptions {
    pub sheet_index: Option<usize>,
    pub start_row: Option<usize>,
    pub max_rows: Option<usize>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ViewData {
    pub sheet_name: String,
    pub rows: Vec<Vec<CellValue>>,
    pub start_row: usize,
    pub total_rows: usize,
    pub total_cols: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum PatchOperation {
    CellUpdate {
        sheet: String,
        row: usize,
        col: usize,
        value: CellValue,
    },
    RowDelete {
        sheet: String,
        index: usize,
    },
    RowInsert {
        sheet: String,
        index: usize,
        values: Vec<CellValue>,
    },
    ColDelete {
        sheet: String,
        index: usize,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JsonPatch {
    pub operations: Vec<PatchOperation>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiffEntry {
    pub sheet: String,
    pub row: usize,
    pub col: usize,
    pub old_value: CellValue,
    pub new_value: CellValue,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PatchPreview {
    pub changes: Vec<DiffEntry>,
    pub summary: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SessionSummary {
    pub id: String,
    pub file_name: String,
    pub doc_type: DocumentType,
    pub modified: bool,
}
