import type { PokerCard, Suit } from './engine';

const cache = new Map<string, string>();
let backCache: string | null = null;

const RANK_LABEL: Record<number, string> = {
  14: 'A',
  13: 'K',
  12: 'Q',
  11: 'J',
  10: '10',
  9: '9',
  8: '8',
  7: '7',
  6: '6',
  5: '5',
  4: '4',
  3: '3',
  2: '2',
};

const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

function suitColor(suit: Suit): string {
  return suit === 'H' || suit === 'D' ? '#cc2f48' : '#1b2635';
}

function accentBySuit(suit: Suit): string {
  if (suit === 'H') return '#f59fb7';
  if (suit === 'D') return '#ffc5a8';
  if (suit === 'S') return '#a2b5db';
  return '#90d8be';
}

function enc(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function crayfishGlyph(fill: string, stroke: string): string {
  return `
<g transform="translate(70 112)">
  <ellipse cx="0" cy="4" rx="26" ry="18" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>
  <ellipse cx="-8" cy="2" rx="7" ry="11" fill="${stroke}" opacity="0.22"/>
  <ellipse cx="8" cy="2" rx="7" ry="11" fill="${stroke}" opacity="0.22"/>
  <circle cx="-9" cy="-16" r="5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <circle cx="9" cy="-16" r="5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <circle cx="-10" cy="-17" r="1.4" fill="${stroke}"/>
  <circle cx="10" cy="-17" r="1.4" fill="${stroke}"/>
  <path d="M-27 -4 C-41 -10 -44 -20 -33 -24 C-24 -27 -14 -18 -16 -8 Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <path d="M27 -4 C41 -10 44 -20 33 -24 C24 -27 14 -18 16 -8 Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <path d="M-14 20 Q-20 30 -12 35" stroke="${stroke}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M-5 21 Q-9 33 0 38" stroke="${stroke}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M5 21 Q9 33 0 38" stroke="${stroke}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M14 20 Q20 30 12 35" stroke="${stroke}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M-14 5 C-9 11 9 11 14 5" stroke="${stroke}" stroke-width="2" fill="none" stroke-linecap="round"/>
</g>`;
}

export function cardImageUri(card: PokerCard): string {
  const cached = cache.get(card.id);
  if (cached) return cached;

  const rank = RANK_LABEL[card.rank] ?? '?';
  const symbol = SUIT_SYMBOL[card.suit];
  const textColor = suitColor(card.suit);
  const accent = accentBySuit(card.suit);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="200" viewBox="0 0 140 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f4f7fb"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="132" height="192" rx="15" fill="url(#bg)" stroke="#d4dce7" stroke-width="2.4"/>
  <rect x="11" y="12" width="118" height="176" rx="12" fill="none" stroke="${accent}" stroke-width="1.1" opacity="0.8"/>
  <rect x="10" y="10" width="120" height="66" rx="10" fill="url(#shine)" opacity="0.7"/>
  <text x="18" y="34" font-size="24" font-weight="800" font-family="Verdana, Geneva, sans-serif" fill="${textColor}">${rank}</text>
  <text x="20" y="56" font-size="18" font-family="Georgia, 'Times New Roman', serif" fill="${textColor}">${symbol}</text>
  <g transform="rotate(180 70 100)">
    <text x="18" y="34" font-size="24" font-weight="800" font-family="Verdana, Geneva, sans-serif" fill="${textColor}">${rank}</text>
    <text x="20" y="56" font-size="18" font-family="Georgia, 'Times New Roman', serif" fill="${textColor}">${symbol}</text>
  </g>
  ${crayfishGlyph(accent, textColor)}
  <text x="70" y="165" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="0.08em" font-family="Verdana, Geneva, sans-serif" fill="${textColor}" opacity="0.75">OPENCLAW</text>
</svg>`;

  const uri = enc(svg);
  cache.set(card.id, uri);
  return uri;
}

export function cardBackUri(): string {
  if (backCache) return backCache;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="200" viewBox="0 0 140 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1d2c46"/>
      <stop offset="55%" stop-color="#8b2440"/>
      <stop offset="100%" stop-color="#1a1f39"/>
    </linearGradient>
    <pattern id="grid" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="4" y="4" width="132" height="192" rx="15" fill="url(#bg)" stroke="#b7bfd0" stroke-width="2.4"/>
  <rect x="11" y="12" width="118" height="176" rx="12" fill="url(#grid)"/>
  <rect x="19" y="20" width="102" height="160" rx="10" fill="none" stroke="#e9edf7" stroke-opacity="0.28" stroke-width="1.2"/>
  <g transform="translate(70 100)">
    <ellipse cx="0" cy="6" rx="26" ry="17" fill="#f2cc8c" opacity="0.92"/>
    <circle cx="-8" cy="-13" r="5" fill="#f2cc8c"/>
    <circle cx="8" cy="-13" r="5" fill="#f2cc8c"/>
    <path d="M-26 -1 C-38 -8 -42 -17 -31 -22 C-21 -25 -13 -15 -15 -6 Z" fill="#f2cc8c"/>
    <path d="M26 -1 C38 -8 42 -17 31 -22 C21 -25 13 -15 15 -6 Z" fill="#f2cc8c"/>
  </g>
  <text x="70" y="160" text-anchor="middle" font-size="12" font-weight="700" letter-spacing="0.12em" font-family="Verdana, Geneva, sans-serif" fill="#f4f6fb" opacity="0.85">OPENCLAW</text>
</svg>`;

  backCache = enc(svg);
  return backCache;
}
