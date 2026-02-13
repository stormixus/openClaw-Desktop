import type { ApplyResult, Board, Move, PlayerStone, Stone } from './types';

export function createBoard(size = 19): Board {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0 as Stone));
}

export function cloneBoard(board: Board): Board {
  return board.map((r) => [...r] as Stone[]);
}

export function computeBoardHash(board: Board): string {
  return board.map((r) => r.join('')).join('|');
}

function inBounds(board: Board, x: number, y: number) {
  const n = board.length;
  return x >= 0 && x < n && y >= 0 && y < n;
}

function neighbors(board: Board, x: number, y: number): { x: number; y: number }[] {
  const cand = [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
  return cand.filter((p) => inBounds(board, p.x, p.y));
}

function groupAndLiberties(board: Board, sx: number, sy: number) {
  const color = board[sy][sx] as PlayerStone;
  const seen = new Set<string>();
  const group: { x: number; y: number }[] = [];
  const liberties = new Set<string>();
  const q = [{ x: sx, y: sy }];

  while (q.length) {
    const cur = q.pop()!;
    const k = `${cur.x},${cur.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    group.push(cur);

    for (const n of neighbors(board, cur.x, cur.y)) {
      const s = board[n.y][n.x];
      if (s === 0) liberties.add(`${n.x},${n.y}`);
      else if (s === color) q.push(n);
    }
  }

  return { group, liberties };
}

function removeGroup(board: Board, stones: { x: number; y: number }[]) {
  for (const p of stones) board[p.y][p.x] = 0;
}

export function applyMove(board: Board, move: Move, koHash?: string): ApplyResult {
  const { x, y, c } = move;
  if (!inBounds(board, x, y)) return { ok: false, reason: 'out_of_bounds', board };
  if (board[y][x] !== 0) return { ok: false, reason: 'occupied', board };

  const next = cloneBoard(board);
  next[y][x] = c;

  const opp: PlayerStone = c === 1 ? 2 : 1;
  const captured: { x: number; y: number }[] = [];

  for (const n of neighbors(next, x, y)) {
    if (next[n.y][n.x] !== opp) continue;
    const g = groupAndLiberties(next, n.x, n.y);
    if (g.liberties.size === 0) {
      captured.push(...g.group);
      removeGroup(next, g.group);
    }
  }

  const self = groupAndLiberties(next, x, y);
  if (self.liberties.size === 0) return { ok: false, reason: 'suicide', board };

  const h = computeBoardHash(next);
  if (koHash && h === koHash) return { ok: false, reason: 'ko', board };

  return { ok: true, board: next, captured, nextKoHash: computeBoardHash(board) };
}

export function isLegalMove(board: Board, move: Move, koHash?: string): boolean {
  return applyMove(board, move, koHash).ok;
}
