<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { locale } from '$lib/i18n';
  import { jt } from './i18n';
  import { store, getActiveClient } from '$lib/gateway/store.svelte';
  import TokenBarChart from '$lib/components/TokenBarChart.svelte';
  import { RotateCcw, Bot, Cpu, Zap, MessageSquare, Radio } from '@lucide/svelte';
  import { JanggiBoard3D } from './board3d';
  import { defaultJanggiRuleSet } from './rules';
  import {
    createInitialBoard,
    legalMoves,
    legalMovesForSquare,
    applyMove,
    winner,
    type BoardMap,
  } from './engine';
  import { buildJanggiPrompt } from './prompt';
  import { parseAgentMove } from './parser';
  import { clearJanggiState, loadJanggiState, saveJanggiState } from './state';

  const restored = loadJanggiState();
  let board = $state<BoardMap>((restored?.board as BoardMap | undefined) ?? createInitialBoard(defaultJanggiRuleSet.startingSetup));
  let turn = $state<'w' | 'b'>(restored?.turn ?? 'w');
  let moveList = $state<string[]>(restored?.moveList ?? []);
  let aiThinking = $state(false);
  let aiComment = $state(restored?.aiComment ?? '');
  let tokensUsed = $state(restored?.tokensUsed ?? 0);
  let tokenHistory = $state<number[]>(restored?.tokenHistory ?? []);
  let useAgent = $state(restored?.useAgent ?? true);
  let lastFrom = $state<string | null>(restored?.lastFrom ?? null);
  let lastTo = $state<string | null>(restored?.lastTo ?? null);
  let selectedSquare = $state<string | null>(null);
  let legalTargets = $state<string[]>([]);
  let currentSessionKey = $state('');
  let rev = $state(0);

  let board3d: JanggiBoard3D | null = null;
  let container: HTMLDivElement;


  const winnerColor = $derived.by(() => { void rev; return winner(board); });
  const isOver = $derived.by(() => { void rev; return winnerColor !== null; });
  const isWin = $derived.by(() => { void rev; return winnerColor === 'w'; });
  const isLose = $derived.by(() => { void rev; return winnerColor === 'b'; });

  const statusText = $derived.by(() => {
    void rev;
    const t = $jt;
    if (winnerColor === 'w') return t('win');
    if (winnerColor === 'b') return t('lose');
    if (aiThinking) return t('ai_thinking');
    return turn === 'w' ? t('your_turn') : t('ai_turn');
  });

  function syncBoard() {
    rev++;
    if (!board3d) return;
    board3d.syncPieces(board, { from: lastFrom, to: lastTo });
    board3d.setHighlights({ selected: selectedSquare, legal: legalTargets, lastFrom, lastTo });
  }

  function handleSquareClick(sq: string) {
    if (isOver || aiThinking || turn !== 'w') return;

    if (selectedSquare && legalTargets.includes(sq)) {
      move(selectedSquare, sq);
      return;
    }

    const p = board[sq];
    if (p && p.color === 'w') {
      selectedSquare = sq;
      legalTargets = legalMovesForSquare(board, sq, defaultJanggiRuleSet).map((m) => m.to);
    } else {
      selectedSquare = null;
      legalTargets = [];
    }
    syncBoard();
  }

  function move(from: string, to: string) {
    board = applyMove(board, { from, to, capture: !!board[to] });
    lastFrom = from;
    lastTo = to;
    moveList = [...moveList, `${from}-${to}`];
    selectedSquare = null;
    legalTargets = [];
    turn = turn === 'w' ? 'b' : 'w';
    syncBoard();

    if (!winner(board) && turn === 'b') requestAiMove();
  }

  function playRandomMove(messageKey?: string) {
    const moves = legalMoves(board, 'b', defaultJanggiRuleSet);
    if (!moves.length) {
      aiComment = $jt('no_legal');
      return;
    }

    const pick = moves[Math.floor(Math.random() * moves.length)];
    board = applyMove(board, pick);
    lastFrom = pick.from;
    lastTo = pick.to;
    moveList = [...moveList, `${pick.from}-${pick.to}`];
    turn = 'w';

    if (messageKey) aiComment = $jt(messageKey);
  }

  async function requestAiMove() {
    aiThinking = true;
    aiComment = '';
    syncBoard();

    const client = getActiveClient();
    const connected = client && store.activeGatewayId;
    const legal = legalMoves(board, 'b', defaultJanggiRuleSet);

    if (!useAgent || !connected) {
      await new Promise((r) => setTimeout(r, 600));
      playRandomMove('no_gateway');
      aiThinking = false;
      syncBoard();
      return;
    }

    if (!legal.length) {
      aiComment = $jt('no_legal');
      aiThinking = false;
      syncBoard();
      return;
    }

    try {
      const sessKey = `janggi-${crypto.randomUUID().slice(0, 8)}`;
      currentSessionKey = sessKey;
      const prompt = buildJanggiPrompt({ board, turn: 'b', legal, locale: $locale });

      await client.sendChat({
        sessionKey: sessKey,
        message: prompt,
        idempotencyKey: crypto.randomUUID(),
        deliver: false,
      });

      let response = '';
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 900));
        try {
          const hist = await client.getChatHistory(sessKey);
          const assist = hist.find((m: any) => m.role === 'assistant');
          if (assist?.content) {
            response = assist.content;
            break;
          }
        } catch {
          // keep polling
        }
      }

      if (!response) {
        playRandomMove('ai_timeout');
      } else {
        const parsed = parseAgentMove(response, legal);
        if (!parsed) {
          playRandomMove('parse_fail');
        } else {
          board = applyMove(board, parsed);
          lastFrom = parsed.from;
          lastTo = parsed.to;
          moveList = [...moveList, `${parsed.from}-${parsed.to}`];
          turn = 'w';

          const turnTokens = Math.round(response.length * 1.3);
          tokensUsed += turnTokens;
          tokenHistory = [...tokenHistory, turnTokens];

          aiComment = response
            .replace(/^[\s\S]*?([a-i](?:10|[1-9])\s*-?\s*[a-i](?:10|[1-9]))/i, '$1')
            .slice(0, 280);
        }
      }
    } catch (e) {
      console.error('Janggi AI error:', e);
      playRandomMove('ai_error');
    }

    aiThinking = false;
    syncBoard();
  }

  function newGame() {
    board = createInitialBoard(defaultJanggiRuleSet.startingSetup);
    turn = 'w';
    moveList = [];
    aiThinking = false;
    aiComment = '';
    tokensUsed = 0;
    tokenHistory = [];
    lastFrom = null;
    lastTo = null;
    selectedSquare = null;
    legalTargets = [];
    clearJanggiState();
    syncBoard();
  }

  onMount(() => {
    board3d = new JanggiBoard3D(container);
    board3d.onSquareClick = handleSquareClick;
    syncBoard();
  });

  onDestroy(() => {
    if (!winner(board)) {
      saveJanggiState({ board, turn, moveList, tokensUsed, tokenHistory, useAgent, aiComment, lastFrom, lastTo });
    } else {
      clearJanggiState();
    }
    board3d?.dispose();
  });
</script>

<div class="janggi-3d">
  <div class="viewport" bind:this={container}></div>

  <div class="panel">
    <div class="panel-section mode-section">
      <span class="section-label">{$jt('mode')}</span>
      <div class="mode-toggle">
        <button class="mode-btn" class:active={useAgent} onclick={() => (useAgent = true)} disabled={aiThinking}>
          <Bot size={13} />
          {$jt('agent')}
        </button>
        <button class="mode-btn" class:active={!useAgent} onclick={() => (useAgent = false)} disabled={aiThinking}>
          <Cpu size={13} />
          {$jt('offline')}
        </button>
      </div>
    </div>

    <div class="status-bar" class:thinking={aiThinking} class:win={isWin} class:lose={isLose}>
      {statusText}
    </div>

    {#if aiComment}
      <div class="ai-comment">
        <MessageSquare size={13} />
        <p>{aiComment}</p>
      </div>
    {/if}

    <div class="panel-section moves-section">
      <span class="section-label">{$jt('moves')}</span>
      <div class="move-list">
        {#if moveList.length === 0}
          <span class="move-empty">—</span>
        {:else}
          {#each moveList as m, i}
            <span class="move-pair">
              <span class="move-num">{i + 1}.</span>
              <span class="move-san">{m}</span>
            </span>
          {/each}
        {/if}
      </div>
    </div>

    {#if tokenHistory.length > 0}
      <div class="panel-section token-section">
        <span class="section-label">{$jt('token_graph')}</span>
        <div class="token-chart-wrap">
          <TokenBarChart data={tokenHistory} />
        </div>
        <div class="token-total">
          <Zap size={11} />
          <span>{$jt('total')}: ~{tokensUsed.toLocaleString()} {$jt('tokens_wasted')}</span>
        </div>
      </div>
    {/if}

    <div class="panel-controls">
      <button class="action-btn" onclick={newGame} disabled={aiThinking}>
        <RotateCcw size={14} />
        {$jt('new_game')}
      </button>
    </div>

    <div class="session-info">
      <Radio size={11} />
      <span class="session-label">{$jt('session')}:</span>
      <span class="session-value" class:connected={!!store.activeGatewayId}>
        {#if currentSessionKey}
          {currentSessionKey}
        {:else}
          {$jt('no_session')}
        {/if}
      </span>
    </div>
  </div>
</div>

<style>
  .janggi-3d {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 520px;
    gap: 16px;
  }

  .viewport {
    flex: 1;
    min-width: 0;
    border-radius: 12px;
    overflow: hidden;
    background: #0f0f1a;
  }

  .panel {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    overflow-y: auto;
  }

  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
  }

  .mode-toggle {
    display: flex;
    gap: 4px;
    background: var(--color-surface-elevated);
    border-radius: 8px;
    padding: 3px;
  }

  .mode-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px 10px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .mode-btn.active {
    background: var(--color-primary);
    color: white;
  }

  .mode-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--color-surface-elevated);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }

  .status-bar.thinking { color: var(--color-text-muted); }
  .status-bar.win { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
  .status-bar.lose { background: rgba(239, 68, 68, 0.12); color: #ef4444; }

  .ai-comment {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(99, 102, 241, 0.06);
    border: 1px solid rgba(99, 102, 241, 0.12);
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.5;
    align-items: flex-start;
  }

  .ai-comment p {
    margin: 0;
    flex: 1;
  }

  .moves-section {
    flex: 1;
    min-height: 0;
  }

  .move-list {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    font-size: 12px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow-y: auto;
    max-height: 170px;
    padding: 8px;
    background: var(--color-surface-elevated);
    border-radius: 8px;
  }

  .move-empty { color: var(--color-text-subtle); }
  .move-pair { display: inline-flex; gap: 4px; white-space: nowrap; }
  .move-num { color: var(--color-text-subtle); min-width: 20px; }

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
    font-weight: 600;
  }

  .panel-controls {
    display: flex;
    justify-content: flex-end;
    padding-top: 4px;
    border-top: 1px solid var(--color-border);
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
    color: var(--color-text);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .action-btn:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .action-btn:disabled { opacity: 0.5; cursor: default; }

  .session-info {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--color-surface-elevated);
    font-size: 10px;
    color: var(--color-text-subtle);
    overflow: hidden;
  }

  .session-value {
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-value.connected { color: #22c55e; }

  @media (max-width: 768px) {
    .janggi-3d { flex-direction: column; }
    .viewport { min-height: 420px; }
    .panel { width: 100%; }
  }
</style>
