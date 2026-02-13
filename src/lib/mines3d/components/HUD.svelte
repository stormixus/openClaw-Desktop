<script lang="ts">
  import { mines3dStore, newGamePreset, restart, hint } from '$lib/mines3d/store/mines3dStore';
</script>

<div class="hud">
  <div class="row"><b>💣 {$mines3dStore.mines - $mines3dStore.flaggedCount}</b><span>{Math.floor($mines3dStore.elapsedMs / 1000)}s</span></div>
  <div class="row">
    <button onclick={() => newGamePreset('beginner')}>9x9</button>
    <button onclick={() => newGamePreset('intermediate')}>16x16</button>
    <button onclick={() => newGamePreset('expert')}>30x16</button>
  </div>
  <div class="row">
    <button onclick={() => hint(1)}>힌트1</button>
    <button onclick={() => hint(2)}>힌트2</button>
    <button onclick={() => hint(3)}>힌트3</button>
    <button onclick={restart}>재시작</button>
  </div>
  <div class="status">상태: {$mines3dStore.status}</div>
</div>

<style>
  .hud{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface)}
  .row{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  button{padding:6px 10px;border-radius:8px;border:1px solid var(--color-border);background:var(--color-surface-elevated);cursor:pointer}
  .status{font-size:12px;color:var(--color-text-muted)}
</style>
