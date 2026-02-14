import type { MatgoState } from './engine';

let saved: MatgoState | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function saveMatgoState(state: MatgoState): void {
  saved = clone(state);
}

export function loadMatgoState(): MatgoState | null {
  return saved ? clone(saved) : null;
}

export function clearMatgoState(): void {
  saved = null;
}
