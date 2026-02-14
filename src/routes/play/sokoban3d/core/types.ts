export type Dir = 'up' | 'down' | 'left' | 'right';
export type CellType = 'floor' | 'wall' | 'target';
export type Pos = { x: number; y: number };

export interface SokobanLevel {
  id: string;
  title: string;
  width: number;
  height: number;
  grid: CellType[][];
  player: Pos;
  boxes: Pos[];
  targets: Pos[];
}

export interface SokobanState {
  level: SokobanLevel;
  playerPos: Pos;
  boxes: Pos[];
  history: { player: Pos; boxes: Pos[] }[];
  moves: number;
  pushes: number;
  status: 'playing' | 'won';
  currentLevelIndex: number;
  agentSpeech: string;
  agentMood: 'calm' | 'teasing' | 'serious' | 'excited';
}
