<script lang="ts">
  import { t } from "$lib/i18n";
  import { store, setModel } from "$lib/gateway/store.svelte";
  import ModelSelector from "./ModelSelector.svelte";

  interface Props {
    onsend?: (content: string) => void;
    onabort?: () => void;
  }

  const { onsend, onabort }: Props = $props();

  let inputValue = $state("");
  let textareaEl: HTMLTextAreaElement | undefined = $state(undefined);
  let showModelSelector = $state(false);

  function handleSubmit() {
    if (store.isStreaming) {
      onabort?.();
      return;
    }

    const message = inputValue.trim();
    if (!message) return;
    
    // Clear input BEFORE sending
    inputValue = "";
    adjustHeight();
    
    // Then send the message
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
  <!-- Input Field -->
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

  <!-- Toolbar (Claude Style - Below Input) -->
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="toolbar-btn" title={$t("toolbar.files")}>
        <span>➕</span>
      </button>
      <button class="toolbar-btn" title={$t("toolbar.web")}>
        <span>🌐</span>
      </button>
      <button class="toolbar-btn" title={$t("toolbar.mcp")}>
        <span>🔗</span>
      </button>
      <button class="toolbar-btn" title={$t("toolbar.session")}>
        <span>📝</span>
      </button>

      <!-- Model Selector -->
      <div class="model-selector-wrapper">
        <button 
          class="toolbar-btn model-btn"
          onclick={() => showModelSelector = !showModelSelector}
          title={$t("toolbar.model")}
        >
          <span>🤖</span>
          <span class="model-name">
            {store.modelsSnapshot?.current?.displayName ?? store.modelsSnapshot?.current?.name ?? "Model"}
          </span>
          <span class="dropdown-arrow">▼</span>
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
      <button class="toolbar-btn" title={$t("toolbar.voice")}>
        <span>🎙️</span>
      </button>
      
      <button 
        class="send-btn"
        class:abort={store.isStreaming}
        onclick={handleSubmit}
        title={store.isStreaming ? $t("chat.stop") : $t("chat.send")}
      >
        {#if store.isStreaming}
          <span class="stop-icon">⏹</span>
        {:else}
          <span class="send-icon">↑</span>
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .chat-input-wrapper {
    padding: 12px 16px;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }

  .input-container {
    margin-bottom: 8px;
  }

  textarea {
    width: 100%;
    padding: 12px 16px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 16px;
    color: var(--color-text);
    font-size: 14px;
    font-family: inherit;
    resize: none;
    outline: none;
    transition: border-color 0.2s ease;
    min-height: 44px;
    max-height: 150px;
  }

  textarea:focus {
    border-color: var(--color-primary);
  }

  textarea::placeholder {
    color: var(--color-text-muted);
  }

  textarea:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background: var(--color-surface-elevated);
    border-radius: 12px;
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
    gap: 4px;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .toolbar-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .model-selector-wrapper {
    position: relative;
  }

  .model-btn {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 16px;
    padding: 4px 10px;
  }

  .model-btn:hover {
    border-color: var(--color-primary);
  }

  .model-name {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--color-text);
  }

  .dropdown-arrow {
    font-size: 8px;
    margin-left: 2px;
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: white;
    font-size: 16px;
    transition: all 0.2s ease;
  }

  .send-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .send-btn.abort {
    background: var(--color-error);
  }

  .send-icon,
  .stop-icon {
    line-height: 1;
  }
</style>
