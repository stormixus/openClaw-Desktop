import type { Board, GoPuzzle, Move } from './types';

export type ValidateResult =
  | { ok: true; verdict: 'correct'; success: true }
  | { ok: false; verdict: 'wrong' | 'illegal'; reason?: string; success: false; expected?: { x: number; y: number }[] };

export function validateFirstMove(puzzle: GoPuzzle, move: Move, legal: boolean): ValidateResult {
  if (!legal) return { ok: false, verdict: 'illegal', reason: 'illegal move', success: false };
  const matched = puzzle.answers.some((a) => a.x === move.x && a.y === move.y);
  if (matched) return { ok: true, verdict: 'correct', success: true };
  return { ok: false, verdict: 'wrong', reason: 'Not in answer set', success: false, expected: puzzle.answers };
}

export function loadPuzzleById(id: string, puzzles: GoPuzzle[]): GoPuzzle {
  const p = puzzles.find((x) => x.id === id);
  if (!p) throw new Error(`Puzzle not found: ${id}`);
  return p;
}

export function boardToPretty(board: Board): string {
  return board.map((row) => row.join(' ')).join('\n');
}
