export type Piece = null | { c: 'w' | 'b'; k: boolean };
export type Board = Piece[][];
export type Move = { from: [number, number]; to: [number, number]; captures?: [number, number][] };

export function createBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
  for (let y = 0; y < 3; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2 === 1) b[y][x] = { c: 'b', k: false };
  for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2 === 1) b[y][x] = { c: 'w', k: false };
  return b;
}

function inside(x: number, y: number) { return x >= 0 && x < 8 && y >= 0 && y < 8; }

function dirs(p: { c: 'w'|'b'; k: boolean }) {
  if (p.k) return [[1,1],[-1,1],[1,-1],[-1,-1]] as const;
  return p.c === 'w' ? [[1,-1],[-1,-1]] as const : [[1,1],[-1,1]] as const;
}

function clone(board: Board): Board { return board.map(r => r.map(c => c ? { ...c } : null)); }

function pieceMoves(board: Board, x: number, y: number): Move[] {
  const p = board[y][x];
  if (!p) return [];
  const normals: Move[] = [];
  const captures: Move[] = [];
  for (const [dx,dy] of dirs(p)) {
    const nx = x + dx, ny = y + dy;
    if (!inside(nx,ny)) continue;
    if (!board[ny][nx]) normals.push({ from:[x,y], to:[nx,ny] });
    const jx = x + dx*2, jy = y + dy*2;
    if (!inside(jx,jy)) continue;
    const mid = board[ny][nx];
    if (mid && mid.c !== p.c && !board[jy][jx]) captures.push({ from:[x,y], to:[jx,jy], captures:[[nx,ny]] });
  }
  return captures.length ? captures : normals;
}

export function legalMoves(board: Board, turn: 'w'|'b'): Move[] {
  const all: Move[] = [];
  for (let y=0;y<8;y++) for (let x=0;x<8;x++) if (board[y][x]?.c===turn) all.push(...pieceMoves(board,x,y));
  const hasCapture = all.some(m => m.captures?.length);
  return hasCapture ? all.filter(m => m.captures?.length) : all;
}

export function applyMove(board: Board, move: Move): Board {
  const b = clone(board);
  const [fx,fy] = move.from, [tx,ty] = move.to;
  const p = b[fy][fx];
  if (!p) return b;
  b[fy][fx] = null;
  if (move.captures) for (const [cx,cy] of move.captures) b[cy][cx] = null;
  const promote = (!p.k) && ((p.c === 'w' && ty === 0) || (p.c === 'b' && ty === 7));
  b[ty][tx] = { c: p.c, k: p.k || promote };
  return b;
}

export function winner(board: Board): 'w'|'b'|null {
  let w=0,b=0;
  for (const row of board) for (const p of row) if (p) p.c==='w'?w++:b++;
  if (!w) return 'b';
  if (!b) return 'w';
  return null;
}

export function aiPick(board: Board, turn:'w'|'b'): Move | null {
  const moves = legalMoves(board, turn);
  if (!moves.length) return null;
  const caps = moves.filter(m => m.captures?.length);
  const pool = caps.length ? caps : moves;
  return pool[Math.floor(Math.random()*pool.length)];
}
