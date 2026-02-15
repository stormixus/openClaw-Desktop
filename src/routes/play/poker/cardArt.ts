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
  return suit === 'H' || suit === 'D' ? '#e33a44' : '#2b2f4b';
}

function suitTint(suit: Suit): string {
  if (suit === 'H') return '#f8b3b6';
  if (suit === 'D') return '#f5bbb2';
  if (suit === 'S') return '#b9c1df';
  return '#b6d6cb';
}

interface FacePalette {
  skin: string;
  hair: string;
  hairDark: string;
  outfitA: string;
  outfitB: string;
  accent: string;
  prop: string;
}

function facePalette(rank: number, suit: Suit): FacePalette {
  const redSuit = suit === 'H' || suit === 'D';
  const purple = redSuit ? '#4a18c6' : '#3f14bd';
  const pink = redSuit ? '#ff4f79' : '#ff4e88';
  const orange = redSuit ? '#f89c45' : '#f7a246';
  const skin = '#f7ddcb';

  if (rank === 13) {
    return {
      skin,
      hair: redSuit ? '#f89a44' : '#5318c9',
      hairDark: redSuit ? '#d87924' : '#36108b',
      outfitA: purple,
      outfitB: pink,
      accent: orange,
      prop: pink,
    };
  }
  if (rank === 12) {
    return {
      skin,
      hair: redSuit ? '#f69b4b' : '#5a1ed3',
      hairDark: redSuit ? '#cf7b31' : '#3a1490',
      outfitA: purple,
      outfitB: pink,
      accent: orange,
      prop: orange,
    };
  }
  return {
    skin,
    hair: redSuit ? '#ef9a56' : '#4c20bf',
    hairDark: redSuit ? '#c87530' : '#2f117d',
    outfitA: purple,
    outfitB: pink,
    accent: orange,
    prop: purple,
  };
}

function renderKingHalf(palette: FacePalette, textColor: string): string {
  return `
    <path d="M-14 -36 L-10 -47 L-3 -37 L0 -46 L3 -37 L10 -47 L14 -36 L14 -29 L-14 -29 Z" fill="${palette.accent}" stroke="${textColor}" stroke-width="1.1"/>
    <ellipse cx="0" cy="-12" rx="19" ry="21" fill="${palette.skin}"/>
    <path d="M-20 -17 Q-12 -38 1 -36 Q16 -34 20 -17 L20 -10 Q8 -18 0 -18 Q-11 -18 -20 -10 Z" fill="${palette.hair}"/>
    <path d="M-10 -9 L-4 -11 M10 -9 L4 -11" stroke="${palette.hairDark}" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="-7" cy="-8.5" r="1.7" fill="${palette.hairDark}"/>
    <circle cx="7" cy="-8.5" r="1.7" fill="${palette.hairDark}"/>
    <path d="M-7 1 Q0 5 7 1" stroke="${palette.hairDark}" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <path d="M-10 3 Q0 7 10 3 Q0 10 -10 3" fill="${palette.hairDark}" opacity="0.72"/>
    <path d="M-24 22 L-9 4 L0 16 L9 4 L24 22 L18 31 L-18 31 Z" fill="${palette.outfitA}"/>
    <path d="M-24 22 L-9 22 L0 27 L9 22 L24 22 L24 30 L-24 30 Z" fill="${palette.outfitB}" opacity="0.85"/>
    <path d="M-12 9 L0 22 L12 9 L12 26 L0 36 L-12 26 Z" fill="#f7f9ff"/>
    <path d="M24 3 L36 -9" stroke="${palette.prop}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M36 -9 L33 -14 L40 -11 L37 -6 Z" fill="${palette.prop}"/>
    <circle cx="-15" cy="23" r="2.4" fill="${palette.accent}"/>
    <circle cx="15" cy="23" r="2.4" fill="${palette.accent}"/>`;
}

function renderQueenHalf(palette: FacePalette, textColor: string): string {
  return `
    <path d="M-12 -35 Q0 -47 12 -35 Q8 -29 0 -28 Q-8 -29 -12 -35 Z" fill="${palette.accent}" stroke="${textColor}" stroke-width="1.05"/>
    <ellipse cx="0" cy="-11" rx="19" ry="22" fill="${palette.skin}"/>
    <path d="M-20 -17 Q-18 -34 0 -37 Q18 -34 20 -17 L20 -7 Q10 -2 0 -2 Q-10 -2 -20 -7 Z" fill="${palette.hair}"/>
    <path d="M-10 -8 Q-6 -13 -2 -8 M10 -8 Q6 -13 2 -8" stroke="${palette.hairDark}" stroke-width="1.25" fill="none" stroke-linecap="round"/>
    <path d="M-6 2 Q0 8 6 2" fill="${palette.outfitB}" opacity="0.95"/>
    <path d="M-26 21 Q-12 2 0 16 Q12 2 26 21 L18 31 L-18 31 Z" fill="${palette.outfitA}"/>
    <path d="M-12 10 Q0 23 12 10 L12 26 Q0 37 -12 26 Z" fill="#f7f9ff"/>
    <path d="M23 2 L34 -12" stroke="${palette.prop}" stroke-width="2" stroke-linecap="round"/>
    <path d="M34 -12 L40 -15 L39 -9 L44 -5 L38 -4 L35 2 L32 -4 L26 -5 L31 -9 L30 -15 Z" fill="${palette.accent}" opacity="0.92"/>
    <circle cx="-11" cy="24" r="2" fill="${palette.accent}" opacity="0.9"/>
    <circle cx="11" cy="24" r="2" fill="${palette.accent}" opacity="0.9"/>`;
}

function renderJackHalf(palette: FacePalette, textColor: string): string {
  return `
    <path d="M-15 -34 L-2 -44 L15 -34 L10 -26 L-12 -26 Z" fill="${palette.accent}" stroke="${textColor}" stroke-width="1.1"/>
    <ellipse cx="0" cy="-12" rx="18.5" ry="20.5" fill="${palette.skin}"/>
    <path d="M-19 -18 Q-14 -31 0 -33 Q13 -31 19 -18 L19 -10 Q10 -17 0 -17 Q-10 -17 -19 -10 Z" fill="${palette.hair}"/>
    <path d="M-9 -8 Q-2 -12 5 -8 M-1 -8 Q6 -12 11 -8" stroke="${palette.hairDark}" stroke-width="1.25" fill="none" stroke-linecap="round"/>
    <circle cx="-7" cy="-8.3" r="1.7" fill="${palette.hairDark}"/>
    <circle cx="7" cy="-8.3" r="1.7" fill="${palette.hairDark}"/>
    <path d="M-6 1 Q0 4 7 0" stroke="${palette.hairDark}" stroke-width="1.05" fill="none" stroke-linecap="round"/>
    <path d="M-23 22 L-7 6 L0 15 L7 6 L23 22 L17 31 L-17 31 Z" fill="${palette.outfitA}"/>
    <path d="M-17 19 L0 6 L17 19 L12 23 L0 15 L-12 23 Z" fill="${palette.outfitB}" opacity="0.88"/>
    <path d="M-11 9 L0 20 L11 9 L11 25 L0 34 L-11 25 Z" fill="#f7f9ff"/>
    <path d="M21 5 L35 12 L31 16 L17 9 Z" fill="${palette.prop}" stroke="${textColor}" stroke-width="0.75"/>
    <path d="M31 16 L36 13 L34 19 Z" fill="${palette.prop}" stroke="${textColor}" stroke-width="0.55"/>
    <circle cx="0" cy="26" r="2.1" fill="${palette.accent}"/>`;
}

function renderFaceHalf(rank: number, palette: FacePalette, textColor: string): string {
  if (rank === 13) return renderKingHalf(palette, textColor);
  if (rank === 12) return renderQueenHalf(palette, textColor);
  return renderJackHalf(palette, textColor);
}

function renderRankBackdrop(rank: number, palette: FacePalette): string {
  if (rank === 13) {
    return `
      <path d="M24 68 L56 100 L24 132 L60 132 L70 122 L80 132 L116 132 L84 100 L116 68 L80 68 L70 78 L60 68 Z" fill="${palette.outfitA}" opacity="0.74"/>
      <path d="M24 82 L52 82 L70 100 L88 82 L116 82 L116 118 L88 118 L70 100 L52 118 L24 118 Z" fill="${palette.outfitB}" opacity="0.8"/>`;
  }
  if (rank === 12) {
    return `
      <path d="M24 99 Q36 74 61 74 Q70 74 79 74 Q104 74 116 99 Q104 124 79 124 Q70 124 61 124 Q36 124 24 99 Z" fill="${palette.outfitA}" opacity="0.72"/>
      <path d="M30 71 L54 83 L44 109 L24 101 Z M110 71 L86 83 L96 109 L116 101 Z M30 127 L54 115 L44 89 L24 97 Z M110 127 L86 115 L96 89 L116 97 Z" fill="${palette.outfitB}" opacity="0.8"/>`;
  }
  return `
    <path d="M24 69 L116 69 L116 131 L24 131 Z" fill="${palette.outfitA}" opacity="0.7"/>
    <path d="M24 74 L116 74 M24 81 L116 81 M24 88 L116 88 M24 95 L116 95 M24 102 L116 102 M24 109 L116 109 M24 116 L116 116 M24 123 L116 123" stroke="${palette.outfitB}" stroke-width="4.2" opacity="0.82"/>`;
}

function renderFaceCard(rank: number, suit: Suit, textColor: string, tint: string, symbol: string): string {
  const palette = facePalette(rank, suit);
  return `
    <g>
      <rect x="24" y="37" width="92" height="126" rx="12" fill="${tint}" opacity="0.2" stroke="${textColor}" stroke-width="1.05" stroke-opacity="0.26"/>
      ${renderRankBackdrop(rank, palette)}
      <g transform="translate(70 76)">
        ${renderFaceHalf(rank, palette, textColor)}
      </g>
      <g transform="translate(70 124) rotate(180)">
        ${renderFaceHalf(rank, palette, textColor)}
      </g>
      <g transform="translate(70 100) rotate(45)">
        <rect x="-14" y="-14" width="28" height="28" rx="3" fill="#f7f9ff" stroke="${textColor}" stroke-opacity="0.34" stroke-width="1"/>
      </g>
      <text x="70" y="106" text-anchor="middle" dominant-baseline="middle" font-size="24" font-family="Georgia, 'Times New Roman', serif" fill="${textColor}" opacity="0.95">${symbol}</text>
    </g>`;
}

function renderCenter(card: PokerCard): string {
  const symbol = SUIT_SYMBOL[card.suit];
  const textColor = suitColor(card.suit);
  const tint = suitTint(card.suit);
  const rank = card.rank;

  if (rank >= 11 && rank <= 13) {
    return renderFaceCard(rank, card.suit, textColor, tint, symbol);
  }

  if (rank === 14) {
    return `<text x="70" y="102" text-anchor="middle" dominant-baseline="middle" font-size="104" font-family="Georgia, 'Times New Roman', serif" fill="${textColor}" opacity="0.97">${symbol}</text>`;
  }

  return `<text x="70" y="102" text-anchor="middle" dominant-baseline="middle" font-size="70" font-family="Georgia, 'Times New Roman', serif" fill="${textColor}" opacity="0.97">${symbol}</text>`;
}

function enc(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function cardImageUri(card: PokerCard): string {
  const cached = cache.get(card.id);
  if (cached) return cached;

  const rank = RANK_LABEL[card.rank] ?? '?';
  const symbol = SUIT_SYMBOL[card.suit];
  const textColor = suitColor(card.suit);
  const tint = suitTint(card.suit);
  const isTen = rank === '10';
  const cornerRankSize = isTen ? 38 : 43;
  const cornerRankX = isTen ? 8 : 11;
  const cornerSuitSize = 30;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="200" viewBox="0 0 140 200">
  <defs>
    <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f9fbff"/>
      <stop offset="100%" stop-color="#d9dfef"/>
    </linearGradient>
    <linearGradient id="face" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f7f8fd"/>
      <stop offset="100%" stop-color="#e2e7f4"/>
    </linearGradient>
    <linearGradient id="side-shadow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0f1325" stop-opacity="0"/>
      <stop offset="50%" stop-color="#212a4a" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#12172d" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="gloss" cx="0.2" cy="0.06" r="0.95">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="tint-band" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${tint}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="${tint}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="132" height="192" rx="15" fill="url(#shell)" stroke="#9ea8c4" stroke-width="2.2"/>
  <rect x="8" y="8" width="124" height="184" rx="12" fill="url(#face)" stroke="#edf1fa" stroke-width="1.2"/>
  <rect x="10" y="10" width="120" height="180" rx="11" fill="url(#gloss)"/>
  <rect x="42" y="12" width="56" height="176" rx="10" fill="url(#side-shadow)"/>
  <rect x="12" y="12" width="116" height="176" rx="10" fill="url(#tint-band)"/>
  <text x="${cornerRankX}" y="48" font-size="${cornerRankSize}" font-weight="800" font-family="'Trebuchet MS', Verdana, sans-serif" fill="${textColor}">${rank}</text>
  <text x="22" y="81" font-size="${cornerSuitSize}" font-family="Georgia, 'Times New Roman', serif" fill="${textColor}">${symbol}</text>
  <g transform="rotate(180 70 100)">
    <text x="${cornerRankX}" y="48" font-size="${cornerRankSize}" font-weight="800" font-family="'Trebuchet MS', Verdana, sans-serif" fill="${textColor}">${rank}</text>
    <text x="22" y="81" font-size="${cornerSuitSize}" font-family="Georgia, 'Times New Roman', serif" fill="${textColor}">${symbol}</text>
  </g>
  ${renderCenter(card)}
</svg>`;

  const uri = enc(svg);
  cache.set(card.id, uri);
  return uri;
}

export function cardBackUri(): string {
  if (backCache) return backCache;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="200" viewBox="0 0 140 200">
  <defs>
    <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8ecf7"/>
      <stop offset="100%" stop-color="#b9c3dd"/>
    </linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#253572"/>
      <stop offset="100%" stop-color="#161d45"/>
    </linearGradient>
    <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#ffffff" stroke-opacity="0.11" stroke-width="0.8"/>
    </pattern>
    <radialGradient id="glow" cx="0.35" cy="0.22" r="0.95">
      <stop offset="0%" stop-color="#9fb1ff" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#9fb1ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="4" y="4" width="132" height="192" rx="15" fill="url(#shell)" stroke="#8d9dbf" stroke-width="2.2"/>
  <rect x="8" y="8" width="124" height="184" rx="12" fill="url(#bg)"/>
  <rect x="11" y="11" width="118" height="178" rx="10" fill="url(#grid)"/>
  <rect x="11" y="11" width="118" height="178" rx="10" fill="url(#glow)"/>
  <rect x="18" y="18" width="104" height="164" rx="9" fill="none" stroke="#dbe5ff" stroke-opacity="0.42" stroke-width="1.1"/>
  <rect x="24" y="24" width="92" height="152" rx="8" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="0.9"/>
  <path d="M36 42 H104 M36 64 H104 M36 86 H104 M36 108 H104 M36 130 H104 M36 152 H104" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1"/>
</svg>`;

  backCache = enc(svg);
  return backCache;
}
