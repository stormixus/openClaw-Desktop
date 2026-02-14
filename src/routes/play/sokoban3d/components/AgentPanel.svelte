<script lang="ts">
  import { store } from '../store/sokobanStore';

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
    <h3>AI Assistant</h3>
  </div>

  <div class="speech-bubble">
    <p>{state.agentSpeech}</p>
  </div>

  <button onclick={handleAskAgent} class="ask-btn">
    Ask for Hint
  </button>
</div>

<style>
  .agent-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: rgba(15, 15, 26, 0.8);
    border-radius: 0.5rem;
    color: white;
  }

  .agent-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .mood-emoji {
    font-size: 1.5rem;
  }

  .agent-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .speech-bubble {
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
    border-left: 3px solid rgba(59, 130, 246, 0.5);
    min-height: 4rem;
  }

  .speech-bubble p {
    margin: 0;
    line-height: 1.5;
    font-size: 0.875rem;
  }

  .ask-btn {
    padding: 0.75rem 1.5rem;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 0.375rem;
    color: white;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .ask-btn:hover {
    background: rgba(59, 130, 246, 0.3);
    border-color: rgba(59, 130, 246, 0.5);
  }

  .ask-btn:active {
    transform: scale(0.98);
  }
</style>
