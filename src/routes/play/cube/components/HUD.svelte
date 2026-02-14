<script lang="ts">
  import { cubeStore } from '../store/cubeStore';
  import { kt } from '../i18n';
  import type { Face } from '../core/types';

  const faces: Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];

  function handleMove(face: Face, modifier: '' | "'" | '2') {
    cubeStore.doMove(face + modifier);
  }

  function handleScramble() {
    cubeStore.scrambleCube();
  }

  function handleReset() {
    cubeStore.resetCube();
  }

  function handleUndo() {
    cubeStore.undoMove();
  }
</script>

<div class="hud">
  <div class="stats">
    <div class="stat">
      <span class="stat-label">{$kt('moves')}:</span>
      <span class="stat-value">{$cubeStore.moveCount}</span>
    </div>
    <div class="stat">
      <span class="stat-label">{$kt('status')}:</span>
      <span class="stat-value status-{$cubeStore.status}">
        {$cubeStore.status === 'solved' ? $kt('solved') : $kt('playing')}
      </span>
    </div>
  </div>

  <div class="controls">
    <div class="move-buttons">
      <div class="move-row">
        {#each faces as face}
          <div class="move-group">
            <button
              class="move-btn"
              onclick={() => handleMove(face, '')}
              title="{face} clockwise"
            >
              {face}
            </button>
            <button
              class="move-btn secondary"
              onclick={() => handleMove(face, "'")}
              title="{face} counter-clockwise"
            >
              {face}'
            </button>
            <button
              class="move-btn secondary"
              onclick={() => handleMove(face, '2')}
              title="{face} double"
            >
              {face}2
            </button>
          </div>
        {/each}
      </div>
    </div>

    <div class="action-buttons">
      <button class="action-btn scramble" onclick={handleScramble}>
        {$kt('scramble')}
      </button>
      <button class="action-btn reset" onclick={handleReset}>
        {$kt('reset')}
      </button>
      <button class="action-btn undo" onclick={handleUndo} disabled={$cubeStore.moves.length === 0}>
        {$kt('undo')}
      </button>
    </div>
  </div>

  {#if $cubeStore.moves.length > 0}
    <div class="move-history">
      <span class="history-label">{$kt('move_history')}:</span>
      <span class="moves">{$cubeStore.moves.join(' ')}</span>
    </div>
  {/if}
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

  .stats {
    display: flex;
    gap: 16px;
    justify-content: center;
  }

  .stat {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .stat-label {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .stat-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .status-solved {
    color: #22c55e;
  }

  .status-playing {
    color: var(--color-primary);
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .move-buttons {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .move-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .move-group {
    display: flex;
    gap: 2px;
  }

  .move-btn {
    padding: 6px 8px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text);
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: all 150ms ease;
    min-width: 2rem;
  }

  .move-btn:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-primary);
  }

  .move-btn:active {
    transform: scale(0.95);
  }

  .move-btn.secondary {
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .action-buttons {
    display: flex;
    gap: 6px;
    justify-content: center;
  }

  .action-btn {
    padding: 8px 14px;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .action-btn.scramble {
    background: #f59e0b;
    color: white;
  }

  .action-btn.scramble:hover {
    background: #d97706;
  }

  .action-btn.reset {
    background: var(--color-primary);
    color: white;
  }

  .action-btn.reset:hover {
    background: var(--color-primary-hover);
  }

  .action-btn.undo {
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .action-btn.undo:hover:not(:disabled) {
    background: var(--color-surface-hover);
    border-color: var(--color-border-strong);
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .move-history {
    padding: 8px;
    background: var(--color-surface-elevated);
    border-radius: 6px;
    font-size: 12px;
  }

  .history-label {
    display: block;
    margin-bottom: 4px;
    color: var(--color-text-muted);
  }

  .moves {
    color: var(--color-text);
    font-family: 'Courier New', monospace;
  }
</style>
