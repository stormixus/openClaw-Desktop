export type CellState = 'empty' | 'filled' | 'marked';
export type Clue = number[];
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface NonogramState {
  width: number;
  height: number;
  solution: boolean[][];
  grid: CellState[][];
  rowClues: Clue[];
  colClues: Clue[];
  status: 'playing' | 'won';
  elapsedMs: number;
  startedAt?: number;
  difficulty: Difficulty;
  agentSpeech: string;
  agentMood: 'calm' | 'teasing' | 'serious' | 'excited';
}
