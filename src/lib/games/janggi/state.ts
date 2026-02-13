export interface JanggiGameState {
  board: Record<string, { type: string; color: 'w' | 'b' }>;
  turn: 'w' | 'b';
  moveList: string[];
  tokensUsed: number;
  tokenHistory: number[];
  useAgent: boolean;
  aiComment: string;
  lastFrom: string | null;
  lastTo: string | null;
}

let saved: JanggiGameState | null = null;

export function saveJanggiState(state: JanggiGameState) {
  saved = { ...state, board: { ...state.board }, moveList: [...state.moveList], tokenHistory: [...state.tokenHistory] };
}

export function loadJanggiState(): JanggiGameState | null {
  return saved;
}

export function clearJanggiState() {
  saved = null;
}
