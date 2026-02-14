import type { SlitherlinkState, Edge, EdgeState, Difficulty } from './types';
import { getRandomPuzzle } from './puzzles';

export function newGame(difficulty: Difficulty): SlitherlinkState {
  const puzzle = getRandomPuzzle(difficulty);
  const { width, height, clues } = puzzle;

  // Initialize edge grids with 'none'
  const hEdges: EdgeState[][] = Array.from({ length: height + 1 }, () =>
    Array(width).fill('none')
  );
  const vEdges: EdgeState[][] = Array.from({ length: height }, () =>
    Array(width + 1).fill('none')
  );

  return {
    width,
    height,
    clues,
    hEdges,
    vEdges,
    status: 'playing',
    difficulty,
    elapsedMs: 0,
    startedAt: Date.now(),
    agentSpeech: 'Draw lines to form a single loop. Numbers indicate how many edges around that cell must have lines.',
    agentMood: 'calm',
  };
}

export function toggleEdge(state: SlitherlinkState, edge: Edge): SlitherlinkState {
  if (state.status === 'won') return state;

  const { orientation, row, col } = edge;
  const newState = { ...state };

  if (orientation === 'h') {
    const newHEdges = newState.hEdges.map((r) => [...r]);
    const current = newHEdges[row][col];
    newHEdges[row][col] = current === 'none' ? 'line' : current === 'line' ? 'cross' : 'none';
    newState.hEdges = newHEdges;
  } else {
    const newVEdges = newState.vEdges.map((r) => [...r]);
    const current = newVEdges[row][col];
    newVEdges[row][col] = current === 'none' ? 'line' : current === 'line' ? 'cross' : 'none';
    newState.vEdges = newVEdges;
  }

  // Check win condition
  if (checkWin(newState)) {
    newState.status = 'won';
    newState.agentSpeech = 'Perfect! You found the loop!';
    newState.agentMood = 'excited';
  }

  return newState;
}

// Get the 4 edges around a cell (top, right, bottom, left)
export function getEdgesAroundCell(row: number, col: number): Edge[] {
  return [
    { orientation: 'h', row, col }, // top
    { orientation: 'v', row, col: col + 1 }, // right
    { orientation: 'h', row: row + 1, col }, // bottom
    { orientation: 'v', row, col }, // left
  ];
}

// Count how many 'line' edges are around a cell
export function countLinesAroundCell(state: SlitherlinkState, row: number, col: number): number {
  const edges = getEdgesAroundCell(row, col);
  let count = 0;
  for (const edge of edges) {
    const edgeState = getEdgeState(state, edge);
    if (edgeState === 'line') count++;
  }
  return count;
}

// Get edge state
function getEdgeState(state: SlitherlinkState, edge: Edge): EdgeState {
  if (edge.orientation === 'h') {
    if (edge.row < 0 || edge.row >= state.hEdges.length) return 'none';
    if (edge.col < 0 || edge.col >= state.hEdges[0].length) return 'none';
    return state.hEdges[edge.row][edge.col];
  } else {
    if (edge.row < 0 || edge.row >= state.vEdges.length) return 'none';
    if (edge.col < 0 || edge.col >= state.vEdges[0].length) return 'none';
    return state.vEdges[edge.row][edge.col];
  }
}

// Check if all numbered clues are satisfied
export function checkClues(state: SlitherlinkState): boolean {
  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      const clue = state.clues[row][col];
      if (clue === null) continue;
      const lineCount = countLinesAroundCell(state, row, col);
      if (lineCount !== clue) return false;
    }
  }
  return true;
}

// Check if all line edges form exactly one closed loop
export function checkSingleLoop(state: SlitherlinkState): boolean {
  // Collect all line edges
  const lineEdges: Edge[] = [];
  for (let row = 0; row < state.hEdges.length; row++) {
    for (let col = 0; col < state.hEdges[0].length; col++) {
      if (state.hEdges[row][col] === 'line') {
        lineEdges.push({ orientation: 'h', row, col });
      }
    }
  }
  for (let row = 0; row < state.vEdges.length; row++) {
    for (let col = 0; col < state.vEdges[0].length; col++) {
      if (state.vEdges[row][col] === 'line') {
        lineEdges.push({ orientation: 'v', row, col });
      }
    }
  }

  if (lineEdges.length === 0) return false;

  // Every vertex (grid point) must have exactly 0 or 2 line edges
  const vertexDegrees = new Map<string, number>();

  for (const edge of lineEdges) {
    const [v1, v2] = getEdgeVertices(edge);
    vertexDegrees.set(v1, (vertexDegrees.get(v1) || 0) + 1);
    vertexDegrees.set(v2, (vertexDegrees.get(v2) || 0) + 1);
  }

  // Check all vertices have degree 0 or 2
  for (const degree of vertexDegrees.values()) {
    if (degree !== 2) return false;
  }

  // BFS to check all edges form a single connected component
  const visited = new Set<string>();
  const queue: Edge[] = [lineEdges[0]];
  visited.add(edgeKey(lineEdges[0]));

  while (queue.length > 0) {
    const edge = queue.shift()!;
    const connectedEdges = getConnectedEdges(state, edge);

    for (const connected of connectedEdges) {
      const key = edgeKey(connected);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(connected);
      }
    }
  }

  // All line edges should be visited
  return visited.size === lineEdges.length;
}

// Get the two vertices (grid points) of an edge
function getEdgeVertices(edge: Edge): [string, string] {
  if (edge.orientation === 'h') {
    // Horizontal edge: connects (row, col) to (row, col+1)
    return [`${edge.row},${edge.col}`, `${edge.row},${edge.col + 1}`];
  } else {
    // Vertical edge: connects (row, col) to (row+1, col)
    return [`${edge.row},${edge.col}`, `${edge.row + 1},${edge.col}`];
  }
}

// Get edges connected to this edge (sharing a vertex)
export function getConnectedEdges(state: SlitherlinkState, edge: Edge): Edge[] {
  const [v1, v2] = getEdgeVertices(edge);
  const connected: Edge[] = [];

  // Parse vertices
  const [r1, c1] = v1.split(',').map(Number);
  const [r2, c2] = v2.split(',').map(Number);

  // Check all edges touching v1
  const v1Edges = getEdgesAtVertex(r1, c1, state);
  for (const e of v1Edges) {
    if (!edgesEqual(e, edge) && getEdgeState(state, e) === 'line') {
      connected.push(e);
    }
  }

  // Check all edges touching v2
  const v2Edges = getEdgesAtVertex(r2, c2, state);
  for (const e of v2Edges) {
    if (!edgesEqual(e, edge) && getEdgeState(state, e) === 'line') {
      connected.push(e);
    }
  }

  return connected;
}

// Get all edges touching a vertex (grid point)
function getEdgesAtVertex(row: number, col: number, state: SlitherlinkState): Edge[] {
  const edges: Edge[] = [];

  // Horizontal edges
  if (col > 0 && row >= 0 && row < state.hEdges.length && col - 1 < state.hEdges[0].length) {
    edges.push({ orientation: 'h', row, col: col - 1 }); // left
  }
  if (row >= 0 && row < state.hEdges.length && col < state.hEdges[0].length) {
    edges.push({ orientation: 'h', row, col }); // right
  }

  // Vertical edges
  if (row > 0 && row - 1 < state.vEdges.length && col >= 0 && col < state.vEdges[0].length) {
    edges.push({ orientation: 'v', row: row - 1, col }); // up
  }
  if (row < state.vEdges.length && col >= 0 && col < state.vEdges[0].length) {
    edges.push({ orientation: 'v', row, col }); // down
  }

  return edges;
}

// Create unique key for edge
function edgeKey(edge: Edge): string {
  return `${edge.orientation}-${edge.row}-${edge.col}`;
}

function edgesEqual(e1: Edge, e2: Edge): boolean {
  return e1.orientation === e2.orientation && e1.row === e2.row && e1.col === e2.col;
}

// Check win: all clues satisfied AND single loop formed
export function checkWin(state: SlitherlinkState): boolean {
  return checkClues(state) && checkSingleLoop(state);
}

// Get violation status for a cell (for coloring)
export function getCellStatus(
  state: SlitherlinkState,
  row: number,
  col: number
): 'satisfied' | 'violated' | 'neutral' {
  const clue = state.clues[row][col];
  if (clue === null) return 'neutral';

  const lineCount = countLinesAroundCell(state, row, col);
  const crossCount = getEdgesAroundCell(row, col).filter(
    (e) => getEdgeState(state, e) === 'cross'
  ).length;

  // Violated if lineCount > clue, or if impossible to satisfy
  if (lineCount > clue) return 'violated';
  if (lineCount + (4 - lineCount - crossCount) < clue) return 'violated';

  // Satisfied if exactly matches
  if (lineCount === clue) return 'satisfied';

  return 'neutral';
}
