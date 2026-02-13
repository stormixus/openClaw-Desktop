import type { ParsedRules, Property, WorldState } from './types';

const NOUNS = new Set(['WALL', 'ROCK', 'PLAYER', 'GOAL', 'LAVA', 'WATER', 'KEY', 'DOOR']);
const PROPS = new Set<Property>(['STOP', 'PUSH', 'WIN', 'YOU', 'DEFEAT']);

function initParsed(): ParsedRules {
  return { props: {}, transforms: {}, youTypes: new Set<string>() };
}

function getWordAt(state: WorldState, x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  const ids = state.grid[y][x].objects;
  const word = ids.map((id) => state.objects[id]).find((o) => o.kind === 'WORD');
  return word?.type ?? null;
}

function setProp(parsed: ParsedRules, noun: string, prop: Property) {
  if (!parsed.props[noun]) parsed.props[noun] = new Set<Property>();
  parsed.props[noun].add(prop);
  if (prop === 'YOU') parsed.youTypes.add(noun);
}

function parseTriplet(parsed: ParsedRules, a: string, b: string) {
  if (!NOUNS.has(a)) return;
  if (PROPS.has(b as Property)) setProp(parsed, a, b as Property);
  else if (NOUNS.has(b) && !parsed.transforms[a]) parsed.transforms[a] = b;
}

export function parseRules(state: WorldState): ParsedRules {
  const parsed = initParsed();

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const a = getWordAt(state, x, y);
      const isH = getWordAt(state, x + 1, y);
      const b = getWordAt(state, x + 2, y);
      if (a && isH === 'IS' && b) parseTriplet(parsed, a, b);

      const isV = getWordAt(state, x, y + 1);
      const bv = getWordAt(state, x, y + 2);
      if (a && isV === 'IS' && bv) parseTriplet(parsed, a, bv);
    }
  }

  return parsed;
}
