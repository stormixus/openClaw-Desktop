export type EdgeState = 'none' | 'line' | 'cross'; // cross = explicitly no line
export type Difficulty = 'easy' | 'medium' | 'hard';

// Edge identified by orientation and position
export interface Edge {
  orientation: 'h' | 'v'; // horizontal or vertical
  row: number;
  col: number;
}

export interface SlitherlinkState {
  width: number; // number of cells
  height: number;
  clues: (number | null)[][]; // null = no clue
  hEdges: EdgeState[][]; // horizontal edges: (height+1) x width
  vEdges: EdgeState[][]; // vertical edges: height x (width+1)
  status: 'playing' | 'won';
  difficulty: Difficulty;
  elapsedMs: number;
  startedAt?: number;
  agentSpeech: string;
  agentMood: 'calm' | 'teasing' | 'serious' | 'excited';
}
