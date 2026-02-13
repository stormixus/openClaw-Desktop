export type Stone = 0 | 1 | 2; // 0 empty, 1 black, 2 white
export type Board = Stone[][]; // board[y][x]
export type PlayerStone = 1 | 2;

export type Move = { x: number; y: number; c: PlayerStone };

export type Highlight =
  | { type: 'candidate'; x: number; y: number }
  | { type: 'region'; x: number; y: number; r: number }
  | { type: 'arrow'; from: { x: number; y: number }; to: { x: number; y: number } };

export type PuzzleMode = 'BEST_MOVE' | 'LIFE_DEATH' | 'ENDGAME';

export type GoPuzzle = {
  id: string;
  title: string;
  size: number;
  toPlay: 'B' | 'W';
  sgf: string;
  mode: PuzzleMode;
  answers: { x: number; y: number }[];
  goal: string;
  difficulty: number;
  tags: string[];
};

export type ApplyResult =
  | { ok: true; board: Board; captured: { x: number; y: number }[]; nextKoHash?: string }
  | { ok: false; reason: 'occupied' | 'suicide' | 'ko' | 'out_of_bounds'; board: Board };
