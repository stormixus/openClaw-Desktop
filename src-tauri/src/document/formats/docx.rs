use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::process::Command;
use std::collections::{HashMap, HashSet};

use roxmltree::{Document, Node};
use zip::write::FileOptions;

use crate::document::error::DocError;
use crate::document::types::*;

pub struct DocxAdapter;

struct ParagraphRender {
    html: String,
    tag: &'static str,
    is_list_item: bool,
    text_align: Option<String>,
    font_size_pt: Option<f32>,
}

#[derive(Clone, Debug, Default)]
struct RawStyleInfo {
    based_on: Option<String>,
    tag: Option<String>,
    text_align: Option<String>,
    font_size_pt: Option<f32>,
}

#[derive(Clone, Debug, Default)]
struct ResolvedStyleInfo {
    tag: Option<String>,
    text_align: Option<String>,
    font_size_pt: Option<f32>,
}

impl DocxAdapter {
    pub fn read(path: &Path) -> Result<DocState, DocError> {
        const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB
        const MAX_RICH_DOCX_XML_BYTES: usize = 7_500_000;
        const MAX_RICH_HTML_BYTES: usize = 5_000_000;
        let metadata = std::fs::metadata(path).map_err(DocError::IoError)?;
        if metadata.len() > MAX_FILE_SIZE {
            return Err(DocError::ValidationError(format!(
                "File too large ({:.1} MB). Maximum supported size is 10 MB.",
                metadata.len() as f64 / 1024.0 / 1024.0
            )));
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        let html = if ext == "doc" {
            Self::read_legacy_doc_as_html(path)?
        } else {
            let file = File::open(path).map_err(DocError::IoError)?;
            let mut archive = zip::ZipArchive::new(file).map_err(|e| DocError::ParseError(e.to_string()))?;

            let mut document_xml = String::new();
            match archive.by_name("word/document.xml") {
                Ok(mut file) => {
                    file.read_to_string(&mut document_xml)
                        .map_err(DocError::IoError)?;
                }
                Err(_) => {
                    return Err(DocError::ParseError(
                        "Invalid DOCX: missing word/document.xml".to_string(),
                    ));
                }
            }

            let mut styles_xml = String::new();
            if let Ok(mut file) = archive.by_name("word/styles.xml") {
                let _ = file.read_to_string(&mut styles_xml);
            }
            let styles_opt = if styles_xml.trim().is_empty() {
                None
            } else {
                Some(styles_xml.as_str())
            };

            let plain_lines = extract_plain_lines(&document_xml);
            // Prefer fidelity. Fallback to plain mode only for very large/unsafe payloads.
            if document_xml.len() > MAX_RICH_DOCX_XML_BYTES {
                lines_to_html(&plain_lines)
            } else {
                let rich_html = render_docx_html(&document_xml, styles_opt)
                    .unwrap_or_else(|_| lines_to_html(&plain_lines));
                if rich_html.len() > MAX_RICH_HTML_BYTES {
                    lines_to_html(&plain_lines)
                } else {
                    rich_html
                }
            }
        };

        let rows = vec![vec![CellValue::String(html)]];

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("untitled.docx")
            .to_string();

        let total_rows = rows.len();
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

    pub fn save(path: &Path, content: &str) -> Result<(), DocError> {
        let document_xml = build_docx_document_xml(content);
        write_docx_package(path, &document_xml)
    }

    fn read_legacy_doc_as_html(path: &Path) -> Result<String, DocError> {
        let output = Command::new("textutil")
            .arg("-convert")
            .arg("txt")
            .arg("-stdout")
            .arg(path)
            .output()
            .map_err(|e| {
                DocError::ParseError(format!(
                    "Cannot open .doc on this system (textutil unavailable): {}",
                    e
                ))
            })?;

        if !output.status.success() {
            return Err(DocError::ParseError(
                "Failed to convert .doc file. Please resave as .docx in Word and retry.".to_string(),
            ));
        }

        let text = String::from_utf8_lossy(&output.stdout).to_string();
        let lines = text
            .replace("\r\n", "\n")
            .split('\n')
            .map(|line| line.to_string())
            .collect::<Vec<_>>();
        Ok(lines_to_html(&lines))
    }
}

fn render_docx_html(document_xml: &str, styles_xml: Option<&str>) -> Result<String, DocError> {
    let doc = Document::parse(document_xml).map_err(|e| DocError::ParseError(e.to_string()))?;
    let body = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "body")
        .ok_or_else(|| DocError::ParseError("DOCX body not found".to_string()))?;
            let style_map = styles_xml
                .map(parse_style_map)
                .unwrap_or_default();
            let default_font_size_pt = styles_xml
                .and_then(parse_default_font_size_pt);

    let mut html = String::from("<div class=\"docx-root\">");
    let mut list_open = false;

    for child in body.children().filter(|n| n.is_element()) {
        match child.tag_name().name() {
            "p" => {
                let p = render_paragraph(child, &style_map, default_font_size_pt);
                if p.is_list_item {
                    if !list_open {
                        html.push_str("<ul>");
                        list_open = true;
                    }
                    html.push_str("<li>");
                    html.push_str(&p.html);
                    html.push_str("</li>");
                } else {
                    if list_open {
                        html.push_str("</ul>");
                        list_open = false;
                    }
                    html.push('<');
                    html.push_str(p.tag);
                    if let Some(style) =
                        build_paragraph_style_attr(p.text_align.as_deref(), p.font_size_pt)
                    {
                        html.push(' ');
                        html.push_str("style=\"");
                        html.push_str(&style);
                        html.push('"');
                    }
                    html.push('>');
                    html.push_str(&p.html);
                    html.push_str("</");
                    html.push_str(p.tag);
                    html.push('>');
                }
            }
            "tbl" => {
                if list_open {
                    html.push_str("</ul>");
                    list_open = false;
                }
                html.push_str(&render_table(child, &style_map, default_font_size_pt));
            }
            _ => {}
        }
    }

    if list_open {
        html.push_str("</ul>");
    }

    html.push_str("</div>");
    Ok(html)
}

fn render_paragraph(
    paragraph: Node<'_, '_>,
    style_map: &HashMap<String, ResolvedStyleInfo>,
    default_font_size_pt: Option<f32>,
) -> ParagraphRender {
    let p_style = paragraph_style(paragraph);
    let is_list_item = paragraph_is_list(paragraph) || p_style_contains_list(&p_style);
    let style_info = p_style
        .as_ref()
        .and_then(|id| style_map.get(id));
    let tag = map_paragraph_tag(
        p_style.as_deref(),
        style_info.and_then(|s| s.tag.as_deref()),
    );
    let text_align = paragraph_alignment(paragraph)
        .or_else(|| style_info.and_then(|s| s.text_align.clone()));
    let inherited_font_size = paragraph_run_font_size(paragraph)
        .or_else(|| style_info.and_then(|s| s.font_size_pt))
        .or(default_font_size_pt);

    let mut html = String::new();
    for child in paragraph.children().filter(|n| n.is_element()) {
        collect_inline_html(child, &mut html, inherited_font_size, style_map);
    }

    if html.trim().is_empty() {
        html.push_str("<br/>");
    }

    ParagraphRender {
        html,
        tag,
        is_list_item,
        text_align,
        font_size_pt: inherited_font_size,
    }
}

fn render_table(
    table: Node<'_, '_>,
    style_map: &HashMap<String, ResolvedStyleInfo>,
    default_font_size_pt: Option<f32>,
) -> String {
    let mut out = String::from("<table class=\"docx-table\"><tbody>");

    for row in table
        .children()
        .filter(|n| n.is_element() && n.tag_name().name() == "tr")
    {
        out.push_str("<tr>");
        for cell in row
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "tc")
        {
            let colspan = table_cell_colspan(cell);
            let bg_color = table_cell_bg(cell);

            out.push_str("<td");
            if colspan > 1 {
                out.push_str(&format!(" colspan=\"{}\"", colspan));
            }
            if let Some(bg) = bg_color {
                out.push_str(&format!(" style=\"background:{};\"", bg));
            }
            out.push('>');

                let mut cell_html = String::new();
                for content in cell.children().filter(|n| n.is_element()) {
                if content.tag_name().name() == "p" {
                    let p = render_paragraph(content, &style_map, default_font_size_pt);
                    cell_html.push('<');
                    cell_html.push_str(p.tag);
                    if let Some(style) =
                        build_paragraph_style_attr(p.text_align.as_deref(), p.font_size_pt)
                    {
                        cell_html.push(' ');
                        cell_html.push_str("style=\"");
                        cell_html.push_str(&style);
                        cell_html.push('"');
                    }
                    cell_html.push('>');
                    cell_html.push_str(&p.html);
                    cell_html.push_str("</");
                    cell_html.push_str(p.tag);
                    cell_html.push('>');
                }
            }
            if cell_html.trim().is_empty() {
                cell_html.push_str("<p><br/></p>");
            }
            out.push_str(&cell_html);
            out.push_str("</td>");
        }
        out.push_str("</tr>");
    }

    out.push_str("</tbody></table>");
    out
}

fn collect_inline_html(
    node: Node<'_, '_>,
    out: &mut String,
    inherited_size_pt: Option<f32>,
    style_map: &HashMap<String, ResolvedStyleInfo>,
) {
    match node.tag_name().name() {
        "r" => out.push_str(&render_run(node, inherited_size_pt, style_map)),
        "hyperlink" | "sdt" | "smartTag" | "ins" | "del" => {
            for child in node.children().filter(|n| n.is_element()) {
                collect_inline_html(child, out, inherited_size_pt, style_map);
            }
        }
        "br" | "cr" => out.push_str("<br/>"),
        _ => {}
    }
}

fn render_run(
    run: Node<'_, '_>,
    inherited_size_pt: Option<f32>,
    style_map: &HashMap<String, ResolvedStyleInfo>,
) -> String {
    let rpr = run
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "rPr");

    let mut bold = false;
    let mut italic = false;
    let mut underline = false;
    let mut color: Option<String> = None;
    let mut font_size_pt: Option<f32> = inherited_size_pt;

    if let Some(props) = rpr {
        if let Some(style_id) = props
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "rStyle")
            .and_then(|n| attr_any(n, "val"))
        {
            if let Some(style_size) = style_map.get(&style_id).and_then(|s| s.font_size_pt) {
                font_size_pt = Some(style_size);
            }
        }

        let mut sz_val: Option<f32> = None;
        let mut sz_cs_val: Option<f32> = None;

        for p in props.children().filter(|n| n.is_element()) {
            match p.tag_name().name() {
                "b" | "bCs" => {
                    if xml_on(p) {
                        bold = true;
                    }
                }
                "i" | "iCs" => {
                    if xml_on(p) {
                        italic = true;
                    }
                }
                "u" => {
                    let val = attr_any(p, "val").unwrap_or_else(|| "single".to_string());
                    underline = val != "none";
                }
                "color" => {
                    color = attr_any(p, "val").as_deref().and_then(normalize_hex_color);
                }
                "sz" => {
                    sz_val = attr_any(p, "val")
                        .and_then(|v| v.parse::<f32>().ok())
                        .map(|half| half / 2.0);
                }
                "szCs" => {
                    sz_cs_val = attr_any(p, "val")
                        .and_then(|v| v.parse::<f32>().ok())
                        .map(|half| half / 2.0);
                }
                _ => {}
            }
        }

        // Prefer sz (Latin) over szCs (complex-script); keep inherited if both fail
        if let Some(sz) = sz_val.or(sz_cs_val) {
            font_size_pt = Some(sz);
        }
    }

    let mut content = String::new();
    for child in run.children().filter(|n| n.is_element()) {
        match child.tag_name().name() {
            "t" => {
                let preserve = attr_any(child, "space")
                    .map(|v| v == "preserve")
                    .unwrap_or(false);
                let text = child.text().unwrap_or_default();
                content.push_str(&escape_html(text, preserve));
            }
            "tab" => content.push_str("&nbsp;&nbsp;&nbsp;&nbsp;"),
            "br" | "cr" => content.push_str("<br/>"),
            "sym" => {
                if let Some(hex) = attr_any(child, "char") {
                    if let Ok(code) = u32::from_str_radix(&hex, 16) {
                        if let Some(ch) = char::from_u32(code) {
                            content.push_str(&escape_html(&ch.to_string(), false));
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if content.is_empty() {
        return String::new();
    }

    // Build a single span with all inline styles to reduce DOM depth
    let mut inline_styles = Vec::new();
    if let Some(sz) = font_size_pt {
        inline_styles.push(format!("font-size:{:.1}pt", sz));
    }
    if let Some(ref c) = color {
        inline_styles.push(format!("color:{}", c));
    }

    let mut wrapped = content;
    if !inline_styles.is_empty() {
        wrapped = format!("<span style=\"{}\">{}</span>", inline_styles.join(";"), wrapped);
    }
    if underline {
        wrapped = format!("<u>{}</u>", wrapped);
    }
    if italic {
        wrapped = format!("<em>{}</em>", wrapped);
    }
    if bold {
        wrapped = format!("<strong>{}</strong>", wrapped);
    }
    wrapped
}

fn paragraph_style(paragraph: Node<'_, '_>) -> Option<String> {
    let ppr = paragraph
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "pPr")?;
    let pstyle = ppr
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "pStyle")?;
    attr_any(pstyle, "val")
}

fn paragraph_alignment(paragraph: Node<'_, '_>) -> Option<String> {
    let ppr = paragraph
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "pPr")?;
    let jc = ppr
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "jc")?;
    let value = attr_any(jc, "val")?.to_ascii_lowercase();
    match value.as_str() {
        "left" | "start" => Some("left".to_string()),
        "center" => Some("center".to_string()),
        "right" | "end" => Some("right".to_string()),
        "both" | "distribute" | "justify" => Some("justify".to_string()),
        _ => None,
    }
}

fn build_paragraph_style_attr(text_align: Option<&str>, font_size_pt: Option<f32>) -> Option<String> {
    let mut styles = Vec::new();
    if let Some(v) = text_align {
        if v.eq_ignore_ascii_case("center")
            || v.eq_ignore_ascii_case("right")
            || v.eq_ignore_ascii_case("justify")
        {
            styles.push(format!("text-align:{};", v.to_ascii_lowercase()));
        }
    }
    if let Some(sz) = font_size_pt {
        if sz.is_finite() && sz > 0.0 {
            styles.push(format!("font-size:{:.1}pt;", sz));
        }
    }
    if styles.is_empty() {
        None
    } else {
        Some(styles.join(""))
    }
}

fn parse_style_map(styles_xml: &str) -> HashMap<String, ResolvedStyleInfo> {
    let Ok(doc) = Document::parse(styles_xml) else {
        return HashMap::new();
    };

    let mut raw: HashMap<String, RawStyleInfo> = HashMap::new();

    for style in doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "style")
    {
        let style_id = match attr_any(style, "styleId") {
            Some(v) if !v.is_empty() => v,
            _ => continue,
        };
        let style_type = attr_any(style, "type")
            .unwrap_or_default()
            .to_ascii_lowercase();
        if style_type != "paragraph" && style_type != "character" {
            continue;
        }

        let based_on = style
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "basedOn")
            .and_then(|n| attr_any(n, "val"));
        let name = style
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "name")
            .and_then(|n| attr_any(n, "val"));
        let tag = map_style_heading_tag(&style_id, name.as_deref());

        let ppr = style
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "pPr");
        let text_align = ppr
            .and_then(|p| {
                p.children()
                    .find(|n| n.is_element() && n.tag_name().name() == "jc")
            })
            .and_then(|jc| attr_any(jc, "val"))
            .and_then(|v| match v.to_ascii_lowercase().as_str() {
                "left" | "start" => Some("left".to_string()),
                "center" => Some("center".to_string()),
                "right" | "end" => Some("right".to_string()),
                "both" | "justify" | "distribute" => Some("justify".to_string()),
                _ => None,
            });

        let rpr = style
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "rPr");
        let font_size_pt = rpr.and_then(extract_rpr_font_size_pt);

        raw.insert(
            style_id,
            RawStyleInfo {
                based_on,
                tag,
                text_align,
                font_size_pt,
            },
        );
    }

    let mut resolved: HashMap<String, ResolvedStyleInfo> = HashMap::new();
    let mut visiting = HashSet::new();
    let keys = raw.keys().cloned().collect::<Vec<_>>();
    for key in keys {
        let value = resolve_style_info(&key, &raw, &mut resolved, &mut visiting);
        resolved.insert(key, value);
    }
    resolved
}

fn resolve_style_info(
    style_id: &str,
    raw: &HashMap<String, RawStyleInfo>,
    cache: &mut HashMap<String, ResolvedStyleInfo>,
    visiting: &mut HashSet<String>,
) -> ResolvedStyleInfo {
    if let Some(cached) = cache.get(style_id) {
        return cached.clone();
    }

    if !visiting.insert(style_id.to_string()) {
        return ResolvedStyleInfo::default();
    }

    let Some(raw_info) = raw.get(style_id) else {
        visiting.remove(style_id);
        return ResolvedStyleInfo::default();
    };

    let mut result = if let Some(parent) = raw_info.based_on.as_deref() {
        resolve_style_info(parent, raw, cache, visiting)
    } else {
        ResolvedStyleInfo::default()
    };

    if raw_info.tag.is_some() {
        result.tag = raw_info.tag.clone();
    }
    if raw_info.text_align.is_some() {
        result.text_align = raw_info.text_align.clone();
    }
    if raw_info.font_size_pt.is_some() {
        result.font_size_pt = raw_info.font_size_pt;
    }

    visiting.remove(style_id);
    cache.insert(style_id.to_string(), result.clone());
    result
}

fn map_style_heading_tag(style_id: &str, style_name: Option<&str>) -> Option<String> {
    let id = style_id.to_ascii_lowercase();
    let name = style_name.unwrap_or_default().to_ascii_lowercase();
    let merged = format!("{} {}", id, name);
    if merged.contains("heading1") || merged.contains("heading 1") || merged.contains("title") {
        Some("h1".to_string())
    } else if merged.contains("heading2") || merged.contains("heading 2") || merged.contains("subtitle") {
        Some("h2".to_string())
    } else if merged.contains("heading3") || merged.contains("heading 3") {
        Some("h3".to_string())
    } else {
        None
    }
}

fn extract_rpr_font_size_pt(rpr: Node<'_, '_>) -> Option<f32> {
    let mut sz_val: Option<f32> = None;
    let mut sz_cs_val: Option<f32> = None;
    for prop in rpr.children().filter(|n| n.is_element()) {
        match prop.tag_name().name() {
            "sz" => {
                sz_val = attr_any(prop, "val")
                    .and_then(|v| v.parse::<f32>().ok())
                    .map(|half| half / 2.0);
            }
            "szCs" => {
                sz_cs_val = attr_any(prop, "val")
                    .and_then(|v| v.parse::<f32>().ok())
                    .map(|half| half / 2.0);
            }
            _ => {}
        }
    }
    sz_val.or(sz_cs_val)
}

fn parse_default_font_size_pt(styles_xml: &str) -> Option<f32> {
    let doc = Document::parse(styles_xml).ok()?;
    let rpr = doc
        .descendants()
        .find(|n| {
            n.is_element()
                && n.tag_name().name() == "rPr"
                && n.parent()
                    .map(|p| p.is_element() && p.tag_name().name() == "rPrDefault")
                    .unwrap_or(false)
        })?;
    extract_rpr_font_size_pt(rpr)
}

fn paragraph_run_font_size(paragraph: Node<'_, '_>) -> Option<f32> {
    let ppr = paragraph
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "pPr")?;
    let rpr = ppr
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "rPr")?;
    extract_rpr_font_size_pt(rpr)
}

fn paragraph_is_list(paragraph: Node<'_, '_>) -> bool {
    let ppr = paragraph
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "pPr");
    if let Some(ppr) = ppr {
        return ppr
            .children()
            .any(|n| n.is_element() && n.tag_name().name() == "numPr");
    }
    false
}

fn p_style_contains_list(style: &Option<String>) -> bool {
    style
        .as_deref()
        .map(|s| s.to_ascii_lowercase().contains("list"))
        .unwrap_or(false)
}

fn map_paragraph_tag(style: Option<&str>, style_tag: Option<&str>) -> &'static str {
    if let Some(tag) = style_tag {
        let normalized = tag.to_ascii_lowercase();
        if normalized == "h1" {
            return "h1";
        }
        if normalized == "h2" {
            return "h2";
        }
        if normalized == "h3" {
            return "h3";
        }
    }

    let normalized = style.unwrap_or_default().to_ascii_lowercase();
    if normalized == "title" || normalized == "heading1" || normalized == "heading 1" {
        "h1"
    } else if normalized == "subtitle" || normalized == "heading2" || normalized == "heading 2" {
        "h2"
    } else if normalized == "heading3" || normalized == "heading 3" {
        "h3"
    } else {
        "p"
    }
}

fn table_cell_colspan(cell: Node<'_, '_>) -> usize {
    let tcpr = cell
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "tcPr");
    let grid_span = tcpr.and_then(|tcpr| {
        tcpr.children()
            .find(|n| n.is_element() && n.tag_name().name() == "gridSpan")
            .and_then(|span| attr_any(span, "val"))
            .and_then(|v| v.parse::<usize>().ok())
    });
    grid_span.unwrap_or(1).max(1)
}

fn table_cell_bg(cell: Node<'_, '_>) -> Option<String> {
    let tcpr = cell
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "tcPr")?;
    let shd = tcpr
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "shd")?;
    attr_any(shd, "fill").as_deref().and_then(normalize_hex_color)
}

fn extract_plain_lines(document_xml: &str) -> Vec<String> {
    if let Ok(doc) = Document::parse(document_xml) {
        let mut lines = Vec::new();
        for p in doc
            .descendants()
            .filter(|n| n.is_element() && n.tag_name().name() == "p")
        {
            let mut line = String::new();
            for t in p
                .descendants()
                .filter(|n| n.is_element() && n.tag_name().name() == "t")
            {
                if let Some(text) = t.text() {
                    line.push_str(text);
                }
            }
            if !line.trim().is_empty() {
                lines.push(line);
            }
        }
        if !lines.is_empty() {
            return lines;
        }
    }
    vec!["".to_string()]
}

fn lines_to_html(lines: &[String]) -> String {
    let mut html = String::from("<div class=\"docx-root\">");
    for line in lines {
        if line.trim().is_empty() {
            html.push_str("<p><br/></p>");
        } else {
            html.push_str("<p>");
            html.push_str(&escape_html(line, false));
            html.push_str("</p>");
        }
    }
    if lines.is_empty() {
        html.push_str("<p><br/></p>");
    }
    html.push_str("</div>");
    html
}

fn xml_on(node: Node<'_, '_>) -> bool {
    match attr_any(node, "val") {
        Some(v) => !(v == "0" || v.eq_ignore_ascii_case("false") || v.eq_ignore_ascii_case("off")),
        None => true,
    }
}

fn attr_any(node: Node<'_, '_>, name: &str) -> Option<String> {
    node.attribute(name)
        .or_else(|| node.attribute(("http://schemas.openxmlformats.org/wordprocessingml/2006/main", name)))
        .or_else(|| node.attribute(("http://www.w3.org/XML/1998/namespace", name)))
        .map(|v| v.to_string())
}

fn normalize_hex_color(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_start_matches('#');
    if trimmed.eq_ignore_ascii_case("auto") {
        return None;
    }
    if trimmed.len() == 6 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(format!("#{}", trimmed))
    } else {
        None
    }
}

fn escape_html(text: &str, preserve_space: bool) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            ' ' if preserve_space => out.push_str("&nbsp;"),
            _ => out.push(ch),
        }
    }
    out
}

#[derive(Clone, Copy, Default)]
struct RunFormat {
    bold: bool,
    italic: bool,
    underline: bool,
    font_size_half_points: Option<u32>,
}

fn build_docx_document_xml(content: &str) -> String {
    let body = html_to_word_body_xml(content).unwrap_or_else(|| {
        let plain = strip_html_fallback(content);
        plain_text_to_word_body_xml(&plain)
    });

    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">\
<w:body>{}\
<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/></w:sectPr>\
</w:body></w:document>",
        body
    )
}

fn html_to_word_body_xml(content: &str) -> Option<String> {
    let sanitized = normalize_html_for_xml(content);
    let wrapped = format!("<root>{}</root>", sanitized);
    let doc = Document::parse(&wrapped).ok()?;
    let root = doc.root_element();
    let mut out = String::new();

    for child in root.children() {
        append_block_from_html_node(child, &mut out);
    }

    if out.trim().is_empty() {
        out.push_str("<w:p><w:r><w:t xml:space=\"preserve\"></w:t></w:r></w:p>");
    }
    Some(out)
}

fn append_block_from_html_node(node: Node<'_, '_>, out: &mut String) {
    if node.is_text() {
        let text = node.text().unwrap_or_default().trim();
        if !text.is_empty() {
            out.push_str(&paragraph_word_xml(Some(text), None));
        }
        return;
    }
    if !node.is_element() {
        return;
    }

    match node.tag_name().name().to_ascii_lowercase().as_str() {
        "p" => out.push_str(&paragraph_node_word_xml(node, None)),
        "h1" => out.push_str(&paragraph_node_word_xml(node, Some("Heading1"))),
        "h2" => out.push_str(&paragraph_node_word_xml(node, Some("Heading2"))),
        "h3" => out.push_str(&paragraph_node_word_xml(node, Some("Heading3"))),
        "div" | "section" | "article" => {
            for child in node.children() {
                append_block_from_html_node(child, out);
            }
        }
        "ul" => out.push_str(&list_word_xml(node, false)),
        "ol" => out.push_str(&list_word_xml(node, true)),
        "table" => out.push_str(&table_word_xml(node)),
        "br" => out.push_str("<w:p><w:r><w:br/></w:r></w:p>"),
        _ => {
            let text = node.text().unwrap_or_default().trim();
            if !text.is_empty() {
                out.push_str(&paragraph_word_xml(Some(text), None));
            } else {
                for child in node.children() {
                    append_block_from_html_node(child, out);
                }
            }
        }
    }
}

fn paragraph_node_word_xml(node: Node<'_, '_>, style: Option<&str>) -> String {
    let mut runs = String::new();
    for child in node.children() {
        append_inline_word_xml(child, RunFormat::default(), &mut runs);
    }
    if runs.trim().is_empty() {
        runs.push_str("<w:r><w:t xml:space=\"preserve\"></w:t></w:r>");
    }

    let mut ppr_parts = String::new();
    if let Some(s) = style {
        ppr_parts.push_str(&format!("<w:pStyle w:val=\"{}\"/>", s));
    }
    if let Some(jc) = html_text_align_to_word(node_text_align(node).as_deref()) {
        ppr_parts.push_str(&format!("<w:jc w:val=\"{}\"/>", jc));
    }
    let ppr = if ppr_parts.is_empty() {
        String::new()
    } else {
        format!("<w:pPr>{}</w:pPr>", ppr_parts)
    };

    format!("<w:p>{}{}</w:p>", ppr, runs)
}

fn paragraph_word_xml(text: Option<&str>, style: Option<&str>) -> String {
    let t = text.unwrap_or_default();
    let runs = run_from_text(t, RunFormat::default());
    let ppr = style
        .map(|s| format!("<w:pPr><w:pStyle w:val=\"{}\"/></w:pPr>", s))
        .unwrap_or_default();
    format!("<w:p>{}{}</w:p>", ppr, runs)
}

fn list_word_xml(list_node: Node<'_, '_>, ordered: bool) -> String {
    let mut out = String::new();
    let mut n = 1usize;

    for li in list_node
        .children()
        .filter(|n| n.is_element() && n.tag_name().name().eq_ignore_ascii_case("li"))
    {
        let prefix = if ordered {
            format!("{}. ", n)
        } else {
            "• ".to_string()
        };
        let mut runs = run_from_text(&prefix, RunFormat::default());
        for child in li.children() {
            append_inline_word_xml(child, RunFormat::default(), &mut runs);
        }
        if runs.trim().is_empty() {
            runs = "<w:r><w:t xml:space=\"preserve\"></w:t></w:r>".to_string();
        }
        out.push_str(&format!("<w:p>{}</w:p>", runs));
        n += 1;
    }

    out
}

fn table_word_xml(table: Node<'_, '_>) -> String {
    let mut out = String::from(
        "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr><w:tblGrid/>",
    );

    for tr in table
        .children()
        .filter(|n| n.is_element() && n.tag_name().name().eq_ignore_ascii_case("tr"))
    {
        out.push_str("<w:tr>");
        for cell in tr.children().filter(|n| {
            n.is_element()
                && (n.tag_name().name().eq_ignore_ascii_case("td")
                    || n.tag_name().name().eq_ignore_ascii_case("th"))
        }) {
            let colspan = cell
                .attribute("colspan")
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(1);
            out.push_str("<w:tc><w:tcPr>");
            if colspan > 1 {
                out.push_str(&format!("<w:gridSpan w:val=\"{}\"/>", colspan));
            }
            out.push_str("</w:tcPr>");

            let mut has_block = false;
            for child in cell.children() {
                if child.is_element()
                    && (child.tag_name().name().eq_ignore_ascii_case("p")
                        || child.tag_name().name().eq_ignore_ascii_case("div"))
                {
                    out.push_str(&paragraph_node_word_xml(child, None));
                    has_block = true;
                }
            }
            if !has_block {
                let mut runs = String::new();
                for child in cell.children() {
                    append_inline_word_xml(child, RunFormat::default(), &mut runs);
                }
                if runs.trim().is_empty() {
                    runs.push_str("<w:r><w:t xml:space=\"preserve\"></w:t></w:r>");
                }
                out.push_str(&format!("<w:p>{}</w:p>", runs));
            }

            out.push_str("</w:tc>");
        }
        out.push_str("</w:tr>");
    }

    out.push_str("</w:tbl>");
    out
}

fn append_inline_word_xml(node: Node<'_, '_>, fmt: RunFormat, out: &mut String) {
    if node.is_text() {
        let text = node.text().unwrap_or_default();
        if !text.is_empty() {
            out.push_str(&run_from_text(text, fmt));
        }
        return;
    }
    if !node.is_element() {
        return;
    }

    let tag = node.tag_name().name().to_ascii_lowercase();
    match tag.as_str() {
        "strong" | "b" => {
            let mut next = fmt;
            next.bold = true;
            for child in node.children() {
                append_inline_word_xml(child, next, out);
            }
        }
        "em" | "i" => {
            let mut next = fmt;
            next.italic = true;
            for child in node.children() {
                append_inline_word_xml(child, next, out);
            }
        }
        "u" => {
            let mut next = fmt;
            next.underline = true;
            for child in node.children() {
                append_inline_word_xml(child, next, out);
            }
        }
        "span" => {
            let mut next = fmt;
            if let Some(size) = node
                .attribute("style")
                .and_then(parse_css_font_size_half_points)
            {
                next.font_size_half_points = Some(size);
            }
            for child in node.children() {
                append_inline_word_xml(child, next, out);
            }
        }
        "br" => out.push_str("<w:r><w:br/></w:r>"),
        _ => {
            for child in node.children() {
                append_inline_word_xml(child, fmt, out);
            }
        }
    }
}

fn run_from_text(text: &str, fmt: RunFormat) -> String {
    if text.is_empty() {
        return String::new();
    }
    let escaped = escape_xml_text(text);
    if escaped.is_empty() {
        return String::new();
    }

    let preserve = text.starts_with(' ') || text.ends_with(' ') || text.contains("  ");
    let mut rpr = String::new();
    if fmt.bold {
        rpr.push_str("<w:b/>");
    }
    if fmt.italic {
        rpr.push_str("<w:i/>");
    }
    if fmt.underline {
        rpr.push_str("<w:u w:val=\"single\"/>");
    }
    if let Some(sz) = fmt.font_size_half_points {
        rpr.push_str(&format!("<w:sz w:val=\"{}\"/>", sz));
    }

    if rpr.is_empty() {
        if preserve {
            format!("<w:r><w:t xml:space=\"preserve\">{}</w:t></w:r>", escaped)
        } else {
            format!("<w:r><w:t>{}</w:t></w:r>", escaped)
        }
    } else if preserve {
        format!(
            "<w:r><w:rPr>{}</w:rPr><w:t xml:space=\"preserve\">{}</w:t></w:r>",
            rpr, escaped
        )
    } else {
        format!("<w:r><w:rPr>{}</w:rPr><w:t>{}</w:t></w:r>", rpr, escaped)
    }
}

fn node_text_align(node: Node<'_, '_>) -> Option<String> {
    let style = node.attribute("style")?;
    for part in style.split(';') {
        let mut kv = part.splitn(2, ':');
        let key = kv.next().map(str::trim).unwrap_or_default().to_ascii_lowercase();
        if key == "text-align" {
            let value = kv.next().map(str::trim).unwrap_or_default().to_ascii_lowercase();
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn html_text_align_to_word(value: Option<&str>) -> Option<&'static str> {
    match value {
        Some(v) if v.eq_ignore_ascii_case("center") => Some("center"),
        Some(v) if v.eq_ignore_ascii_case("right") => Some("right"),
        Some(v) if v.eq_ignore_ascii_case("justify") => Some("both"),
        Some(v) if v.eq_ignore_ascii_case("left") => Some("left"),
        _ => None,
    }
}

fn parse_css_font_size_half_points(style: &str) -> Option<u32> {
    for part in style.split(';') {
        let mut kv = part.splitn(2, ':');
        let key = kv.next().map(str::trim).unwrap_or_default().to_ascii_lowercase();
        if key != "font-size" {
            continue;
        }
        let value = kv.next().map(str::trim).unwrap_or_default().to_ascii_lowercase();
        if value.is_empty() {
            return None;
        }

        let (num, is_pt) = if let Some(v) = value.strip_suffix("pt") {
            (v.trim(), true)
        } else if let Some(v) = value.strip_suffix("px") {
            (v.trim(), false)
        } else {
            (value.trim(), false)
        };

        let parsed = num.parse::<f32>().ok()?;
        if parsed <= 0.0 {
            return None;
        }

        let points = if is_pt { parsed } else { parsed * (72.0 / 96.0) };
        let half_points = (points * 2.0).round();
        if !half_points.is_finite() || half_points <= 0.0 {
            return None;
        }
        return Some(half_points as u32);
    }
    None
}

fn normalize_html_for_xml(input: &str) -> String {
    input
        .replace("<br>", "<br/>")
        .replace("<br />", "<br/>")
        .replace("&nbsp;", " ")
}

fn strip_html_fallback(input: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

fn plain_text_to_word_body_xml(text: &str) -> String {
    let mut out = String::new();
    for line in text.replace("\r\n", "\n").split('\n') {
        out.push_str(&paragraph_word_xml(Some(line), None));
    }
    if out.trim().is_empty() {
        out.push_str("<w:p><w:r><w:t xml:space=\"preserve\"></w:t></w:r></w:p>");
    }
    out
}

fn escape_xml_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

fn write_docx_package(path: &Path, document_xml: &str) -> Result<(), DocError> {
    const CONTENT_TYPES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"#;

    const ROOT_RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;

    const DOCUMENT_RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#;

    const STYLES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="30"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
</w:styles>"#;

    let file = File::create(path).map_err(DocError::IoError)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("[Content_Types].xml", options)
        .map_err(|e| DocError::ParseError(e.to_string()))?;
    zip.write_all(CONTENT_TYPES_XML.as_bytes())
        .map_err(DocError::IoError)?;

    zip.start_file("_rels/.rels", options)
        .map_err(|e| DocError::ParseError(e.to_string()))?;
    zip.write_all(ROOT_RELS_XML.as_bytes())
        .map_err(DocError::IoError)?;

    zip.start_file("word/document.xml", options)
        .map_err(|e| DocError::ParseError(e.to_string()))?;
    zip.write_all(document_xml.as_bytes())
        .map_err(DocError::IoError)?;

    zip.start_file("word/styles.xml", options)
        .map_err(|e| DocError::ParseError(e.to_string()))?;
    zip.write_all(STYLES_XML.as_bytes())
        .map_err(DocError::IoError)?;

    zip.start_file("word/_rels/document.xml.rels", options)
        .map_err(|e| DocError::ParseError(e.to_string()))?;
    zip.write_all(DOCUMENT_RELS_XML.as_bytes())
        .map_err(DocError::IoError)?;

    zip.finish()
        .map_err(|e| DocError::ParseError(e.to_string()))?;

    Ok(())
}
