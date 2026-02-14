import { get, writable } from 'svelte/store';
import { chordReveal, newGame, reveal, toggleFlag } from '../core/engine';
import { getHint } from '../core/hints';
import type { MinesState } from '../core/types';
import { store as gwStore, getActiveClient } from '$lib/gateway/store.svelte';

export const PRESETS = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
} as const;

const store = writable<MinesState>(newGame({ ...PRESETS.beginner }));
export const mines3dStore = store;

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
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// Watch for status changes to start/stop timer
store.subscribe((s) => {
  if (s.status === 'playing' && s.startedAt && !timerInterval) startTimer();
  else if (s.status !== 'playing') stopTimer();
});

export function newGamePreset(name: keyof typeof PRESETS) {
  stopTimer();
  tokenHistory.set([]);
  tokensUsed.set(0);
  store.set(newGame({ ...PRESETS[name] }));
}

export function revealAt(x: number, y: number) {
  store.update((s) => {
    const out = reveal(s, x, y);
    const ns = out.state;
    ns.highlights = [];
    if (!out.result.ok) {
      ns.agentSpeech = '지뢰를 밟았습니다. 다음 판에서 패턴을 읽어봅시다.';
      ns.agentMood = 'serious';
    } else if (out.result.status === 'won') {
      ns.agentSpeech = '클리어! 아주 깔끔했습니다.';
      ns.agentMood = 'excited';
    }
    return ns;
  });
}

export function toggleFlagAt(x: number, y: number) {
  store.update((s) => toggleFlag(s, x, y));
}

export function chordAt(x: number, y: number) {
  store.update((s) => chordReveal(s, x, y).state);
}

export function setHover(x: number, y: number, valid = true) {
  store.update((s) => ({ ...s, hover: { x, y, valid } }));
}

export function clearHover() {
  store.update((s) => ({ ...s, hover: undefined }));
}

export function hint(level = 2) {
  store.update((s) => {
    const h = getHint(s, level);
    return { ...s, highlights: h.highlights, agentSpeech: h.text, agentMood: 'calm' };
  });
}

export function restart() {
  stopTimer();
  tokenHistory.set([]);
  tokensUsed.set(0);
  const s = get(store);
  store.set(newGame({ width: s.width, height: s.height, mines: s.mines }));
}

function boardSummary(s: MinesState): string {
  const lines: string[] = [];
  for (let y = 0; y < s.height; y++) {
    let row = '';
    for (let x = 0; x < s.width; x++) {
      const c = s.grid[y][x];
      if (c.flagged) row += 'F';
      else if (!c.revealed) row += '#';
      else if (c.mine) row += '*';
      else row += String(c.adj);
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

  const prompt = `You are a Minesweeper coach analyzing a ${s.width}x${s.height} board with ${s.mines} mines.
Legend: # = hidden, F = flagged, * = mine (revealed), 0-8 = adjacent mine count.

Board:
${board}

Revealed: ${s.revealedCount}/${s.width * s.height - s.mines} | Flagged: ${s.flaggedCount}/${s.mines}

Analyze the current position. Look for:
- Cells that are definitely safe (forced safe by number constraints)
- Cells that are definitely mines (forced mines)
- The best strategy for the current situation

Reply in 2-3 concise sentences with actionable advice. Mention specific coordinates if possible (column letter a-z, row number 1-N from top).`;

  try {
    const sessKey = `mines3d-${crypto.randomUUID().slice(0, 8)}`;
    await client.sendChat({ sessionKey: sessKey, message: prompt, idempotencyKey: crypto.randomUUID(), deliver: false });

    let response = '';
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const hist = await client.getChatHistory(sessKey);
        const assist = hist.find((m: any) => m.role === 'assistant');
        if (assist?.content) { response = assist.content; break; }
      } catch { /* polling */ }
    }

    if (response) {
      const est = Math.round(response.length * 1.3);
      tokensUsed.update((n) => n + est);
      tokenHistory.update((h) => [...h, est]);
      store.update((st) => ({ ...st, agentSpeech: response.slice(0, 300), agentMood: 'calm' }));
    }
  } catch (e) {
    store.update((st) => ({ ...st, agentSpeech: 'Agent error: ' + String(e), agentMood: 'serious' }));
  } finally {
    agentLoading.set(false);
  }
}
