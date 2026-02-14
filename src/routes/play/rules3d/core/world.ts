import type { Grid, Obj, RulesLevel, WorldState } from './types';
import { parseRules } from './ruleParser';

export function makeGrid(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ objects: [] })));
}

function cloneGrid(g: Grid): Grid {
  return g.map((r) => r.map((c) => ({ objects: [...c.objects] })));
}

function cloneObjects(objects: Record<string, Obj>): Record<string, Obj> {
  const out: Record<string, Obj> = {};
  for (const [k, v] of Object.entries(objects)) out[k] = { ...v, pos: { ...v.pos } };
  return out;
}

export function rebuildGrid(state: WorldState): WorldState {
  const grid = makeGrid(state.width, state.height);
  for (const o of Object.values(state.objects)) {
    if (o.pos.y < 0 || o.pos.y >= state.height || o.pos.x < 0 || o.pos.x >= state.width) continue;
    grid[o.pos.y][o.pos.x].objects.push(o.id);
  }
  return { ...state, grid };
}

export function snapshot(state: WorldState) {
  return {
    objects: cloneObjects(state.objects),
    grid: cloneGrid(state.grid),
    step: state.step,
    status: state.status,
  };
}

export function loadLevel(level: RulesLevel): WorldState {
  const objects: Record<string, Obj> = {};
  level.objects.forEach((o, i) => {
    objects[`o${i}`] = { id: `o${i}`, kind: o.kind, type: o.type, pos: { x: o.x, y: o.y } };
  });

  let state: WorldState = {
    width: level.size.w,
    height: level.size.h,
    title: level.title,
    objects,
    grid: makeGrid(level.size.w, level.size.h),
    rules: { props: {}, transforms: {}, youTypes: new Set() },
    step: 0,
    status: 'playing',
    history: [],
    initialLevel: level,
    agentSpeech: '규칙 블록을 움직여 문장을 만들어보세요.',
    agentMood: 'calm',
    hintLevel: 0,
    hintHighlights: [],
  };

  state = rebuildGrid(state);
  state.rules = parseRules(state);
  return state;
}

export function reset(state: WorldState): WorldState {
  return loadLevel(state.initialLevel);
}

export function undo(state: WorldState): WorldState {
  if (!state.history.length) return state;
  const prev = state.history[state.history.length - 1];
  const nextHistory = state.history.slice(0, -1);
  return {
    ...state,
    objects: cloneObjects(prev.objects),
    grid: cloneGrid(prev.grid),
    step: prev.step,
    status: prev.status,
    history: nextHistory,
    rules: parseRules({ ...state, objects: cloneObjects(prev.objects), grid: cloneGrid(prev.grid) } as WorldState),
  };
}
