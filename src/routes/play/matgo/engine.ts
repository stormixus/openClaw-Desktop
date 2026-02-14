export type CardKind = 'bright' | 'animal' | 'ribbon' | 'pi';
export type PlayerRole = 'human' | 'program' | 'agent';
export type PlayerId = 'opponent' | 'human';
export type TurnStep = 'play-hand' | 'choose-match';
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

export interface MatgoState {
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
const HAND_SIZE = 10;
const TABLE_SIZE = 8;

const PLAYER_ORDER: PlayerId[] = ['opponent', 'human'];

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

function addLog(state: MatgoState, text: string): MatgoState {
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
  if (ordered.length !== 2) {
    throw new Error('Matgo must have exactly 2 players: opponent, human');
  }

  if (ordered[1].role !== 'human') {
    throw new Error('Human seat must use role "human".');
  }

  return ordered;
}

function getPlayerIndex(state: MatgoState, playerId: PlayerId): number {
  return state.players.findIndex((player) => player.id === playerId);
}

function getPlayer(state: MatgoState, playerId: PlayerId): PlayerState {
  const found = state.players.find((player) => player.id === playerId);
  if (!found) throw new Error(`Player ${playerId} not found`);
  return found;
}

function updatePlayer(state: MatgoState, playerId: PlayerId, patch: Partial<PlayerState>): MatgoState {
  const idx = getPlayerIndex(state, playerId);
  if (idx < 0) return state;
  const nextPlayers = [...state.players];
  nextPlayers[idx] = { ...nextPlayers[idx], ...patch };
  return { ...state, players: nextPlayers };
}

function withCaptured(state: MatgoState, playerId: PlayerId, cards: HwatuCard[]): MatgoState {
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

function determineWinnerOnDeckEmpty(state: MatgoState): PlayerId | 'draw' {
  const board = scoreState(state);
  const sorted = [...state.players]
    .map((player) => ({ id: player.id, total: board[player.id].total }))
    .sort((a, b) => b.total - a.total);

  if (sorted.length < 2) return 'draw';
  if (sorted[0].total === sorted[1].total) return 'draw';
  return sorted[0].id;
}

function finishTurn(state: MatgoState, actorId: PlayerId, actionText: string): MatgoState {
  const board = scoreState(state);
  const actorScore = board[actorId].total;

  let winnerId: MatgoState['winnerId'] = null;
  if (actorScore >= WIN_SCORE) {
    winnerId = actorId;
  } else if (state.deck.length === 0) {
    winnerId = determineWinnerOnDeckEmpty(state);
  }

  const actorName = getPlayer(state, actorId).name;
  let finalText = actionText;
  if (winnerId === actorId) finalText = `${actionText} ${actorName} reached ${WIN_SCORE} points.`;
  if (winnerId === 'draw') finalText = `${actionText} Deck is empty with tied score.`;

  const nextTurn = winnerId ? state.turnIndex : (state.turnIndex + 1) % state.players.length;

  const nextState: MatgoState = {
    ...state,
    turnIndex: nextTurn,
    step: 'play-hand',
    pendingChoice: null,
    winnerId,
    turnNumber: winnerId ? state.turnNumber : state.turnNumber + 1,
    lastAction: finalText,
  };

  return addLog(nextState, finalText);
}

function drawAndResolve(state: MatgoState, actorId: PlayerId, prefix: string): MatgoState {
  if (!state.deck.length) {
    return finishTurn(state, actorId, `${prefix}. No draw card remained.`);
  }

  const drawCard = state.deck[0];
  const restDeck = state.deck.slice(1);
  const drawResolution = resolveCardAgainstTable(state.table, drawCard);

  if (drawResolution.pendingMatches) {
    const actorName = getPlayer(state, actorId).name;
    const withDrawPending: MatgoState = {
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

  let nextState: MatgoState = {
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

export function createNewGame(players: PlayerSetup[], startTurnIndex?: number): MatgoState {
  const normalized = normalizePlayers(players);
  const shuffled = shuffleCards(createDeck());

  const tableStart = HAND_SIZE * 2;
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
  };
}

export function getCurrentPlayer(state: MatgoState): PlayerState {
  return state.players[state.turnIndex];
}

export function getPlayerById(state: MatgoState, playerId: PlayerId): PlayerState {
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

export function scoreState(state: MatgoState): ScoreBoard {
  const board: ScoreBoard = {
    opponent: newScore(),
    human: newScore(),
  };

  for (const player of state.players) {
    board[player.id] = scoreCaptured(player.captured);
  }

  return board;
}

export function playTurnCard(state: MatgoState, cardId: string): MatgoState {
  if (state.winnerId || state.step !== 'play-hand') return state;

  const actor = getCurrentPlayer(state);
  const card = actor.hand.find((candidate) => candidate.id === cardId);
  if (!card) return state;

  let nextState = updatePlayer(state, actor.id, {
    hand: actor.hand.filter((candidate) => candidate.id !== cardId),
  });

  const handResolution = resolveCardAgainstTable(nextState.table, card);
  if (handResolution.pendingMatches) {
    const pendingState: MatgoState = {
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

export function resolvePendingMatch(state: MatgoState, tableCardId: string): MatgoState {
  const pending = state.pendingChoice;
  if (!pending || state.step !== 'choose-match' || state.winnerId) return state;

  const chosen = pending.matches.find((card) => card.id === tableCardId);
  if (!chosen) return state;

  const actor = getPlayer(state, pending.actorId);
  let nextState: MatgoState = {
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

export function chooseProgramCard(state: MatgoState, actorId: PlayerId): string | null {
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

export function chooseProgramPendingMatch(state: MatgoState, actorId: PlayerId): string | null {
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

function scoreLine(state: MatgoState, locale: string): string {
  const board = scoreState(state);
  return state.players
    .map((player) => {
      const s = board[player.id];
      if (locale.startsWith('ko')) {
        return `${player.name}: ${s.total}점 (광${s.bright}/열끗${s.animal}/띠${s.ribbon}/피${s.pi})`;
      }
      return `${player.name}: ${s.total} pts (Brt ${s.bright}, Ani ${s.animal}, Rib ${s.ribbon}, Pi ${s.pi})`;
    })
    .join('\n');
}

export function buildAgentPrompt(state: MatgoState, actorId: PlayerId, locale: string): string {
  const actor = getPlayer(state, actorId);
  const isKo = locale.startsWith('ko');
  const history = state.log.slice(0, 8).reverse().join('\n');
  const table = tableText(state.table);
  const scores = scoreLine(state, locale);

  if (state.step === 'choose-match' && state.pendingChoice?.actorId === actorId) {
    const options = state.pendingChoice.matches.map((card) => `${card.id} => ${cardAtom(card)}`).join('\n');
    if (isKo) {
      return `너는 맞고 플레이어 ${actor.name}이다.
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

    return `You are Matgo player ${actor.name}.
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
    return `너는 맞고 플레이어 ${actor.name}이다.
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

  return `You are Matgo player ${actor.name}.
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
