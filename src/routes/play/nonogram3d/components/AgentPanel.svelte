<script lang="ts">
  import { nonogramStore, askAgent, agentLoading, tokenHistory, tokensUsed } from '../store/nonogramStore';
  import { store as gwStore } from '$lib/gateway/store.svelte';
  import { kt } from '../i18n';
  import { Zap } from '@lucide/svelte';
  import TokenBarChart from '$lib/components/TokenBarChart.svelte';
</script>

<div class="panel">
  <div class="header">
    <h3>Agent Coach</h3>
    {#if gwStore.activeGatewayId}
      <button class="ask-btn" onclick={askAgent} disabled={$agentLoading}>
        {$agentLoading ? '...' : 'Ask AI'}
      </button>
    {/if}
  </div>
  <p>{$nonogramStore.agentSpeech || 'Use logic to reveal the hidden picture. Fill cells or mark with X.'}</p>
  {#if !gwStore.activeGatewayId}
    <small class="no-gw">No gateway connected</small>
  {/if}

  {#if $tokenHistory.length > 0}
    <div class="token-section">
      <div class="token-header">
        <Zap size={14} />
        <span>{$kt('token_graph')}</span>
      </div>
      <div class="chart-wrap">
        <TokenBarChart data={$tokenHistory} />
      </div>
      <div class="total">
        {$kt('total')}: ~{$tokensUsed.toLocaleString()} {$kt('tokens_wasted')}
      </div>
    </div>
  {/if}
</div>

<style>
  .panel{padding:12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface)}
  .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
  h3{margin:0;font-size:14px}
  .ask-btn{padding:4px 10px;font-size:11px;font-weight:600;border-radius:6px;border:1px solid var(--color-primary);background:transparent;color:var(--color-primary);cursor:pointer;transition:all 150ms}
  .ask-btn:hover:not(:disabled){background:var(--color-primary);color:white}
  .ask-btn:disabled{opacity:0.5;cursor:wait}
  p{margin:0 0 6px;font-size:13px;color:var(--color-text-muted)}
  .no-gw{font-size:11px;color:var(--color-text-subtle);font-style:italic}
  .token-section{margin-top:12px}
  .token-header{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--color-text-muted);margin-bottom:6px}
  .chart-wrap{height:48px}
  .total{font-size:11px;color:var(--color-text-subtle);margin-top:4px}
</style>
