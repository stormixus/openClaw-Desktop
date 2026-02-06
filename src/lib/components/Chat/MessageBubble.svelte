<script lang="ts">
  import type { ChatMessage } from "$lib/gateway/types";
  import { store } from "$lib/gateway/store.svelte";

  interface Props {
    message: ChatMessage;
    showIndicator?: boolean;
  }

  const { message, showIndicator = false }: Props = $props();
</script>

<div class="message-bubble" class:user={message.role === "user"} class:assistant={message.role === "assistant"}>
  {#if message.role === "assistant"}
    <div class="avatar">🤖</div>
  {/if}

  <div class="content">
    <p>{message.content}</p>
    {#if showIndicator && store.isStreaming}
      <span class="typing-indicator">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </span>
    {/if}
  </div>

  {#if message.role === "user"}
    <div class="avatar user-avatar">👤</div>
  {/if}
</div>

<style>
  .message-bubble {
    display: flex;
    gap: 10px;
    max-width: 85%;
  }

  .message-bubble.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  .message-bubble.assistant {
    align-self: flex-start;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-surface-elevated);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }

  .user-avatar {
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  }

  .content {
    padding: 12px 16px;
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.5;
  }

  .user .content {
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    color: white;
    border-bottom-right-radius: 4px;
  }

  .assistant .content {
    background: var(--color-surface-elevated);
    color: var(--color-text);
    border-bottom-left-radius: 4px;
  }

  .content p {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .typing-indicator {
    display: inline-flex;
    gap: 3px;
    margin-left: 8px;
    vertical-align: middle;
  }

  .dot {
    width: 6px;
    height: 6px;
    background: var(--color-text-muted);
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out;
  }

  .dot:nth-child(1) { animation-delay: 0s; }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes bounce {
    0%, 80%, 100% {
      transform: scale(0.8);
      opacity: 0.5;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
