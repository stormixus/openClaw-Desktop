<script lang="ts">
  import { mines3dStore } from '$lib/mines3d/store/mines3dStore';
</script>

<div class="panel">
  <h3>Agent Coach</h3>
  <p>{$mines3dStore.agentSpeech || '숫자와 깃발 관계를 기준으로 안전 칸을 읽어보세요.'}</p>
  <small>Mood: {$mines3dStore.agentMood}</small>
</div>

<style>
  .panel{padding:12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface)}
  h3{margin:0 0 8px;font-size:14px}
  p{margin:0 0 6px;font-size:13px;color:var(--color-text-muted)}
  small{font-size:11px;color:var(--color-text-subtle)}
</style>
