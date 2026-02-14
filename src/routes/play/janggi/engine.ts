import type { JanggiRuleSet } from './rules';
import type { BoardMap, Color, Move, PieceType } from './types';

const files = 'abcdefghi';

function inBoard(f: number, r: number) {
  return f >= 0 && f < 9 && r >= 1 && r <= 10;
}

function sq(f: number, r: number) {
  return `${files[f]}${r}`;
}

function parseSquare(s: string) {
  const f = files.indexOf(s[0]);
  const r = Number(s.slice(1));
  return { f, r };
}

function samePalace(a: string, b: string, color: Color): boolean {
  const aa = parseSquare(a);
  const bb = parseSquare(b);
  const inPalace = (p: { f: number; r: number }) =>
    p.f >= 3 && p.f <= 5 && (color === 'w' ? p.r >= 1 && p.r <= 3 : p.r >= 8 && p.r <= 10);
  return inPalace(aa) && inPalace(bb);
}

export function createInitialBoard(setup: JanggiRuleSet['startingSetup'] = 'standard'): BoardMap {
  const b: BoardMap = {};
  const put = (s: string, type: PieceType, color: Color) => {
    b[s] = { type, color };
  };

  put('a1', 'rook', 'w'); put('i1', 'rook', 'w');
  put('b1', 'horse', 'w'); put('h1', 'horse', 'w');
  put('c1', 'elephant', 'w'); put('g1', 'elephant', 'w');
  put('d1', 'guard', 'w'); put('f1', 'guard', 'w');
  put('e2', 'king', 'w');
  put('b3', 'cannon', 'w'); put('h3', 'cannon', 'w');
  ['a4', 'c4', 'e4', 'g4', 'i4'].forEach((s) => put(s, 'soldier', 'w'));

  put('a10', 'rook', 'b'); put('i10', 'rook', 'b');
  put('b10', 'horse', 'b'); put('h10', 'horse', 'b');
  put('c10', 'elephant', 'b'); put('g10', 'elephant', 'b');
  put('d10', 'guard', 'b'); put('f10', 'guard', 'b');
  put('e9', 'king', 'b');
  put('b8', 'cannon', 'b'); put('h8', 'cannon', 'b');
  ['a7', 'c7', 'e7', 'g7', 'i7'].forEach((s) => put(s, 'soldier', 'b'));

  if (setup === 'variantA') {
    [['b1', 'c1'], ['h1', 'g1'], ['b10', 'c10'], ['h10', 'g10']].forEach(([x, y]) => {
      const t = b[x];
      b[x] = b[y];
      b[y] = t;
    });
  }

  return b;
}

function addIfValid(list: Move[], board: BoardMap, from: string, to: string, color: Color) {
  const p = board[to];
  if (!p) list.push({ from, to, capture: false });
  else if (p.color !== color) list.push({ from, to, capture: true });
}

function rookMoves(from: string, board: BoardMap, color: Color, rules: JanggiRuleSet): Move[] {
  const out: Move[] = [];
  const { f, r } = parseSquare(from);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [df, dr] of dirs) {
    let nf = f + df, nr = r + dr;
    while (inBoard(nf, nr)) {
      const to = sq(nf, nr);
      const p = board[to];
      if (!p) out.push({ from, to });
      else {
        if (p.color !== color) out.push({ from, to, capture: true });
        break;
      }
      nf += df; nr += dr;
    }
  }

  if (rules.palaceDiagonalFor.rook) {
    const diagonals = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [df, dr] of diagonals) {
      const nf = f + df, nr = r + dr;
      if (!inBoard(nf, nr)) continue;
      const to = sq(nf, nr);
      if (samePalace(from, to, color)) addIfValid(out, board, from, to, color);
    }
  }

  return out;
}

function cannonMoves(from: string, board: BoardMap, color: Color, rules: JanggiRuleSet): Move[] {
  const out: Move[] = [];
  const { f, r } = parseSquare(from);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [df, dr] of dirs) {
    let nf = f + df, nr = r + dr;
    let screenSeen = false;
    while (inBoard(nf, nr)) {
      const to = sq(nf, nr);
      const p = board[to];
      if (!screenSeen) {
        if (p) screenSeen = true;
      } else {
        if (!p) out.push({ from, to });
        else {
          const isCannon = p.type === 'cannon';
          if (p.color !== color && (!isCannon || rules.cannonCaptureCannonAllowed)) {
            out.push({ from, to, capture: true });
          }
          break;
        }
      }
      nf += df; nr += dr;
    }
  }

  if (rules.palaceDiagonalFor.cannon) {
    const diagonals = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [df, dr] of diagonals) {
      const nf = f + df, nr = r + dr;
      if (!inBoard(nf, nr)) continue;
      const to = sq(nf, nr);
      if (samePalace(from, to, color)) addIfValid(out, board, from, to, color);
    }
  }

  return out;
}

function kingGuardMoves(from: string, board: BoardMap, color: Color, rules: JanggiRuleSet, isKing: boolean): Move[] {
  const out: Move[] = [];
  const { f, r } = parseSquare(from);
  const orth = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  for (const [df, dr] of orth) {
    const nf = f + df, nr = r + dr;
    if (!inBoard(nf, nr)) continue;
    const to = sq(nf, nr);
    if (samePalace(from, to, color)) addIfValid(out, board, from, to, color);
  }

  const allowDiag = isKing ? rules.palaceDiagonalFor.king : rules.palaceDiagonalFor.guard;
  if (allowDiag) {
    for (const [df, dr] of diag) {
      const nf = f + df, nr = r + dr;
      if (!inBoard(nf, nr)) continue;
      const to = sq(nf, nr);
      if (samePalace(from, to, color)) addIfValid(out, board, from, to, color);
    }
  }

  return out;
}

function horseMoves(from: string, board: BoardMap, color: Color): Move[] {
  const out: Move[] = [];
  const { f, r } = parseSquare(from);
  const steps = [
    { block: [0, 1], to: [-1, 2] }, { block: [0, 1], to: [1, 2] },
    { block: [1, 0], to: [2, 1] }, { block: [1, 0], to: [2, -1] },
    { block: [0, -1], to: [-1, -2] }, { block: [0, -1], to: [1, -2] },
    { block: [-1, 0], to: [-2, 1] }, { block: [-1, 0], to: [-2, -1] },
  ];

  for (const s of steps) {
    const bf = f + s.block[0], br = r + s.block[1];
    const tf = f + s.to[0], tr = r + s.to[1];
    if (!inBoard(tf, tr) || !inBoard(bf, br)) continue;
    if (board[sq(bf, br)]) continue;
    addIfValid(out, board, from, sq(tf, tr), color);
  }

  return out;
}

function elephantMoves(from: string, board: BoardMap, color: Color): Move[] {
  const out: Move[] = [];
  const { f, r } = parseSquare(from);
  const patterns = [
    { b1: [0, 1], b2: [-1, 2], to: [-2, 3] }, { b1: [0, 1], b2: [1, 2], to: [2, 3] },
    { b1: [1, 0], b2: [2, 1], to: [3, 2] }, { b1: [1, 0], b2: [2, -1], to: [3, -2] },
    { b1: [0, -1], b2: [-1, -2], to: [-2, -3] }, { b1: [0, -1], b2: [1, -2], to: [2, -3] },
    { b1: [-1, 0], b2: [-2, 1], to: [-3, 2] }, { b1: [-1, 0], b2: [-2, -1], to: [-3, -2] },
  ];

  for (const p of patterns) {
    const b1 = [f + p.b1[0], r + p.b1[1]] as const;
    const b2 = [f + p.b2[0], r + p.b2[1]] as const;
    const to = [f + p.to[0], r + p.to[1]] as const;
    if (!inBoard(to[0], to[1]) || !inBoard(b1[0], b1[1]) || !inBoard(b2[0], b2[1])) continue;
    if (board[sq(b1[0], b1[1])] || board[sq(b2[0], b2[1])]) continue;
    addIfValid(out, board, from, sq(to[0], to[1]), color);
  }

  return out;
}

function soldierMoves(from: string, board: BoardMap, color: Color): Move[] {
  const out: Move[] = [];
  const { f, r } = parseSquare(from);
  const dr = color === 'w' ? 1 : -1;

  [[0, dr], [1, 0], [-1, 0]].forEach(([df, rr]) => {
    const nf = f + df, nr = r + rr;
    if (!inBoard(nf, nr)) return;
    addIfValid(out, board, from, sq(nf, nr), color);
  });

  return out;
}

export function legalMovesForSquare(board: BoardMap, from: string, rules: JanggiRuleSet): Move[] {
  const piece = board[from];
  if (!piece) return [];

  switch (piece.type) {
    case 'rook': return rookMoves(from, board, piece.color, rules);
    case 'cannon': return cannonMoves(from, board, piece.color, rules);
    case 'king': return kingGuardMoves(from, board, piece.color, rules, true);
    case 'guard': return kingGuardMoves(from, board, piece.color, rules, false);
    case 'horse': return horseMoves(from, board, piece.color);
    case 'elephant': return elephantMoves(from, board, piece.color);
    case 'soldier': return soldierMoves(from, board, piece.color);
  }
}

export function legalMoves(board: BoardMap, turn: Color, rules: JanggiRuleSet): Move[] {
  const out: Move[] = [];
  for (const k of Object.keys(board)) {
    if (board[k].color !== turn) continue;
    out.push(...legalMovesForSquare(board, k, rules));
  }
  return out;
}

export function applyMove(board: BoardMap, move: Move): BoardMap {
  const nb: BoardMap = { ...board };
  const piece = nb[move.from];
  if (!piece) return nb;
  delete nb[move.from];
  nb[move.to] = piece;
  return nb;
}

export function winner(board: BoardMap): Color | null {
  let w = false;
  let b = false;

  for (const p of Object.values(board)) {
    if (p.type === 'king' && p.color === 'w') w = true;
    if (p.type === 'king' && p.color === 'b') b = true;
  }

  if (w && b) return null;
  if (w) return 'w';
  if (b) return 'b';
  return null;
}

export type { BoardMap, Color, Move } from './types';
