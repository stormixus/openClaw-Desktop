<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chess } from 'chess.js';
  import { ChessBoard3D } from './board3d';
  import { buildChessPrompt, parseLlmMove, type Difficulty } from './engine';
  import { ct } from './i18n';
  import { locale } from '$lib/i18n';
  import { store, getActiveClient } from '$lib/gateway/store.svelte';
  import { saveChessState, loadChessState, clearChessState } from './state';
  import { RotateCcw, Bot, Cpu, Zap, MessageSquare, Radio } from '@lucide/svelte';
  import { LineChart } from 'layerchart';

  // ===== Game State (restore from persisted if available) =====
  const restored = loadChessState();
  let game = restored ? new Chess(restored.fen) : new Chess();
  let board3d: ChessBoard3D | null = null;
  let container: HTMLDivElement;

  let selectedSquare = $state<string | null>(null);
  let legalMoves = $state<string[]>([]);
  let aiThinking = $state(false);
  let aiComment = $state(restored?.aiComment ?? '');
  let tokensUsed = $state(restored?.tokensUsed ?? 0);
  let tokenHistory = $state<number[]>(restored?.tokenHistory ?? []);
  let useAgent = $state(restored?.useAgent ?? true);
  let difficulty = $state<Difficulty>((restored?.difficulty as Difficulty) ?? 'normal');
  let lastFrom = $state<string | null>(restored?.lastFrom ?? null);
  let lastTo = $state<string | null>(restored?.lastTo ?? null);
  let moveList = $state<string[]>(restored?.moveList ?? []);
  let currentSessionKey = $state('');
  let rev = $state(0); // revision counter to trigger derived re-evaluations

  // ===== Derived =====
  const statusText = $derived.by(() => {
    void rev;
    const t = $ct;
    if (game.isCheckmate()) return game.turn() === 'b' ? t('win') : t('lose');
    if (game.isStalemate()) return t('stalemate');
    if (game.isDraw()) return t('draw');
    if (aiThinking) return t('ai_thinking');
    return game.turn() === 'w' ? t('your_turn') : t('ai_turn');
  });

  const isOver = $derived.by(() => { void rev; return game.isGameOver(); });
  const isWin = $derived.by(() => { void rev; return game.isCheckmate() && game.turn() === 'b'; });
  const isLose = $derived.by(() => { void rev; return game.isCheckmate() && game.turn() === 'w'; });
  const moveNum = $derived.by(() => { void rev; return game.moveNumber(); });
  const tokenChartData = $derived(tokenHistory.map((t, i) => ({ turn: i + 1, tokens: t })));

  // ===== Helpers =====
  function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

  function findCheckSquare(): string | null {
    if (!game.isCheck()) return null;
    const turn = game.turn();
    const b = game.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = b[r][f];
        if (p && p.type === 'k' && p.color === turn) {
          return String.fromCharCode(97 + f) + (8 - r);
        }
      }
    }
    return null;
  }

  function syncBoard() {
    rev++;
    if (!board3d) return;
    board3d.syncPieces(game.board());
    board3d.setHighlights({
      selected: selectedSquare,
      legal: legalMoves,
      lastFrom: lastFrom,
      lastTo: lastTo,
      checkSquare: findCheckSquare(),
    });
  }

  // ===== Interaction =====
  function handleSquareClick(sq: string) {
    if (game.isGameOver() || aiThinking || game.turn() !== 'w') return;

    // Move to a legal target
    if (selectedSquare && legalMoves.includes(sq)) {
      makePlayerMove(selectedSquare, sq);
      return;
    }

    // Select own piece
    const file = sq.charCodeAt(0) - 97;
    const rank = 8 - parseInt(sq[1]);
    const piece = game.board()[rank]?.[file];

    if (piece && piece.color === 'w') {
      selectedSquare = sq;
      const moves = game.moves({ square: sq as any, verbose: true });
      legalMoves = moves.map((m: any) => m.to);
    } else {
      selectedSquare = null;
      legalMoves = [];
    }
    syncBoard();
  }

  function makePlayerMove(from: string, to: string) {
    const moves = game.moves({ square: from as any, verbose: true });
    const target = moves.find((m: any) => m.to === to);
    if (!target) return;

    const promotion = (target as any).flags?.includes('p') ? 'q' : undefined;
    game.move({ from: from as any, to: to as any, promotion });

    lastFrom = from;
    lastTo = to;
    selectedSquare = null;
    legalMoves = [];
    moveList = game.history();
    syncBoard();

    if (!game.isGameOver()) requestAiMove();
  }

  // ===== AI Integration =====
  async function requestAiMove() {
    aiThinking = true;
    aiComment = '';
    syncBoard();

    const client = getActiveClient();
    const connected = client && store.activeGatewayId;

    if (!useAgent || !connected) {
      await delay(600);
      playRandomMove();
      aiComment = $ct('no_gateway');
      aiThinking = false;
      syncBoard();
      return;
    }

    try {
      const prompt = buildChessPrompt(game, $locale, difficulty);
      const sessKey = `chess-${crypto.randomUUID().slice(0, 8)}`;
      currentSessionKey = sessKey;

      await client.sendChat({
        sessionKey: sessKey,
        message: prompt,
        idempotencyKey: crypto.randomUUID(),
        deliver: false,
      });

      // Poll for response
      let response = '';
      for (let i = 0; i < 30; i++) {
        await delay(1000);
        try {
          const hist = await client.getChatHistory(sessKey);
          const assist = hist.find((m: any) => m.role === 'assistant');
          if (assist?.content) {
            response = assist.content;
            break;
          }
        } catch { /* keep polling */ }
      }

      if (response) {
        const san = parseLlmMove(response, game);
        if (san) {
          const verbose = game.moves({ verbose: true });
          const moveObj = verbose.find((m: any) => m.san === san);
          game.move(san);
          if (moveObj) {
            lastFrom = (moveObj as any).from;
            lastTo = (moveObj as any).to;
          }
          // Extract commentary
          const escaped = san.replace(/[+#]/g, '\\$&');
          aiComment = response
            .replace(new RegExp(`\\b${escaped}\\b`), '')
            .replace(/^[\s,.:;-]+/, '')
            .trim()
            .slice(0, 300);
          moveList = game.history();
          const turnTokens = Math.round(response.length * 1.3);
          tokensUsed += turnTokens;
          tokenHistory = [...tokenHistory, turnTokens];
        } else {
          playRandomMove();
          aiComment = $ct('parse_fail');
        }
      } else {
        playRandomMove();
        aiComment = $ct('ai_timeout');
      }
    } catch (e) {
      console.error('AI error:', e);
      playRandomMove();
      aiComment = $ct('ai_error');
    }

    aiThinking = false;
    syncBoard();
  }

  function playRandomMove() {
    const moves = game.moves({ verbose: true });
    if (moves.length > 0) {
      const pick = moves[Math.floor(Math.random() * moves.length)] as any;
      game.move(pick.san);
      lastFrom = pick.from;
      lastTo = pick.to;
      moveList = game.history();
    }
  }

  function newGame() {
    game = new Chess();
    selectedSquare = null;
    legalMoves = [];
    aiThinking = false;
    aiComment = '';
    lastFrom = null;
    lastTo = null;
    moveList = [];
    tokensUsed = 0;
    tokenHistory = [];
    clearChessState();
    syncBoard();
  }

  // ===== Lifecycle =====
  onMount(() => {
    board3d = new ChessBoard3D(container);
    board3d.onSquareClick = handleSquareClick;
    syncBoard();
  });

  onDestroy(() => {
    // Persist game state for navigation restore
    if (!game.isGameOver()) {
      saveChessState({
        fen: game.fen(),
        moveList: [...moveList],
        tokensUsed,
        tokenHistory: [...tokenHistory],
        useAgent,
        difficulty,
        aiComment,
        lastFrom,
        lastTo,
      });
    } else {
      clearChessState();
    }
    board3d?.dispose();
    board3d = null;
  });
</script>

<div class="chess-3d">
  <div class="viewport" bind:this={container}></div>

  <div class="panel">
    <!-- Mode toggle -->
    <div class="panel-section mode-section">
      <span class="section-label">{$ct('mode')}</span>
      <div class="mode-toggle">
        <button
          class="mode-btn"
          class:active={useAgent}
          onclick={() => useAgent = true}
          disabled={aiThinking}
        >
          <Bot size={13} />
          {$ct('agent')}
        </button>
        <button
          class="mode-btn"
          class:active={!useAgent}
          onclick={() => useAgent = false}
          disabled={aiThinking}
        >
          <Cpu size={13} />
          {$ct('offline')}
        </button>
      </div>
    </div>

    <!-- Difficulty -->
    <div class="panel-section">
      <span class="section-label">{$ct('difficulty')}</span>
      <div class="diff-toggle">
        {#each ['easy', 'normal', 'hard'] as level}
          <button
            class="diff-btn"
            class:active={difficulty === level}
            onclick={() => difficulty = level as Difficulty}
            disabled={aiThinking}
          >
            {$ct(`diff_${level}`)}
          </button>
        {/each}
      </div>
    </div>

    <!-- Status -->
    <div
      class="status-bar"
      class:thinking={aiThinking}
      class:win={isWin}
      class:lose={isLose}
    >
      {#if aiThinking}
        <span class="pulse-dot"></span>
      {/if}
      {statusText}
    </div>

    <!-- AI Commentary -->
    {#if aiComment}
      <div class="ai-comment">
        <MessageSquare size={13} />
        <p>{aiComment}</p>
      </div>
    {/if}

    <!-- Move list -->
    <div class="panel-section moves-section">
      <span class="section-label">{$ct('moves')}</span>
      <div class="move-list">
        {#if moveList.length === 0}
          <span class="move-empty">—</span>
        {:else}
          {#each moveList as move, i}
            {#if i % 2 === 0}
              <span class="move-pair">
                <span class="move-num">{Math.floor(i / 2) + 1}.</span>
                <span class="move-san">{move}</span>
                {#if moveList[i + 1]}
                  <span class="move-san black">{moveList[i + 1]}</span>
                {/if}
              </span>
            {/if}
          {/each}
        {/if}
      </div>
    </div>

    <!-- Token Waste Graph -->
    {#if tokenChartData.length > 0}
      <div class="panel-section token-section">
        <span class="section-label">{$ct('token_graph')}</span>
        <div class="token-chart-wrap">
          <LineChart
            data={tokenChartData}
            x="turn"
            y="tokens"
            axis={false}
            grid={false}
            rule={false}
            props={{
              spline: { stroke: '#fbbf24', strokeWidth: 2 },
              highlight: { points: { r: 5, fill: '#fbbf24', strokeWidth: 2, stroke: '#1a1a2e' } },
            }}
          />
        </div>
        <div class="token-total">
          <Zap size={11} />
          <span>{$ct('total')}: ~{tokensUsed.toLocaleString()} {$ct('tokens_wasted')}</span>
        </div>
      </div>
    {/if}

    <!-- Controls -->
    <div class="panel-controls">
      <span class="move-counter">{$ct('move')} {moveNum}</span>
      <button class="action-btn" onclick={newGame} disabled={aiThinking}>
        <RotateCcw size={14} />
        {$ct('new_game')}
      </button>
    </div>

    <!-- Gateway Session -->
    <div class="session-info">
      <Radio size={11} />
      <span class="session-label">{$ct('session')}:</span>
      <span class="session-value" class:connected={!!store.activeGatewayId}>
        {#if currentSessionKey}
          {currentSessionKey}
        {:else}
          {$ct('no_session')}
        {/if}
      </span>
    </div>
  </div>
</div>

<style>
  .chess-3d {
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

  /* ===== Panel ===== */

  .panel {
    width: 260px;
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

  /* Mode toggle */
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
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  }

  .mode-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Difficulty toggle */
  .diff-toggle {
    display: flex;
    gap: 4px;
    background: var(--color-surface-elevated);
    border-radius: 8px;
    padding: 3px;
  }

  .diff-btn {
    flex: 1;
    padding: 5px 8px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .diff-btn.active {
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }

  .diff-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Status */
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

  .status-bar.thinking {
    color: var(--color-text-muted);
  }

  .status-bar.win {
    background: rgba(34, 197, 94, 0.12);
    color: #22c55e;
  }

  .status-bar.lose {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-primary);
    animation: pulse 1s ease infinite;
    flex-shrink: 0;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.75); }
  }

  /* AI Comment */
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

  /* Token graph */
  .token-section {
    gap: 6px;
  }

  .token-chart-wrap {
    height: 72px;
    background: var(--color-surface-elevated);
    border-radius: 8px;
    overflow: hidden;
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

  /* Move list */
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
    max-height: 180px;
    padding: 8px;
    background: var(--color-surface-elevated);
    border-radius: 8px;
  }

  .move-empty {
    color: var(--color-text-subtle);
  }

  .move-pair {
    display: inline-flex;
    gap: 4px;
    white-space: nowrap;
  }

  .move-num {
    color: var(--color-text-subtle);
    min-width: 22px;
  }

  .move-san {
    color: var(--color-text);
    font-weight: 500;
  }

  .move-san.black {
    color: var(--color-text-muted);
  }

  /* Controls */
  .panel-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 4px;
    border-top: 1px solid var(--color-border);
  }

  .move-counter {
    font-size: 11px;
    color: var(--color-text-muted);
    font-weight: 500;
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
    background: var(--color-surface-hover);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Session info */
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

  .session-label {
    font-weight: 600;
    flex-shrink: 0;
  }

  .session-value {
    font-family: 'SF Mono', 'Fira Code', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-value.connected {
    color: #22c55e;
  }

  /* ===== Responsive ===== */
  @media (max-width: 768px) {
    .chess-3d {
      flex-direction: column;
    }

    .viewport {
      min-height: 400px;
    }

    .panel {
      width: 100%;
    }
  }
</style>
