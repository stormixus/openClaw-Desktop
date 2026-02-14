<script lang="ts">
  import { go3dStore, askCoach, coachLoading } from '../store/go3dStore';
  import { store as gwStore } from '$lib/gateway/store.svelte';
  import TokenBarChart from '$lib/components/TokenBarChart.svelte';
  import { Zap } from '@lucide/svelte';
  import { kt } from '../i18n';

  const tokenGraphLabel = $derived($kt('token_graph'));
  const totalLabel = $derived($kt('total'));
  const tokensWastedLabel = $derived($kt('tokens_wasted'));
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

{#if $go3dStore.tokenHistory.length > 0}
  <div class="token-section">
    <span class="section-label">{tokenGraphLabel}</span>
    <div class="token-chart-wrap"><TokenBarChart data={$go3dStore.tokenHistory} /></div>
    <div class="token-total"><Zap size={11} /><span>{totalLabel}: ~{$go3dStore.tokensUsed.toLocaleString()} {tokensWastedLabel}</span></div>
  </div>
{/if}

<style>
  .panel { padding:12px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-surface); }
  .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  h3 { margin:0; font-size:14px; }
  .ask-btn { padding:4px 10px; font-size:11px; font-weight:600; border-radius:6px; border:1px solid var(--color-primary); background:transparent; color:var(--color-primary); cursor:pointer; transition:all 150ms; }
  .ask-btn:hover:not(:disabled) { background:var(--color-primary); color:white; }
  .ask-btn:disabled { opacity:0.5; cursor:wait; }
  .speech { margin:0; color:var(--color-text-muted); font-size:13px; line-height:1.5; white-space:pre-wrap; }
  .no-gw { font-size:11px; color:var(--color-text-subtle); font-style:italic; }
  .token-section{display:flex;flex-direction:column;gap:6px}
  .section-label{font-size:11px;font-weight:600;color:var(--color-text-muted)}
  .token-chart-wrap{height:72px;background:var(--color-surface-elevated);border-radius:8px;overflow:visible;padding:6px 4px}
  .token-total{display:flex;align-items:center;gap:5px;color:#fbbf24;font-size:11px}
</style>
