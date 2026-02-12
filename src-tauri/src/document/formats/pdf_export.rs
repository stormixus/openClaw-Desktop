use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Document, Object, ObjectId};

use crate::document::types::BBox;

// ── Input types from the frontend ────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "t")]
#[allow(dead_code)]
pub enum ExportOp {
    #[serde(rename = "delete")]
    Delete {
        #[serde(rename = "targetId")]
        target_id: String,
    },
    #[serde(rename = "replaceText")]
    ReplaceText {
        #[serde(rename = "targetId")]
        target_id: String,
        text: String,
    },
    #[serde(rename = "insertText")]
    InsertText {
        page: u32,
        at: Point,
        text: String,
        #[serde(rename = "fontSize")]
        font_size: Option<f64>,
    },
    #[serde(rename = "highlight")]
    Highlight {
        page: u32,
        rects: Vec<BBox>,
        color: Option<String>,
    },
    #[serde(rename = "move")]
    Move {
        #[serde(rename = "targetId")]
        target_id: String,
        dx: f64,
        dy: f64,
    },
    #[serde(rename = "comment")]
    Comment {
        page: u32,
        at: Point,
        text: String,
    },
}

#[derive(Debug, Deserialize)]
pub struct ExportBlock {
    pub id: String,
    pub page: u32,
    pub bbox: BBox,
}

// ── Helpers ──────────────────────────────────────────────────────────

/// Parse a CSS-style hex color string (#RRGGBB or #RRGGBBAA) into (r, g, b, a) in 0.0..1.0.
fn parse_hex_color(hex: &str) -> (f64, f64, f64, f64) {
    let hex = hex.trim_start_matches('#');
    if hex.len() >= 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(255) as f64 / 255.0;
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(255) as f64 / 255.0;
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f64 / 255.0;
        let a = if hex.len() >= 8 {
            u8::from_str_radix(&hex[6..8], 16).unwrap_or(128) as f64 / 255.0
        } else {
            0.35 // default semi-transparent
        };
        (r, g, b, a)
    } else {
        // Default highlight yellow
        (1.0, 1.0, 0.0, 0.35)
    }
}

/// Get the MediaBox dimensions (width, height) for a page.
/// Falls back to US Letter (612x792) if not found.
fn get_page_media_box(doc: &Document, page_id: ObjectId) -> (f64, f64) {
    if let Ok(page_obj) = doc.get_object(page_id) {
        if let Ok(dict) = page_obj.as_dict() {
            // Try MediaBox on the page itself, then walk up to parent
            if let Ok(media_box) = dict.get(b"MediaBox") {
                if let Ok(arr) = media_box.as_array() {
                    if arr.len() == 4 {
                        let width = get_number(&arr[2]).unwrap_or(612.0)
                            - get_number(&arr[0]).unwrap_or(0.0);
                        let height = get_number(&arr[3]).unwrap_or(792.0)
                            - get_number(&arr[1]).unwrap_or(0.0);
                        return (width, height);
                    }
                }
            }
        }
    }
    (612.0, 792.0)
}

/// Extract a number from a lopdf Object (Integer or Real).
fn get_number(obj: &Object) -> Option<f64> {
    match obj {
        Object::Integer(i) => Some(*i as f64),
        Object::Real(f) => Some(*f as f64),
        _ => None,
    }
}

/// Build PDF content operations to draw a white rectangle covering a bbox area.
/// Coordinates are in PDF space (origin bottom-left).
fn white_rect_ops(pdf_x: f64, pdf_y: f64, w: f64, h: f64) -> Vec<Operation> {
    vec![
        Operation::new("q", vec![]),                                     // save graphics state
        Operation::new("rg", vec![1.0.into(), 1.0.into(), 1.0.into()]), // fill white
        Operation::new(
            "re",
            vec![pdf_x.into(), pdf_y.into(), w.into(), h.into()],
        ),
        Operation::new("f", vec![]),  // fill
        Operation::new("Q", vec![]), // restore graphics state
    ]
}

/// Build PDF content operations to draw text at a given position.
/// `pdf_x`, `pdf_y` are in PDF coordinate space.
fn text_ops(pdf_x: f64, pdf_y: f64, text: &str, font_size: f64, font_name: &[u8]) -> Vec<Operation> {
    // Escape special PDF string characters
    let escaped = text
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)");

    vec![
        Operation::new("q", vec![]),
        Operation::new("BT", vec![]),
        Operation::new(
            "Tf",
            vec![Object::Name(font_name.to_vec()), font_size.into()],
        ),
        Operation::new("rg", vec![0.0.into(), 0.0.into(), 0.0.into()]), // fill black
        Operation::new("Td", vec![pdf_x.into(), pdf_y.into()]),
        Operation::new("Tj", vec![Object::string_literal(escaped)]),
        Operation::new("ET", vec![]),
        Operation::new("Q", vec![]),
    ]
}

/// Build PDF content operations to draw a semi-transparent highlight rectangle.
fn highlight_rect_ops(pdf_x: f64, pdf_y: f64, w: f64, h: f64, r: f64, g: f64, b: f64, _a: f64) -> Vec<Operation> {
    // PDF transparency requires an ExtGState with /CA. For simplicity in V1 we
    // use a lighter tint by blending towards white, which approximates alpha
    // without needing to set up transparency group resources.
    let blend = |c: f64, a: f64| -> f64 { c * a + 1.0 * (1.0 - a) };
    let br = blend(r, _a);
    let bg = blend(g, _a);
    let bb = blend(b, _a);

    vec![
        Operation::new("q", vec![]),
        Operation::new("rg", vec![br.into(), bg.into(), bb.into()]),
        Operation::new(
            "re",
            vec![pdf_x.into(), pdf_y.into(), w.into(), h.into()],
        ),
        Operation::new("f", vec![]),
        Operation::new("Q", vec![]),
    ]
}

/// Ensure the page has a /Helvetica font resource available. Returns the name
/// bytes used (e.g. b"F1" or b"Helv"). If a built-in font already exists we
/// try to reuse it; otherwise we add one.
fn ensure_font_resource(doc: &mut Document, page_id: ObjectId) -> Vec<u8> {
    // Try to find an existing Type1 font on the page
    if let Ok(page_obj) = doc.get_object(page_id) {
        if let Ok(dict) = page_obj.as_dict() {
            if let Ok(resources) = dict.get(b"Resources") {
                if let Ok(res_dict) = resources.as_dict() {
                    if let Ok(fonts) = res_dict.get(b"Font") {
                        if let Ok(font_dict) = fonts.as_dict() {
                            // Return the first font name we find
                            if let Some((name, _)) = font_dict.iter().next() {
                                return name.clone();
                            }
                        }
                    }
                }
            }
        }
    }

    // No font found -- add Helvetica as /F1
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
    });

    // We need to add this font to the page's Resources/Font dict.
    // Since borrowing is tricky, we collect what we need, then mutate.
    let font_name = b"F1".to_vec();

    if let Ok(page_obj) = doc.get_object_mut(page_id) {
        if let Ok(dict) = page_obj.as_dict_mut() {
            // Ensure Resources dict exists
            if dict.get(b"Resources").is_err() {
                dict.set("Resources", dictionary! {});
            }
            if let Ok(resources) = dict.get_mut(b"Resources") {
                if let Ok(res_dict) = resources.as_dict_mut() {
                    // Ensure Font sub-dict exists
                    if res_dict.get(b"Font").is_err() {
                        res_dict.set("Font", dictionary! {});
                    }
                    if let Ok(fonts) = res_dict.get_mut(b"Font") {
                        if let Ok(font_dict) = fonts.as_dict_mut() {
                            font_dict.set("F1", Object::Reference(font_id));
                        }
                    }
                }
            }
        }
    }

    font_name
}

// ── Main export function ─────────────────────────────────────────────

/// Export a modified PDF by applying overlay operations to the original file.
///
/// * `pdf_path`     - Path to the original PDF on disk
/// * `ops`          - The list of editing operations from the frontend
/// * `blocks`       - Block metadata (id, page, bbox) so targeted ops can look up geometry
/// * `page_heights` - Per-page heights as seen by the frontend (CSS pixels / viewport units).
///                    Used together with the PDF MediaBox to convert coordinates.
pub fn export_overlay_pdf(
    pdf_path: &Path,
    ops: &[ExportOp],
    blocks: &[ExportBlock],
    page_heights: &[f64],
) -> Result<Vec<u8>, String> {
    let mut doc =
        Document::load(pdf_path).map_err(|e| format!("Failed to load PDF: {}", e))?;

    // Build a quick lookup: block id -> &ExportBlock
    let block_map: HashMap<&str, &ExportBlock> =
        blocks.iter().map(|b| (b.id.as_str(), b)).collect();

    // Collect page object IDs in order (1-indexed in lopdf).
    let page_ids: Vec<ObjectId> = doc.page_iter().collect();
    let num_pages = page_ids.len();

    // Pre-compute PDF page dimensions and ensure font resources.
    // We clone page_ids so we can mutate doc in ensure_font_resource.
    let mut page_dims: Vec<(f64, f64)> = Vec::with_capacity(num_pages);
    let mut page_fonts: Vec<Vec<u8>> = Vec::with_capacity(num_pages);

    for &pid in &page_ids {
        page_dims.push(get_page_media_box(&doc, pid));
    }
    for &pid in &page_ids {
        page_fonts.push(ensure_font_resource(&mut doc, pid));
    }

    // Per-page extra operations to append
    let mut extra_ops: Vec<Vec<Operation>> = vec![Vec::new(); num_pages];

    // Helper: convert frontend bbox (top-left origin, viewport units) to
    // PDF coordinates (bottom-left origin, PDF points).
    let convert_bbox =
        |bbox: &BBox, page_idx: usize| -> (f64, f64, f64, f64) {
            let (pdf_w, pdf_h) = page_dims[page_idx];
            let vp_h = page_heights
                .get(page_idx)
                .copied()
                .unwrap_or(pdf_h);
            let scale_x = pdf_w / vp_h * (vp_h / vp_h); // simplified: pdf_w / vp_w but we assume aspect preserving, so use height ratio
            // The frontend renders the PDF scaled so that the viewport height matches
            // the rendered page height. Width scales proportionally. We assume
            // viewport width == pdf_w * (vp_h / pdf_h).
            let scale = pdf_h / vp_h;
            let sx = bbox.x * scale;
            let sy = bbox.y * scale;
            let sw = bbox.w * scale;
            let sh = bbox.h * scale;
            // Flip y: PDF origin is bottom-left
            let pdf_y = pdf_h - sy - sh;
            let _ = scale_x; // suppress unused
            (sx, pdf_y, sw, sh)
        };

    for op in ops {
        match op {
            ExportOp::Delete { target_id } => {
                if let Some(block) = block_map.get(target_id.as_str()) {
                    let page_idx = (block.page as usize).saturating_sub(1);
                    if page_idx < num_pages {
                        let (px, py, pw, ph) = convert_bbox(&block.bbox, page_idx);
                        extra_ops[page_idx].extend(white_rect_ops(px, py, pw, ph));
                    }
                }
            }
            ExportOp::ReplaceText { target_id, text } => {
                if let Some(block) = block_map.get(target_id.as_str()) {
                    let page_idx = (block.page as usize).saturating_sub(1);
                    if page_idx < num_pages {
                        let (px, py, pw, ph) = convert_bbox(&block.bbox, page_idx);
                        // White-out the original
                        extra_ops[page_idx].extend(white_rect_ops(px, py, pw, ph));
                        // Draw replacement text at the top-left of the block area
                        let font_size = (ph * 0.7).min(14.0).max(6.0);
                        let text_y = py + ph - font_size; // top of rect in PDF coords
                        let font_name = &page_fonts[page_idx];
                        extra_ops[page_idx]
                            .extend(text_ops(px + 2.0, text_y, text, font_size, font_name));
                    }
                }
            }
            ExportOp::InsertText {
                page,
                at,
                text,
                font_size,
            } => {
                let page_idx = (*page as usize).saturating_sub(1);
                if page_idx < num_pages {
                    let (pdf_w, pdf_h) = page_dims[page_idx];
                    let vp_h = page_heights.get(page_idx).copied().unwrap_or(pdf_h);
                    let scale = pdf_h / vp_h;
                    let px = at.x * scale;
                    let py = pdf_h - at.y * scale; // flip y
                    let fs = font_size.unwrap_or(12.0);
                    let font_name = &page_fonts[page_idx];
                    extra_ops[page_idx].extend(text_ops(px, py, text, fs, font_name));
                    let _ = pdf_w; // suppress unused
                }
            }
            ExportOp::Highlight { page, rects, color } => {
                let page_idx = (*page as usize).saturating_sub(1);
                if page_idx < num_pages {
                    let (r, g, b, a) = color
                        .as_deref()
                        .map(parse_hex_color)
                        .unwrap_or((1.0, 1.0, 0.0, 0.35));
                    for rect in rects {
                        let (px, py, pw, ph) = convert_bbox(rect, page_idx);
                        extra_ops[page_idx]
                            .extend(highlight_rect_ops(px, py, pw, ph, r, g, b, a));
                    }
                }
            }
            ExportOp::Move { .. } => {
                // Visual-only overlay; skip for V1 PDF export
            }
            ExportOp::Comment { .. } => {
                // Comments are UI-only; skip for PDF export
            }
        }
    }

    // Now append the extra operations to each page's content stream.
    for (page_idx, page_extra) in extra_ops.into_iter().enumerate() {
        if page_extra.is_empty() {
            continue;
        }

        let page_id = page_ids[page_idx];

        // Get the existing content stream for the page
        let existing_content = doc
            .get_page_content(page_id)
            .map_err(|e| format!("Failed to read page {} content: {}", page_idx + 1, e))?;

        let mut content = Content::decode(&existing_content)
            .map_err(|e| format!("Failed to decode page {} content: {}", page_idx + 1, e))?;

        // Append our overlay operations
        content.operations.extend(page_extra);

        // Encode back and replace the page content
        let encoded = content.encode()
            .map_err(|e| format!("Failed to encode page {} content: {}", page_idx + 1, e))?;

        // Add a new stream object and set it as the page's Contents
        let stream = lopdf::Stream::new(dictionary! {}, encoded);
        let stream_id = doc.add_object(Object::Stream(stream));

        // Update page's Contents reference
        if let Ok(page_obj) = doc.get_object_mut(page_id) {
            if let Ok(dict) = page_obj.as_dict_mut() {
                dict.set("Contents", Object::Reference(stream_id));
            }
        }
    }

    // Serialize the modified PDF to bytes
    let mut output = Vec::new();
    doc.save_to(&mut output)
        .map_err(|e| format!("Failed to serialize PDF: {}", e))?;

    Ok(output)
}
