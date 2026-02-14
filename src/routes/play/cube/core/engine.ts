import type { CubeState, Face, Color, FaceColors } from './types';

// Get the initial color for each face
export function getColor(face: Face): Color {
  const colorMap: Record<Face, Color> = {
    U: 'white',
    D: 'yellow',
    F: 'red',
    B: 'orange',
    L: 'blue',
    R: 'green'
  };
  return colorMap[face];
}

// Create a 3x3 grid filled with a single color
function createFace(color: Color): FaceColors {
  return Array.from({ length: 3 }, () => Array(3).fill(color));
}

// Deep clone a face
function cloneFace(face: FaceColors): FaceColors {
  return face.map(row => [...row]);
}

// Rotate a 3x3 grid 90 degrees clockwise
function rotateGrid90(grid: FaceColors): FaceColors {
  const newGrid: FaceColors = Array.from({ length: 3 }, () => Array(3).fill('white'));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      newGrid[j][2 - i] = grid[i][j];
    }
  }
  return newGrid;
}

// Rotate a 3x3 grid 90 degrees counter-clockwise
function rotateGrid90CCW(grid: FaceColors): FaceColors {
  const newGrid: FaceColors = Array.from({ length: 3 }, () => Array(3).fill('white'));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      newGrid[2 - j][i] = grid[i][j];
    }
  }
  return newGrid;
}

// Rotate a face and update adjacent edges
export function rotateFace(state: CubeState, face: Face, clockwise: boolean): CubeState {
  const newState = {
    ...state,
    faces: {
      U: cloneFace(state.faces.U),
      D: cloneFace(state.faces.D),
      L: cloneFace(state.faces.L),
      R: cloneFace(state.faces.R),
      F: cloneFace(state.faces.F),
      B: cloneFace(state.faces.B)
    }
  };

  // Rotate the face itself
  newState.faces[face] = clockwise
    ? rotateGrid90(state.faces[face])
    : rotateGrid90CCW(state.faces[face]);

  // Define edge cycling for each face
  // Each entry: [face, getEdge, setEdge]
  // getEdge/setEdge functions extract/insert a 3-element array

  if (face === 'U') {
    // U face: cycles F-top -> L-top -> B-top -> R-top
    const edges = clockwise
      ? [
          { face: 'F' as Face, get: (f: FaceColors) => f[0], set: (f: FaceColors, e: Color[]) => { f[0] = e; } },
          { face: 'L' as Face, get: (f: FaceColors) => f[0], set: (f: FaceColors, e: Color[]) => { f[0] = e; } },
          { face: 'B' as Face, get: (f: FaceColors) => f[0], set: (f: FaceColors, e: Color[]) => { f[0] = e; } },
          { face: 'R' as Face, get: (f: FaceColors) => f[0], set: (f: FaceColors, e: Color[]) => { f[0] = e; } }
        ]
      : [
          { face: 'F' as Face, get: (f: FaceColors) => f[0], set: (f: FaceColors, e: Color[]) => { f[0] = e; } },
          { face: 'R' as Face, get: (f: FaceColors) => f[0], set: (f: FaceColors, e: Color[]) => { f[0] = e; } },
          { face: 'B' as Face, get: (f: FaceColors) => f[0], set: (f: FaceColors, e: Color[]) => { f[0] = e; } },
          { face: 'L' as Face, get: (f: FaceColors) => f[0], set: (f: FaceColors, e: Color[]) => { f[0] = e; } }
        ];

    const temp = edges[0].get(state.faces[edges[0].face]);
    for (let i = 0; i < edges.length - 1; i++) {
      edges[i].set(newState.faces[edges[i].face], edges[i + 1].get(state.faces[edges[i + 1].face]));
    }
    edges[edges.length - 1].set(newState.faces[edges[edges.length - 1].face], temp);
  } else if (face === 'D') {
    // D face: cycles F-bottom -> R-bottom -> B-bottom -> L-bottom
    const edges = clockwise
      ? [
          { face: 'F' as Face, get: (f: FaceColors) => f[2], set: (f: FaceColors, e: Color[]) => { f[2] = e; } },
          { face: 'R' as Face, get: (f: FaceColors) => f[2], set: (f: FaceColors, e: Color[]) => { f[2] = e; } },
          { face: 'B' as Face, get: (f: FaceColors) => f[2], set: (f: FaceColors, e: Color[]) => { f[2] = e; } },
          { face: 'L' as Face, get: (f: FaceColors) => f[2], set: (f: FaceColors, e: Color[]) => { f[2] = e; } }
        ]
      : [
          { face: 'F' as Face, get: (f: FaceColors) => f[2], set: (f: FaceColors, e: Color[]) => { f[2] = e; } },
          { face: 'L' as Face, get: (f: FaceColors) => f[2], set: (f: FaceColors, e: Color[]) => { f[2] = e; } },
          { face: 'B' as Face, get: (f: FaceColors) => f[2], set: (f: FaceColors, e: Color[]) => { f[2] = e; } },
          { face: 'R' as Face, get: (f: FaceColors) => f[2], set: (f: FaceColors, e: Color[]) => { f[2] = e; } }
        ];

    const temp = edges[0].get(state.faces[edges[0].face]);
    for (let i = 0; i < edges.length - 1; i++) {
      edges[i].set(newState.faces[edges[i].face], edges[i + 1].get(state.faces[edges[i + 1].face]));
    }
    edges[edges.length - 1].set(newState.faces[edges[edges.length - 1].face], temp);
  } else if (face === 'F') {
    // F face: cycles U-bottom -> R-left -> D-top -> L-right
    if (clockwise) {
      const uBottom = state.faces.U[2];
      const rLeft = [state.faces.R[0][0], state.faces.R[1][0], state.faces.R[2][0]];
      const dTop = state.faces.D[0];
      const lRight = [state.faces.L[0][2], state.faces.L[1][2], state.faces.L[2][2]];

      newState.faces.U[2] = [lRight[2], lRight[1], lRight[0]];
      newState.faces.R[0][0] = uBottom[0];
      newState.faces.R[1][0] = uBottom[1];
      newState.faces.R[2][0] = uBottom[2];
      newState.faces.D[0] = [rLeft[2], rLeft[1], rLeft[0]];
      newState.faces.L[0][2] = dTop[0];
      newState.faces.L[1][2] = dTop[1];
      newState.faces.L[2][2] = dTop[2];
    } else {
      const uBottom = state.faces.U[2];
      const rLeft = [state.faces.R[0][0], state.faces.R[1][0], state.faces.R[2][0]];
      const dTop = state.faces.D[0];
      const lRight = [state.faces.L[0][2], state.faces.L[1][2], state.faces.L[2][2]];

      newState.faces.U[2] = rLeft;
      newState.faces.R[0][0] = dTop[2];
      newState.faces.R[1][0] = dTop[1];
      newState.faces.R[2][0] = dTop[0];
      newState.faces.D[0] = lRight;
      newState.faces.L[0][2] = uBottom[2];
      newState.faces.L[1][2] = uBottom[1];
      newState.faces.L[2][2] = uBottom[0];
    }
  } else if (face === 'B') {
    // B face: cycles U-top -> L-left -> D-bottom -> R-right
    if (clockwise) {
      const uTop = state.faces.U[0];
      const lLeft = [state.faces.L[0][0], state.faces.L[1][0], state.faces.L[2][0]];
      const dBottom = state.faces.D[2];
      const rRight = [state.faces.R[0][2], state.faces.R[1][2], state.faces.R[2][2]];

      newState.faces.U[0] = rRight;
      newState.faces.L[0][0] = uTop[2];
      newState.faces.L[1][0] = uTop[1];
      newState.faces.L[2][0] = uTop[0];
      newState.faces.D[2] = [lLeft[2], lLeft[1], lLeft[0]];
      newState.faces.R[0][2] = dBottom[0];
      newState.faces.R[1][2] = dBottom[1];
      newState.faces.R[2][2] = dBottom[2];
    } else {
      const uTop = state.faces.U[0];
      const lLeft = [state.faces.L[0][0], state.faces.L[1][0], state.faces.L[2][0]];
      const dBottom = state.faces.D[2];
      const rRight = [state.faces.R[0][2], state.faces.R[1][2], state.faces.R[2][2]];

      newState.faces.U[0] = [lLeft[2], lLeft[1], lLeft[0]];
      newState.faces.L[0][0] = dBottom[2];
      newState.faces.L[1][0] = dBottom[1];
      newState.faces.L[2][0] = dBottom[0];
      newState.faces.D[2] = rRight;
      newState.faces.R[0][2] = uTop[0];
      newState.faces.R[1][2] = uTop[1];
      newState.faces.R[2][2] = uTop[2];
    }
  } else if (face === 'L') {
    // L face: cycles U-left -> F-left -> D-left -> B-right
    if (clockwise) {
      const uLeft = [state.faces.U[0][0], state.faces.U[1][0], state.faces.U[2][0]];
      const fLeft = [state.faces.F[0][0], state.faces.F[1][0], state.faces.F[2][0]];
      const dLeft = [state.faces.D[0][0], state.faces.D[1][0], state.faces.D[2][0]];
      const bRight = [state.faces.B[0][2], state.faces.B[1][2], state.faces.B[2][2]];

      newState.faces.U[0][0] = bRight[2];
      newState.faces.U[1][0] = bRight[1];
      newState.faces.U[2][0] = bRight[0];
      newState.faces.F[0][0] = uLeft[0];
      newState.faces.F[1][0] = uLeft[1];
      newState.faces.F[2][0] = uLeft[2];
      newState.faces.D[0][0] = fLeft[0];
      newState.faces.D[1][0] = fLeft[1];
      newState.faces.D[2][0] = fLeft[2];
      newState.faces.B[0][2] = dLeft[2];
      newState.faces.B[1][2] = dLeft[1];
      newState.faces.B[2][2] = dLeft[0];
    } else {
      const uLeft = [state.faces.U[0][0], state.faces.U[1][0], state.faces.U[2][0]];
      const fLeft = [state.faces.F[0][0], state.faces.F[1][0], state.faces.F[2][0]];
      const dLeft = [state.faces.D[0][0], state.faces.D[1][0], state.faces.D[2][0]];
      const bRight = [state.faces.B[0][2], state.faces.B[1][2], state.faces.B[2][2]];

      newState.faces.U[0][0] = fLeft[0];
      newState.faces.U[1][0] = fLeft[1];
      newState.faces.U[2][0] = fLeft[2];
      newState.faces.F[0][0] = dLeft[0];
      newState.faces.F[1][0] = dLeft[1];
      newState.faces.F[2][0] = dLeft[2];
      newState.faces.D[0][0] = bRight[2];
      newState.faces.D[1][0] = bRight[1];
      newState.faces.D[2][0] = bRight[0];
      newState.faces.B[0][2] = uLeft[2];
      newState.faces.B[1][2] = uLeft[1];
      newState.faces.B[2][2] = uLeft[0];
    }
  } else if (face === 'R') {
    // R face: cycles U-right -> B-left -> D-right -> F-right
    if (clockwise) {
      const uRight = [state.faces.U[0][2], state.faces.U[1][2], state.faces.U[2][2]];
      const bLeft = [state.faces.B[0][0], state.faces.B[1][0], state.faces.B[2][0]];
      const dRight = [state.faces.D[0][2], state.faces.D[1][2], state.faces.D[2][2]];
      const fRight = [state.faces.F[0][2], state.faces.F[1][2], state.faces.F[2][2]];

      newState.faces.U[0][2] = fRight[0];
      newState.faces.U[1][2] = fRight[1];
      newState.faces.U[2][2] = fRight[2];
      newState.faces.B[0][0] = dRight[2];
      newState.faces.B[1][0] = dRight[1];
      newState.faces.B[2][0] = dRight[0];
      newState.faces.D[0][2] = bLeft[2];
      newState.faces.D[1][2] = bLeft[1];
      newState.faces.D[2][2] = bLeft[0];
      newState.faces.F[0][2] = uRight[0];
      newState.faces.F[1][2] = uRight[1];
      newState.faces.F[2][2] = uRight[2];
    } else {
      const uRight = [state.faces.U[0][2], state.faces.U[1][2], state.faces.U[2][2]];
      const bLeft = [state.faces.B[0][0], state.faces.B[1][0], state.faces.B[2][0]];
      const dRight = [state.faces.D[0][2], state.faces.D[1][2], state.faces.D[2][2]];
      const fRight = [state.faces.F[0][2], state.faces.F[1][2], state.faces.F[2][2]];

      newState.faces.U[0][2] = bLeft[2];
      newState.faces.U[1][2] = bLeft[1];
      newState.faces.U[2][2] = bLeft[0];
      newState.faces.B[0][0] = dRight[2];
      newState.faces.B[1][0] = dRight[1];
      newState.faces.B[2][0] = dRight[0];
      newState.faces.D[0][2] = fRight[0];
      newState.faces.D[1][2] = fRight[1];
      newState.faces.D[2][2] = fRight[2];
      newState.faces.F[0][2] = uRight[0];
      newState.faces.F[1][2] = uRight[1];
      newState.faces.F[2][2] = uRight[2];
    }
  }

  return newState;
}

// Parse and apply a move string (e.g., "R", "U'", "F2")
export function applyMove(state: CubeState, move: string): CubeState {
  const face = move[0] as Face;
  const modifier = move.slice(1);

  let newState = state;

  if (modifier === '' || modifier === '1') {
    // Single clockwise rotation
    newState = rotateFace(newState, face, true);
  } else if (modifier === "'") {
    // Counter-clockwise rotation
    newState = rotateFace(newState, face, false);
  } else if (modifier === '2') {
    // Double rotation (180 degrees)
    newState = rotateFace(newState, face, true);
    newState = rotateFace(newState, face, true);
  }

  return newState;
}

// Scramble the cube with random moves
export function scramble(state: CubeState, numMoves = 20): CubeState {
  const faces: Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];
  const modifiers = ['', "'", '2'];

  let newState = state;
  const moves: string[] = [];

  for (let i = 0; i < numMoves; i++) {
    const face = faces[Math.floor(Math.random() * faces.length)];
    const modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
    const move = face + modifier;
    moves.push(move);
    newState = applyMove(newState, move);
  }

  return {
    ...newState,
    moves: [...newState.moves, ...moves],
    moveCount: newState.moveCount + numMoves,
    scrambled: true
  };
}

// Check if the cube is solved
export function isSolved(state: CubeState): boolean {
  const faces: Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];

  for (const face of faces) {
    const faceColors = state.faces[face];
    const firstColor = faceColors[0][0];

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (faceColors[i][j] !== firstColor) {
          return false;
        }
      }
    }
  }

  return true;
}

// Create a new solved cube
export function newGame(): CubeState {
  return {
    faces: {
      U: createFace('white'),
      D: createFace('yellow'),
      L: createFace('blue'),
      R: createFace('green'),
      F: createFace('red'),
      B: createFace('orange')
    },
    moves: [],
    moveCount: 0,
    scrambled: false,
    status: 'solved',
    agentSpeech: 'Ready to solve the cube!',
    agentMood: 'calm'
  };
}
