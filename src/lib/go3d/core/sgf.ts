import { createBoard } from './goRules';
import type { Board, GoPuzzle, PlayerStone } from './types';

export function sgfToXY(s: string) {
  const x = s.charCodeAt(0) - 97;
  const y = s.charCodeAt(1) - 97;
  return { x, y };
}

function parseProps(src: string, key: string): string[] {
  const re = new RegExp(`${key}\\[([^\\]]+)\\]`, 'g');
  const out: string[] = [];
  for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
}

export function parsePuzzleSgf(puzzle: GoPuzzle): { board: Board; toPlay: PlayerStone } {
  const sizeMatch = puzzle.sgf.match(/SZ\[(\d+)\]/);
  const size = sizeMatch ? Number(sizeMatch[1]) : puzzle.size;
  const board = createBoard(size);

  for (const s of parseProps(puzzle.sgf, 'AB')) {
    const { x, y } = sgfToXY(s);
    if (board[y]?.[x] !== undefined) board[y][x] = 1;
  }

  for (const s of parseProps(puzzle.sgf, 'AW')) {
    const { x, y } = sgfToXY(s);
    if (board[y]?.[x] !== undefined) board[y][x] = 2;
  }

  const pl = parseProps(puzzle.sgf, 'PL')[0] ?? puzzle.toPlay;
  const toPlay: PlayerStone = pl === 'W' ? 2 : 1;

  return { board, toPlay };
}
