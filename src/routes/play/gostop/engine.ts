export type CardKind = 'bright' | 'animal' | 'ribbon' | 'pi';
export type PlayerRole = 'human' | 'program' | 'agent';
export type PlayerId = 'left' | 'right' | 'human';
export type TurnStep = 'play-hand' | 'choose-match' | 'go-or-stop';
export type MatchSource = 'hand' | 'draw';

export interface HwatuCard {
  id: string;
  month: number;
  kind: CardKind;
  label: string;
}

export interface PlayerSetup {
  id: PlayerId;
  role: PlayerRole;
  name: string;
  gatewayId: string | null;
}

export interface PlayerState extends PlayerSetup {
  hand: HwatuCard[];
  captured: HwatuCard[];
}

export interface PendingChoice {
  actorId: PlayerId;
  source: MatchSource;
  card: HwatuCard;
  matches: HwatuCard[];
}

export interface GostopState {
  players: PlayerState[];
  deck: HwatuCard[];
  table: HwatuCard[];
  turnIndex: number;
  step: TurnStep;
  pendingChoice: PendingChoice | null;
  winnerId: PlayerId | 'draw' | null;
  lastAction: string;
  log: string[];
  turnNumber: number;
  goCount: Record<PlayerId, number>;
  goDecisions: number;
}

export interface ScoreSummary {
  bright: number;
  animal: number;
  ribbon: number;
  pi: number;
  brightScore: number;
  animalScore: number;
  ribbonScore: number;
  piScore: number;
  total: number;
}

export type ScoreBoard = Record<PlayerId, ScoreSummary>;

const LOG_LIMIT = 24;
const WIN_SCORE = 7;
const HAND_SIZE = 7;
const TABLE_SIZE = 6;

const PLAYER_ORDER: PlayerId[] = ['left', 'right', 'human'];

const MONTH_FLOWERS_EN = [
  'Pine',
  'Plum',
  'Cherry',
  'Wisteria',
  'Iris',
  'Peony',
  'Bush Clover',
  'Pampas',
  'Chrysanthemum',
  'Maple',
  'Willow',
  'Paulownia',
] as const;

const MONTH_FLOWERS_KO = [
  '송학',
  '매화',
  '벚꽃',
  '등나무',
  '난초',
  '모란',
  '싸리',
  '억새',
  '국화',
  '단풍',
  '오동',
  '비오동',
] as const;

const KIND_WEIGHT: Record<CardKind, number> = {
  bright: 5,
  animal: 3,
  ribbon: 2,
  pi: 1,
};

const KIND_LABEL_EN: Record<CardKind, string> = {
  bright: 'Bright',
  animal: 'Animal',
  ribbon: 'Ribbon',
  pi: 'Pi',
};

const KIND_LABEL_KO: Record<CardKind, string> = {
  bright: '광',
  animal: '열끗',
  ribbon: '띠',
  pi: '피',
};

const MONTH_KINDS: readonly (readonly CardKind[])[] = [
  ['bright', 'ribbon', 'pi', 'pi'],
  ['animal', 'ribbon', 'pi', 'pi'],
  ['bright', 'ribbon', 'pi', 'pi'],
  ['animal', 'ribbon', 'pi', 'pi'],
  ['animal', 'ribbon', 'pi', 'pi'],
  ['animal', 'ribbon', 'pi', 'pi'],
  ['animal', 'ribbon', 'pi', 'pi'],
  ['bright', 'animal', 'pi', 'pi'],
  ['animal', 'ribbon', 'pi', 'pi'],
  ['animal', 'ribbon', 'pi', 'pi'],
  ['bright', 'animal', 'pi', 'pi'],
  ['bright', 'animal', 'pi', 'pi'],
];

interface TableResolution {
  table: HwatuCard[];
  captured: HwatuCard[];
  pendingMatches: HwatuCard[] | null;
  text: string;
}

function shuffleCards(cards: HwatuCard[]): HwatuCard[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function cardSort(a: HwatuCard, b: HwatuCard): number {
  if (a.month !== b.month) return a.month - b.month;
  return KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind];
}

function cardToken(card: HwatuCard): string {
  return `M${card.month}-${card.kind[0].toUpperCase()}`;
}

function cardAtom(card: HwatuCard): string {
  return `${card.id}(${cardToken(card)})`;
}

function removeCards(table: HwatuCard[], cardIds: string[]): HwatuCard[] {
  const idSet = new Set(cardIds);
  return table.filter((card) => !idSet.has(card.id));
}

function addLog(state: GostopState, text: string): GostopState {
  if (!text.trim()) return state;
  return {
    ...state,
    log: [text, ...state.log].slice(0, LOG_LIMIT),
  };
}

function createDeck(): HwatuCard[] {
  const deck: HwatuCard[] = [];
  for (let month = 1; month <= 12; month++) {
    const kinds = MONTH_KINDS[month - 1];
    kinds.forEach((kind, index) => {
      deck.push({
        id: `${month}-${kind}-${index + 1}`,
        month,
        kind,
        label: `${month}-${kind}-${index + 1}`,
      });
    });
  }
  return deck;
}

function normalizePlayers(players: PlayerSetup[]): PlayerSetup[] {
  const byId = new Map<PlayerId, PlayerSetup>();
  for (const player of players) {
    byId.set(player.id, {
      ...player,
      gatewayId: player.gatewayId ?? null,
    });
  }

  const ordered = PLAYER_ORDER.map((id) => byId.get(id)).filter(Boolean) as PlayerSetup[];
  if (ordered.length !== 3) {
    throw new Error('Go-Stop must have exactly 3 players: left, right, human');
  }

  if (ordered[2].role !== 'human') {
    throw new Error('Human seat must use role "human".');
  }

  return ordered;
}

function emptyGoCount(): Record<PlayerId, number> {
  return { left: 0, right: 0, human: 0 };
}

function getPlayerIndex(state: GostopState, playerId: PlayerId): number {
  return state.players.findIndex((player) => player.id === playerId);
}

function getPlayer(state: GostopState, playerId: PlayerId): PlayerState {
  const found = state.players.find((player) => player.id === playerId);
  if (!found) throw new Error(`Player ${playerId} not found`);
  return found;
}

function updatePlayer(state: GostopState, playerId: PlayerId, patch: Partial<PlayerState>): GostopState {
  const idx = getPlayerIndex(state, playerId);
  if (idx < 0) return state;
  const nextPlayers = [...state.players];
  nextPlayers[idx] = { ...nextPlayers[idx], ...patch };
  return { ...state, players: nextPlayers };
}

function withCaptured(state: GostopState, playerId: PlayerId, cards: HwatuCard[]): GostopState {
  if (!cards.length) return state;
  const player = getPlayer(state, playerId);
  return updatePlayer(state, playerId, {
    captured: [...player.captured, ...cards],
  });
}

function resolveCardAgainstTable(table: HwatuCard[], card: HwatuCard): TableResolution {
  const matches = table.filter((c) => c.month === card.month);

  if (matches.length === 0) {
    return {
      table: [...table, card],
      captured: [],
      pendingMatches: null,
      text: `placed ${cardToken(card)} on the table`,
    };
  }

  if (matches.length === 1) {
    return {
      table: removeCards(table, [matches[0].id]),
      captured: [card, matches[0]],
      pendingMatches: null,
      text: `captured ${cardToken(card)} with ${cardToken(matches[0])}`,
    };
  }

  if (matches.length === 2) {
    return {
      table: [...table],
      captured: [],
      pendingMatches: matches,
      text: `must choose one of two month-${card.month} matches`,
    };
  }

  return {
    table: removeCards(table, matches.map((c) => c.id)),
    captured: [card, ...matches],
    pendingMatches: null,
    text: `swept month ${card.month} and captured four cards`,
  };
}

function newScore(): ScoreSummary {
  return {
    bright: 0,
    animal: 0,
    ribbon: 0,
    pi: 0,
    brightScore: 0,
    animalScore: 0,
    ribbonScore: 0,
    piScore: 0,
    total: 0,
  };
}

function determineWinnerOnDeckEmpty(state: GostopState): PlayerId | 'draw' {
  const board = scoreState(state);
  const sorted = [...state.players]
    .map((player) => ({ id: player.id, total: board[player.id].total }))
    .sort((a, b) => b.total - a.total);

  if (sorted.length < 2) return 'draw';
  if (sorted[0].total === sorted[1].total) return 'draw';
  return sorted[0].id;
}

/**
 * Determines the effective win threshold for a player.
 * Each time a player says "Go", they need at least 1 more point
 * above the base WIN_SCORE to trigger go-or-stop again.
 */
function goThreshold(state: GostopState, playerId: PlayerId): number {
  return WIN_SCORE + state.goCount[playerId];
}

function finishTurn(state: GostopState, actorId: PlayerId, actionText: string): GostopState {
  const board = scoreState(state);
  const actorScore = board[actorId].total;
  const threshold = goThreshold(state, actorId);

  let winnerId: GostopState['winnerId'] = null;
  let step: TurnStep = 'play-hand';

  if (actorScore >= threshold) {
    // Player reached threshold -- enter go-or-stop decision
    step = 'go-or-stop';
  } else if (state.deck.length === 0) {
    winnerId = determineWinnerOnDeckEmpty(state);
  }

  const actorName = getPlayer(state, actorId).name;
  let finalText = actionText;
  if (step === 'go-or-stop') {
    finalText = `${actionText} ${actorName} reached ${threshold} points -- Go or Stop?`;
  }
  if (winnerId === 'draw') finalText = `${actionText} Deck is empty with tied score.`;

  const nextTurn = (winnerId || step === 'go-or-stop') ? state.turnIndex : (state.turnIndex + 1) % state.players.length;

  const nextState: GostopState = {
    ...state,
    turnIndex: nextTurn,
    step,
    pendingChoice: null,
    winnerId,
    turnNumber: (winnerId || step === 'go-or-stop') ? state.turnNumber : state.turnNumber + 1,
    lastAction: finalText,
  };

  return addLog(nextState, finalText);
}

/**
 * Resolve the Go/Stop choice for the current actor.
 * - 'stop': the actor wins immediately.
 * - 'go': increment goCount, raise threshold, continue playing.
 */
export function resolveGoStop(state: GostopState, choice: 'go' | 'stop'): GostopState {
  if (state.step !== 'go-or-stop' || state.winnerId) return state;

  const actor = getCurrentPlayer(state);

  if (choice === 'stop') {
    const text = `${actor.name} chose Stop and wins!`;
    const nextState: GostopState = {
      ...state,
      winnerId: actor.id,
      step: 'play-hand',
      lastAction: text,
      goDecisions: state.goDecisions + 1,
    };
    return addLog(nextState, text);
  }

  // choice === 'go'
  const newGoCount = { ...state.goCount, [actor.id]: state.goCount[actor.id] + 1 };
  const goNum = newGoCount[actor.id];
  const text = `${actor.name} chose Go! (Go x${goNum})`;
  const nextTurn = (state.turnIndex + 1) % state.players.length;

  const nextState: GostopState = {
    ...state,
    goCount: newGoCount,
    goDecisions: state.goDecisions + 1,
    step: 'play-hand',
    turnIndex: nextTurn,
    turnNumber: state.turnNumber + 1,
    lastAction: text,
  };
  return addLog(nextState, text);
}

/**
 * Program AI for the go-or-stop decision.
 * - Always "go" if score < 12
 * - Otherwise 50/50 random
 */
export function chooseProgramGoStop(state: GostopState, actorId: PlayerId): 'go' | 'stop' {
  const board = scoreState(state);
  const score = board[actorId].total;
  if (score < 12) return 'go';
  return Math.random() < 0.5 ? 'go' : 'stop';
}

function drawAndResolve(state: GostopState, actorId: PlayerId, prefix: string): GostopState {
  if (!state.deck.length) {
    return finishTurn(state, actorId, `${prefix}. No draw card remained.`);
  }

  const drawCard = state.deck[0];
  const restDeck = state.deck.slice(1);
  const drawResolution = resolveCardAgainstTable(state.table, drawCard);

  if (drawResolution.pendingMatches) {
    const actorName = getPlayer(state, actorId).name;
    const withDrawPending: GostopState = {
      ...state,
      deck: restDeck,
      table: drawResolution.table,
      step: 'choose-match',
      pendingChoice: {
        actorId,
        source: 'draw',
        card: drawCard,
        matches: drawResolution.pendingMatches,
      },
      lastAction: `${prefix}. ${actorName} drew ${cardToken(drawCard)} and must choose a match.`,
    };
    return addLog(withDrawPending, withDrawPending.lastAction);
  }

  let nextState: GostopState = {
    ...state,
    deck: restDeck,
    table: drawResolution.table,
  };
  nextState = withCaptured(nextState, actorId, drawResolution.captured);

  const actorName = getPlayer(nextState, actorId).name;
  return finishTurn(
    nextState,
    actorId,
    `${prefix}. ${actorName} drew ${cardToken(drawCard)} and ${drawResolution.text}`,
  );
}

export function createNewGame(players: PlayerSetup[], startTurnIndex?: number): GostopState {
  const normalized = normalizePlayers(players);
  const shuffled = shuffleCards(createDeck());

  const tableStart = HAND_SIZE * 3;
  const tableEnd = tableStart + TABLE_SIZE;
  const table = shuffled.slice(tableStart, tableEnd).sort(cardSort);
  const deck = shuffled.slice(tableEnd);

  const states: PlayerState[] = normalized.map((setup, idx) => {
    const handStart = idx * HAND_SIZE;
    const handEnd = handStart + HAND_SIZE;
    return {
      ...setup,
      hand: shuffled.slice(handStart, handEnd).sort(cardSort),
      captured: [],
    };
  });

  const initialTurn =
    typeof startTurnIndex === 'number'
      ? Math.max(0, Math.min(states.length - 1, startTurnIndex))
      : Math.floor(Math.random() * states.length);

  const opener = states[initialTurn];
  return {
    players: states,
    deck,
    table,
    turnIndex: initialTurn,
    step: 'play-hand',
    pendingChoice: null,
    winnerId: null,
    lastAction: `Game started. ${opener.name} opens.`,
    log: [`Game started. ${opener.name} opens.`],
    turnNumber: 1,
    goCount: emptyGoCount(),
    goDecisions: 0,
  };
}

export function getCurrentPlayer(state: GostopState): PlayerState {
  return state.players[state.turnIndex];
}

export function getPlayerById(state: GostopState, playerId: PlayerId): PlayerState {
  return getPlayer(state, playerId);
}

export function sortCards(cards: HwatuCard[]): HwatuCard[] {
  return [...cards].sort(cardSort);
}

export function kindLabel(kind: CardKind, locale: string): string {
  if (locale.startsWith('ko')) return KIND_LABEL_KO[kind];
  return KIND_LABEL_EN[kind];
}

export function monthFlower(month: number, locale: string): string {
  const index = month - 1;
  if (locale.startsWith('ko')) return MONTH_FLOWERS_KO[index] ?? `${month}월`;
  return MONTH_FLOWERS_EN[index] ?? `Month ${month}`;
}

export function formatCard(card: HwatuCard, locale: string): string {
  if (locale.startsWith('ko')) {
    return `${card.month}월 ${monthFlower(card.month, locale)} ${kindLabel(card.kind, locale)}`;
  }
  return `${monthFlower(card.month, locale)} (${card.month}) ${kindLabel(card.kind, locale)}`;
}

export function scoreCaptured(cards: HwatuCard[]): ScoreSummary {
  const bright = cards.filter((card) => card.kind === 'bright').length;
  const animal = cards.filter((card) => card.kind === 'animal').length;
  const ribbon = cards.filter((card) => card.kind === 'ribbon').length;
  const pi = cards.filter((card) => card.kind === 'pi').length;

  const brightScore = bright >= 5 ? 15 : bright >= 3 ? bright : 0;
  const animalScore = animal >= 5 ? animal - 4 : 0;
  const ribbonScore = ribbon >= 5 ? ribbon - 4 : 0;
  const piScore = pi >= 10 ? pi - 9 : 0;
  const total = brightScore + animalScore + ribbonScore + piScore;

  return {
    bright,
    animal,
    ribbon,
    pi,
    brightScore,
    animalScore,
    ribbonScore,
    piScore,
    total,
  };
}

export function scoreState(state: GostopState): ScoreBoard {
  const board: ScoreBoard = {
    left: newScore(),
    right: newScore(),
    human: newScore(),
  };

  for (const player of state.players) {
    board[player.id] = scoreCaptured(player.captured);
  }

  return board;
}

export function playTurnCard(state: GostopState, cardId: string): GostopState {
  if (state.winnerId || state.step !== 'play-hand') return state;

  const actor = getCurrentPlayer(state);
  const card = actor.hand.find((candidate) => candidate.id === cardId);
  if (!card) return state;

  let nextState = updatePlayer(state, actor.id, {
    hand: actor.hand.filter((candidate) => candidate.id !== cardId),
  });

  const handResolution = resolveCardAgainstTable(nextState.table, card);
  if (handResolution.pendingMatches) {
    const pendingState: GostopState = {
      ...nextState,
      table: handResolution.table,
      step: 'choose-match',
      pendingChoice: {
        actorId: actor.id,
        source: 'hand',
        card,
        matches: handResolution.pendingMatches,
      },
      lastAction: `${actor.name} played ${cardToken(card)} and must choose one of two table matches.`,
    };
    return addLog(pendingState, pendingState.lastAction);
  }

  nextState = {
    ...nextState,
    table: handResolution.table,
  };
  nextState = withCaptured(nextState, actor.id, handResolution.captured);
  return drawAndResolve(nextState, actor.id, `${actor.name} played ${cardToken(card)} and ${handResolution.text}`);
}

export function resolvePendingMatch(state: GostopState, tableCardId: string): GostopState {
  const pending = state.pendingChoice;
  if (!pending || state.step !== 'choose-match' || state.winnerId) return state;

  const chosen = pending.matches.find((card) => card.id === tableCardId);
  if (!chosen) return state;

  const actor = getPlayer(state, pending.actorId);
  let nextState: GostopState = {
    ...state,
    table: removeCards(state.table, [chosen.id]),
    step: 'play-hand',
    pendingChoice: null,
  };
  nextState = withCaptured(nextState, pending.actorId, [pending.card, chosen]);

  const prefix = `${actor.name} chose ${cardToken(chosen)} to pair with ${cardToken(pending.card)}`;
  if (pending.source === 'hand') {
    return drawAndResolve(nextState, pending.actorId, prefix);
  }

  return finishTurn(nextState, pending.actorId, `${prefix}. Draw phase resolved.`);
}

function cardImmediateValue(card: HwatuCard, matchCount: number, table: HwatuCard[]): number {
  if (matchCount === 0) {
    return -KIND_WEIGHT[card.kind] * 0.65;
  }

  if (matchCount === 1) {
    const matched = table.find((c) => c.month === card.month);
    return 3.2 + KIND_WEIGHT[card.kind] + (matched ? KIND_WEIGHT[matched.kind] : 0);
  }

  if (matchCount === 2) {
    const monthCards = table.filter((c) => c.month === card.month);
    const best = Math.max(...monthCards.map((c) => KIND_WEIGHT[c.kind]));
    return 4.8 + KIND_WEIGHT[card.kind] + best;
  }

  const monthCards = table.filter((c) => c.month === card.month);
  const sum = monthCards.reduce((acc, current) => acc + KIND_WEIGHT[current.kind], 0);
  return 8.5 + KIND_WEIGHT[card.kind] + sum;
}

export function chooseProgramCard(state: GostopState, actorId: PlayerId): string | null {
  if (state.step !== 'play-hand' || state.winnerId) return null;

  const actor = getPlayer(state, actorId);
  if (!actor.hand.length) return null;

  let best = actor.hand[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const card of actor.hand) {
    const matchCount = state.table.filter((c) => c.month === card.month).length;
    const duplicates = actor.hand.filter((h) => h.month === card.month).length - 1;
    const score =
      cardImmediateValue(card, matchCount, state.table) +
      duplicates * 0.3 +
      Math.random() * 0.07;

    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  }

  return best.id;
}

export function chooseProgramPendingMatch(state: GostopState, actorId: PlayerId): string | null {
  const pending = state.pendingChoice;
  if (!pending || state.step !== 'choose-match' || pending.actorId !== actorId) return null;
  if (!pending.matches.length) return null;

  let best = pending.matches[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const card of pending.matches) {
    const score = KIND_WEIGHT[card.kind] + Math.random() * 0.05;
    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  }
  return best.id;
}

function tableText(table: HwatuCard[]): string {
  if (!table.length) return '(empty)';
  return table.map((card) => cardAtom(card)).join(', ');
}

function scoreLine(state: GostopState, locale: string): string {
  const board = scoreState(state);
  return state.players
    .map((player) => {
      const s = board[player.id];
      const go = state.goCount[player.id];
      const goTag = go > 0 ? ` [Go x${go}]` : '';
      if (locale.startsWith('ko')) {
        return `${player.name}: ${s.total}점 (광${s.bright}/열끗${s.animal}/띠${s.ribbon}/피${s.pi})${goTag}`;
      }
      return `${player.name}: ${s.total} pts (Brt ${s.bright}, Ani ${s.animal}, Rib ${s.ribbon}, Pi ${s.pi})${goTag}`;
    })
    .join('\n');
}

export function buildAgentPrompt(state: GostopState, actorId: PlayerId, locale: string): string {
  const actor = getPlayer(state, actorId);
  const isKo = locale.startsWith('ko');
  const history = state.log.slice(0, 8).reverse().join('\n');
  const table = tableText(state.table);
  const scores = scoreLine(state, locale);

  if (state.step === 'go-or-stop') {
    const board = scoreState(state);
    const myScore = board[actorId].total;
    const myGo = state.goCount[actorId];
    if (isKo) {
      return `너는 고스톱 플레이어 ${actor.name}이다.
지금은 고/스톱 선택 단계다.
현재 점수: ${myScore}점, 고 횟수: ${myGo}
스톱하면 승리, 고하면 계속 플레이하지만 다른 플레이어가 따라잡으면 고 횟수만큼 배로 불리해진다.

점수:
${scores}
최근 로그:
${history || '(없음)'}

"go" 또는 "stop" 한 단어만 답해.`;
    }

    return `You are Go-Stop player ${actor.name}.
This is the Go-or-Stop decision step.
Your score: ${myScore} pts, Go count: ${myGo}
If you Stop, you win now. If you Go, play continues but if another player catches up, your Go count multiplies the penalty.

Scores:
${scores}
Recent log:
${history || '(none)'}

Reply with exactly "go" or "stop" and nothing else.`;
  }

  if (state.step === 'choose-match' && state.pendingChoice?.actorId === actorId) {
    const options = state.pendingChoice.matches.map((card) => `${card.id} => ${cardAtom(card)}`).join('\n');
    if (isKo) {
      return `너는 고스톱 플레이어 ${actor.name}이다.
지금은 매칭 선택 단계다.
기준 카드: ${cardAtom(state.pendingChoice.card)}
선택 가능 카드:
${options}

테이블 카드: ${table}
점수:
${scores}
최근 로그:
${history || '(없음)'}

한 줄로 CARD_ID 하나만 답해. 설명 금지.`;
    }

    return `You are Go-Stop player ${actor.name}.
This is match-selection step.
Base card: ${cardAtom(state.pendingChoice.card)}
Available table cards:
${options}

Table cards: ${table}
Scores:
${scores}
Recent log:
${history || '(none)'}

Reply with exactly one CARD_ID and nothing else.`;
  }

  const handOptions = actor.hand.map((card) => `${card.id} => ${cardAtom(card)}`).join('\n');
  if (isKo) {
    return `너는 고스톱 플레이어 ${actor.name}이다.
지금은 손패에서 한 장을 내는 단계다.
손패 후보:
${handOptions}

테이블 카드: ${table}
점수:
${scores}
최근 로그:
${history || '(없음)'}

전략적으로 유리한 카드 ID를 하나 고르고 CARD_ID 한 줄만 답해.`;
  }

  return `You are Go-Stop player ${actor.name}.
This is hand-play step.
Hand options:
${handOptions}

Table cards: ${table}
Scores:
${scores}
Recent log:
${history || '(none)'}

Choose exactly one best CARD_ID and reply with only that CARD_ID.`;
}

export function parseAgentChoice(response: string, options: string[]): string | null {
  if (!response.trim()) return null;
  if (!options.length) return null;

  const cleaned = response.trim();
  const byLength = [...options].sort((a, b) => b.length - a.length);
  for (const option of byLength) {
    const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|\\W)${escaped}(?=$|\\W)`, 'i');
    if (re.test(cleaned)) return option;
  }

  const compact = cleaned.toLowerCase();
  for (const option of byLength) {
    if (compact.includes(option.toLowerCase())) return option;
  }

  return null;
}

/**
 * Parse an agent's go/stop response.
 */
export function parseAgentGoStop(response: string): 'go' | 'stop' | null {
  const cleaned = response.trim().toLowerCase();
  if (cleaned === 'go') return 'go';
  if (cleaned === 'stop') return 'stop';
  if (cleaned.includes('stop')) return 'stop';
  if (cleaned.includes('go')) return 'go';
  return null;
}
