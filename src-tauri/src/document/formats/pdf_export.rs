use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

use lopdf::content::{Content, Operation};
use lopdf::{dictionary, text_string, Dictionary, Document, Object, ObjectId};

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
        #[serde(rename = "fontSize")]
        font_size: Option<f64>,
        #[serde(rename = "rasterJpeg")]
        raster_jpeg: Option<String>,
        #[serde(rename = "rasterWidth")]
        raster_width: Option<u32>,
        #[serde(rename = "rasterHeight")]
        raster_height: Option<u32>,
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
    #[serde(rename = "resize")]
    Resize {
        #[serde(rename = "targetId")]
        target_id: String,
        dw: f64,
        dh: f64,
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
    #[serde(rename = "fontSize")]
    pub font_size: Option<f64>,
    #[serde(rename = "bgColor")]
    pub bg_color: Option<String>,
    #[serde(rename = "fontName")]
    pub font_name: Option<String>,
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

/// Build PDF content operations to draw a colored rectangle covering a bbox area.
/// Coordinates are in PDF space (origin bottom-left).
/// `r`, `g`, `b` are in 0.0..1.0 range.
fn bg_rect_ops(pdf_x: f64, pdf_y: f64, w: f64, h: f64, r: f64, g: f64, b: f64) -> Vec<Operation> {
    vec![
        Operation::new("q", vec![]),                          // save graphics state
        Operation::new("rg", vec![r.into(), g.into(), b.into()]), // fill color
        Operation::new(
            "re",
            vec![pdf_x.into(), pdf_y.into(), w.into(), h.into()],
        ),
        Operation::new("f", vec![]),  // fill
        Operation::new("Q", vec![]), // restore graphics state
    ]
}

/// Parse an optional hex color string into (r, g, b) in 0.0..1.0, defaulting to white.
fn bg_color_rgb(hex: Option<&str>) -> (f64, f64, f64) {
    match hex {
        Some(h) => {
            let h = h.trim_start_matches('#');
            if h.len() >= 6 {
                let r = u8::from_str_radix(&h[0..2], 16).unwrap_or(255) as f64 / 255.0;
                let g = u8::from_str_radix(&h[2..4], 16).unwrap_or(255) as f64 / 255.0;
                let b = u8::from_str_radix(&h[4..6], 16).unwrap_or(255) as f64 / 255.0;
                (r, g, b)
            } else {
                (1.0, 1.0, 1.0)
            }
        }
        None => (1.0, 1.0, 1.0),
    }
}

/// Build PDF content operations to draw text at a given position.
/// `pdf_x`, `pdf_y` are in PDF coordinate space.
fn text_ops(pdf_x: f64, pdf_y: f64, text: &str, font_size: f64, font_name: &[u8]) -> Vec<Operation> {
    vec![
        Operation::new("q", vec![]),
        Operation::new("BT", vec![]),
        Operation::new(
            "Tf",
            vec![Object::Name(font_name.to_vec()), font_size.into()],
        ),
        Operation::new("rg", vec![0.0.into(), 0.0.into(), 0.0.into()]), // fill black
        Operation::new("Td", vec![pdf_x.into(), pdf_y.into()]),
        Operation::new("Tj", vec![text_string(text)]),
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

fn resolve_dict_ref<'a>(doc: &'a Document, obj: &'a Object) -> Option<&'a lopdf::Dictionary> {
    match obj {
        Object::Dictionary(dict) => Some(dict),
        Object::Reference(id) => doc.get_object(*id).ok()?.as_dict().ok(),
        _ => None,
    }
}

#[derive(Clone, Debug)]
struct FontCandidate {
    key: Vec<u8>,
    aliases: HashSet<String>,
    score: i32,
}

fn normalize_font_token(token: &str) -> String {
    token
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect()
}

fn push_alias(aliases: &mut HashSet<String>, raw: &str) {
    let normalized = normalize_font_token(raw);
    if !normalized.is_empty() {
        aliases.insert(normalized);
    }
}

fn score_font_name(name: &str) -> i32 {
    let token = name.to_ascii_lowercase();
    let is_korean = [
        "korea",
        "hangul",
        "nanum",
        "malgun",
        "gulim",
        "dotum",
        "batang",
        "gothickr",
        "myungjo",
        "notosanscjkkr",
        "notoserifcjkkr",
        "sourcehansansk",
        "sourcehanserifk",
    ]
    .iter()
    .any(|k| token.contains(k));
    if is_korean {
        return 90;
    }

    let is_cjk = [
        "cjk",
        "heiti",
        "songti",
        "simsun",
        "simhei",
        "fangsong",
        "kaiti",
        "hiragino",
        "kozuka",
    ]
    .iter()
    .any(|k| token.contains(k));
    if is_cjk {
        return 45;
    }

    let is_latin = ["helvetica", "times", "courier", "arial"]
        .iter()
        .any(|k| token.contains(k));
    if is_latin {
        return 10;
    }

    0
}

fn collect_font_aliases_and_score(
    doc: &Document,
    font_dict: &Dictionary,
    aliases: &mut HashSet<String>,
) -> i32 {
    let mut score = 0;

    if let Ok(subtype) = font_dict.get(b"Subtype").and_then(Object::as_name_str) {
        if subtype == "Type0" {
            score += 40;
        } else if subtype == "CIDFontType0" || subtype == "CIDFontType2" {
            score += 25;
        }
    }

    if let Ok(encoding) = font_dict.get(b"Encoding").and_then(Object::as_name_str) {
        let enc = encoding.to_ascii_lowercase();
        if enc.contains("identity-h") || enc.contains("identity-v") {
            score += 30;
        } else if enc.contains("uni") || enc.contains("ucs") {
            score += 18;
        }
    }

    if let Ok(base_font) = font_dict.get(b"BaseFont").and_then(Object::as_name) {
        let raw = String::from_utf8_lossy(base_font);
        push_alias(aliases, &raw);
        if let Some((_, suffix)) = raw.split_once('+') {
            push_alias(aliases, suffix);
            score += score_font_name(suffix);
        } else {
            score += score_font_name(&raw);
        }
    }

    if let Ok(desc_fonts) = font_dict.get(b"DescendantFonts").and_then(Object::as_array) {
        for desc in desc_fonts {
            let Some(desc_dict) = resolve_dict_ref(doc, desc) else {
                continue;
            };

            if let Ok(desc_base) = desc_dict.get(b"BaseFont").and_then(Object::as_name) {
                let raw = String::from_utf8_lossy(desc_base);
                push_alias(aliases, &raw);
                if let Some((_, suffix)) = raw.split_once('+') {
                    push_alias(aliases, suffix);
                    score += score_font_name(suffix);
                } else {
                    score += score_font_name(&raw);
                }
            }

            if let Ok(cid_info_obj) = desc_dict.get(b"CIDSystemInfo") {
                if let Some(cid_info) = resolve_dict_ref(doc, cid_info_obj) {
                    if let Ok(ordering) = cid_info.get(b"Ordering").and_then(Object::as_str) {
                        let ord = String::from_utf8_lossy(ordering).to_ascii_lowercase();
                        push_alias(aliases, &ord);
                        if ord.contains("korea") {
                            score += 100;
                        } else if ord.contains("japan") || ord.contains("gb") || ord.contains("cns") {
                            score += 40;
                        }
                    }
                }
            }
        }
    }

    score
}

/// Resolve page resources, following inherited /Parent dictionaries when needed.
fn get_page_resources_dict<'a>(doc: &'a Document, page_id: ObjectId) -> Option<&'a lopdf::Dictionary> {
    let mut current_id = page_id;
    loop {
        let page_obj = doc.get_object(current_id).ok()?;
        let dict = page_obj.as_dict().ok()?;

        if let Ok(resources_obj) = dict.get(b"Resources") {
            if let Some(resources_dict) = resolve_dict_ref(doc, resources_obj) {
                return Some(resources_dict);
            }
        }

        let parent = match dict.get(b"Parent").ok()? {
            Object::Reference(pid) => *pid,
            _ => return None,
        };
        current_id = parent;
    }
}

fn list_page_font_candidates(doc: &Document, page_id: ObjectId) -> Vec<FontCandidate> {
    let Some(resources) = get_page_resources_dict(doc, page_id) else {
        return Vec::new();
    };
    let Ok(fonts_obj) = resources.get(b"Font") else {
        return Vec::new();
    };
    let Some(font_dict) = resolve_dict_ref(doc, fonts_obj) else {
        return Vec::new();
    };

    let mut candidates: Vec<FontCandidate> = Vec::new();
    for (name, font_obj) in font_dict.iter() {
        let mut aliases = HashSet::new();
        let key_name = String::from_utf8_lossy(name);
        push_alias(&mut aliases, &key_name);

        let mut score = 0;
        if let Some(font_entry) = resolve_dict_ref(doc, font_obj) {
            score += collect_font_aliases_and_score(doc, font_entry, &mut aliases);
        }

        candidates.push(FontCandidate {
            key: name.clone(),
            aliases,
            score,
        });
    }
    candidates.sort_by(|a, b| b.score.cmp(&a.score));
    candidates
}

/// Ensure a fallback font exists on the page resources and return its resource key.
/// We clone the effective (possibly inherited) resource dictionary onto the page to avoid
/// breaking existing XObject/color resources while adding the fallback font.
fn ensure_fallback_font_resource(doc: &mut Document, page_id: ObjectId) -> Vec<u8> {
    let fallback_name = b"OCF1".to_vec();
    let fallback_font_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
    });

    let mut resources = get_page_resources_dict(doc, page_id)
        .cloned()
        .unwrap_or_else(Dictionary::new);

    let mut font_dict = resources
        .get(b"Font")
        .ok()
        .and_then(|font_obj| resolve_dict_ref(doc, font_obj))
        .cloned()
        .unwrap_or_else(Dictionary::new);

    font_dict.set(fallback_name.clone(), Object::Reference(fallback_font_id));
    resources.set("Font", Object::Dictionary(font_dict));

    if let Ok(page_obj) = doc.get_object_mut(page_id) {
        if let Ok(page_dict) = page_obj.as_dict_mut() {
            page_dict.set("Resources", Object::Dictionary(resources));
        }
    }

    fallback_name
}

fn decode_base64_data_url(input: &str) -> Result<Vec<u8>, String> {
    let raw = if let Some(idx) = input.find(',') {
        &input[idx + 1..]
    } else {
        input
    };
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(raw.trim())
        .map_err(|e| format!("Failed to decode text raster image: {}", e))
}

fn image_ops(
    pdf_x: f64,
    pdf_y: f64,
    pdf_w: f64,
    pdf_h: f64,
    image_name: &[u8],
) -> Vec<Operation> {
    vec![
        Operation::new("q", vec![]),
        Operation::new(
            "cm",
            vec![
                pdf_w.into(),
                0.0.into(),
                0.0.into(),
                pdf_h.into(),
                pdf_x.into(),
                pdf_y.into(),
            ],
        ),
        Operation::new("Do", vec![Object::Name(image_name.to_vec())]),
        Operation::new("Q", vec![]),
    ]
}

type Matrix = [f64; 6];

fn matrix_identity() -> Matrix {
    [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
}

fn matrix_is_identity(m: Matrix) -> bool {
    (m[0] - 1.0).abs() < 1e-8
        && m[1].abs() < 1e-8
        && m[2].abs() < 1e-8
        && (m[3] - 1.0).abs() < 1e-8
        && m[4].abs() < 1e-6
        && m[5].abs() < 1e-6
}

/// Row-vector affine concatenation: CTM' = CTM * M.
fn matrix_concat(ctm: Matrix, m: Matrix) -> Matrix {
    [
        ctm[0] * m[0] + ctm[1] * m[2],
        ctm[0] * m[1] + ctm[1] * m[3],
        ctm[2] * m[0] + ctm[3] * m[2],
        ctm[2] * m[1] + ctm[3] * m[3],
        ctm[4] * m[0] + ctm[5] * m[2] + m[4],
        ctm[4] * m[1] + ctm[5] * m[3] + m[5],
    ]
}

fn matrix_inverse(m: Matrix) -> Option<Matrix> {
    let det = m[0] * m[3] - m[1] * m[2];
    if det.abs() < 1e-12 {
        return None;
    }
    let inv_a = m[3] / det;
    let inv_b = -m[1] / det;
    let inv_c = -m[2] / det;
    let inv_d = m[0] / det;
    let inv_e = (m[2] * m[5] - m[3] * m[4]) / det;
    let inv_f = (m[4] * m[1] - m[5] * m[0]) / det;
    Some([inv_a, inv_b, inv_c, inv_d, inv_e, inv_f])
}

fn final_page_ctm(content: &Content) -> Matrix {
    let mut ctm = matrix_identity();
    let mut stack: Vec<Matrix> = Vec::new();

    for op in &content.operations {
        match op.operator.as_str() {
            "q" => stack.push(ctm),
            "Q" => {
                if let Some(prev) = stack.pop() {
                    ctm = prev;
                } else {
                    ctm = matrix_identity();
                }
            }
            "cm" => {
                if op.operands.len() >= 6 {
                    let a = get_number(&op.operands[0]).unwrap_or(1.0);
                    let b = get_number(&op.operands[1]).unwrap_or(0.0);
                    let c = get_number(&op.operands[2]).unwrap_or(0.0);
                    let d = get_number(&op.operands[3]).unwrap_or(1.0);
                    let e = get_number(&op.operands[4]).unwrap_or(0.0);
                    let f = get_number(&op.operands[5]).unwrap_or(0.0);
                    ctm = matrix_concat(ctm, [a, b, c, d, e, f]);
                }
            }
            _ => {}
        }
    }

    ctm
}

fn add_jpeg_overlay_xobject(
    doc: &mut Document,
    page_id: ObjectId,
    image_name: &[u8],
    jpeg_bytes: Vec<u8>,
    image_width: u32,
    image_height: u32,
) -> Result<(), String> {
    let image_stream = lopdf::Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Width" => i64::from(image_width),
            "Height" => i64::from(image_height),
            "ColorSpace" => "DeviceRGB",
            "BitsPerComponent" => 8,
            "Filter" => "DCTDecode",
        },
        jpeg_bytes,
    );
    let image_id = doc.add_object(Object::Stream(image_stream));

    let mut resources = get_page_resources_dict(doc, page_id)
        .cloned()
        .unwrap_or_else(Dictionary::new);
    let mut xobject_dict = resources
        .get(b"XObject")
        .ok()
        .and_then(|obj| resolve_dict_ref(doc, obj))
        .cloned()
        .unwrap_or_else(Dictionary::new);
    xobject_dict.set(image_name.to_vec(), Object::Reference(image_id));
    resources.set("XObject", Object::Dictionary(xobject_dict));

    if let Ok(page_obj) = doc.get_object_mut(page_id) {
        if let Ok(page_dict) = page_obj.as_dict_mut() {
            page_dict.set("Resources", Object::Dictionary(resources));
            return Ok(());
        }
    }
    Err("Failed to attach image XObject to page resources".to_string())
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

    // Pre-compute PDF page dimensions and available font candidates.
    let mut page_dims: Vec<(f64, f64)> = Vec::with_capacity(num_pages);
    let mut page_font_lists: Vec<Vec<FontCandidate>> = Vec::with_capacity(num_pages);

    for &pid in &page_ids {
        page_dims.push(get_page_media_box(&doc, pid));
        let mut fonts = list_page_font_candidates(&doc, pid);
        if fonts.is_empty() {
            let fallback = ensure_fallback_font_resource(&mut doc, pid);
            let mut aliases = HashSet::new();
            let fallback_name = String::from_utf8_lossy(&fallback).to_string();
            push_alias(&mut aliases, &fallback_name);
            fonts.push(FontCandidate {
                key: fallback,
                aliases,
                score: 0,
            });
        }
        page_font_lists.push(fonts);
    }

    // Per-page extra operations to append
    let mut extra_ops: Vec<Vec<Operation>> = vec![Vec::new(); num_pages];
    let mut image_counter: u32 = 0;

    // Helper: convert frontend bbox (top-left origin, viewport units) to
    // PDF coordinates (bottom-left origin, PDF points).
    let convert_bbox =
        |bbox: &BBox, page_idx: usize| -> (f64, f64, f64, f64) {
            let (_, pdf_h) = page_dims[page_idx];
            let vp_h = page_heights
                .get(page_idx)
                .copied()
                .unwrap_or(pdf_h);
            let scale = pdf_h / vp_h;
            let sx = bbox.x * scale;
            let sy = bbox.y * scale;
            let sw = bbox.w * scale;
            let sh = bbox.h * scale;
            // Flip y: PDF origin is bottom-left
            let pdf_y = pdf_h - sy - sh;
            (sx, pdf_y, sw, sh)
        };

    let pick_font_name = |page_idx: usize, preferred: Option<&str>, text: &str| -> Option<Vec<u8>> {
        let page_fonts = page_font_lists.get(page_idx)?;
        if let Some(pref) = preferred {
            let pref_norm = normalize_font_token(pref);
            if !pref_norm.is_empty() {
                if let Some(candidate) = page_fonts
                    .iter()
                    .find(|candidate| candidate.aliases.contains(&pref_norm))
                {
                    return Some(candidate.key.clone());
                }
            }
            let pref_bytes = pref.as_bytes();
            if let Some(candidate) = page_fonts
                .iter()
                .find(|candidate| candidate.key.as_slice() == pref_bytes)
            {
                return Some(candidate.key.clone());
            }
        }

        if !text.is_ascii() {
            if let Some(candidate) = page_fonts
                .iter()
                .max_by_key(|candidate| candidate.score)
            {
                return Some(candidate.key.clone());
            }
        }

        page_fonts.first().map(|candidate| candidate.key.clone())
    };

    for op in ops {
        match op {
            ExportOp::Delete { target_id } => {
                if let Some(block) = block_map.get(target_id.as_str()) {
                    let page_idx = (block.page as usize).saturating_sub(1);
                    if page_idx < num_pages {
                        let (px, py, pw, ph) = convert_bbox(&block.bbox, page_idx);
                        let (r, g, b) = bg_color_rgb(block.bg_color.as_deref());
                        extra_ops[page_idx].extend(bg_rect_ops(px, py, pw, ph, r, g, b));
                    }
                }
            }
            ExportOp::ReplaceText {
                target_id,
                text,
                font_size,
                raster_jpeg,
                raster_width,
                raster_height,
            } => {
                if let Some(block) = block_map.get(target_id.as_str()) {
                    let page_idx = (block.page as usize).saturating_sub(1);
                    if page_idx < num_pages {
                        let (px, py, pw, ph) = convert_bbox(&block.bbox, page_idx);
                        // Cover the original with detected background color
                        let (r, g, b) = bg_color_rgb(block.bg_color.as_deref());
                        extra_ops[page_idx].extend(bg_rect_ops(px, py, pw, ph, r, g, b));

                        // Preferred path: draw browser-rasterized text image so Unicode output
                        // does not depend on source PDF font cmap quirks.
                        if let (Some(raster), Some(img_w), Some(img_h)) =
                            (raster_jpeg.as_deref(), *raster_width, *raster_height)
                        {
                            if !raster.trim().is_empty() && img_w > 0 && img_h > 0 {
                                if let Ok(jpeg_bytes) = decode_base64_data_url(raster) {
                                    let image_name = format!("OCIMG{}", image_counter).into_bytes();
                                    image_counter = image_counter.saturating_add(1);
                                    let page_id = page_ids[page_idx];
                                    if add_jpeg_overlay_xobject(
                                        &mut doc,
                                        page_id,
                                        &image_name,
                                        jpeg_bytes,
                                        img_w,
                                        img_h,
                                    )
                                    .is_ok()
                                    {
                                        extra_ops[page_idx]
                                            .extend(image_ops(px, py, pw, ph, &image_name));
                                        continue;
                                    }
                                }
                            }
                        }

                        // Use detected font_size from OCR, fallback to bbox-based estimate
                        let (pdf_w, pdf_h) = page_dims[page_idx];
                        let vp_h = page_heights.get(page_idx).copied().unwrap_or(pdf_h);
                        let scale = pdf_h / vp_h;
                        let font_size = font_size
                            .map(|fs| (fs * scale).max(6.0))
                            .or_else(|| block.font_size.map(|fs| (fs * scale).max(6.0)))
                            .unwrap_or_else(|| (ph * 0.7).min(14.0).max(6.0));
                        let text_y = py + ph - font_size; // top of rect in PDF coords
                        let _ = pw; // suppress unused
                        let _ = pdf_w;
                        if let Some(font_name) = pick_font_name(page_idx, block.font_name.as_deref(), text) {
                            extra_ops[page_idx]
                                .extend(text_ops(px + 2.0, text_y, text, font_size, &font_name));
                        }
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
                    if let Some(font_name) = pick_font_name(page_idx, None, text) {
                        extra_ops[page_idx].extend(text_ops(px, py, text, fs, &font_name));
                    }
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
            ExportOp::Resize { .. } => {
                // Resizing is already reflected by adjusted block bboxes from frontend.
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

        // Some PDFs leave a non-identity CTM at the end of their content stream.
        // Neutralize it so overlay coordinates stay in page user space.
        let final_ctm = final_page_ctm(&content);
        if let Some(inv) = matrix_inverse(final_ctm) {
            if matrix_is_identity(final_ctm) {
                content.operations.extend(page_extra);
            } else {
                content.operations.push(Operation::new("q", vec![]));
                content.operations.push(Operation::new(
                    "cm",
                    vec![
                        inv[0].into(),
                        inv[1].into(),
                        inv[2].into(),
                        inv[3].into(),
                        inv[4].into(),
                        inv[5].into(),
                    ],
                ));
                content.operations.extend(page_extra);
                content.operations.push(Operation::new("Q", vec![]));
            }
        } else {
            // If CTM is singular, fall back to appending directly.
            content.operations.extend(page_extra);
        }

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
