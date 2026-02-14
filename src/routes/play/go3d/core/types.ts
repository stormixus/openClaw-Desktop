export type Stone = 0 | 1 | 2; // 0 empty, 1 black, 2 white
export type Board = Stone[][]; // board[y][x]
export type PlayerStone = 1 | 2;

export type Move = { x: number; y: number; c: PlayerStone };

export type Highlight =
  | { type: 'candidate'; x: number; y: number }
  | { type: 'region'; x: number; y: number; r: number }
  | { type: 'arrow'; from: { x: number; y: number }; to: { x: number; y: number } };

export type GameMode = 'agent' | 'offline' | 'ava';

export type GoGameState = {
  board: Board;
  size: number;
  turn: PlayerStone;
  history: { board: Board; move?: string; koHash?: string }[];
  koHash?: string;
  capturedByBlack: number;
  capturedByWhite: number;
  consecutivePasses: number;
  status: 'playing' | 'ended';
  winner: 'black' | 'white' | null;
  winReason: string;
  lastMove?: { x: number; y: number } | 'pass';
  ghost?: { x: number; y: number; c: PlayerStone; legal: boolean };
  highlights: Highlight[];
  moveList: string[];
  score?: { black: number; white: number };
  gameMode: GameMode;
  aiThinking: boolean;
  aiComment: string;
  avaBlackGw: string;
  avaWhiteGw: string;
  avaRunning: boolean;
  tokensUsed: number;
  tokenHistory: number[];
};

export type ApplyResult =
  | { ok: true; board: Board; captured: { x: number; y: number }[]; nextKoHash?: string }
  | { ok: false; reason: 'occupied' | 'suicide' | 'ko' | 'out_of_bounds'; board: Board };
