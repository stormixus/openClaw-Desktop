<script lang="ts">
  import { doHint, doReset, doUndo, rules3dStore, nextLevel, prevLevel, levelIndex, ALL_LEVELS } from '../store/rules3dStore';
</script>

<div class="hud">
  <div class="level-nav">
    <button onclick={prevLevel} disabled={$levelIndex === 0}>&laquo;</button>
    <b>{$rules3dStore.title}</b>
    <span class="level-num">{$levelIndex + 1}/{ALL_LEVELS.length}</span>
    <button onclick={nextLevel} disabled={$levelIndex >= ALL_LEVELS.length - 1}>&raquo;</button>
  </div>
  <div>Step: {$rules3dStore.step} · Status: {$rules3dStore.status}</div>
  <div class="btns">
    <button onclick={doUndo}>Undo</button>
    <button onclick={doReset}>Reset</button>
    <button onclick={doHint}>Hint</button>
  </div>
  {#if $rules3dStore.status === 'won'}
    <button class="next-btn" onclick={nextLevel}>Next Level &rarr;</button>
  {/if}
</div>

<style>
.hud{padding:12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);display:flex;flex-direction:column;gap:8px}
.level-nav{display:flex;align-items:center;gap:8px}
.level-num{font-size:11px;color:var(--color-text-subtle)}
.btns{display:flex;gap:8px}
button{padding:6px 10px;border-radius:8px;border:1px solid var(--color-border);background:var(--color-surface-elevated);cursor:pointer}
button:disabled{opacity:0.4;cursor:default}
.next-btn{background:var(--color-primary);color:white;border-color:var(--color-primary);font-weight:600}
</style>
