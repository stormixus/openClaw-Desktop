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

            let line_height = max_y - min_y;
            PdfLine {
                id: format!("l-{}-{}", page, i),
                page,
                word_ids,
                bbox: BBox {
                    x: min_x,
                    y: min_y,
                    w: max_x - min_x,
                    h: line_height,
                },
                text,
                font_size: line_height * 0.85,
            }
        })
        .collect()
}

/// Group lines into blocks with fine-grained segmentation.
///
/// Split criteria (any triggers a new block):
/// - Vertical gap exceeds 0.5× median line-height
/// - Left margin shifts by more than 15% of page width (detects table cells, indentation)
/// - Line height changes by more than 35% (different font size → different section)
/// - Block already has MAX_LINES_PER_BLOCK lines
pub fn group_lines_into_blocks(lines: &[PdfLine], page: u32, page_height: f64) -> Vec<PdfBlock> {
    if lines.is_empty() {
        return Vec::new();
    }

    const MAX_LINES_PER_BLOCK: usize = 4;

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

    // Estimate page width from the widest line (OCR pixel coords)
    let page_width = sorted_lines
        .iter()
        .map(|l| l.bbox.x + l.bbox.w)
        .fold(0.0_f64, f64::max);

    let gap_threshold = 0.5 * median_height;
    let x_shift_threshold = page_width * 0.15; // 15% of page width
    let height_ratio_threshold = 0.35; // 35% height difference

    let mut blocks: Vec<Vec<&PdfLine>> = Vec::new();
    let mut current_block: Vec<&PdfLine> = vec![sorted_lines[0]];

    for line in sorted_lines.iter().skip(1) {
        let prev = current_block.last().unwrap();
        let prev_bottom = prev.bbox.y + prev.bbox.h;
        let gap = line.bbox.y - prev_bottom;

        // Check left-margin shift
        let first_in_block = current_block[0];
        let x_shift = (line.bbox.x - first_in_block.bbox.x).abs();

        // Check line height change relative to previous line
        let h_ratio = if prev.bbox.h > 0.0 {
            (line.bbox.h - prev.bbox.h).abs() / prev.bbox.h
        } else {
            0.0
        };

        let should_split = gap > gap_threshold
            || x_shift > x_shift_threshold
            || h_ratio > height_ratio_threshold
            || current_block.len() >= MAX_LINES_PER_BLOCK;

        if should_split {
            blocks.push(current_block);
            current_block = vec![line];
        } else {
            current_block.push(line);
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

            // Compute block font_size as median of line font_sizes
            let mut line_font_sizes: Vec<f64> = block_lines.iter().map(|l| l.font_size).collect();
            line_font_sizes.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let block_font_size = if line_font_sizes.is_empty() {
                12.0
            } else {
                line_font_sizes[line_font_sizes.len() / 2]
            };

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
                font_size: block_font_size,
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

/// Split lines at large horizontal gaps between words.
///
/// For table-like layouts, words on the same row may have consistently large
/// gaps between columns. A pure median-gap multiplier can fail to split those
/// rows. We therefore combine:
/// - local character-width threshold per adjacent word pair
/// - lower-quantile line gap threshold (P25-based)
/// and use a table-row override when all gaps are already large.
fn split_lines_by_horizontal_gaps(lines: Vec<PdfLine>, words: &[PdfWord], page: u32) -> Vec<PdfLine> {
    // Build word lookup
    let word_map: std::collections::HashMap<&str, &PdfWord> =
        words.iter().map(|w| (w.id.as_str(), w)).collect();

    // Compute median word height for global minimum thresholds.
    let mut all_word_heights: Vec<f64> = words.iter().map(|w| w.bbox.h).collect();
    all_word_heights.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median_word_h = if all_word_heights.is_empty() {
        20.0
    } else {
        all_word_heights[all_word_heights.len() / 2]
    };

    let mut result = Vec::new();
    let mut line_idx = 0usize;

    for line in &lines {
        // Resolve words in x-sorted order
        let mut line_words: Vec<&PdfWord> = line.word_ids.iter()
            .filter_map(|id| word_map.get(id.as_str()).copied())
            .collect();
        line_words.sort_by(|a, b| a.bbox.x.partial_cmp(&b.bbox.x).unwrap());
        let char_units: Vec<f64> = line_words
            .iter()
            .map(|w| {
                let chars = w.text.chars().count().max(1) as f64;
                (w.bbox.w / chars).max(1.0)
            })
            .collect();

        if line_words.len() < 2 {
            // Single word line, no splitting possible — re-emit with updated id
            result.push(PdfLine {
                id: format!("l-{}-{}", page, line_idx),
                page,
                word_ids: line.word_ids.clone(),
                bbox: line.bbox.clone(),
                text: line.text.clone(),
                font_size: line.font_size,
            });
            line_idx += 1;
            continue;
        }

        // Compute gaps between consecutive words
        let mut gaps: Vec<f64> = Vec::with_capacity(line_words.len() - 1);
        for pair in line_words.windows(2) {
            let gap = pair[1].bbox.x - (pair[0].bbox.x + pair[0].bbox.w);
            gaps.push(gap.max(0.0));
        }

        // Compute P25 gap within this line (more stable than median for table rows).
        let mut sorted_gaps = gaps.clone();
        sorted_gaps.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let p25_gap = if sorted_gaps.is_empty() {
            0.0
        } else {
            let idx = ((sorted_gaps.len() - 1) as f64 * 0.25).floor() as usize;
            sorted_gaps[idx]
        };
        let line_threshold = (0.6 * median_word_h).max(2.4 * p25_gap);
        let all_large_table_gaps = sorted_gaps.len() >= 2 && sorted_gaps[0] > 0.9 * median_word_h;

        // Split into segments
        let mut segments: Vec<Vec<&PdfWord>> = Vec::new();
        let mut current_seg: Vec<&PdfWord> = vec![line_words[0]];

        for (i, word) in line_words.iter().enumerate().skip(1) {
            let min_char_unit = char_units[i - 1].min(char_units[i]);
            let local_threshold = 2.6 * min_char_unit;
            let threshold = if all_large_table_gaps {
                (0.75 * median_word_h).max(1.8 * min_char_unit)
            } else {
                line_threshold.max(local_threshold)
            };
            if gaps[i - 1] > threshold {
                segments.push(current_seg);
                current_seg = vec![word];
            } else {
                current_seg.push(word);
            }
        }
        segments.push(current_seg);

        // Convert each segment to a PdfLine
        for seg in segments {
            let min_x = seg.iter().map(|w| w.bbox.x).fold(f64::INFINITY, f64::min);
            let max_x = seg.iter().map(|w| w.bbox.x + w.bbox.w).fold(f64::NEG_INFINITY, f64::max);
            let min_y = seg.iter().map(|w| w.bbox.y).fold(f64::INFINITY, f64::min);
            let max_y = seg.iter().map(|w| w.bbox.y + w.bbox.h).fold(f64::NEG_INFINITY, f64::max);
            let h = max_y - min_y;
            let text = seg.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ");
            let word_ids = seg.iter().map(|w| w.id.clone()).collect();

            result.push(PdfLine {
                id: format!("l-{}-{}", page, line_idx),
                page,
                word_ids,
                bbox: BBox { x: min_x, y: min_y, w: max_x - min_x, h },
                text,
                font_size: h * 0.85,
            });
            line_idx += 1;
        }
    }

    result
}

/// Build complete layout from TSV output for a single page.
pub fn build_layout(tsv: &str, page: u32, page_height: f64) -> PdfLayoutResult {
    let words = parse_tsv_words(tsv, page);
    let raw_lines = group_words_into_lines(&words, page);
    let lines = split_lines_by_horizontal_gaps(raw_lines, &words, page);
    let blocks = group_lines_into_blocks(&lines, page, page_height);
    PdfLayoutResult { words, lines, blocks }
}
