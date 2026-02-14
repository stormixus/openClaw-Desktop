export type Dir = 'U' | 'D' | 'L' | 'R';
export type Pos = { x: number; y: number };
export type ObjKind = 'ENTITY' | 'WORD';

export type Obj = {
  id: string;
  kind: ObjKind;
  type: string;
  pos: Pos;
};

export type Cell = { objects: string[] };
export type Grid = Cell[][];

export type Property = 'STOP' | 'PUSH' | 'WIN' | 'YOU' | 'DEFEAT';

export type ParsedRules = {
  props: Record<string, Set<Property>>;
  transforms: Record<string, string>;
  youTypes: Set<string>;
};

export type WorldStateSnapshot = {
  objects: Record<string, Obj>;
  grid: Grid;
  step: number;
  status: 'playing' | 'won' | 'lost';
};

export type WorldState = {
  width: number;
  height: number;
  title: string;
  objects: Record<string, Obj>;
  grid: Grid;
  rules: ParsedRules;
  step: number;
  status: 'playing' | 'won' | 'lost';
  history: WorldStateSnapshot[];
  initialLevel: RulesLevel;
  agentSpeech: string;
  agentMood: 'calm' | 'teasing' | 'serious' | 'excited';
  hintLevel: number;
  hintHighlights: { x: number; y: number; kind: 'word' | 'entity' }[];
};

export type RulesLevel = {
  id: string;
  title: string;
  size: { w: number; h: number };
  objects: { kind: ObjKind; type: string; x: number; y: number }[];
  hints?: string[];
  hintTargets?: { x: number; y: number; kind: 'word' | 'entity' }[][];
};
