import type { GridSize, LightsOutState } from './types';

/**
 * Create a new Lights Out game.
 * Generates a solvable puzzle by starting from all-off state and applying random toggles.
 */
export function newGame(size: GridSize, scrambleMoves?: number): LightsOutState {
	const moves = scrambleMoves ?? size * size * 2;
	const grid: boolean[][] = Array.from({ length: size }, () =>
		Array.from({ length: size }, () => false)
	);

	// Apply random toggles to create a solvable puzzle
	for (let i = 0; i < moves; i++) {
		const x = Math.floor(Math.random() * size);
		const y = Math.floor(Math.random() * size);
		applyToggle(grid, x, y);
	}

	return {
		size,
		grid,
		moves: 0,
		status: 'playing',
		agentSpeech: 'Toggle the lights to turn them all off. Each click affects neighbors too!',
		agentMood: 'calm'
	};
}

/**
 * Apply toggle to a cell and its orthogonal neighbors (internal helper).
 */
function applyToggle(grid: boolean[][], x: number, y: number): void {
	const size = grid.length;
	const neighbors = [
		[x, y],
		[x - 1, y],
		[x + 1, y],
		[x, y - 1],
		[x, y + 1]
	];

	for (const [nx, ny] of neighbors) {
		if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
			grid[nx][ny] = !grid[nx][ny];
		}
	}
}

/**
 * Toggle a light at (x, y) and its neighbors.
 * Returns a new state with the toggle applied.
 */
export function toggle(state: LightsOutState, x: number, y: number): LightsOutState {
	const newGrid = state.grid.map((row) => [...row]);
	applyToggle(newGrid, x, y);

	const newMoves = state.moves + 1;
	const isWon = checkWin({ ...state, grid: newGrid });

	return {
		...state,
		grid: newGrid,
		moves: newMoves,
		status: isWon ? 'won' : 'playing',
		agentSpeech: isWon
			? `Victory in ${newMoves} moves! The lights are out!`
			: state.agentSpeech,
		agentMood: isWon ? 'excited' : state.agentMood
	};
}

/**
 * Check if all lights are off (win condition).
 */
export function checkWin(state: LightsOutState): boolean {
	return state.grid.every((row) => row.every((light) => !light));
}

/**
 * Get a hint: find a cell that, when clicked, gets closer to solving the puzzle.
 * Simple heuristic: try each cell, count lights remaining after toggle.
 */
export function hint(state: LightsOutState): { x: number; y: number } | null {
	if (state.status === 'won') return null;

	let bestMove: { x: number; y: number } | null = null;
	let minLights = Infinity;

	for (let x = 0; x < state.size; x++) {
		for (let y = 0; y < state.size; y++) {
			const testState = toggle(state, x, y);
			const lightsOn = testState.grid.flat().filter(Boolean).length;

			if (lightsOn < minLights) {
				minLights = lightsOn;
				bestMove = { x, y };
			}
		}
	}

	return bestMove;
}
