export type PlayerRole = 'human' | 'program' | 'agent';
export type PlayerId = 'left' | 'right' | 'human';
export type Suit = 'S' | 'H' | 'D' | 'C';
export type Phase = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'done';
export type ActionKind = 'fold' | 'check' | 'call' | 'raise';

export interface PokerCard {
  id: string;
  rank: number;
  suit: Suit;
}

export interface PlayerSetup {
  id: PlayerId;
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
}

export interface PokerState {
  players: PokerPlayer[];
  deck: PokerCard[];
  community: PokerCard[];
  phase: Phase;
  dealerIndex: number;
  turnIndex: number;
  smallBlind: number;
  bigBlind: number;
  raiseSize: number;
  raisesThisRound: number;
  maxRaisesPerRound: number;
  currentBet: number;
  pot: number;
  handNumber: number;
  winnerIds: PlayerId[];
  showdownRanks: Partial<Record<PlayerId, HandRank>>;
  lastAction: string;
  log: string[];
}

export interface HandRank {
  category: number;
  tiebreakers: number[];
  label: string;
}

const PLAYER_ORDER: PlayerId[] = ['left', 'right', 'human'];
const LOG_LIMIT = 28;
const INITIAL_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const RAISE_SIZE = 20;
const MAX_RAISES_PER_ROUND = 2;

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

function normalizePlayers(players: PlayerSetup[]): PlayerSetup[] {
  const byId = new Map<PlayerId, PlayerSetup>();
  for (const player of players) {
    byId.set(player.id, {
      ...player,
      gatewayId: player.gatewayId ?? null,
    });
  }

  const ordered = PLAYER_ORDER.map((id) => byId.get(id)).filter(Boolean) as PlayerSetup[];
  if (ordered.length !== 3) throw new Error('Texas poker requires left/right/human seats.');
  if (ordered[2].role !== 'human') throw new Error('Human seat must use role "human".');
  return ordered;
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

function getPlayerIndex(state: PokerState, playerId: PlayerId): number {
  return state.players.findIndex((player) => player.id === playerId);
}

function getPlayer(state: PokerState, playerId: PlayerId): PokerPlayer {
  const found = state.players.find((player) => player.id === playerId);
  if (!found) throw new Error(`Player not found: ${playerId}`);
  return found;
}

function updatePlayer(state: PokerState, playerId: PlayerId, patch: Partial<PokerPlayer>): PokerState {
  const idx = getPlayerIndex(state, playerId);
  if (idx < 0) return state;
  const nextPlayers = [...state.players];
  nextPlayers[idx] = { ...nextPlayers[idx], ...patch };
  return { ...state, players: nextPlayers };
}

function nextSeat(index: number, len: number): number {
  return (index + 1) % len;
}

function postBlind(state: PokerState, index: number, amount: number, label: string): PokerState {
  const player = state.players[index];
  const blind = Math.min(amount, player.chips);
  const chips = player.chips - blind;
  const bet = blind;

  const nextPlayers = [...state.players];
  nextPlayers[index] = {
    ...player,
    chips,
    bet,
  };

  return addLog(
    {
      ...state,
      players: nextPlayers,
      pot: state.pot + blind,
      currentBet: Math.max(state.currentBet, blind),
      lastAction: `${player.name} posts ${label} ${blind}.`,
    },
    `${player.name} posts ${label} ${blind}.`,
  );
}

function firstActiveIndexFrom(state: PokerState, startIndex: number): number {
  let idx = startIndex;
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[idx];
    if (!player.folded && player.chips > 0) return idx;
    idx = nextSeat(idx, state.players.length);
  }
  return startIndex;
}

function activePlayers(state: PokerState): PokerPlayer[] {
  return state.players.filter((player) => !player.folded);
}

function canPlayerAct(player: PokerPlayer): boolean {
  return !player.folded && player.chips > 0;
}

function isBettingRoundComplete(state: PokerState): boolean {
  const contenders = state.players.filter((player) => !player.folded && player.chips >= 0);
  if (contenders.length <= 1) return true;

  for (const player of contenders) {
    if (player.chips === 0 && player.bet < state.currentBet) return false;
    if (!player.acted) return false;
    if (player.bet !== state.currentBet && player.chips > 0) return false;
  }
  return true;
}

function revealCommunity(state: PokerState, count: number): PokerState {
  const revealed = state.deck.slice(0, count);
  return {
    ...state,
    deck: state.deck.slice(count),
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

function evaluateSeven(cards: PokerCard[]): HandRank {
  let best = evaluateFive(cards.slice(0, 5));
  for (const pick of chooseFiveFromSeven(cards)) {
    const rank = evaluateFive(pick);
    if (rankCompare(rank, best) > 0) best = rank;
  }
  return best;
}

function awardPotAtShowdown(state: PokerState): PokerState {
  const contenders = activePlayers(state);
  if (!contenders.length) return state;

  const ranks: Partial<Record<PlayerId, HandRank>> = {};
  let best: HandRank | null = null;
  let winnerIds: PlayerId[] = [];

  for (const player of contenders) {
    const rank = evaluateSeven([...player.hole, ...state.community]);
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

  const winnerNames = winnerIds.map((id) => getPlayer(state, id).name).join(', ');
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

function advancePhase(state: PokerState): PokerState {
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
    next = { ...next, phase: 'showdown' };
  }

  if (next.phase === 'showdown') {
    return awardPotAtShowdown(next);
  }

  const reset = resetRoundBets(next);
  const firstToAct = firstActiveIndexFrom(reset, nextSeat(reset.dealerIndex, reset.players.length));
  const nextState = {
    ...reset,
    turnIndex: firstToAct,
  };
  return addLog(nextState, `Phase: ${next.phase.toUpperCase()}.`);
}

function nextTurnAfterAction(state: PokerState): PokerState {
  const foldWin = activePlayers(state).length <= 1;
  if (foldWin) return awardByFold(state);

  if (isBettingRoundComplete(state)) {
    return advancePhase(state);
  }

  let nextIndex = nextSeat(state.turnIndex, state.players.length);
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[nextIndex];
    if (canPlayerAct(player)) {
      return { ...state, turnIndex: nextIndex };
    }
    nextIndex = nextSeat(nextIndex, state.players.length);
  }
  return state;
}

function withActionLine(state: PokerState, line: string): PokerState {
  return addLog({ ...state, lastAction: line }, line);
}

export function createNewGame(players: PlayerSetup[], handNumber = 1): PokerState {
  const setup = normalizePlayers(players);
  const deck = shuffle(buildDeck());
  const seats: PokerPlayer[] = setup.map((player) => ({
    ...player,
    chips: INITIAL_CHIPS,
    hole: [],
    folded: false,
    bet: 0,
    acted: false,
  }));

  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < seats.length; i++) {
      const card = deck.shift();
      if (!card) throw new Error('Deck exhausted while dealing.');
      seats[i].hole.push(card);
    }
  }

  const dealerIndex = Math.floor(Math.random() * seats.length);
  const sbIndex = nextSeat(dealerIndex, seats.length);
  const bbIndex = nextSeat(sbIndex, seats.length);
  let state: PokerState = {
    players: seats,
    deck,
    community: [],
    phase: 'preflop',
    dealerIndex,
    turnIndex: nextSeat(bbIndex, seats.length),
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

  state = addLog(state, `Hand #${handNumber} started. Dealer: ${seats[dealerIndex].name}.`);
  state = postBlind(state, sbIndex, SMALL_BLIND, 'SB');
  state = postBlind(state, bbIndex, BIG_BLIND, 'BB');
  state = addLog(state, `${state.players[state.turnIndex].name} to act.`);
  return state;
}

export function getCurrentPlayer(state: PokerState): PokerPlayer {
  return state.players[state.turnIndex];
}

export function getPlayerById(state: PokerState, playerId: PlayerId): PokerPlayer {
  return getPlayer(state, playerId);
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
    if (phase === 'showdown') return '쇼다운';
    return '종료';
  }
  return phase;
}

export function legalActions(state: PokerState, playerId: PlayerId): ActionKind[] {
  if (state.phase === 'done' || state.phase === 'showdown') return [];
  if (state.players[state.turnIndex].id !== playerId) return [];

  const player = getPlayer(state, playerId);
  if (player.folded || player.chips <= 0) return [];

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

export function applyAction(state: PokerState, playerId: PlayerId, action: ActionKind): PokerState {
  const legal = legalActions(state, playerId);
  if (!legal.includes(action)) return state;

  const actor = getPlayer(state, playerId);
  let next = state;

  if (action === 'fold') {
    next = updatePlayer(next, playerId, { folded: true, acted: true });
    next = withActionLine(next, `${actor.name} folds.`);
    return nextTurnAfterAction(next);
  }

  if (action === 'check') {
    next = updatePlayer(next, playerId, { acted: true });
    next = withActionLine(next, `${actor.name} checks.`);
    return nextTurnAfterAction(next);
  }

  if (action === 'call') {
    const player = getPlayer(next, playerId);
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
    return nextTurnAfterAction(next);
  }

  if (action === 'raise') {
    const player = getPlayer(next, playerId);
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
    return nextTurnAfterAction(next);
  }

  return state;
}

function actionWeight(action: ActionKind): number {
  if (action === 'raise') return 3;
  if (action === 'call') return 2;
  if (action === 'check') return 1;
  return 0;
}

function preflopStrength(cards: PokerCard[]): number {
  const [a, b] = cards[0].rank >= cards[1].rank ? cards : [cards[1], cards[0]];
  const pair = a.rank === b.rank;
  const suited = a.suit === b.suit;
  const gap = Math.abs(a.rank - b.rank);

  let score = a.rank / 14 + b.rank / 20;
  if (pair) score += 1 + a.rank / 20;
  if (suited) score += 0.15;
  if (gap === 1) score += 0.12;
  if (gap >= 4) score -= 0.1;
  return score;
}

function madeHandStrength(player: PokerPlayer, community: PokerCard[]): number {
  const rank = evaluateSeven([...player.hole, ...community]);
  const cat = rank.category;
  const kicker = (rank.tiebreakers[0] ?? 0) / 14;
  return cat * 2 + kicker;
}

export function chooseProgramAction(state: PokerState, playerId: PlayerId): ActionKind {
  const legal = legalActions(state, playerId);
  if (!legal.length) return 'fold';

  const player = getPlayer(state, playerId);
  const toCall = Math.max(0, state.currentBet - player.bet);
  const potPressure = toCall / Math.max(1, state.pot);
  const postflop = state.community.length >= 3;
  const strength = postflop
    ? madeHandStrength(player, state.community)
    : preflopStrength(player.hole);

  if (legal.includes('raise')) {
    if (!postflop && strength >= 1.9 && Math.random() < 0.75) return 'raise';
    if (postflop && strength >= 5.2 && Math.random() < 0.82) return 'raise';
    if (strength >= 4.0 && potPressure < 0.35 && Math.random() < 0.4) return 'raise';
  }

  if (legal.includes('check')) return 'check';

  if (legal.includes('call')) {
    if (!postflop && strength >= 1.15) return 'call';
    if (postflop && strength >= 2.2) return 'call';
    if (potPressure < 0.16 && Math.random() < 0.75) return 'call';
  }

  const ranked = [...legal].sort((a, b) => actionWeight(b) - actionWeight(a));
  if (ranked.includes('fold')) return 'fold';
  return ranked[0];
}

export function scoreBoard(state: PokerState): Record<PlayerId, number> {
  return {
    left: getPlayer(state, 'left').chips,
    right: getPlayer(state, 'right').chips,
    human: getPlayer(state, 'human').chips,
  };
}

function legalText(actions: ActionKind[]): string {
  return actions.join(', ');
}

function toCallAmount(state: PokerState, player: PokerPlayer): number {
  return Math.max(0, state.currentBet - player.bet);
}

function communityText(cards: PokerCard[]): string {
  return cards.length ? cards.map(cardLabel).join(' ') : '(none)';
}

function handText(cards: PokerCard[]): string {
  return cards.map(cardLabel).join(' ');
}

function phaseDesc(phase: Phase): string {
  if (phase === 'preflop') return 'preflop';
  if (phase === 'flop') return 'flop';
  if (phase === 'turn') return 'turn';
  if (phase === 'river') return 'river';
  if (phase === 'showdown') return 'showdown';
  return 'done';
}

export function buildAgentPrompt(state: PokerState, playerId: PlayerId, locale: string): string {
  const player = getPlayer(state, playerId);
  const actions = legalActions(state, playerId);
  const toCall = toCallAmount(state, player);
  const isKo = locale.startsWith('ko');

  const seatLines = state.players
    .map((p) => `${p.name}: chips=${p.chips}, folded=${p.folded ? 'yes' : 'no'}, bet=${p.bet}`)
    .join('\n');
  const history = state.log.slice(0, 10).reverse().join('\n');

  if (isKo) {
    return `너는 텍사스 홀덤 플레이어 "${player.name}"이다.
한 줄에 행동 키워드 하나만 답해: fold/check/call/raise

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

설명 없이 행동 키워드만 출력해.`;
  }

  return `You are Texas Hold'em player "${player.name}".
Reply with exactly one action token: fold/check/call/raise

Phase: ${phaseDesc(state.phase)}
Community cards: ${communityText(state.community)}
Your hole cards: ${handText(player.hole)}
Pot: ${state.pot}
Current bet: ${state.currentBet}
Amount to call: ${toCall}
Legal actions: ${legalText(actions)}

Seat states:
${seatLines}

Recent log:
${history || '(none)'}

Output only the action token.`;
}

export function parseAgentAction(response: string, legal: ActionKind[]): ActionKind | null {
  if (!response.trim() || !legal.length) return null;
  const lower = response.toLowerCase();

  const priority: ActionKind[] = ['raise', 'call', 'check', 'fold'];
  for (const action of priority) {
    if (!legal.includes(action)) continue;
    const re = new RegExp(`(^|\\W)${action}(?=$|\\W)`, 'i');
    if (re.test(lower)) return action;
  }

  for (const action of legal) {
    if (lower.includes(action)) return action;
  }
  return null;
}
