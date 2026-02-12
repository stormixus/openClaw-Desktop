use crate::document::types::*;

/// Parse Tesseract TSV output into PdfWord items.
/// TSV columns: level, page_num, block_num, par_num, line_num, word_num, left, top, width, height, conf, text
pub fn parse_tsv_words(tsv: &str, page: u32) -> Vec<PdfWord> {
    let mut words = Vec::new();
    let mut index = 0;

    for line in tsv.lines().skip(1) {
        // Skip header line
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 12 {
            continue;
        }

        // Parse confidence
        let conf = parts[10].trim().parse::<f64>().unwrap_or(-1.0);
        if conf < 0.0 {
            continue;
        }

        // Parse text
        let text = parts[11].trim();
        if text.is_empty() {
            continue;
        }

        // Parse bbox
        let left = parts[6].trim().parse::<f64>().unwrap_or(0.0);
        let top = parts[7].trim().parse::<f64>().unwrap_or(0.0);
        let width = parts[8].trim().parse::<f64>().unwrap_or(0.0);
        let height = parts[9].trim().parse::<f64>().unwrap_or(0.0);

        words.push(PdfWord {
            id: format!("w-{}-{}", page, index),
            page,
            text: text.to_string(),
            bbox: BBox {
                x: left,
                y: top,
                w: width,
                h: height,
            },
            conf,
        });
        index += 1;
    }

    words
}

/// Group words into lines by y-coordinate clustering.
/// Words that vertically overlap > 50% are considered on the same line.
pub fn group_words_into_lines(words: &[PdfWord], page: u32) -> Vec<PdfLine> {
    if words.is_empty() {
        return Vec::new();
    }

    let mut sorted_words: Vec<_> = words.iter().collect();
    sorted_words.sort_by(|a, b| a.bbox.y.partial_cmp(&b.bbox.y).unwrap());

    let mut lines: Vec<Vec<&PdfWord>> = Vec::new();
    let mut current_line: Vec<&PdfWord> = vec![sorted_words[0]];

    for word in sorted_words.iter().skip(1) {
        let prev = current_line.last().unwrap();

        // Calculate vertical overlap
        let prev_y1 = prev.bbox.y;
        let prev_y2 = prev.bbox.y + prev.bbox.h;
        let word_y1 = word.bbox.y;
        let word_y2 = word.bbox.y + word.bbox.h;

        let overlap_start = prev_y1.max(word_y1);
        let overlap_end = prev_y2.min(word_y2);
        let overlap_height = (overlap_end - overlap_start).max(0.0);

        let prev_height = prev.bbox.h;
        let word_height = word.bbox.h;
        let min_height = prev_height.min(word_height);

        let overlap_ratio = if min_height > 0.0 {
            overlap_height / min_height
        } else {
            0.0
        };

        if overlap_ratio > 0.5 {
            current_line.push(word);
        } else {
            lines.push(current_line);
            current_line = vec![word];
        }
    }
    lines.push(current_line);

    // Convert to PdfLine structs
    lines
        .into_iter()
        .enumerate()
        .map(|(i, mut line_words)| {
            // Sort words in line by x position
            line_words.sort_by(|a, b| a.bbox.x.partial_cmp(&b.bbox.x).unwrap());

            // Compute merged bbox
            let min_x = line_words.iter().map(|w| w.bbox.x).fold(f64::INFINITY, f64::min);
            let max_x = line_words.iter().map(|w| w.bbox.x + w.bbox.w).fold(f64::NEG_INFINITY, f64::max);
            let min_y = line_words.iter().map(|w| w.bbox.y).fold(f64::INFINITY, f64::min);
            let max_y = line_words.iter().map(|w| w.bbox.y + w.bbox.h).fold(f64::NEG_INFINITY, f64::max);

            // Concatenate text with spaces
            let text = line_words
                .iter()
                .map(|w| w.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");

            let word_ids = line_words.iter().map(|w| w.id.clone()).collect();

            PdfLine {
                id: format!("l-{}-{}", page, i),
                page,
                word_ids,
                bbox: BBox {
                    x: min_x,
                    y: min_y,
                    w: max_x - min_x,
                    h: max_y - min_y,
                },
                text,
            }
        })
        .collect()
}

/// Group lines into blocks (paragraphs) based on vertical gap.
/// Lines separated by more than 1.5x median line-height form a new block.
pub fn group_lines_into_blocks(lines: &[PdfLine], page: u32, page_height: f64) -> Vec<PdfBlock> {
    if lines.is_empty() {
        return Vec::new();
    }

    let mut sorted_lines: Vec<_> = lines.iter().collect();
    sorted_lines.sort_by(|a, b| a.bbox.y.partial_cmp(&b.bbox.y).unwrap());

    // Compute median line height
    let mut heights: Vec<f64> = sorted_lines.iter().map(|l| l.bbox.h).collect();
    heights.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median_height = if heights.is_empty() {
        20.0
    } else {
        heights[heights.len() / 2]
    };

    let gap_threshold = 1.5 * median_height;

    let mut blocks: Vec<Vec<&PdfLine>> = Vec::new();
    let mut current_block: Vec<&PdfLine> = vec![sorted_lines[0]];

    for line in sorted_lines.iter().skip(1) {
        let prev = current_block.last().unwrap();
        let prev_bottom = prev.bbox.y + prev.bbox.h;
        let gap = line.bbox.y - prev_bottom;

        if gap < gap_threshold {
            current_block.push(line);
        } else {
            blocks.push(current_block);
            current_block = vec![line];
        }
    }
    blocks.push(current_block);

    // Convert to PdfBlock structs
    blocks
        .into_iter()
        .enumerate()
        .map(|(i, block_lines)| {
            // Compute merged bbox
            let min_x = block_lines.iter().map(|l| l.bbox.x).fold(f64::INFINITY, f64::min);
            let max_x = block_lines.iter().map(|l| l.bbox.x + l.bbox.w).fold(f64::NEG_INFINITY, f64::max);
            let min_y = block_lines.iter().map(|l| l.bbox.y).fold(f64::INFINITY, f64::min);
            let max_y = block_lines.iter().map(|l| l.bbox.y + l.bbox.h).fold(f64::NEG_INFINITY, f64::max);

            let bbox = BBox {
                x: min_x,
                y: min_y,
                w: max_x - min_x,
                h: max_y - min_y,
            };

            // Detect block kind
            let kind = detect_block_kind(&bbox, median_height, page_height, block_lines.len());

            // Concatenate line texts with newlines
            let text = block_lines
                .iter()
                .map(|l| l.text.as_str())
                .collect::<Vec<_>>()
                .join("\n");

            let line_ids = block_lines.iter().map(|l| l.id.clone()).collect();

            PdfBlock {
                id: format!("b-{}-{}", page, i),
                page,
                kind,
                line_ids,
                bbox,
                text,
            }
        })
        .collect()
}

/// Detect block kind based on position and size heuristics.
fn detect_block_kind(block_bbox: &BBox, _median_line_height: f64, page_height: f64, line_count: usize) -> String {
    let y_percent = (block_bbox.y / page_height) * 100.0;
    let y_bottom_percent = ((block_bbox.y + block_bbox.h) / page_height) * 100.0;

    if y_percent < 15.0 && line_count <= 2 {
        "title".to_string()
    } else if y_percent < 8.0 {
        "header".to_string()
    } else if y_bottom_percent > 92.0 {
        "footer".to_string()
    } else {
        "paragraph".to_string()
    }
}

/// Build complete layout from TSV output for a single page.
pub fn build_layout(tsv: &str, page: u32, page_height: f64) -> PdfLayoutResult {
    let words = parse_tsv_words(tsv, page);
    let lines = group_words_into_lines(&words, page);
    let blocks = group_lines_into_blocks(&lines, page, page_height);
    PdfLayoutResult { words, lines, blocks }
}
