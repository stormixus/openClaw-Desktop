<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { locale } from '$lib/i18n';
  import { store, getClientById } from '$lib/gateway/store.svelte';
  import { kt } from './i18n';
  import { Zap } from '@lucide/svelte';
  import TokenBarChart from '$lib/components/TokenBarChart.svelte';
  import {
    analyzePlayerHand,
    applyAction,
    buildAgentPrompt,
    calculatePlayerOdds,
    cardLabel,
    chooseProgramAction,
    createNewGame,
    getCurrentPlayer,
    getPlayerById,
    legalActions,
    parseAgentAction,
    phaseLabel,
    scoreBoard,
    variantLabel,
    MAX_PLAYERS,
    MIN_PLAYERS,
    type ActionDecision,
    type ActionKind,
    type PlayerRole,
    type PlayerSetup,
    type PokerCard,
    type PokerOddsSummary,
    type PokerPlayer,
    type PokerState,
    type PokerVariant,
  } from './engine';
  import { clearPokerState, loadPokerState, savePokerState } from './state';
  import { playPokerActionVoice, playPokerDealCard, playPokerWinJingle } from './sounds';
  import { cardBackUri, cardImageUri } from './cardArt';

  interface SeatConfig {
    id: string;
    role: 'program' | 'agent';
    gatewayId: string | null;
  }

  interface TableRuntime {
    dispose: () => void;
  }

  interface DealAnimCard {
    id: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    fromDeg: number;
    toDeg: number;
    imgSrc: string;
    delayMs: number;
    durationMs: number;
    active: boolean;
  }

  interface WinnerPopupState {
    handNumber: number;
    winners: string[];
    handLabel: string | null;
    pot: number | null;
    split: boolean;
  }

  const DEAL_ORIGIN = { x: 46.6, y: 54.2 };
  const PROGRAM_NAME_POOL_EN = [
    'Nova Jack',
    'River Quinn',
    'Axel Vale',
    'Mika Lane',
    'Blaze Orion',
    'Nash Cole',
    'Luca Storm',
    'Ivy Knight',
    'Theo Rush',
    'Rin Parker',
    'Kai Sterling',
    'Juno Drake',
  ] as const;
  const PROGRAM_NAME_POOL_KO = [
    '라임',
    '도윤',
    '하린',
    '서준',
    '유진',
    '지안',
    '민서',
    '태오',
    '아린',
    '윤호',
    '채원',
    '시온',
  ] as const;

  const HAND_LABEL_KEY: Record<string, string> = {
    'High Card': 'hand_high_card',
    'One Pair': 'hand_one_pair',
    'Two Pair': 'hand_two_pair',
    'Three of a Kind': 'hand_three_kind',
    Straight: 'hand_straight',
    Flush: 'hand_flush',
    'Full House': 'hand_full_house',
    'Four of a Kind': 'hand_four_kind',
    'Straight Flush': 'hand_straight_flush',
  };

  function isValidPokerState(value: unknown): value is PokerState {
    const v = value as Partial<PokerState> | null;
    return Boolean(
      v &&
      Array.isArray(v.players) &&
      Array.isArray(v.deck) &&
      Array.isArray(v.community) &&
      typeof v.turnIndex === 'number' &&
      typeof v.handNumber === 'number' &&
      (v.variant === 'texas' || v.variant === 'classic'),
    );
  }

  function emptySpeechMap(): Record<string, string> {
    return {};
  }

  function seatNumberFromId(id: string): number {
    const value = Number.parseInt(id.split('-')[1] ?? '0', 10);
    return Number.isFinite(value) ? value : 0;
  }

  function buildSeatConfigs(
    count: number,
    previous: SeatConfig[],
    gatewayIds: string[],
  ): SeatConfig[] {
    const next: SeatConfig[] = [];
    for (let seatNo = 1; seatNo <= count; seatNo++) {
      const id = `seat-${seatNo}`;
      const found = previous.find((seat) => seat.id === id);
      const role = found?.role ?? 'program';
      const fallbackGateway = gatewayIds[0] ?? null;
      const gatewayId = role === 'agent'
        ? found?.gatewayId && gatewayIds.includes(found.gatewayId)
          ? found.gatewayId
          : fallbackGateway
        : null;

      next.push({
        id,
        role: role === 'agent' && gatewayIds.length === 0 ? 'program' : role,
        gatewayId,
      });
    }
    return next;
  }

  function sameSeatConfigs(a: SeatConfig[], b: SeatConfig[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id) return false;
      if (a[i].role !== b[i].role) return false;
      if (a[i].gatewayId !== b[i].gatewayId) return false;
    }
    return true;
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function roleLabel(role: PlayerRole): string {
    if (role === 'human') return $kt('role_human');
    if (role === 'agent') return $kt('role_agent');
    return $kt('role_program');
  }

  function gatewayName(gatewayId: string | null): string {
    if (!gatewayId) return $kt('gateway_auto');
    return store.gateways.find((gateway) => gateway.id === gatewayId)?.name ?? gatewayId.slice(0, 8);
  }

  function randomProgramName(localeCode: string, used: Set<string>): string {
    const pool = localeCode.startsWith('ko') ? PROGRAM_NAME_POOL_KO : PROGRAM_NAME_POOL_EN;
    const attempts = [...pool];
    while (attempts.length > 0) {
      const idx = Math.floor(Math.random() * attempts.length);
      const [picked] = attempts.splice(idx, 1);
      if (!used.has(picked)) return picked;
    }

    let suffix = 1;
    let fallback = localeCode.startsWith('ko') ? `프로그램 ${suffix}` : `Program ${suffix}`;
    while (used.has(fallback)) {
      suffix += 1;
      fallback = localeCode.startsWith('ko') ? `프로그램 ${suffix}` : `Program ${suffix}`;
    }
    return fallback;
  }

  function seatName(seatId: string, role: PlayerRole, gatewayId: string | null): string {
    const seatNo = seatNumberFromId(seatId);
    const base = `${$kt('seat_label')} ${seatNo}`;
    if (role === 'agent') return `${base} · ${$kt('role_agent')} · ${gatewayName(gatewayId)}`;
    if (role === 'program') return `${base} · ${$kt('role_program')}`;
    return $kt('seat_you');
  }

  function buildPlayersFromSetup(
    seatConfigs: SeatConfig[],
    humanSeatNumber: number,
  ): PlayerSetup[] {
    const players: PlayerSetup[] = [];
    const usedNames = new Set<string>([$kt('seat_you')]);
    for (const seat of seatConfigs) {
      const seatNo = seatNumberFromId(seat.id);
      const role: PlayerRole = seatNo === humanSeatNumber ? 'human' : seat.role;
      const name = role === 'program'
        ? randomProgramName($locale, usedNames)
        : seatName(seat.id, role, seat.gatewayId);
      usedNames.add(name);
      players.push({
        id: seat.id,
        role,
        name,
        gatewayId: role === 'agent' ? seat.gatewayId : null,
      });
    }

    return players;
  }

  function isHumanSeatId(seatId: string): boolean {
    return seatNumberFromId(seatId) === humanSeatNumber;
  }

  function hiddenCardCount(player: PokerPlayer): number {
    return Math.max(1, player.hole.length);
  }

  function seatCoords(index: number, total: number): { x: number; y: number } {
    const angle = ((90 + (360 / total) * index) * Math.PI) / 180;
    const x = 50 + Math.cos(angle) * 42;
    const y = 50 + Math.sin(angle) * 32;
    return { x, y };
  }

  function seatPosition(index: number, total: number): string {
    const { x, y } = seatCoords(index, total);
    return `left: ${x}%; top: ${y}%;`;
  }

  function seatCardTarget(
    index: number,
    total: number,
    cardIndex: number,
    holeCount: number,
  ): { x: number; y: number } {
    const { x, y } = seatCoords(index, total);
    const spread = (cardIndex - (holeCount - 1) / 2) * 3.2;
    const yOffset = y < 50 ? 7.5 : -7.5;
    return { x: x + spread, y: y + yOffset };
  }

  function communityCardTarget(index: number): { x: number; y: number } {
    const x = 50 + (index - 2) * 6.2;
    return { x, y: 50 };
  }

  function handKey(state: PokerState): string {
    return `${state.variant}-${state.handNumber}`;
  }

  function dealCardStyle(card: DealAnimCard): string {
    return [
      `--deal-from-x:${card.fromX}`,
      `--deal-from-y:${card.fromY}`,
      `--deal-to-x:${card.toX}`,
      `--deal-to-y:${card.toY}`,
      `--deal-from-deg:${card.fromDeg}`,
      `--deal-to-deg:${card.toDeg}`,
      `--deal-delay:${card.delayMs}ms`,
      `--deal-duration:${card.durationMs}ms`,
    ].join(';');
  }

  function isRedSuit(card: PokerCard): boolean {
    return card.suit === 'H' || card.suit === 'D';
  }

  function localizedHandLabel(label: string, category: number | null = null): string {
    if (category === null && label === 'No made hand') return $kt('odds_preflop');
    const key = HAND_LABEL_KEY[label];
    return key ? $kt(key) : label;
  }

  function parsePotFromAction(line: string): number | null {
    const match = line.match(/pot\s+(\d+)/i);
    if (!match) return null;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? value : null;
  }

  function winnerHandLabel(state: PokerState): string | null {
    if (!state.winnerIds.length) return null;
    const labels = new Set<string>();
    for (const winnerId of state.winnerIds) {
      const rank = state.showdownRanks[winnerId];
      if (!rank) continue;
      labels.add(localizedHandLabel(rank.label, rank.category));
    }
    if (!labels.size) return null;
    return [...labels].join(' / ');
  }

  function winnerNames(state: PokerState): string[] {
    return state.winnerIds.map((winnerId) => {
      const found = state.players.find((player) => player.id === winnerId);
      return found?.name ?? winnerId;
    });
  }

  function avatarInitial(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    const first = [...trimmed][0];
    return first ? first.toUpperCase() : '?';
  }

  function hashStr(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function seatAvatarStyle(player: PokerPlayer): string {
    const base = hashStr(`${player.id}-${player.name}`);
    const h = base % 360;
    const h2 = (h + 46) % 360;
    return `--avatar-h:${h};--avatar-h2:${h2};`;
  }

  const restored = loadPokerState();
  let game = $state<PokerState | null>(isValidPokerState(restored) ? restored : null);
  let selectedVariant = $state<PokerVariant>(game?.variant ?? 'texas');
  let playerCount = $state<number>(game?.players.length ?? 4);
  let humanSeatNumber = $state<number>(1);
  let seatConfigs = $state<SeatConfig[]>([]);
  let thinkingPlayerId = $state<string | null>(null);
  let speechMap = $state<Record<string, string>>(emptySpeechMap());
  let selectedDiscardIndices = $state<number[]>([]);
  const cardBackImage = cardBackUri();
  let dealAnimCards = $state<DealAnimCard[]>([]);
  let isInitialDealAnimating = $state(false);
  let visibleCommunityCount = $state<number>(game?.community.length ?? 0);
  let winnerPopup = $state<WinnerPopupState | null>(null);
  let tokensUsed = $state(0);
  let tokenHistory = $state<number[]>([]);

  let aiLoopRunning = false;
  let dealAnimationToken = 0;
  let announcedResultKey = '';
  let dealSoundTimers: number[] = [];
  let hasTrackedGame = Boolean(game);
  let trackedHandKey: string | null = game ? handKey(game) : null;
  let trackedCommunityCount = game?.community.length ?? 0;

  const connectedGateways = $derived(
    store.gateways.filter((gateway) => store.gatewayStates.get(gateway.id)?.status === 'connected'),
  );
  const connectedGatewayIds = $derived(connectedGateways.map((gateway) => gateway.id));
  const canUseAgent = $derived(connectedGatewayIds.length > 0);
  const setupSeatNumbers = $derived(Array.from({ length: playerCount }, (_, idx) => idx + 1));

  if (game) {
    const humanSeat = game.players.find((player) => player.role === 'human');
    humanSeatNumber = Math.max(1, Math.min(game.players.length, seatNumberFromId(humanSeat?.id ?? 'seat-1')));
    const freshSeats: SeatConfig[] = game.players
      .map((player) => ({
        id: player.id,
        role: player.role === 'agent' ? 'agent' : 'program',
        gatewayId: player.role === 'agent' ? player.gatewayId : null,
      }));
    seatConfigs = buildSeatConfigs(game.players.length, freshSeats, connectedGatewayIds);
  } else {
    seatConfigs = buildSeatConfigs(playerCount, [], connectedGatewayIds);
  }

  const currentPlayer = $derived(game ? getCurrentPlayer(game) : null);
  const humanPlayer = $derived(game ? game.players.find((player) => player.role === 'human') ?? null : null);
  const humanActions = $derived(
    game && humanPlayer && currentPlayer?.id === humanPlayer.id ? legalActions(game, humanPlayer.id) : [],
  );
  const chipBoard = $derived(game ? scoreBoard(game) : {});
  const isDrawTurn = $derived(
    Boolean(
      game &&
      game.variant === 'classic' &&
      game.phase === 'draw' &&
      humanPlayer &&
      currentPlayer?.id === humanPlayer.id,
    ),
  );
  const oddsSummary = $derived.by((): PokerOddsSummary | null => {
    if (!game || !humanPlayer) return null;
    return calculatePlayerOdds(game, humanPlayer.id, {
      discardIndices: isDrawTurn ? selectedDiscardIndices : undefined,
    });
  });
  const madeHandPreview = $derived.by(() => {
    if (!game || !humanPlayer) return null;
    const preview = analyzePlayerHand(game, humanPlayer.id);
    if (!preview) return null;
    if (preview.rank.category <= 0) return null;
    return preview;
  });
  const statusText = $derived.by(() => {
    if (!game) return $kt('status_waiting_setup');
    if (game.phase === 'done') return $kt('status_done');
    if (thinkingPlayerId) {
      const thinker = getPlayerById(game, thinkingPlayerId).name;
      return `${thinker} ${$kt('status_thinking')}`;
    }
    if (!currentPlayer) return '';
    if (currentPlayer.role === 'human') return $kt('status_your_turn');
    return `${currentPlayer.name} ${$kt('status_turn')}`;
  });

  function seedSpeechMap(current: PokerState): void {
    const next: Record<string, string> = {};
    for (const player of current.players) {
      if (player.role === 'agent') next[player.id] = $kt('speech_agent');
      else if (player.role === 'program') next[player.id] = $kt('speech_program');
      else next[player.id] = '';
    }
    speechMap = next;
  }

  function onPlayerCountInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    const nextCount = Number.parseInt(target.value, 10);
    if (!Number.isFinite(nextCount)) return;
    playerCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, nextCount));
    humanSeatNumber = Math.min(humanSeatNumber, playerCount);
    seatConfigs = buildSeatConfigs(playerCount, seatConfigs, connectedGatewayIds);
  }

  function onHumanSeatInput(event: Event): void {
    const target = event.currentTarget as HTMLSelectElement;
    const nextSeat = Number.parseInt(target.value, 10);
    if (!Number.isFinite(nextSeat)) return;
    humanSeatNumber = Math.max(1, Math.min(playerCount, nextSeat));
  }

  function setSeatRole(seatId: string, role: 'program' | 'agent'): void {
    if (isHumanSeatId(seatId)) return;
    if (role === 'agent' && connectedGatewayIds.length === 0) return;
    seatConfigs = seatConfigs.map((seat) => {
      if (seat.id !== seatId) return seat;
      if (role === 'agent') {
        return {
          ...seat,
          role,
          gatewayId: seat.gatewayId && connectedGatewayIds.includes(seat.gatewayId)
            ? seat.gatewayId
            : connectedGatewayIds[0] ?? null,
        };
      }
      return {
        ...seat,
        role: 'program',
        gatewayId: null,
      };
    });
  }

  function setSeatGateway(seatId: string, event: Event): void {
    if (isHumanSeatId(seatId)) return;
    const target = event.currentTarget as HTMLSelectElement;
    const gatewayId = target.value || null;
    seatConfigs = seatConfigs.map((seat) =>
      seat.id === seatId
        ? {
            ...seat,
            gatewayId,
          }
        : seat,
    );
  }

  function startGame(): void {
    const players = buildPlayersFromSetup(seatConfigs, humanSeatNumber);
    game = createNewGame(players, selectedVariant, 1);
    thinkingPlayerId = null;
    winnerPopup = null;
    announcedResultKey = '';
    selectedDiscardIndices = [];
    tokensUsed = 0;
    tokenHistory = [];
    seedSpeechMap(game);
    clearPokerState();
  }

  function newHand(): void {
    if (!game) return;
    const players: PlayerSetup[] = game.players.map((player) => ({
      id: player.id,
      role: player.role,
      name: player.name,
      gatewayId: player.gatewayId,
    }));

    game = createNewGame(players, game.variant, game.handNumber + 1);
    thinkingPlayerId = null;
    winnerPopup = null;
    selectedDiscardIndices = [];
    tokensUsed = 0;
    tokenHistory = [];
    seedSpeechMap(game);
  }

  function backToSetup(): void {
    if (game) {
      playerCount = game.players.length;
      humanSeatNumber = seatNumberFromId(
        game.players.find((player) => player.role === 'human')?.id ?? 'seat-1',
      );
      seatConfigs = buildSeatConfigs(playerCount, seatConfigs, connectedGatewayIds);
      selectedVariant = game.variant;
    }
    game = null;
    thinkingPlayerId = null;
    winnerPopup = null;
    announcedResultKey = '';
    selectedDiscardIndices = [];
    speechMap = emptySpeechMap();
    clearPokerState();
  }

  function canRevealCards(player: PokerPlayer): boolean {
    if (!game) return false;
    if (player.role === 'human') return true;
    return game.phase === 'done';
  }

  function canHumanAct(action: ActionKind): boolean {
    return Boolean(
      game &&
      humanPlayer &&
      currentPlayer?.id === humanPlayer.id &&
      !thinkingPlayerId &&
      !isInitialDealAnimating &&
      dealAnimCards.length === 0 &&
      humanActions.includes(action),
    );
  }

  function toggleDiscard(index: number): void {
    if (!isDrawTurn) return;
    const exists = selectedDiscardIndices.includes(index);
    if (exists) {
      selectedDiscardIndices = selectedDiscardIndices.filter((value) => value !== index);
      return;
    }
    if (selectedDiscardIndices.length >= 3) return;
    selectedDiscardIndices = [...selectedDiscardIndices, index];
  }

  function onHumanAction(action: ActionKind): void {
    if (!game || !humanPlayer || !canHumanAct(action)) return;
    playPokerActionVoice(action, $locale);

    game = applyAction(game, humanPlayer.id, action, {
      discardIndices: action === 'draw' ? selectedDiscardIndices : undefined,
    });

    if (action === 'draw' || action === 'stand') {
      selectedDiscardIndices = [];
    }
  }

  function closeWinnerPopup(): void {
    winnerPopup = null;
  }

  function clearDealSoundTimers(): void {
    if (typeof window === 'undefined') return;
    for (const timer of dealSoundTimers) {
      window.clearTimeout(timer);
    }
    dealSoundTimers = [];
  }

  function cancelDealAnimations(): void {
    dealAnimationToken += 1;
    clearDealSoundTimers();
    dealAnimCards = [];
    isInitialDealAnimating = false;
  }

  function buildInitialDealCards(state: PokerState): DealAnimCard[] {
    const cards: DealAnimCard[] = [];
    const holeCount = state.variant === 'texas' ? 2 : 5;

    for (let round = 0; round < holeCount; round++) {
      for (let idx = 0; idx < state.players.length; idx++) {
        const player = state.players[idx];
        if (!player.hole[round]) continue;

        const target = seatCardTarget(idx, state.players.length, round, holeCount);
        const seatTilt = (idx - (state.players.length - 1) / 2) * 3.1;
        const roundTilt = (round - (holeCount - 1) / 2) * 1.2;
        cards.push({
          id: `deal-hole-${state.handNumber}-${player.id}-${round}`,
          fromX: DEAL_ORIGIN.x,
          fromY: DEAL_ORIGIN.y,
          toX: target.x,
          toY: target.y,
          fromDeg: -8 + round * 0.9,
          toDeg: seatTilt + roundTilt,
          imgSrc: cardBackImage,
          delayMs: cards.length * 82,
          durationMs: 340,
          active: false,
        });
      }
    }

    return cards;
  }

  function buildCommunityDealCards(state: PokerState, start: number, end: number): DealAnimCard[] {
    const cards: DealAnimCard[] = [];
    for (let idx = start; idx < end; idx++) {
      if (!state.community[idx]) continue;
      const target = communityCardTarget(idx);
      cards.push({
        id: `deal-community-${state.handNumber}-${idx}-${state.community[idx].id}`,
        fromX: DEAL_ORIGIN.x,
        fromY: DEAL_ORIGIN.y,
        toX: target.x,
        toY: target.y,
        fromDeg: -7 + idx * 0.6,
        toDeg: (idx - 2) * 1.8,
        imgSrc: cardBackImage,
        delayMs: cards.length * 120,
        durationMs: 360,
        active: false,
      });
    }
    return cards;
  }

  async function runDealAnimation(cards: DealAnimCard[]): Promise<boolean> {
    if (!cards.length) return true;
    clearDealSoundTimers();
    const token = ++dealAnimationToken;

    dealAnimCards = cards.map((card) => ({ ...card, active: false }));
    await tick();
    if (token !== dealAnimationToken) return false;

    dealAnimCards = dealAnimCards.map((card) => ({ ...card, active: true }));

    if (typeof window !== 'undefined') {
      for (const card of dealAnimCards) {
        const cueAt = Math.max(0, card.delayMs + Math.floor(card.durationMs * 0.24));
        const timer = window.setTimeout(() => {
          if (token !== dealAnimationToken) return;
          playPokerDealCard((card.toX - 50) / 50);
        }, cueAt);
        dealSoundTimers.push(timer);
      }
    }

    const totalMs = dealAnimCards.reduce(
      (max, card) => Math.max(max, card.delayMs + card.durationMs),
      0,
    ) + 100;
    await wait(totalMs);

    if (token !== dealAnimationToken) return false;
    clearDealSoundTimers();
    dealAnimCards = [];
    return true;
  }

  async function animateInitialDeal(state: PokerState): Promise<void> {
    const cards = buildInitialDealCards(state);
    if (!cards.length) {
      isInitialDealAnimating = false;
      return;
    }

    isInitialDealAnimating = true;
    const completed = await runDealAnimation(cards);
    if (!completed) return;
    isInitialDealAnimating = false;
  }

  async function animateCommunityDeal(state: PokerState, start: number, end: number): Promise<void> {
    const cards = buildCommunityDealCards(state, start, end);
    if (!cards.length) {
      visibleCommunityCount = Math.max(visibleCommunityCount, end);
      return;
    }

    const completed = await runDealAnimation(cards);
    if (!completed) return;
    if (!game || handKey(game) !== handKey(state)) return;
    visibleCommunityCount = Math.max(visibleCommunityCount, end);
  }

  async function requestAgentDecision(
    snapshot: PokerState,
    actorId: string,
    legal: ActionKind[],
  ): Promise<ActionDecision | null> {
    if (!legal.length) return null;
    const actor = getPlayerById(snapshot, actorId);
    if (!actor.gatewayId) return null;

    const client = getClientById(actor.gatewayId);
    if (!client) return null;

    try {
      const prompt = buildAgentPrompt(snapshot, actorId, $locale);
      const sessKey = `poker-${actorId}-${crypto.randomUUID().slice(0, 8)}`;
      await client.sendChat({
        sessionKey: sessKey,
        message: prompt,
        idempotencyKey: crypto.randomUUID(),
        deliver: false,
      });

      for (let i = 0; i < 22; i++) {
        await wait(900);
        try {
          const hist = await client.getChatHistory(sessKey);
          const assist = hist.find((entry: { role: string; content?: unknown }) => entry.role === 'assistant');
          const content = typeof assist?.content === 'string' ? assist.content : '';
          if (content) {
            const turnTokens = Math.round(content.length * 1.3);
            tokensUsed += turnTokens;
            tokenHistory = [...tokenHistory, turnTokens];
            const parsed = parseAgentAction(content, legal);
            if (parsed) return parsed;
          }
        } catch {
          // keep polling
        }
      }
    } catch {
      // fallback to local program action
    }

    return null;
  }

  function normalizeDecision(legal: ActionKind[], decision: ActionDecision | null): ActionDecision {
    if (decision && legal.includes(decision.action)) {
      if (decision.action === 'draw') {
        return {
          action: 'draw',
          discardIndices: (decision.discardIndices ?? []).slice(0, 3),
        };
      }
      return { action: decision.action };
    }

    if (legal.includes('check')) return { action: 'check' };
    if (legal.includes('call')) return { action: 'call' };
    if (legal.includes('stand')) return { action: 'stand' };
    if (legal.includes('draw')) return { action: 'draw', discardIndices: [0] };
    if (legal.includes('fold')) return { action: 'fold' };
    return { action: legal[0] };
  }

  async function driveAiTurns(): Promise<void> {
    if (aiLoopRunning) return;
    aiLoopRunning = true;

    try {
      while (game && game.phase !== 'done') {
        const snapshot = game;
        const actor = getCurrentPlayer(snapshot);
        if (actor.role === 'human') break;

        const legal = legalActions(snapshot, actor.id);
        if (!legal.length) break;

        thinkingPlayerId = actor.id;
        await wait(actor.role === 'agent' ? 760 : 420);

        let decision: ActionDecision | null = null;
        if (actor.role === 'agent') {
          decision = await requestAgentDecision(snapshot, actor.id, legal);
        }
        if (!decision) {
          decision = chooseProgramAction(snapshot, actor.id);
        }

        const normalized = normalizeDecision(legal, decision);
        game = applyAction(snapshot, actor.id, normalized.action, {
          discardIndices: normalized.discardIndices,
        });

        speechMap = {
          ...speechMap,
          [actor.id]: `${$kt('speech_action')} ${normalized.action}.`,
        };

        thinkingPlayerId = null;
      }
    } finally {
      thinkingPlayerId = null;
      aiLoopRunning = false;
    }
  }

  $effect(() => {
    if (game) {
      const seed = game.players.map((player) => ({
        id: player.id,
        role: player.role === 'agent' ? 'agent' as const : 'program' as const,
        gatewayId: player.role === 'agent' ? player.gatewayId : null,
      }));
      const next = buildSeatConfigs(game.players.length, seed, connectedGatewayIds);
      if (!sameSeatConfigs(next, seatConfigs)) {
        seatConfigs = next;
      }
      const currentHumanSeat = seatNumberFromId(
        game.players.find((player) => player.role === 'human')?.id ?? 'seat-1',
      );
      if (humanSeatNumber !== currentHumanSeat) {
        humanSeatNumber = currentHumanSeat;
      }
      return;
    }

    const next = buildSeatConfigs(playerCount, seatConfigs, connectedGatewayIds);
    if (!sameSeatConfigs(next, seatConfigs)) {
      seatConfigs = next;
    }
    if (humanSeatNumber > playerCount) {
      humanSeatNumber = playerCount;
    }
  });

  $effect(() => {
    if (!isDrawTurn && selectedDiscardIndices.length > 0) {
      selectedDiscardIndices = [];
    }
  });

  $effect(() => {
    if (!game) {
      cancelDealAnimations();
      hasTrackedGame = false;
      trackedHandKey = null;
      trackedCommunityCount = 0;
      visibleCommunityCount = 0;
      winnerPopup = null;
      announcedResultKey = '';
      return;
    }

    const key = handKey(game);
    if (!hasTrackedGame) {
      hasTrackedGame = true;
      trackedHandKey = key;
      trackedCommunityCount = game.community.length;
      visibleCommunityCount = game.variant === 'texas' ? 0 : game.community.length;
      void animateInitialDeal(game);
      return;
    }

    if (trackedHandKey !== key) {
      trackedHandKey = key;
      trackedCommunityCount = game.community.length;
      visibleCommunityCount = game.variant === 'texas' ? 0 : game.community.length;
      void animateInitialDeal(game);
      return;
    }

    if (game.variant === 'texas' && game.community.length > trackedCommunityCount) {
      const start = trackedCommunityCount;
      const end = game.community.length;
      trackedCommunityCount = end;
      void animateCommunityDeal(game, start, end);
      return;
    }

    trackedCommunityCount = game.community.length;
    if (game.variant !== 'texas') {
      visibleCommunityCount = game.community.length;
    } else if (game.community.length < visibleCommunityCount) {
      visibleCommunityCount = game.community.length;
    }
  });

  $effect(() => {
    if (!game || game.phase !== 'done') {
      if (winnerPopup && game && game.phase !== 'done') winnerPopup = null;
      return;
    }

    const resultKey = `${game.handNumber}:${game.winnerIds.join(',')}:${game.lastAction}`;
    if (announcedResultKey === resultKey) return;
    announcedResultKey = resultKey;

    winnerPopup = {
      handNumber: game.handNumber,
      winners: winnerNames(game),
      handLabel: winnerHandLabel(game),
      pot: parsePotFromAction(game.lastAction),
      split: game.winnerIds.length > 1,
    };
    playPokerWinJingle();
  });

  $effect(() => {
    if (!game || game.phase === 'done' || isInitialDealAnimating || dealAnimCards.length > 0) return;
    const actor = getCurrentPlayer(game);
    if (actor.role !== 'human' && !aiLoopRunning) {
      void driveAiTurns();
    }
  });

  if (game) seedSpeechMap(game);

  onDestroy(() => {
    cancelDealAnimations();
    if (game && game.phase !== 'done') savePokerState(game);
    else clearPokerState();
  });

  function createTableScene(container: HTMLDivElement): TableRuntime {
    const width = container.clientWidth || 960;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c2117);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 120);
    camera.position.set(0, 10, 11);
    camera.lookAt(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 8;
    controls.maxDistance = 16;
    controls.minPolarAngle = Math.PI / 5;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.target.set(0, 0.9, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.52));

    const keyLight = new THREE.DirectionalLight(0xfff6de, 0.82);
    keyLight.position.set(8, 11, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.setScalar(2048);
    keyLight.shadow.bias = -0.001;
    keyLight.shadow.camera.near = 0.2;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 8;
    keyLight.shadow.camera.bottom = -8;
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x6fb5ff, 0.33, 40);
    fillLight.position.set(-6, 5, -7);
    scene.add(fillLight);

    const felt = new THREE.Mesh(
      new THREE.CylinderGeometry(3.7, 3.95, 0.46, 80),
      new THREE.MeshStandardMaterial({
        color: 0x1c7a4f,
        roughness: 0.86,
        metalness: 0.04,
      }),
    );
    felt.scale.set(1.58, 1, 1);
    felt.position.y = 0.38;
    felt.castShadow = true;
    felt.receiveShadow = true;
    scene.add(felt);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(5.35, 0.28, 24, 120),
      new THREE.MeshStandardMaterial({
        color: 0x4f2f17,
        roughness: 0.5,
        metalness: 0.2,
      }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1.1, 1, 0.83);
    rim.position.y = 0.68;
    rim.castShadow = true;
    rim.receiveShadow = true;
    scene.add(rim);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.1, 1.2, 40),
      new THREE.MeshStandardMaterial({
        color: 0x23170f,
        roughness: 0.72,
        metalness: 0.14,
      }),
    );
    pedestal.position.y = -0.3;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    scene.add(pedestal);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(14, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0a130d,
        roughness: 0.98,
        metalness: 0,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.92;
    floor.receiveShadow = true;
    scene.add(floor);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(3.8, 64),
      new THREE.MeshBasicMaterial({
        color: 0x51f2a2,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.62;
    glow.scale.set(1.45, 1, 1);
    scene.add(glow);

    let frame = 0;
    let disposed = false;
    const animate = () => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const t = performance.now() * 0.001;
      glow.material.opacity = 0.07 + Math.sin(t * 1.2) * 0.016;
      rim.rotation.z = Math.sin(t * 0.25) * 0.01;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    return {
      dispose() {
        disposed = true;
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        controls.dispose();

        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const mats = Array.isArray(object.material) ? object.material : [object.material];
            for (const mat of mats) mat.dispose();
          }
        });

        renderer.dispose();
        if (renderer.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
      },
    };
  }

  function tableAction(node: HTMLDivElement) {
    const runtime = createTableScene(node);
    return {
      destroy() {
        runtime.dispose();
      },
    };
  }
</script>

{#if !game}
  <div class="setup panel">
    <h3>{$kt('setup_title')}</h3>
    <p>{$kt('setup_desc')}</p>
    <p class="connection">{$kt('setup_connected')}: {connectedGatewayIds.length}</p>

    <div class="setup-grid">
      <section class="block">
        <h4>{$kt('mode_title')}</h4>
        <div class="mode-row">
          <button
            type="button"
            class="mode-btn"
            class:selected={selectedVariant === 'texas'}
            onclick={() => (selectedVariant = 'texas')}
          >
            {$kt('mode_texas')}
          </button>
          <button
            type="button"
            class="mode-btn"
            class:selected={selectedVariant === 'classic'}
            onclick={() => (selectedVariant = 'classic')}
          >
            {$kt('mode_classic')}
          </button>
        </div>
      </section>

      <section class="block">
        <h4>{$kt('players_title')}</h4>
        <div class="count-row">
          <input
            type="range"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            value={playerCount}
            oninput={onPlayerCountInput}
          />
          <b>{playerCount}</b>
        </div>
      </section>

      <section class="block">
        <h4>{$kt('my_seat_title')}</h4>
        <div class="my-seat-row">
          <label for="my-seat-select">{$kt('seat_label')}</label>
          <select id="my-seat-select" onchange={onHumanSeatInput}>
            {#each setupSeatNumbers as seatNo (seatNo)}
              <option value={seatNo} selected={humanSeatNumber === seatNo}>{seatNo}</option>
            {/each}
          </select>
          <span class="you-chip">{$kt('you_badge')}</span>
        </div>
      </section>
    </div>

    <section class="block">
      <h4>{$kt('seats_title')}</h4>
      <div class="seat-list">
        {#each seatConfigs as seat (seat.id)}
          <div class="seat-row" class:fixed={isHumanSeatId(seat.id)}>
            <div class="seat-title">
              {$kt('seat_label')} {seatNumberFromId(seat.id)}
              {#if isHumanSeatId(seat.id)}
                <span class="you-chip">{$kt('you_badge')}</span>
              {/if}
            </div>

            {#if isHumanSeatId(seat.id)}
              <div class="seat-role">{roleLabel('human')}</div>
              <div class="seat-gateway">{$kt('seat_you')}</div>
            {:else}
              <div class="role-toggle">
                <button
                  type="button"
                  class:selected={seat.role === 'program'}
                  onclick={() => setSeatRole(seat.id, 'program')}
                >
                  {$kt('role_program')}
                </button>
                <button
                  type="button"
                  class:selected={seat.role === 'agent'}
                  onclick={() => setSeatRole(seat.id, 'agent')}
                  disabled={!canUseAgent}
                >
                  {$kt('role_agent')}
                </button>
              </div>

              {#if seat.role === 'agent'}
                <div class="gateway-picker">
                  <label>{$kt('gateway_label')}</label>
                  <select onchange={(event) => setSeatGateway(seat.id, event)}>
                    {#each connectedGateways as gateway (gateway.id)}
                      <option value={gateway.id} selected={seat.gatewayId === gateway.id}>{gateway.name}</option>
                    {/each}
                  </select>
                </div>
              {:else}
                <div class="seat-gateway">-</div>
              {/if}
            {/if}
          </div>
        {/each}
      </div>

      {#if !canUseAgent}
        <p class="warn">{$kt('need_gateway_for_agent')}</p>
      {/if}
    </section>

    <div class="setup-actions">
      <button
        type="button"
        class="start-btn"
        onclick={startGame}
      >
        {$kt('start_game')}
      </button>
    </div>
  </div>
{:else}
  <div class="board">
    <div class="topbar panel">
      <div class="status-group left">
        <p class="status-kicker">{$kt('phase')}</p>
        <h3>{phaseLabel(game.phase, $locale)}</h3>
        <p>{statusText}</p>
      </div>

      <div class="title-chip">
        <span>{variantLabel(game.variant, $locale)}</span>
      </div>

      <div class="status-group right">
        <p class="status-kicker">TABLE</p>
        <h3>{$kt('pot')}: {game.pot}</h3>
        <p>
          {$kt('current_bet')}: {game.currentBet} · {$kt('participants')}: {game.players.length}
        </p>
      </div>

      <div class="actions">
        <button class="ghost-btn" type="button" onclick={newHand}>{$kt('new_hand')}</button>
        <button class="ghost-btn" type="button" onclick={backToSetup}>{$kt('change_mode')}</button>
      </div>
    </div>

    <div class="layout">
      <section class="table-wrap panel">
        <div class="table-stage">
          <div class="table-canvas" use:tableAction></div>
          <div class="deck-stack" aria-hidden="true"></div>

          {#if dealAnimCards.length > 0}
            <div class="deal-layer" aria-hidden="true">
              {#each dealAnimCards as anim (anim.id)}
                <img
                  class="deal-card"
                  class:active={anim.active}
                  src={anim.imgSrc}
                  alt=""
                  draggable="false"
                  style={dealCardStyle(anim)}
                />
              {/each}
            </div>
          {/if}

          <div class="center-panel" class:classic={game.variant === 'classic'}>
            {#if game.variant === 'texas'}
              <h4>{$kt('community')}</h4>
              <div class="community-cards">
                {#if visibleCommunityCount === 0}
                  <span class="empty-center">- - - - -</span>
                {:else}
                  {#each game.community.slice(0, visibleCommunityCount) as card (card.id)}
                    <span class="mini-card card-face" class:red={isRedSuit(card)}>
                      <img class="card-img" src={cardImageUri(card)} alt={cardLabel(card)} draggable="false" />
                    </span>
                  {/each}
                {/if}
              </div>
            {:else}
              <h4>{$kt('draw_phase')}</h4>
              <p class="draw-note">{game.phase === 'draw' ? $kt('draw_help') : phaseLabel(game.phase, $locale)}</p>
            {/if}
          </div>

          {#each game.players as player, idx (player.id)}
            <article
              class="seat"
              class:turn={currentPlayer?.id === player.id}
              class:human={player.role === 'human'}
              class:classic-human={game.variant === 'classic' && player.role === 'human'}
              class:thinking={thinkingPlayerId === player.id}
              style={seatPosition(idx, game.players.length)}
            >
              <header class="seat-head">
                <div class="seat-avatar" style={seatAvatarStyle(player)}>{avatarInitial(player.name)}</div>
                <div class="seat-meta">
                  <strong>
                    {player.name}
                    {#if player.role === 'human'}
                      <span class="you-chip inline">{$kt('you_badge')}</span>
                    {/if}
                  </strong>
                  <small>{roleLabel(player.role)}</small>
                </div>
              </header>
              <p class="chips">{$kt('chips')}: {chipBoard[player.id] ?? player.chips}</p>
              <div
                class="seat-cards"
                class:human-cards={player.role === 'human'}
              >
                {#if !isInitialDealAnimating && canRevealCards(player)}
                  {#each player.hole as card, cardIndex (card.id)}
                    {#if isDrawTurn && humanPlayer?.id === player.id}
                      <button
                        type="button"
                        class="mini-card interactive card-face"
                        class:red={isRedSuit(card)}
                        class:selected={selectedDiscardIndices.includes(cardIndex)}
                        onclick={() => toggleDiscard(cardIndex)}
                      >
                        <img class="card-img" src={cardImageUri(card)} alt={cardLabel(card)} draggable="false" />
                      </button>
                    {:else}
                      <span class="mini-card card-face" class:red={isRedSuit(card)}>
                        <img class="card-img" src={cardImageUri(card)} alt={cardLabel(card)} draggable="false" />
                      </span>
                    {/if}
                  {/each}
                {:else if !isInitialDealAnimating}
                  {#each Array.from({ length: hiddenCardCount(player) }) as _, hiddenIndex (`${player.id}-${hiddenIndex}`)}
                    <span class="mini-card back">
                      <img class="card-img" src={cardBackImage} alt="Hidden card" draggable="false" />
                    </span>
                  {/each}
                {/if}
              </div>
              <p class="bet">bet {player.bet}{player.folded ? ' · fold' : ''}</p>
              {#if speechMap[player.id]}
                <p class="speech">{speechMap[player.id]}</p>
              {/if}
            </article>
          {/each}
        </div>

        {#if humanPlayer}
          <div class="human-action panel">
            <div class="human-top">
              <div>
                <strong>{humanPlayer.name}</strong>
                <p>{$kt('to_call')}: {Math.max(0, game.currentBet - humanPlayer.bet)}</p>
              </div>
              {#if isDrawTurn}
                <small>{selectedDiscardIndices.length} {$kt('draw_selected')}</small>
              {/if}
            </div>

            {#if isDrawTurn}
              <div class="action-row draw-row">
                <button type="button" onclick={() => onHumanAction('stand')} disabled={!canHumanAct('stand')}>
                  {$kt('action_stand')}
                </button>
                <button type="button" onclick={() => onHumanAction('draw')} disabled={!canHumanAct('draw')}>
                  {$kt('action_draw')}
                </button>
              </div>
            {:else}
              <div class="action-row">
                <button type="button" onclick={() => onHumanAction('fold')} disabled={!canHumanAct('fold')}>
                  {$kt('action_fold')}
                </button>
                <button type="button" onclick={() => onHumanAction('check')} disabled={!canHumanAct('check')}>
                  {$kt('action_check')}
                </button>
                <button type="button" onclick={() => onHumanAction('call')} disabled={!canHumanAct('call')}>
                  {$kt('action_call')}
                </button>
                <button type="button" onclick={() => onHumanAction('raise')} disabled={!canHumanAct('raise')}>
                  {$kt('action_raise')}
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </section>

      <aside class="side-column">
        {#if oddsSummary}
          <section class="panel odds-panel">
            <h4>{$kt('odds_title')}</h4>
            <div class="odds-meta">
              <p><span>{$kt('odds_now')}</span><b>{localizedHandLabel(oddsSummary.currentLabel, oddsSummary.currentCategory)}</b></p>
              <p><span>{$kt('odds_remaining')}</span><b>{oddsSummary.remainingCards}</b></p>
              <p>
                <span>{$kt('odds_outcomes')}</span>
                <b>{oddsSummary.totalOutcomes} · {oddsSummary.exact ? $kt('odds_mode_exact') : $kt('odds_mode_sample')}</b>
              </p>
            </div>
            {#if madeHandPreview}
              <div class="odds-highlight">
                <p class="odds-highlight-head">
                  <span>{$kt('odds_key_cards')}</span>
                  <b>{localizedHandLabel(madeHandPreview.rank.label, madeHandPreview.rank.category)}</b>
                </p>
                <div class="combo-cards">
                  {#each madeHandPreview.keyCards as card (card.id)}
                    <span class="mini-card combo-card card-face" class:red={isRedSuit(card)}>
                      <img class="card-img" src={cardImageUri(card)} alt={cardLabel(card)} draggable="false" />
                    </span>
                  {/each}
                </div>
              </div>
            {/if}
            <ul>
              {#if oddsSummary.odds.length === 0}
                <li class="empty">{$kt('odds_none')}</li>
              {:else}
                {#each oddsSummary.odds as row (row.label)}
                  <li>
                    <span>{localizedHandLabel(row.label, row.category)}</span>
                    <b>{(row.probability * 100).toFixed(1)}%</b>
                  </li>
                {/each}
              {/if}
            </ul>
          </section>
        {/if}

        <section class="panel list-panel">
          <h4>{$kt('participants')}</h4>
          <ul>
            {#each game.players as player (player.id)}
              <li>
                <span>{player.name}</span>
                <b>{player.chips}</b>
              </li>
            {/each}
          </ul>
        </section>

        <section class="panel log-panel">
          <h4>{$kt('recent_log')}</h4>
          <ul>
            {#if game.log.length === 0}
              <li class="empty">{$kt('no_log')}</li>
            {:else}
              {#each game.log as entry, idx (`${entry}-${idx}`)}
                <li>{entry}</li>
              {/each}
            {/if}
          </ul>
        </section>

        {#if tokenHistory.length > 0}
          <section class="panel token-section">
            <h4>{$kt('token_graph')}</h4>
            <div class="token-chart-wrap"><TokenBarChart data={tokenHistory} /></div>
            <div class="token-total"><Zap size={11} /><span>{$kt('total')}: ~{tokensUsed.toLocaleString()} {$kt('tokens_wasted')}</span></div>
          </section>
        {/if}
      </aside>
    </div>

    {#if winnerPopup}
      <div class="winner-overlay" role="dialog" aria-modal="true">
        <div class="winner-popup">
          <p class="winner-hand">{$kt('popup_hand_no')} #{winnerPopup.handNumber}</p>
          <h3>{winnerPopup.split ? $kt('popup_multi_title') : $kt('popup_title')}</h3>
          <p class="winner-names">{winnerPopup.winners.join(' · ')}</p>
          <div class="winner-meta">
            {#if winnerPopup.handLabel}
              <span>{$kt('popup_hand')}: <b>{winnerPopup.handLabel}</b></span>
            {/if}
            {#if winnerPopup.pot !== null}
              <span>{$kt('popup_pot')}: <b>{winnerPopup.pot}</b></span>
            {/if}
          </div>
          <div class="winner-actions">
            <button type="button" class="winner-btn primary" onclick={newHand}>{$kt('new_hand')}</button>
            <button type="button" class="winner-btn" onclick={closeWinnerPopup}>{$kt('popup_close')}</button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 12px;
  }

  .setup {
    max-width: 1020px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .setup h3 {
    margin: 0;
    font-size: 17px;
    color: var(--color-text);
  }

  .setup p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 13px;
    line-height: 1.45;
  }

  .connection {
    color: var(--color-primary);
    font-weight: 600;
  }

  .setup-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .block {
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 10px;
    background: var(--color-surface-elevated);
  }

  .block h4 {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--color-text);
  }

  .mode-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .mode-btn {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    padding: 9px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .mode-btn.selected {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 14%, transparent);
  }

  .count-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .count-row input {
    flex: 1;
  }

  .count-row b {
    width: 28px;
    text-align: right;
    font-size: 13px;
  }

  .my-seat-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .my-seat-row label {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .my-seat-row select {
    border: 1px solid var(--color-border);
    border-radius: 7px;
    background: var(--color-surface);
    color: var(--color-text);
    padding: 6px 8px;
    font-size: 12px;
    min-width: 72px;
  }

  .you-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    border: 1px solid rgba(92, 233, 184, 0.55);
    color: #5ce9b8;
    background: rgba(16, 72, 52, 0.42);
  }

  .you-chip.inline {
    margin-left: 6px;
  }

  .seat-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .seat-row {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    padding: 8px;
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }

  .seat-row.fixed {
    background: color-mix(in oklab, var(--color-primary) 10%, var(--color-surface));
  }

  .seat-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text);
  }

  .seat-role,
  .seat-gateway {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .role-toggle {
    display: flex;
    gap: 6px;
  }

  .role-toggle button {
    flex: 1;
    border: 1px solid var(--color-border);
    border-radius: 7px;
    padding: 7px 8px;
    font-size: 12px;
    font-weight: 600;
    background: var(--color-surface-elevated);
    color: var(--color-text);
    cursor: pointer;
  }

  .role-toggle button.selected {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 12%, transparent);
  }

  .role-toggle button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .gateway-picker {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .gateway-picker label {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .gateway-picker select {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface-elevated);
    color: var(--color-text);
    padding: 6px 8px;
    font-size: 12px;
  }

  .warn {
    color: #f59e0b;
    font-size: 11px;
  }

  .setup-actions {
    display: flex;
    justify-content: flex-end;
  }

  .start-btn {
    border: 1px solid var(--color-primary);
    border-radius: 8px;
    background: color-mix(in oklab, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 700;
    padding: 9px 14px;
    cursor: pointer;
  }

  .board {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .status-group h3 {
    margin: 0;
    font-size: 15px;
    color: var(--color-text);
  }

  .status-group p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .ghost-btn {
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
    color: var(--color-text);
  }

  .ghost-btn:hover {
    border-color: var(--color-primary);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 12px;
  }

  .table-wrap {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .table-stage {
    --seat-card-w: 38px;
    --seat-card-h: 54px;
    --community-card-w: 86px;
    --community-card-h: 124px;
    --deal-card-w: 38px;
    --deal-card-h: 54px;
    --deck-card-w: 38px;
    --deck-card-h: 54px;
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    min-height: 560px;
    border: 1px solid color-mix(in oklab, var(--color-primary) 28%, transparent);
  }

  .table-canvas {
    position: absolute;
    inset: 0;
  }

  .deck-stack {
    position: absolute;
    left: 46.6%;
    top: 54.2%;
    width: var(--deck-card-w);
    height: var(--deck-card-h);
    z-index: 2;
    pointer-events: none;
    border-radius: 6px;
    border: 1px solid rgba(237, 243, 255, 0.42);
    transform: translate(-50%, -50%) rotate(-5deg);
    background: linear-gradient(145deg, #2d3b61 0%, #7a1e3f 58%, #1f2548 100%);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.46);
  }

  .deck-stack::before,
  .deck-stack::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 6px;
    border: 1px solid rgba(230, 238, 255, 0.28);
    background: linear-gradient(145deg, #263254 0%, #6c1a38 60%, #1b213f 100%);
  }

  .deck-stack::before {
    transform: translate(-3px, 3px);
    opacity: 0.84;
    z-index: -1;
  }

  .deck-stack::after {
    transform: translate(-6px, 6px);
    opacity: 0.65;
    z-index: -2;
  }

  .deal-layer {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
  }

  .deal-card {
    --deal-from-x: 50;
    --deal-from-y: 50;
    --deal-to-x: 50;
    --deal-to-y: 50;
    --deal-from-deg: 0;
    --deal-to-deg: 0;
    --deal-delay: 0ms;
    --deal-duration: 340ms;
    position: absolute;
    left: 0;
    top: 0;
    width: var(--deal-card-w);
    height: var(--deal-card-h);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.45);
    opacity: 0;
    transform: translate(
      calc(var(--deal-from-x) * 1%),
      calc(var(--deal-from-y) * 1%)
    ) translate(-50%, -50%) rotate(calc(var(--deal-from-deg) * 1deg)) scale(0.95);
    transition-property: transform, opacity, filter;
    transition-duration: var(--deal-duration);
    transition-delay: var(--deal-delay);
    transition-timing-function: cubic-bezier(0.22, 0.72, 0.2, 1);
    filter: saturate(0.86) brightness(0.92);
  }

  .deal-card.active {
    opacity: 1;
    transform: translate(
      calc(var(--deal-to-x) * 1%),
      calc(var(--deal-to-y) * 1%)
    ) translate(-50%, -50%) rotate(calc(var(--deal-to-deg) * 1deg)) scale(1);
    filter: saturate(1) brightness(1);
  }

  .center-panel {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
    min-width: 260px;
    max-width: 430px;
    text-align: center;
    border-radius: 10px;
    padding: 8px 10px;
    backdrop-filter: blur(4px);
    background: color-mix(in oklab, #0b2218 80%, transparent);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .center-panel h4 {
    margin: 0 0 6px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.92);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .center-panel.classic {
    min-width: 180px;
  }

  .draw-note {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.84);
  }

  .community-cards {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-height: calc(var(--community-card-h) + 4px);
  }

  .empty-center {
    color: rgba(255, 255, 255, 0.72);
    font-size: 13px;
  }

  .seat {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 192px;
    border-radius: 10px;
    padding: 8px;
    z-index: 3;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: color-mix(in oklab, #0f2218 78%, transparent);
    color: #f3f7ef;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.3);
  }

  .seat.turn {
    border-color: #f7d95b;
    box-shadow: 0 0 0 1px rgba(247, 217, 91, 0.5), 0 14px 28px rgba(0, 0, 0, 0.38);
  }

  .seat.human {
    border-color: rgba(109, 221, 196, 0.7);
  }

  .seat.classic-human {
    width: 288px;
  }

  .seat.thinking {
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: translate(-50%, -50%) scale(1);
    }
    50% {
      transform: translate(-50%, -50%) scale(1.02);
    }
  }

  .seat header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .seat strong {
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    line-height: 1.3;
  }

  .seat small {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.74);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .chips,
  .bet {
    margin: 4px 0 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.76);
  }

  .seat-cards {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 6px;
    min-height: calc(var(--seat-card-h) + 2px);
  }

  .seat-cards.human-cards {
    min-height: calc(var(--seat-card-h) * 1.22 + 2px);
  }

  .mini-card {
    width: var(--seat-card-w);
    height: var(--seat-card-h);
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: #ffffff;
    color: #111418;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    padding: 0;
    overflow: hidden;
  }

  .community-cards .mini-card {
    width: var(--community-card-w);
    height: var(--community-card-h);
    border-radius: 7px;
  }

  .seat-cards.human-cards .mini-card {
    width: calc(var(--seat-card-w) * 1.22);
    height: calc(var(--seat-card-h) * 1.22);
    border-radius: 7px;
  }

  .mini-card.red {
    color: #cb3f3f;
  }

  .mini-card.card-face {
    background: #fff;
  }

  .card-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .mini-card.back {
    background: #17253f;
    border-color: rgba(255, 255, 255, 0.48);
  }

  .mini-card.interactive {
    cursor: pointer;
  }

  .mini-card.selected {
    transform: translateY(-4px);
    border-color: #4ef3bd;
    box-shadow: 0 4px 10px rgba(78, 243, 189, 0.35);
  }

  .speech {
    margin: 6px 0 0;
    font-size: 10px;
    line-height: 1.3;
    color: rgba(190, 255, 226, 0.88);
  }

  .human-action {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .human-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .human-top strong {
    font-size: 13px;
  }

  .human-top p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .human-top small {
    font-size: 11px;
    color: var(--color-primary);
  }

  .action-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .action-row.draw-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .action-row button {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-elevated);
    color: var(--color-text);
    font-size: 12px;
    font-weight: 600;
    padding: 8px 6px;
    cursor: pointer;
  }

  .action-row button:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .action-row button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .side-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .odds-panel h4,
  .list-panel h4,
  .log-panel h4 {
    margin: 0 0 8px;
    font-size: 13px;
  }

  .odds-panel ul,
  .list-panel ul,
  .log-panel ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .odds-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .odds-meta p {
    margin: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }

  .odds-meta span {
    color: var(--color-text-muted);
  }

  .odds-meta b {
    color: var(--color-text);
    font-size: 11px;
  }

  .odds-highlight {
    margin-bottom: 8px;
    padding: 8px;
    border-radius: 9px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
  }

  .odds-highlight-head {
    margin: 0 0 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }

  .odds-highlight-head span {
    color: var(--color-text-muted);
  }

  .odds-highlight-head b {
    color: var(--color-text);
  }

  .combo-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .combo-cards .mini-card.combo-card {
    width: 46px;
    height: 66px;
    border-radius: 7px;
  }

  .odds-panel li {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 7px 8px;
    font-size: 11px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--color-surface-elevated);
    margin-bottom: 5px;
    gap: 8px;
  }

  .list-panel li {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 8px;
    font-size: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--color-surface-elevated);
    margin-bottom: 6px;
  }

  .log-panel ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 420px;
    overflow: auto;
  }

  .log-panel li {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 8px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--color-text-muted);
    background: var(--color-surface-elevated);
  }

  .empty {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .token-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
  }

  .token-section h4 {
    margin: 0 0 8px;
    font-size: 13px;
  }

  .token-chart-wrap {
    height: 72px;
    background: var(--color-surface-elevated);
    border-radius: 8px;
    overflow: visible;
    padding: 6px 4px;
  }

  .token-total {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #fbbf24;
    font-size: 11px;
  }

  .board {
    gap: 14px;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid rgba(113, 125, 255, 0.32);
    background:
      radial-gradient(120% 160% at 50% -20%, rgba(48, 95, 255, 0.25), transparent 55%),
      radial-gradient(95% 110% at 85% 90%, rgba(255, 116, 67, 0.12), transparent 62%),
      linear-gradient(155deg, #17173d 0%, #0e1230 60%, #0a0e27 100%);
    box-shadow:
      0 24px 40px rgba(8, 10, 26, 0.58),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .board .panel {
    background: linear-gradient(180deg, rgba(22, 26, 66, 0.72), rgba(13, 17, 46, 0.78));
    border: 1px solid rgba(98, 114, 216, 0.35);
    backdrop-filter: blur(8px);
  }

  .topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 14px;
  }

  .status-group.left {
    text-align: left;
  }

  .status-group.right {
    text-align: right;
  }

  .status-group .status-kicker {
    margin: 0 0 2px;
    font-size: 10px;
    letter-spacing: 0.14em;
    color: rgba(158, 173, 255, 0.76);
    text-transform: uppercase;
  }

  .status-group h3 {
    margin: 0;
    font-size: 16px;
    letter-spacing: 0.03em;
    color: #f4f6ff;
  }

  .status-group p {
    margin: 2px 0 0;
    font-size: 11px;
    color: rgba(215, 224, 255, 0.72);
  }

  .title-chip {
    position: relative;
    min-width: 210px;
    height: 44px;
    padding: 0 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    border: 1px solid rgba(255, 139, 90, 0.55);
    background: linear-gradient(180deg, rgba(45, 48, 106, 0.92), rgba(24, 28, 76, 0.88));
    box-shadow: 0 8px 16px rgba(14, 16, 39, 0.45);
  }

  .title-chip::before,
  .title-chip::after {
    content: '';
    position: absolute;
    top: 5px;
    bottom: 5px;
    width: 42px;
    border-top: 3px solid rgba(255, 126, 79, 0.85);
    border-bottom: 3px solid rgba(255, 126, 79, 0.55);
    opacity: 0.84;
  }

  .title-chip::before {
    left: -58px;
    border-left: 2px solid rgba(255, 126, 79, 0.6);
    border-top-left-radius: 8px;
    border-bottom-left-radius: 8px;
  }

  .title-chip::after {
    right: -58px;
    border-right: 2px solid rgba(255, 126, 79, 0.6);
    border-top-right-radius: 8px;
    border-bottom-right-radius: 8px;
  }

  .title-chip span {
    font-size: 20px;
    line-height: 1;
    letter-spacing: 0.06em;
    font-weight: 850;
    text-transform: uppercase;
    color: #edf0ff;
  }

  .actions {
    justify-self: end;
    display: inline-flex;
    gap: 8px;
  }

  .ghost-btn {
    border-radius: 10px;
    padding: 9px 14px;
    font-size: 12px;
    font-weight: 700;
    color: #dfe7ff;
    border: 1px solid rgba(106, 127, 230, 0.6);
    background: linear-gradient(180deg, rgba(63, 77, 150, 0.6), rgba(32, 40, 96, 0.76));
  }

  .ghost-btn:hover {
    border-color: rgba(255, 143, 95, 0.8);
    color: #fff6ed;
  }

  .layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .table-wrap.panel {
    padding: 0;
    border: none;
    background: transparent;
    backdrop-filter: none;
  }

  .table-stage {
    min-height: 640px;
    border-radius: 18px;
    border: 1px solid rgba(104, 124, 255, 0.36);
    background:
      radial-gradient(66% 52% at 50% 58%, rgba(27, 47, 106, 0.24), transparent 65%),
      radial-gradient(110% 120% at 50% -20%, rgba(57, 88, 224, 0.2), transparent 62%),
      linear-gradient(168deg, rgba(20, 25, 70, 0.85), rgba(11, 15, 43, 0.9));
    box-shadow:
      inset 0 0 0 1px rgba(160, 179, 255, 0.06),
      0 20px 36px rgba(9, 11, 30, 0.6);
  }

  .table-stage::before,
  .table-stage::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 56%;
    transform: translate(-50%, -50%);
    border-radius: 999px;
    pointer-events: none;
  }

  .table-stage::before {
    width: min(88%, 910px);
    height: min(56%, 330px);
    border: 2px solid rgba(98, 122, 255, 0.88);
    box-shadow:
      0 0 0 6px rgba(45, 60, 145, 0.24),
      0 0 24px rgba(83, 117, 255, 0.5);
    z-index: 1;
  }

  .table-stage::after {
    width: min(84%, 860px);
    height: min(50%, 295px);
    border: 2px solid rgba(255, 145, 95, 0.72);
    box-shadow: 0 0 14px rgba(255, 145, 95, 0.3);
    z-index: 1;
  }

  .table-canvas {
    opacity: 0.34;
    filter: saturate(1.12) brightness(0.95);
  }

  .deck-stack {
    border-color: rgba(255, 184, 132, 0.72);
    box-shadow: 0 10px 18px rgba(8, 10, 30, 0.45), 0 0 12px rgba(255, 132, 82, 0.24);
  }

  .center-panel {
    z-index: 3;
    border-radius: 14px;
    padding: 11px 14px;
    min-width: 430px;
    max-width: 720px;
    border: 1px solid rgba(93, 117, 255, 0.6);
    background: linear-gradient(180deg, rgba(17, 23, 65, 0.88), rgba(11, 16, 51, 0.86));
    box-shadow: 0 12px 20px rgba(8, 11, 32, 0.48);
  }

  .center-panel h4 {
    font-size: 13px;
    letter-spacing: 0.08em;
    color: rgba(231, 236, 255, 0.95);
  }

  .community-cards {
    gap: 10px;
  }

  .community-cards .mini-card {
    box-shadow: 0 8px 14px rgba(0, 0, 0, 0.38);
  }

  .seat {
    z-index: 4;
    width: 236px;
    border-radius: 18px;
    padding: 10px 11px;
    border: 1px solid rgba(103, 124, 244, 0.62);
    background: linear-gradient(180deg, rgba(57, 68, 151, 0.7), rgba(33, 41, 109, 0.72));
    box-shadow: 0 14px 24px rgba(8, 10, 27, 0.52);
  }

  .seat.turn {
    border-color: rgba(255, 152, 100, 0.95);
    box-shadow: 0 0 0 2px rgba(255, 150, 97, 0.2), 0 14px 28px rgba(7, 10, 28, 0.58);
  }

  .seat.human {
    border-color: rgba(76, 220, 255, 0.86);
    box-shadow: 0 0 0 2px rgba(76, 220, 255, 0.18), 0 14px 28px rgba(7, 10, 28, 0.58);
  }

  .seat.classic-human {
    width: 288px;
  }

  .seat-head {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .seat-avatar {
    --avatar-h: 210;
    --avatar-h2: 252;
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 800;
    color: #f8fbff;
    border: 2px solid rgba(230, 236, 255, 0.6);
    background:
      radial-gradient(circle at 28% 26%, hsl(var(--avatar-h2) 88% 76%), transparent 42%),
      linear-gradient(155deg, hsl(var(--avatar-h) 65% 42%), hsl(var(--avatar-h2) 62% 52%));
    box-shadow: 0 0 0 3px rgba(95, 115, 243, 0.22);
  }

  .seat-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .seat-meta strong {
    display: inline-flex;
    align-items: center;
    max-width: 165px;
    font-size: 12px;
    color: #f4f7ff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .seat-meta small {
    font-size: 10px;
    letter-spacing: 0.05em;
    color: rgba(230, 236, 255, 0.82);
  }

  .chips,
  .bet {
    font-size: 11px;
    color: rgba(235, 240, 255, 0.86);
  }

  .seat-cards {
    gap: 5px;
    margin-top: 7px;
  }

  .mini-card {
    border-color: rgba(203, 214, 255, 0.75);
    box-shadow: 0 4px 9px rgba(0, 0, 0, 0.33);
  }

  .mini-card.back {
    background: linear-gradient(145deg, #242d59, #7a2244);
    border-color: rgba(224, 232, 255, 0.72);
  }

  .speech {
    margin-top: 7px;
    padding: 4px 7px;
    border-radius: 7px;
    background: rgba(9, 16, 48, 0.5);
    color: rgba(190, 255, 226, 0.95);
  }

  .human-action.panel {
    margin-top: 2px;
    border-radius: 14px;
    border: 1px solid rgba(112, 129, 237, 0.58);
    background: linear-gradient(180deg, rgba(19, 24, 69, 0.86), rgba(12, 15, 50, 0.86));
    box-shadow: 0 12px 20px rgba(9, 12, 33, 0.42);
  }

  .human-top strong {
    font-size: 15px;
    color: #f4f6ff;
  }

  .human-top p {
    color: rgba(219, 227, 255, 0.78);
  }

  .action-row {
    gap: 10px;
  }

  .action-row button {
    min-height: 50px;
    border-radius: 12px;
    border: 1px solid rgba(102, 124, 236, 0.7);
    background: linear-gradient(180deg, rgba(74, 89, 176, 0.74), rgba(44, 55, 130, 0.82));
    color: #eef2ff;
    font-size: 20px;
    font-weight: 760;
    letter-spacing: 0.01em;
  }

  .action-row button:hover:not(:disabled) {
    border-color: rgba(255, 149, 99, 0.95);
    color: #fff6ed;
    box-shadow: 0 6px 14px rgba(14, 17, 46, 0.4);
  }

  .side-column {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }

  .side-column > .panel {
    min-height: 160px;
  }

  .odds-panel h4,
  .list-panel h4,
  .log-panel h4,
  .token-section h4 {
    color: #edf1ff;
    letter-spacing: 0.04em;
  }

  .odds-panel li,
  .list-panel li,
  .log-panel li {
    border-color: rgba(107, 124, 224, 0.35);
    background: rgba(32, 41, 103, 0.36);
    color: rgba(231, 237, 255, 0.85);
  }

  .odds-highlight {
    border-color: rgba(107, 124, 224, 0.45);
    background: rgba(32, 41, 103, 0.42);
  }

  .odds-meta span,
  .odds-highlight-head span,
  .empty {
    color: rgba(194, 206, 252, 0.72);
  }

  .winner-overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 22px;
    background: radial-gradient(circle at 50% 35%, rgba(110, 94, 255, 0.28), rgba(7, 8, 20, 0.82) 68%);
    backdrop-filter: blur(4px);
  }

  .winner-popup {
    width: min(560px, 100%);
    border-radius: 20px;
    padding: 24px 24px 20px;
    border: 1px solid rgba(152, 167, 255, 0.6);
    background:
      radial-gradient(120% 90% at 50% 0%, rgba(255, 120, 188, 0.18), transparent 55%),
      linear-gradient(160deg, rgba(42, 46, 112, 0.96), rgba(21, 25, 74, 0.96));
    box-shadow:
      0 28px 46px rgba(8, 11, 29, 0.66),
      0 0 26px rgba(118, 138, 255, 0.34);
    text-align: center;
    animation: winnerPopIn 260ms cubic-bezier(0.2, 0.84, 0.21, 1);
  }

  @keyframes winnerPopIn {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .winner-hand {
    margin: 0 0 10px;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(208, 219, 255, 0.8);
  }

  .winner-popup h3 {
    margin: 0;
    font-size: 36px;
    font-weight: 850;
    letter-spacing: 0.04em;
    color: #f8f1ff;
    text-transform: uppercase;
    text-shadow: 0 0 18px rgba(255, 157, 210, 0.42);
  }

  .winner-names {
    margin: 11px 0 0;
    font-size: 20px;
    font-weight: 700;
    color: #e9eeff;
    letter-spacing: 0.02em;
  }

  .winner-meta {
    margin-top: 14px;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px 16px;
    color: rgba(223, 231, 255, 0.86);
    font-size: 13px;
  }

  .winner-meta b {
    color: #ffffff;
  }

  .winner-actions {
    margin-top: 20px;
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .winner-btn {
    min-width: 128px;
    min-height: 44px;
    border-radius: 12px;
    border: 1px solid rgba(130, 148, 246, 0.7);
    background: linear-gradient(180deg, rgba(72, 84, 165, 0.72), rgba(39, 47, 114, 0.82));
    color: #eef2ff;
    font-size: 14px;
    font-weight: 750;
    cursor: pointer;
  }

  .winner-btn.primary {
    border-color: rgba(255, 151, 105, 0.88);
    background: linear-gradient(180deg, rgba(255, 143, 108, 0.9), rgba(213, 86, 86, 0.9));
    color: #fffaf5;
  }

  .winner-btn:hover {
    filter: brightness(1.08);
  }

  @media (max-width: 1200px) {
    .layout {
      grid-template-columns: 1fr;
    }

    .topbar {
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    }

    .actions {
      grid-column: 1 / -1;
      justify-self: stretch;
      justify-content: flex-end;
    }

    .side-column {
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    }
  }

  @media (max-width: 920px) {
    .setup-grid {
      grid-template-columns: 1fr;
    }

    .seat-row {
      grid-template-columns: 1fr;
      gap: 6px;
    }

    .table-stage {
      --seat-card-w: 34px;
      --seat-card-h: 49px;
      --community-card-w: 72px;
      --community-card-h: 104px;
      --deal-card-w: 34px;
      --deal-card-h: 49px;
      --deck-card-w: 34px;
      --deck-card-h: 49px;
      min-height: 670px;
    }

    .seat {
      width: 190px;
      padding: 7px;
    }

    .seat.classic-human {
      width: 244px;
    }

    .seat-cards.human-cards {
      min-height: calc(var(--seat-card-h) * 1.16 + 2px);
    }

    .seat-cards.human-cards .mini-card {
      width: calc(var(--seat-card-w) * 1.16);
      height: calc(var(--seat-card-h) * 1.16);
    }

    .topbar {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .status-group.left,
    .status-group.right {
      text-align: left;
    }

    .title-chip {
      justify-self: center;
      min-width: 190px;
      height: 40px;
    }

    .title-chip span {
      font-size: 17px;
    }

    .actions {
      justify-self: stretch;
      justify-content: space-between;
    }
  }

  @media (max-width: 720px) {
    .table-stage {
      --seat-card-w: 32px;
      --seat-card-h: 46px;
      --community-card-w: 64px;
      --community-card-h: 92px;
      --deal-card-w: 32px;
      --deal-card-h: 46px;
      --deck-card-w: 32px;
      --deck-card-h: 46px;
      min-height: 740px;
    }

    .seat {
      width: 172px;
    }

    .seat.classic-human {
      width: 226px;
    }

    .seat-cards.human-cards {
      min-height: calc(var(--seat-card-h) * 1.12 + 2px);
    }

    .seat-cards.human-cards .mini-card {
      width: calc(var(--seat-card-w) * 1.12);
      height: calc(var(--seat-card-h) * 1.12);
    }

    .side-column {
      grid-template-columns: 1fr;
    }

    .combo-cards .mini-card.combo-card {
      width: 42px;
      height: 60px;
    }

    .actions {
      gap: 6px;
    }

    .action-row button {
      min-height: 44px;
      font-size: 16px;
    }

    .action-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .winner-popup h3 {
      font-size: 30px;
    }

    .winner-names {
      font-size: 17px;
    }
  }
</style>
