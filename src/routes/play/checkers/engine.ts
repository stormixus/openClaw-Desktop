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

/** Find all multi-jump chains from (x,y) recursively */
function jumpChains(board: Board, x: number, y: number, captured: [number, number][]): Move[] {
  const p = board[y][x];
  if (!p) return [];
  const chains: Move[] = [];
  const capturedSet = new Set(captured.map(([cx,cy]) => `${cx},${cy}`));

  for (const [dx,dy] of dirs(p)) {
    const mx = x + dx, my = y + dy;
    if (!inside(mx,my)) continue;
    const mid = board[my][mx];
    if (!mid || mid.c === p.c || capturedSet.has(`${mx},${my}`)) continue;
    const jx = x + dx*2, jy = y + dy*2;
    if (!inside(jx,jy) || board[jy][jx]) continue;

    const nextCaptured: [number, number][] = [...captured, [mx, my]];
    // Temporarily simulate the jump for deeper recursion
    const saved = board[my][mx];
    const savedOrigin = board[y][x];
    board[my][mx] = null;
    board[y][x] = null;
    board[jy][jx] = p;

    const deeper = jumpChains(board, jx, jy, nextCaptured);

    // Restore board
    board[jy][jx] = null;
    board[y][x] = savedOrigin;
    board[my][mx] = saved;

    if (deeper.length) {
      for (const d of deeper) chains.push(d);
    } else {
      chains.push({ from: [captured.length ? captured[0][0] - (captured[0][0] - x) : x, captured.length ? captured[0][1] - (captured[0][1] - y) : y] as [number,number], to: [jx, jy], captures: nextCaptured });
    }
  }
  return chains;
}

function pieceMoves(board: Board, x: number, y: number): Move[] {
  const p = board[y][x];
  if (!p) return [];
  const normals: Move[] = [];

  // Find multi-jump chains first
  const chains = jumpChains(board, x, y, []);
  // Fix the 'from' coordinate on all chains
  const captures = chains.map(m => ({ ...m, from: [x, y] as [number, number] }));

  if (captures.length) return captures;

  // Normal (non-capture) moves
  for (const [dx,dy] of dirs(p)) {
    const nx = x + dx, ny = y + dy;
    if (!inside(nx,ny)) continue;
    if (!board[ny][nx]) normals.push({ from:[x,y], to:[nx,ny] });
  }
  return normals;
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
  // Also check if a side has no legal moves (stalemate = loss in checkers)
  if (w && !legalMoves(board, 'w').length) return 'b';
  if (b && !legalMoves(board, 'b').length) return 'w';
  return null;
}

export function aiPick(board: Board, turn:'w'|'b'): Move | null {
  const moves = legalMoves(board, turn);
  if (!moves.length) return null;
  const caps = moves.filter(m => m.captures?.length);
  const pool = caps.length ? caps : moves;
  return pool[Math.floor(Math.random()*pool.length)];
}

// =============================================================================
// LLM Integration
// =============================================================================

function coordStr(x: number, y: number): string {
  return `${String.fromCharCode(97 + x)}${8 - y}`;
}

function moveStr(m: Move): string {
  const cap = m.captures?.length ? 'x' : '-';
  return `${coordStr(m.from[0], m.from[1])}${cap}${coordStr(m.to[0], m.to[1])}`;
}

export function boardToAscii(board: Board): string {
  const lines: string[] = ['  a b c d e f g h'];
  for (let y = 0; y < 8; y++) {
    let row = `${8 - y} `;
    for (let x = 0; x < 8; x++) {
      const p = board[y][x];
      if (!p) row += ((x + y) % 2 === 1 ? '.' : ' ') + ' ';
      else if (p.c === 'w' && p.k) row += 'W ';
      else if (p.c === 'w') row += 'w ';
      else if (p.c === 'b' && p.k) row += 'B ';
      else row += 'b ';
    }
    lines.push(row.trimEnd());
  }
  return lines.join('\n');
}

export function buildCheckersPrompt(board: Board, turn: 'w' | 'b', moveList: string[], locale: string): string {
  const ascii = boardToAscii(board);
  const moves = legalMoves(board, turn);
  const moveStrs = moves.map(moveStr);
  const isKo = locale.startsWith('ko');

  if (isKo) {
    return `당신은 체커 AI입니다. ${turn === 'b' ? '흑(b)' : '백(w)'}을 플레이합니다.
소문자 = 일반 기물, 대문자 = 킹. w/W = 백, b/B = 흑.

현재 보드:
${ascii}

수순: ${moveList.join(' ') || '(없음)'}

합법 수: ${moveStrs.join(', ')}

전략적으로 최선의 수를 하나만 선택하세요. 캡처가 가능하면 반드시 캡처해야 합니다.
형식: 좌표-좌표 (예: c3-d4 또는 c3xd4)
수를 하나만 답하고, 1~2문장으로 이유를 설명하세요.`;
  }

  return `You are a Checkers AI playing as ${turn === 'b' ? 'Black (b)' : 'White (w)'}.
Lowercase = regular piece, uppercase = king. w/W = white, b/B = black.

Current board:
${ascii}

Move history: ${moveList.join(' ') || '(none)'}

Legal moves: ${moveStrs.join(', ')}

Choose the best strategic move. If captures are available, you must capture.
Format: coordinate-coordinate (e.g. c3-d4 or c3xd4)
Reply with exactly one move, then 1-2 sentences of reasoning.`;
}

export function parseCheckersMove(response: string, board: Board, turn: 'w' | 'b'): Move | null {
  const moves = legalMoves(board, turn);
  if (!moves.length) return null;

  // Try to match coordinate patterns like a3-b4, a3xb4, a3 b4
  const pattern = /([a-h][1-8])\s*[-x\s]\s*([a-h][1-8])/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(response)) !== null) {
    const fromCol = match[1].charCodeAt(0) - 97;
    const fromRow = 8 - parseInt(match[1][1]);
    const toCol = match[2].charCodeAt(0) - 97;
    const toRow = 8 - parseInt(match[2][1]);

    const found = moves.find(
      (m) => m.from[0] === fromCol && m.from[1] === fromRow && m.to[0] === toCol && m.to[1] === toRow,
    );
    if (found) return found;
  }

  // Fallback: random legal move
  return null;
}
