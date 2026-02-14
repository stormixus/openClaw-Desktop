import { get, writable } from 'svelte/store';
import { getHint } from '../core/hints';
import { getCurrentRulesText, tick } from '../core/ruleEngine';
import type { Dir } from '../core/types';
import { loadLevel, reset, undo } from '../core/world';
import { R3D_LEVEL_001 } from '../levels/r3d-001';
import { R3D_LEVEL_002 } from '../levels/r3d-002';
import { store as gwStore, getActiveClient } from '$lib/gateway/store.svelte';

export const ALL_LEVELS = [R3D_LEVEL_001, R3D_LEVEL_002];

export const levelIndex = writable(0);

const store = writable(loadLevel(ALL_LEVELS[0]));
export const rules3dStore = store;

export function goToLevel(idx: number) {
  const clamped = Math.max(0, Math.min(idx, ALL_LEVELS.length - 1));
  levelIndex.set(clamped);
  tokenHistory.set([]);
  tokensUsed.set(0);
  store.set(loadLevel(ALL_LEVELS[clamped]));
}

export function nextLevel() {
  const cur = get(levelIndex);
  if (cur < ALL_LEVELS.length - 1) goToLevel(cur + 1);
}

export function prevLevel() {
  const cur = get(levelIndex);
  if (cur > 0) goToLevel(cur - 1);
}

export function move(dir: Dir) {
  store.update((s) => {
    const next = tick(s, dir);
    if (next.status === 'won') {
      next.agentSpeech = '좋아요! 규칙을 활용해 목표에 도달했어요.';
      next.agentMood = 'excited';
    } else if (next.status === 'lost') {
      next.agentSpeech = '패배 규칙에 닿았어요. 되돌려서 다른 규칙을 만들어봅시다.';
      next.agentMood = 'serious';
    }
    return next;
  });
}

export function doUndo() {
  store.update((s) => undo(s));
}

export function doReset() {
  store.update((s) => reset(s));
}

export function doHint() {
  store.update((s) => {
    const nextLevel = Math.min(3, s.hintLevel + 1);
    const h = getHint(s, nextLevel);
    return {
      ...s,
      hintLevel: nextLevel,
      hintHighlights: h.highlights,
      agentSpeech: h.text,
      agentMood: 'calm',
    };
  });
}

export function rulesText(state: ReturnType<typeof loadLevel>) {
  return getCurrentRulesText(state);
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

  const objects = Object.values(s.objects).map((o) => `${o.kind}:${o.type} @(${o.pos.x},${o.pos.y})`).join(', ');
  const rules = getCurrentRulesText(s).join('; ') || '(none active)';

  const prompt = `You are a "Baba Is You"-style puzzle coach for RULES3D.
The board is ${s.width}x${s.height}. Objects: ${objects}
Active rules: ${rules}
Status: ${s.status} | Step: ${s.step}

Analyze the position and give 2-3 sentences of advice. What rules should the player form or break next? Mention specific word blocks and positions if helpful.`;

  try {
    const sessKey = `rules3d-${crypto.randomUUID().slice(0, 8)}`;
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
