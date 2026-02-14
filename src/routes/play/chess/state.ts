/**
 * Chess game state persistence across route navigation.
 * Module-level state survives SvelteKit client-side navigation.
 */

export interface ChessGameState {
  fen: string;
  moveList: string[];
  tokensUsed: number;
  tokenHistory: number[];
  useAgent: boolean;
  difficulty: string;
  aiComment: string;
  lastFrom: string | null;
  lastTo: string | null;
}

let saved: ChessGameState | null = null;

export function saveChessState(state: ChessGameState) {
  saved = { ...state };
}

export function loadChessState(): ChessGameState | null {
  return saved;
}

export function clearChessState() {
  saved = null;
}
