import type { GostopState } from './engine';

let saved: GostopState | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function saveGostopState(state: GostopState): void {
  saved = clone(state);
}

export function loadGostopState(): GostopState | null {
  return saved ? clone(saved) : null;
}

export function clearGostopState(): void {
  saved = null;
}
