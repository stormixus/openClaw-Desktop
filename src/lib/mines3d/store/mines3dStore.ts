import { get, writable } from 'svelte/store';
import { chordReveal, newGame, reveal, toggleFlag } from '../core/engine';
import { getHint } from '../core/hints';
import type { MinesState } from '../core/types';

export const PRESETS = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
} as const;

const store = writable<MinesState>(newGame({ ...PRESETS.beginner }));
export const mines3dStore = store;

export function newGamePreset(name: keyof typeof PRESETS) {
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
  const s = get(store);
  store.set(newGame({ width: s.width, height: s.height, mines: s.mines }));
}
