<script lang="ts">
  import { cubeStore } from '../store/cubeStore';

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
      placeholder="Ask the agent for help..."
      class="agent-question"
    />
    <button onclick={handleAskAgent} class="ask-btn" disabled={!question.trim()}>
      Ask
    </button>
  </div>
</div>

<style>
  .agent-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
  }

  .agent-speech {
    padding: 1rem;
    border-radius: 6px;
    transition: background 0.3s;
  }

  .mood-calm {
    background: rgba(96, 165, 250, 0.2);
    border: 1px solid rgba(96, 165, 250, 0.4);
  }

  .mood-teasing {
    background: rgba(251, 146, 60, 0.2);
    border: 1px solid rgba(251, 146, 60, 0.4);
  }

  .mood-serious {
    background: rgba(139, 92, 246, 0.2);
    border: 1px solid rgba(139, 92, 246, 0.4);
  }

  .mood-excited {
    background: rgba(74, 222, 128, 0.2);
    border: 1px solid rgba(74, 222, 128, 0.4);
  }

  .speech-bubble p {
    margin: 0;
    color: white;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .agent-input {
    display: flex;
    gap: 0.5rem;
  }

  .agent-question {
    flex: 1;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: white;
    font-size: 0.875rem;
  }

  .agent-question::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  .ask-btn {
    padding: 0.75rem 1.5rem;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .ask-btn:hover:not(:disabled) {
    background: #059669;
  }

  .ask-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
