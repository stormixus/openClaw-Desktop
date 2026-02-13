import { writable } from 'svelte/store';
import { getHint } from '../core/hints';
import { getCurrentRulesText, tick } from '../core/ruleEngine';
import type { Dir } from '../core/types';
import { loadLevel, reset, undo } from '../core/world';
import { R3D_LEVEL_001 } from '../levels/r3d-001';

const store = writable(loadLevel(R3D_LEVEL_001));
export const rules3dStore = store;

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
