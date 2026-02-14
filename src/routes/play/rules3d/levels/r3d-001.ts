import type { RulesLevel } from '../core/types';

export const R3D_LEVEL_001: RulesLevel = {
  id: 'r3d-001',
  title: 'First Rules',
  size: { w: 12, h: 10 },
  objects: [
    { kind: 'ENTITY', type: 'WALL', x: 0, y: 0 },
    { kind: 'ENTITY', type: 'WALL', x: 1, y: 0 },
    { kind: 'ENTITY', type: 'WALL', x: 2, y: 0 },
    { kind: 'WORD', type: 'WALL', x: 2, y: 2 },
    { kind: 'WORD', type: 'IS', x: 3, y: 2 },
    { kind: 'WORD', type: 'STOP', x: 4, y: 2 },
    { kind: 'WORD', type: 'PLAYER', x: 2, y: 5 },
    { kind: 'WORD', type: 'IS', x: 3, y: 5 },
    { kind: 'WORD', type: 'YOU', x: 4, y: 5 },
    { kind: 'ENTITY', type: 'PLAYER', x: 1, y: 6 },
    { kind: 'WORD', type: 'GOAL', x: 7, y: 2 },
    { kind: 'WORD', type: 'IS', x: 8, y: 2 },
    { kind: 'WORD', type: 'WIN', x: 9, y: 2 },
    { kind: 'ENTITY', type: 'GOAL', x: 10, y: 6 },
  ],
  hints: [
    'PLAYER IS YOU 와 GOAL IS WIN 문장을 유지한 채 길을 열어보세요.',
    'WALL IS STOP 을 깨거나 우회하면 목표 접근이 쉬워집니다.',
    '단어 블록은 PUSH 취급이라 밀 수 있습니다.',
    'YOU를 잃지 않도록 규칙 줄을 먼저 정리하세요.',
  ],
  hintTargets: [[], [{ x: 2, y: 2, kind: 'word' }, { x: 4, y: 2, kind: 'word' }], [{ x: 2, y: 5, kind: 'word' }, { x: 4, y: 5, kind: 'word' }], []],
};
