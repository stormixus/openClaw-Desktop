<script lang="ts">
  import { doHint, doReset, doUndo, rules3dStore } from '$lib/rules3d/store/rules3dStore';
</script>

<div class="hud">
  <div><b>{$rules3dStore.title}</b></div>
  <div>Step: {$rules3dStore.step} · Status: {$rules3dStore.status}</div>
  <div class="btns">
    <button onclick={doUndo}>Undo</button>
    <button onclick={doReset}>Reset</button>
    <button onclick={doHint}>Hint</button>
  </div>
</div>

<style>
.hud{padding:12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);display:flex;flex-direction:column;gap:8px}
.btns{display:flex;gap:8px}
button{padding:6px 10px;border-radius:8px;border:1px solid var(--color-border);background:var(--color-surface-elevated)}
</style>
