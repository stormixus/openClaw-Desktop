export interface CheckersState {
  board: (null | { c: 'w' | 'b'; k: boolean })[][];
  turn: 'w' | 'b';
  moveList: string[];
  useAgent: boolean;
}

let saved: CheckersState | null = null;

export function saveCheckersState(s: CheckersState) { saved = JSON.parse(JSON.stringify(s)); }
export function loadCheckersState(): CheckersState | null { return saved ? JSON.parse(JSON.stringify(saved)) : null; }
export function clearCheckersState() { saved = null; }
