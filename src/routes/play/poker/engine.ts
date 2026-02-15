export type PlayerRole = 'human' | 'program' | 'agent';
export type PokerVariant = 'texas' | 'classic';
export type Suit = 'S' | 'H' | 'D' | 'C';
export type Phase =
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'draw'
  | 'betting'
  | 'showdown'
  | 'done';
export type ActionKind = 'fold' | 'check' | 'call' | 'raise' | 'draw' | 'stand';

export interface ActionDecision {
  action: ActionKind;
  discardIndices?: number[];
}

export interface PokerCard {
  id: string;
  rank: number;
  suit: Suit;
}

export interface PlayerSetup {
  id: string;
  role: PlayerRole;
  name: string;
  gatewayId: string | null;
}

export interface PokerPlayer extends PlayerSetup {
  chips: number;
  hole: PokerCard[];
  folded: boolean;
  bet: number;
  acted: boolean;
  drawDone: boolean;
}

export interface HandRank {
  category: number;
  tiebreakers: number[];
  label: string;
}

export interface PokerOddsEntry {
  category: number;
  label: string;
  probability: number;
  hitCount: number;
}

export interface PokerOddsSummary {
  currentLabel: string;
  currentCategory: number | null;
  remainingCards: number;
  totalOutcomes: number;
  exact: boolean;
  odds: PokerOddsEntry[];
}

export interface PokerHandPreview {
  rank: HandRank;
  bestCards: PokerCard[];
  keyCards: PokerCard[];
}

export interface PokerState {
  variant: PokerVariant;
  players: PokerPlayer[];
  deck: PokerCard[];
  community: PokerCard[];
  phase: Phase;
  dealerIndex: number;
  turnIndex: number;
  ante: number;
  smallBlind: number;
  bigBlind: number;
  raiseSize: number;
  raisesThisRound: number;
  maxRaisesPerRound: number;
  currentBet: number;
  pot: number;
  handNumber: number;
  winnerIds: string[];
  showdownRanks: Record<string, HandRank>;
  lastAction: string;
  log: string[];
}

const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

const RANK_LABEL: Record<number, string> = {
  14: 'A',
  13: 'K',
  12: 'Q',
  11: 'J',
  10: 'T',
  9: '9',
  8: '8',
  7: '7',
  6: '6',
  5: '5',
  4: '4',
  3: '3',
  2: '2',
};

const HAND_LABELS = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
] as const;
export const HAND_CATEGORY_LABELS = [...HAND_LABELS] as const;

const SUIT_ORDER: Record<Suit, number> = {
  S: 4,
  H: 3,
  D: 2,
  C: 1,
};

const LOG_LIMIT = 40;
const INITIAL_CHIPS = 1200;
const ANTE = 10;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const RAISE_SIZE = 20;
const MAX_RAISES_PER_ROUND = 3;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 7;

function normalizePlayers(players: PlayerSetup[]): PlayerSetup[] {
  const trimmed = players
    .map((player) => ({
      ...player,
      name: player.name.trim() || player.id,
      gatewayId: player.gatewayId ?? null,
    }))
    .filter((player) => player.id.trim().length > 0);

  if (trimmed.length < MIN_PLAYERS || trimmed.length > MAX_PLAYERS) {
    throw new Error(`Poker supports ${MIN_PLAYERS}~${MAX_PLAYERS} players.`);
  }

  const ids = new Set<string>();
  for (const player of trimmed) {
    if (ids.has(player.id)) throw new Error(`Duplicate player id: ${player.id}`);
    ids.add(player.id);
  }

  const humanCount = trimmed.filter((player) => player.role === 'human').length;
  if (humanCount !== 1) {
    throw new Error('Poker requires exactly one human seat.');
  }

  return trimmed;
}

function addLog(state: PokerState, text: string): PokerState {
  if (!text.trim()) return state;
  return {
    ...state,
    log: [text, ...state.log].slice(0, LOG_LIMIT),
  };
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function buildDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({
        id: `${RANK_LABEL[rank]}${suit}`,
        rank,
        suit,
      });
    }
  }
  return deck;
}

function nextSeat(index: number, len: number): number {
  return (index + 1) % len;
}

function getPlayerIndex(state: PokerState, playerId: string): number {
  return state.players.findIndex((player) => player.id === playerId);
}

export function getPlayerById(state: PokerState, playerId: string): PokerPlayer {
  const found = state.players.find((player) => player.id === playerId);
  if (!found) throw new Error(`Player not found: ${playerId}`);
  return found;
}

function updatePlayer(state: PokerState, playerId: string, patch: Partial<PokerPlayer>): PokerState {
  const idx = getPlayerIndex(state, playerId);
  if (idx < 0) return state;
  const nextPlayers = [...state.players];
  nextPlayers[idx] = { ...nextPlayers[idx], ...patch };
  return { ...state, players: nextPlayers };
}

function activePlayers(state: PokerState): PokerPlayer[] {
  return state.players.filter((player) => !player.folded);
}

function isBettingPhase(state: PokerState): boolean {
  if (state.variant === 'classic') return state.phase === 'betting';
  return (
    state.phase === 'preflop' ||
    state.phase === 'flop' ||
    state.phase === 'turn' ||
    state.phase === 'river'
  );
}

function firstActiveIndexFrom(
  state: PokerState,
  startIndex: number,
  predicate: (player: PokerPlayer) => boolean,
): number {
  let idx = startIndex;
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[idx];
    if (predicate(player)) return idx;
    idx = nextSeat(idx, state.players.length);
  }
  return startIndex;
}

function postBlind(state: PokerState, index: number, amount: number, label: string): PokerState {
  const player = state.players[index];
  const blind = Math.min(amount, player.chips);

  const nextPlayers = [...state.players];
  nextPlayers[index] = {
    ...player,
    chips: player.chips - blind,
    bet: player.bet + blind,
  };

  return addLog(
    {
      ...state,
      players: nextPlayers,
      pot: state.pot + blind,
      currentBet: Math.max(state.currentBet, nextPlayers[index].bet),
      lastAction: `${player.name} posts ${label} ${blind}.`,
    },
    `${player.name} posts ${label} ${blind}.`,
  );
}

function collectAntes(state: PokerState): PokerState {
  let total = 0;
  const nextPlayers = state.players.map((player) => {
    const ante = Math.min(state.ante, player.chips);
    total += ante;
    return {
      ...player,
      chips: player.chips - ante,
      bet: 0,
      acted: false,
      drawDone: false,
    };
  });

  return addLog(
    {
      ...state,
      players: nextPlayers,
      pot: state.pot + total,
      lastAction: `All players post ante ${state.ante}.`,
    },
    `All players post ante ${state.ante}.`,
  );
}

function revealCommunity(state: PokerState, count: number): PokerState {
  const revealCount = Math.min(count, state.deck.length);
  const revealed = state.deck.slice(0, revealCount);
  return {
    ...state,
    deck: state.deck.slice(revealCount),
    community: [...state.community, ...revealed],
  };
}

function resetRoundBets(state: PokerState): PokerState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      bet: 0,
      acted: false,
    })),
    currentBet: 0,
    raisesThisRound: 0,
  };
}

function canPlayerBet(player: PokerPlayer): boolean {
  return !player.folded && player.chips > 0;
}

function isBettingRoundComplete(state: PokerState): boolean {
  const contenders = state.players.filter((player) => !player.folded);
  if (contenders.length <= 1) return true;

  for (const player of contenders) {
    if (player.chips === 0 && player.bet < state.currentBet) return false;
    if (!player.acted) return false;
    if (player.bet !== state.currentBet && player.chips > 0) return false;
  }
  return true;
}

function rankCompare(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function nChooseK(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i++) {
    result = (result * (n - kk + i)) / i;
  }
  return Math.round(result);
}

function forEachCombination<T>(arr: T[], k: number, cb: (combo: T[]) => void): void {
  if (k === 0) {
    cb([]);
    return;
  }
  const pick: T[] = [];
  const walk = (start: number, depth: number) => {
    if (depth === k) {
      cb([...pick]);
      return;
    }
    for (let i = start; i <= arr.length - (k - depth); i++) {
      pick.push(arr[i]);
      walk(i + 1, depth + 1);
      pick.pop();
    }
  };
  walk(0, 0);
}

function sampleCombination<T>(arr: T[], k: number): T[] {
  const pool = [...arr];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, k);
}

function chooseFiveFromSeven(cards: PokerCard[]): PokerCard[][] {
  const out: PokerCard[][] = [];
  for (let i = 0; i < cards.length - 4; i++) {
    for (let j = i + 1; j < cards.length - 3; j++) {
      for (let k = j + 1; k < cards.length - 2; k++) {
        for (let l = k + 1; l < cards.length - 1; l++) {
          for (let m = l + 1; m < cards.length; m++) {
            out.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
          }
        }
      }
    }
  }
  return out;
}

function straightHigh(uniqueRanksDesc: number[]): number | null {
  const set = new Set(uniqueRanksDesc);
  if (set.has(14)) set.add(1);
  const sorted = [...set].sort((a, b) => b - a);
  for (let i = 0; i <= sorted.length - 5; i++) {
    const start = sorted[i];
    let ok = true;
    for (let step = 1; step < 5; step++) {
      if (!set.has(start - step)) {
        ok = false;
        break;
      }
    }
    if (ok) return start === 1 ? 5 : start;
  }
  return null;
}

function evaluateFive(cards: PokerCard[]): HandRank {
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const suits = cards.map((card) => card.suit);
  const flush = suits.every((suit) => suit === suits[0]);

  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const uniqueRanks = [...new Set(ranks)];
  const straight = straightHigh(uniqueRanks);

  if (flush && straight) {
    return { category: 8, tiebreakers: [straight], label: HAND_LABELS[8] };
  }

  if (groups[0][1] === 4) {
    const four = groups[0][0];
    const kicker = groups[1][0];
    return { category: 7, tiebreakers: [four, kicker], label: HAND_LABELS[7] };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { category: 6, tiebreakers: [groups[0][0], groups[1][0]], label: HAND_LABELS[6] };
  }

  if (flush) {
    return { category: 5, tiebreakers: ranks, label: HAND_LABELS[5] };
  }

  if (straight) {
    return { category: 4, tiebreakers: [straight], label: HAND_LABELS[4] };
  }

  if (groups[0][1] === 3) {
    const trip = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { category: 3, tiebreakers: [trip, ...kickers], label: HAND_LABELS[3] };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const highPair = Math.max(groups[0][0], groups[1][0]);
    const lowPair = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups[2][0];
    return { category: 2, tiebreakers: [highPair, lowPair, kicker], label: HAND_LABELS[2] };
  }

  if (groups[0][1] === 2) {
    const pair = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { category: 1, tiebreakers: [pair, ...kickers], label: HAND_LABELS[1] };
  }

  return { category: 0, tiebreakers: ranks, label: HAND_LABELS[0] };
}

function compareCardsDesc(a: PokerCard, b: PokerCard): number {
  if (a.rank !== b.rank) return b.rank - a.rank;
  return SUIT_ORDER[b.suit] - SUIT_ORDER[a.suit];
}

function sortCardsDesc(cards: PokerCard[]): PokerCard[] {
  return [...cards].sort(compareCardsDesc);
}

function compareCardSetDesc(a: PokerCard[], b: PokerCard[]): number {
  const aSorted = sortCardsDesc(a);
  const bSorted = sortCardsDesc(b);
  const len = Math.max(aSorted.length, bSorted.length);
  for (let i = 0; i < len; i++) {
    const aCard = aSorted[i];
    const bCard = bSorted[i];
    if (!aCard && bCard) return -1;
    if (aCard && !bCard) return 1;
    if (!aCard || !bCard) continue;
    if (aCard.rank !== bCard.rank) return aCard.rank - bCard.rank;
    const suitCmp = SUIT_ORDER[aCard.suit] - SUIT_ORDER[bCard.suit];
    if (suitCmp !== 0) return suitCmp;
  }
  return 0;
}

function bestFiveFromCards(cards: PokerCard[]): { rank: HandRank; cards: PokerCard[] } | null {
  const available = cards.slice(0, 7);
  if (available.length < 5) return null;

  let bestCards = available.slice(0, 5);
  let bestRank = evaluateFive(bestCards);

  if (available.length === 5) {
    return { rank: bestRank, cards: bestCards };
  }

  if (available.length === 6) {
    for (let skip = 0; skip < 6; skip++) {
      const pick = available.filter((_, idx) => idx !== skip);
      const rank = evaluateFive(pick);
      const cmp = rankCompare(rank, bestRank);
      if (cmp > 0 || (cmp === 0 && compareCardSetDesc(pick, bestCards) > 0)) {
        bestRank = rank;
        bestCards = pick;
      }
    }
    return { rank: bestRank, cards: bestCards };
  }

  for (const pick of chooseFiveFromSeven(available)) {
    const rank = evaluateFive(pick);
    const cmp = rankCompare(rank, bestRank);
    if (cmp > 0 || (cmp === 0 && compareCardSetDesc(pick, bestCards) > 0)) {
      bestRank = rank;
      bestCards = pick;
    }
  }
  return { rank: bestRank, cards: bestCards };
}

function straightRanks(high: number): number[] {
  if (high === 5) return [5, 4, 3, 2, 14];
  return [high, high - 1, high - 2, high - 3, high - 4];
}

function selectStraightCards(cards: PokerCard[], high: number): PokerCard[] {
  const sorted = sortCardsDesc(cards);
  const needed = straightRanks(high);
  const picked: PokerCard[] = [];

  for (const rank of needed) {
    const found = sorted.find((card) => card.rank === rank && !picked.some((used) => used.id === card.id));
    if (!found) continue;
    picked.push(found);
  }

  return picked;
}

function cardsOfRank(cards: PokerCard[], rank: number, count: number): PokerCard[] {
  return sortCardsDesc(cards)
    .filter((card) => card.rank === rank)
    .slice(0, count);
}

function keyCardsFromBestFive(bestCards: PokerCard[], rank: HandRank): PokerCard[] {
  if (rank.category === 8) {
    return selectStraightCards(bestCards, rank.tiebreakers[0] ?? 5);
  }

  if (rank.category === 7) {
    return cardsOfRank(bestCards, rank.tiebreakers[0] ?? 0, 4);
  }

  if (rank.category === 6) {
    const trip = cardsOfRank(bestCards, rank.tiebreakers[0] ?? 0, 3);
    const pair = cardsOfRank(bestCards, rank.tiebreakers[1] ?? 0, 2);
    return [...trip, ...pair];
  }

  if (rank.category === 5) {
    return sortCardsDesc(bestCards);
  }

  if (rank.category === 4) {
    return selectStraightCards(bestCards, rank.tiebreakers[0] ?? 5);
  }

  if (rank.category === 3) {
    return cardsOfRank(bestCards, rank.tiebreakers[0] ?? 0, 3);
  }

  if (rank.category === 2) {
    const highPair = cardsOfRank(bestCards, rank.tiebreakers[0] ?? 0, 2);
    const lowPair = cardsOfRank(bestCards, rank.tiebreakers[1] ?? 0, 2);
    return [...highPair, ...lowPair];
  }

  if (rank.category === 1) {
    return cardsOfRank(bestCards, rank.tiebreakers[0] ?? 0, 2);
  }

  const high = rank.tiebreakers[0] ?? Math.max(...bestCards.map((card) => card.rank));
  const pick = cardsOfRank(bestCards, high, 1);
  return pick.length ? pick : sortCardsDesc(bestCards).slice(0, 1);
}

function evaluateSeven(cards: PokerCard[]): HandRank {
  const best = bestFiveFromCards(cards.slice(0, 7));
  if (!best) throw new Error('At least 5 cards are required to evaluate a hand.');
  return best.rank;
}

function evaluateBestFromAvailable(cards: PokerCard[]): HandRank | null {
  return bestFiveFromCards(cards)?.rank ?? null;
}

function evaluatePlayerHand(state: PokerState, player: PokerPlayer): HandRank {
  const available = state.variant === 'classic'
    ? player.hole.slice(0, 5)
    : [...player.hole, ...state.community].slice(0, 7);
  const best = bestFiveFromCards(available);
  if (!best) throw new Error('Not enough cards to evaluate player hand.');
  return best.rank;
}

export function analyzePlayerHand(state: PokerState, playerId: string): PokerHandPreview | null {
  const player = getPlayerById(state, playerId);
  const available = state.variant === 'classic'
    ? player.hole.slice(0, 5)
    : [...player.hole, ...state.community].slice(0, 7);
  const best = bestFiveFromCards(available);
  if (!best) return null;

  const bestCards = sortCardsDesc(best.cards);
  const keyCards = sortCardsDesc(keyCardsFromBestFive(best.cards, best.rank));

  return {
    rank: best.rank,
    bestCards,
    keyCards,
  };
}

function awardPotAtShowdown(state: PokerState): PokerState {
  const contenders = activePlayers(state);
  if (!contenders.length) return state;

  const ranks: Record<string, HandRank> = {};
  let best: HandRank | null = null;
  let winnerIds: string[] = [];

  for (const player of contenders) {
    const rank = evaluatePlayerHand(state, player);
    ranks[player.id] = rank;
    if (!best || rankCompare(rank, best) > 0) {
      best = rank;
      winnerIds = [player.id];
    } else if (rankCompare(rank, best) === 0) {
      winnerIds.push(player.id);
    }
  }

  const split = Math.floor(state.pot / winnerIds.length);
  let remainder = state.pot % winnerIds.length;
  const nextPlayers = state.players.map((player) => ({ ...player }));

  for (const winnerId of winnerIds) {
    const idx = nextPlayers.findIndex((player) => player.id === winnerId);
    if (idx < 0) continue;
    nextPlayers[idx].chips += split + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }

  const winnerNames = winnerIds
    .map((id) => state.players.find((player) => player.id === id)?.name ?? id)
    .join(', ');
  const handLabel = best?.label ?? HAND_LABELS[0];
  const line = winnerIds.length > 1
    ? `${winnerNames} split pot ${state.pot} (${handLabel}).`
    : `${winnerNames} wins pot ${state.pot} with ${handLabel}.`;

  const nextState: PokerState = {
    ...state,
    players: nextPlayers,
    pot: 0,
    phase: 'done',
    winnerIds,
    showdownRanks: ranks,
    lastAction: line,
  };
  return addLog(nextState, line);
}

function awardByFold(state: PokerState): PokerState {
  const live = activePlayers(state);
  if (live.length !== 1) return state;

  const winner = live[0];
  const nextPlayers = state.players.map((player) =>
    player.id === winner.id ? { ...player, chips: player.chips + state.pot } : { ...player },
  );

  const line = `${winner.name} wins pot ${state.pot} (others folded).`;
  const nextState: PokerState = {
    ...state,
    players: nextPlayers,
    pot: 0,
    phase: 'done',
    winnerIds: [winner.id],
    showdownRanks: {},
    lastAction: line,
  };
  return addLog(nextState, line);
}

function sanitizeDiscardIndices(indices: number[] | undefined, cardCount: number): number[] {
  if (!indices?.length) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const idx of indices) {
    if (!Number.isInteger(idx)) continue;
    if (idx < 0 || idx >= cardCount) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(idx);
  }
  out.sort((a, b) => b - a);
  return out.slice(0, 3);
}

function advancePhase(state: PokerState): PokerState {
  if (state.variant === 'classic') {
    if (state.phase === 'betting') {
      return awardPotAtShowdown({ ...state, phase: 'showdown' });
    }
    if (state.phase === 'showdown') {
      return awardPotAtShowdown(state);
    }
    return state;
  }

  let next = state;
  if (state.phase === 'preflop') {
    next = revealCommunity(next, 3);
    next = { ...next, phase: 'flop' };
  } else if (state.phase === 'flop') {
    next = revealCommunity(next, 1);
    next = { ...next, phase: 'turn' };
  } else if (state.phase === 'turn') {
    next = revealCommunity(next, 1);
    next = { ...next, phase: 'river' };
  } else if (state.phase === 'river') {
    return awardPotAtShowdown({ ...next, phase: 'showdown' });
  }

  if (next.phase === 'showdown') {
    return awardPotAtShowdown(next);
  }

  const reset = resetRoundBets(next);
  const turnIndex = firstActiveIndexFrom(
    reset,
    nextSeat(reset.dealerIndex, reset.players.length),
    canPlayerBet,
  );

  let nextState = addLog(
    {
      ...reset,
      turnIndex,
    },
    `Phase: ${next.phase.toUpperCase()}.`,
  );

  const hasActor = nextState.players.some(canPlayerBet);
  if (!hasActor && nextState.phase !== 'done') {
    nextState = advancePhase(nextState);
  }

  return nextState;
}

function nextTurnAfterBetAction(state: PokerState): PokerState {
  if (activePlayers(state).length <= 1) return awardByFold(state);

  if (isBettingRoundComplete(state)) {
    return advancePhase(state);
  }

  let nextIndex = nextSeat(state.turnIndex, state.players.length);
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[nextIndex];
    if (canPlayerBet(player)) {
      return { ...state, turnIndex: nextIndex };
    }
    nextIndex = nextSeat(nextIndex, state.players.length);
  }
  return advancePhase(state);
}

function nextTurnAfterDrawAction(state: PokerState): PokerState {
  if (activePlayers(state).length <= 1) return awardByFold(state);

  const pending = state.players.some((player) => !player.folded && !player.drawDone);
  if (!pending) {
    const reset = resetRoundBets({ ...state, phase: 'betting' });
    const turnIndex = firstActiveIndexFrom(
      reset,
      nextSeat(reset.dealerIndex, reset.players.length),
      canPlayerBet,
    );
    const nextState = {
      ...reset,
      turnIndex,
    };
    return addLog(nextState, 'Draw complete. Betting round starts.');
  }

  let nextIndex = nextSeat(state.turnIndex, state.players.length);
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[nextIndex];
    if (!player.folded && !player.drawDone) {
      return { ...state, turnIndex: nextIndex };
    }
    nextIndex = nextSeat(nextIndex, state.players.length);
  }

  return state;
}

function withActionLine(state: PokerState, line: string): PokerState {
  return addLog({ ...state, lastAction: line }, line);
}

export function createNewGame(
  players: PlayerSetup[],
  variant: PokerVariant,
  handNumber = 1,
): PokerState {
  const setup = normalizePlayers(players);
  const deck = shuffle(buildDeck());

  const seats: PokerPlayer[] = setup.map((player) => ({
    ...player,
    chips: INITIAL_CHIPS,
    hole: [],
    folded: false,
    bet: 0,
    acted: false,
    drawDone: false,
  }));

  const holeCount = variant === 'texas' ? 2 : 5;
  for (let round = 0; round < holeCount; round++) {
    for (let i = 0; i < seats.length; i++) {
      const card = deck.pop();
      if (!card) throw new Error('Deck exhausted while dealing cards.');
      seats[i].hole.push(card);
    }
  }

  const dealerIndex = Math.floor(Math.random() * seats.length);
  let state: PokerState = {
    variant,
    players: seats,
    deck,
    community: [],
    phase: variant === 'texas' ? 'preflop' : 'draw',
    dealerIndex,
    turnIndex: nextSeat(dealerIndex, seats.length),
    ante: ANTE,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    raiseSize: RAISE_SIZE,
    raisesThisRound: 0,
    maxRaisesPerRound: MAX_RAISES_PER_ROUND,
    currentBet: 0,
    pot: 0,
    handNumber,
    winnerIds: [],
    showdownRanks: {},
    lastAction: 'Hand started.',
    log: [],
  };

  state = addLog(
    state,
    `Hand #${handNumber} started (${variant === 'texas' ? 'Texas Holdem' : 'Classic Poker'}). Dealer: ${seats[dealerIndex].name}.`,
  );

  if (variant === 'texas') {
    const sbIndex = nextSeat(dealerIndex, seats.length);
    const bbIndex = nextSeat(sbIndex, seats.length);
    state = postBlind(state, sbIndex, SMALL_BLIND, 'SB');
    state = postBlind(state, bbIndex, BIG_BLIND, 'BB');
    state = {
      ...state,
      turnIndex: firstActiveIndexFrom(state, nextSeat(bbIndex, seats.length), canPlayerBet),
    };
  } else {
    state = collectAntes(state);
    state = {
      ...state,
      turnIndex: firstActiveIndexFrom(state, nextSeat(dealerIndex, seats.length), (player) => !player.folded),
    };
    state = addLog(state, 'Draw phase started.');
  }

  return state;
}

export function getCurrentPlayer(state: PokerState): PokerPlayer {
  return state.players[state.turnIndex];
}

export function cardLabel(card: PokerCard): string {
  return `${RANK_LABEL[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

export function phaseLabel(phase: Phase, locale: string): string {
  if (locale.startsWith('ko')) {
    if (phase === 'preflop') return '프리플랍';
    if (phase === 'flop') return '플랍';
    if (phase === 'turn') return '턴';
    if (phase === 'river') return '리버';
    if (phase === 'draw') return '드로우';
    if (phase === 'betting') return '베팅';
    if (phase === 'showdown') return '쇼다운';
    return '종료';
  }
  return phase;
}

export function variantLabel(variant: PokerVariant, locale: string): string {
  if (locale.startsWith('ko')) {
    return variant === 'texas' ? '텍사스 홀덤' : '일반 포커';
  }
  return variant === 'texas' ? 'Texas Holdem' : 'Classic Poker';
}

export function legalActions(state: PokerState, playerId: string): ActionKind[] {
  if (state.phase === 'done' || state.phase === 'showdown') return [];
  if (state.players[state.turnIndex]?.id !== playerId) return [];

  const player = getPlayerById(state, playerId);
  if (player.folded) return [];

  if (state.variant === 'classic' && state.phase === 'draw') {
    return ['stand', 'draw'];
  }

  if (!isBettingPhase(state)) return [];
  if (player.chips <= 0) return [];

  const toCall = Math.max(0, state.currentBet - player.bet);
  const actions: ActionKind[] = [];

  if (toCall > 0) {
    actions.push('fold');
    if (player.chips >= toCall) actions.push('call');
    if (
      player.chips >= toCall + state.raiseSize &&
      state.raisesThisRound < state.maxRaisesPerRound
    ) {
      actions.push('raise');
    }
  } else {
    actions.push('check');
    if (player.chips >= state.raiseSize && state.raisesThisRound < state.maxRaisesPerRound) {
      actions.push('raise');
    }
  }

  return actions;
}

export function applyAction(
  state: PokerState,
  playerId: string,
  action: ActionKind,
  options?: { discardIndices?: number[] },
): PokerState {
  const legal = legalActions(state, playerId);
  if (!legal.includes(action)) return state;

  const actor = getPlayerById(state, playerId);
  let next = state;

  if (state.variant === 'classic' && state.phase === 'draw') {
    if (action === 'stand') {
      next = updatePlayer(next, playerId, { acted: true, drawDone: true });
      next = withActionLine(next, `${actor.name} stands pat.`);
      return nextTurnAfterDrawAction(next);
    }

    if (action === 'draw') {
      const player = getPlayerById(next, playerId);
      const discard = sanitizeDiscardIndices(options?.discardIndices, player.hole.length)
        .slice(0, next.deck.length);
      if (discard.length === 0) {
        next = updatePlayer(next, playerId, { acted: true, drawDone: true });
        next = withActionLine(next, `${actor.name} stands pat.`);
        return nextTurnAfterDrawAction(next);
      }
      const nextHole = [...player.hole];
      for (const idx of discard) {
        nextHole.splice(idx, 1);
      }

      const drawCount = Math.min(discard.length, next.deck.length);
      const drawn = next.deck.slice(0, drawCount);
      next = {
        ...next,
        deck: next.deck.slice(drawCount),
      };

      next = updatePlayer(next, playerId, {
        hole: [...nextHole, ...drawn],
        acted: true,
        drawDone: true,
      });

      const line = drawCount > 0
        ? `${actor.name} draws ${drawCount} card${drawCount > 1 ? 's' : ''}.`
        : `${actor.name} stands pat.`;
      next = withActionLine(next, line);
      return nextTurnAfterDrawAction(next);
    }

    return next;
  }

  if (action === 'fold') {
    next = updatePlayer(next, playerId, { folded: true, acted: true, drawDone: true });
    next = withActionLine(next, `${actor.name} folds.`);
    return nextTurnAfterBetAction(next);
  }

  if (action === 'check') {
    next = updatePlayer(next, playerId, { acted: true });
    next = withActionLine(next, `${actor.name} checks.`);
    return nextTurnAfterBetAction(next);
  }

  if (action === 'call') {
    const player = getPlayerById(next, playerId);
    const toCall = Math.max(0, next.currentBet - player.bet);
    if (player.chips < toCall) return state;

    next = updatePlayer(next, playerId, {
      chips: player.chips - toCall,
      bet: player.bet + toCall,
      acted: true,
    });
    next = {
      ...next,
      pot: next.pot + toCall,
    };
    next = withActionLine(next, `${actor.name} calls ${toCall}.`);
    return nextTurnAfterBetAction(next);
  }

  if (action === 'raise') {
    const player = getPlayerById(next, playerId);
    const toCall = Math.max(0, next.currentBet - player.bet);
    const total = toCall + next.raiseSize;
    if (player.chips < total) return state;

    const targetBet = player.bet + total;
    next = updatePlayer(next, playerId, {
      chips: player.chips - total,
      bet: targetBet,
      acted: true,
    });
    next = {
      ...next,
      pot: next.pot + total,
      currentBet: targetBet,
      raisesThisRound: next.raisesThisRound + 1,
      players: next.players.map((p) =>
        p.id === playerId || p.folded || p.chips <= 0 ? p : { ...p, acted: false },
      ),
    };
    next = withActionLine(next, `${actor.name} raises to ${targetBet}.`);
    return nextTurnAfterBetAction(next);
  }

  return next;
}

function actionWeight(action: ActionKind): number {
  if (action === 'raise') return 4;
  if (action === 'call') return 3;
  if (action === 'check') return 2;
  if (action === 'draw') return 1;
  if (action === 'stand') return 1;
  return 0;
}

function preflopStrength(cards: PokerCard[]): number {
  if (cards.length < 2) return 0;
  const [a, b] = cards[0].rank >= cards[1].rank ? cards : [cards[1], cards[0]];
  const pair = a.rank === b.rank;
  const suited = a.suit === b.suit;
  const gap = Math.abs(a.rank - b.rank);

  let score = a.rank / 14 + b.rank / 20;
  if (pair) score += 1 + a.rank / 18;
  if (suited) score += 0.14;
  if (gap === 1) score += 0.1;
  if (gap >= 4) score -= 0.08;
  return score;
}

function handStrength(state: PokerState, player: PokerPlayer): number {
  if (state.variant === 'classic') {
    const rank = evaluateFive(player.hole.slice(0, 5));
    return rank.category * 2 + (rank.tiebreakers[0] ?? 0) / 14;
  }

  if (state.community.length < 3) {
    return preflopStrength(player.hole);
  }

  const rank = evaluateSeven([...player.hole, ...state.community]);
  return rank.category * 2 + (rank.tiebreakers[0] ?? 0) / 14;
}

function chooseDiscardIndices(cards: PokerCard[]): number[] {
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);

  const keepRanks = new Set<number>();
  for (const [rank, count] of counts) {
    if (count >= 2) keepRanks.add(rank);
  }

  if (keepRanks.size === 0) {
    const sorted = [...cards]
      .map((card, index) => ({ card, index }))
      .sort((a, b) => b.card.rank - a.card.rank);
    for (const entry of sorted.slice(0, 2)) {
      if (entry.card.rank >= 11) keepRanks.add(entry.card.rank);
    }
  }

  const discard = cards
    .map((card, index) => ({ card, index }))
    .filter((entry) => !keepRanks.has(entry.card.rank))
    .map((entry) => entry.index);

  if (!discard.length && Math.random() < 0.28) {
    const lowest = cards
      .map((card, index) => ({ card, index }))
      .sort((a, b) => a.card.rank - b.card.rank)[0];
    if (lowest.card.rank <= 10) {
      return [lowest.index];
    }
  }

  return discard.slice(0, 3);
}

export function chooseProgramAction(state: PokerState, playerId: string): ActionDecision {
  const legal = legalActions(state, playerId);
  if (!legal.length) return { action: 'fold' };

  const player = getPlayerById(state, playerId);

  if (state.variant === 'classic' && state.phase === 'draw') {
    const discard = chooseDiscardIndices(player.hole);
    if (discard.length && legal.includes('draw')) {
      return { action: 'draw', discardIndices: discard };
    }
    return { action: legal.includes('stand') ? 'stand' : legal[0] };
  }

  const toCall = Math.max(0, state.currentBet - player.bet);
  const potPressure = toCall / Math.max(1, state.pot);
  const strength = handStrength(state, player);

  if (legal.includes('raise')) {
    if (state.variant === 'texas' && state.phase === 'preflop' && strength >= 1.95 && Math.random() < 0.72) {
      return { action: 'raise' };
    }
    if (strength >= 4.2 && Math.random() < 0.8) return { action: 'raise' };
    if (strength >= 3.0 && potPressure < 0.22 && Math.random() < 0.42) return { action: 'raise' };
  }

  if (legal.includes('check')) return { action: 'check' };

  if (legal.includes('call')) {
    if (strength >= 2.0) return { action: 'call' };
    if (potPressure < 0.16 && Math.random() < 0.7) return { action: 'call' };
  }

  const ranked = [...legal].sort((a, b) => actionWeight(b) - actionWeight(a));
  if (ranked.includes('fold')) return { action: 'fold' };
  return { action: ranked[0] };
}

function legalText(actions: ActionKind[]): string {
  return actions.join(', ');
}

function phaseDesc(phase: Phase): string {
  if (phase === 'draw') return 'draw';
  if (phase === 'betting') return 'betting';
  if (phase === 'preflop') return 'preflop';
  if (phase === 'flop') return 'flop';
  if (phase === 'turn') return 'turn';
  if (phase === 'river') return 'river';
  if (phase === 'showdown') return 'showdown';
  return 'done';
}

function communityText(cards: PokerCard[]): string {
  return cards.length ? cards.map(cardLabel).join(' ') : '(none)';
}

function handText(cards: PokerCard[]): string {
  return cards.map(cardLabel).join(' ');
}

export function buildAgentPrompt(state: PokerState, playerId: string, locale: string): string {
  const player = getPlayerById(state, playerId);
  const actions = legalActions(state, playerId);
  const toCall = Math.max(0, state.currentBet - player.bet);
  const isKo = locale.startsWith('ko');

  const seatLines = state.players
    .map((p) => `${p.name}: chips=${p.chips}, folded=${p.folded ? 'yes' : 'no'}, bet=${p.bet}`)
    .join('\n');
  const history = state.log.slice(0, 12).reverse().join('\n');

  if (isKo) {
    const drawInstruction = state.phase === 'draw'
      ? '드로우 단계에서는 "draw 1,3" 또는 "stand" 형식으로 답해.'
      : '';

    return `너는 포커 플레이어 "${player.name}"이다.
한 줄에 행동만 답해: fold/check/call/raise/draw/stand
${drawInstruction}

게임 모드: ${state.variant === 'texas' ? '텍사스 홀덤' : '일반 포커'}
현재 단계: ${phaseDesc(state.phase)}
공용 카드: ${communityText(state.community)}
내 패: ${handText(player.hole)}
팟: ${state.pot}
현재 베팅: ${state.currentBet}
내가 콜할 금액: ${toCall}
가능 행동: ${legalText(actions)}

좌석 상태:
${seatLines}

최근 로그:
${history || '(없음)'}

설명 없이 행동만 출력해.`;
  }

  const drawInstruction = state.phase === 'draw'
    ? 'During draw phase, answer as "draw 1,3" (1-based card indexes) or "stand".'
    : '';

  return `You are poker player "${player.name}".
Reply with exactly one action token: fold/check/call/raise/draw/stand
${drawInstruction}

Mode: ${state.variant === 'texas' ? 'Texas Holdem' : 'Classic Poker'}
Phase: ${phaseDesc(state.phase)}
Community cards: ${communityText(state.community)}
Your cards: ${handText(player.hole)}
Pot: ${state.pot}
Current bet: ${state.currentBet}
Amount to call: ${toCall}
Legal actions: ${legalText(actions)}

Seat states:
${seatLines}

Recent log:
${history || '(none)'}

Output only the action.`;
}

export function parseAgentAction(response: string, legal: ActionKind[]): ActionDecision | null {
  if (!response.trim() || !legal.length) return null;
  const lower = response.toLowerCase();

  if (legal.includes('draw')) {
    const drawMatch = lower.match(/draw(?:\s+([1-5,\s]+))?/i);
    if (drawMatch) {
      const raw = drawMatch[1] ?? '';
      const discardIndices = raw
        .split(',')
        .map((v) => Number.parseInt(v.trim(), 10))
        .filter((n) => Number.isFinite(n))
        .map((n) => n - 1)
        .filter((n) => n >= 0 && n < 5)
        .slice(0, 3);
      return { action: 'draw', discardIndices };
    }
  }

  if (legal.includes('stand')) {
    if (/(^|\W)(stand|stay|hold|pat)(?=$|\W)/i.test(lower)) {
      return { action: 'stand' };
    }
  }

  const priority: ActionKind[] = ['raise', 'call', 'check', 'fold'];
  for (const action of priority) {
    if (!legal.includes(action)) continue;
    const re = new RegExp(`(^|\\W)${action}(?=$|\\W)`, 'i');
    if (re.test(lower)) return { action };
  }

  for (const action of legal) {
    if (lower.includes(action)) return { action };
  }

  return null;
}

export function scoreBoard(state: PokerState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const player of state.players) {
    out[player.id] = player.chips;
  }
  return out;
}

export function calculatePlayerOdds(
  state: PokerState,
  playerId: string,
  options?: {
    discardIndices?: number[];
    maxExactCombos?: number;
    sampleCount?: number;
  },
): PokerOddsSummary {
  const player = getPlayerById(state, playerId);
  const maxExactCombos = Math.max(2000, options?.maxExactCombos ?? 70000);
  const sampleCount = Math.max(3000, options?.sampleCount ?? 22000);
  const counts = new Array<number>(HAND_LABELS.length).fill(0);

  let currentRank: HandRank | null = null;
  let remainingCards = 0;
  let evaluator: (draws: PokerCard[]) => HandRank;

  if (state.variant === 'texas') {
    const known = [...player.hole, ...state.community];
    currentRank = evaluateBestFromAvailable(known);
    remainingCards = Math.max(0, 5 - state.community.length);
    evaluator = (draws: PokerCard[]) => evaluateSeven([...known, ...draws]);
  } else {
    currentRank = evaluateFive(player.hole.slice(0, 5));
    const discard = state.phase === 'draw'
      ? sanitizeDiscardIndices(options?.discardIndices, player.hole.length).slice(0, 3)
      : [];
    const baseHole = [...player.hole];
    for (const idx of discard) {
      baseHole.splice(idx, 1);
    }
    remainingCards = discard.length;
    evaluator = (draws: PokerCard[]) => evaluateFive([...baseHole, ...draws].slice(0, 5));
  }

  if (remainingCards === 0) {
    const fixed = evaluator([]);
    counts[fixed.category] = 1;
    return {
      currentLabel: currentRank?.label ?? fixed.label,
      currentCategory: currentRank?.category ?? fixed.category,
      remainingCards: 0,
      totalOutcomes: 1,
      exact: true,
      odds: [
        {
          category: fixed.category,
          label: fixed.label,
          probability: 1,
          hitCount: 1,
        },
      ],
    };
  }

  const pool = [...state.deck];
  if (pool.length < remainingCards) {
    const fallback = evaluator([]);
    return {
      currentLabel: currentRank?.label ?? fallback.label,
      currentCategory: currentRank?.category ?? fallback.category,
      remainingCards,
      totalOutcomes: 1,
      exact: true,
      odds: [
        {
          category: fallback.category,
          label: fallback.label,
          probability: 1,
          hitCount: 1,
        },
      ],
    };
  }

  const totalCombos = nChooseK(pool.length, remainingCards);
  const useExact = totalCombos > 0 && totalCombos <= maxExactCombos;
  let totalOutcomes = 0;

  if (useExact) {
    forEachCombination(pool, remainingCards, (draws) => {
      const rank = evaluator(draws);
      counts[rank.category] += 1;
      totalOutcomes += 1;
    });
  } else {
    for (let i = 0; i < sampleCount; i++) {
      const draws = sampleCombination(pool, remainingCards);
      const rank = evaluator(draws);
      counts[rank.category] += 1;
    }
    totalOutcomes = sampleCount;
  }

  const odds: PokerOddsEntry[] = counts
    .map((hitCount, category) => ({
      category,
      label: HAND_LABELS[category],
      probability: totalOutcomes > 0 ? hitCount / totalOutcomes : 0,
      hitCount,
    }))
    .filter((row) => row.hitCount > 0)
    .sort((a, b) => b.probability - a.probability || b.category - a.category);

  return {
    currentLabel: currentRank?.label ?? 'No made hand',
    currentCategory: currentRank?.category ?? null,
    remainingCards,
    totalOutcomes,
    exact: useExact,
    odds,
  };
}
