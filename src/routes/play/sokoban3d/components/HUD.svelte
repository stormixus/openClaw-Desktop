<script lang="ts">
  import { store } from '../store/sokobanStore';
  import { kt } from '../i18n';
  import { LEVEL_DATA } from '../core/levels';

  let state = $state($store);

  $effect(() => {
    state = $store;
  });

  function handleUndo() {
    store.undoMove();
  }

  function handleReset() {
    store.resetCurrentLevel();
  }

  function handleNextLevel() {
    store.nextLevel();
  }
</script>

<div class="hud">
  <div class="header">
    <h2 class="level-title">
      {state.level.title}
    </h2>
    <div class="level-progress">
      {$kt('level')} {state.currentLevelIndex + 1} / {LEVEL_DATA.length}
    </div>
  </div>

  <div class="stats">
    <div class="stat-item">
      <span class="stat-label">{$kt('moves')}</span>
      <span class="stat-value">{state.moves}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">{$kt('pushes')}</span>
      <span class="stat-value">{state.pushes}</span>
    </div>
  </div>

  <div class="controls">
    <button
      onclick={handleUndo}
      disabled={state.history.length === 0}
      class="control-btn"
    >
      {$kt('undo')}
    </button>
    <button
      onclick={handleReset}
      class="control-btn"
    >
      {$kt('reset')}
    </button>
  </div>

  {#if state.status === 'won'}
    <div class="win-message">
      <p>{$kt('level_complete')}</p>
      {#if state.currentLevelIndex < LEVEL_DATA.length - 1}
        <button onclick={handleNextLevel} class="next-level-btn">
          {$kt('next_level')}
        </button>
      {:else}
        <p class="congrats">{$kt('all_complete')}</p>
      {/if}
    </div>
  {/if}

  <div class="instructions">
    <h3>{$kt('controls')}</h3>
    <ul>
      <li>{$kt('ctrl_move')}</li>
      <li>{$kt('ctrl_undo')}</li>
      <li>{$kt('ctrl_reset')}</li>
    </ul>
  </div>
</div>

<style>
  .hud {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: var(--color-surface);
    border-radius: 10px;
    border: 1px solid var(--color-border);
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .level-title {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    color: var(--color-text);
  }

  .level-progress {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    background: var(--color-surface-elevated);
    border-radius: 6px;
  }

  .stat-label {
    font-size: 11px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .control-btn {
    padding: 8px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    cursor: pointer;
    font-size: 13px;
    transition: all 150ms ease;
  }

  .control-btn:hover:not(:disabled) {
    background: var(--color-surface-hover);
    border-color: var(--color-border-strong);
  }

  .control-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .win-message {
    padding: 12px;
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 8px;
    text-align: center;
  }

  .win-message p {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: #22c55e;
  }

  .next-level-btn {
    padding: 8px 16px;
    background: #22c55e;
    border: none;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .next-level-btn:hover {
    background: #16a34a;
  }

  .congrats {
    color: #22c55e;
    margin: 0 !important;
  }

  .instructions {
    padding: 10px;
    background: var(--color-surface-elevated);
    border-radius: 6px;
  }

  .instructions h3 {
    margin: 0 0 8px 0;
    font-size: 13px;
    color: var(--color-text);
  }

  .instructions ul {
    margin: 0;
    padding-left: 1.25rem;
    list-style-type: disc;
  }

  .instructions li {
    margin: 3px 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }
</style>
