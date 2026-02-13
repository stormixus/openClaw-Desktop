<script lang="ts">
  import { rules3dStore } from '$lib/rules3d/store/rules3dStore';
</script>

<div class="panel">
  <h3>Agent Coach</h3>
  <p>{$rules3dStore.agentSpeech}</p>
  <small>Mood: {$rules3dStore.agentMood}</small>
</div>

<style>
.panel{padding:12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface)}
h3{margin:0 0 6px;font-size:14px}p{margin:0 0 4px;color:var(--color-text-muted)}
</style>
