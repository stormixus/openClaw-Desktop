import type { RulesLevel } from '../core/types';

export const R3D_LEVEL_002: RulesLevel = {
  id: 'r3d-002',
  title: 'Key and Door',
  size: { w: 14, h: 10 },
  objects: [
    // Walls forming a corridor
    { kind: 'ENTITY', type: 'WALL', x: 0, y: 0 },
    { kind: 'ENTITY', type: 'WALL', x: 1, y: 0 },
    { kind: 'ENTITY', type: 'WALL', x: 2, y: 0 },
    { kind: 'ENTITY', type: 'WALL', x: 3, y: 0 },
    { kind: 'ENTITY', type: 'WALL', x: 0, y: 1 },
    { kind: 'ENTITY', type: 'WALL', x: 0, y: 2 },
    { kind: 'ENTITY', type: 'WALL', x: 0, y: 3 },
    // Door blocking the path
    { kind: 'ENTITY', type: 'DOOR', x: 6, y: 4 },
    { kind: 'ENTITY', type: 'DOOR', x: 6, y: 5 },
    { kind: 'ENTITY', type: 'DOOR', x: 6, y: 6 },
    // Key to collect
    { kind: 'ENTITY', type: 'KEY', x: 3, y: 7 },
    // Player
    { kind: 'ENTITY', type: 'PLAYER', x: 2, y: 4 },
    // Goal behind door
    { kind: 'ENTITY', type: 'GOAL', x: 11, y: 4 },
    // Lava hazard
    { kind: 'ENTITY', type: 'LAVA', x: 9, y: 7 },
    { kind: 'ENTITY', type: 'LAVA', x: 10, y: 7 },
    // Rules: PLAYER IS YOU (pre-formed)
    { kind: 'WORD', type: 'PLAYER', x: 1, y: 9 },
    { kind: 'WORD', type: 'IS', x: 2, y: 9 },
    { kind: 'WORD', type: 'YOU', x: 3, y: 9 },
    // Rules: GOAL IS WIN (pre-formed)
    { kind: 'WORD', type: 'GOAL', x: 5, y: 9 },
    { kind: 'WORD', type: 'IS', x: 6, y: 9 },
    { kind: 'WORD', type: 'WIN', x: 7, y: 9 },
    // Scattered words for puzzle
    { kind: 'WORD', type: 'DOOR', x: 9, y: 1 },
    { kind: 'WORD', type: 'IS', x: 10, y: 3 },
    { kind: 'WORD', type: 'STOP', x: 11, y: 1 },
    { kind: 'WORD', type: 'PUSH', x: 12, y: 3 },
    { kind: 'WORD', type: 'LAVA', x: 9, y: 9 },
    { kind: 'WORD', type: 'IS', x: 10, y: 9 },
    { kind: 'WORD', type: 'DEFEAT', x: 11, y: 9 },
    { kind: 'WORD', type: 'WALL', x: 1, y: 1 },
    { kind: 'WORD', type: 'IS', x: 2, y: 1 },
    { kind: 'WORD', type: 'STOP', x: 3, y: 1 },
  ],
  hints: [
    'The door blocks your path. Can you change what the door does?',
    'Try making DOOR IS PUSH so you can move the doors out of the way.',
    'Be careful not to walk into LAVA while LAVA IS DEFEAT is active!',
    'You can also break DOOR IS STOP by pushing a word block away.',
  ],
  hintTargets: [
    [],
    [{ x: 9, y: 1, kind: 'word' }, { x: 11, y: 1, kind: 'word' }],
    [{ x: 9, y: 9, kind: 'word' }, { x: 11, y: 9, kind: 'word' }],
    [],
  ],
};
