use crate::document::error::DocError;
use crate::document::types::{CellStyle, ColWidth, RowHeight, StyledCell};
use roxmltree::Document;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

#[derive(Default, Clone)]
pub struct SheetVisualMeta {
    pub row_heights: Vec<RowHeight>,
    pub col_widths: Vec<ColWidth>,
    pub styled_cells: Vec<StyledCell>,
}

#[derive(Default, Clone)]
struct ParsedFont {
    name: Option<String>,
    size: Option<f32>,
    bold: bool,
    italic: bool,
    underline: bool,
    color: Option<String>,
}

#[derive(Default, Clone)]
struct ParsedFill {
    bg_color: Option<String>,
}

#[derive(Default, Clone)]
struct ParsedBorder {
    left: bool,
    right: bool,
    top: bool,
    bottom: bool,
}

#[derive(Default, Clone)]
struct ParsedXf {
    font_id: Option<usize>,
    fill_id: Option<usize>,
    border_id: Option<usize>,
    number_format_id: Option<u32>,
    h_align: Option<String>,
    v_align: Option<String>,
    wrap_text: bool,
}

#[derive(Default)]
struct ParsedStyles {
    fonts: Vec<ParsedFont>,
    fills: Vec<ParsedFill>,
    borders: Vec<ParsedBorder>,
    xfs: Vec<ParsedXf>,
}

pub fn extract_sheet_visual_meta(
    path: &Path,
    sheet_name: &str,
    range_start: (u32, u32),
    total_rows: usize,
    total_cols: usize,
) -> Result<SheetVisualMeta, DocError> {
    if total_rows == 0 || total_cols == 0 {
        return Ok(SheetVisualMeta::default());
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if ext != "xlsx" && ext != "xlsm" && ext != "xlam" {
        return Ok(SheetVisualMeta::default());
    }

    let file = File::open(path).map_err(DocError::IoError)?;
    let mut zip = ZipArchive::new(file).map_err(|e| DocError::ParseError(e.to_string()))?;

    let workbook_xml = read_zip_entry_to_string(&mut zip, "xl/workbook.xml")?;
    let rels_xml = read_zip_entry_to_string(&mut zip, "xl/_rels/workbook.xml.rels")?;
    let styles_xml = read_zip_entry_to_string(&mut zip, "xl/styles.xml").ok();

    let sheet_entry = resolve_sheet_entry_path(sheet_name, &workbook_xml, &rels_xml)
        .ok_or_else(|| DocError::ParseError(format!("Sheet entry not found: {}", sheet_name)))?;
    let sheet_xml = read_zip_entry_to_string(&mut zip, &sheet_entry)?;

    let styles = match styles_xml {
        Some(xml) => parse_styles(&xml).unwrap_or_default(),
        None => ParsedStyles::default(),
    };

    parse_sheet_visual_meta(&sheet_xml, &styles, range_start, total_rows, total_cols)
}

fn read_zip_entry_to_string<R: Read + std::io::Seek>(
    zip: &mut ZipArchive<R>,
    entry: &str,
) -> Result<String, DocError> {
    let mut file = zip
        .by_name(entry)
        .map_err(|e| DocError::ParseError(format!("Missing {}: {}", entry, e)))?;
    let mut out = String::new();
    file.read_to_string(&mut out)
        .map_err(DocError::IoError)?;
    Ok(out)
}

fn resolve_sheet_entry_path(sheet_name: &str, workbook_xml: &str, rels_xml: &str) -> Option<String> {
    let workbook = Document::parse(workbook_xml).ok()?;
    let rels = Document::parse(rels_xml).ok()?;

    let rid = workbook
        .descendants()
        .find(|n| n.is_element() && n.has_tag_name("sheet") && n.attribute("name") == Some(sheet_name))
        .and_then(|sheet| {
            sheet
                .attribute(("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"))
                .or_else(|| sheet.attribute("r:id"))
                .or_else(|| sheet.attribute("id"))
        })?;

    let target = rels
        .descendants()
        .find(|n| n.is_element() && n.has_tag_name("Relationship") && n.attribute("Id") == Some(rid))
        .and_then(|rel| rel.attribute("Target"))?;

    let normalized = target.replace('\\', "/").replace("../", "");
    if normalized.starts_with("xl/") {
        Some(normalized)
    } else if normalized.starts_with('/') {
        Some(normalized.trim_start_matches('/').to_string())
    } else {
        Some(format!("xl/{}", normalized))
    }
}

fn parse_styles(xml: &str) -> Result<ParsedStyles, DocError> {
    let doc = Document::parse(xml).map_err(|e| DocError::ParseError(e.to_string()))?;

    let fonts = doc
        .descendants()
        .find(|n| n.is_element() && n.has_tag_name("fonts"))
        .map(|fonts_node| {
            fonts_node
                .children()
                .filter(|n| n.is_element() && n.has_tag_name("font"))
                .map(parse_font_node)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let fills = doc
        .descendants()
        .find(|n| n.is_element() && n.has_tag_name("fills"))
        .map(|fills_node| {
            fills_node
                .children()
                .filter(|n| n.is_element() && n.has_tag_name("fill"))
                .map(parse_fill_node)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let borders = doc
        .descendants()
        .find(|n| n.is_element() && n.has_tag_name("borders"))
        .map(|borders_node| {
            borders_node
                .children()
                .filter(|n| n.is_element() && n.has_tag_name("border"))
                .map(parse_border_node)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let xfs = doc
        .descendants()
        .find(|n| n.is_element() && n.has_tag_name("cellXfs"))
        .map(|xfs_node| {
            xfs_node
                .children()
                .filter(|n| n.is_element() && n.has_tag_name("xf"))
                .map(parse_xf_node)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(ParsedStyles {
        fonts,
        fills,
        borders,
        xfs,
    })
}

fn parse_font_node(node: roxmltree::Node<'_, '_>) -> ParsedFont {
    let mut font = ParsedFont::default();
    for child in node.children().filter(|n| n.is_element()) {
        if child.has_tag_name("b") {
            font.bold = true;
        } else if child.has_tag_name("i") {
            font.italic = true;
        } else if child.has_tag_name("u") {
            font.underline = true;
        } else if child.has_tag_name("name") {
            font.name = child.attribute("val").map(|s| s.to_string());
        } else if child.has_tag_name("sz") {
            font.size = child.attribute("val").and_then(|v| v.parse::<f32>().ok());
        } else if child.has_tag_name("color") {
            font.color = extract_color_hex(child);
        }
    }
    font
}

fn parse_fill_node(node: roxmltree::Node<'_, '_>) -> ParsedFill {
    let mut fill = ParsedFill::default();
    for child in node.children().filter(|n| n.is_element()) {
        if child.has_tag_name("patternFill") {
            for color in child.children().filter(|n| n.is_element()) {
                if color.has_tag_name("fgColor") || color.has_tag_name("bgColor") {
                    let parsed = extract_color_hex(color);
                    if parsed.is_some() {
                        fill.bg_color = parsed;
                        break;
                    }
                }
            }
        }
    }
    fill
}

fn parse_border_node(node: roxmltree::Node<'_, '_>) -> ParsedBorder {
    let mut border = ParsedBorder::default();
    for child in node.children().filter(|n| n.is_element()) {
        let on = border_side_enabled(child);
        if child.has_tag_name("left") {
            border.left = on;
        } else if child.has_tag_name("right") {
            border.right = on;
        } else if child.has_tag_name("top") {
            border.top = on;
        } else if child.has_tag_name("bottom") {
            border.bottom = on;
        }
    }
    border
}

fn border_side_enabled(node: roxmltree::Node<'_, '_>) -> bool {
    if let Some(style) = node.attribute("style") {
        if !style.is_empty() && style != "none" {
            return true;
        }
    }
    node.children().any(|n| n.is_element() && n.has_tag_name("color"))
}

fn parse_xf_node(node: roxmltree::Node<'_, '_>) -> ParsedXf {
    let mut xf = ParsedXf {
        font_id: node.attribute("fontId").and_then(|v| v.parse::<usize>().ok()),
        fill_id: node.attribute("fillId").and_then(|v| v.parse::<usize>().ok()),
        border_id: node.attribute("borderId").and_then(|v| v.parse::<usize>().ok()),
        number_format_id: node.attribute("numFmtId").and_then(|v| v.parse::<u32>().ok()),
        ..ParsedXf::default()
    };

    if let Some(alignment) = node
        .children()
        .find(|n| n.is_element() && n.has_tag_name("alignment"))
    {
        xf.h_align = alignment.attribute("horizontal").map(|s| s.to_string());
        xf.v_align = alignment.attribute("vertical").map(|s| s.to_string());
        xf.wrap_text = alignment
            .attribute("wrapText")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
    }

    xf
}

fn parse_sheet_visual_meta(
    sheet_xml: &str,
    styles: &ParsedStyles,
    range_start: (u32, u32),
    total_rows: usize,
    total_cols: usize,
) -> Result<SheetVisualMeta, DocError> {
    let doc = Document::parse(sheet_xml).map_err(|e| DocError::ParseError(e.to_string()))?;
    let mut meta = SheetVisualMeta::default();
    let row_end = range_start.0.saturating_add(total_rows as u32).saturating_sub(1);
    let col_end = range_start.1.saturating_add(total_cols as u32).saturating_sub(1);

    for col in doc
        .descendants()
        .filter(|n| n.is_element() && n.has_tag_name("col"))
    {
        let min = col.attribute("min").and_then(|v| v.parse::<u32>().ok());
        let max = col.attribute("max").and_then(|v| v.parse::<u32>().ok());
        let hidden = col
            .attribute("hidden")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        let width = if hidden {
            Some(0.0)
        } else {
            col.attribute("width").and_then(|v| v.parse::<f32>().ok())
        };
        if let (Some(min), Some(max), Some(width)) = (min, max, width) {
            let abs_start = min.saturating_sub(1);
            let abs_end = max.saturating_sub(1);
            if abs_end < range_start.1 || abs_start > col_end {
                continue;
            }
            let rel_start = abs_start.max(range_start.1).saturating_sub(range_start.1) as usize;
            let rel_end = abs_end.min(col_end).saturating_sub(range_start.1) as usize;
            meta.col_widths.push(ColWidth {
                start_col: rel_start,
                end_col: rel_end,
                width,
            });
        }
    }

    for row in doc
        .descendants()
        .filter(|n| n.is_element() && n.has_tag_name("row"))
    {
        let r = row.attribute("r").and_then(|v| v.parse::<u32>().ok());
        let ht = row.attribute("ht").and_then(|v| v.parse::<f32>().ok());
        if let (Some(r), Some(height)) = (r, ht) {
            let abs_row = r.saturating_sub(1);
            if abs_row < range_start.0 || abs_row > row_end {
                continue;
            }
            meta.row_heights.push(RowHeight {
                row: abs_row.saturating_sub(range_start.0) as usize,
                height,
            });
        }
    }

    for cell in doc
        .descendants()
        .filter(|n| n.is_element() && n.has_tag_name("c"))
    {
        let style_id = cell.attribute("s").and_then(|v| v.parse::<usize>().ok());
        let reference = cell.attribute("r");
        if let (Some(style_id), Some(reference)) = (style_id, reference) {
            let (abs_row, abs_col) = match parse_cell_ref(reference) {
                Some(p) => p,
                None => continue,
            };
            if abs_row < range_start.0 || abs_row > row_end || abs_col < range_start.1 || abs_col > col_end {
                continue;
            }
            let style = materialize_cell_style(style_id, styles);
            if !is_meaningful_style(&style) {
                continue;
            }
            meta.styled_cells.push(StyledCell {
                row: abs_row.saturating_sub(range_start.0) as usize,
                col: abs_col.saturating_sub(range_start.1) as usize,
                style,
            });
        }
    }

    Ok(meta)
}

fn materialize_cell_style(style_id: usize, styles: &ParsedStyles) -> CellStyle {
    let mut style = CellStyle::default();
    let xf = match styles.xfs.get(style_id) {
        Some(xf) => xf,
        None => return style,
    };

    if let Some(font_id) = xf.font_id {
        if let Some(font) = styles.fonts.get(font_id) {
            style.font_name = font.name.clone();
            style.font_size = font.size;
            style.bold = font.bold;
            style.italic = font.italic;
            style.underline = font.underline;
            style.font_color = font.color.clone();
        }
    }

    if let Some(fill_id) = xf.fill_id {
        if let Some(fill) = styles.fills.get(fill_id) {
            style.bg_color = fill.bg_color.clone();
        }
    }

    if let Some(border_id) = xf.border_id {
        if let Some(border) = styles.borders.get(border_id) {
            style.border_left = border.left;
            style.border_right = border.right;
            style.border_top = border.top;
            style.border_bottom = border.bottom;
        }
    }

    style.h_align = xf.h_align.clone();
    style.v_align = xf.v_align.clone();
    style.wrap_text = xf.wrap_text;
    style.number_format_id = xf.number_format_id;

    style
}

fn is_meaningful_style(style: &CellStyle) -> bool {
    style.font_name.is_some()
        || style.font_size.is_some()
        || style.bold
        || style.italic
        || style.underline
        || style.font_color.is_some()
        || style.bg_color.is_some()
        || style.h_align.is_some()
        || style.v_align.is_some()
        || style.wrap_text
        || style.border_left
        || style.border_right
        || style.border_top
        || style.border_bottom
        || style.number_format_id.unwrap_or(0) != 0
}

fn extract_color_hex(node: roxmltree::Node<'_, '_>) -> Option<String> {
    let rgb = node.attribute("rgb")?;
    normalize_rgb(rgb)
}

fn normalize_rgb(raw: &str) -> Option<String> {
    let value = raw.trim().trim_start_matches('#');
    if value.len() == 8 {
        Some(format!("#{}", &value[2..]))
    } else if value.len() == 6 {
        Some(format!("#{}", value))
    } else {
        None
    }
}

fn parse_cell_ref(reference: &str) -> Option<(u32, u32)> {
    let mut col = 0u32;
    let mut row_text = String::new();

    for ch in reference.chars() {
        if ch == '$' {
            continue;
        }
        if ch.is_ascii_alphabetic() && row_text.is_empty() {
            col = col
                .saturating_mul(26)
                .saturating_add((ch.to_ascii_uppercase() as u32).saturating_sub('A' as u32) + 1);
        } else if ch.is_ascii_digit() {
            row_text.push(ch);
        } else {
            break;
        }
    }

    if col == 0 || row_text.is_empty() {
        return None;
    }
    let row = row_text.parse::<u32>().ok()?;
    Some((row.saturating_sub(1), col.saturating_sub(1)))
}
