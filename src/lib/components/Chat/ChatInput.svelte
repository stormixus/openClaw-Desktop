<script lang="ts">
  import { t } from "$lib/i18n";
  import { store, setModel, toggleNotifications, getNotificationStatus, toggleChatMode, createNewSession, switchSession } from "$lib/gateway/store.svelte";
  import ModelSelector from "./ModelSelector.svelte";
  import SessionManager from "./SessionManager.svelte";
  import ThemeSelector from "./ThemeSelector.svelte";
  import {
    getActiveTheme,
  } from "$lib/gateway/npcThemeStore.svelte";
  import { settings } from "$lib/settings";
  import { browser } from "$app/environment";
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
    X,
    FileText,
    Image as ImageIcon
  } from "@lucide/svelte";
  import PdfThumbnail from "$lib/components/FileUpload/PdfThumbnail.svelte";

  interface Props {
    onsend?: (content: string, files?: File[]) => void;
    onabort?: () => void;
    onfiles?: (files: File[]) => void;
  }

  const { onsend, onabort, onfiles }: Props = $props();

  let fileInputEl: HTMLInputElement | undefined = $state(undefined);

  let inputValue = $state("");
  let textareaEl: HTMLTextAreaElement | undefined = $state(undefined);
  let showModelSelector = $state(false);
  let showSessionManager = $state(false);
  let showThemeSelector = $state(false);
  let attachedFiles = $state<File[]>([]);

  // Input history (like shell command history)
  const HISTORY_KEY = "openclaw.inputHistory";
  const MAX_HISTORY = 50;
  let inputHistory = $state<string[]>(browser ? JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") : []);
  let historyIdx = $state(-1); // -1 = not browsing history
  let savedInput = $state(""); // saves current input when entering history

  // Slash commands
  interface SlashCommand {
    name: string;
    description: string;
    icon: string;
    action: () => void;
    hasArgs?: boolean; // if true, fill input instead of executing
  }

  function addToHistory(text: string) {
    if (!text.trim()) return;
    if (inputHistory[0] !== text) {
      inputHistory = [text, ...inputHistory].slice(0, MAX_HISTORY);
      if (browser) localStorage.setItem(HISTORY_KEY, JSON.stringify(inputHistory));
    }
    historyIdx = -1;
    savedInput = "";
  }

  function sendCmd(cmd: string) { addToHistory(cmd); onsend?.(cmd); }

  const slashCommands: SlashCommand[] = [
    // Gateway commands
    { name: "status", description: "세션 상태 (모델, 토큰, 비용)", icon: "📊", action: () => sendCmd("/status") },
    { name: "new", description: "세션 초기화", icon: "🔄", action: () => sendCmd("/new") },
    { name: "reset", description: "세션 초기화 (=new)", icon: "🔄", action: () => sendCmd("/reset") },
    { name: "compact", description: "세션 컨텍스트 압축", icon: "📦", action: () => sendCmd("/compact") },
    { name: "think", description: "사고 레벨 (off|minimal|low|medium|high|xhigh)", icon: "🧠", hasArgs: true, action: () => {} },
    { name: "verbose", description: "상세 모드 (on|off)", icon: "📝", hasArgs: true, action: () => {} },
    { name: "usage", description: "응답별 사용량 (off|tokens|full)", icon: "📈", hasArgs: true, action: () => {} },
    { name: "restart", description: "게이트웨이 재시작 (소유자 전용)", icon: "⚡", action: () => sendCmd("/restart") },
    { name: "activation", description: "그룹 활성화 모드 (mention|always)", icon: "📡", hasArgs: true, action: () => {} },
    // Local UI commands
    { name: "npc", description: "NPC 모드 전환", icon: "🎭", action: () => { toggleChatMode(); } },
    { name: "model", description: "모델 선택", icon: "🤖", action: () => { showModelSelector = true; } },
    { name: "session", description: "세션 관리", icon: "📋", action: () => { showSessionManager = true; } },
    { name: "theme", description: "NPC 테마 변경", icon: "🎨", action: () => { showThemeSelector = true; } },
    { name: "notify", description: "알림 켜기/끄기", icon: "🔔", action: () => { toggleNotifications(); } },
    { name: "history", description: "입력 기록 초기화", icon: "🕐", action: () => { inputHistory = []; if (browser) localStorage.removeItem(HISTORY_KEY); } },
  ];

  let slashMenuIdx = $state(0);
  const slashQuery = $derived(
    inputValue.startsWith("/") ? inputValue.slice(1).toLowerCase() : null
  );
  const filteredCommands = $derived(
    slashQuery !== null
      ? slashCommands.filter(c => c.name.includes(slashQuery) || c.description.includes(slashQuery))
      : []
  );
  const showSlashMenu = $derived(slashQuery !== null && filteredCommands.length > 0);

  // Reset menu index when filtered list changes
  $effect(() => {
    if (filteredCommands.length > 0) {
      slashMenuIdx = 0;
    }
  });

  function executeSlashCommand(cmd: SlashCommand) {
    if (cmd.hasArgs) {
      inputValue = `/${cmd.name} `;
      requestAnimationFrame(() => textareaEl?.focus());
    } else {
      addToHistory(`/${cmd.name}`);
      inputValue = "";
      adjustHeight();
      cmd.action();
    }
  }

  const isNpcMode = $derived(store.chatMode === "npc");
  const npcTheme = $derived(getActiveTheme());

  function handleSubmit() {
    if (store.isStreaming) {
      onabort?.();
      return;
    }

    const message = inputValue.trim();
    if (!message && attachedFiles.length === 0) return;

    if (message) {
      addToHistory(message);
    }

    inputValue = "";
    const filesToSend = [...attachedFiles];
    attachedFiles = []; // Clear attachments
    adjustHeight();

    onsend?.(message, filesToSend);

    // Re-focus textarea after sending
    requestAnimationFrame(() => textareaEl?.focus());
  }

  function handleKeydown(e: KeyboardEvent) {
    // Slash menu navigation
    if (showSlashMenu) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        slashMenuIdx = (slashMenuIdx - 1 + filteredCommands.length) % filteredCommands.length;
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        slashMenuIdx = (slashMenuIdx + 1) % filteredCommands.length;
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && !e.isComposing)) {
        e.preventDefault();
        executeSlashCommand(filteredCommands[slashMenuIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        inputValue = "";
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Arrow Up: browse history (only when cursor is at position 0 or input is empty)
    if (e.key === "ArrowUp" && inputHistory.length > 0) {
      const pos = textareaEl?.selectionStart ?? 0;
      if (pos === 0 || !inputValue) {
        e.preventDefault();
        if (historyIdx === -1) {
          savedInput = inputValue;
        }
        const next = Math.min(historyIdx + 1, inputHistory.length - 1);
        if (next !== historyIdx) {
          historyIdx = next;
          inputValue = inputHistory[historyIdx];
          requestAnimationFrame(() => {
            adjustHeight();
            textareaEl?.setSelectionRange(inputValue.length, inputValue.length);
          });
        }
      }
    }

    // Arrow Down: go forward in history
    if (e.key === "ArrowDown" && historyIdx >= 0) {
      const pos = textareaEl?.selectionStart ?? 0;
      const len = inputValue.length;
      if (pos === len || !inputValue) {
        e.preventDefault();
        historyIdx--;
        if (historyIdx < 0) {
          inputValue = savedInput;
          historyIdx = -1;
        } else {
          inputValue = inputHistory[historyIdx];
        }
        requestAnimationFrame(() => {
          adjustHeight();
          textareaEl?.setSelectionRange(inputValue.length, inputValue.length);
        });
      }
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

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const newFiles = Array.from(target.files);
      attachedFiles = [...attachedFiles, ...newFiles];
      onfiles?.(newFiles); // Optional: notify parent if needed, but we handle sending here
      target.value = "";
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      attachedFiles = [...attachedFiles, ...imageFiles];
      onfiles?.(imageFiles);
    }
  }

  function removeFile(index: number) {
    attachedFiles = attachedFiles.filter((_, i) => i !== index);
  }

  function getFileIcon(file: File) {
    if (file.type.startsWith('image/')) return ImageIcon;
    return FileText;
  }
</script>

<div class="chat-input-wrapper">
  {#if showSlashMenu}
    <div class="slash-menu">
      {#each filteredCommands as cmd, i}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="slash-item"
          class:selected={i === slashMenuIdx}
          onmouseenter={() => slashMenuIdx = i}
          onclick={() => executeSlashCommand(cmd)}
        >
          <span class="slash-icon">{cmd.icon}</span>
          <span class="slash-name">/{cmd.name}</span>
          <span class="slash-desc">{cmd.description}</span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="input-container">
    {#if attachedFiles.length > 0}
      <div class="file-previews">
        {#each attachedFiles as file, i}
          <div class="file-preview">
            <div class="file-thumbnail">
              {#if file.type.startsWith('image/')}
                <img src={URL.createObjectURL(file)} alt={file.name} onload={(e) => URL.revokeObjectURL((e.currentTarget as HTMLImageElement).src)} />
              {:else if file.type === 'application/pdf'}
                <PdfThumbnail {file} size={48} />
              {:else}
                <FileText size={24} class="file-icon" />
              {/if}
            </div>
            <div class="file-info">
              <span class="file-name">{file.name}</span>
              <span class="file-size">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
            <button class="remove-file" onclick={() => removeFile(i)}>
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
    <textarea
      bind:this={textareaEl}
      bind:value={inputValue}
      onkeydown={handleKeydown}
      oninput={adjustHeight}
      onpaste={handlePaste}
      placeholder={$t("chat.placeholder")}
      rows="1"
    ></textarea>
  </div>

  <div class="toolbar">
    <div class="toolbar-left">
      <input
        bind:this={fileInputEl}
        type="file"
        multiple
        onchange={handleFileSelect}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md"
        style="display: none"
      />
      <button class="toolbar-btn" title={$t("toolbar.files")} onclick={() => fileInputEl?.click()}>
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
          onclick={(e) => { e.stopPropagation(); showModelSelector = !showModelSelector; }}
          title={$t("toolbar.model")}
        >
          <Bot size={14} strokeWidth={2} />
          <span class="model-name">
            {store.modelsSnapshot?.current?.displayName ?? store.modelsSnapshot?.current?.name ?? $t("model.title")}
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
            title={$t("chat.npc_theme")}
          >
            <Palette size={14} strokeWidth={2} />
            <span class="model-name">{npcTheme.name}</span>
            <ChevronDown size={12} strokeWidth={2} />
          </button>

          {#if showThemeSelector}
            <ThemeSelector onclose={() => showThemeSelector = false} />
          {/if}
        </div>
      {/if}
    </div>

    <div class="toolbar-right">
      <button
        class="toolbar-btn"
        class:active={store.notificationsEnabled}
        onclick={() => toggleNotifications()}
        title={$t(store.notificationsEnabled ? "chat.notifications_on" : "chat.notifications_off")}
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
    position: relative;
    padding: var(--space-lg) var(--space-xl);
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }

  /* Slash command menu */
  .slash-menu {
    position: absolute;
    bottom: 100%;
    left: var(--space-xl);
    right: var(--space-xl);
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.25));
    padding: var(--space-xs) 0;
    max-height: 280px;
    overflow-y: auto;
    z-index: 50;
    animation: slashFadeIn 0.15s ease-out;
  }

  @keyframes slashFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .slash-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .slash-item.selected {
    background: var(--color-surface-hover);
  }

  .slash-icon {
    font-size: 16px;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }

  .slash-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
    font-family: var(--font-mono);
    flex-shrink: 0;
  }

  .slash-desc {
    font-size: 12px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .input-container {
    margin-bottom: var(--space-md);
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: 0;
    transition: all var(--duration-normal) var(--ease-out);
    box-shadow: var(--shadow-xs);
    overflow: hidden;
  }

  .input-container:focus-within {
    border-color: var(--color-primary);
    box-shadow:
      0 0 0 3px rgba(99, 102, 241, 0.08),
      var(--shadow-sm);
  }

  .file-previews {
    display: flex;
    gap: 8px;
    padding: 12px 12px 0;
    overflow-x: auto;
  }

  .file-preview {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 80px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .file-thumbnail {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-hover);
    overflow: hidden;
  }

  .file-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-icon {
    color: var(--color-text-muted);
  }

  .file-info {
    padding: 4px;
    background: var(--color-surface);
  }

  .file-name {
    display: block;
    font-size: 9px;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-size {
    display: block;
    font-size: 8px;
    color: var(--color-text-muted);
  }

  .remove-file {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .file-preview:hover .remove-file {
    opacity: 1;
  }

  textarea {
    width: 100%;
    padding: var(--space-md) 18px;
    background: transparent;
    border: none;
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
    outline: none;
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
</style>
