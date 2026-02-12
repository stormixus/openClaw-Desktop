// PDF AI Editor - Document Model Types

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfWord {
  id: string;
  page: number;
  text: string;
  bbox: BBox;
  conf: number;
}

export interface PdfLine {
  id: string;
  page: number;
  wordIds: string[];
  bbox: BBox;
  text: string;
}

export interface PdfBlock {
  id: string;
  page: number;
  kind: string;
  lineIds: string[];
  bbox: BBox;
  text: string;
}

export type Op =
  | { t: "move"; targetId: string; dx: number; dy: number }
  | { t: "replaceText"; targetId: string; text: string }
  | { t: "delete"; targetId: string }
  | { t: "insertText"; page: number; at: { x: number; y: number }; text: string; fontSize?: number }
  | { t: "highlight"; page: number; rects: BBox[]; color?: string }
  | { t: "comment"; page: number; at: { x: number; y: number }; text: string };

export interface PdfDocState {
  scaleBase: number;
  pages: number;
  pageHeights: number[];
  words: Record<string, PdfWord>;
  lines: Record<string, PdfLine>;
  blocks: Record<string, PdfBlock>;
  ops: Op[];
}

// Tauri invoke return type (snake_case from Rust serde)
export interface PdfLayoutResultRaw {
  words: Array<{
    id: string;
    page: number;
    text: string;
    bbox: { x: number; y: number; w: number; h: number };
    conf: number;
  }>;
  lines: Array<{
    id: string;
    page: number;
    word_ids: string[];
    bbox: { x: number; y: number; w: number; h: number };
    text: string;
  }>;
  blocks: Array<{
    id: string;
    page: number;
    kind: string;
    line_ids: string[];
    bbox: { x: number; y: number; w: number; h: number };
    text: string;
  }>;
}
