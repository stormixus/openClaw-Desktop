<script lang="ts">
  import { slitherlinkStore, newGameAction, restart } from '../store/slitherlinkStore';

  function countLines() {
    let count = 0;
    for (const row of $slitherlinkStore.hEdges) {
      for (const edge of row) {
        if (edge === 'line') count++;
      }
    }
    for (const row of $slitherlinkStore.vEdges) {
      for (const edge of row) {
        if (edge === 'line') count++;
      }
    }
    return count;
  }

  $: lineCount = countLines();
  $: elapsedSeconds = Math.floor($slitherlinkStore.elapsedMs / 1000);
</script>

<div class="hud">
  <div class="row">
    <b>🔗 Lines: {lineCount}</b>
    <span>{elapsedSeconds}s</span>
  </div>
  <div class="row">
    <button onclick={() => newGameAction('easy')} class:active={$slitherlinkStore.difficulty === 'easy'}>Easy</button>
    <button onclick={() => newGameAction('medium')} class:active={$slitherlinkStore.difficulty === 'medium'}>Medium</button>
    <button onclick={() => newGameAction('hard')} class:active={$slitherlinkStore.difficulty === 'hard'}>Hard</button>
  </div>
  <div class="row">
    <button onclick={restart}>Restart</button>
  </div>
  <div class="status">
    Status: {$slitherlinkStore.status === 'won' ? '✓ Won!' : 'Playing'}
  </div>
</div>

<style>
  .hud {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-surface);
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  button {
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
    cursor: pointer;
    transition: all 150ms;
  }
  button:hover {
    background: var(--color-surface-hover);
  }
  button.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }
  .status {
    font-size: 12px;
    color: var(--color-text-muted);
  }
</style>
