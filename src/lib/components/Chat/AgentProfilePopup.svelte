<script lang="ts">
  import type { AgentInfo } from "$lib/gateway/types";
  import { X, Bot } from "@lucide/svelte";

  interface Props {
    agent: AgentInfo;
    onclose?: () => void;
  }

  const { agent, onclose }: Props = $props();

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose?.();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={handleOverlayClick}>
  <div class="popup">
    <button class="close-btn" onclick={() => onclose?.()}>
      <X size={18} strokeWidth={2} />
    </button>

    <div class="avatar-section">
      {#if agent.avatar}
        <img src={agent.avatar} alt={agent.name} class="avatar-image" />
      {:else if agent.emoji}
        <div class="avatar-emoji">{agent.emoji}</div>
      {:else}
        <div class="avatar-default">
          <Bot size={48} strokeWidth={1.5} />
        </div>
      {/if}
    </div>

    <div class="info-section">
      <h2 class="agent-name">{agent.name}</h2>
      <p class="agent-id">@{agent.id}</p>
      
      {#if agent.description}
        <div class="agent-description">
          <p>{agent.description}</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .popup {
    position: relative;
    width: 360px;
    max-width: 90vw;
    background: var(--color-surface);
    border-radius: 24px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideUp {
    from { 
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to { 
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: all 0.2s ease;
    z-index: 1;
  }

  .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .avatar-section {
    display: flex;
    justify-content: center;
    padding: 40px 24px 24px;
    background: linear-gradient(135deg, 
      rgba(99, 102, 241, 0.15), 
      rgba(168, 85, 247, 0.1)
    );
  }

  .avatar-image {
    width: 100px;
    height: 100px;
    border-radius: 24px;
    object-fit: cover;
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.2),
      0 0 0 4px var(--color-surface);
  }

  .avatar-emoji {
    width: 100px;
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 56px;
    background: var(--color-surface);
    border-radius: 24px;
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.2),
      0 0 0 4px var(--color-surface);
  }

  .avatar-default {
    width: 100px;
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    border-radius: 24px;
    box-shadow: 
      0 8px 32px rgba(99, 102, 241, 0.4),
      0 0 0 4px var(--color-surface);
  }

  .info-section {
    padding: 24px;
    text-align: center;
  }

  .agent-name {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--color-text);
  }

  .agent-id {
    margin: 4px 0 0;
    font-size: 14px;
    color: var(--color-text-muted);
    font-family: 'SF Mono', monospace;
  }

  .agent-description {
    margin-top: 16px;
    padding: 16px;
    background: var(--color-surface-elevated);
    border-radius: 12px;
  }

  .agent-description p {
    margin: 0;
    font-size: 14px;
    color: var(--color-text);
    line-height: 1.6;
    text-align: left;
  }
</style>
