<script lang="ts">
  import { nonogramStore, newGamePreset } from '../store/nonogramStore';

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function getProgress(): { filled: number; total: number } {
    const s = $nonogramStore;
    let totalToFill = 0;
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (s.solution[y][x]) totalToFill++;
      }
    }

    let filled = 0;
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (s.grid[y][x] === 'filled' && s.solution[y][x]) filled++;
      }
    }

    return { filled, total: totalToFill };
  }

  $: progress = getProgress();
</script>

<div class="hud">
  <div class="row">
    <b>⏱️ {formatTime($nonogramStore.elapsedMs)}</b>
    <span class="status">{$nonogramStore.status}</span>
  </div>
  <div class="progress-bar">
    <div class="progress-fill" style="width: {(progress.filled / progress.total) * 100}%"></div>
    <span class="progress-text">{progress.filled}/{progress.total}</span>
  </div>
  <div class="row">
    <button onclick={() => newGamePreset('easy')}>Easy (5x5)</button>
    <button onclick={() => newGamePreset('medium')}>Medium (10x10)</button>
  </div>
  <div class="row">
    <button onclick={() => newGamePreset('hard')}>Hard (15x15)</button>
  </div>
  <div class="info">
    <small>Left-click: Fill/Clear | Right-click: Mark X</small>
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
  .status {
    font-size: 12px;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }
  .progress-bar {
    position: relative;
    height: 24px;
    background: var(--color-bg);
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--color-border);
  }
  .progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #8b5cf6);
    transition: width 0.3s ease;
  }
  .progress-text {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text);
    z-index: 1;
  }
  button {
    flex: 1;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
    cursor: pointer;
    font-size: 11px;
    transition: all 150ms;
  }
  button:hover {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }
  .info {
    padding-top: 4px;
    border-top: 1px solid var(--color-border);
  }
  small {
    font-size: 10px;
    color: var(--color-text-subtle);
    line-height: 1.4;
  }
</style>
