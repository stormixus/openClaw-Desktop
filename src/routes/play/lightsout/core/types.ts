export type GridSize = 3 | 4 | 5 | 6 | 7;

export interface LightsOutState {
	size: GridSize;
	grid: boolean[][]; // true = on, false = off
	moves: number;
	status: 'playing' | 'won';
	agentSpeech: string;
	agentMood: 'calm' | 'teasing' | 'serious' | 'excited';
}
