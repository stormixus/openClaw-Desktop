import type { Cell, Grid, MinesState, RevealResult } from './types';

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inBounds(state: MinesState, x: number, y: number) {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

function neighbors(state: MinesState, x: number, y: number) {
  const out: { x: number; y: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(state, nx, ny)) out.push({ x: nx, y: ny });
    }
  }
  return out;
}

function makeCell(): Cell {
  return { mine: false, adj: 0, revealed: false, flagged: false };
}

export function newGame(opts: { width: number; height: number; mines: number; seed?: string }): MinesState {
  const seed = opts.seed ?? `${Date.now()}`;
  const grid: Grid = Array.from({ length: opts.height }, () => Array.from({ length: opts.width }, () => makeCell()));
  return {
    width: opts.width,
    height: opts.height,
    mines: opts.mines,
    seed,
    firstClickDone: false,
    grid,
    status: 'idle',
    revealedCount: 0,
    flaggedCount: 0,
    elapsedMs: 0,
    highlights: [],
    agentSpeech: '첫 클릭은 안전합니다.',
    agentMood: 'calm',
  };
}

function placeMines(state: MinesState, firstX: number, firstY: number) {
  const rng = mulberry32(hashSeed(state.seed));
  const banned = new Set<string>();
  banned.add(`${firstX},${firstY}`);
  for (const n of neighbors(state, firstX, firstY)) banned.add(`${n.x},${n.y}`);

  let placed = 0;
  while (placed < state.mines) {
    const x = Math.floor(rng() * state.width);
    const y = Math.floor(rng() * state.height);
    const k = `${x},${y}`;
    if (banned.has(k)) continue;
    const c = state.grid[y][x];
    if (c.mine) continue;
    c.mine = true;
    placed++;
  }

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (state.grid[y][x].mine) continue;
      state.grid[y][x].adj = neighbors(state, x, y).filter((n) => state.grid[n.y][n.x].mine).length;
    }
  }
}

function cloneState(state: MinesState): MinesState {
  return {
    ...state,
    grid: state.grid.map((r) => r.map((c) => ({ ...c }))),
    highlights: [...state.highlights],
  };
}

export function toggleFlag(state: MinesState, x: number, y: number): MinesState {
  const s = cloneState(state);
  if (!inBounds(s, x, y) || s.status === 'won' || s.status === 'lost') return s;
  const c = s.grid[y][x];
  if (c.revealed) return s;
  c.flagged = !c.flagged;
  s.flaggedCount += c.flagged ? 1 : -1;
  s.status = s.status === 'idle' ? 'playing' : s.status;
  return s;
}

export function reveal(state: MinesState, x: number, y: number): { state: MinesState; result: RevealResult } {
  const s = cloneState(state);
  if (!inBounds(s, x, y) || s.status === 'won' || s.status === 'lost') {
    return { state: s, result: { ok: true, status: s.status === 'won' ? 'won' : 'playing', revealed: [] } };
  }

  if (!s.firstClickDone) {
    placeMines(s, x, y);
    s.firstClickDone = true;
    s.status = 'playing';
    s.startedAt = Date.now();
  }

  const first = s.grid[y][x];
  if (first.flagged || first.revealed) {
    return { state: s, result: { ok: true, status: 'playing', revealed: [] } };
  }

  if (first.mine) {
    first.revealed = true;
    s.status = 'lost';
    return { state: s, result: { ok: false, status: 'lost', mineAt: { x, y } } };
  }

  const revealed: { x: number; y: number }[] = [];
  const q: { x: number; y: number }[] = [{ x, y }];
  while (q.length) {
    const cur = q.shift()!;
    const c = s.grid[cur.y][cur.x];
    if (c.revealed || c.flagged) continue;
    c.revealed = true;
    s.revealedCount++;
    revealed.push(cur);

    if (c.adj === 0) {
      for (const n of neighbors(s, cur.x, cur.y)) {
        const nc = s.grid[n.y][n.x];
        if (!nc.revealed && !nc.flagged && !nc.mine) q.push(n);
      }
    }
  }

  if (s.revealedCount === s.width * s.height - s.mines) {
    s.status = 'won';
    return { state: s, result: { ok: true, status: 'won', revealed } };
  }

  return { state: s, result: { ok: true, status: 'playing', revealed } };
}

export function chordReveal(state: MinesState, x: number, y: number): { state: MinesState; revealed: { x: number; y: number }[] } {
  let s = cloneState(state);
  if (!inBounds(s, x, y)) return { state: s, revealed: [] };
  const c = s.grid[y][x];
  if (!c.revealed || c.adj <= 0) return { state: s, revealed: [] };

  const ns = neighbors(s, x, y);
  const flagged = ns.filter((n) => s.grid[n.y][n.x].flagged).length;
  if (flagged !== c.adj) return { state: s, revealed: [] };

  const allRevealed: { x: number; y: number }[] = [];
  for (const n of ns) {
    if (!s.grid[n.y][n.x].revealed && !s.grid[n.y][n.x].flagged) {
      const out = reveal(s, n.x, n.y);
      s = out.state;
      if (out.result.ok) allRevealed.push(...out.result.revealed);
    }
  }
  return { state: s, revealed: allRevealed };
}
