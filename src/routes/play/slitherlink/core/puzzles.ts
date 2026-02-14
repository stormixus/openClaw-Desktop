import type { Difficulty } from './types';

export interface Puzzle {
  width: number;
  height: number;
  clues: (number | null)[][];
  difficulty: Difficulty;
}

// Hand-crafted puzzles with unique solutions
export const PUZZLES: Record<Difficulty, Puzzle[]> = {
  easy: [
    {
      width: 5,
      height: 5,
      difficulty: 'easy',
      clues: [
        [null, 2, null, 2, null],
        [1, null, 2, null, 2],
        [null, 3, null, 3, null],
        [2, null, 2, null, 1],
        [null, 2, null, 2, null],
      ],
    },
    {
      width: 5,
      height: 5,
      difficulty: 'easy',
      clues: [
        [null, 2, 2, 2, null],
        [2, null, null, null, 2],
        [2, null, 0, null, 2],
        [2, null, null, null, 2],
        [null, 2, 2, 2, null],
      ],
    },
    {
      width: 5,
      height: 5,
      difficulty: 'easy',
      clues: [
        [2, null, 1, null, 2],
        [null, 2, null, 2, null],
        [3, null, null, null, 3],
        [null, 2, null, 2, null],
        [2, null, 1, null, 2],
      ],
    },
  ],
  medium: [
    {
      width: 7,
      height: 7,
      difficulty: 'medium',
      clues: [
        [null, 2, null, 3, null, 2, null],
        [2, null, 2, null, 2, null, 2],
        [null, 3, null, 2, null, 3, null],
        [1, null, 2, null, 2, null, 1],
        [null, 3, null, 2, null, 3, null],
        [2, null, 2, null, 2, null, 2],
        [null, 2, null, 3, null, 2, null],
      ],
    },
    {
      width: 7,
      height: 7,
      difficulty: 'medium',
      clues: [
        [null, null, 2, null, 2, null, null],
        [null, 2, null, 2, null, 2, null],
        [2, null, 3, null, 3, null, 2],
        [null, 2, null, null, null, 2, null],
        [2, null, 3, null, 3, null, 2],
        [null, 2, null, 2, null, 2, null],
        [null, null, 2, null, 2, null, null],
      ],
    },
    {
      width: 7,
      height: 7,
      difficulty: 'medium',
      clues: [
        [2, null, null, 3, null, null, 2],
        [null, 2, 1, null, 1, 2, null],
        [null, 1, null, 2, null, 1, null],
        [3, null, 2, null, 2, null, 3],
        [null, 1, null, 2, null, 1, null],
        [null, 2, 1, null, 1, 2, null],
        [2, null, null, 3, null, null, 2],
      ],
    },
  ],
  hard: [
    {
      width: 10,
      height: 10,
      difficulty: 'hard',
      clues: [
        [null, 2, null, null, 3, 3, null, null, 2, null],
        [2, null, 2, 2, null, null, 2, 2, null, 2],
        [null, 3, null, null, 2, 2, null, null, 3, null],
        [null, 2, null, 2, null, null, 2, null, 2, null],
        [3, null, 2, null, 1, 1, null, 2, null, 3],
        [3, null, 2, null, 1, 1, null, 2, null, 3],
        [null, 2, null, 2, null, null, 2, null, 2, null],
        [null, 3, null, null, 2, 2, null, null, 3, null],
        [2, null, 2, 2, null, null, 2, 2, null, 2],
        [null, 2, null, null, 3, 3, null, null, 2, null],
      ],
    },
    {
      width: 10,
      height: 10,
      difficulty: 'hard',
      clues: [
        [null, null, 2, 2, null, null, 2, 2, null, null],
        [null, 2, null, null, 3, 3, null, null, 2, null],
        [2, null, 2, 1, null, null, 1, 2, null, 2],
        [2, null, 1, null, 2, 2, null, 1, null, 2],
        [null, 3, null, 2, null, null, 2, null, 3, null],
        [null, 3, null, 2, null, null, 2, null, 3, null],
        [2, null, 1, null, 2, 2, null, 1, null, 2],
        [2, null, 2, 1, null, null, 1, 2, null, 2],
        [null, 2, null, null, 3, 3, null, null, 2, null],
        [null, null, 2, 2, null, null, 2, 2, null, null],
      ],
    },
    {
      width: 10,
      height: 10,
      difficulty: 'hard',
      clues: [
        [2, null, null, 2, 3, 3, 2, null, null, 2],
        [null, 2, 1, null, null, null, null, 1, 2, null],
        [null, 1, null, 2, 2, 2, 2, null, 1, null],
        [2, null, 2, null, null, null, null, 2, null, 2],
        [3, null, 2, null, 1, 1, null, 2, null, 3],
        [3, null, 2, null, 1, 1, null, 2, null, 3],
        [2, null, 2, null, null, null, null, 2, null, 2],
        [null, 1, null, 2, 2, 2, 2, null, 1, null],
        [null, 2, 1, null, null, null, null, 1, 2, null],
        [2, null, null, 2, 3, 3, 2, null, null, 2],
      ],
    },
  ],
};

export function getRandomPuzzle(difficulty: Difficulty): Puzzle {
  const puzzles = PUZZLES[difficulty];
  return puzzles[Math.floor(Math.random() * puzzles.length)];
}
