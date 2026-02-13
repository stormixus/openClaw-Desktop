import type { GoPuzzle } from '../core/types';

export const GO_PUZZLES: GoPuzzle[] = [
  {
    id: 'ld-001',
    title: '흑이 살아라',
    size: 19,
    toPlay: 'B',
    sgf: '(;GM[1]SZ[19]AB[dd][de]AW[ce][cd]PL[B])',
    mode: 'BEST_MOVE',
    answers: [{ x: 3, y: 2 }],
    goal: '흑이 한 수로 살려라',
    difficulty: 2,
    tags: ['life&death', 'tesuji'],
  },
];
