<script lang="ts">
  import { onDestroy } from 'svelte';
  import { locale } from '$lib/i18n';
  import { store, getClientById } from '$lib/gateway/store.svelte';
  import { kt } from './i18n';
  import {
    applyAction,
    buildAgentPrompt,
    cardLabel,
    chooseProgramAction,
    createNewGame,
    getCurrentPlayer,
    getPlayerById,
    legalActions,
    parseAgentAction,
    phaseLabel,
    scoreBoard,
    type ActionKind,
    type PokerCard,
    type PlayerId,
    type PlayerRole,
    type PlayerSetup,
    type PokerState,
  } from './engine';
  import { clearTexasPokerState, loadTexasPokerState, saveTexasPokerState } from './state';

  type StartPreset =
    | 'program-agent-human'
    | 'program-program-human'
    | 'agent-agent-human';

  function isValidTexasPokerState(value: unknown): value is PokerState {
    const v = value as Partial<PokerState> | null;
    return Boolean(
      v &&
      Array.isArray(v.players) &&
      Array.isArray(v.deck) &&
      Array.isArray(v.community) &&
      typeof v.turnIndex === 'number' &&
      typeof v.handNumber === 'number',
    );
  }

  function emptySpeechMap(): Record<PlayerId, string> {
    return { left: '', right: '', human: '' };
  }

  function inferPresetFromGame(state: PokerState): StartPreset {
    const left = getPlayerById(state, 'left').role;
    const right = getPlayerById(state, 'right').role;
    if (left === 'agent' && right === 'agent') return 'agent-agent-human';
    if (left === 'program' && right === 'agent') return 'program-agent-human';
    return 'program-program-human';
  }

  const restored = loadTexasPokerState();
  let game = $state<PokerState | null>(isValidTexasPokerState(restored) ? restored : null);
  let preset = $state<StartPreset>(game ? inferPresetFromGame(game) : 'program-program-human');
  let thinkingPlayerId = $state<PlayerId | null>(null);
  let speechMap = $state<Record<PlayerId, string>>(emptySpeechMap());

  let aiLoopRunning = false;

  const connectedGateways = $derived(
    store.gateways.filter((gateway) => store.gatewayStates.get(gateway.id)?.status === 'connected'),
  );
  const connectedGatewayIds = $derived(connectedGateways.map((gateway) => gateway.id));
  const canProgramAgent = $derived(connectedGatewayIds.length >= 1);
  const canAgentAgent = $derived(connectedGatewayIds.length >= 2);

  const currentPlayer = $derived(game ? getCurrentPlayer(game) : null);
  const humanPlayer = $derived(game ? getPlayerById(game, 'human') : null);
  const chipBoard = $derived(game ? scoreBoard(game) : null);
  const humanActions = $derived(
    game && currentPlayer?.id === 'human' ? legalActions(game, 'human') : [],
  );
  const statusText = $derived.by(() => {
    if (!game) return $kt('status_waiting_setup');
    if (game.phase === 'done') return $kt('status_done');
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

  function seedSpeechMap(current: PokerState): void {
    const next = emptySpeechMap();
    for (const player of current.players) {
      if (player.role === 'agent') next[player.id] = $kt('speech_agent');
      else if (player.role === 'program') next[player.id] = $kt('speech_program');
      else next[player.id] = '';
    }
    speechMap = next;
  }

  function startGame(nextPreset: StartPreset): void {
    const players = buildPresetPlayers(nextPreset);
    if (!players) return;

    preset = nextPreset;
    game = createNewGame(players, 1);
    thinkingPlayerId = null;
    seedSpeechMap(game);
    clearTexasPokerState();
  }

  function newHand(): void {
    const players = buildPresetPlayers(preset);
    if (!players || !game) return;
    game = createNewGame(players, game.handNumber + 1);
    thinkingPlayerId = null;
    seedSpeechMap(game);
  }

  function backToSetup(): void {
    game = null;
    thinkingPlayerId = null;
    speechMap = emptySpeechMap();
    clearTexasPokerState();
  }

  function showCard(card: PokerCard | undefined): string {
    if (!card) return '--';
    return cardLabel(card);
  }

  function hiddenCard(): string {
    return '🂠';
  }

  function canHumanAct(action: ActionKind): boolean {
    return Boolean(
      game &&
      currentPlayer?.id === 'human' &&
      !thinkingPlayerId &&
      humanActions.includes(action),
    );
  }

  function onHumanAction(action: ActionKind): void {
    if (!game || !canHumanAct(action)) return;
    game = applyAction(game, 'human', action);
  }

  async function requestAgentAction(
    snapshot: PokerState,
    actorId: PlayerId,
    legal: ActionKind[],
  ): Promise<ActionKind | null> {
    if (!legal.length) return null;
    const actor = getPlayerById(snapshot, actorId);
    if (!actor.gatewayId) return null;

    const client = getClientById(actor.gatewayId);
    if (!client) return null;

    try {
      const prompt = buildAgentPrompt(snapshot, actorId, $locale);
      const sessKey = `texaspoker-${actorId}-${crypto.randomUUID().slice(0, 8)}`;
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
            return parseAgentAction(content, legal);
          }
        } catch {
          // keep polling
        }
      }
    } catch {
      // fallback to program action
    }

    return null;
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
        if (!legal.length) {
          game = applyAction(snapshot, actor.id, 'fold');
          continue;
        }

        thinkingPlayerId = actor.id;
        await wait(actor.role === 'agent' ? 700 : 420);

        let action: ActionKind | null = null;
        if (actor.role === 'agent') {
          action = await requestAgentAction(snapshot, actor.id, legal);
        }
        if (!action) {
          action = chooseProgramAction(snapshot, actor.id);
        }
        if (!legal.includes(action)) {
          action = legal.includes('check')
            ? 'check'
            : legal.includes('call')
              ? 'call'
              : legal.includes('fold')
                ? 'fold'
                : legal[0];
        }

        game = applyAction(snapshot, actor.id, action);
        speechMap = {
          ...speechMap,
          [actor.id]: `${$kt('speech_action')} ${action}.`,
        };
        thinkingPlayerId = null;
      }
    } finally {
      thinkingPlayerId = null;
      aiLoopRunning = false;
    }
  }

  $effect(() => {
    if (!game || game.phase === 'done') return;
    const actor = getCurrentPlayer(game);
    if (actor.role !== 'human' && !aiLoopRunning) {
      void driveAiTurns();
    }
  });

  if (game) seedSpeechMap(game);

  onDestroy(() => {
    if (game && game.phase !== 'done') saveTexasPokerState(game);
    else clearTexasPokerState();
  });
</script>

{#if !game}
  <div class="setup panel">
    <h3>{$kt('setup_title')}</h3>
    <p>{$kt('setup_desc')}</p>
    <p class="connection">{$kt('setup_connected')}: {connectedGatewayIds.length}</p>

    <div class="preset-grid">
      <button type="button" class="preset" onclick={() => startGame('program-program-human')}>
        <b>{$kt('mode_program_program_human')}</b>
      </button>

      <button
        type="button"
        class="preset"
        onclick={() => startGame('program-agent-human')}
        disabled={!canProgramAgent}
      >
        <b>{$kt('mode_program_agent_human')}</b>
        {#if !canProgramAgent}
          <small>{$kt('mode_need_gateway')}</small>
        {/if}
      </button>

      <button
        type="button"
        class="preset"
        onclick={() => startGame('agent-agent-human')}
        disabled={!canAgentAgent}
      >
        <b>{$kt('mode_agent_agent_human')}</b>
        {#if !canAgentAgent}
          <small>{$kt('mode_need_two_gateways')}</small>
        {/if}
      </button>
    </div>
  </div>
{:else}
  <div class="board">
    <div class="topbar panel">
      <div class="status-group">
        <h3>{statusText}</h3>
        <p>
          {$kt('phase')}: {phaseLabel(game.phase, $locale)} ·
          {$kt('pot')}: {game.pot} ·
          {$kt('current_bet')}: {game.currentBet}
        </p>
      </div>
      <div class="actions">
        <button class="reset-btn" type="button" onclick={newHand}>{$kt('new_hand')}</button>
        <button class="mode-btn" type="button" onclick={backToSetup}>{$kt('change_mode')}</button>
      </div>
    </div>

    <div class="layout">
      <div class="main-column">
        <section class="panel table-panel">
          <div class="panel-title">
            <h4>{$kt('board')}</h4>
            <span>Hand #{game.handNumber}</span>
          </div>
          <div class="board-cards">
            {#if game.community.length === 0}
              <div class="empty-board">- - - - -</div>
            {:else}
              {#each game.community as card (card.id)}
                <div class="table-card">{cardLabel(card)}</div>
              {/each}
            {/if}
          </div>
        </section>

        {#each game.players.filter((player) => player.id !== 'human') as player (player.id)}
          <section class="panel player-panel">
            <div class="panel-title">
              <h4>{player.name}</h4>
              <span>{roleLabel(player.role)} · {$kt('chips')}: {chipBoard ? chipBoard[player.id] : player.chips}</span>
            </div>
            <p class="speech" class:thinking={thinkingPlayerId === player.id}>{speechMap[player.id]}</p>
            <div class="hole-cards">
              <div class="hole">{game.phase === 'done' ? showCard(player.hole[0]) : hiddenCard()}</div>
              <div class="hole">{game.phase === 'done' ? showCard(player.hole[1]) : hiddenCard()}</div>
            </div>
            <p class="bet-info">
              bet {player.bet} {#if player.folded}(folded){/if}
            </p>
          </section>
        {/each}

        {#if humanPlayer}
          <section class="panel player-panel human">
            <div class="panel-title">
              <h4>{humanPlayer.name}</h4>
              <span>{$kt('chips')}: {humanPlayer.chips}</span>
            </div>
            <div class="hole-cards">
              <div class="hole">{showCard(humanPlayer.hole[0])}</div>
              <div class="hole">{showCard(humanPlayer.hole[1])}</div>
            </div>
            <p class="bet-info">
              bet {humanPlayer.bet} · {$kt('to_call')}: {Math.max(0, game.currentBet - humanPlayer.bet)}
            </p>
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
          </section>
        {/if}
      </div>

      <aside class="side-column">
        <section class="panel chips-panel">
          <h4>{$kt('chips')}</h4>
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
              <li class="empty-text">{$kt('no_log')}</li>
            {:else}
              {#each game.log as entry, idx (`${entry}-${idx}`)}
                <li>{entry}</li>
              {/each}
            {/if}
          </ul>
        </section>
      </aside>
    </div>
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
    max-width: 860px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .setup h3 {
    margin: 0;
    font-size: 16px;
    color: var(--color-text);
  }

  .setup p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .connection {
    color: var(--color-primary);
    font-weight: 600;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .preset {
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-surface-elevated);
    color: var(--color-text);
    min-height: 96px;
    text-align: left;
    padding: 12px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .preset b {
    font-size: 13px;
    line-height: 1.4;
  }

  .preset small {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .preset:hover:not(:disabled) {
    border-color: var(--color-primary);
  }

  .preset:disabled {
    opacity: 0.55;
    cursor: not-allowed;
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

  .reset-btn,
  .mode-btn {
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
    color: var(--color-text);
  }

  .reset-btn {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 12%, transparent);
  }

  .reset-btn:hover,
  .mode-btn:hover {
    border-color: var(--color-primary);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 12px;
  }

  .main-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .side-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .panel-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    gap: 8px;
  }

  .panel-title h4 {
    margin: 0;
    font-size: 13px;
    color: var(--color-text);
  }

  .panel-title span {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .table-panel .board-cards {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .table-card,
  .hole {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-elevated);
    min-width: 56px;
    height: 76px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    color: var(--color-text);
  }

  .empty-board {
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .player-panel .hole-cards {
    display: flex;
    gap: 8px;
  }

  .speech {
    margin: 0 0 10px;
    border-radius: 8px;
    padding: 10px;
    background: var(--color-surface-elevated);
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .speech.thinking {
    border: 1px solid color-mix(in oklab, var(--color-primary) 50%, transparent);
    color: var(--color-primary);
  }

  .bet-info {
    margin: 8px 0 0;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .human .action-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
  }

  .human .action-row button {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-elevated);
    color: var(--color-text);
    font-size: 12px;
    font-weight: 600;
    padding: 8px 6px;
    cursor: pointer;
  }

  .human .action-row button:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .human .action-row button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .chips-panel h4 {
    margin: 0 0 8px;
    font-size: 13px;
  }

  .chips-panel ul,
  .log-panel ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .chips-panel li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 8px;
    font-size: 12px;
    background: var(--color-surface-elevated);
    margin-bottom: 6px;
  }

  .log-panel h4 {
    margin: 0 0 8px;
    font-size: 13px;
  }

  .log-panel ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 360px;
    overflow: auto;
  }

  .log-panel li {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 8px;
    font-size: 12px;
    color: var(--color-text-muted);
    line-height: 1.4;
    background: var(--color-surface-elevated);
  }

  .empty-text {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  @media (max-width: 1100px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 920px) {
    .preset-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .actions {
      flex-direction: column;
    }

    .human .action-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
