<script lang="ts">
  import type { ChatMessage, AgentInfo, ToolCall } from "$lib/gateway/types";
  import { store, getCurrentAgent, selectButton, confirmMultiSelect } from "$lib/gateway/store.svelte";
  import { locale } from "$lib/i18n";
  import { marked } from "marked";
  import hljs from "highlight.js";
  import { 
    Bot, User, Terminal, ChevronDown, Check, ExternalLink, Send, Copy,
    Wrench, Loader2, CheckCircle, XCircle, ChevronRight, Forward, MoreHorizontal
  } from "@lucide/svelte";
  import AgentProfilePopup from "./AgentProfilePopup.svelte";

  interface Props {
    message: ChatMessage;
    showIndicator?: boolean;
    isFirst?: boolean;
    isLast?: boolean;
    isGrouped?: boolean;
    onforward?: (content: string) => void;
  }

  const { message, showIndicator = false, isFirst = true, isLast = true, isGrouped = false, onforward }: Props = $props();

  // State for system message expansion
  let isExpanded = $state(false);
  
  // State for agent profile popup
  let showAgentProfile = $state(false);
  
  // State for tool calls expansion
  let expandedTools = $state<Set<string>>(new Set());
  
  // State for message actions menu
  let showActions = $state(false);
  let copied = $state(false);

  function toggleToolExpand(toolId: string) {
    const newSet = new Set(expandedTools);
    if (newSet.has(toolId)) {
      newSet.delete(toolId);
    } else {
      newSet.add(toolId);
    }
    expandedTools = newSet;
  }

  function getToolStatusIcon(status: ToolCall["status"]) {
    switch (status) {
      case "pending": return "⏳";
      case "running": return "spinner";
      case "complete": return "✓";
      case "error": return "✗";
    }
  }

  // Get current agent info
  const agent = $derived(getCurrentAgent());

  // Configure marked with highlight.js
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // Custom renderer for code blocks with copy button
  const renderer = new marked.Renderer();
  renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(text, { language }).value;
    const langLabel = lang || 'code';
    const encodedCode = encodeURIComponent(text);
    const encodedLang = encodeURIComponent(langLabel);
    return `<div class="code-block">
      <div class="code-header">
        <span class="code-lang">${langLabel}</span>
        <div class="code-actions">
          <button class="note-btn" onclick="window.__addCodeSnippet && window.__addCodeSnippet(decodeURIComponent('${encodedCode}'), decodeURIComponent('${encodedLang}'))" title="Pin to sticky note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-5-5z"></path>
              <polyline points="16 3 16 8 21 8"></polyline>
            </svg>
          </button>
          <button class="copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodedCode}'))">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
        </div>
      </div>
      <pre><code class="hljs language-${language}">${highlighted}</code></pre>
    </div>`;
  };
  marked.use({ renderer });

  // Detect and format JSON content as code blocks
  function formatJsonContent(text: string): string {
    // Try parsing the entire trimmed text as JSON
    const trimmed = text.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        const formatted = JSON.stringify(parsed, null, 2);
        return '```json\n' + formatted + '\n```';
      } catch { /* not valid JSON, continue */ }
    }
    
    // Try to find JSON blocks embedded in text (e.g., "Some text:\n{...}")
    return text.replace(/^(.*?)(\{[\s\S]*\})([\s\S]*)$/m, (_match, before, jsonStr, after) => {
      try {
        const parsed = JSON.parse(jsonStr);
        const formatted = JSON.stringify(parsed, null, 2);
        return (before ? before + '\n' : '') + '```json\n' + formatted + '\n```' + (after?.trim() ? '\n' + after.trim() : '');
      } catch {
        return _match;
      }
    });
  }

  // Strip NPC directive tags from display text
  function stripDirectives(text: string): string {
    return text.replace(/\[(?:face|act|bg):[^\]]*\]/gi, '').trim();
  }

  // Render markdown to HTML
  const renderedContent = $derived.by(() => {
    let content = message.content;
    // Strip NPC directive tags before rendering
    content = stripDirectives(content);
    // Auto-detect JSON for all message roles
    content = formatJsonContent(content);
    return marked.parse(content) as string;
  });

  // Truncated content for system messages
  const truncatedContent = $derived(() => {
    if (message.role !== "system") return message.content;
    const maxLength = 80;
    if (message.content.length <= maxLength) return message.content;
    return message.content.substring(0, maxLength) + "...";
  });

  // Format timestamp based on locale
  function formatTime(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      const currentLocale = $locale === "ko" ? "ko-KR" : "en-US";
      return date.toLocaleTimeString(currentLocale, {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(message.content);
    copied = true;
    setTimeout(() => copied = false, 2000);
    showActions = false;
  }

  function forwardMessage() {
    onforward?.(message.content);
    showActions = false;
  }

  function toggleExpand() {
    if (message.role === "system") {
      isExpanded = !isExpanded;
    }
  }

  function handleButtonClick(callbackData: string | undefined, text: string, url: string | undefined) {
    if (url) {
      window.open(url, '_blank');
      return;
    }
    if (callbackData) {
      selectButton(message.id, callbackData, text);
    }
  }

  function isButtonSelected(callbackData: string | undefined): boolean {
    if (!callbackData) return false;
    if (message.selectMode === "multi") {
      return message.selectedButtons?.includes(callbackData) ?? false;
    }
    return message.selectedButton === callbackData;
  }

  function isButtonsLocked(): boolean {
    return message.selectedButton !== undefined;
  }

  function isMultiSelect(): boolean {
    return message.selectMode === "multi";
  }

  function hasMultiSelections(): boolean {
    return (message.selectedButtons?.length ?? 0) > 0;
  }

  function handleConfirm() {
    confirmMultiSelect(message.id);
  }
</script>

{#if message.role === "system"}
  <!-- System Message (collapsible) -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="system-message" 
    class:expanded={isExpanded}
    onclick={toggleExpand}
  >
    <div class="system-icon">
      <Terminal size={14} strokeWidth={2} />
    </div>
    <div class="system-content">
      {#if isExpanded}
        <p class="full-content">{message.content}</p>
      {:else}
        <p class="truncated-content">{truncatedContent()}</p>
      {/if}
    </div>
    <div class="expand-icon" class:rotated={isExpanded}>
      <ChevronDown size={14} strokeWidth={2} />
    </div>
  </div>
{:else}
  <!-- User/Assistant Message -->
  <div 
    class="message-bubble" 
    class:user={message.role === "user"} 
    class:assistant={message.role === "assistant"} 
    class:grouped={isGrouped && !isFirst}
    draggable="true"
    ondragstart={(e) => {
      e.dataTransfer?.setData("text/plain", message.content);
      e.dataTransfer!.effectAllowed = "copy";
    }}
  >
    {#if message.role === "assistant" && isFirst}
      <div class="avatar-column">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="avatar assistant-avatar clickable" onclick={() => showAgentProfile = true}>
          {#if agent?.avatar}
            <img src={agent.avatar} alt={agent.name} class="avatar-img" />
          {:else if agent?.emoji}
            <span class="avatar-emoji">{agent.emoji}</span>
          {:else}
            <Bot size={18} strokeWidth={1.5} />
          {/if}
        </div>
        {#if agent?.name}
          <span class="agent-label">{agent.name}</span>
        {/if}
      </div>
    {:else if message.role === "assistant" && isGrouped}
      <div class="avatar-spacer"></div>
    {/if}

    <div class="content-wrapper">
      <!-- Tool Calls -->
      {#if message.toolCalls && message.toolCalls.length > 0}
        <div class="tool-calls">
          {#each message.toolCalls as tool (tool.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div 
              class="tool-call" 
              class:expanded={expandedTools.has(tool.id)}
              class:running={tool.status === "running"}
              class:error={tool.status === "error"}
            >
              <div class="tool-header" onclick={() => toggleToolExpand(tool.id)}>
                <div class="tool-icon">
                  {#if tool.status === "running"}
                    <Loader2 size={14} class="spinning" />
                  {:else if tool.status === "complete"}
                    <CheckCircle size={14} />
                  {:else if tool.status === "error"}
                    <XCircle size={14} />
                  {:else}
                    <Wrench size={14} />
                  {/if}
                </div>
                <span class="tool-name">{tool.name}</span>
                <div class="tool-expand" class:rotated={expandedTools.has(tool.id)}>
                  <ChevronRight size={12} />
                </div>
              </div>
              
              {#if expandedTools.has(tool.id)}
                <div class="tool-details">
                  <div class="tool-section">
                    <span class="tool-label">Arguments</span>
                    <pre class="tool-code">{JSON.stringify(tool.args, null, 2)}</pre>
                  </div>
                  {#if tool.result !== undefined}
                    <div class="tool-section">
                      <span class="tool-label">Result</span>
                      <pre class="tool-code">{typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result, null, 2)}</pre>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div 
        class="content" 
        class:first={isFirst} 
        class:last={isLast} 
        class:middle={!isFirst && !isLast}
        onmouseenter={() => showActions = true}
        onmouseleave={() => showActions = false}
      >
        {#if message.role === "assistant"}
          <div class="markdown-body">
            {@html renderedContent}
          </div>
        {:else}
          <div class="markdown-body">
            {@html renderedContent}
          </div>
        {/if}
        {#if showIndicator && store.isStreaming}
          <span class="typing-indicator">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </span>
        {/if}
        
        <!-- Message Actions -->
        <div class="message-actions" class:visible={showActions}>
          <button class="action-btn" onclick={copyMessage} title="Copy">
            {#if copied}
              <Check size={14} />
            {:else}
              <Copy size={14} />
            {/if}
          </button>
          {#if store.gateways.length > 1}
            <button class="action-btn" onclick={forwardMessage} title="Forward to another gateway">
              <Forward size={14} />
            </button>
          {/if}
        </div>
      </div>
      
      <!-- Inline Buttons -->
      {#if message.buttons && message.buttons.length > 0}
        <div class="inline-buttons" class:multi={isMultiSelect()}>
          {#if isMultiSelect() && !isButtonsLocked()}
            <div class="multi-hint">여러 개 선택 가능</div>
          {/if}
          {#each message.buttons as row}
            <div class="button-row">
              {#each row as button}
                <button
                  class="inline-btn"
                  class:selected={isButtonSelected(button.callback_data)}
                  class:disabled={isButtonsLocked()}
                  disabled={isButtonsLocked()}
                  onclick={() => handleButtonClick(button.callback_data, button.text, button.url)}
                >
                  {#if isButtonSelected(button.callback_data)}
                    <Check size={14} strokeWidth={2} />
                  {/if}
                  {#if button.url}
                    <ExternalLink size={12} strokeWidth={2} />
                  {/if}
                  <span>{button.text}</span>
                </button>
              {/each}
            </div>
          {/each}
          
          <!-- Multi-select confirm button -->
          {#if isMultiSelect() && !isButtonsLocked()}
            <button
              class="confirm-btn"
              class:has-selections={hasMultiSelections()}
              disabled={!hasMultiSelections()}
              onclick={handleConfirm}
            >
              <Send size={14} strokeWidth={2} />
              <span>선택 완료 ({message.selectedButtons?.length ?? 0})</span>
            </button>
          {/if}
        </div>
      {/if}
      
      {#if message.timestamp && isLast}
        <span class="timestamp">{formatTime(message.timestamp)}</span>
      {/if}
    </div>

    {#if message.role === "user" && isFirst}
      <div class="avatar user-avatar">
        <User size={18} strokeWidth={1.5} />
      </div>
    {:else if message.role === "user" && isGrouped}
      <div class="avatar-spacer"></div>
    {/if}
  </div>
{/if}

<!-- Agent Profile Popup -->
{#if showAgentProfile && agent}
  <AgentProfilePopup 
    {agent} 
    onclose={() => showAgentProfile = false} 
  />
{/if}

<style>
  /* System Message Styles */
  .system-message {
    align-self: center;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    max-width: 80%;
    padding: 10px 14px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-out);
  }

  .system-message:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-primary);
  }

  .system-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .system-content {
    flex: 1;
    min-width: 0;
  }

  .system-content p {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .truncated-content {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .full-content {
    white-space: pre-wrap;
    word-break: break-word;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .expand-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
    transition: transform 0.3s ease;
  }

  .expand-icon.rotated {
    transform: rotate(180deg);
  }

  .system-message.expanded {
    max-width: 90%;
  }

  /* Regular Message Styles */
  .message-bubble {
    display: flex;
    gap: var(--space-sm);
    max-width: 85%;
    cursor: grab;
  }

  .message-bubble:active {
    cursor: grabbing;
  }

  .message-bubble.grouped {
    margin-top: -8px;
  }

  .message-bubble.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  .message-bubble.assistant {
    align-self: flex-start;
  }

  .avatar-spacer {
    width: 46px;
    flex-shrink: 0;
  }

  .avatar-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
    width: 46px;
  }

  .agent-label {
    font-size: 9px;
    color: var(--color-text-subtle);
    text-align: center;
    max-width: 46px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1;
  }

  .content-wrapper {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .message-bubble.user .content-wrapper {
    align-items: flex-end;
  }

  .message-bubble.assistant .content-wrapper {
    align-items: flex-start;
  }

  .timestamp {
    font-size: 10px;
    color: var(--color-text-muted);
    opacity: 0.7;
    padding: 0 4px;
  }

  /* Inline Buttons */
  .inline-buttons {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }

  .inline-buttons.multi {
    padding: 8px;
    background: var(--color-surface);
    border-radius: 12px;
    border: 1px solid var(--color-border);
  }

  .multi-hint {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }

  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .inline-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    cursor: pointer;
    font-size: 13px;
    color: var(--color-text);
    transition: all 0.2s ease;
  }

  .inline-btn:hover:not(.disabled) {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }

  .inline-btn.selected {
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border-color: transparent;
    color: white;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  }

  .inline-btn.disabled:not(.selected) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .confirm-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 16px;
    margin-top: 8px;
    background: var(--color-surface-elevated);
    border: 1px dashed var(--color-border);
    border-radius: 10px;
    cursor: not-allowed;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-muted);
    transition: all 0.2s ease;
  }

  .confirm-btn.has-selections {
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border: none;
    color: white;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
  }

  .confirm-btn.has-selections:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
  }

  /* Tool Calls */
  .tool-calls {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }

  .tool-call {
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .tool-call.running {
    border-color: rgba(251, 191, 36, 0.4);
    background: rgba(251, 191, 36, 0.1);
  }

  .tool-call.error {
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.1);
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .tool-header:hover {
    background: rgba(99, 102, 241, 0.15);
  }

  .tool-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary);
  }

  .tool-call.running .tool-icon {
    color: #fbbf24;
  }

  .tool-call.error .tool-icon {
    color: #ef4444;
  }

  :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .tool-name {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-mono);
    color: var(--color-text);
  }

  .tool-expand {
    color: var(--color-text-muted);
    transition: transform 0.2s ease;
  }

  .tool-expand.rotated {
    transform: rotate(90deg);
  }

  .tool-details {
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: slideDown 0.2s ease;
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .tool-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tool-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tool-code {
    margin: 0;
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 150px;
    overflow-y: auto;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .avatar.clickable {
    cursor: pointer;
  }

  .avatar.clickable:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.5);
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 12px;
    object-fit: cover;
  }

  .avatar-emoji {
    font-size: 20px;
  }

  .assistant-avatar {
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    color: white;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  }

  .user-avatar {
    background: linear-gradient(135deg, #3b82f6, #06b6d4);
    color: white;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  }

  .content {
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-lg);
    font-size: 14px;
    line-height: 1.6;
    overflow: hidden;
    min-width: 0;
    max-width: 100%;
    word-break: break-word;
  }

  /* Grouped message radius adjustments */
  .user .content.first { border-bottom-right-radius: 6px; }
  .user .content.middle { border-radius: 16px 6px 6px 16px; }
  .user .content.last { border-top-right-radius: 6px; }

  .assistant .content.first { border-bottom-left-radius: 6px; }
  .assistant .content.middle { border-radius: 6px 16px 16px 6px; }
  .assistant .content.last { border-top-left-radius: 6px; }

  .user .content {
    background: rgba(99, 102, 241, 0.18);
    color: var(--color-text);
  }

  .assistant .content {
    background: var(--color-surface-elevated);
    color: var(--color-text);
  }

  .content {
    position: relative;
  }

  .content p {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Message Actions */
  .message-actions {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    gap: 2px;
    opacity: 0;
    transform: translateY(-4px);
    transition: all 0.15s ease;
    pointer-events: none;
  }

  .message-actions.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: all 0.15s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .action-btn:hover {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
    transform: scale(1.1);
  }

  /* Markdown Styles */
  .markdown-body {
    line-height: 1.6;
    overflow: hidden;
    max-width: 100%;
  }

  .markdown-body :global(p) {
    margin: 0 0 0.75em;
  }

  .markdown-body :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3),
  .markdown-body :global(h4) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-body :global(h1) { font-size: 1.4em; }
  .markdown-body :global(h2) { font-size: 1.2em; }
  .markdown-body :global(h3) { font-size: 1.1em; }
  .markdown-body :global(h4) { font-size: 1em; }

  .markdown-body :global(ul),
  .markdown-body :global(ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  .markdown-body :global(li) {
    margin: 0.25em 0;
  }

  .markdown-body :global(code) {
    background: var(--color-surface);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  .markdown-body :global(pre) {
    background: var(--color-surface);
    padding: 12px 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0.75em 0;
  }

  .markdown-body :global(pre code) {
    background: transparent;
    padding: 0;
    font-size: 0.85em;
    line-height: 1.5;
  }

  .markdown-body :global(blockquote) {
    margin: 0.75em 0;
    padding-left: 1em;
    border-left: 3px solid var(--color-primary);
    color: var(--color-text-muted);
  }

  .markdown-body :global(a) {
    color: var(--color-primary);
    text-decoration: none;
  }

  .markdown-body :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-body :global(strong) {
    font-weight: 600;
  }

  .markdown-body :global(em) {
    font-style: italic;
  }

  .markdown-body :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 1em 0;
  }

  .markdown-body :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.75em 0;
  }

  .markdown-body :global(th),
  .markdown-body :global(td) {
    border: 1px solid var(--color-border);
    padding: 8px 12px;
    text-align: left;
  }

  .markdown-body :global(th) {
    background: rgba(0, 0, 0, 0.1);
    font-weight: 600;
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

  /* Code Block Styles */
  :global(.code-block) {
    margin: 0.75em 0;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    max-width: 100%;
  }

  :global(.code-header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--color-surface-hover);
    border-bottom: 1px solid var(--color-border);
  }

  :global(.code-lang) {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  :global(.code-actions) {
    display: flex;
    gap: 4px;
  }

  :global(.note-btn) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-accent);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  :global(.note-btn:hover) {
    background: var(--color-surface-elevated);
    border-color: var(--color-accent);
    transform: scale(1.1);
  }

  :global(.copy-btn) {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  :global(.copy-btn:hover) {
    background: var(--color-surface-elevated);
    color: var(--color-text);
    border-color: var(--color-border-strong);
  }

  :global(.copy-btn:active) {
    transform: scale(0.95);
  }

  :global(.code-block pre) {
    margin: 0;
    padding: 16px;
    overflow-x: auto;
  }

  :global(.code-block code) {
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.5;
  }

  /* Highlight.js Theme - adapts to light/dark via CSS variables */
  :global(.hljs) {
    background: transparent !important;
    color: var(--color-text);
  }

  :global(.hljs-keyword) { color: var(--color-primary); }
  :global(.hljs-string) { color: #16a34a; }
  :global(.hljs-number) { color: #ea580c; }
  :global(.hljs-function) { color: #2563eb; }
  :global(.hljs-title) { color: #2563eb; }
  :global(.hljs-params) { color: #c026d3; }
  :global(.hljs-comment) { color: var(--color-text-muted); font-style: italic; }
  :global(.hljs-built_in) { color: #dc2626; }
  :global(.hljs-type) { color: #ca8a04; }
  :global(.hljs-attr) { color: #0891b2; }
  :global(.hljs-property) { color: #0891b2; }
  :global(.hljs-variable) { color: var(--color-text); }
  :global(.hljs-operator) { color: #0d9488; }
  :global(.hljs-punctuation) { color: var(--color-text-muted); }
</style>
