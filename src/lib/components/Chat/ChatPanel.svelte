<script lang="ts">
  import { 
    store, 
    sendMessage, 
    abortMessage 
  } from "$lib/gateway/store.svelte";
  import { t } from "$lib/i18n";
  import ChatInput from "./ChatInput.svelte";
  import MessageBubble from "./MessageBubble.svelte";

  let messagesContainer: HTMLDivElement | undefined = $state(undefined);

  // Auto-scroll to bottom on new messages
  $effect(() => {
    if (store.chatMessages.length || store.streamingContent) {
      scrollToBottom();
    }
  });

  function scrollToBottom() {
    if (messagesContainer) {
      setTimeout(() => {
        messagesContainer!.scrollTop = messagesContainer!.scrollHeight;
      }, 10);
    }
  }

  async function handleSend(content: string) {
    if (!content.trim()) return;
    await sendMessage(content);
  }

  async function handleAbort() {
    await abortMessage();
  }
</script>

<div class="chat-container">
  <div class="messages" bind:this={messagesContainer}>
    {#if store.chatMessages.length === 0 && !store.streamingContent}
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <p>{$t("chat.empty")}</p>
      </div>
    {:else}
      {#each store.chatMessages as message (message.id)}
        <MessageBubble {message} />
      {/each}
      
      {#if store.streamingContent}
        <MessageBubble 
          message={{
            id: "streaming",
            role: "assistant",
            content: store.streamingContent,
            timestamp: new Date().toISOString(),
          }}
          showIndicator={true}
        />
      {/if}
    {/if}
  </div>

  <ChatInput 
    onsend={handleSend}
    onabort={handleAbort}
  />
</div>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--color-bg);
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-state p {
    font-size: 14px;
  }
</style>
