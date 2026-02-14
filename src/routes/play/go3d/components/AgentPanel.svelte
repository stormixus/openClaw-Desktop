<script lang="ts">
  import { go3dStore, askCoach, coachLoading } from '../store/go3dStore';
  import { store as gwStore } from '$lib/gateway/store.svelte';
</script>

<div class="panel">
  <div class="header">
    <h3>AI Coach</h3>
    {#if gwStore.activeGatewayId}
      <button class="ask-btn" onclick={askCoach} disabled={$coachLoading || $go3dStore.aiThinking}>
        {$coachLoading ? '...' : 'Ask AI'}
      </button>
    {/if}
  </div>
  <p class="speech">{$go3dStore.aiComment || 'Place a stone or ask the AI for coaching.'}</p>
  {#if !gwStore.activeGatewayId}
    <small class="no-gw">No gateway connected</small>
  {/if}
</div>

<style>
  .panel { padding:12px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-surface); }
  .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  h3 { margin:0; font-size:14px; }
  .ask-btn { padding:4px 10px; font-size:11px; font-weight:600; border-radius:6px; border:1px solid var(--color-primary); background:transparent; color:var(--color-primary); cursor:pointer; transition:all 150ms; }
  .ask-btn:hover:not(:disabled) { background:var(--color-primary); color:white; }
  .ask-btn:disabled { opacity:0.5; cursor:wait; }
  .speech { margin:0; color:var(--color-text-muted); font-size:13px; line-height:1.5; white-space:pre-wrap; }
  .no-gw { font-size:11px; color:var(--color-text-subtle); font-style:italic; }
</style>
