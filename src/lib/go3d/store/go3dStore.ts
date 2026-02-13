import { get, writable } from 'svelte/store';
import { applyMove, isLegalMove } from '../core/goRules';
import { getHints } from '../core/hints';
import { validateFirstMove } from '../core/puzzleEngine';
import { parsePuzzleSgf } from '../core/sgf';
import type { Board, GoPuzzle, Highlight, Move, PlayerStone } from '../core/types';

export type Go3DState = {
  puzzleId: string;
  board: Board;
  toPlay: PlayerStone;
  history: { board: Board; move?: Move; koHash?: string; captured?: { x: number; y: number }[] }[];
  koHash?: string;
  ghost?: { x: number; y: number; c: PlayerStone; legal: boolean; reason?: string };
  highlights: Highlight[];
  lastMove?: { x: number; y: number };
  capturedFlash: { x: number; y: number }[];
  mode: 'BEST_MOVE' | 'LIFE_DEATH' | 'ENDGAME';
  hintLevel: number;
  status: 'idle' | 'playing' | 'success' | 'failed';
  goal: string;
  agentSpeech: string;
  agentMood: string;
  agentExplain: string[];
};

function cloneBoard(board: Board): Board {
  return board.map((r) => [...r]);
}

const initial: Go3DState = {
  puzzleId: '',
  board: [],
  toPlay: 1,
  history: [],
  highlights: [],
  capturedFlash: [],
  mode: 'BEST_MOVE',
  hintLevel: 0,
  status: 'idle',
  goal: '',
  agentSpeech: '',
  agentMood: 'calm',
  agentExplain: [],
};

export const go3dStore = writable<Go3DState>(initial);

export function loadPuzzle(puzzle: GoPuzzle) {
  const { board, toPlay } = parsePuzzleSgf(puzzle);
  go3dStore.set({
    ...initial,
    puzzleId: puzzle.id,
    board,
    toPlay,
    history: [{ board: cloneBoard(board) }],
    mode: puzzle.mode,
    goal: puzzle.goal,
    status: 'playing',
  });
}

export function hoverAt(x: number, y: number) {
  go3dStore.update((s) => {
    if (s.status !== 'playing') return s;
    const legal = isLegalMove(s.board, { x, y, c: s.toPlay }, s.koHash);
    return { ...s, ghost: { x, y, c: s.toPlay, legal, reason: legal ? undefined : 'illegal' } };
  });
}

export function tryPlace(x: number, y: number, puzzle: GoPuzzle) {
  go3dStore.update((s) => {
    if (s.status !== 'playing') return s;

    const move: Move = { x, y, c: s.toPlay };
    const applied = applyMove(s.board, move, s.koHash);
    const validation = validateFirstMove(puzzle, move, applied.ok);

    if (!applied.ok) {
      return {
        ...s,
        agentSpeech: `불법수입니다: ${applied.reason}`,
        agentMood: 'serious',
        status: 'failed',
      };
    }

    const nextToPlay: PlayerStone = s.toPlay === 1 ? 2 : 1;

    return {
      ...s,
      board: applied.board,
      toPlay: nextToPlay,
      koHash: applied.nextKoHash,
      history: [...s.history, { board: cloneBoard(applied.board), move, koHash: applied.nextKoHash, captured: applied.captured }],
      lastMove: { x, y },
      capturedFlash: applied.captured,
      status: validation.success ? 'success' : 'failed',
      agentSpeech: validation.success ? '정답입니다. 급소를 정확히 찾았어요.' : '핵심 급소가 아닙니다. 힌트를 올려보세요.',
      agentMood: validation.success ? 'excited' : 'calm',
      agentExplain: validation.success
        ? ['연결과 집 형태를 동시에 확보했습니다.']
        : ['형태상 급소를 놓치면 상대가 먼저 선수로 막습니다.'],
    };
  });
}

export function undo() {
  go3dStore.update((s) => {
    if (s.history.length <= 1) return s;
    const nextHistory = s.history.slice(0, -1);
    const last = nextHistory[nextHistory.length - 1];
    return {
      ...s,
      board: cloneBoard(last.board),
      history: nextHistory,
      toPlay: s.toPlay === 1 ? 2 : 1,
      koHash: last.koHash,
      status: 'playing',
      capturedFlash: [],
      agentSpeech: '',
      agentExplain: [],
    };
  });
}

export function reset() {
  const s = get(go3dStore);
  if (!s.history.length) return;
  const root = s.history[0];
  go3dStore.set({ ...s, board: cloneBoard(root.board), history: [root], status: 'playing', hintLevel: 0, highlights: [], capturedFlash: [], agentSpeech: '', agentExplain: [] });
}

export function hint(puzzle: GoPuzzle) {
  go3dStore.update((s) => {
    const next = Math.min(3, s.hintLevel + 1);
    const out = getHints(puzzle, next);
    return {
      ...s,
      hintLevel: next,
      highlights: out.highlights,
      agentSpeech: out.textHint,
      agentMood: 'teasing',
      agentExplain: [out.textHint],
    };
  });
}
