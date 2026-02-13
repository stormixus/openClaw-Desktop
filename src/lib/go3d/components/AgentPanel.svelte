<script lang="ts">
  import { go3dStore } from '$lib/go3d/store/go3dStore';
</script>

<div class="panel">
  <h3>Agent Coach</h3>
  <p class="speech">{$go3dStore.agentSpeech || '첫 수를 두면 코칭을 시작합니다.'}</p>
  {#if $go3dStore.agentExplain.length}
    <ul>
      {#each $go3dStore.agentExplain as line}
        <li>{line}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .panel { padding:12px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-surface); }
  h3 { margin:0 0 8px; font-size:14px; }
  .speech { margin:0; color:var(--color-text-muted); font-size:13px; }
  ul { margin:8px 0 0 18px; padding:0; }
  li { font-size:12px; color:var(--color-text-muted); }
</style>
