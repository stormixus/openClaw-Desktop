use std::collections::HashMap;
use std::fs::File;
use std::io::{Cursor, Read};
use std::path::Path;
use std::process::Command;

use cfb::CompoundFile;
use flate2::read::{DeflateDecoder, ZlibDecoder};
use roxmltree::Document;

use crate::document::error::DocError;
use crate::document::formats::docx::DocxAdapter;
use crate::document::formats::DocumentAdapter;
use crate::document::types::{CellValue, DocState, DocumentType, SheetData};

pub struct HwpAdapter;

const MAX_FILE_SIZE: u64 = 25 * 1024 * 1024; // 25MB
const MAX_EXTRACTED_LINES: usize = 6_000;
const MAX_LINE_CHARS: usize = 1_200;
const MAX_TOTAL_TEXT_CHARS: usize = 2_000_000;
const MAX_SECTION_COUNT: usize = 1_024;

const HWP_EXTENDED_SIZE: usize = 0x0FFF;
const TAG_PARA_TEXT: u16 = 67;
const TAG_CTRL_HEADER: u16 = 71;
const TAG_LIST_HEADER: u16 = 72;
const TAG_TABLE: u16 = 77;
const TAG_PARA_HEADER: u16 = 66;
const TAG_PARA_CHAR_SHAPE: u16 = 68;
const TAG_DOCINFO_CHAR_SHAPE: u16 = 21;
const TAG_DOCINFO_PARA_SHAPE: u16 = 25;

#[derive(Clone, Copy, Debug, PartialEq)]
enum HwpAlignment {
    Justify,
    Left,
    Right,
    Center,
    Distribute,
}

#[derive(Clone, Debug)]
struct HwpParaShape {
    alignment: HwpAlignment,
}

#[derive(Clone, Debug)]
struct HwpCharShape {
    font_size_pt: f32,
}

struct HwpDocInfo {
    char_shapes: Vec<HwpCharShape>,
    para_shapes: Vec<HwpParaShape>,
}

#[derive(Clone, Copy)]
struct HwpRecord<'a> {
    tag: u16,
    level: u16,
    payload: &'a [u8],
}

#[derive(Clone, Copy, Debug)]
struct ParsedCellAddr {
    row: usize,
    col: usize,
    row_span: usize,
    col_span: usize,
}

#[derive(Clone, Debug)]
struct ParsedTableCell {
    addr: ParsedCellAddr,
    text: String,
    font_size_pt: Option<f32>,
}

#[derive(Clone, Copy)]
struct ExtractBudget {
    remaining_lines: usize,
    remaining_chars: usize,
}

impl ExtractBudget {
    fn new() -> Self {
        Self {
            remaining_lines: MAX_EXTRACTED_LINES,
            remaining_chars: MAX_TOTAL_TEXT_CHARS,
        }
    }

    fn exhausted(&self) -> bool {
        self.remaining_lines == 0 || self.remaining_chars == 0
    }

    fn allow_line(&mut self, text: &str) -> bool {
        let len = text.chars().count();
        if len == 0 || len > MAX_LINE_CHARS {
            return false;
        }
        if self.remaining_lines == 0 || self.remaining_chars < len {
            return false;
        }
        self.remaining_lines -= 1;
        self.remaining_chars -= len;
        true
    }
}

impl DocumentAdapter for HwpAdapter {
    fn read(path: &Path) -> Result<DocState, DocError> {
        let metadata = std::fs::metadata(path).map_err(DocError::IoError)?;
        if metadata.len() > MAX_FILE_SIZE {
            return Err(DocError::ValidationError(format!(
                "File too large ({:.1} MB). Maximum supported size is 25 MB.",
                metadata.len() as f64 / 1024.0 / 1024.0
            )));
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        let html = if ext == "hwpx" {
            Self::read_hwpx_as_html(path)?
        } else {
            Self::read_hwp_as_html(path)?
        };

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("untitled.hwp")
            .to_string();

        let id = format!(
            "{}-{}",
            file_name,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );

        Ok(DocState {
            id,
            doc_type: DocumentType::Text,
            file_path: path.to_string_lossy().to_string(),
            file_name,
            sheets: vec![SheetData {
                name: "Content".to_string(),
                rows: vec![vec![CellValue::String(html)]],
                total_rows: 1,
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
        Err(DocError::UnsupportedFormat(
            ".hwp/.hwpx native save is not supported".to_string(),
        ))
    }
}

impl HwpAdapter {
    fn read_hwp_as_html(path: &Path) -> Result<String, DocError> {
        let mut candidates: Vec<String> = Vec::new();

        // If pyhwp(hwp5txt) is installed, include it as a fallback candidate.
        if let Some(text) = run_stdout_converter("hwp5txt", &[path.to_string_lossy().as_ref()]) {
            let lines = text_blob_to_lines(&text);
            if !lines.is_empty() {
                candidates.push(lines_to_html(&lines));
            }
        }

        // macOS bridge candidate: convert HWP -> DOCX and reuse high-fidelity DOCX parser.
        if let Some(html) = try_textutil_docx_bridge(path) {
            candidates.push(html);
        }

        // Rich HTML candidate from textutil.
        if let Some(html) = try_textutil_html(path) {
            candidates.push(html);
        }

        // Native parser candidate from HWP BodyText records.
        if let Ok(html) = read_hwp_binary_as_html(path) {
            candidates.push(html);
        }

        if let Some(best) = pick_best_hwp_html(candidates) {
            return Ok(best);
        }

        Err(DocError::ParseError(
            "본문 텍스트를 추출하지 못했습니다. 배포용/암호화 문서일 수 있습니다.".to_string(),
        ))
    }

    fn read_hwpx_as_html(path: &Path) -> Result<String, DocError> {
        let file = File::open(path).map_err(DocError::IoError)?;
        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| DocError::ParseError(e.to_string()))?;

        let mut section_xml_names: Vec<String> = Vec::new();
        let mut fallback_xml_names: Vec<String> = Vec::new();

        for i in 0..archive.len() {
            let Ok(file) = archive.by_index(i) else {
                continue;
            };
            let name = file.name().to_string();
            if !name.ends_with(".xml") {
                continue;
            }
            if name.contains("Contents/section") {
                section_xml_names.push(name);
            } else {
                fallback_xml_names.push(name);
            }
        }

        section_xml_names.sort();
        fallback_xml_names.sort();
        let targets = if section_xml_names.is_empty() {
            fallback_xml_names
        } else {
            section_xml_names
        };

        let mut all_lines: Vec<String> = Vec::new();
        for name in targets.into_iter().take(MAX_SECTION_COUNT) {
            let mut xml_bytes = Vec::new();
            if let Ok(mut file) = archive.by_name(&name) {
                file.read_to_end(&mut xml_bytes)
                    .map_err(DocError::IoError)?;
                let xml = String::from_utf8_lossy(&xml_bytes);
                all_lines.extend(extract_lines_from_hwpx_xml(&xml));
                if all_lines.len() >= MAX_EXTRACTED_LINES {
                    break;
                }
            }
        }

        let lines = dedupe_lines(all_lines);
        if lines.is_empty() {
            return Err(DocError::ParseError(
                "Failed to parse HWPX content. Please try converting to DOCX.".to_string(),
            ));
        }

        Ok(lines_to_html(&lines))
    }
}

fn read_hwp_binary_as_html(path: &Path) -> Result<String, DocError> {
    let mut comp = cfb::open(path)
        .map_err(|e| DocError::ParseError(format!("Invalid HWP container: {}", e)))?;

    let file_header = read_stream_bytes(&mut comp, "/FileHeader")
        .or_else(|_| read_stream_bytes(&mut comp, "FileHeader"))?;

    if !looks_like_hwp_header(&file_header) {
        return Err(DocError::ParseError(
            "Not a valid HWP v5 file header".to_string(),
        ));
    }

    let compressed = hwp_is_compressed(&file_header);
    let doc_info = parse_docinfo(&mut comp, compressed);
    let section_paths = collect_body_section_paths(&comp);
    if section_paths.is_empty() {
        return Err(DocError::ParseError(
            "HWP BodyText sections not found".to_string(),
        ));
    }

    let mut budget = ExtractBudget::new();
    let mut body_html = String::new();

    for section_path in section_paths.into_iter().take(MAX_SECTION_COUNT) {
        if budget.exhausted() {
            break;
        }

        let section_raw = read_stream_bytes(&mut comp, &section_path)?;
        let section_data = if compressed {
            inflate_hwp_stream(&section_raw).unwrap_or(section_raw)
        } else {
            section_raw
        };

        let section_html = render_hwp_section_as_html(&section_data, &mut budget, &doc_info);
        if !section_html.is_empty() {
            body_html.push_str(&section_html);
        }
    }

    if body_html.trim().is_empty() {
        return Err(DocError::ParseError(
            "본문 텍스트를 추출하지 못했습니다. 배포용/암호화 문서일 수 있습니다.".to_string(),
        ));
    }

    Ok(format!(
        "<div class=\"docx-root hwp-root\">{}</div>",
        body_html
    ))
}

fn render_hwp_section_as_html(data: &[u8], budget: &mut ExtractBudget, doc_info: &HwpDocInfo) -> String {
    let records = parse_hwp_records(data);
    if records.is_empty() {
        return String::new();
    }

    let mut out = String::new();
    let mut idx = 0usize;
    let mut current_alignment: Option<HwpAlignment> = None;

    while idx < records.len() && !budget.exhausted() {
        let rec = records[idx];

        // Track PARA_HEADER to extract paragraph shape (alignment)
        if rec.tag == TAG_PARA_HEADER {
            current_alignment = extract_para_alignment(rec.payload, &doc_info.para_shapes);
        }

        if rec.tag == TAG_CTRL_HEADER && is_table_ctrl_header(rec.payload) {
            let (table_html, next_idx, has_table_content) =
                render_hwp_table_from_ctrl_header(&records, idx, budget, doc_info);
            if has_table_content {
                out.push_str(&table_html);
            }
            idx = next_idx;
            current_alignment = None;
            continue;
        }

        if rec.tag == TAG_PARA_TEXT {
            let paragraph = decode_para_text(rec.payload);
            let primary_shape = find_primary_char_shape(&records, idx, &doc_info.char_shapes);
            append_paragraph_html(&mut out, &paragraph, budget, primary_shape, current_alignment);
            current_alignment = None;
        }

        idx += 1;
    }

    out
}

/// Extract alignment from PARA_HEADER payload.
/// Bytes 8-9: paraShapeId (UINT16) referencing the PARA_SHAPE table in DocInfo.
fn extract_para_alignment(payload: &[u8], para_shapes: &[HwpParaShape]) -> Option<HwpAlignment> {
    if payload.len() < 10 {
        return None;
    }
    let para_shape_id = u16::from_le_bytes([payload[8], payload[9]]) as usize;
    let shape = para_shapes.get(para_shape_id)?;
    Some(shape.alignment)
}

fn alignment_to_css(align: HwpAlignment) -> Option<&'static str> {
    match align {
        HwpAlignment::Left => None, // default, no style needed
        HwpAlignment::Center => Some("center"),
        HwpAlignment::Right => Some("right"),
        HwpAlignment::Justify | HwpAlignment::Distribute => Some("justify"),
    }
}

fn render_hwp_table_from_ctrl_header(
    records: &[HwpRecord<'_>],
    ctrl_index: usize,
    budget: &mut ExtractBudget,
    doc_info: &HwpDocInfo,
) -> (String, usize, bool) {
    let end_idx = find_subtree_end(records, ctrl_index);

    let mut table_payload: Option<&[u8]> = None;
    let mut first_table_idx: Option<usize> = None;
    for (idx, rec) in records
        .iter()
        .enumerate()
        .skip(ctrl_index + 1)
        .take(end_idx.saturating_sub(ctrl_index + 1))
    {
        if rec.tag == TAG_TABLE {
            table_payload = Some(rec.payload);
            first_table_idx = Some(idx);
            break;
        }
    }

    let (decl_rows, decl_cols) = table_payload
        .and_then(parse_table_dimensions)
        .unwrap_or((0, 0));

    let mut caption_lines: Vec<String> = Vec::new();
    let mut cells: Vec<ParsedTableCell> = Vec::new();
    let mut fallback_cells: Vec<String> = Vec::new();

    let mut idx = ctrl_index + 1;
    while idx < end_idx && !budget.exhausted() {
        let rec = records[idx];
        if rec.tag != TAG_LIST_HEADER {
            idx += 1;
            continue;
        }

        let list_level = rec.level;
        let child_start = idx + 1;
        // Find end of this cell's content: next boundary record (LIST_HEADER,
        // TABLE, CTRL_HEADER at same level) or any record at a lower level.
        // Some HWP files place PARA_TEXT at the same level as LIST_HEADER,
        // so we can't simply use find_next_at_or_above_level here.
        let child_end = find_next_cell_boundary(records, child_start, end_idx, list_level);

        let mut cell_lines: Vec<String> = Vec::new();
        collect_para_text_lines(
            records,
            child_start,
            child_end,
            budget,
            &mut cell_lines,
            true,
        );
        let cell_text = join_nonempty_lines(&cell_lines);

        let is_caption = first_table_idx
            .map(|table_idx| idx < table_idx)
            .unwrap_or(false);
        if is_caption {
            if !cell_text.is_empty() {
                caption_lines.push(cell_text);
            }
            idx = child_end;
            continue;
        }

        let cell_font_size = find_cell_primary_font_size(records, child_start, child_end, &doc_info.char_shapes);
        if let Some(addr) = parse_cell_addr_from_list_header(rec.payload) {
            cells.push(ParsedTableCell {
                addr,
                text: cell_text,
                font_size_pt: cell_font_size,
            });
        } else if !cell_text.is_empty() {
            fallback_cells.push(cell_text);
        }

        idx = child_end;
    }

    if cells.is_empty() && fallback_cells.is_empty() {
        return (String::new(), end_idx, false);
    }

    let mut html = String::new();
    if !caption_lines.is_empty() {
        for cap in caption_lines {
            html.push_str("<p class=\"hwp-table-caption\">");
            html.push_str(&escape_html(&cap).replace('\n', "<br/>"));
            html.push_str("</p>");
        }
    }

    if !cells.is_empty() {
        html.push_str(&render_table_with_positions(&cells, decl_rows, decl_cols));
    } else {
        html.push_str(&render_fallback_table(
            &fallback_cells,
            decl_rows,
            decl_cols,
        ));
    }

    (html, end_idx, true)
}

/// Find the end of a table cell's content range.
/// Unlike `find_next_at_or_above_level`, this only breaks on boundary tags
/// (LIST_HEADER, TABLE, CTRL_HEADER) at the same level, or any record at a
/// lower level.  This correctly handles HWP files where PARA_TEXT records
/// inside cells share the same level as the parent LIST_HEADER.
fn find_next_cell_boundary(
    records: &[HwpRecord<'_>],
    from: usize,
    to: usize,
    level: u16,
) -> usize {
    let mut idx = from;
    while idx < to {
        let r = records[idx];
        if r.level < level {
            break;
        }
        if r.level == level
            && (r.tag == TAG_LIST_HEADER || r.tag == TAG_TABLE || r.tag == TAG_CTRL_HEADER)
        {
            break;
        }
        idx += 1;
    }
    idx
}

fn find_subtree_end(records: &[HwpRecord<'_>], start_index: usize) -> usize {
    let base_level = records[start_index].level;
    find_next_at_or_above_level(records, start_index + 1, records.len(), base_level)
}

fn find_next_at_or_above_level(
    records: &[HwpRecord<'_>],
    from: usize,
    to: usize,
    level: u16,
) -> usize {
    let mut idx = from;
    while idx < to {
        if records[idx].level <= level {
            break;
        }
        idx += 1;
    }
    idx
}

fn parse_table_dimensions(payload: &[u8]) -> Option<(usize, usize)> {
    if payload.len() < 8 {
        return None;
    }

    let rows = u16::from_le_bytes([payload[4], payload[5]]) as usize;
    let cols = u16::from_le_bytes([payload[6], payload[7]]) as usize;

    if rows == 0 || cols == 0 || rows > 4096 || cols > 256 {
        return None;
    }

    Some((rows, cols))
}

fn parse_cell_addr_from_list_header(payload: &[u8]) -> Option<ParsedCellAddr> {
    let candidates = [8usize, 6usize];

    for start in candidates {
        if payload.len() < start + 26 {
            continue;
        }

        let col = u16::from_le_bytes([payload[start], payload[start + 1]]) as usize;
        let row = u16::from_le_bytes([payload[start + 2], payload[start + 3]]) as usize;
        let col_span = u16::from_le_bytes([payload[start + 4], payload[start + 5]]) as usize;
        let row_span = u16::from_le_bytes([payload[start + 6], payload[start + 7]]) as usize;
        let width = u32::from_le_bytes([
            payload[start + 8],
            payload[start + 9],
            payload[start + 10],
            payload[start + 11],
        ]);
        let height = u32::from_le_bytes([
            payload[start + 12],
            payload[start + 13],
            payload[start + 14],
            payload[start + 15],
        ]);

        if row > 4096 || col > 1024 {
            continue;
        }
        if row_span == 0 || col_span == 0 || row_span > 256 || col_span > 256 {
            continue;
        }
        if width == 0 || height == 0 {
            continue;
        }

        return Some(ParsedCellAddr {
            row,
            col,
            row_span,
            col_span,
        });
    }

    None
}

fn collect_para_text_lines(
    records: &[HwpRecord<'_>],
    start: usize,
    end: usize,
    budget: &mut ExtractBudget,
    lines: &mut Vec<String>,
    allow_table_like: bool,
) {
    for rec in records.iter().take(end).skip(start) {
        if budget.exhausted() {
            break;
        }
        if rec.tag != TAG_PARA_TEXT {
            continue;
        }

        let text = decode_para_text(rec.payload);
        for raw in text.split('\n') {
            if budget.exhausted() {
                break;
            }

            let cleaned = clean_line(raw);
            if cleaned.is_empty() || cleaned.len() > MAX_LINE_CHARS {
                continue;
            }

            let valid = if allow_table_like {
                is_table_line_candidate(&cleaned)
            } else {
                is_reasonable_line(&cleaned)
            };
            if !valid {
                continue;
            }

            if budget.allow_line(&cleaned) {
                lines.push(cleaned);
            } else {
                break;
            }
        }
    }
}

fn is_table_line_candidate(line: &str) -> bool {
    if line.len() > MAX_LINE_CHARS {
        return false;
    }
    if line.contains('|') {
        return true;
    }
    is_reasonable_line(line)
}

fn join_nonempty_lines(lines: &[String]) -> String {
    let mut out = String::new();
    for line in lines {
        if line.is_empty() {
            continue;
        }
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(line);
    }
    out
}

fn render_table_with_positions(
    cells: &[ParsedTableCell],
    declared_rows: usize,
    declared_cols: usize,
) -> String {
    let mut rows = declared_rows;
    let mut cols = declared_cols;
    for cell in cells {
        rows = rows.max(cell.addr.row + cell.addr.row_span);
        cols = cols.max(cell.addr.col + cell.addr.col_span);
    }
    rows = rows.clamp(1, 8192);
    cols = cols.clamp(1, 512);

    let mut by_pos: HashMap<(usize, usize), &ParsedTableCell> = HashMap::new();
    for cell in cells {
        by_pos.entry((cell.addr.row, cell.addr.col)).or_insert(cell);
    }

    let mut covered = vec![vec![false; cols]; rows];
    let mut html = String::new();
    html.push_str("<table class=\"hwp-table\"><tbody>");

    for r in 0..rows {
        html.push_str("<tr>");
        for c in 0..cols {
            if covered[r][c] {
                continue;
            }

            if let Some(cell) = by_pos.get(&(r, c)) {
                let row_span = cell.addr.row_span.min(rows - r).max(1);
                let col_span = cell.addr.col_span.min(cols - c).max(1);
                for rr in r..(r + row_span) {
                    for cc in c..(c + col_span) {
                        covered[rr][cc] = true;
                    }
                }

                html.push_str("<td");
                if row_span > 1 {
                    html.push_str(" rowspan=\"");
                    html.push_str(&row_span.to_string());
                    html.push('"');
                }
                if col_span > 1 {
                    html.push_str(" colspan=\"");
                    html.push_str(&col_span.to_string());
                    html.push('"');
                }
                if let Some(sz) = cell.font_size_pt {
                    if sz > 0.0 && sz.is_finite() {
                        html.push_str(&format!(" style=\"font-size:{:.1}pt\"", sz));
                    }
                }
                html.push('>');
                if cell.text.trim().is_empty() {
                    html.push_str("&nbsp;");
                } else {
                    html.push_str(&escape_html(&cell.text).replace('\n', "<br/>"));
                }
                html.push_str("</td>");
            } else {
                html.push_str("<td>&nbsp;</td>");
            }
        }
        html.push_str("</tr>");
    }

    html.push_str("</tbody></table>");
    html
}

fn render_fallback_table(cells: &[String], declared_rows: usize, declared_cols: usize) -> String {
    let cell_count = cells.len();
    let mut cols = declared_cols;
    let mut rows = declared_rows;

    if cols == 0 {
        cols = if cell_count >= 12 && cell_count.is_multiple_of(4) {
            4
        } else if cell_count >= 9 && cell_count.is_multiple_of(3) {
            3
        } else if cell_count >= 4 && cell_count.is_multiple_of(2) {
            2
        } else {
            1
        };
    }
    if rows == 0 {
        rows = cell_count.div_ceil(cols.max(1));
    }

    cols = cols.clamp(1, 64);
    rows = rows.clamp(1, 8192);

    let mut html = String::new();
    html.push_str("<table class=\"hwp-table\"><tbody>");
    let mut cursor = 0usize;
    for _ in 0..rows {
        html.push_str("<tr>");
        for _ in 0..cols {
            let cell = cells.get(cursor).cloned().unwrap_or_default();
            cursor += 1;
            html.push_str("<td>");
            if cell.trim().is_empty() {
                html.push_str("&nbsp;");
            } else {
                html.push_str(&escape_html(&cell).replace('\n', "<br/>"));
            }
            html.push_str("</td>");
        }
        html.push_str("</tr>");
    }
    html.push_str("</tbody></table>");
    html
}

fn is_table_ctrl_header(payload: &[u8]) -> bool {
    if payload.len() < 4 {
        return false;
    }

    // CtrlID is 4-byte ASCII. Table == "tbl ".
    let id_bytes = [payload[0], payload[1], payload[2], payload[3]];
    id_bytes == *b"tbl " || id_bytes == *b" lbt"
}

fn append_paragraph_html(
    out: &mut String,
    text: &str,
    budget: &mut ExtractBudget,
    shape: Option<&HwpCharShape>,
    alignment: Option<HwpAlignment>,
) {
    for raw in text.split('\n') {
        if budget.exhausted() {
            break;
        }

        let cleaned = clean_line(raw);
        if cleaned.is_empty() || cleaned.len() > MAX_LINE_CHARS {
            continue;
        }
        if !is_reasonable_line(&cleaned) {
            continue;
        }
        if !budget.allow_line(&cleaned) {
            break;
        }

        if cleaned.contains('|') {
            let cells: Vec<String> = cleaned
                .split('|')
                .map(clean_line)
                .filter(|v| !v.is_empty())
                .collect();
            if cells.len() >= 2 {
                out.push_str("<table class=\"hwp-inline-table\"><tbody><tr>");
                for cell in cells {
                    out.push_str("<td>");
                    out.push_str(&escape_html(&cell));
                    out.push_str("</td>");
                }
                out.push_str("</tr></tbody></table>");
                continue;
            }
        }

        // Build inline styles: font-size and text-align
        let mut styles = Vec::new();
        if let Some(s) = shape {
            if s.font_size_pt > 0.0 && s.font_size_pt.is_finite() {
                styles.push(format!("font-size:{:.1}pt", s.font_size_pt));
            }
        }
        if let Some(align) = alignment {
            if let Some(css) = alignment_to_css(align) {
                styles.push(format!("text-align:{}", css));
            }
        }

        if styles.is_empty() {
            out.push_str("<p>");
        } else {
            out.push_str("<p style=\"");
            out.push_str(&styles.join(";"));
            out.push_str("\">");
        }
        out.push_str(&escape_html(&cleaned));
        out.push_str("</p>");
    }
}

fn parse_hwp_records(data: &[u8]) -> Vec<HwpRecord<'_>> {
    let mut records = Vec::new();
    let mut offset = 0usize;

    while offset + 4 <= data.len() {
        let header = u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        let tag = (header & 0x03FF) as u16;
        let level = ((header >> 10) & 0x03FF) as u16;
        let mut size = ((header >> 20) & 0x0FFF) as usize;

        if size == HWP_EXTENDED_SIZE {
            if offset + 4 > data.len() {
                break;
            }
            size = u32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]) as usize;
            offset += 4;
        }

        if offset + size > data.len() {
            break;
        }

        let payload = &data[offset..offset + size];
        offset += size;

        records.push(HwpRecord {
            tag,
            level,
            payload,
        });

        if records.len() >= 200_000 {
            break;
        }
    }

    records
}

fn try_textutil_docx_bridge(path: &Path) -> Option<String> {
    let filename = format!(
        "openclaw_hwp_bridge_{}_{}.docx",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_micros()
    );
    let temp_docx = std::env::temp_dir().join(filename);

    let output = Command::new("textutil")
        .arg("-convert")
        .arg("docx")
        .arg("-output")
        .arg(&temp_docx)
        .arg(path)
        .output()
        .ok()?;

    if !output.status.success() || !temp_docx.exists() {
        let _ = std::fs::remove_file(&temp_docx);
        return None;
    }

    let maybe_html = extract_html_from_docx_bridge(&temp_docx);
    let _ = std::fs::remove_file(&temp_docx);
    maybe_html
}

fn extract_html_from_docx_bridge(docx_path: &Path) -> Option<String> {
    let state = DocxAdapter::read(docx_path).ok()?;
    let html = state
        .sheets
        .first()
        .and_then(|sheet| sheet.rows.first())
        .and_then(|row| row.first())
        .and_then(|cell| match cell {
            CellValue::String(s) => Some(s.clone()),
            _ => None,
        })?;

    if html.trim().is_empty() {
        return None;
    }
    if !html.contains("<p") && !html.contains("<table") && !html.contains("<div") {
        return None;
    }
    Some(html)
}

fn try_textutil_html(path: &Path) -> Option<String> {
    let output = Command::new("textutil")
        .arg("-convert")
        .arg("html")
        .arg("-stdout")
        .arg(path)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let html = String::from_utf8_lossy(&output.stdout).to_string();
    if html.trim().is_empty() {
        return None;
    }

    let lower = html.to_ascii_lowercase();
    if !lower.contains("<html") && !lower.contains("<body") && !lower.contains("<table") {
        return None;
    }

    Some(html)
}

fn pick_best_hwp_html(candidates: Vec<String>) -> Option<String> {
    let mut best_score = i32::MIN;
    let mut best_html: Option<String> = None;
    let mut best_visible_chars = 0usize;
    let mut best_visible_html: Option<String> = None;

    for html in candidates {
        let score = score_hwp_html(&html);
        let (visible_chars, _, _) = html_visibility_stats(&html);

        if visible_chars > best_visible_chars {
            best_visible_chars = visible_chars;
            best_visible_html = Some(html.clone());
        }

        if score > best_score {
            best_score = score;
            best_html = Some(html);
        }
    }

    // Guard: avoid picking table skeleton output with almost no visible text.
    if let Some(best) = best_html.as_ref() {
        let (visible_chars, _, _) = html_visibility_stats(best);
        if visible_chars >= 32 {
            return best_html;
        }
    }

    if best_visible_chars >= 8 {
        return best_visible_html;
    }

    best_html
}

fn score_hwp_html(html: &str) -> i32 {
    if html.trim().is_empty() {
        return i32::MIN / 2;
    }

    let lower = html.to_ascii_lowercase();
    let table_count = lower.matches("<table").count() as i32;
    let tr_count = lower.matches("<tr").count() as i32;
    let td_count = lower.matches("<td").count() as i32;
    let p_count = lower.matches("<p").count() as i32;
    let br_count = lower.matches("<br").count() as i32;
    let fffd_count = html.matches('\u{FFFD}').count() as i32;
    let root_entry_noise = lower.matches("root entry").count() as i32;
    let empty_td_count = lower.matches("<td>&nbsp;</td>").count() as i32
        + lower.matches("<td></td>").count() as i32
        + lower.matches("<td> </td>").count() as i32;
    let (visible_chars, hangul_chars, numeric_chars) = html_visibility_stats(html);
    let visible_chars_i32 = visible_chars.min(2_000_000) as i32;
    let hangul_i32 = hangul_chars.min(200_000) as i32;
    let numeric_i32 = numeric_chars.min(200_000) as i32;

    let mut score = 0i32;
    score += table_count.min(40) * 120;
    score += tr_count.min(300) * 8;
    score += td_count.min(800) * 4;
    score += p_count.min(500) * 2;
    score += br_count.min(500);
    score += (html.len().min(600_000) / 2_500) as i32;
    score += visible_chars_i32 / 3;
    score += hangul_i32 / 2;
    score += numeric_i32 / 3;

    // Prefer genuine HTML structures over plain text wrappers.
    if lower.contains("<html") || lower.contains("<body") {
        score += 40;
    }

    // Penalize obvious garbage signatures.
    score -= fffd_count.min(300) * 6;
    score -= root_entry_noise.min(20) * 70;
    if lower.contains("hwp document file") && table_count == 0 {
        score -= 300;
    }

    if td_count > 0 {
        let empty_ratio = (empty_td_count * 100) / td_count.max(1);
        if empty_ratio >= 70 {
            score -= (empty_ratio - 60) * 40;
        }
    }

    // Critical: reject grid-only outputs with little/no actual text.
    if td_count >= 8 && visible_chars_i32 < 24 {
        score -= 4_000;
    }
    if table_count > 0 && hangul_i32 == 0 && numeric_i32 == 0 {
        score -= 2_000;
    }
    if visible_chars_i32 == 0 {
        score -= 10_000;
    }

    score
}

fn html_visibility_stats(html: &str) -> (usize, usize, usize) {
    let mut in_tag = false;
    let mut visible_chars = 0usize;
    let mut hangul_chars = 0usize;
    let mut numeric_chars = 0usize;

    let mut chars = html.chars().peekable();
    while let Some(ch) = chars.next() {
        if in_tag {
            if ch == '>' {
                in_tag = false;
            }
            continue;
        }

        if ch == '<' {
            in_tag = true;
            continue;
        }

        if ch == '&' {
            let mut entity = String::new();
            while let Some(&next) = chars.peek() {
                entity.push(next);
                chars.next();
                if next == ';' || entity.len() > 10 {
                    break;
                }
            }
            if entity.eq_ignore_ascii_case("nbsp;") {
                continue;
            }
            visible_chars += 1;
            continue;
        }

        if ch.is_whitespace() {
            continue;
        }

        visible_chars += 1;
        if is_hangul(ch) {
            hangul_chars += 1;
        }
        if ch.is_ascii_digit() {
            numeric_chars += 1;
        }
    }

    (visible_chars, hangul_chars, numeric_chars)
}

fn read_stream_bytes(comp: &mut CompoundFile<File>, path: &str) -> Result<Vec<u8>, DocError> {
    let mut stream = comp
        .open_stream(path)
        .map_err(|e| DocError::ParseError(format!("Missing stream '{}': {}", path, e)))?;

    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).map_err(DocError::IoError)?;
    Ok(buf)
}

fn collect_body_section_paths(comp: &CompoundFile<File>) -> Vec<String> {
    let mut sections: Vec<(usize, String)> = Vec::new();

    for entry in comp.walk() {
        if !entry.is_stream() {
            continue;
        }

        let path = entry.path().to_string_lossy().replace('\\', "/");
        let lower = path.to_ascii_lowercase();

        let Some(marker_pos) = lower.find("/bodytext/section") else {
            continue;
        };

        let suffix = &lower[marker_pos + "/bodytext/section".len()..];
        let section_no = suffix
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse::<usize>()
            .ok();

        if let Some(no) = section_no {
            sections.push((no, path));
        }
    }

    sections.sort_by_key(|(no, _)| *no);
    sections.dedup_by(|a, b| a.0 == b.0);
    sections.into_iter().map(|(_, p)| p).collect()
}

fn looks_like_hwp_header(file_header: &[u8]) -> bool {
    let sig = b"HWP Document File";
    file_header.len() >= sig.len() && &file_header[..sig.len()] == sig
}

fn hwp_is_compressed(file_header: &[u8]) -> bool {
    if file_header.len() < 40 {
        return true;
    }

    let flags = u32::from_le_bytes([
        file_header[36],
        file_header[37],
        file_header[38],
        file_header[39],
    ]);

    (flags & 0x0000_0001) != 0
}

fn inflate_hwp_stream(raw: &[u8]) -> Result<Vec<u8>, DocError> {
    if raw.is_empty() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    let mut deflate = DeflateDecoder::new(Cursor::new(raw));
    if deflate.read_to_end(&mut out).is_ok() && !out.is_empty() {
        return Ok(out);
    }

    out.clear();
    let mut zlib = ZlibDecoder::new(Cursor::new(raw));
    zlib.read_to_end(&mut out)
        .map_err(|e| DocError::ParseError(format!("Failed to inflate HWP section: {}", e)))?;
    Ok(out)
}

fn decode_para_text(payload: &[u8]) -> String {
    let mut out = String::new();
    let mut idx = 0usize;

    while idx + 1 < payload.len() {
        // Control char in UTF-16LE: low byte 0..31 and high byte 0.
        if payload[idx + 1] == 0 && payload[idx] <= 31 {
            let code = payload[idx];
            match code {
                9 => out.push('\t'),             // TAB (INLINE, 16 bytes)
                10 => out.push('\n'),            // Line break (CHAR, 2 bytes)
                13 => out.push('\n'),            // Paragraph break (CHAR, 2 bytes)
                2 => out.push('\n'),             // Section/column define (EXTENDED, 16 bytes)
                21 => out.push('\n'),            // Page control: new page/col (EXTENDED, 16 bytes)
                23 => {}                         // Overlap text (EXTENDED, 16 bytes): skip
                24 => out.push('-'),             // Non-breaking hyphen (CHAR, 2 bytes)
                30 => out.push(' '),             // Non-breaking space (CHAR, 2 bytes)
                31 => out.push(' '),             // Fixed-width space (CHAR, 2 bytes)
                0 | 25..=29 => {}                // Reserved CHAR types: skip
                _ => {}                          // Other INLINE/EXTENDED controls: skip
            }

            let wchar_size = control_char_wchar_size(code);
            idx = idx.saturating_add(wchar_size.saturating_mul(2));
            continue;
        }

        let code = u16::from_le_bytes([payload[idx], payload[idx + 1]]);
        idx += 2;

        // Handle UTF-16 surrogate pairs for characters above U+FFFF
        if (0xD800..=0xDBFF).contains(&code) {
            if idx + 1 < payload.len() {
                let low = u16::from_le_bytes([payload[idx], payload[idx + 1]]);
                idx += 2;
                if (0xDC00..=0xDFFF).contains(&low) {
                    let cp = 0x10000 + ((code as u32 - 0xD800) << 10) + (low as u32 - 0xDC00);
                    if let Some(ch) = char::from_u32(cp) {
                        if is_doc_char(ch) {
                            out.push(ch);
                        }
                    }
                }
            }
            continue;
        }

        if let Some(ch) = char::from_u32(code as u32) {
            if is_doc_char(ch) {
                out.push(ch);
            }
        }

        if out.chars().count() >= MAX_LINE_CHARS * 6 {
            break;
        }
    }

    out
}

fn control_char_wchar_size(code: u8) -> usize {
    match code {
        // HWP v5 spec (Table 4):
        // CHAR type (1 WCHAR = 2 bytes): 0, 10, 13, 24-31
        // INLINE type (8 WCHAR = 16 bytes): 4, 5, 6, 7, 8, 9
        // EXTENDED type (8 WCHAR = 16 bytes): 1, 2, 3, 11, 12, 14-23
        0 | 10 | 13 | 24..=31 => 1,
        1..=9 | 11..=23 => 8,
        _ => 1,
    }
}

/// Parse the DocInfo stream to extract CHAR_SHAPE and PARA_SHAPE records.
fn parse_docinfo(
    comp: &mut CompoundFile<File>,
    compressed: bool,
) -> HwpDocInfo {
    let raw = match read_stream_bytes(comp, "/DocInfo")
        .or_else(|_| read_stream_bytes(comp, "DocInfo"))
    {
        Ok(data) => data,
        Err(_) => return HwpDocInfo { char_shapes: Vec::new(), para_shapes: Vec::new() },
    };

    let data = if compressed {
        inflate_hwp_stream(&raw).unwrap_or(raw)
    } else {
        raw
    };

    let records = parse_hwp_records(&data);
    let mut char_shapes = Vec::new();
    let mut para_shapes = Vec::new();

    for rec in &records {
        match rec.tag {
            TAG_DOCINFO_CHAR_SHAPE => {
                char_shapes.push(parse_char_shape_record(rec.payload));
            }
            TAG_DOCINFO_PARA_SHAPE => {
                para_shapes.push(parse_para_shape_record(rec.payload));
            }
            _ => {}
        }
    }

    HwpDocInfo { char_shapes, para_shapes }
}

/// Parse a single PARA_SHAPE record from DocInfo.
/// Bytes 0-3: attribute flags (UINT32). Bits 2-4 = alignment.
fn parse_para_shape_record(payload: &[u8]) -> HwpParaShape {
    let alignment = if payload.len() >= 4 {
        let attr = u32::from_le_bytes([payload[0], payload[1], payload[2], payload[3]]);
        let align_val = ((attr >> 2) & 0x07) as u8;
        match align_val {
            0 => HwpAlignment::Justify,
            1 => HwpAlignment::Left,
            2 => HwpAlignment::Right,
            3 => HwpAlignment::Center,
            _ => HwpAlignment::Distribute,
        }
    } else {
        HwpAlignment::Left
    };
    HwpParaShape { alignment }
}

/// Parse a single CHAR_SHAPE record from DocInfo.
/// Layout: faceId[7]*WORD(14) + ratio[7](7) + spacing[7](7) + relSize[7](7) + offset[7](7)
///       = 42 bytes, then INT32 baseSize at offset 42 (in 1/100 pt).
fn parse_char_shape_record(payload: &[u8]) -> HwpCharShape {
    let font_size_pt = if payload.len() >= 46 {
        let raw = i32::from_le_bytes([payload[42], payload[43], payload[44], payload[45]]);
        (raw as f32 / 100.0).clamp(1.0, 200.0)
    } else {
        10.0
    };

    HwpCharShape { font_size_pt }
}

/// Find the primary (first) char shape for a paragraph given its PARA_TEXT index.
/// Looks for the sibling PARA_CHAR_SHAPE record (tag 68) at the same level.
fn find_primary_char_shape<'a>(
    records: &[HwpRecord<'_>],
    para_text_idx: usize,
    char_shapes: &'a [HwpCharShape],
) -> Option<&'a HwpCharShape> {
    if char_shapes.is_empty() {
        return None;
    }
    let level = records[para_text_idx].level;

    for i in 1..=5 {
        let next = para_text_idx + i;
        if next >= records.len() {
            break;
        }
        let r = records[next];
        if r.level < level {
            break;
        }
        if r.level > level {
            continue;
        }
        if r.tag == TAG_PARA_CHAR_SHAPE && r.payload.len() >= 8 {
            // First entry: (DWORD position, DWORD shapeId)
            // position at [0..4], shapeId at [4..8]
            let shape_id = u32::from_le_bytes([
                r.payload[4], r.payload[5], r.payload[6], r.payload[7],
            ]) as usize;
            return char_shapes.get(shape_id);
        }
    }
    None
}

/// Find the primary font size for a table cell's record range.
fn find_cell_primary_font_size(
    records: &[HwpRecord<'_>],
    start: usize,
    end: usize,
    char_shapes: &[HwpCharShape],
) -> Option<f32> {
    if char_shapes.is_empty() {
        return None;
    }
    for i in start..end {
        if records[i].tag == TAG_PARA_TEXT {
            if let Some(shape) = find_primary_char_shape(records, i, char_shapes) {
                return Some(shape.font_size_pt);
            }
        }
    }
    None
}

fn run_stdout_converter(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout)
        .replace('\u{0000}', "")
        .replace("\r\n", "\n");

    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

fn extract_lines_from_hwpx_xml(xml: &str) -> Vec<String> {
    let Ok(doc) = Document::parse(xml) else {
        return text_blob_to_lines(xml);
    };

    let mut lines: Vec<String> = Vec::new();

    for p in doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "p")
    {
        let mut line = String::new();
        for text in p.descendants().filter_map(|n| n.text()) {
            line.push_str(text);
        }
        let cleaned = clean_line(&line);
        if is_reasonable_line(&cleaned) {
            lines.push(cleaned);
            if lines.len() >= MAX_EXTRACTED_LINES {
                break;
            }
        }
    }

    if lines.is_empty() {
        let mut blob = String::new();
        for text in doc.descendants().filter_map(|n| n.text()) {
            blob.push_str(text);
            blob.push('\n');
            if blob.len() >= MAX_TOTAL_TEXT_CHARS {
                break;
            }
        }
        return text_blob_to_lines(&blob);
    }

    dedupe_lines(lines)
}

fn text_blob_to_lines(text: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut budget = ExtractBudget::new();

    for raw in text.split('\n') {
        if budget.exhausted() {
            break;
        }

        let cleaned = clean_line(raw);
        if cleaned.is_empty() || cleaned.len() > MAX_LINE_CHARS {
            continue;
        }
        if !is_reasonable_line(&cleaned) {
            continue;
        }
        if !budget.allow_line(&cleaned) {
            break;
        }
        lines.push(cleaned);
    }

    dedupe_lines(lines)
}

fn clean_line(raw: &str) -> String {
    let mut out = String::new();
    let mut prev_ws = false;

    for ch in raw.chars() {
        let normalized = match ch {
            '\t' | '\r' | '\u{00A0}' => ' ',
            _ => ch,
        };

        if normalized.is_whitespace() {
            if !prev_ws {
                out.push(' ');
                prev_ws = true;
            }
            continue;
        }

        if is_doc_char(normalized) {
            out.push(normalized);
            prev_ws = false;
        }
    }

    out.trim().to_string()
}

fn is_reasonable_line(line: &str) -> bool {
    if line.is_empty() {
        return false;
    }

    let mut has_word = false;
    let mut total = 0usize;
    let mut valid = 0usize;

    for ch in line.chars() {
        total += 1;
        if is_doc_char(ch) {
            valid += 1;
        }
        if is_hangul(ch) || ch.is_ascii_alphanumeric() {
            has_word = true;
        }
    }

    has_word && total > 0 && valid * 100 >= total * 40
}

fn is_doc_char(ch: char) -> bool {
    if ch == '\n' || ch == ' ' || ch == '\t' {
        return true;
    }
    // Reject replacement char and control characters
    if ch == '\u{FFFD}' {
        return false;
    }
    if ch.is_control() {
        return false;
    }

    let code = ch as u32;

    // Reject Private Use Area (font-specific symbols that render as garbage)
    if (0xE000..=0xF8FF).contains(&code) {
        return false;
    }
    // Reject surrogates (should never appear as decoded chars)
    if (0xD800..=0xDFFF).contains(&code) {
        return false;
    }

    // Accept everything else: ASCII, Latin Extended, Greek, Cyrillic,
    // Hangul, CJK, Kana, fullwidth forms, symbols, punctuation, etc.
    true
}


fn is_hangul(ch: char) -> bool {
    let code = ch as u32;
    (0x1100..=0x11FF).contains(&code)
        || (0x3130..=0x318F).contains(&code)
        || (0xA960..=0xA97F).contains(&code)
        || (0xAC00..=0xD7AF).contains(&code)
}

fn dedupe_lines(lines: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    let mut prev = String::new();

    for line in lines {
        if line.is_empty() {
            continue;
        }
        if line == prev {
            continue;
        }
        prev = line.clone();
        out.push(line);
    }

    out
}

fn escape_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

fn lines_to_html(lines: &[String]) -> String {
    let mut html = String::from("<div class=\"docx-root hwp-root\">");

    if lines.is_empty() {
        html.push_str("<p><br/></p>");
    } else {
        for line in lines {
            if line.trim().is_empty() {
                html.push_str("<p><br/></p>");
            } else {
                html.push_str("<p>");
                html.push_str(&escape_html(line));
                html.push_str("</p>");
            }
        }
    }

    html.push_str("</div>");
    html
}
