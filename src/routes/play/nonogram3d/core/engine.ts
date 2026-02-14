import type { CellState, Clue, Difficulty, NonogramState } from './types';

/**
 * Derive clue sequences from a solution grid
 */
export function deriveClues(solution: boolean[][]): { rowClues: Clue[]; colClues: Clue[] } {
  const height = solution.length;
  const width = solution[0]?.length || 0;

  const rowClues: Clue[] = [];
  for (let y = 0; y < height; y++) {
    const clue: number[] = [];
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (solution[y][x]) {
        count++;
      } else if (count > 0) {
        clue.push(count);
        count = 0;
      }
    }
    if (count > 0) clue.push(count);
    rowClues.push(clue.length > 0 ? clue : [0]);
  }

  const colClues: Clue[] = [];
  for (let x = 0; x < width; x++) {
    const clue: number[] = [];
    let count = 0;
    for (let y = 0; y < height; y++) {
      if (solution[y][x]) {
        count++;
      } else if (count > 0) {
        clue.push(count);
        count = 0;
      }
    }
    if (count > 0) clue.push(count);
    colClues.push(clue.length > 0 ? clue : [0]);
  }

  return { rowClues, colClues };
}

/**
 * Generate a random puzzle with specified dimensions and density
 */
export function generatePuzzle(width: number, height: number, density = 0.5): NonogramState {
  const solution: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      row.push(Math.random() < density);
    }
    solution.push(row);
  }

  const { rowClues, colClues } = deriveClues(solution);

  const grid: CellState[][] = [];
  for (let y = 0; y < height; y++) {
    const row: CellState[] = [];
    for (let x = 0; x < width; x++) {
      row.push('empty');
    }
    grid.push(row);
  }

  return {
    width,
    height,
    solution,
    grid,
    rowClues,
    colClues,
    status: 'playing',
    elapsedMs: 0,
    difficulty: 'easy',
    agentSpeech: 'Use logic to reveal the hidden picture. Fill cells or mark with X.',
    agentMood: 'calm',
  };
}

/**
 * Check if the player has won
 */
export function checkWin(grid: CellState[][], solution: boolean[][]): boolean {
  const height = grid.length;
  const width = grid[0]?.length || 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const shouldBeFilled = solution[y][x];
      const isFilled = grid[y][x] === 'filled';
      if (shouldBeFilled !== isFilled) return false;
    }
  }

  return true;
}

/**
 * Create a new game with preset difficulty
 */
export function newGame(difficulty: Difficulty): NonogramState {
  let width = 5;
  let height = 5;
  let density = 0.5;

  switch (difficulty) {
    case 'easy':
      width = 5;
      height = 5;
      density = 0.5;
      break;
    case 'medium':
      width = 10;
      height = 10;
      density = 0.5;
      break;
    case 'hard':
      width = 15;
      height = 15;
      density = 0.5;
      break;
  }

  const state = generatePuzzle(width, height, density);
  state.difficulty = difficulty;
  state.startedAt = Date.now();
  return state;
}
