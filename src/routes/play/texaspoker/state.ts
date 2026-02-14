import type { PokerState } from './engine';

let saved: PokerState | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function saveTexasPokerState(state: PokerState): void {
  saved = clone(state);
}

export function loadTexasPokerState(): PokerState | null {
  return saved ? clone(saved) : null;
}

export function clearTexasPokerState(): void {
  saved = null;
}
