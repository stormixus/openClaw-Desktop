export type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B'; // Up Down Left Right Front Back
export type Color = 'white' | 'yellow' | 'red' | 'orange' | 'blue' | 'green';
export type FaceColors = Color[][]; // 3x3 grid of colors per face

export interface CubeState {
  faces: Record<Face, FaceColors>; // 6 faces, each 3x3
  moves: string[]; // move history (e.g., "R", "U'", "F2")
  moveCount: number;
  scrambled: boolean;
  status: 'playing' | 'solved';
  agentSpeech: string;
  agentMood: 'calm' | 'teasing' | 'serious' | 'excited';
}
