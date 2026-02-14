import type { ApplyResult, Board, Move, PlayerStone, Stone } from './types';

// =============================================================================
// Board Utilities
// =============================================================================

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

// =============================================================================
// Move Application
// =============================================================================

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

// =============================================================================
// Coordinate Notation (Go standard: A-T skipping I, 1-indexed from bottom)
// =============================================================================

const GO_COLS = 'ABCDEFGHJKLMNOPQRST';

export function coordToStr(x: number, y: number, size: number): string {
  return `${GO_COLS[x]}${size - y}`;
}

export function strToCoord(s: string, size: number): { x: number; y: number } | null {
  if (!s || s.length < 2) return null;
  const col = GO_COLS.indexOf(s[0].toUpperCase());
  if (col < 0 || col >= size) return null;
  const row = parseInt(s.slice(1));
  if (isNaN(row) || row < 1 || row > size) return null;
  return { x: col, y: size - row };
}

// =============================================================================
// Scoring (Chinese rules — area scoring + komi)
// =============================================================================

export function computeScore(board: Board, size: number, komi = 6.5): { black: number; white: number } {
  const visited = new Set<string>();
  let blackArea = 0;
  let whiteArea = 0;

  // Count stones
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] === 1) blackArea++;
      else if (board[y][x] === 2) whiteArea++;
    }
  }

  // Flood-fill empty regions to determine territory
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== 0 || visited.has(`${x},${y}`)) continue;

      const region: { x: number; y: number }[] = [];
      const queue = [{ x, y }];
      let touchesBlack = false;
      let touchesWhite = false;

      while (queue.length) {
        const cur = queue.pop()!;
        const k = `${cur.x},${cur.y}`;
        if (visited.has(k)) continue;
        visited.add(k);

        if (board[cur.y][cur.x] === 1) { touchesBlack = true; continue; }
        if (board[cur.y][cur.x] === 2) { touchesWhite = true; continue; }

        region.push(cur);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cur.x + dx, ny = cur.y + dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size && !visited.has(`${nx},${ny}`)) {
            queue.push({ x: nx, y: ny });
          }
        }
      }

      if (touchesBlack && !touchesWhite) blackArea += region.length;
      else if (touchesWhite && !touchesBlack) whiteArea += region.length;
    }
  }

  return { black: blackArea, white: whiteArea + komi };
}

// =============================================================================
// Board → ASCII Text (for LLM prompts)
// =============================================================================

export function boardToText(board: Board, size: number): string {
  const sym = ['.', 'X', 'O'];
  const lines: string[] = [];
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) row += sym[board[y]?.[x] ?? 0] + ' ';
    lines.push(`${String(size - y).padStart(2)} ${row.trimEnd()}`);
  }
  const cols = GO_COLS.slice(0, size).split('');
  lines.push(`   ${cols.join(' ')}`);
  return lines.join('\n');
}

// =============================================================================
// LLM Prompt & Response Parsing
// =============================================================================

export function buildGoPrompt(
  board: Board,
  size: number,
  turn: PlayerStone,
  moveList: string[],
  capturedByBlack: number,
  capturedByWhite: number,
): string {
  const ascii = boardToText(board, size);
  const color = turn === 1 ? 'Black (X)' : 'White (O)';

  return `You are playing Go (baduk) as ${color} on a ${size}x${size} board.
Board (X=Black, O=White, .=Empty):
${ascii}

Move history: ${moveList.join(', ') || '(none)'}
Captures - Black: ${capturedByBlack}, White: ${capturedByWhite}

Choose your next move. Consider:
- Territory and influence balance
- Key shapes and vital points
- Liberty counts and capturing races
- Ko situations

Reply with EXACTLY one coordinate (e.g., "D4", "Q16") or "pass" if no good moves remain.
Then give 1-2 sentences of reasoning.`;
}

export function parseLlmGoMove(
  response: string,
  board: Board,
  size: number,
  turn: PlayerStone,
  koHash?: string,
): { x: number; y: number } | 'pass' | null {
  const lower = response.toLowerCase().trim();

  // Check for pass
  if (/\bpass\b/i.test(lower)) return 'pass';

  // Match coordinate patterns like D4, Q16, etc.
  const pattern = /\b([A-HJ-T])(\d{1,2})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(response)) !== null) {
    const coord = strToCoord(match[1] + match[2], size);
    if (!coord) continue;
    if (isLegalMove(board, { x: coord.x, y: coord.y, c: turn }, koHash)) {
      return coord;
    }
  }

  return null;
}

// =============================================================================
// Simple AI (offline fallback — random legal move with basic heuristics)
// =============================================================================

export function pickRandomMove(board: Board, size: number, turn: PlayerStone, koHash?: string): { x: number; y: number } | 'pass' {
  const legal: { x: number; y: number }[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== 0) continue;
      if (isLegalMove(board, { x, y, c: turn }, koHash)) {
        legal.push({ x, y });
      }
    }
  }

  if (legal.length === 0) return 'pass';

  // Prefer moves that capture, are near center, or have more liberties
  const scored = legal.map((m) => {
    let score = 0;
    const result = applyMove(board, { x: m.x, y: m.y, c: turn }, koHash);
    if (result.ok && result.captured.length > 0) score += result.captured.length * 10;

    // Prefer center-ish moves
    const cx = size / 2, cy = size / 2;
    const dist = Math.abs(m.x - cx) + Math.abs(m.y - cy);
    score += Math.max(0, size - dist);

    // Avoid edges on first moves
    if (m.x === 0 || m.x === size - 1 || m.y === 0 || m.y === size - 1) score -= 5;

    // Add randomness
    score += Math.random() * 3;
    return { ...m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}
