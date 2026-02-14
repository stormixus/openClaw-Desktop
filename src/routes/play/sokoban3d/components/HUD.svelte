<script lang="ts">
  import { store } from '../store/sokobanStore';
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
      Level {state.currentLevelIndex + 1} / {LEVEL_DATA.length}
    </div>
  </div>

  <div class="stats">
    <div class="stat-item">
      <span class="stat-label">Moves</span>
      <span class="stat-value">{state.moves}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Pushes</span>
      <span class="stat-value">{state.pushes}</span>
    </div>
  </div>

  <div class="controls">
    <button
      onclick={handleUndo}
      disabled={state.history.length === 0}
      class="control-btn"
    >
      Undo (Ctrl+Z)
    </button>
    <button
      onclick={handleReset}
      class="control-btn"
    >
      Reset (R)
    </button>
  </div>

  {#if state.status === 'won'}
    <div class="win-message">
      <p>Level Complete!</p>
      {#if state.currentLevelIndex < LEVEL_DATA.length - 1}
        <button onclick={handleNextLevel} class="next-level-btn">
          Next Level
        </button>
      {:else}
        <p class="congrats">All levels completed!</p>
      {/if}
    </div>
  {/if}

  <div class="instructions">
    <h3>Controls</h3>
    <ul>
      <li>WASD / Arrow Keys - Move</li>
      <li>Ctrl+Z - Undo</li>
      <li>R - Reset Level</li>
    </ul>
  </div>
</div>

<style>
  .hud {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    background: rgba(15, 15, 26, 0.8);
    border-radius: 0.5rem;
    color: white;
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .level-title {
    font-size: 1.5rem;
    font-weight: bold;
    margin: 0;
  }

  .level-progress {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.375rem;
  }

  .stat-label {
    font-size: 0.75rem;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: bold;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .control-btn {
    padding: 0.75rem;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 0.375rem;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .control-btn:hover:not(:disabled) {
    background: rgba(59, 130, 246, 0.3);
    border-color: rgba(59, 130, 246, 0.5);
  }

  .control-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .win-message {
    padding: 1rem;
    background: rgba(74, 222, 128, 0.2);
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: 0.375rem;
    text-align: center;
  }

  .win-message p {
    margin: 0 0 0.75rem 0;
    font-size: 1.125rem;
    font-weight: bold;
  }

  .next-level-btn {
    padding: 0.75rem 1.5rem;
    background: rgb(74, 222, 128);
    border: none;
    border-radius: 0.375rem;
    color: rgb(15, 15, 26);
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
  }

  .next-level-btn:hover {
    background: rgb(34, 197, 94);
  }

  .congrats {
    color: rgb(74, 222, 128);
    margin: 0;
  }

  .instructions {
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.375rem;
  }

  .instructions h3 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    opacity: 0.9;
  }

  .instructions ul {
    margin: 0;
    padding-left: 1.25rem;
    list-style-type: disc;
  }

  .instructions li {
    margin: 0.25rem 0;
    font-size: 0.875rem;
    opacity: 0.8;
  }
</style>
