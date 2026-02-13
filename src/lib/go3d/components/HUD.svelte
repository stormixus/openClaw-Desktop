<script lang="ts">
  import { go3dStore, hint, reset, undo } from '$lib/go3d/store/go3dStore';
  import type { GoPuzzle } from '$lib/go3d/core/types';
  export let puzzle: GoPuzzle;
</script>

<div class="hud">
  <div class="goal">🎯 {$go3dStore.goal}</div>
  <div class="status">상태: {$go3dStore.status}</div>
  <div class="buttons">
    <button onclick={() => hint(puzzle)}>힌트</button>
    <button onclick={undo}>되돌리기</button>
    <button onclick={reset}>리셋</button>
  </div>
</div>

<style>
  .hud { display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-surface); }
  .goal { font-weight:600; }
  .status { font-size:12px; color:var(--color-text-muted); }
  .buttons { display:flex; gap:8px; }
  button { padding:6px 10px; border-radius:8px; border:1px solid var(--color-border); background:var(--color-surface-elevated); cursor:pointer; }
</style>
