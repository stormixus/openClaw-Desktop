import type { PokerState } from './engine';

let saved: PokerState | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function savePokerState(state: PokerState): void {
  saved = clone(state);
}

export function loadPokerState(): PokerState | null {
  return saved ? clone(saved) : null;
}

export function clearPokerState(): void {
  saved = null;
}
