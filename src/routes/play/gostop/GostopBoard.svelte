<script lang="ts">
  import { onDestroy } from 'svelte';
  import { locale } from '$lib/i18n';
  import { store, getClientById } from '$lib/gateway/store.svelte';
  import { kt } from './i18n';
  import {
    buildAgentPrompt,
    chooseProgramCard,
    chooseProgramGoStop,
    chooseProgramPendingMatch,
    createNewGame,
    formatCard,
    getCurrentPlayer,
    getPlayerById,
    kindLabel,
    monthFlower,
    parseAgentChoice,
    parseAgentGoStop,
    playTurnCard,
    resolveGoStop,
    resolvePendingMatch,
    scoreState,
    sortCards,
    type CardKind,
    type GostopState,
    type HwatuCard,
    type PlayerId,
    type PlayerRole,
    type PlayerSetup,
  } from './engine';
  import { clearGostopState, loadGostopState, saveGostopState } from './state';
  import { playCardSlap, playCardFlip, playCapture, playDing, playTurnNotify, playGo, playStop, playWin, playLose } from './sounds';
  import { getCardImageUrl } from './hwatu';

  type StartPreset =
    | 'program-agent-human'
    | 'program-program-human'
    | 'agent-agent-human';

  function isValidGostopState(value: unknown): value is GostopState {
    const v = value as Partial<GostopState> | null;
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
    return { left: '', right: '', human: '' };
  }

  const restored = loadGostopState();
  let game = $state<GostopState | null>(isValidGostopState(restored) ? restored : null);
  let preset = $state<StartPreset>('program-program-human');
  let speechMap = $state<Record<PlayerId, string>>(emptySpeechMap());
  let thinkingPlayerId = $state<PlayerId | null>(null);
  let missingCardArt = $state<Record<string, boolean>>({});

  let aiLoopRunning = false;

  const connectedGateways = $derived(
    store.gateways.filter((gateway) => store.gatewayStates.get(gateway.id)?.status === 'connected'),
  );
  const connectedGatewayIds = $derived(connectedGateways.map((gateway) => gateway.id));
  const canProgramAgent = $derived(connectedGatewayIds.length >= 1);
  const canAgentAgent = $derived(connectedGatewayIds.length >= 2);

  const currentPlayer = $derived(game ? getCurrentPlayer(game) : null);
  const tableCards = $derived(game ? sortCards(game.table) : []);
  const humanHand = $derived(game ? sortCards(getPlayerById(game, 'human').hand) : []);
  const scores = $derived(game ? scoreState(game) : null);
  const pendingForHuman = $derived(
    game && game.step === 'choose-match' && game.pendingChoice?.actorId === 'human'
      ? game.pendingChoice
      : null,
  );
  const goStopForHuman = $derived(
    game && game.step === 'go-or-stop' && currentPlayer?.id === 'human' && !game.winnerId,
  );
  const canPlayHand = $derived(
    Boolean(
      game &&
      currentPlayer?.id === 'human' &&
      game.step === 'play-hand' &&
      !game.winnerId &&
      !thinkingPlayerId,
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
    if (goStopForHuman) return $kt('status_go_or_stop');
    if (pendingForHuman) return $kt('status_choose_capture');
    if (thinkingPlayerId) {
      const thinker = getPlayerById(game, thinkingPlayerId).name;
      return `${thinker} ${$kt('status_thinking')}`;
    }
    if (!currentPlayer) return '';
    if (game.step === 'go-or-stop') {
      return `${currentPlayer.name} -- ${$kt('go_or_stop')}`;
    }
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

  function seedSpeechFromGame(currentGame: GostopState): void {
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

  function buildPresetPlayers(nextPreset: StartPreset): PlayerSetup[] | null {
    const gateways = activeGatewayOrder();
    const g0 = gateways[0] ?? null;
    const g1 = gateways[1] ?? null;

    if (nextPreset === 'program-agent-human' && !g0) return null;
    if (nextPreset === 'agent-agent-human' && (!g0 || !g1)) return null;

    let leftRole: PlayerRole = 'program';
    let rightRole: PlayerRole = 'program';
    let leftGateway: string | null = null;
    let rightGateway: string | null = null;

    if (nextPreset === 'program-agent-human') {
      rightRole = 'agent';
      rightGateway = g0;
    } else if (nextPreset === 'agent-agent-human') {
      leftRole = 'agent';
      rightRole = 'agent';
      leftGateway = g0;
      rightGateway = g1;
    }

    const leftName = leftRole === 'agent'
      ? `${$kt('seat_left_agent')} · ${gatewayName(leftGateway)}`
      : $kt('seat_left_program');
    const rightName = rightRole === 'agent'
      ? `${$kt('seat_right_agent')} · ${gatewayName(rightGateway)}`
      : $kt('seat_right_program');

    return [
      { id: 'left', role: leftRole, name: leftName, gatewayId: leftGateway },
      { id: 'right', role: rightRole, name: rightName, gatewayId: rightGateway },
      { id: 'human', role: 'human', name: $kt('seat_human'), gatewayId: null },
    ];
  }

  function startGame(nextPreset: StartPreset): void {
    const players = buildPresetPlayers(nextPreset);
    if (!players) return;

    preset = nextPreset;
    game = createNewGame(players);
    thinkingPlayerId = null;
    seedSpeechFromGame(game);
    clearGostopState();
  }

  function newRound(): void {
    startGame(preset);
  }

  function backToSetup(): void {
    game = null;
    thinkingPlayerId = null;
    speechMap = emptySpeechMap();
    clearGostopState();
  }

  function handleGoStop(choice: 'go' | 'stop'): void {
    if (!game || !goStopForHuman) return;
    game = resolveGoStop(game, choice);
    if (choice === 'go') playGo();
    else playStop();
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
    if (!game || !pendingForHuman) return;
    if (!isPendingMatch(cardId)) return;
    game = resolvePendingMatch(game, cardId);
    playCapture();
  }

  function handleHumanHandClick(cardId: string): void {
    if (!game || !canPlayHand) return;
    game = playTurnCard(game, cardId);
    playCardSlap();
  }

  async function requestAgentChoice(stateSnapshot: GostopState, actorId: PlayerId, options: string[]): Promise<string | null> {
    if (!options.length) return null;
    const actor = getPlayerById(stateSnapshot, actorId);
    if (!actor.gatewayId) return null;

    const client = getClientById(actor.gatewayId);
    if (!client) return null;

    try {
      const prompt = buildAgentPrompt(stateSnapshot, actorId, $locale);
      const sessKey = `gostop-${actorId}-${crypto.randomUUID().slice(0, 8)}`;
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

  async function requestAgentGoStop(stateSnapshot: GostopState, actorId: PlayerId): Promise<'go' | 'stop' | null> {
    const actor = getPlayerById(stateSnapshot, actorId);
    if (!actor.gatewayId) return null;

    const client = getClientById(actor.gatewayId);
    if (!client) return null;

    try {
      const prompt = buildAgentPrompt(stateSnapshot, actorId, $locale);
      const sessKey = `gostop-gostop-${actorId}-${crypto.randomUUID().slice(0, 8)}`;
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
            return parseAgentGoStop(content);
          }
        } catch {
          // keep polling
        }
      }
    } catch {
      // fallback
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

        if (snapshot.step === 'go-or-stop') {
          thinkingPlayerId = actor.id;
          await wait(actor.role === 'agent' ? 700 : 420);

          let choice: 'go' | 'stop' | null = null;
          if (actor.role === 'agent') {
            choice = await requestAgentGoStop(snapshot, actor.id);
          }
          if (!choice) {
            choice = chooseProgramGoStop(snapshot, actor.id);
          }

          game = resolveGoStop(snapshot, choice);
          if (choice === 'go') playGo();
          else playStop();
          speechMap = {
            ...speechMap,
            [actor.id]: choice === 'go' ? $kt('went_go') : $kt('went_stop'),
          };
          thinkingPlayerId = null;
          continue;
        }

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
    if (game && !game.winnerId) saveGostopState(game);
    else clearGostopState();
  });

  /* ── Rendering helpers (no game logic changes) ── */

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
    return MONTH_EMOJI[month] ?? `${month}`;
  }

  function kindIcon(kind: CardKind): string {
    return KIND_ICON[kind];
  }

  function groupByKind(cards: HwatuCard[]): { kind: CardKind; cards: HwatuCard[] }[] {
    const order: CardKind[] = ['bright', 'animal', 'ribbon', 'pi'];
    const map = new Map<CardKind, HwatuCard[]>();
    for (const k of order) map.set(k, []);
    for (const c of cards) {
      map.get(c.kind)!.push(c);
    }
    return order
      .filter((k) => (map.get(k)?.length ?? 0) > 0)
      .map((k) => ({ kind: k, cards: map.get(k)! }));
  }

  function recentLog(log: string[]): string[] {
    return log.slice(0, 3);
  }
</script>

{#if !game}
  <!-- ═══════ SETUP SCREEN ═══════ -->
  <div class="setup-screen">
    <div class="setup-header">
      <h3 class="setup-title">{$kt('setup_title')}</h3>
      <p class="setup-desc">{$kt('setup_desc')}</p>
      <p class="setup-connection">{$kt('setup_connected')}: <span class="conn-count">{connectedGatewayIds.length}</span></p>
    </div>

    <div class="preset-grid">
      <button type="button" class="preset-card" onclick={() => startGame('program-program-human')}>
        <span class="preset-icon">{'\u{1F916}'}{'\u{1F916}'}{'\u{1F464}'}</span>
        <b>{$kt('mode_program_program_human')}</b>
      </button>

      <button
        type="button"
        class="preset-card"
        onclick={() => startGame('program-agent-human')}
        disabled={!canProgramAgent}
      >
        <span class="preset-icon">{'\u{1F916}'}{'\u{1F9E0}'}{'\u{1F464}'}</span>
        <b>{$kt('mode_program_agent_human')}</b>
        {#if !canProgramAgent}
          <small class="preset-warn">{$kt('mode_need_gateway')}</small>
        {/if}
      </button>

      <button
        type="button"
        class="preset-card"
        onclick={() => startGame('agent-agent-human')}
        disabled={!canAgentAgent}
      >
        <span class="preset-icon">{'\u{1F9E0}'}{'\u{1F9E0}'}{'\u{1F464}'}</span>
        <b>{$kt('mode_agent_agent_human')}</b>
        {#if !canAgentAgent}
          <small class="preset-warn">{$kt('mode_need_two_gateways')}</small>
        {/if}
      </button>
    </div>
  </div>
{:else}
  <!-- ═══════ GAME BOARD ═══════ -->
  {@const leftPlayer = getPlayerById(game, 'left')}
  {@const rightPlayer = getPlayerById(game, 'right')}
  {@const humanPlayer = getPlayerById(game, 'human')}
  <div class="board">
    <div class="felt-table">

      <!-- ── Status Bar ── -->
      <header class="status-bar">
        <div class="status-left">
          <span class="status-dot" class:pulse={currentPlayer?.id === 'human' && !thinkingPlayerId}></span>
          <span class="status-text">{statusText}</span>
        </div>
        <span class="status-sub">{subStatus}</span>
        <div class="status-actions">
          <button class="btn-action btn-new" type="button" onclick={newRound}>{$kt('new_game')}</button>
          <button class="btn-action btn-mode" type="button" onclick={backToSetup}>{$kt('change_mode')}</button>
        </div>
      </header>

      <!-- ── Opponent Row ── -->
      <div class="opponent-row">
        {#each [leftPlayer, rightPlayer] as player (player.id)}
          {@const pScore = scores?.[player.id]}
          {@const pGroups = groupByKind(player.captured)}
          <article class="opp-zone" class:active-turn={currentPlayer?.id === player.id}>
            <div class="opp-header">
              <div class="opp-name-row">
                <h4 class="opp-name">{player.name}</h4>
                {#if game.goCount[player.id] > 0}
                  <span class="go-pill">Go x{game.goCount[player.id]}</span>
                {/if}
              </div>
              {#if pScore}
                <span class="opp-score-badge">{pScore.total}</span>
              {/if}
            </div>

            <!-- Speech bubble -->
            {#if speechMap[player.id]}
              <div class="speech-bubble" class:thinking={thinkingPlayerId === player.id}>
                {speechMap[player.id]}
              </div>
            {/if}

            <!-- Opponent hand (face down) -->
            <div class="opp-hand">
              {#each Array(player.hand.length) as _, idx (idx)}
                <div class="card-back card-sm"></div>
              {/each}
            </div>

            <!-- Captured cards grouped by kind -->
            <div class="capture-groups">
              {#if player.captured.length === 0}
                <span class="empty-cap">{$kt('empty_capture')}</span>
              {:else}
                {#each pGroups as group (group.kind)}
                  <div class="cap-group">
                    <span class={`cap-kind-tag cap-${group.kind}`}>
                      {kindIcon(group.kind)}{group.cards.length}
                    </span>
                    {#each group.cards.slice(0, 5) as card (card.id)}
                      <div class={`mini-card mc-${card.kind}`} title={formatCard(card, $locale)}>
                        {#if hasCardArt(card)}
                          <img class="mini-img" src={cardArtSrc(card)} alt="" loading="lazy" onerror={() => markCardArtMissing(card.id)} />
                        {:else}
                          {monthEmoji(card.month)}
                        {/if}
                      </div>
                    {/each}
                    {#if group.cards.length > 5}
                      <span class="cap-more">+{group.cards.length - 5}</span>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          </article>
        {/each}
      </div>

      <!-- ── Field / Table Center ── -->
      <section class="field-area">
        <div class="deck-stack">
          <div class="card-back card-deck">
            <div class="deck-pattern"></div>
          </div>
          <span class="deck-count">{game.deck.length}</span>
        </div>

        <div class="field-cards">
          {#if pendingForHuman}
            <p class="field-hint">{$kt('hint_pick_table')}</p>
          {/if}
          <div class="field-grid">
            {#each tableCards as card (card.id)}
              <button
                type="button"
                class={`hwatu-card fc-${card.kind}`}
                class:match-glow={isPendingMatch(card.id)}
                disabled={!pendingForHuman || !isPendingMatch(card.id)}
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
                  <div class={`card-face cf-${card.kind}`}>
                    {#if card.kind === 'bright'}
                      <span class="card-strip strip-bright">{'\u2600\uFE0F'}</span>
                    {:else if card.kind === 'animal'}
                      <span class="card-strip strip-animal">{'\u{1F43E}'}</span>
                    {:else if card.kind === 'ribbon'}
                      <span class="card-strip strip-ribbon">{'\u{1F380}'}</span>
                    {:else}
                      <span class="card-strip strip-pi">{'\u{1F343}'}</span>
                    {/if}
                    <span class="card-emoji">{monthEmoji(card.month)}</span>
                    <span class="card-month">{card.month}</span>
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </section>

      <!-- ── Go/Stop Modal ── -->
      {#if goStopForHuman}
        <div class="go-stop-overlay">
          <div class="go-stop-modal">
            <h3 class="go-stop-title">{$kt('go_or_stop')}</h3>
            <p class="go-stop-desc">{$kt('status_go_or_stop')}</p>
            {#if scores}
              <div class="go-stop-stats">
                <span class="go-stop-score">{$kt('score')}: {scores.human.total}</span>
                <span class="go-stop-gocount">{$kt('go_count')}: {game.goCount.human}</span>
              </div>
            {/if}
            <div class="go-stop-buttons">
              <button type="button" class="go-btn" onclick={() => handleGoStop('go')}>
                {$kt('go_choice')}
              </button>
              <button type="button" class="stop-btn" onclick={() => handleGoStop('stop')}>
                {$kt('stop_choice')}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- ── Human Zone ── -->
      <section class="human-zone" class:active-turn={currentPlayer?.id === 'human' && !thinkingPlayerId}>
        <div class="human-header">
          <div class="human-info">
            <h4 class="human-name">{humanPlayer.name}</h4>
            {#if game.goCount.human > 0}
              <span class="go-pill">Go x{game.goCount.human}</span>
            {/if}
          </div>

          {#if scores}
            {@const hs = scores.human}
            <div class="human-score-area">
              <span class="human-total">{hs.total}</span>
              <div class="human-kind-row">
                <span class="hk hk-bright">{kindIcon('bright')}{hs.bright}</span>
                <span class="hk hk-animal">{kindIcon('animal')}{hs.animal}</span>
                <span class="hk hk-ribbon">{kindIcon('ribbon')}{hs.ribbon}</span>
                <span class="hk hk-pi">{kindIcon('pi')}{hs.pi}</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Human captured cards grouped -->
        <div class="capture-groups human-captures">
          {#if humanPlayer.captured.length === 0}
            <span class="empty-cap">{$kt('empty_capture')}</span>
          {:else}
            {#each groupByKind(humanPlayer.captured) as group (group.kind)}
              <div class="cap-group">
                <span class={`cap-kind-tag cap-${group.kind}`}>
                  {kindIcon(group.kind)}{group.cards.length}
                </span>
                {#each group.cards.slice(0, 6) as card (card.id)}
                  <div class={`mini-card mc-${card.kind}`} title={formatCard(card, $locale)}>
                    {#if hasCardArt(card)}
                      <img class="mini-img" src={cardArtSrc(card)} alt="" loading="lazy" onerror={() => markCardArtMissing(card.id)} />
                    {:else}
                      {monthEmoji(card.month)}
                    {/if}
                  </div>
                {/each}
                {#if group.cards.length > 6}
                  <span class="cap-more">+{group.cards.length - 6}</span>
                {/if}
              </div>
            {/each}
          {/if}
        </div>

        <!-- Human hand -->
        <div class="hand-grid">
          {#each humanHand as card (card.id)}
            <button
              type="button"
              class={`hwatu-card hc-${card.kind}`}
              class:playable={canPlayHand}
              disabled={!canPlayHand}
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
                <div class={`card-face cf-${card.kind}`}>
                  {#if card.kind === 'bright'}
                    <span class="card-strip strip-bright">{'\u2600\uFE0F'}</span>
                  {:else if card.kind === 'animal'}
                    <span class="card-strip strip-animal">{'\u{1F43E}'}</span>
                  {:else if card.kind === 'ribbon'}
                    <span class="card-strip strip-ribbon">{'\u{1F380}'}</span>
                  {:else}
                    <span class="card-strip strip-pi">{'\u{1F343}'}</span>
                  {/if}
                  <span class="card-emoji">{monthEmoji(card.month)}</span>
                  <span class="card-month">{card.month}</span>
                </div>
              {/if}
            </button>
          {/each}
        </div>
      </section>

      <!-- ── Action Log (inline at bottom) ── -->
      <div class="action-log">
        {#each recentLog(game.log) as entry, idx (`${entry}-${idx}`)}
          <span class="log-entry">{entry}</span>
        {/each}
        {#if game.log.length === 0}
          <span class="log-entry log-empty">{$kt('no_log')}</span>
        {/if}
      </div>

    </div>
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════════
     DESIGN TOKENS
     ═══════════════════════════════════════════════ */
  .board {
    --felt: #2d6b30;
    --felt-light: #3a8a3e;
    --felt-dark: #1e4f22;
    --felt-edge: #173d1a;
    --wood: #4a2a12;
    --wood-dark: #33200d;
    --gold: #ffd54f;
    --gold-dim: rgba(255, 213, 79, 0.3);
    --cream: #fffdf5;
    --card-w: 60px;
    --card-h: 84px;
    --card-r: 6px;
    --card-shadow: 0 2px 6px rgba(0,0,0,0.22);
    --text-felt: #e8f5e0;
    --text-felt-dim: rgba(232, 245, 224, 0.7);
  }

  /* ═══════════════════════════════════════════════
     SETUP SCREEN
     ═══════════════════════════════════════════════ */
  .setup-screen {
    max-width: 820px;
    margin: 0 auto;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .setup-header {
    text-align: center;
  }

  .setup-title {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: var(--color-text);
  }

  .setup-desc {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .setup-connection {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .conn-count {
    font-weight: 700;
    color: var(--color-primary);
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }

  .preset-card {
    position: relative;
    border: 2px solid var(--color-border);
    border-radius: 14px;
    background: var(--color-surface-elevated);
    color: var(--color-text);
    padding: 20px 16px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
  }

  .preset-card:hover:not(:disabled) {
    border-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.08);
  }

  .preset-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .preset-icon {
    font-size: 28px;
    line-height: 1;
  }

  .preset-card b {
    font-size: 13px;
    line-height: 1.4;
  }

  .preset-warn {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  /* ═══════════════════════════════════════════════
     FELT TABLE (main board wrapper)
     ═══════════════════════════════════════════════ */
  .felt-table {
    border-radius: 20px;
    padding: 14px;
    border: 4px solid var(--wood-dark);
    background:
      radial-gradient(ellipse at 30% 20%, rgba(80,180,80,0.25), transparent 60%),
      radial-gradient(ellipse at 70% 80%, rgba(20,60,20,0.3), transparent 60%),
      linear-gradient(160deg, var(--felt-light), var(--felt), var(--felt-dark));
    box-shadow:
      inset 0 0 0 1px rgba(255,255,255,0.08),
      0 4px 30px rgba(0,0,0,0.35);
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
    overflow: hidden;
  }

  /* ── Status Bar ── */
  .status-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    border-radius: 12px;
    background: rgba(0,0,0,0.28);
    border: 1px solid rgba(255,255,255,0.1);
    flex-wrap: wrap;
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255,255,255,0.4);
    flex-shrink: 0;
  }

  .status-dot.pulse {
    background: var(--gold);
    box-shadow: 0 0 8px var(--gold);
    animation: pulse-glow 1.5s ease-in-out infinite;
  }

  @keyframes pulse-glow {
    0%, 100% { opacity: 1; box-shadow: 0 0 6px var(--gold); }
    50% { opacity: 0.6; box-shadow: 0 0 14px var(--gold); }
  }

  .status-text {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-felt);
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-sub {
    font-size: 11px;
    color: var(--text-felt-dim);
    flex-shrink: 0;
  }

  .status-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn-action {
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid rgba(255,255,255,0.2);
    color: var(--text-felt);
    background: rgba(255,255,255,0.1);
    transition: background 150ms ease, transform 120ms ease;
  }

  .btn-action:hover {
    background: rgba(255,255,255,0.18);
    transform: translateY(-1px);
  }

  .btn-new {
    background: linear-gradient(180deg, #6aad36, #4e8a22);
    border-color: rgba(180,255,120,0.4);
    color: #f0ffe0;
  }

  /* ── Opponent Row ── */
  .opponent-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .opp-zone {
    border-radius: 14px;
    padding: 10px 12px;
    background: rgba(0,0,0,0.18);
    border: 2px solid transparent;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    transition: border-color 300ms ease, box-shadow 300ms ease;
  }

  .opp-zone.active-turn {
    border-color: rgba(255,215,0,0.5);
    box-shadow: 0 0 20px rgba(255,215,0,0.15);
    animation: turn-glow 2s ease-in-out infinite;
  }

  @keyframes turn-glow {
    0%, 100% { box-shadow: 0 0 16px rgba(255,215,0,0.12); }
    50% { box-shadow: 0 0 28px rgba(255,215,0,0.22); }
  }

  .opp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .opp-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .opp-name {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-felt);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .go-pill {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 800;
    color: #1a0800;
    background: linear-gradient(180deg, #ffc107, #e6a800);
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    flex-shrink: 0;
  }

  .opp-score-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.2);
    font-size: 14px;
    font-weight: 800;
    color: var(--gold);
    flex-shrink: 0;
  }

  /* Speech bubble */
  .speech-bubble {
    position: relative;
    border-radius: 10px;
    padding: 6px 10px;
    background: rgba(255,255,255,0.1);
    color: var(--text-felt);
    font-size: 11px;
    line-height: 1.45;
    border: 1px solid rgba(255,255,255,0.08);
  }

  .speech-bubble::before {
    content: '';
    position: absolute;
    top: -5px;
    left: 14px;
    width: 10px;
    height: 10px;
    background: inherit;
    border-left: 1px solid rgba(255,255,255,0.08);
    border-top: 1px solid rgba(255,255,255,0.08);
    transform: rotate(45deg);
  }

  .speech-bubble.thinking {
    background: rgba(100,200,60,0.2);
    border-color: rgba(100,200,60,0.3);
  }

  /* Opponent hand (face-down cards) */
  .opp-hand {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .card-back {
    border-radius: var(--card-r);
    border: 1.5px solid #8b1a1f;
    background:
      repeating-conic-gradient(
        from 45deg,
        rgba(255,220,100,0.12) 0deg 90deg,
        transparent 90deg 180deg
      ) center / 12px 12px,
      linear-gradient(160deg, #c62828, #8b1a1f);
    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    position: relative;
    overflow: hidden;
  }

  .card-back::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 3px;
    border: 1px solid rgba(255,200,50,0.35);
    pointer-events: none;
  }

  .card-sm {
    width: 28px;
    height: 40px;
  }

  .card-deck {
    width: var(--card-w);
    height: var(--card-h);
  }

  .deck-pattern {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 50%, rgba(255,215,0,0.15) 20%, transparent 60%);
  }

  /* ── Capture Groups ── */
  .capture-groups {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 22px;
  }

  .cap-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .cap-kind-tag {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 1px 5px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
  }

  .cap-bright { background: rgba(255,213,79,0.3); color: #ffd54f; }
  .cap-animal { background: rgba(239,83,80,0.25); color: #ef9a9a; }
  .cap-ribbon { background: rgba(66,165,245,0.25); color: #90caf9; }
  .cap-pi { background: rgba(102,187,106,0.25); color: #a5d6a7; }

  .mini-card {
    width: 20px;
    height: 28px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    border: 1px solid rgba(0,0,0,0.15);
    background: var(--cream);
    box-shadow: 0 1px 2px rgba(0,0,0,0.12);
    overflow: hidden;
  }

  .mini-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 2px;
  }

  .mc-bright { border-color: rgba(255,179,0,0.5); background: linear-gradient(180deg, #fffde7, #fff8e1); }
  .mc-animal { border-color: rgba(211,47,47,0.35); background: linear-gradient(180deg, #fff5f5, #ffebee); }
  .mc-ribbon { border-color: rgba(30,136,229,0.35); background: linear-gradient(180deg, #f0f7ff, #e3f2fd); }
  .mc-pi { border-color: rgba(56,142,60,0.35); background: linear-gradient(180deg, #f5fff5, #e8f5e9); }

  .cap-more {
    font-size: 9px;
    font-weight: 700;
    color: var(--text-felt-dim);
    margin-left: 2px;
  }

  .empty-cap {
    font-size: 11px;
    color: var(--text-felt-dim);
  }

  /* ── Field Area ── */
  .field-area {
    border-radius: 16px;
    background:
      radial-gradient(ellipse at 50% 30%, rgba(100,200,100,0.15), transparent 70%),
      rgba(0,0,0,0.1);
    border: 1px solid rgba(255,255,255,0.08);
    padding: 14px;
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .deck-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .deck-count {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-felt);
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }

  .field-cards {
    flex: 1;
    min-width: 0;
  }

  .field-hint {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    color: #ffe082;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--card-w), 1fr));
    gap: 6px;
  }

  /* ═══════════════════════════════════════════════
     HWATU CARD (CSS rendered)
     ═══════════════════════════════════════════════ */
  .hwatu-card {
    aspect-ratio: 5 / 7;
    width: 100%;
    max-width: 72px;
    border-radius: var(--card-r);
    border: 2px solid #b0b0b0;
    background: var(--cream);
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    overflow: hidden;
    box-shadow: var(--card-shadow);
    position: relative;
    transition: transform 150ms ease, box-shadow 150ms ease;
  }

  .hwatu-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: calc(var(--card-r) - 2px);
  }

  /* Kind-specific card borders */
  .fc-bright, .hc-bright { border-color: #e6a800; }
  .fc-animal, .hc-animal { border-color: #d32f2f; }
  .fc-ribbon, .hc-ribbon { border-color: #1976d2; }
  .fc-pi, .hc-pi { border-color: #388e3c; }

  /* Card face (CSS rendering) */
  .card-face {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: 2px;
    position: relative;
  }

  .cf-bright { background: linear-gradient(170deg, #fffde7, #fff9c4, #fff3e0); }
  .cf-animal { background: linear-gradient(170deg, #fff5f5, #ffebee, #fce4ec); }
  .cf-ribbon { background: linear-gradient(170deg, #f0f7ff, #e3f2fd, #e8eaf6); }
  .cf-pi { background: linear-gradient(170deg, #f5fff5, #e8f5e9, #f1f8e9); }

  .card-strip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 9px;
    line-height: 16px;
    height: 16px;
  }

  .strip-bright {
    background: linear-gradient(90deg, #ffd54f, #ffca28, #ffd54f);
    color: #5d4037;
  }

  .strip-animal {
    background: linear-gradient(90deg, #ef5350, #e53935, #ef5350);
    color: #fff;
  }

  .strip-ribbon {
    background: linear-gradient(90deg, #42a5f5, #1e88e5, #42a5f5);
    color: #fff;
  }

  .strip-pi {
    background: linear-gradient(90deg, #66bb6a, #43a047, #66bb6a);
    color: #fff;
  }

  .card-emoji {
    font-size: 22px;
    line-height: 1;
    margin-top: 4px;
    filter: drop-shadow(0 1px 1px rgba(0,0,0,0.1));
  }

  .card-month {
    font-size: 11px;
    font-weight: 900;
    color: #333;
    line-height: 1;
    margin-top: 1px;
  }

  /* Interactive card states */
  button.hwatu-card {
    cursor: pointer;
  }

  button.hwatu-card.playable:hover {
    transform: translateY(-5px) scale(1.03);
    box-shadow: 0 8px 20px rgba(0,0,0,0.3);
    z-index: 2;
  }

  button.hwatu-card:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  button.hwatu-card:disabled.match-glow {
    opacity: 1;
    cursor: pointer;
  }

  .match-glow {
    border-color: var(--gold) !important;
    box-shadow:
      0 0 0 2px rgba(255,213,79,0.7),
      0 0 16px rgba(255,213,79,0.4) !important;
    transform: scale(1.05);
    animation: match-pulse 1.2s ease-in-out infinite;
  }

  @keyframes match-pulse {
    0%, 100% { box-shadow: 0 0 0 2px rgba(255,213,79,0.7), 0 0 12px rgba(255,213,79,0.3); }
    50% { box-shadow: 0 0 0 3px rgba(255,213,79,0.9), 0 0 22px rgba(255,213,79,0.5); }
  }

  /* ── Go/Stop Modal ── */
  .go-stop-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.6);
    border-radius: 20px;
    animation: overlay-in 250ms ease-out;
  }

  @keyframes overlay-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .go-stop-modal {
    background: linear-gradient(160deg, #1b5e20, #0d3311);
    border: 2px solid var(--gold);
    border-radius: 18px;
    padding: 28px 40px;
    text-align: center;
    box-shadow: 0 16px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1);
    min-width: 300px;
    animation: modal-in 300ms ease-out;
  }

  @keyframes modal-in {
    from { transform: scale(0.85) translateY(-20px); opacity: 0; }
    to { transform: scale(1) translateY(0); opacity: 1; }
  }

  .go-stop-title {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 900;
    color: var(--gold);
    text-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }

  .go-stop-desc {
    margin: 0 0 12px;
    font-size: 13px;
    color: rgba(232,245,224,0.85);
  }

  .go-stop-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-bottom: 20px;
  }

  .go-stop-score {
    font-size: 16px;
    font-weight: 800;
    color: var(--gold);
  }

  .go-stop-gocount {
    font-size: 14px;
    font-weight: 700;
    color: rgba(255,213,79,0.7);
  }

  .go-stop-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .go-btn,
  .stop-btn {
    border-radius: 12px;
    padding: 14px 24px;
    font-size: 18px;
    font-weight: 900;
    cursor: pointer;
    border: 2px solid transparent;
    transition: transform 150ms ease, filter 150ms ease, box-shadow 150ms ease;
    min-height: 52px;
  }

  .go-btn {
    background: linear-gradient(180deg, #ffa726, #ef6c00);
    color: #1a0800;
    border-color: rgba(255,200,80,0.6);
    box-shadow: 0 4px 15px rgba(239,108,0,0.3);
  }

  .go-btn:hover {
    transform: translateY(-2px) scale(1.03);
    filter: brightness(1.1);
    box-shadow: 0 6px 22px rgba(239,108,0,0.45);
  }

  .stop-btn {
    background: linear-gradient(180deg, #66bb6a, #2e7d32);
    color: #0a1f0c;
    border-color: rgba(160,255,170,0.5);
    box-shadow: 0 4px 15px rgba(46,125,50,0.3);
  }

  .stop-btn:hover {
    transform: translateY(-2px) scale(1.03);
    filter: brightness(1.1);
    box-shadow: 0 6px 22px rgba(46,125,50,0.45);
  }

  /* ── Human Zone ── */
  .human-zone {
    border-radius: 14px;
    padding: 12px;
    background: rgba(0,0,0,0.15);
    border: 2px solid transparent;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 300ms ease, box-shadow 300ms ease;
  }

  .human-zone.active-turn {
    border-color: rgba(255,215,0,0.5);
    box-shadow: 0 0 20px rgba(255,215,0,0.15);
    animation: turn-glow 2s ease-in-out infinite;
  }

  .human-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .human-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .human-name {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-felt);
  }

  .human-score-area {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .human-total {
    font-size: 26px;
    font-weight: 900;
    line-height: 1;
    color: var(--gold);
    text-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }

  .human-kind-row {
    display: flex;
    gap: 6px;
  }

  .hk {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    background: rgba(255,255,255,0.1);
    color: var(--text-felt);
  }

  .hk-bright { color: #ffd54f; }
  .hk-animal { color: #ef9a9a; }
  .hk-ribbon { color: #90caf9; }
  .hk-pi { color: #a5d6a7; }

  .human-captures {
    padding: 6px 0;
    border-top: 1px solid rgba(255,255,255,0.08);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .hand-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--card-w), 1fr));
    gap: 6px;
  }

  /* ── Action Log ── */
  .action-log {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 10px;
    background: rgba(0,0,0,0.2);
    border: 1px solid rgba(255,255,255,0.06);
    min-height: 28px;
    align-items: center;
  }

  .log-entry {
    font-size: 11px;
    color: var(--text-felt-dim);
    line-height: 1.4;
  }

  .log-entry:not(:last-child)::after {
    content: ' \00b7 ';
    color: rgba(255,255,255,0.2);
  }

  .log-empty {
    font-style: italic;
  }

  /* ═══════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════ */
  @media (max-width: 900px) {
    .preset-grid {
      grid-template-columns: 1fr;
    }

    .opponent-row {
      grid-template-columns: 1fr;
    }

    .field-area {
      flex-direction: column;
      align-items: stretch;
    }

    .deck-stack {
      flex-direction: row;
      gap: 10px;
      align-items: center;
    }

    .board {
      --card-w: 54px;
      --card-h: 76px;
    }
  }

  @media (max-width: 600px) {
    .felt-table {
      padding: 10px;
      border-radius: 14px;
      border-width: 3px;
    }

    .status-bar {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

    .status-actions {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .btn-action {
      width: 100%;
      text-align: center;
    }

    .hand-grid {
      grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    }

    .field-grid {
      grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    }

    .go-stop-modal {
      min-width: auto;
      margin: 12px;
      padding: 20px;
    }

    .go-stop-title {
      font-size: 20px;
    }

    .go-btn,
    .stop-btn {
      padding: 12px 16px;
      font-size: 16px;
      min-height: 46px;
    }

    .human-score-area {
      flex-direction: column;
      gap: 4px;
      align-items: flex-end;
    }

    .human-kind-row {
      flex-wrap: wrap;
      gap: 4px;
    }

    .board {
      --card-w: 48px;
      --card-h: 67px;
    }
  }
</style>
