import { parseRules } from './ruleParser';
import { rebuildGrid, snapshot } from './world';
import type { Dir, Obj, WorldState } from './types';

const delta: Record<Dir, { x: number; y: number }> = {
  U: { x: 0, y: -1 },
  D: { x: 0, y: 1 },
  L: { x: -1, y: 0 },
  R: { x: 1, y: 0 },
};

function inBounds(state: WorldState, x: number, y: number) {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

function hasProp(state: WorldState, type: string, prop: string) {
  return state.rules.props[type]?.has(prop as any) ?? false;
}

function objsAt(state: WorldState, x: number, y: number): Obj[] {
  if (!inBounds(state, x, y)) return [];
  return state.grid[y][x].objects.map((id) => state.objects[id]);
}

function canPushChain(state: WorldState, x: number, y: number, d: Dir): boolean {
  if (!inBounds(state, x, y)) return false;
  const ds = delta[d];
  const arr = objsAt(state, x, y);
  const stoppers = arr.filter((o) => hasProp(state, o.type, 'STOP'));
  if (stoppers.length) return false;

  const pushables = arr.filter((o) => o.kind === 'WORD' || hasProp(state, o.type, 'PUSH'));
  if (!pushables.length) return true;

  const nx = x + ds.x;
  const ny = y + ds.y;
  return canPushChain(state, nx, ny, d);
}

function doPushChain(state: WorldState, x: number, y: number, d: Dir) {
  if (!inBounds(state, x, y)) return;
  const ds = delta[d];
  const arr = objsAt(state, x, y).filter((o) => o.kind === 'WORD' || hasProp(state, o.type, 'PUSH'));
  if (!arr.length) return;

  const nx = x + ds.x;
  const ny = y + ds.y;
  doPushChain(state, nx, ny, d);
  for (const o of arr) {
    state.objects[o.id].pos = { x: o.pos.x + ds.x, y: o.pos.y + ds.y };
  }
}

function applyTransforms(state: WorldState) {
  for (const o of Object.values(state.objects)) {
    if (o.kind !== 'ENTITY') continue;
    const t = state.rules.transforms[o.type];
    if (t) o.type = t;
  }
}

function resolveInteractions(state: WorldState) {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const arr = objsAt(state, x, y);
      const you = arr.filter((o) => state.rules.youTypes.has(o.type));
      if (!you.length) continue;
      if (arr.some((o) => hasProp(state, o.type, 'WIN'))) state.status = 'won';
      if (arr.some((o) => hasProp(state, o.type, 'DEFEAT'))) state.status = 'lost';
    }
  }
}

export function getCurrentRulesText(state: WorldState): string[] {
  const out: string[] = [];
  for (const [k, set] of Object.entries(state.rules.props)) {
    for (const p of set) out.push(`${k} IS ${p}`);
  }
  for (const [a, b] of Object.entries(state.rules.transforms)) out.push(`${a} IS ${b}`);
  return out.sort();
}

export function tick(state: WorldState, dir: Dir): WorldState {
  if (state.status !== 'playing') return state;

  state.history.push(snapshot(state));
  state.rules = parseRules(state);
  applyTransforms(state);
  state = rebuildGrid(state);
  state.rules = parseRules(state);

  const ds = delta[dir];
  const movers = Object.values(state.objects).filter((o) => o.kind === 'ENTITY' && state.rules.youTypes.has(o.type));

  for (const m of movers) {
    const tx = m.pos.x + ds.x;
    const ty = m.pos.y + ds.y;
    if (!inBounds(state, tx, ty)) continue;
    if (!canPushChain(state, tx, ty, dir)) continue;
    doPushChain(state, tx, ty, dir);
    m.pos = { x: tx, y: ty };
    state = rebuildGrid(state);
  }

  state.rules = parseRules(state);
  resolveInteractions(state);
  state.step += 1;
  return state;
}
