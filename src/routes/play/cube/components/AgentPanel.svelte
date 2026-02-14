<script lang="ts">
  import { cubeStore, tokenHistory, tokensUsed } from '../store/cubeStore';
  import { kt } from '../i18n';
  import { Zap } from '@lucide/svelte';
  import TokenBarChart from '$lib/components/TokenBarChart.svelte';

  let question = $state('');

  async function handleAskAgent() {
    if (!question.trim()) return;
    await cubeStore.askAgent(question);
    question = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAskAgent();
    }
  }
</script>

<div class="agent-panel">
  <div class="agent-speech mood-{$cubeStore.agentMood}">
    <div class="speech-bubble">
      <p>{$cubeStore.agentSpeech}</p>
    </div>
  </div>

  <div class="agent-input">
    <input
      type="text"
      bind:value={question}
      onkeydown={handleKeydown}
      placeholder={$kt('ask_placeholder')}
      class="agent-question"
    />
    <button onclick={handleAskAgent} class="ask-btn" disabled={!question.trim()}>
      {$kt('ask')}
    </button>
  </div>

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

  .agent-speech {
    padding: 10px;
    border-radius: 6px;
    transition: background 0.3s;
  }

  .mood-calm {
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
  }

  .mood-teasing {
    background: rgba(251, 146, 60, 0.1);
    border: 1px solid rgba(251, 146, 60, 0.25);
  }

  .mood-serious {
    background: rgba(139, 92, 246, 0.1);
    border: 1px solid rgba(139, 92, 246, 0.25);
  }

  .mood-excited {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.25);
  }

  .speech-bubble p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .agent-input {
    display: flex;
    gap: 6px;
  }

  .agent-question {
    flex: 1;
    padding: 8px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text);
    font-size: 12px;
    transition: border-color 150ms ease;
  }

  .agent-question:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .agent-question::placeholder {
    color: var(--color-text-subtle);
  }

  .ask-btn {
    padding: 8px 12px;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .ask-btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .ask-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .token-section { margin-top: 2px; }
  .token-header { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 6px; }
  .chart-wrap { height: 48px; }
  .total { font-size: 11px; color: var(--color-text-subtle); margin-top: 4px; }
</style>
