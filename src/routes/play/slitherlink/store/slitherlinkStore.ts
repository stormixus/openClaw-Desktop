import { get, writable } from 'svelte/store';
import { newGame, toggleEdge } from '../core/engine';
import type { SlitherlinkState, Edge, Difficulty } from '../core/types';
import { store as gwStore, getActiveClient } from '$lib/gateway/store.svelte';

const store = writable<SlitherlinkState>(newGame('easy'));
export const slitherlinkStore = store;

// Timer: update elapsedMs every second while playing
let timerInterval: ReturnType<typeof setInterval> | null = null;

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    store.update((s) => {
      if (s.status !== 'playing' || !s.startedAt) return s;
      return { ...s, elapsedMs: Date.now() - s.startedAt };
    });
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Watch for status changes to start/stop timer
store.subscribe((s) => {
  if (s.status === 'playing' && s.startedAt && !timerInterval) startTimer();
  else if (s.status !== 'playing') stopTimer();
});

export function newGameAction(difficulty: Difficulty) {
  stopTimer();
  store.set(newGame(difficulty));
}

export function toggleEdgeAction(edge: Edge) {
  store.update((s) => toggleEdge(s, edge));
}

export function restart() {
  stopTimer();
  const s = get(store);
  store.set(newGame(s.difficulty));
}

function boardSummary(s: SlitherlinkState): string {
  const lines: string[] = [];
  lines.push(`${s.width}x${s.height} grid, ${s.difficulty} difficulty`);
  lines.push('Clues (. = no clue):');

  for (let row = 0; row < s.height; row++) {
    let line = '';
    for (let col = 0; col < s.width; col++) {
      const clue = s.clues[row][col];
      line += clue === null ? '.' : String(clue);
      line += ' ';
    }
    lines.push(line);
  }

  lines.push('\nHorizontal edges (- = line, x = cross, . = none):');
  for (let row = 0; row < s.hEdges.length; row++) {
    let line = '';
    for (let col = 0; col < s.hEdges[0].length; col++) {
      const state = s.hEdges[row][col];
      line += state === 'line' ? '-' : state === 'cross' ? 'x' : '.';
      line += ' ';
    }
    lines.push(line);
  }

  lines.push('\nVertical edges (| = line, x = cross, . = none):');
  for (let row = 0; row < s.vEdges.length; row++) {
    let line = '';
    for (let col = 0; col < s.vEdges[0].length; col++) {
      const state = s.vEdges[row][col];
      line += state === 'line' ? '|' : state === 'cross' ? 'x' : '.';
      line += ' ';
    }
    lines.push(line);
  }

  return lines.join('\n');
}

export let agentLoading = writable(false);

export async function askAgent() {
  const client = getActiveClient();
  if (!client || !gwStore.activeGatewayId) return;

  const s = get(store);
  if (s.status !== 'playing') return;

  agentLoading.set(true);
  const board = boardSummary(s);

  const prompt = `You are a Slitherlink puzzle coach analyzing a ${s.width}x${s.height} ${s.difficulty} puzzle.

Rules:
- Draw lines on cell edges to form a single closed loop
- Numbers indicate how many of that cell's 4 edges must have lines
- Empty cells have no constraint
- All lines must form exactly one loop (no branches, no disconnected segments)

Current board state:
${board}

Analyze the current position. Look for:
- Cells where the line count is forced by the clue (e.g., a 3 means 3 of 4 edges must be lines)
- Corner patterns (e.g., a 3 in a corner forces 2 edges)
- Contradictions or violations
- Next logical deduction

Reply in 2-3 concise sentences with actionable advice. Reference specific cells by row/col if possible.`;

  try {
    const sessKey = `slitherlink-${crypto.randomUUID().slice(0, 8)}`;
    await client.sendChat({
      sessionKey: sessKey,
      message: prompt,
      idempotencyKey: crypto.randomUUID(),
      deliver: false,
    });

    let response = '';
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const hist = await client.getChatHistory(sessKey);
        const assist = hist.find((m: any) => m.role === 'assistant');
        if (assist?.content) {
          response = assist.content;
          break;
        }
      } catch {
        /* polling */
      }
    }

    if (response) {
      store.update((st) => ({ ...st, agentSpeech: response.slice(0, 300), agentMood: 'calm' }));
    }
  } catch (e) {
    store.update((st) => ({
      ...st,
      agentSpeech: 'Agent error: ' + String(e),
      agentMood: 'serious',
    }));
  } finally {
    agentLoading.set(false);
  }
}
