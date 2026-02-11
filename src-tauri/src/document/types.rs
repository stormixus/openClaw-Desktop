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
    pub formulas: Vec<FormulaCell>,
    pub merged_ranges: Vec<MergeRange>,
    pub row_heights: Vec<RowHeight>,
    pub col_widths: Vec<ColWidth>,
    pub styled_cells: Vec<StyledCell>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FormulaCell {
    pub row: usize,
    pub col: usize,
    pub formula: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MergeRange {
    pub start_row: usize,
    pub start_col: usize,
    pub end_row: usize,
    pub end_col: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RowHeight {
    pub row: usize,
    pub height: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ColWidth {
    pub start_col: usize,
    pub end_col: usize,
    pub width: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StyledCell {
    pub row: usize,
    pub col: usize,
    pub style: CellStyle,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CellStyle {
    pub font_name: Option<String>,
    pub font_size: Option<f32>,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub font_color: Option<String>,
    pub bg_color: Option<String>,
    pub h_align: Option<String>,
    pub v_align: Option<String>,
    pub wrap_text: bool,
    pub border_left: bool,
    pub border_right: bool,
    pub border_top: bool,
    pub border_bottom: bool,
    pub number_format_id: Option<u32>,
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
    CellFormulaUpdate {
        sheet: String,
        row: usize,
        col: usize,
        formula: String,
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
    ColInsert {
        sheet: String,
        index: usize,
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
