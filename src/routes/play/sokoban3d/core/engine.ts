import type { SokobanLevel, SokobanState, Dir, Pos, CellType } from './types';

export function parseLevel(data: string, id: string, title: string): SokobanLevel {
  const lines = data.split('\n').filter(line => line.length > 0);
  const height = lines.length;
  const width = Math.max(...lines.map(line => line.length));

  const grid: CellType[][] = [];
  let player: Pos = { x: 0, y: 0 };
  const boxes: Pos[] = [];
  const targets: Pos[] = [];

  for (let y = 0; y < height; y++) {
    const row: CellType[] = [];
    const line = lines[y] || '';

    for (let x = 0; x < width; x++) {
      const char = line[x] || ' ';

      switch (char) {
        case '#':
          row.push('wall');
          break;
        case '@':
          player = { x, y };
          row.push('floor');
          break;
        case '+':
          player = { x, y };
          targets.push({ x, y });
          row.push('target');
          break;
        case '$':
          boxes.push({ x, y });
          row.push('floor');
          break;
        case '*':
          boxes.push({ x, y });
          targets.push({ x, y });
          row.push('target');
          break;
        case '.':
          targets.push({ x, y });
          row.push('target');
          break;
        default:
          row.push('floor');
      }
    }
    grid.push(row);
  }

  return {
    id,
    title,
    width,
    height,
    grid,
    player,
    boxes,
    targets
  };
}

function getCellAt(level: SokobanLevel, pos: Pos): CellType | null {
  if (pos.y < 0 || pos.y >= level.height || pos.x < 0 || pos.x >= level.width) {
    return null;
  }
  return level.grid[pos.y][pos.x];
}

function getNextPos(pos: Pos, dir: Dir): Pos {
  switch (dir) {
    case 'up':
      return { x: pos.x, y: pos.y - 1 };
    case 'down':
      return { x: pos.x, y: pos.y + 1 };
    case 'left':
      return { x: pos.x - 1, y: pos.y };
    case 'right':
      return { x: pos.x + 1, y: pos.y };
  }
}

function posEquals(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

function hasBoxAt(boxes: Pos[], pos: Pos): boolean {
  return boxes.some(box => posEquals(box, pos));
}

export function canMove(state: SokobanState, dir: Dir): boolean {
  const nextPos = getNextPos(state.playerPos, dir);
  const cell = getCellAt(state.level, nextPos);

  if (!cell || cell === 'wall') {
    return false;
  }

  if (hasBoxAt(state.boxes, nextPos)) {
    const boxNextPos = getNextPos(nextPos, dir);
    const boxNextCell = getCellAt(state.level, boxNextPos);

    if (!boxNextCell || boxNextCell === 'wall') {
      return false;
    }

    if (hasBoxAt(state.boxes, boxNextPos)) {
      return false;
    }
  }

  return true;
}

export function move(state: SokobanState, dir: Dir): SokobanState {
  if (!canMove(state, dir)) {
    return state;
  }

  const nextPos = getNextPos(state.playerPos, dir);
  const newBoxes = [...state.boxes];
  let pushes = state.pushes;

  const boxIndex = state.boxes.findIndex(box => posEquals(box, nextPos));
  if (boxIndex !== -1) {
    const boxNextPos = getNextPos(nextPos, dir);
    newBoxes[boxIndex] = boxNextPos;
    pushes++;
  }

  const history = [...state.history, { player: state.playerPos, boxes: state.boxes }];

  return {
    ...state,
    playerPos: nextPos,
    boxes: newBoxes,
    history,
    moves: state.moves + 1,
    pushes,
    status: checkWin({ ...state, boxes: newBoxes }) ? 'won' : 'playing'
  };
}

export function checkWin(state: SokobanState): boolean {
  return state.boxes.every(box =>
    state.level.targets.some(target => posEquals(box, target))
  );
}

export function undo(state: SokobanState): SokobanState {
  if (state.history.length === 0) {
    return state;
  }

  const history = [...state.history];
  const last = history.pop()!;

  const pushDiff = state.boxes.some((box, i) =>
    !posEquals(box, state.history[state.history.length - 1]?.boxes[i] || state.level.boxes[i])
  ) ? 1 : 0;

  return {
    ...state,
    playerPos: last.player,
    boxes: last.boxes,
    history,
    moves: state.moves - 1,
    pushes: state.pushes - pushDiff,
    status: 'playing'
  };
}

export function resetLevel(state: SokobanState): SokobanState {
  return {
    ...state,
    playerPos: state.level.player,
    boxes: state.level.boxes,
    history: [],
    moves: 0,
    pushes: 0,
    status: 'playing'
  };
}

export function loadLevel(levelData: { id: string; title: string; data: string }): SokobanLevel {
  return parseLevel(levelData.data, levelData.id, levelData.title);
}
