import type { Highlight, MinesState } from './types';

function inBounds(state: MinesState, x: number, y: number) {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

function neighbors(state: MinesState, x: number, y: number) {
  const out: { x: number; y: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(state, nx, ny)) out.push({ x: nx, y: ny });
    }
  }
  return out;
}

export function computeForcedMoves(state: MinesState): { safe: { x: number; y: number }[]; mines: { x: number; y: number }[] } {
  const safe = new Set<string>();
  const mines = new Set<string>();

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const c = state.grid[y][x];
      if (!c.revealed || c.adj <= 0) continue;
      const ns = neighbors(state, x, y);
      const flagged = ns.filter((n) => state.grid[n.y][n.x].flagged).length;
      const hidden = ns.filter((n) => !state.grid[n.y][n.x].revealed && !state.grid[n.y][n.x].flagged);
      if (!hidden.length) continue;

      if (flagged === c.adj) {
        for (const h of hidden) safe.add(`${h.x},${h.y}`);
      }
      if (flagged + hidden.length === c.adj) {
        for (const h of hidden) mines.add(`${h.x},${h.y}`);
      }
    }
  }

  const asXY = (s: Set<string>) => [...s].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });

  return { safe: asXY(safe), mines: asXY(mines) };
}

export function getHint(state: MinesState, level: number): { highlights: Highlight[]; text: string } {
  const forced = computeForcedMoves(state);
  if (forced.safe.length || forced.mines.length) {
    if (level <= 1) {
      const p = forced.safe[0] ?? forced.mines[0];
      return { highlights: [{ type: 'region', x: p.x, y: p.y, r: 1 }], text: '이 주변에서 강제 수가 나옵니다.' };
    }
    if (level === 2) {
      return {
        highlights: forced.safe.slice(0, 2).map((p) => ({ type: 'candidateSafe', x: p.x, y: p.y })),
        text: '안전 후보 칸을 표시했어요.',
      };
    }
    return {
      highlights: [
        ...forced.safe.slice(0, 2).map((p) => ({ type: 'candidateSafe', x: p.x, y: p.y } as Highlight)),
        ...forced.mines.slice(0, 2).map((p) => ({ type: 'candidateMine', x: p.x, y: p.y } as Highlight)),
      ],
      text: '강제 규칙 기반으로 안전/지뢰 후보를 표시했습니다.',
    };
  }

  return { highlights: [], text: '현재 강제 수가 보이지 않습니다. 추측이 필요할 수 있어요.' };
}
