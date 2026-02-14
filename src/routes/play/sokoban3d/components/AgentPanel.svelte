<script lang="ts">
  import { store, tokenHistory, tokensUsed } from '../store/sokobanStore';
  import { kt } from '../i18n';
  import { Zap } from '@lucide/svelte';
  import TokenBarChart from '$lib/components/TokenBarChart.svelte';

  let state = $state($store);

  $effect(() => {
    state = $store;
  });

  function handleAskAgent() {
    store.askAgent();
  }

  function getMoodEmoji(mood: string): string {
    switch (mood) {
      case 'calm': return '😌';
      case 'teasing': return '😏';
      case 'serious': return '🤔';
      case 'excited': return '🎉';
      default: return '😌';
    }
  }
</script>

<div class="agent-panel">
  <div class="agent-header">
    <span class="mood-emoji">{getMoodEmoji(state.agentMood)}</span>
    <h3>{$kt('ai_assistant')}</h3>
  </div>

  <div class="speech-bubble">
    <p>{state.agentSpeech}</p>
  </div>

  <button onclick={handleAskAgent} class="ask-btn">
    {$kt('ask_hint')}
  </button>

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
  .agent-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--color-surface);
    border-radius: 10px;
    border: 1px solid var(--color-border);
  }

  .agent-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mood-emoji {
    font-size: 1.25rem;
  }

  .agent-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }

  .speech-bubble {
    padding: 10px;
    background: var(--color-surface-elevated);
    border-radius: 6px;
    border-left: 3px solid var(--color-primary);
    min-height: 2.5rem;
  }

  .speech-bubble p {
    margin: 0;
    line-height: 1.5;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .ask-btn {
    padding: 8px 12px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    font-weight: 500;
    font-size: 13px;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .ask-btn:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border-strong);
  }

  .ask-btn:active {
    transform: scale(0.98);
  }

  .token-section { margin-top: 2px; }
  .token-header { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 6px; }
  .chart-wrap { height: 48px; }
  .total { font-size: 11px; color: var(--color-text-subtle); margin-top: 4px; }
</style>
