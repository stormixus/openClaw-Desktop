<script lang="ts">
  import { onDestroy } from 'svelte';
  import { locale } from '$lib/i18n';
  import { store, getClientById } from '$lib/gateway/store.svelte';
  import { kt } from './i18n';
  import {
    buildAgentPrompt,
    chooseProgramCard,
    chooseProgramPendingMatch,
    createNewGame,
    formatCard,
    getCurrentPlayer,
    getPlayerById,
    kindLabel,
    monthFlower,
    parseAgentChoice,
    playTurnCard,
    resolvePendingMatch,
    scoreState,
    sortCards,
    type CardKind,
    type HwatuCard,
    type MatgoState,
    type PlayerId,
    type PlayerRole,
    type PlayerSetup,
  } from './engine';
  import { clearMatgoState, loadMatgoState, saveMatgoState } from './state';
  import { playCardSlap, playCardFlip, playCapture, playDing, playTurnNotify, playWin, playLose } from './sounds';
  import { getCardImageUrl } from './hwatu';

  type OpponentMode = 'program' | 'agent';

  function isValidMatgoState(value: unknown): value is MatgoState {
    const v = value as Partial<MatgoState> | null;
    return Boolean(
      v &&
      Array.isArray(v.players) &&
      Array.isArray(v.table) &&
      Array.isArray(v.deck) &&
      typeof v.turnIndex === 'number' &&
      typeof v.turnNumber === 'number',
    );
  }

  function emptySpeechMap(): Record<PlayerId, string> {
    return { opponent: '', human: '' };
  }

  const restored = loadMatgoState();
  let game = $state<MatgoState | null>(isValidMatgoState(restored) ? restored : null);
  let mode = $state<OpponentMode>('program');
  let speechMap = $state<Record<PlayerId, string>>(emptySpeechMap());
  let thinkingPlayerId = $state<PlayerId | null>(null);
  let missingCardArt = $state<Record<string, boolean>>({});
  let autoPlayEnabled = $state(false);
  let emoteMenuOpen = $state(false);

  let aiLoopRunning = false;
  let autoPlayRunning = false;
  let emoteTimer: ReturnType<typeof setTimeout> | null = null;

  const connectedGateways = $derived(
    store.gateways.filter((gateway) => store.gatewayStates.get(gateway.id)?.status === 'connected'),
  );
  const connectedGatewayIds = $derived(connectedGateways.map((gateway) => gateway.id));
  const canAgent = $derived(connectedGatewayIds.length >= 1);

  const currentPlayer = $derived(game ? getCurrentPlayer(game) : null);
  const tableCards = $derived(game ? sortCards(game.table) : []);
  const tableGroups = $derived(groupTableByMonth(tableCards));
  const humanHand = $derived(game ? sortCards(getPlayerById(game, 'human').hand) : []);
  const scores = $derived(game ? scoreState(game) : null);
  const pendingForHuman = $derived(
    game && game.step === 'choose-match' && game.pendingChoice?.actorId === 'human'
      ? game.pendingChoice
      : null,
  );
  const canPlayHand = $derived(
    Boolean(
      game &&
      currentPlayer?.id === 'human' &&
      game.step === 'play-hand' &&
      !game.winnerId &&
      !thinkingPlayerId,
      !autoPlayEnabled,
      !autoPlayRunning,
    ),
  );
  const subStatus = $derived(
    game ? `${$kt('turn')}: ${game.turnNumber} · ${$kt('deck')}: ${game.deck.length}` : '',
  );
  const statusText = $derived.by(() => {
    if (!game) return $kt('status_waiting_setup');
    if (game.winnerId === 'draw') return $kt('status_draw');
    if (game.winnerId) {
      const winnerName = getPlayerById(game, game.winnerId).name;
      return `${winnerName} ${$kt('status_win')}`;
    }
    if (pendingForHuman) return $kt('status_choose_capture');
    if (thinkingPlayerId) {
      const thinker = getPlayerById(game, thinkingPlayerId).name;
      return `${thinker} ${$kt('status_thinking')}`;
    }
    if (!currentPlayer) return '';
    if (currentPlayer.id === 'human') return $kt('status_your_turn');
    return `${currentPlayer.name} ${$kt('status_turn')}`;
  });

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function roleLabel(role: PlayerRole): string {
    if (role === 'human') return $kt('role_human');
    if (role === 'agent') return $kt('role_agent');
    return $kt('role_program');
  }

  function gatewayName(gatewayId: string | null): string {
    if (!gatewayId) return '-';
    return store.gateways.find((gateway) => gateway.id === gatewayId)?.name ?? gatewayId.slice(0, 8);
  }

  function seedSpeechFromGame(currentGame: MatgoState): void {
    const next = emptySpeechMap();
    for (const player of currentGame.players) {
      if (player.role === 'agent') next[player.id] = $kt('speech_default_agent');
      else if (player.role === 'program') next[player.id] = $kt('speech_default_program');
      else next[player.id] = '';
    }
    speechMap = next;
  }

  function activeGatewayOrder(): string[] {
    const ids = [...connectedGatewayIds];
    const active = store.activeGatewayId;
    if (active && ids.includes(active)) {
      return [active, ...ids.filter((id) => id !== active)];
    }
    return ids;
  }

  function buildModePlayers(nextMode: OpponentMode): PlayerSetup[] | null {
    const gateways = activeGatewayOrder();
    const g0 = gateways[0] ?? null;

    if (nextMode === 'agent' && !g0) return null;

    const opponentRole: PlayerRole = nextMode === 'agent' ? 'agent' : 'program';
    const opponentGateway: string | null = nextMode === 'agent' ? g0 : null;

    const opponentName = opponentRole === 'agent'
      ? `${$kt('seat_opponent_agent')} · ${gatewayName(opponentGateway)}`
      : $kt('seat_opponent_program');

    return [
      { id: 'opponent', role: opponentRole, name: opponentName, gatewayId: opponentGateway },
      { id: 'human', role: 'human', name: $kt('seat_human'), gatewayId: null },
    ];
  }

  function startGame(nextMode: OpponentMode): void {
    const players = buildModePlayers(nextMode);
    if (!players) return;

    mode = nextMode;
    game = createNewGame(players);
    autoPlayEnabled = false;
    autoPlayRunning = false;
    emoteMenuOpen = false;
    if (emoteTimer) {
      clearTimeout(emoteTimer);
      emoteTimer = null;
    }
    thinkingPlayerId = null;
    seedSpeechFromGame(game);
    clearMatgoState();
    playCardFlip();
  }

  function newRound(): void {
    startGame(mode);
  }

  function backToSetup(): void {
    game = null;
    thinkingPlayerId = null;
    autoPlayEnabled = false;
    autoPlayRunning = false;
    emoteMenuOpen = false;
    if (emoteTimer) {
      clearTimeout(emoteTimer);
      emoteTimer = null;
    }
    speechMap = emptySpeechMap();
    clearMatgoState();
  }

  function capturePreview(cards: HwatuCard[]): HwatuCard[] {
    return cards.slice(Math.max(0, cards.length - 9));
  }

  function kindClass(kind: CardKind): string {
    return `kind-${kind}`;
  }

  function cardArtSrc(card: HwatuCard): string {
    return getCardImageUrl(card.id) ?? '';
  }

  function hasCardArt(card: HwatuCard): boolean {
    return Boolean(getCardImageUrl(card.id)) && !missingCardArt[card.id];
  }

  function markCardArtMissing(cardId: string): void {
    if (missingCardArt[cardId]) return;
    missingCardArt = { ...missingCardArt, [cardId]: true };
  }

  function isPendingMatch(cardId: string): boolean {
    return Boolean(pendingForHuman?.matches.some((card) => card.id === cardId));
  }

  function handleTableCardClick(cardId: string): void {
    if (autoPlayEnabled) return;
    if (!game || !pendingForHuman) return;
    if (!isPendingMatch(cardId)) return;
    game = resolvePendingMatch(game, cardId);
    playCapture();
  }

  function handleHumanHandClick(cardId: string): void {
    if (autoPlayEnabled) return;
    if (!game || !canPlayHand) return;
    game = playTurnCard(game, cardId);
    playCardSlap();
  }

  function toggleAutoPlay(): void {
    if (game?.winnerId) return;
    autoPlayEnabled = !autoPlayEnabled;
    emoteMenuOpen = false;
    playDing();
  }

  function toggleEmoteMenu(): void {
    if (game?.winnerId) return;
    emoteMenuOpen = !emoteMenuOpen;
    playDing();
  }

  const EMOTE_CHOICES = ['\u{1F44D}', '\u{1F525}', '\u{1F923}', '\u{1F62D}', '\u{1F3B4}', '\u{1F680}'];

  function sendHumanEmote(emote: string): void {
    speechMap = { ...speechMap, human: emote };
    emoteMenuOpen = false;
    playDing();

    if (emoteTimer) clearTimeout(emoteTimer);
    emoteTimer = setTimeout(() => {
      if (!speechMap.human) return;
      speechMap = { ...speechMap, human: '' };
      emoteTimer = null;
    }, 2200);
  }

  async function requestAgentChoice(stateSnapshot: MatgoState, actorId: PlayerId, options: string[]): Promise<string | null> {
    if (!options.length) return null;
    const actor = getPlayerById(stateSnapshot, actorId);
    if (!actor.gatewayId) return null;

    const client = getClientById(actor.gatewayId);
    if (!client) return null;

    try {
      const prompt = buildAgentPrompt(stateSnapshot, actorId, $locale);
      const sessKey = `matgo-${actorId}-${crypto.randomUUID().slice(0, 8)}`;
      await client.sendChat({
        sessionKey: sessKey,
        message: prompt,
        idempotencyKey: crypto.randomUUID(),
        deliver: false,
      });

      for (let i = 0; i < 25; i++) {
        await wait(900);
        try {
          const hist = await client.getChatHistory(sessKey);
          const assist = hist.find((entry: any) => entry.role === 'assistant');
          const content = typeof assist?.content === 'string' ? assist.content : '';
          if (content) {
            return parseAgentChoice(content, options);
          }
        } catch {
          // keep polling
        }
      }
    } catch {
      // fallback to program picker
    }
    return null;
  }

  async function driveAiTurns(): Promise<void> {
    if (aiLoopRunning) return;
    aiLoopRunning = true;

    try {
      while (game && !game.winnerId) {
        const snapshot = game;
        const actor = getCurrentPlayer(snapshot);
        if (actor.role === 'human') break;

        if (snapshot.step === 'play-hand') {
          thinkingPlayerId = actor.id;
          await wait(actor.role === 'agent' ? 700 : 420);

          let chosenId: string | null = null;
          if (actor.role === 'agent') {
            chosenId = await requestAgentChoice(snapshot, actor.id, actor.hand.map((card) => card.id));
          }
          if (!chosenId) {
            chosenId = chooseProgramCard(snapshot, actor.id);
          }
          if (!chosenId) break;

          const playedCard = actor.hand.find((card) => card.id === chosenId) ?? null;
          game = playTurnCard(snapshot, chosenId);
          playCardSlap();
          speechMap = {
            ...speechMap,
            [actor.id]: playedCard
              ? `${$kt('speech_play')} ${formatCard(playedCard, $locale)}.`
              : $kt('speech_play'),
          };
          thinkingPlayerId = null;
          continue;
        }

        if (snapshot.step === 'choose-match' && snapshot.pendingChoice?.actorId === actor.id) {
          thinkingPlayerId = actor.id;
          await wait(actor.role === 'agent' ? 520 : 320);

          let chosenMatchId: string | null = null;
          if (actor.role === 'agent') {
            chosenMatchId = await requestAgentChoice(
              snapshot,
              actor.id,
              snapshot.pendingChoice.matches.map((card) => card.id),
            );
          }
          if (!chosenMatchId) {
            chosenMatchId = chooseProgramPendingMatch(snapshot, actor.id);
          }
          if (!chosenMatchId) break;

          const chosenCard = snapshot.pendingChoice.matches.find((card) => card.id === chosenMatchId) ?? null;
          game = resolvePendingMatch(snapshot, chosenMatchId);
          playCapture();
          speechMap = {
            ...speechMap,
            [actor.id]: chosenCard
              ? `${$kt('speech_take')} ${formatCard(chosenCard, $locale)}.`
              : $kt('speech_take'),
          };
          thinkingPlayerId = null;
          continue;
        }

        break;
      }
    } finally {
      thinkingPlayerId = null;
      aiLoopRunning = false;
    }
  }

  $effect(() => {
    if (!game || game.winnerId) return;
    const actor = getCurrentPlayer(game);
    if (actor.role !== 'human' && !aiLoopRunning) {
      void driveAiTurns();
    }
  });

  $effect(() => {
    if (!game || game.winnerId) return;
    if (!autoPlayEnabled || autoPlayRunning || aiLoopRunning) return;
    const actor = getCurrentPlayer(game);
    if (actor.id !== 'human') return;

    autoPlayRunning = true;
    thinkingPlayerId = 'human';

    void (async () => {
      try {
        await wait(320);
        if (!autoPlayEnabled) return;
        const snapshot = game;
        if (!snapshot || snapshot.winnerId) return;
        if (getCurrentPlayer(snapshot).id !== 'human') return;

        if (snapshot.step === 'play-hand') {
          const picked = chooseProgramCard(snapshot, 'human');
          if (!picked) return;
          const playedCard = getPlayerById(snapshot, 'human').hand.find((card) => card.id === picked) ?? null;
          game = playTurnCard(snapshot, picked);
          playCardSlap();
          speechMap = {
            ...speechMap,
            human: playedCard
              ? `${$kt('speech_auto_play')} ${formatCard(playedCard, $locale)}.`
              : $kt('speech_auto_play'),
          };
          return;
        }

        if (snapshot.step === 'choose-match' && snapshot.pendingChoice?.actorId === 'human') {
          const picked = chooseProgramPendingMatch(snapshot, 'human');
          if (!picked) return;
          game = resolvePendingMatch(snapshot, picked);
          playCapture();
          speechMap = {
            ...speechMap,
            human: $kt('speech_auto_take'),
          };
        }
      } finally {
        thinkingPlayerId = null;
        autoPlayRunning = false;
      }
    })();
  });

  $effect(() => {
    if (!game) return;
    if (game.winnerId) {
      if (game.winnerId === 'human') playWin();
      else playLose();
      return;
    }
    const actor = getCurrentPlayer(game);
    if (actor.role === 'human' && game.step === 'play-hand') {
      playTurnNotify();
    }
  });

  if (game) {
    seedSpeechFromGame(game);
  }

  onDestroy(() => {
    if (emoteTimer) {
      clearTimeout(emoteTimer);
      emoteTimer = null;
    }
    if (game && !game.winnerId) saveMatgoState(game);
    else clearMatgoState();
  });

  /* ── Card rendering helpers (template only) ── */

  const MONTH_EMOJI: Record<number, string> = {
    1: '\u{1F332}', 2: '\u{1F338}', 3: '\u{1F33A}', 4: '\u{1F49C}',
    5: '\u{1FABB}', 6: '\u{1F339}', 7: '\u{1F33F}', 8: '\u{1F33E}',
    9: '\u{1F3F5}\uFE0F', 10: '\u{1F341}', 11: '\u{1F327}\uFE0F', 12: '\u{1FABD}',
  };

  const KIND_ICON: Record<CardKind, string> = {
    bright: '\u2600\uFE0F',
    animal: '\u{1F43E}',
    ribbon: '\u{1F380}',
    pi: '\u{1F343}',
  };

  function monthEmoji(month: number): string {
    return MONTH_EMOJI[month] ?? '\u{1F3B4}';
  }

  function kindIcon(kind: CardKind): string {
    return KIND_ICON[kind];
  }

  function groupByKind(cards: HwatuCard[]): Record<CardKind, HwatuCard[]> {
    const groups: Record<CardKind, HwatuCard[]> = {
      bright: [], animal: [], ribbon: [], pi: [],
    };
    for (const card of cards) {
      groups[card.kind].push(card);
    }
    return groups;
  }

  function groupTableByMonth(cards: HwatuCard[]): HwatuCard[][] {
    if (!cards.length) return [];
    const monthMap = new Map<number, HwatuCard[]>();
    for (const card of cards) {
      const bucket = monthMap.get(card.month) ?? [];
      bucket.push(card);
      monthMap.set(card.month, bucket);
    }
    return [...monthMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, bucket]) => bucket);
  }

  const CAPTURE_KINDS: CardKind[] = ['bright', 'animal', 'ribbon', 'pi'];
</script>

{#if !game}
  <!-- ══════════ SETUP SCREEN ══════════ -->
  <div class="setup-screen">
    <div class="setup-header">
      <span class="setup-icon">{'\u{1F3B4}'}</span>
      <h3>{$kt('setup_title')}</h3>
      <p class="setup-desc">{$kt('setup_desc')}</p>
      <p class="setup-connection">{$kt('setup_connected')}: <strong>{connectedGatewayIds.length}</strong></p>
    </div>

    <div class="setup-cards">
      <button type="button" class="setup-card" onclick={() => startGame('program')}>
        <span class="setup-card-icon">{'\u{1F916}'}</span>
        <b>{$kt('mode_program_human')}</b>
        <small>{$kt('role_program')}</small>
      </button>

      <button
        type="button"
        class="setup-card"
        onclick={() => startGame('agent')}
        disabled={!canAgent}
      >
        <span class="setup-card-icon">{'\u{1F9E0}'}</span>
        <b>{$kt('mode_agent_human')}</b>
        {#if !canAgent}
          <small class="disabled-hint">{$kt('mode_need_gateway')}</small>
        {:else}
          <small>{$kt('role_agent')}</small>
        {/if}
      </button>
    </div>
  </div>

{:else}
  {@const opponentPlayer = getPlayerById(game, 'opponent')}
  {@const humanPlayer = getPlayerById(game, 'human')}
  {@const opponentGroups = groupByKind(opponentPlayer.captured)}
  {@const humanGroups = groupByKind(humanPlayer.captured)}

  <div class="board">
    <div class="felt-table">
      <!-- ══ Game Badge (top-left) ══ -->
      <div class="game-badge">
        <span class="badge-icon">{'\u{1F3B4}'}</span>
        <span class="badge-title">{$kt('title')}</span>
      </div>

      <!-- ══ Opponent Hand (top-center, face-down) ══ -->
      <div class="opp-hand-area">
        {#if speechMap[opponentPlayer.id]}
          <div class="speech-bubble opp-speech" class:thinking={thinkingPlayerId === opponentPlayer.id}>
            <span>{speechMap[opponentPlayer.id]}</span>
          </div>
        {/if}
        <div class="hand-row opponent-hand">
          {#each Array(opponentPlayer.hand.length) as _, idx (idx)}
            <div
              class="hwatu-card card-back card-sm fan-card deal-in"
              style={`--i:${idx}; --total:${Math.max(opponentPlayer.hand.length, 1)}; --delay:${idx * 36}ms;`}
            ></div>
          {/each}
        </div>
      </div>

      <!-- ══ Opponent Info Panel (top-right) ══ -->
      <div class="info-panel opp-info" class:panel-active={currentPlayer?.id === opponentPlayer.id && !game.winnerId}>
        <div class="panel-avatar opp-avatar">{'\u{1F916}'}</div>
        <div class="panel-details">
          <span class="panel-name">{opponentPlayer.name}</span>
          <span class="panel-role">{roleLabel(opponentPlayer.role)}</span>
        </div>
        {#if scores}
          <div class="panel-score">
            <span class="panel-score-val">{scores.opponent.total}</span>
            <span class="panel-score-unit">{$kt('score')}</span>
          </div>
        {/if}
      </div>

      <!-- ══ Captures Sidebar (mid-left) ══ -->
      <div class="captures-sidebar">
        <!-- Opponent captures -->
        <div class="cap-section">
          <span class="cap-owner-label">{opponentPlayer.name}</span>
          {#each CAPTURE_KINDS as kind (kind)}
            {@const kindCards = opponentGroups[kind]}
            {#if kindCards.length > 0}
              <div class="cap-group">
                <div class="cap-label">
                  <span class="cap-icon kind-accent-{kind}">{kindIcon(kind)}</span>
                  <span class="cap-count">{kindCards.length}</span>
                </div>
                <div class="cap-cards">
                  {#each capturePreview(kindCards) as card, idx (card.id)}
                    <div
                      class="mini-card {kindClass(card.kind)} deal-in"
                      style={`--mini:${idx}; --delay:${idx * 18}ms;`}
                      title={formatCard(card, $locale)}
                    >
                      {#if hasCardArt(card)}
                        <img class="mini-img" src={cardArtSrc(card)} alt="" loading="lazy" onerror={() => markCardArtMissing(card.id)} />
                      {:else}
                        <span class="mini-emoji">{monthEmoji(card.month)}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
        </div>

        <div class="cap-divider"></div>

        <!-- Human captures -->
        <div class="cap-section">
          <span class="cap-owner-label">{humanPlayer.name}</span>
          {#each CAPTURE_KINDS as kind (kind)}
            {@const kindCards = humanGroups[kind]}
            {#if kindCards.length > 0}
              <div class="cap-group">
                <div class="cap-label">
                  <span class="cap-icon kind-accent-{kind}">{kindIcon(kind)}</span>
                  <span class="cap-count">{kindCards.length}</span>
                </div>
                <div class="cap-cards">
                  {#each capturePreview(kindCards) as card, idx (card.id)}
                    <div
                      class="mini-card {kindClass(card.kind)} deal-in"
                      style={`--mini:${idx}; --delay:${idx * 18}ms;`}
                      title={formatCard(card, $locale)}
                    >
                      {#if hasCardArt(card)}
                        <img class="mini-img" src={cardArtSrc(card)} alt="" loading="lazy" onerror={() => markCardArtMissing(card.id)} />
                      {:else}
                        <span class="mini-emoji">{monthEmoji(card.month)}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>

      <!-- ══ Field Center (table cards) ══ -->
      <section class="field-center">
        {#if pendingForHuman}
          <p class="field-hint">{$kt('hint_pick_table')}</p>
        {/if}

        <div class="field-grid">
          {#if tableGroups.length === 0}
            <span class="field-empty">-</span>
          {/if}
          {#each tableGroups as pile (pile[0]?.month)}
            <div class="field-pile" style={`--pile-size:${pile.length};`}>
              {#each pile as card, idx (card.id)}
                <button
                  type="button"
                  class="hwatu-card card-face field-card {kindClass(card.kind)} deal-in"
                  style={`--stack:${idx}; --delay:${idx * 30}ms;`}
                  class:match-glow={isPendingMatch(card.id)}
                  disabled={autoPlayEnabled || !pendingForHuman || !isPendingMatch(card.id)}
                  onclick={() => handleTableCardClick(card.id)}
                  title={formatCard(card, $locale)}
                >
                  {#if hasCardArt(card)}
                    <img
                      src={cardArtSrc(card)}
                      alt={formatCard(card, $locale)}
                      loading="lazy"
                      onerror={() => markCardArtMissing(card.id)}
                    />
                  {:else}
                    <div class="card-kind-strip kind-strip-{card.kind}">
                      {#if card.kind === 'bright'}<span class="strip-icon">{'\u2600\uFE0F'}</span>{/if}
                      {#if card.kind === 'animal'}<span class="strip-icon">{'\u{1F43E}'}</span>{/if}
                      {#if card.kind === 'ribbon'}<span class="strip-icon">{'\u{1F380}'}</span>{/if}
                      {#if card.kind === 'pi'}<span class="strip-icon">{'\u{1F343}'}</span>{/if}
                    </div>
                    <span class="card-emoji">{monthEmoji(card.month)}</span>
                    <span class="card-month">{card.month}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        </div>

        <div class="deck-area">
          <div class="hwatu-card card-back card-deck"></div>
          <span class="deck-label">{$kt('deck')} {game.deck.length}</span>
        </div>
      </section>

      <!-- ══ Side Column (status, controls, log) ══ -->
      <div class="side-column">
        <div class="status-box">
          <span class="turn-dot" class:pulse={currentPlayer?.id === 'human' && !thinkingPlayerId && !game.winnerId}></span>
          <span class="status-text">{statusText}</span>
        </div>
        <div class="sub-status">{subStatus}</div>

        <div class="quick-controls">
          <button type="button" class="quick-btn quick-emote" onclick={toggleEmoteMenu} disabled={Boolean(game.winnerId)}>
            {$kt('btn_emote')}
          </button>
          <button
            type="button"
            class="quick-btn quick-auto"
            class:auto-on={autoPlayEnabled}
            onclick={toggleAutoPlay}
            disabled={Boolean(game.winnerId)}
          >
            {#if autoPlayEnabled}
              {$kt('btn_auto_on')}
            {:else}
              {$kt('btn_auto_off')}
            {/if}
          </button>
        </div>

        {#if emoteMenuOpen}
          <div class="emote-picker">
            {#each EMOTE_CHOICES as emote (emote)}
              <button type="button" class="emote-chip" onclick={() => sendHumanEmote(emote)}>{emote}</button>
            {/each}
          </div>
        {/if}

        <div class="action-log">
          <span class="log-latest">{game.lastAction}</span>
          {#if game.log.length > 1}
            <details class="log-details">
              <summary>{$kt('recent_log')} ({game.log.length})</summary>
              <ul class="log-list">
                {#each game.log as entry, idx (`${entry}-${idx}`)}
                  <li>{entry}</li>
                {/each}
              </ul>
            </details>
          {/if}
        </div>
      </div>

      <!-- ══ Human Hand (bottom-center, face-up) ══ -->
      <div class="hum-hand-area">
        <div class="hand-row human-hand">
          {#each humanHand as card, idx (card.id)}
            <button
              type="button"
              class="hwatu-card card-face hand-card fan-card deal-in {kindClass(card.kind)}"
              style={`--i:${idx}; --total:${Math.max(humanHand.length, 1)}; --delay:${idx * 34}ms;`}
              class:playable={canPlayHand}
              disabled={!canPlayHand || autoPlayEnabled}
              onclick={() => handleHumanHandClick(card.id)}
              title={formatCard(card, $locale)}
            >
              {#if hasCardArt(card)}
                <img
                  src={cardArtSrc(card)}
                  alt={formatCard(card, $locale)}
                  loading="lazy"
                  onerror={() => markCardArtMissing(card.id)}
                />
              {:else}
                <div class="card-kind-strip kind-strip-{card.kind}">
                  {#if card.kind === 'bright'}<span class="strip-icon">{'\u2600\uFE0F'}</span>{/if}
                  {#if card.kind === 'animal'}<span class="strip-icon">{'\u{1F43E}'}</span>{/if}
                  {#if card.kind === 'ribbon'}<span class="strip-icon">{'\u{1F380}'}</span>{/if}
                  {#if card.kind === 'pi'}<span class="strip-icon">{'\u{1F343}'}</span>{/if}
                </div>
                <span class="card-emoji">{monthEmoji(card.month)}</span>
                <span class="card-month">{card.month}</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if speechMap[humanPlayer.id]}
          <div class="speech-bubble hum-speech">
            <span>{speechMap[humanPlayer.id]}</span>
          </div>
        {/if}
      </div>

      <!-- ══ Human Info Panel (bottom-right) ══ -->
      <div class="info-panel hum-info" class:panel-active={currentPlayer?.id === 'human' && !thinkingPlayerId && !game.winnerId}>
        <div class="panel-avatar hum-avatar">{'\u{1F464}'}</div>
        <div class="panel-details">
          <span class="panel-name">{humanPlayer.name}</span>
          <span class="panel-role">{roleLabel(humanPlayer.role)}</span>
        </div>
        {#if scores}
          <div class="panel-score">
            <span class="panel-score-val">{scores.human.total}</span>
            <span class="panel-score-unit">{$kt('score')}</span>
          </div>
        {/if}
      </div>

      <!-- ══ Action Bar (bottom) ══ -->
      <div class="action-bar">
        <span class="round-num">{game.turnNumber}</span>
        <button class="btn-action btn-go" type="button" onclick={newRound}>{$kt('new_game')}</button>
        <button class="btn-action btn-stop" type="button" onclick={backToSetup}>{$kt('change_mode')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════
     SETUP SCREEN
     ═══════════════════════════════════════════ */
  .setup-screen {
    max-width: 560px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .setup-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .setup-icon {
    font-size: 40px;
    line-height: 1;
  }

  .setup-header h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    color: var(--color-text);
    letter-spacing: -0.02em;
  }

  .setup-desc {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .setup-connection {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .setup-connection strong {
    color: var(--color-primary);
  }

  .setup-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  .setup-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 150px;
    padding: 20px 16px;
    border-radius: 16px;
    border: 2px solid var(--color-border);
    background: var(--color-surface-elevated, var(--color-surface));
    color: var(--color-text);
    cursor: pointer;
    text-align: center;
    transition: all 180ms ease;
  }

  .setup-card:hover:not(:disabled) {
    border-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  .setup-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .setup-card-icon {
    font-size: 32px;
    line-height: 1;
  }

  .setup-card b {
    font-size: 14px;
    line-height: 1.3;
  }

  .setup-card small {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .disabled-hint {
    color: var(--color-text-muted);
    opacity: 0.8;
  }

  /* ═══════════════════════════════════════════
     BOARD - OVERALL
     ═══════════════════════════════════════════ */
  .board {
    --felt: #2d6b2e;
    --felt-light: #3a8a3a;
    --felt-dark: #1e4d1e;
    --felt-border: #163a16;
    --wood: #5c3317;
    --wood-dark: #3e200d;
    --card-bg: #fffef8;
    --card-border: #c8362e;
    --gold: #f0c040;
    --gold-glow: rgba(240, 192, 64, 0.5);
    --text-on-felt: #e8f5e0;
    --text-on-felt-dim: rgba(232, 245, 224, 0.7);
  }

  /* ═══════════════════════════════════════════
     FELT TABLE - CSS GRID LAYOUT
     ═══════════════════════════════════════════ */
  .felt-table {
    display: grid;
    grid-template-areas:
      "badge  ohand   opanel"
      "caps   field   side"
      ".      hhand   hpanel"
      ".      actions .";
    grid-template-columns: minmax(80px, 140px) 1fr minmax(140px, 180px);
    grid-template-rows: auto 1fr auto auto;
    gap: 10px;
    padding: 14px;
    border-radius: 16px;
    border: 3px solid var(--wood);
    background:
      radial-gradient(ellipse at 50% 30%, var(--felt-light), transparent 70%),
      linear-gradient(180deg, var(--felt), var(--felt-dark));
    min-height: 560px;
  }

  /* Grid area assignments */
  .game-badge { grid-area: badge; }
  .opp-hand-area { grid-area: ohand; }
  .opp-info { grid-area: opanel; }
  .captures-sidebar { grid-area: caps; }
  .field-center { grid-area: field; }
  .side-column { grid-area: side; }
  .hum-hand-area { grid-area: hhand; }
  .hum-info { grid-area: hpanel; }
  .action-bar { grid-area: actions; }

  /* ═══════════════════════════════════════════
     GAME BADGE (top-left)
     ═══════════════════════════════════════════ */
  .game-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    align-self: start;
  }

  .badge-icon {
    font-size: 28px;
    line-height: 1;
  }

  .badge-title {
    font-size: 14px;
    font-weight: 800;
    color: var(--gold);
    letter-spacing: 0.02em;
  }

  /* ═══════════════════════════════════════════
     HAND AREAS
     ═══════════════════════════════════════════ */
  .opp-hand-area,
  .hum-hand-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .hand-row {
    display: flex;
    flex-wrap: nowrap;
    gap: 0;
    justify-content: center;
    min-height: 44px;
    width: 100%;
  }

  .opponent-hand {
    align-items: flex-end;
    overflow: visible;
  }

  .human-hand {
    align-items: flex-end;
    padding: 10px 4px 6px;
    overflow-x: auto;
    overflow-y: hidden;
    justify-content: flex-start;
  }

  .fan-card {
    --fan-rot: calc((var(--i) - (var(--total) - 1) / 2) * 2.4deg);
    --base-transform: rotate(var(--fan-rot));
    transform: var(--base-transform);
    transform-origin: center 120%;
    margin-left: -18px;
    z-index: calc(var(--i) + 1);
  }

  .opponent-hand .fan-card {
    --fan-rot: calc((var(--i) - (var(--total) - 1) / 2) * 1.35deg);
    margin-left: -14px;
    transform-origin: center 140%;
  }

  .opponent-hand .fan-card:first-child,
  .human-hand .fan-card:first-child {
    margin-left: 0;
  }

  /* ═══════════════════════════════════════════
     INFO PANELS (white floating card)
     ═══════════════════════════════════════════ */
  .info-panel {
    background: rgba(255, 255, 255, 0.92);
    border-radius: 12px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
    border: 1.5px solid rgba(255, 255, 255, 0.4);
    transition: box-shadow 300ms ease, border-color 300ms ease;
    align-self: start;
  }

  .info-panel.panel-active {
    border-color: rgba(74, 222, 128, 0.6);
    box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.3), 0 2px 12px rgba(0, 0, 0, 0.25);
  }

  .panel-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e8e8e8, #d0d0d0);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
    border: 2px solid rgba(0, 0, 0, 0.08);
  }

  .opp-avatar {
    background: linear-gradient(135deg, #fde2e2, #f5c5c5);
  }

  .hum-avatar {
    background: linear-gradient(135deg, #dde8fd, #c5d5f5);
  }

  .panel-details {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-width: 0;
    width: 100%;
  }

  .panel-name {
    font-size: 11px;
    font-weight: 700;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
  }

  .panel-role {
    font-size: 9px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .panel-score {
    display: flex;
    align-items: baseline;
    gap: 3px;
    margin-top: 2px;
  }

  .panel-score-val {
    font-size: 22px;
    font-weight: 900;
    color: #c0302a;
    line-height: 1;
  }

  .panel-score-unit {
    font-size: 10px;
    color: #888;
  }

  /* ═══════════════════════════════════════════
     CAPTURES SIDEBAR (mid-left)
     ═══════════════════════════════════════════ */
  .captures-sidebar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    overflow-y: auto;
    align-self: stretch;
  }

  .cap-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cap-owner-label {
    font-size: 9px;
    font-weight: 700;
    color: var(--text-on-felt-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 2px;
  }

  .cap-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.12);
    margin: 4px 0;
  }

  .cap-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 3px 4px;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 6px;
  }

  .cap-label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .cap-icon {
    font-size: 10px;
    line-height: 1;
  }

  .cap-count {
    font-size: 10px;
    font-weight: 800;
    color: var(--text-on-felt);
    background: rgba(255, 255, 255, 0.1);
    padding: 0 4px;
    border-radius: 3px;
  }

  .cap-cards {
    display: flex;
    align-items: flex-end;
    padding-left: 2px;
  }

  .cap-cards .mini-card {
    margin-left: -9px;
  }

  .cap-cards .mini-card:first-child {
    margin-left: 0;
  }

  /* Kind accent colors */
  .kind-accent-bright { color: #f5c542; }
  .kind-accent-animal { color: #ef7a6d; }
  .kind-accent-ribbon { color: #6db4ef; }
  .kind-accent-pi { color: #7dd87d; }

  /* ═══════════════════════════════════════════
     FIELD CENTER (table cards)
     ═══════════════════════════════════════════ */
  .field-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    background:
      radial-gradient(ellipse at 40% 30%, rgba(100, 180, 100, 0.25), transparent 60%),
      rgba(0, 0, 0, 0.08);
    align-self: stretch;
  }

  .field-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
    flex: 1;
    align-content: center;
    width: 100%;
  }

  .field-empty {
    font-size: 28px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.35);
    font-weight: 800;
  }

  .field-pile {
    --pile-size: 1;
    width: calc(60px + (var(--pile-size) - 1) * 12px);
    height: calc(84px + (var(--pile-size) - 1) * 8px);
    position: relative;
    flex: 0 0 auto;
  }

  .field-card {
    --stack: 0;
    --base-transform: translate(calc(var(--stack) * 12px), calc(var(--stack) * 8px));
    position: absolute;
    left: 0;
    top: 0;
    transform: var(--base-transform);
  }

  .field-hint {
    margin: 0 0 4px;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    color: #ffe57f;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.2);
    width: 100%;
  }

  .deck-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
  }

  .deck-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-on-felt-dim);
  }

  /* ═══════════════════════════════════════════
     SIDE COLUMN (status, controls, log)
     ═══════════════════════════════════════════ */
  .side-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-self: stretch;
    overflow-y: auto;
  }

  .status-box {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
  }

  .turn-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6c6c6c;
    flex-shrink: 0;
  }

  .turn-dot.pulse {
    background: #4ade80;
    box-shadow: 0 0 6px #4ade80;
    animation: pulse-glow 1.5s ease-in-out infinite;
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 4px #4ade80; opacity: 1; }
    50% { box-shadow: 0 0 12px #4ade80, 0 0 20px rgba(74, 222, 128, 0.4); opacity: 0.85; }
  }

  .status-text {
    font-size: 12px;
    font-weight: 700;
    color: #f0f0f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub-status {
    font-size: 10px;
    color: var(--text-on-felt-dim);
    padding: 0 8px;
  }

  .quick-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .quick-btn {
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(21, 70, 21, 0.6);
    color: #f3ffe8;
    font-size: 11px;
    font-weight: 800;
    padding: 8px 6px;
    cursor: pointer;
    transition: transform 140ms ease, filter 140ms ease, border-color 140ms ease;
    white-space: nowrap;
  }

  .quick-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.1);
    border-color: rgba(208, 247, 182, 0.5);
  }

  .quick-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .quick-emote {
    background: linear-gradient(180deg, #5f8d36, #426724);
  }

  .quick-auto {
    background: linear-gradient(180deg, #4f7e2d, #385d20);
  }

  .quick-auto.auto-on {
    background: linear-gradient(180deg, #9acc4a, #6f9e28);
    color: #243902;
    border-color: rgba(230, 255, 180, 0.5);
  }

  .emote-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.22);
  }

  .emote-chip {
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    padding: 4px 8px;
    line-height: 1;
    font-size: 16px;
    cursor: pointer;
    transition: transform 120ms ease, background 120ms ease;
  }

  .emote-chip:hover {
    transform: translateY(-1px) scale(1.04);
    background: rgba(255, 255, 255, 0.22);
  }

  .emote-chip:active {
    transform: translateY(0) scale(0.98);
  }

  .auto-state {
    font-size: 10px;
    color: var(--text-on-felt-dim);
  }

  /* ═══════════════════════════════════════════
     ACTION LOG
     ═══════════════════════════════════════════ */
  .action-log {
    border-radius: 6px;
    padding: 6px 8px;
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 11px;
    color: var(--text-on-felt-dim);
  }

  .log-latest {
    display: block;
    line-height: 1.4;
    color: var(--text-on-felt);
    min-height: 16px;
    font-size: 10px;
  }

  .log-details {
    margin-top: 4px;
  }

  .log-details summary {
    font-size: 10px;
    cursor: pointer;
    color: var(--text-on-felt-dim);
    user-select: none;
  }

  .log-details summary:hover {
    color: var(--text-on-felt);
  }

  .log-list {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 100px;
    overflow-y: auto;
  }

  .log-list li {
    font-size: 9px;
    line-height: 1.35;
    padding: 2px 4px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.08);
    color: var(--text-on-felt-dim);
  }

  /* ═══════════════════════════════════════════
     ACTION BAR (bottom)
     ═══════════════════════════════════════════ */
  .action-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 6px 0;
  }

  .round-num {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.3);
    border: 2px solid var(--gold);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 900;
    color: var(--gold);
    flex-shrink: 0;
  }

  .btn-action {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.15);
    transition: all 150ms ease;
    white-space: nowrap;
  }

  .btn-go {
    background: linear-gradient(180deg, #5cb85c, #449d44);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.25);
  }

  .btn-stop {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.8);
  }

  .btn-action:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  /* ═══════════════════════════════════════════
     SPEECH BUBBLES
     ═══════════════════════════════════════════ */
  .speech-bubble {
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 10px;
    line-height: 1.3;
    color: #2a2a2a;
    background: rgba(255, 255, 255, 0.85);
    max-width: 90%;
    word-break: break-word;
    text-align: center;
  }

  .speech-bubble.thinking {
    background: rgba(180, 230, 140, 0.9);
    animation: think-pulse 1.2s ease-in-out infinite;
  }

  @keyframes think-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .opp-speech {
    align-self: center;
  }

  .hum-speech {
    align-self: center;
  }

  /* ═══════════════════════════════════════════
     MINI CARDS (in capture groups)
     ═══════════════════════════════════════════ */
  .mini-card {
    width: 22px;
    height: 30px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    background: var(--card-bg);
    border: 1px solid rgba(0, 0, 0, 0.2);
    position: relative;
    overflow: hidden;
    z-index: calc(var(--mini) + 1);
  }

  .mini-card.kind-bright {
    border-color: #d4a020;
    box-shadow: inset 0 0 4px rgba(240, 192, 64, 0.35);
  }

  .mini-card.kind-animal {
    border-color: #c84040;
    box-shadow: inset 0 0 4px rgba(200, 64, 64, 0.2);
  }

  .mini-card.kind-ribbon {
    border-color: #4080c0;
    box-shadow: inset 0 0 4px rgba(64, 128, 192, 0.2);
  }

  .mini-card.kind-pi {
    border-color: #408040;
    box-shadow: inset 0 0 4px rgba(64, 128, 64, 0.15);
  }

  .mini-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 2px;
  }

  .mini-emoji {
    font-size: 11px;
    line-height: 1;
  }

  /* ═══════════════════════════════════════════
     HWATU CARD BASE
     ═══════════════════════════════════════════ */
  .hwatu-card {
    border-radius: 6px;
    overflow: hidden;
    position: relative;
    box-sizing: border-box;
  }

  /* Card face (CSS rendered) */
  .card-face {
    width: 60px;
    height: 84px;
    background: var(--card-bg);
    border: 1.5px solid rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 0;
    color: #1a1a1a;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    transition: transform 150ms ease, box-shadow 150ms ease, filter 150ms ease;
  }

  .card-face::before,
  .card-face::after {
    content: '';
    position: absolute;
    pointer-events: none;
    border-radius: inherit;
  }

  .card-face::before {
    inset: 0;
    border: 2px solid var(--card-border);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.38);
    z-index: 2;
  }

  .card-face::after {
    inset: 4px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    z-index: 2;
  }

  .card-face img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
    position: relative;
    z-index: 1;
  }

  /* Kind-specific card tints */
  .card-face.kind-bright {
    background: linear-gradient(180deg, #fffef0, #fff8e0);
    border-color: #d4a020;
  }

  .card-face.kind-animal {
    background: linear-gradient(180deg, #fffafa, #fff0ee);
    border-color: #c06050;
  }

  .card-face.kind-ribbon {
    background: linear-gradient(180deg, #fafcff, #eef4ff);
    border-color: #5080b0;
  }

  .card-face.kind-pi {
    background: linear-gradient(180deg, #fcfff8, #f0f8ec);
    border-color: #608060;
  }

  /* Kind accent strip at top */
  .card-kind-strip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }

  .kind-strip-bright {
    background: linear-gradient(180deg, #f5c542, #e0a820);
  }

  .kind-strip-animal {
    background: linear-gradient(180deg, #e06050, #c84838);
  }

  .kind-strip-ribbon {
    background: linear-gradient(180deg, #5090d0, #3870b0);
  }

  .kind-strip-pi {
    background: linear-gradient(180deg, #60a060, #488048);
  }

  .strip-icon {
    font-size: 10px;
    line-height: 1;
    filter: brightness(1.3);
  }

  .card-emoji {
    font-size: 24px;
    line-height: 1;
    margin-top: 6px;
    filter: drop-shadow(0 1px 1px rgba(0,0,0,0.1));
    z-index: 1;
  }

  .card-month {
    font-size: 11px;
    font-weight: 900;
    color: #444;
    line-height: 1;
    margin-top: 1px;
    z-index: 1;
  }

  .deal-in {
    animation: card-arrive 260ms ease-out both;
    animation-delay: var(--delay, 0ms);
  }

  @keyframes card-arrive {
    from {
      opacity: 0;
      filter: saturate(140%) brightness(1.2);
    }
    to {
      opacity: 1;
      filter: saturate(100%) brightness(1);
    }
  }

  /* Card back */
  .card-back {
    background:
      repeating-conic-gradient(
        from 45deg,
        rgba(255, 215, 0, 0.12) 0deg 90deg,
        transparent 90deg 180deg
      ) 0 0 / 10px 10px,
      radial-gradient(circle at 50% 50%, rgba(255, 215, 0, 0.08) 0%, transparent 60%),
      linear-gradient(160deg, #c0302a, #8b1a14);
    border: 1.5px solid #6e0f0f;
    box-shadow: inset 0 0 0 2px rgba(255, 215, 0, 0.2), 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .card-sm {
    width: 32px;
    height: 45px;
  }

  .card-deck {
    width: 60px;
    height: 84px;
  }

  /* ═══════════════════════════════════════════
     BUTTON CARD INTERACTIONS
     ═══════════════════════════════════════════ */
  button.hwatu-card {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  button.hwatu-card.playable:hover {
    transform: var(--base-transform, none) translateY(-8px) scale(1.04);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
    z-index: 2;
  }

  button.hwatu-card:disabled {
    cursor: default;
    opacity: 0.7;
  }

  button.hwatu-card.playable {
    cursor: grab;
  }

  /* Match glow on table cards */
  .match-glow {
    opacity: 1 !important;
    animation: match-pulse 1s ease-in-out infinite;
    border-color: var(--gold) !important;
    box-shadow: 0 0 0 2px var(--gold-glow), 0 0 14px var(--gold-glow) !important;
    transform: var(--base-transform, none) scale(1.05);
    z-index: 2;
    cursor: pointer !important;
  }

  @keyframes match-pulse {
    0%, 100% { box-shadow: 0 0 0 2px var(--gold-glow), 0 0 14px var(--gold-glow); }
    50% { box-shadow: 0 0 0 3px var(--gold-glow), 0 0 22px var(--gold-glow); }
  }

  .field-card:not(.match-glow):disabled {
    opacity: 0.8;
  }

  /* ═══════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════ */
  @media (max-width: 900px) {
    .setup-cards {
      grid-template-columns: 1fr;
    }

    .felt-table {
      grid-template-areas:
        "badge   opanel"
        "ohand   ohand"
        "field   field"
        "caps    side"
        "hhand   hhand"
        "hpanel  hpanel"
        "actions actions";
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto 1fr auto auto auto auto;
      gap: 8px;
      padding: 10px;
    }

    .game-badge {
      flex-direction: row;
      gap: 6px;
      padding: 6px 10px;
    }

    .badge-icon {
      font-size: 20px;
    }

    .badge-title {
      font-size: 12px;
    }

    .captures-sidebar {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .cap-section {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 4px;
    }

    .cap-divider {
      width: 1px;
      height: auto;
      margin: 0 4px;
    }

    .info-panel {
      flex-direction: row;
      gap: 8px;
    }

    .panel-avatar {
      width: 32px;
      height: 32px;
      font-size: 16px;
    }

    .panel-details {
      align-items: flex-start;
    }

    .panel-score-val {
      font-size: 18px;
    }

    .quick-controls {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 600px) {
    .card-face {
      width: 52px;
      height: 73px;
    }

    .card-emoji {
      font-size: 20px;
    }

    .card-kind-strip {
      height: 14px;
    }

    .strip-icon {
      font-size: 8px;
    }

    .card-month {
      font-size: 10px;
    }

    .card-sm {
      width: 26px;
      height: 36px;
    }

    .card-deck {
      width: 52px;
      height: 73px;
    }

    .felt-table {
      min-height: 480px;
      padding: 8px;
      gap: 6px;
    }

    .mini-card {
      width: 18px;
      height: 25px;
    }

    .mini-emoji {
      font-size: 9px;
    }

    .field-grid {
      gap: 8px;
    }

    .field-pile {
      width: calc(52px + (var(--pile-size) - 1) * 10px);
      height: calc(73px + (var(--pile-size) - 1) * 7px);
    }

    .field-card {
      --base-transform: translate(calc(var(--stack) * 10px), calc(var(--stack) * 7px));
    }

    .fan-card {
      margin-left: -15px;
    }

    .opponent-hand .fan-card {
      margin-left: -11px;
    }
  }
</style>
