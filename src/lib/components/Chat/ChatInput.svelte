<script lang="ts">
  import { t } from "$lib/i18n";
  import { store, setModel, toggleNotifications, getNotificationStatus } from "$lib/gateway/store.svelte";
  import ModelSelector from "./ModelSelector.svelte";
  import SessionManager from "./SessionManager.svelte";
  import ThemeSelector from "./ThemeSelector.svelte";
  import { 
    getActiveTheme,
  } from "$lib/gateway/npcThemeStore.svelte";
  import { hasGoogleAiKey, generateNpcBackground, getCachedBackground } from "$lib/gateway/npcBackgroundService";
  import { settings } from "$lib/settings";
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
    BellOff,
    Palette,
    Image,
    LoaderCircle
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
  let showThemeSelector = $state(false);
  let isGeneratingBg = $state(false);

  const isNpcMode = $derived(store.chatMode === "npc");
  const npcTheme = $derived(getActiveTheme());
  const showBgGenBtn = $derived(isNpcMode && hasGoogleAiKey());
  const hasCachedBg = $derived(isNpcMode ? !!getCachedBackground(npcTheme.id) : false);

  async function handleGenerateBg() {
    if (isGeneratingBg) return;
    isGeneratingBg = true;
    try {
      const result = await generateNpcBackground(npcTheme.id, npcTheme.background);
      if (!result.success) {
        console.error("[BG] Generation failed:", result.error);
      }
    } finally {
      isGeneratingBg = false;
    }
  }

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
    // Re-focus textarea after sending
    requestAnimationFrame(() => textareaEl?.focus());
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
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

      <!-- NPC Theme Selector (only in NPC mode) -->
      {#if isNpcMode}
        <div class="model-selector-wrapper">
          <button 
            class="toolbar-btn model-btn npc-theme-btn"
            onclick={() => showThemeSelector = !showThemeSelector}
            title="NPC Theme"
          >
            <Palette size={14} strokeWidth={2} />
            <span class="model-name">{npcTheme.name}</span>
            <ChevronDown size={12} strokeWidth={2} />
          </button>

          {#if showThemeSelector}
            <ThemeSelector onclose={() => showThemeSelector = false} />
          {/if}
        </div>

        <!-- AI Background Generate Button -->
        {#if showBgGenBtn}
          <button 
            class="toolbar-btn npc-bg-btn"
            class:has-bg={hasCachedBg}
            onclick={handleGenerateBg}
            disabled={isGeneratingBg}
            title={hasCachedBg ? "Regenerate background" : "Generate AI background"}
          >
            {#if isGeneratingBg}
              <LoaderCircle size={14} strokeWidth={2} class="spin" />
            {:else}
              <Image size={14} strokeWidth={2} />
            {/if}
          </button>
        {/if}
      {/if}
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
    padding: var(--space-lg) var(--space-xl);
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }

  .input-container {
    margin-bottom: var(--space-md);
  }

  textarea {
    width: 100%;
    padding: var(--space-md) 18px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    color: var(--color-text);
    font-size: 14px;
    font-family: var(--font-sans);
    resize: none;
    outline: none;
    transition: all var(--duration-normal) var(--ease-out);
    min-height: 48px;
    max-height: 150px;
    box-shadow: var(--shadow-xs);
    line-height: 1.5;
  }

  textarea:focus {
    border-color: var(--color-primary);
    box-shadow: 
      0 0 0 3px rgba(99, 102, 241, 0.08),
      var(--shadow-sm);
  }

  textarea::placeholder {
    color: var(--color-text-subtle);
  }

  textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xs) var(--space-sm);
    background: var(--color-surface-elevated);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-xs);
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    padding: var(--space-sm) 10px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-text-subtle);
    transition: all var(--duration-fast) var(--ease-out);
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
    border-radius: var(--radius-full);
    padding: var(--space-xs) var(--space-md);
  }

  .session-btn:hover,
  .model-btn:hover {
    border-color: var(--color-border-strong);
    background: var(--color-surface);
  }

  .session-key {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
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
    width: 34px;
    height: 34px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    color: white;
    transition: all var(--duration-normal) var(--ease-out);
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

  .npc-bg-btn {
    position: relative;
  }

  .npc-bg-btn.has-bg {
    color: var(--color-success, #22c55e);
  }

  .npc-bg-btn:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
