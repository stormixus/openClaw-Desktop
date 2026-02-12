use std::fs::File;
use std::io::Read;
use std::path::Path;

use roxmltree::{Document, Node};
use zip::ZipArchive;

use crate::document::error::DocError;
use crate::document::types::*;

pub struct PptxAdapter;

impl PptxAdapter {
    pub fn read(path: &Path) -> Result<DocState, DocError> {
        const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024; // 50MB
        let metadata = std::fs::metadata(path).map_err(DocError::IoError)?;
        if metadata.len() > MAX_FILE_SIZE {
            return Err(DocError::ValidationError(format!(
                "File too large ({:.1} MB). Maximum supported size is 50 MB.",
                metadata.len() as f64 / 1024.0 / 1024.0
            )));
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        if ext == "ppt" {
            return Err(DocError::UnsupportedFormat(
                "Legacy .ppt format is not supported. Please resave as .pptx in PowerPoint and retry."
                    .to_string(),
            ));
        }

        let file = File::open(path).map_err(DocError::IoError)?;
        let mut archive =
            ZipArchive::new(file).map_err(|e| DocError::ParseError(e.to_string()))?;

        let slide_paths = enumerate_slides(&mut archive)?;

        if slide_paths.is_empty() {
            return Err(DocError::ParseError(
                "No slides found in PPTX file".to_string(),
            ));
        }

        let mut sheets = Vec::with_capacity(slide_paths.len());
        for (i, slide_path) in slide_paths.iter().enumerate() {
            let mut xml_str = String::new();
            match archive.by_name(slide_path) {
                Ok(mut entry) => {
                    entry
                        .read_to_string(&mut xml_str)
                        .map_err(DocError::IoError)?;
                }
                Err(_) => continue,
            }

            let html = parse_slide(&xml_str);
            let name = format!("Slide {}", i + 1);
            sheets.push(SheetData {
                name,
                rows: vec![vec![CellValue::String(html)]],
                total_rows: 1,
                total_cols: 1,
                formulas: vec![],
                merged_ranges: vec![],
                row_heights: vec![],
                col_widths: vec![],
                styled_cells: vec![],
            });
        }

        if sheets.is_empty() {
            sheets.push(SheetData {
                name: "Slide 1".to_string(),
                rows: vec![vec![CellValue::String(
                    "<div class=\"slide-root\"><p>(Empty presentation)</p></div>".to_string(),
                )]],
                total_rows: 1,
                total_cols: 1,
                formulas: vec![],
                merged_ranges: vec![],
                row_heights: vec![],
                col_widths: vec![],
                styled_cells: vec![],
            });
        }

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("untitled.pptx")
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
            doc_type: DocumentType::Presentation,
            file_path: path.to_string_lossy().to_string(),
            file_name,
            sheets,
            modified: false,
        })
    }
}

/// Enumerate slide file paths from the archive in order.
/// Parses `ppt/presentation.xml` for the slide relationship IDs,
/// then resolves them via `ppt/_rels/presentation.xml.rels`.
/// Falls back to scanning zip entries for `ppt/slides/slide*.xml`.
fn enumerate_slides(archive: &mut ZipArchive<File>) -> Result<Vec<String>, DocError> {
    // Try the relationship-based approach first for correct ordering
    if let Ok(slides) = enumerate_slides_via_rels(archive) {
        if !slides.is_empty() {
            return Ok(slides);
        }
    }

    // Fallback: scan zip entries for slide files
    let mut slide_paths: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index(i) {
            let name = entry.name().to_string();
            if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") && !name.contains("_rels") {
                slide_paths.push(name);
            }
        }
    }

    // Sort by slide number
    slide_paths.sort_by(|a, b| {
        let num_a = extract_slide_number(a);
        let num_b = extract_slide_number(b);
        num_a.cmp(&num_b)
    });

    Ok(slide_paths)
}

fn enumerate_slides_via_rels(archive: &mut ZipArchive<File>) -> Result<Vec<String>, DocError> {
    // Read presentation.xml to get slide rId ordering
    let mut pres_xml = String::new();
    archive
        .by_name("ppt/presentation.xml")
        .map_err(|e| DocError::ParseError(e.to_string()))?
        .read_to_string(&mut pres_xml)
        .map_err(DocError::IoError)?;

    let pres_doc =
        Document::parse(&pres_xml).map_err(|e| DocError::ParseError(e.to_string()))?;

    // Collect rIds in document order from <p:sldIdLst> > <p:sldId r:id="rIdN"/>
    let mut r_ids: Vec<String> = Vec::new();
    for node in pres_doc.descendants() {
        if node.is_element() && node.tag_name().name() == "sldId" {
            if let Some(rid) = attr_drawing(node, "id")
                .or_else(|| node.attribute("r:id").map(|s| s.to_string()))
                .or_else(|| {
                    node.attribute((
                        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
                        "id",
                    ))
                    .map(|s| s.to_string())
                })
            {
                r_ids.push(rid);
            }
        }
    }

    if r_ids.is_empty() {
        return Ok(Vec::new());
    }

    // Read presentation.xml.rels to map rId -> Target
    let mut rels_xml = String::new();
    archive
        .by_name("ppt/_rels/presentation.xml.rels")
        .map_err(|e| DocError::ParseError(e.to_string()))?
        .read_to_string(&mut rels_xml)
        .map_err(DocError::IoError)?;

    let rels_doc =
        Document::parse(&rels_xml).map_err(|e| DocError::ParseError(e.to_string()))?;

    let mut rid_to_target: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for node in rels_doc.descendants() {
        if node.is_element() && node.tag_name().name() == "Relationship" {
            if let (Some(id), Some(target)) = (
                node.attribute("Id").map(|s| s.to_string()),
                node.attribute("Target").map(|s| s.to_string()),
            ) {
                rid_to_target.insert(id, target);
            }
        }
    }

    let mut slides: Vec<String> = Vec::new();
    for rid in &r_ids {
        if let Some(target) = rid_to_target.get(rid) {
            // Target is relative to ppt/, e.g. "slides/slide1.xml"
            let full_path = if target.starts_with("ppt/") {
                target.clone()
            } else if target.starts_with('/') {
                target.trim_start_matches('/').to_string()
            } else {
                format!("ppt/{}", target)
            };
            slides.push(full_path);
        }
    }

    Ok(slides)
}

fn extract_slide_number(path: &str) -> u32 {
    // Extract number from "ppt/slides/slide123.xml"
    let name = path
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim_start_matches("slide")
        .trim_end_matches(".xml");
    name.parse().unwrap_or(u32::MAX)
}

/// Parse a single slide XML into HTML.
fn parse_slide(xml: &str) -> String {
    let doc = match Document::parse(xml) {
        Ok(d) => d,
        Err(_) => return "<div class=\"slide-root\"><p>(Parse error)</p></div>".to_string(),
    };

    let mut html = String::from("<div class=\"slide-root\">");

    // Find the spTree (shape tree) which contains all shapes
    let sp_tree = doc.descendants().find(|n| {
        n.is_element() && n.tag_name().name() == "spTree"
    });

    if let Some(tree) = sp_tree {
        for child in tree.children().filter(|n| n.is_element()) {
            match child.tag_name().name() {
                "sp" => {
                    html.push_str(&render_shape(child));
                }
                "grpSp" => {
                    // Group shape — recurse into children
                    for gc in child.children().filter(|n| n.is_element()) {
                        match gc.tag_name().name() {
                            "sp" => html.push_str(&render_shape(gc)),
                            "graphicFrame" => html.push_str(&render_graphic_frame(gc)),
                            _ => {}
                        }
                    }
                }
                "graphicFrame" => {
                    html.push_str(&render_graphic_frame(child));
                }
                _ => {}
            }
        }
    }

    if html == "<div class=\"slide-root\">" {
        html.push_str("<p>&nbsp;</p>");
    }

    html.push_str("</div>");
    html
}

/// Render a single shape's text body as HTML.
fn render_shape(shape: Node<'_, '_>) -> String {
    let is_title = is_title_shape(shape);

    // Find txBody
    let tx_body = shape
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "txBody");

    let Some(body) = tx_body else {
        return String::new();
    };

    render_text_body(body, is_title)
}

/// Check if a shape is a title or centered title placeholder.
fn is_title_shape(shape: Node<'_, '_>) -> bool {
    // Look for <p:nvSpPr> > <p:nvPr> > <p:ph type="title"|"ctrTitle">
    for desc in shape.descendants() {
        if desc.is_element() && desc.tag_name().name() == "ph" {
            if let Some(ph_type) = desc.attribute("type") {
                let t = ph_type.to_ascii_lowercase();
                if t == "title" || t == "ctrtitle" {
                    return true;
                }
            }
        }
    }
    false
}

/// Render text body (<a:txBody>) as HTML paragraphs.
fn render_text_body(body: Node<'_, '_>, is_title: bool) -> String {
    let mut html = String::new();

    for child in body.children().filter(|n| n.is_element()) {
        if child.tag_name().name() == "p" {
            let para_html = render_paragraph(child);
            if para_html.trim().is_empty() {
                continue;
            }

            let tag = if is_title { "h2" } else { "p" };

            let align = paragraph_alignment(child);
            if let Some(a) = &align {
                html.push_str(&format!("<{} style=\"text-align:{};\">", tag, a));
            } else {
                html.push('<');
                html.push_str(tag);
                html.push('>');
            }
            html.push_str(&para_html);
            html.push_str("</");
            html.push_str(tag);
            html.push('>');
        }
    }

    html
}

/// Render a paragraph (<a:p>) into inline HTML.
fn render_paragraph(para: Node<'_, '_>) -> String {
    let mut html = String::new();

    for child in para.children().filter(|n| n.is_element()) {
        match child.tag_name().name() {
            "r" => html.push_str(&render_run(child)),
            "br" => html.push_str("<br/>"),
            _ => {}
        }
    }

    html
}

/// Render a text run (<a:r>) with formatting.
fn render_run(run: Node<'_, '_>) -> String {
    let rpr = run
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "rPr");

    let mut bold = false;
    let mut italic = false;
    let mut font_size_pt: Option<f32> = None;
    let mut color: Option<String> = None;

    if let Some(props) = rpr {
        // Bold: b="1" or b without value
        if let Some(b_val) = props.attribute("b") {
            bold = b_val != "0";
        }
        // Italic: i="1"
        if let Some(i_val) = props.attribute("i") {
            italic = i_val != "0";
        }
        // Font size: sz in hundredths of a point (e.g. 2400 = 24pt)
        if let Some(sz) = props.attribute("sz") {
            if let Ok(val) = sz.parse::<f32>() {
                font_size_pt = Some(val / 100.0);
            }
        }
        // Color from <a:solidFill> > <a:srgbClr val="RRGGBB"/>
        for fill in props.children().filter(|n| n.is_element() && n.tag_name().name() == "solidFill") {
            for clr in fill.children().filter(|n| n.is_element()) {
                if let Some(val) = clr.attribute("val") {
                    if val.len() == 6 && val.chars().all(|c| c.is_ascii_hexdigit()) {
                        color = Some(format!("#{}", val));
                    }
                }
            }
        }
    }

    // Extract text from <a:t>
    let text_node = run
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "t");

    let text = text_node
        .and_then(|n| n.text())
        .unwrap_or_default();

    if text.is_empty() {
        return String::new();
    }

    let escaped = escape_html(text);

    // Build inline styles
    let mut styles = Vec::new();
    if let Some(sz) = font_size_pt {
        if sz > 0.0 && sz.is_finite() {
            styles.push(format!("font-size:{:.1}pt", sz));
        }
    }
    if let Some(ref c) = color {
        styles.push(format!("color:{}", c));
    }

    let mut wrapped = escaped;
    if !styles.is_empty() {
        wrapped = format!("<span style=\"{}\">{}</span>", styles.join(";"), wrapped);
    }
    if italic {
        wrapped = format!("<em>{}</em>", wrapped);
    }
    if bold {
        wrapped = format!("<strong>{}</strong>", wrapped);
    }

    wrapped
}

/// Render a graphicFrame — extract tables from <a:tbl>.
fn render_graphic_frame(frame: Node<'_, '_>) -> String {
    // Look for <a:graphic> > <a:graphicData> > <a:tbl>
    for desc in frame.descendants() {
        if desc.is_element() && desc.tag_name().name() == "tbl" {
            return render_table(desc);
        }
    }
    // Fallback: try to find any txBody in the frame
    for desc in frame.descendants() {
        if desc.is_element() && desc.tag_name().name() == "txBody" {
            return render_text_body(desc, false);
        }
    }
    String::new()
}

/// Render a DrawingML table (<a:tbl>) as HTML.
fn render_table(tbl: Node<'_, '_>) -> String {
    let mut html = String::from("<table style=\"border-collapse:collapse;width:100%;margin:8px 0;\">");

    for row in tbl.children().filter(|n| n.is_element() && n.tag_name().name() == "tr") {
        html.push_str("<tr>");
        for cell in row.children().filter(|n| n.is_element() && n.tag_name().name() == "tc") {
            // Check for gridSpan (colspan)
            let colspan = cell
                .children()
                .find(|n| n.is_element() && n.tag_name().name() == "tcPr")
                .and_then(|tcpr| tcpr.attribute("gridSpan"))
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(1);

            // Check for rowSpan
            let rowspan = cell
                .children()
                .find(|n| n.is_element() && n.tag_name().name() == "tcPr")
                .and_then(|tcpr| tcpr.attribute("rowSpan"))
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(1);

            // Skip merged cells (vMerge or hMerge)
            let is_merged = cell
                .children()
                .find(|n| n.is_element() && n.tag_name().name() == "tcPr")
                .map(|tcpr| {
                    tcpr.attribute("vMerge").map_or(false, |v| v == "0")
                        || tcpr.attribute("hMerge").map_or(false, |v| v == "0")
                })
                .unwrap_or(false);

            if is_merged {
                continue;
            }

            html.push_str("<td style=\"border:1px solid #ccc;padding:6px 8px;vertical-align:top;\"");
            if colspan > 1 {
                html.push_str(&format!(" colspan=\"{}\"", colspan));
            }
            if rowspan > 1 {
                html.push_str(&format!(" rowspan=\"{}\"", rowspan));
            }
            html.push('>');

            // Render cell content — txBody inside tc
            let mut cell_html = String::new();
            for child in cell.children().filter(|n| n.is_element() && n.tag_name().name() == "txBody") {
                cell_html.push_str(&render_text_body(child, false));
            }
            if cell_html.is_empty() {
                cell_html.push_str("&nbsp;");
            }
            html.push_str(&cell_html);
            html.push_str("</td>");
        }
        html.push_str("</tr>");
    }

    html.push_str("</table>");
    html
}

/// Get paragraph alignment from <a:pPr algn="...">
fn paragraph_alignment(para: Node<'_, '_>) -> Option<String> {
    let ppr = para
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "pPr")?;
    let algn = ppr.attribute("algn")?;
    match algn.to_ascii_lowercase().as_str() {
        "l" => Some("left".to_string()),
        "ctr" => Some("center".to_string()),
        "r" => Some("right".to_string()),
        "just" | "justlow" | "dist" => Some("justify".to_string()),
        _ => None,
    }
}

fn attr_drawing(node: Node<'_, '_>, name: &str) -> Option<String> {
    node.attribute(name)
        .or_else(|| {
            node.attribute((
                "http://schemas.openxmlformats.org/drawingml/2006/main",
                name,
            ))
        })
        .or_else(|| {
            node.attribute((
                "http://schemas.openxmlformats.org/presentationml/2006/main",
                name,
            ))
        })
        .map(|v| v.to_string())
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
