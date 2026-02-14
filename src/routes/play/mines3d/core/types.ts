export type Highlight =
  | { type: 'candidateSafe'; x: number; y: number }
  | { type: 'candidateMine'; x: number; y: number }
  | { type: 'region'; x: number; y: number; r: number }
  | { type: 'warning'; x: number; y: number };

export type Cell = {
  mine: boolean;
  adj: number;
  revealed: boolean;
  flagged: boolean;
};

export type Grid = Cell[][];
export type GameStatus = 'idle' | 'playing' | 'won' | 'lost';

export type MinesState = {
  width: number;
  height: number;
  mines: number;
  seed: string;
  firstClickDone: boolean;
  grid: Grid;
  status: GameStatus;
  revealedCount: number;
  flaggedCount: number;
  startedAt?: number;
  elapsedMs: number;
  hover?: { x: number; y: number; valid: boolean };
  highlights: Highlight[];
  agentSpeech: string;
  agentMood: 'calm' | 'teasing' | 'serious' | 'excited';
};

export type RevealResult =
  | { ok: true; status: 'playing' | 'won'; revealed: { x: number; y: number }[] }
  | { ok: false; status: 'lost'; mineAt: { x: number; y: number } };
