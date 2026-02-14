import { get, writable } from 'svelte/store';
import { newGame, checkWin } from '../core/engine';
import type { Difficulty, NonogramState } from '../core/types';
import { store as gwStore, getActiveClient } from '$lib/gateway/store.svelte';

const store = writable<NonogramState>(newGame('easy'));
export const nonogramStore = store;

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

export function newGamePreset(difficulty: Difficulty) {
  stopTimer();
  tokenHistory.set([]);
  tokensUsed.set(0);
  store.set(newGame(difficulty));
}

export function fillCell(x: number, y: number) {
  store.update((s) => {
    if (s.status !== 'playing') return s;
    const newGrid = s.grid.map((row) => [...row]);

    // Toggle fill: empty -> filled, filled -> empty, marked -> filled
    if (newGrid[y][x] === 'filled') {
      newGrid[y][x] = 'empty';
    } else {
      newGrid[y][x] = 'filled';
    }

    const won = checkWin(newGrid, s.solution);
    if (won) {
      return {
        ...s,
        grid: newGrid,
        status: 'won',
        agentSpeech: 'Perfect! You solved the nonogram puzzle!',
        agentMood: 'excited',
      };
    }

    return { ...s, grid: newGrid };
  });
}

export function markCell(x: number, y: number) {
  store.update((s) => {
    if (s.status !== 'playing') return s;
    const newGrid = s.grid.map((row) => [...row]);

    // Toggle mark: empty -> marked, marked -> empty, filled -> marked
    if (newGrid[y][x] === 'marked') {
      newGrid[y][x] = 'empty';
    } else {
      newGrid[y][x] = 'marked';
    }

    return { ...s, grid: newGrid };
  });
}

export function clearCell(x: number, y: number) {
  store.update((s) => {
    if (s.status !== 'playing') return s;
    const newGrid = s.grid.map((row) => [...row]);
    newGrid[y][x] = 'empty';
    return { ...s, grid: newGrid };
  });
}

function boardSummary(s: NonogramState): string {
  const lines: string[] = [];
  lines.push(`Nonogram ${s.width}x${s.height} (${s.difficulty})`);
  lines.push('');

  // Column clues
  lines.push('Column clues:');
  for (let x = 0; x < s.width; x++) {
    lines.push(`Col ${x}: [${s.colClues[x].join(', ')}]`);
  }
  lines.push('');

  // Row clues
  lines.push('Row clues:');
  for (let y = 0; y < s.height; y++) {
    lines.push(`Row ${y}: [${s.rowClues[y].join(', ')}]`);
  }
  lines.push('');

  // Current grid
  lines.push('Current grid (# = filled, X = marked, . = empty):');
  for (let y = 0; y < s.height; y++) {
    let row = '';
    for (let x = 0; x < s.width; x++) {
      const cell = s.grid[y][x];
      if (cell === 'filled') row += '#';
      else if (cell === 'marked') row += 'X';
      else row += '.';
    }
    lines.push(row);
  }

  return lines.join('\n');
}

export let agentLoading = writable(false);
export const tokenHistory = writable<number[]>([]);
export const tokensUsed = writable(0);

export async function askAgent() {
  const client = getActiveClient();
  if (!client || !gwStore.activeGatewayId) return;

  const s = get(store);
  if (s.status !== 'playing') return;

  agentLoading.set(true);
  const board = boardSummary(s);

  const prompt = `You are a Nonogram (Picross) puzzle coach analyzing a ${s.width}x${s.height} ${s.difficulty} puzzle.

${board}

Analyze the current position. Look for:
- Rows or columns where the clues force certain cells to be filled
- Rows or columns where the clues force certain cells to be empty
- The best logical deduction to make next

Reply in 2-3 concise sentences with actionable advice. Mention specific coordinates if possible (column x, row y, both 0-indexed).`;

  try {
    const sessKey = `nonogram3d-${crypto.randomUUID().slice(0, 8)}`;
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
      const est = Math.round(response.length * 1.3);
      tokensUsed.update((n) => n + est);
      tokenHistory.update((h) => [...h, est]);
      store.update((st) => ({
        ...st,
        agentSpeech: response.slice(0, 300),
        agentMood: 'calm',
      }));
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
