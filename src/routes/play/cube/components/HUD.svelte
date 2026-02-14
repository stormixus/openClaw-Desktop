<script lang="ts">
  import { cubeStore } from '../store/cubeStore';
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
      <span class="label">Moves:</span>
      <span class="value">{$cubeStore.moveCount}</span>
    </div>
    <div class="stat">
      <span class="label">Status:</span>
      <span class="value status-{$cubeStore.status}">
        {$cubeStore.status === 'solved' ? 'Solved!' : 'Playing'}
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
        Scramble
      </button>
      <button class="action-btn reset" onclick={handleReset}>
        Reset
      </button>
      <button class="action-btn undo" onclick={handleUndo} disabled={$cubeStore.moves.length === 0}>
        Undo
      </button>
    </div>
  </div>

  {#if $cubeStore.moves.length > 0}
    <div class="move-history">
      <span class="label">Moves:</span>
      <span class="moves">{$cubeStore.moves.join(' ')}</span>
    </div>
  {/if}
</div>

<style>
  .hud {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
  }

  .stats {
    display: flex;
    gap: 2rem;
    justify-content: center;
  }

  .stat {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .label {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .value {
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
  }

  .status-solved {
    color: #4ade80;
  }

  .status-playing {
    color: #60a5fa;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .move-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .move-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .move-group {
    display: flex;
    gap: 2px;
  }

  .move-btn {
    padding: 0.5rem 0.75rem;
    background: rgba(96, 165, 250, 0.3);
    border: 1px solid rgba(96, 165, 250, 0.5);
    border-radius: 4px;
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 2.5rem;
  }

  .move-btn:hover {
    background: rgba(96, 165, 250, 0.5);
    transform: translateY(-1px);
  }

  .move-btn:active {
    transform: translateY(0);
  }

  .move-btn.secondary {
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.3);
    font-size: 0.875rem;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .action-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn.scramble {
    background: #f59e0b;
    color: white;
  }

  .action-btn.scramble:hover {
    background: #d97706;
  }

  .action-btn.reset {
    background: #6366f1;
    color: white;
  }

  .action-btn.reset:hover {
    background: #4f46e5;
  }

  .action-btn.undo {
    background: #8b5cf6;
    color: white;
  }

  .action-btn.undo:hover:not(:disabled) {
    background: #7c3aed;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .move-history {
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .move-history .label {
    display: block;
    margin-bottom: 0.25rem;
  }

  .move-history .moves {
    color: white;
    font-family: 'Courier New', monospace;
  }
</style>
