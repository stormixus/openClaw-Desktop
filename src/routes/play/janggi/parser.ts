import type { Move } from './types';

export function parseAgentMove(text: string, legal: Move[]): Move | null {
  const m = text.match(/([a-i](?:10|[1-9]))\s*-?\s*([a-i](?:10|[1-9]))/i);
  if (!m) return null;
  const from = m[1].toLowerCase();
  const to = m[2].toLowerCase();
  return legal.find((x) => x.from === from && x.to === to) ?? null;
}
