import { get, writable } from 'svelte/store';
import {
  applyMove,
  buildGoPrompt,
  cloneBoard,
  computeScore,
  coordToStr,
  createBoard,
  isLegalMove,
  parseLlmGoMove,
  pickRandomMove,
} from '../core/goRules';
import type { GameMode, GoGameState, PlayerStone } from '../core/types';
import { store as gwStore, getActiveClient, getClientById } from '$lib/gateway/store.svelte';

// =============================================================================
// Constants
// =============================================================================

export const BOARD_SIZES = [9, 13, 19] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

// =============================================================================
// Initial State
// =============================================================================

function makeInitialState(size: number = 9, mode: GameMode = 'agent'): GoGameState {
  return {
    board: createBoard(size),
    size,
    turn: 1,
    history: [{ board: createBoard(size) }],
    capturedByBlack: 0,
    capturedByWhite: 0,
    consecutivePasses: 0,
    status: 'playing',
    winner: null,
    winReason: '',
    moveList: [],
    ghost: undefined,
    lastMove: undefined,
    highlights: [],
    score: undefined,
    gameMode: mode,
    aiThinking: false,
    aiComment: '',
    avaBlackGw: '',
    avaWhiteGw: '',
    avaRunning: false,
    tokensUsed: 0,
    tokenHistory: [],
  };
}

export const go3dStore = writable<GoGameState>(makeInitialState());

// =============================================================================
// Module-level flags for async AvA loop
// =============================================================================

let avaStopped = false;

// =============================================================================
// Game Actions
// =============================================================================

export function newGoGame(size: BoardSize = 9, mode?: GameMode) {
  avaStopped = true;
  const s = get(go3dStore);
  go3dStore.set(makeInitialState(size, mode ?? s.gameMode));
}

export function setMode(mode: GameMode) {
  avaStopped = true;
  go3dStore.update((s) => ({ ...s, gameMode: mode, avaRunning: false, aiThinking: false }));
}

export function setAvaGateway(side: 'black' | 'white', gwId: string) {
  go3dStore.update((s) =>
    side === 'black' ? { ...s, avaBlackGw: gwId } : { ...s, avaWhiteGw: gwId },
  );
}

export function hoverAt(x: number, y: number) {
  go3dStore.update((s) => {
    if (s.status !== 'playing' || s.aiThinking) return s;
    if (s.gameMode === 'ava') return s;
    const legal = isLegalMove(s.board, { x, y, c: s.turn }, s.koHash);
    return { ...s, ghost: { x, y, c: s.turn, legal } };
  });
}

export function clearHover() {
  go3dStore.update((s) => ({ ...s, ghost: undefined }));
}

export function placeStone(x: number, y: number) {
  const s = get(go3dStore);
  if (s.status !== 'playing' || s.aiThinking) return;
  if (s.gameMode === 'ava') return;

  const move = { x, y, c: s.turn };
  const result = applyMove(s.board, move, s.koHash);
  if (!result.ok) return;

  const moveStr = coordToStr(x, y, s.size);
  const nextTurn: PlayerStone = s.turn === 1 ? 2 : 1;

  go3dStore.set({
    ...s,
    board: result.board,
    turn: nextTurn,
    koHash: result.nextKoHash,
    history: [...s.history, { board: cloneBoard(result.board), move: moveStr, koHash: result.nextKoHash }],
    lastMove: { x, y },
    capturedByBlack: s.capturedByBlack + (s.turn === 1 ? result.captured.length : 0),
    capturedByWhite: s.capturedByWhite + (s.turn === 2 ? result.captured.length : 0),
    consecutivePasses: 0,
    moveList: [...s.moveList, moveStr],
    ghost: undefined,
    highlights: [],
  });

  // Trigger AI response after player move
  if (s.gameMode === 'agent') {
    requestAiMove();
  } else if (s.gameMode === 'offline') {
    requestOfflineMove();
  }
}

export function pass() {
  go3dStore.update((s) => {
    if (s.status !== 'playing' || s.aiThinking) return s;
    if (s.gameMode === 'ava') return s;

    const nextPasses = s.consecutivePasses + 1;
    const nextTurn: PlayerStone = s.turn === 1 ? 2 : 1;

    if (nextPasses >= 2) {
      const score = computeScore(s.board, s.size);
      const winner = score.black > score.white ? 'black' as const : 'white' as const;
      return {
        ...s,
        turn: nextTurn,
        consecutivePasses: nextPasses,
        lastMove: 'pass' as const,
        moveList: [...s.moveList, 'pass'],
        history: [...s.history, { board: cloneBoard(s.board), move: 'pass', koHash: s.koHash }],
        status: 'ended' as const,
        winner,
        winReason: `${winner === 'black' ? 'Black' : 'White'} wins by ${Math.abs(score.black - score.white).toFixed(1)} points`,
        score,
        ghost: undefined,
      };
    }

    const ns: GoGameState = {
      ...s,
      turn: nextTurn,
      consecutivePasses: nextPasses,
      lastMove: 'pass' as const,
      moveList: [...s.moveList, 'pass'],
      history: [...s.history, { board: cloneBoard(s.board), move: 'pass', koHash: s.koHash }],
      ghost: undefined,
    };

    // After player passes, trigger AI if needed
    setTimeout(() => {
      const cur = get(go3dStore);
      if (cur.status !== 'playing') return;
      if (cur.gameMode === 'agent') requestAiMove();
      else if (cur.gameMode === 'offline') requestOfflineMove();
    }, 300);

    return ns;
  });
}

export function resign() {
  go3dStore.update((s) => {
    if (s.status !== 'playing') return s;
    const winner = s.turn === 1 ? 'white' as const : 'black' as const;
    return {
      ...s,
      status: 'ended' as const,
      winner,
      winReason: `${winner === 'black' ? 'Black' : 'White'} wins by resignation`,
      ghost: undefined,
    };
  });
}

export function undo() {
  go3dStore.update((s) => {
    if (s.aiThinking || s.avaRunning) return s;
    // Undo 2 moves (player + AI) in agent/offline mode, 1 in ava
    const steps = s.gameMode === 'ava' ? 1 : 2;
    if (s.history.length <= steps) return s;

    const nextHistory = s.history.slice(0, -steps);
    const last = nextHistory[nextHistory.length - 1];
    const undoTurn: PlayerStone = steps === 2 ? s.turn : (s.turn === 1 ? 2 : 1);

    return {
      ...s,
      board: cloneBoard(last.board),
      history: nextHistory,
      turn: undoTurn,
      koHash: last.koHash,
      status: 'playing' as const,
      winner: null,
      winReason: '',
      score: undefined,
      lastMove: undefined,
      ghost: undefined,
      moveList: s.moveList.slice(0, -steps),
      consecutivePasses: 0,
      aiComment: '',
    };
  });
}

// =============================================================================
// AI Move (Gateway LLM)
// =============================================================================

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function requestAiMove() {
  const client = getActiveClient();
  const s = get(go3dStore);
  if (s.status !== 'playing') return;

  if (!client || !gwStore.activeGatewayId) {
    // Fallback to offline
    await delay(400);
    applyAiResult(pickRandomMove(s.board, s.size, s.turn, s.koHash), '(No gateway — random move)');
    return;
  }

  go3dStore.update((st) => ({ ...st, aiThinking: true, aiComment: '' }));

  try {
    const state = get(go3dStore);
    const prompt = buildGoPrompt(state.board, state.size, state.turn, state.moveList, state.capturedByBlack, state.capturedByWhite);
    const sessKey = `go-${crypto.randomUUID().slice(0, 8)}`;

    await client.sendChat({ sessionKey: sessKey, message: prompt, idempotencyKey: crypto.randomUUID(), deliver: false });

    let response = '';
    for (let i = 0; i < 30; i++) {
      await delay(1000);
      try {
        const hist = await client.getChatHistory(sessKey);
        const assist = hist.find((m: any) => m.role === 'assistant');
        if (assist?.content) { response = assist.content; break; }
      } catch { /* polling */ }
    }

    if (response) {
      const cur = get(go3dStore);
      const parsed = parseLlmGoMove(response, cur.board, cur.size, cur.turn, cur.koHash);
      const comment = response.replace(/\b[A-HJ-T]\d{1,2}\b/gi, '').replace(/^[\s,.:;-]+/, '').trim().slice(0, 300);
      const tokensEstimate = Math.round(response.length * 1.3);
      go3dStore.update((s) => ({
        ...s,
        tokensUsed: s.tokensUsed + tokensEstimate,
        tokenHistory: [...s.tokenHistory, tokensEstimate],
      }));
      if (parsed) {
        applyAiResult(parsed, comment);
      } else {
        applyAiResult(pickRandomMove(cur.board, cur.size, cur.turn, cur.koHash), '(Could not parse AI move)');
      }
    } else {
      const cur = get(go3dStore);
      applyAiResult(pickRandomMove(cur.board, cur.size, cur.turn, cur.koHash), '(AI timeout)');
    }
  } catch (e) {
    const cur = get(go3dStore);
    applyAiResult(pickRandomMove(cur.board, cur.size, cur.turn, cur.koHash), 'Error: ' + String(e));
  }
}

async function requestOfflineMove() {
  await delay(500);
  const s = get(go3dStore);
  if (s.status !== 'playing') return;
  go3dStore.update((st) => ({ ...st, aiThinking: true }));
  await delay(300);
  const cur = get(go3dStore);
  applyAiResult(pickRandomMove(cur.board, cur.size, cur.turn, cur.koHash), '');
}

function applyAiResult(result: { x: number; y: number } | 'pass', comment: string) {
  go3dStore.update((s) => {
    if (s.status !== 'playing') return { ...s, aiThinking: false };

    if (result === 'pass') {
      const nextPasses = s.consecutivePasses + 1;
      const nextTurn: PlayerStone = s.turn === 1 ? 2 : 1;

      if (nextPasses >= 2) {
        const score = computeScore(s.board, s.size);
        const winner = score.black > score.white ? 'black' as const : 'white' as const;
        return {
          ...s,
          turn: nextTurn,
          consecutivePasses: nextPasses,
          lastMove: 'pass' as const,
          moveList: [...s.moveList, 'pass'],
          history: [...s.history, { board: cloneBoard(s.board), move: 'pass', koHash: s.koHash }],
          status: 'ended' as const,
          winner,
          winReason: `${winner === 'black' ? 'Black' : 'White'} wins by ${Math.abs(score.black - score.white).toFixed(1)} points`,
          score,
          aiThinking: false,
          aiComment: comment || 'Pass',
        };
      }

      return {
        ...s,
        turn: nextTurn,
        consecutivePasses: nextPasses,
        lastMove: 'pass' as const,
        moveList: [...s.moveList, 'pass'],
        history: [...s.history, { board: cloneBoard(s.board), move: 'pass', koHash: s.koHash }],
        aiThinking: false,
        aiComment: comment || 'Pass',
      };
    }

    const move = { x: result.x, y: result.y, c: s.turn };
    const applied = applyMove(s.board, move, s.koHash);
    if (!applied.ok) return { ...s, aiThinking: false, aiComment: '(AI made illegal move, skipped)' };

    const moveStr = coordToStr(result.x, result.y, s.size);
    const nextTurn: PlayerStone = s.turn === 1 ? 2 : 1;

    return {
      ...s,
      board: applied.board,
      turn: nextTurn,
      koHash: applied.nextKoHash,
      history: [...s.history, { board: cloneBoard(applied.board), move: moveStr, koHash: applied.nextKoHash }],
      lastMove: { x: result.x, y: result.y },
      capturedByBlack: s.capturedByBlack + (s.turn === 1 ? applied.captured.length : 0),
      capturedByWhite: s.capturedByWhite + (s.turn === 2 ? applied.captured.length : 0),
      consecutivePasses: 0,
      moveList: [...s.moveList, moveStr],
      ghost: undefined,
      aiThinking: false,
      aiComment: comment,
    };
  });
}

// =============================================================================
// Agent vs Agent (AvA)
// =============================================================================

async function requestMoveForSide(side: PlayerStone): Promise<boolean> {
  const s = get(go3dStore);
  const gwId = side === 1 ? s.avaBlackGw : s.avaWhiteGw;
  const client = getClientById(gwId);

  if (!client) {
    applyAiResult(pickRandomMove(s.board, s.size, s.turn, s.koHash), '(No gateway)');
    return true;
  }

  try {
    const state = get(go3dStore);
    const prompt = buildGoPrompt(state.board, state.size, state.turn, state.moveList, state.capturedByBlack, state.capturedByWhite);
    const sessKey = `go-ava-${side === 1 ? 'b' : 'w'}-${crypto.randomUUID().slice(0, 8)}`;

    await client.sendChat({ sessionKey: sessKey, message: prompt, idempotencyKey: crypto.randomUUID(), deliver: false });

    let response = '';
    for (let i = 0; i < 30; i++) {
      if (avaStopped) return false;
      await delay(1000);
      try {
        const hist = await client.getChatHistory(sessKey);
        const assist = hist.find((m: any) => m.role === 'assistant');
        if (assist?.content) { response = assist.content; break; }
      } catch { /* polling */ }
    }

    if (response) {
      const cur = get(go3dStore);
      const parsed = parseLlmGoMove(response, cur.board, cur.size, cur.turn, cur.koHash);
      const sideLabel = side === 1 ? 'Black' : 'White';
      const comment = `[${sideLabel}] ${response.replace(/\b[A-HJ-T]\d{1,2}\b/gi, '').replace(/^[\s,.:;-]+/, '').trim().slice(0, 200)}`;
      const tokensEstimate = Math.round(response.length * 1.3);
      go3dStore.update((s) => ({
        ...s,
        tokensUsed: s.tokensUsed + tokensEstimate,
        tokenHistory: [...s.tokenHistory, tokensEstimate],
      }));
      if (parsed) {
        applyAiResult(parsed, comment);
      } else {
        applyAiResult(pickRandomMove(cur.board, cur.size, cur.turn, cur.koHash), `[${sideLabel}] (parse fail)`);
      }
      return true;
    }

    const cur = get(go3dStore);
    applyAiResult(pickRandomMove(cur.board, cur.size, cur.turn, cur.koHash), '(timeout)');
    return true;
  } catch {
    const cur = get(go3dStore);
    applyAiResult(pickRandomMove(cur.board, cur.size, cur.turn, cur.koHash), '(error)');
    return true;
  }
}

export async function startAva() {
  const s = get(go3dStore);
  if (!s.avaBlackGw || !s.avaWhiteGw) return;

  avaStopped = false;
  go3dStore.update((st) => ({ ...st, avaRunning: true }));

  while (!avaStopped) {
    const cur = get(go3dStore);
    if (cur.status !== 'playing') break;

    go3dStore.update((st) => ({ ...st, aiThinking: true }));
    const ok = await requestMoveForSide(cur.turn);
    go3dStore.update((st) => ({ ...st, aiThinking: false }));

    if (!ok) break;
    await delay(500);
  }

  go3dStore.update((st) => ({ ...st, avaRunning: false, aiThinking: false }));
}

export function stopAva() {
  avaStopped = true;
  go3dStore.update((st) => ({ ...st, avaRunning: false, aiThinking: false }));
}

// =============================================================================
// Coach (ask AI for analysis without making a move)
// =============================================================================

export const coachLoading = writable(false);

export async function askCoach() {
  const client = getActiveClient();
  if (!client || !gwStore.activeGatewayId) return;

  const s = get(go3dStore);
  if (s.status !== 'playing') return;

  coachLoading.set(true);

  const prompt = `You are a Go (baduk) coach analyzing a ${s.size}x${s.size} board.
${buildGoPrompt(s.board, s.size, s.turn, s.moveList, s.capturedByBlack, s.capturedByWhite).replace(/^.*?Choose your next move/s, 'Analyze the current position')}

Provide 2-3 concise sentences of strategic advice. Mention specific coordinates if possible.`;

  try {
    const sessKey = `go-coach-${crypto.randomUUID().slice(0, 8)}`;
    await client.sendChat({ sessionKey: sessKey, message: prompt, idempotencyKey: crypto.randomUUID(), deliver: false });

    let response = '';
    for (let i = 0; i < 30; i++) {
      await delay(1000);
      try {
        const hist = await client.getChatHistory(sessKey);
        const assist = hist.find((m: any) => m.role === 'assistant');
        if (assist?.content) { response = assist.content; break; }
      } catch { /* polling */ }
    }

    if (response) {
      go3dStore.update((st) => ({ ...st, aiComment: response.slice(0, 400) }));
    }
  } catch (e) {
    go3dStore.update((st) => ({ ...st, aiComment: 'Coach error: ' + String(e) }));
  } finally {
    coachLoading.set(false);
  }
}
