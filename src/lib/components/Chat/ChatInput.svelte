<script lang="ts">
  import { t } from "$lib/i18n";
  import { store, setModel, toggleNotifications, getNotificationStatus } from "$lib/gateway/store.svelte";
  import ModelSelector from "./ModelSelector.svelte";
  import SessionManager from "./SessionManager.svelte";
  import { 
    Plus, 
    Globe, 
    Link2, 
    MessageSquare, 
    Bot, 
    ChevronDown, 
    Mic, 
    ArrowUp, 
    Square,
    Bell,
    BellOff
  } from "@lucide/svelte";

  interface Props {
    onsend?: (content: string) => void;
    onabort?: () => void;
  }

  const { onsend, onabort }: Props = $props();

  let inputValue = $state("");
  let textareaEl: HTMLTextAreaElement | undefined = $state(undefined);
  let showModelSelector = $state(false);
  let showSessionManager = $state(false);

  function handleSubmit() {
    if (store.isStreaming) {
      onabort?.();
      return;
    }

    const message = inputValue.trim();
    if (!message) return;
    
    inputValue = "";
    adjustHeight();
    onsend?.(message);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function adjustHeight() {
    if (textareaEl) {
      textareaEl.style.height = "auto";
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 150) + "px";
    }
  }

  function handleModelSelect(modelId: string) {
    setModel(modelId);
    showModelSelector = false;
  }
</script>

<div class="chat-input-wrapper">
  <div class="input-container">
    <textarea
      bind:this={textareaEl}
      bind:value={inputValue}
      onkeydown={handleKeydown}
      oninput={adjustHeight}
      placeholder={$t("chat.placeholder")}
      rows="1"
      disabled={store.isStreaming}
    ></textarea>
  </div>

  <div class="toolbar">
    <div class="toolbar-left">
      <button class="toolbar-btn" title={$t("toolbar.files")}>
        <Plus size={16} strokeWidth={2} />
      </button>
      <button class="toolbar-btn" title={$t("toolbar.web")}>
        <Globe size={16} strokeWidth={2} />
      </button>
      <button class="toolbar-btn" title={$t("toolbar.mcp")}>
        <Link2 size={16} strokeWidth={2} />
      </button>
      
      <!-- Session Manager -->
      <div class="session-manager-wrapper">
        <button 
          class="toolbar-btn session-btn"
          onclick={() => showSessionManager = !showSessionManager}
          title={$t("toolbar.session")}
        >
          <MessageSquare size={14} strokeWidth={2} />
          <span class="session-key">{store.sessionKey}</span>
        </button>
        
        <SessionManager 
          isOpen={showSessionManager}
          onclose={() => showSessionManager = false}
        />
      </div>

      <!-- Model Selector -->
      <div class="model-selector-wrapper">
        <button 
          class="toolbar-btn model-btn"
          onclick={() => showModelSelector = !showModelSelector}
          title={$t("toolbar.model")}
        >
          <Bot size={14} strokeWidth={2} />
          <span class="model-name">
            {store.modelsSnapshot?.current?.displayName ?? store.modelsSnapshot?.current?.name ?? "Model"}
          </span>
          <ChevronDown size={12} strokeWidth={2} />
        </button>

        {#if showModelSelector}
          <ModelSelector 
            models={store.modelsSnapshot}
            onselect={handleModelSelect}
            onclose={() => showModelSelector = false}
          />
        {/if}
      </div>
    </div>

    <div class="toolbar-right">
      <button 
        class="toolbar-btn" 
        class:active={store.notificationsEnabled}
        onclick={() => toggleNotifications()}
        title={store.notificationsEnabled ? "Notifications on" : "Notifications off"}
      >
        {#if store.notificationsEnabled}
          <Bell size={16} strokeWidth={2} />
        {:else}
          <BellOff size={16} strokeWidth={2} />
        {/if}
      </button>
      
      <button class="toolbar-btn" title={$t("toolbar.voice")}>
        <Mic size={16} strokeWidth={2} />
      </button>
      
      <button 
        class="send-btn"
        class:abort={store.isStreaming}
        onclick={handleSubmit}
        title={store.isStreaming ? $t("chat.stop") : $t("chat.send")}
      >
        {#if store.isStreaming}
          <Square size={14} strokeWidth={2.5} />
        {:else}
          <ArrowUp size={16} strokeWidth={2.5} />
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .chat-input-wrapper {
    padding: 16px 20px;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }

  .input-container {
    margin-bottom: 12px;
  }

  textarea {
    width: 100%;
    padding: 14px 18px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    color: var(--color-text);
    font-size: 14px;
    font-family: inherit;
    resize: none;
    outline: none;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    min-height: 48px;
    max-height: 150px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  textarea:focus {
    border-color: var(--color-primary);
    box-shadow: 
      0 0 0 3px rgba(99, 102, 241, 0.1),
      0 4px 12px rgba(0, 0, 0, 0.08);
  }

  textarea::placeholder {
    color: var(--color-text-muted);
  }

  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: var(--color-surface-elevated);
    border-radius: 14px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: all 0.2s ease;
  }

  .toolbar-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .toolbar-btn.active {
    color: var(--color-primary);
  }

  .session-manager-wrapper,
  .model-selector-wrapper {
    position: relative;
  }

  .session-btn,
  .model-btn {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    padding: 6px 12px;
  }

  .session-btn:hover,
  .model-btn:hover {
    border-color: var(--color-primary);
    background: var(--color-surface);
  }

  .session-key {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--color-text);
    font-family: 'SF Mono', monospace;
  }

  .model-name {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--color-text);
    font-weight: 500;
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    color: white;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  }

  .send-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
  }

  .send-btn:active {
    transform: translateY(0);
  }

  .send-btn.abort {
    background: linear-gradient(135deg, #ef4444, #f97316);
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
  }

  .send-btn.abort:hover {
    box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
  }
</style>
