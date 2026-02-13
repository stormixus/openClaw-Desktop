<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { AlignLeft } from "@lucide/svelte";

  interface Props {
    content?: string;
    editable?: boolean;
    onchange?: (content: string) => void;
    onInlinePrompt?: (selectedText: string, instruction: string) => Promise<string>;
  }

  const { content = "", editable = true, onchange, onInlinePrompt }: Props = $props();

  let text = $state("");
  let isFocused = $state(false);
  let lastExternalContent: string | null = null;
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let inlinePromptOpen = $state(false);
  let inlinePromptX = $state(0);
  let inlinePromptY = $state(0);
  let inlinePromptInstruction = $state("");
  let inlinePromptError = $state<string | null>(null);
  let inlinePromptBusy = $state(false);
  let inlinePromptEl = $state<HTMLDivElement | null>(null);
  let inlinePromptInputEl = $state<HTMLTextAreaElement | null>(null);
  let inlineSelectionStart = $state(0);
  let inlineSelectionEnd = $state(0);
  let inlineSelectedText = $state("");

  const INLINE_PROMPT_WIDTH = 360;
  const INLINE_PROMPT_MIN_HEIGHT = 180;

  function handleInput(event: Event): void {
    const target = event.currentTarget as HTMLTextAreaElement;
    text = target.value;
    onchange?.(text);
  }

  function closeInlinePrompt(): void {
    inlinePromptOpen = false;
    inlinePromptInstruction = "";
    inlinePromptError = null;
    inlinePromptBusy = false;
  }

  function selectedPreviewText(): string {
    const trimmed = inlineSelectedText.trim();
    if (trimmed.length <= 120) return trimmed;
    return `${trimmed.slice(0, 120)}...`;
  }

  function positionInlinePrompt(clientX: number, clientY: number): void {
    if (typeof window === "undefined") {
      inlinePromptX = clientX;
      inlinePromptY = clientY;
      return;
    }
    const margin = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const preferredX = clientX + 10;
    const preferredY = clientY + 10;
    const openAbove = preferredY + INLINE_PROMPT_MIN_HEIGHT > viewportH - margin;

    inlinePromptX = Math.max(
      margin,
      Math.min(preferredX, viewportW - INLINE_PROMPT_WIDTH - margin),
    );
    inlinePromptY = Math.max(
      margin,
      Math.min(
        openAbove ? clientY - INLINE_PROMPT_MIN_HEIGHT - 10 : preferredY,
        viewportH - INLINE_PROMPT_MIN_HEIGHT - margin,
      ),
    );
  }

  function handleEditorContextMenu(event: MouseEvent): void {
    if (!editable || !onInlinePrompt || !textareaEl) return;
    const start = textareaEl.selectionStart ?? 0;
    const end = textareaEl.selectionEnd ?? 0;
    if (end <= start) return;
    const selected = textareaEl.value.slice(start, end).trim();
    if (!selected) return;

    event.preventDefault();
    inlineSelectionStart = start;
    inlineSelectionEnd = end;
    inlineSelectedText = selected;
    inlinePromptInstruction = "";
    inlinePromptError = null;
    inlinePromptBusy = false;
    positionInlinePrompt(event.clientX, event.clientY);
    inlinePromptOpen = true;
    requestAnimationFrame(() => {
      inlinePromptInputEl?.focus();
    });
  }

  async function submitInlinePrompt(): Promise<void> {
    if (!onInlinePrompt || inlinePromptBusy) return;
    const instruction = inlinePromptInstruction.trim();
    if (!instruction) {
      inlinePromptError = "명령을 입력해주세요.";
      return;
    }

    inlinePromptBusy = true;
    inlinePromptError = null;
    try {
      const rewritten = (await onInlinePrompt(inlineSelectedText, instruction)).trim();
      if (!rewritten) {
        throw new Error("AI 응답이 비어 있습니다.");
      }
      const next = `${text.slice(0, inlineSelectionStart)}${rewritten}${text.slice(inlineSelectionEnd)}`;
      text = next;
      onchange?.(next);
      closeInlinePrompt();
      requestAnimationFrame(() => {
        if (!textareaEl) return;
        const caret = inlineSelectionStart + rewritten.length;
        textareaEl.focus();
        textareaEl.setSelectionRange(caret, caret);
      });
    } catch (err: unknown) {
      inlinePromptError = err instanceof Error ? err.message : "AI 수정 요청에 실패했습니다.";
    } finally {
      inlinePromptBusy = false;
    }
  }

  function handleInlinePromptKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitInlinePrompt();
    }
  }

  function handleWindowPointerDown(event: MouseEvent): void {
    if (!inlinePromptOpen) return;
    const target = event.target as Node | null;
    if (target && inlinePromptEl?.contains(target)) return;
    closeInlinePrompt();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (!inlinePromptOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeInlinePrompt();
    }
  }

  onMount(() => {
    window.addEventListener("mousedown", handleWindowPointerDown, true);
    window.addEventListener("keydown", handleWindowKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("mousedown", handleWindowPointerDown, true);
    window.removeEventListener("keydown", handleWindowKeydown);
  });

  $effect(() => {
    const next = content ?? "";
    if (next === lastExternalContent) return;
    lastExternalContent = next;
    if (isFocused) return;
    text = next;
  });
</script>

<div class="plain-editor">
  <div class="toolbar">
    <span class="mode-pill">
      <AlignLeft size={14} />
      Plain Text
    </span>
  </div>

  <textarea
    class="editor"
    bind:this={textareaEl}
    value={text}
    readonly={!editable}
    spellcheck={false}
    oninput={handleInput}
    oncontextmenu={handleEditorContextMenu}
    onfocus={() => (isFocused = true)}
    onblur={() => (isFocused = false)}
  ></textarea>

  {#if inlinePromptOpen}
    <div
      class="inline-agent-prompt"
      bind:this={inlinePromptEl}
      style={`left:${inlinePromptX}px; top:${inlinePromptY}px;`}
    >
      <div class="inline-agent-head">
        <strong>선택 텍스트 AI 수정</strong>
        <span>{selectedPreviewText()}</span>
      </div>
      <textarea
        class="inline-agent-input"
        bind:this={inlinePromptInputEl}
        bind:value={inlinePromptInstruction}
        placeholder='예: "좀 더 길게", "좀 더 구체적으로"'
        onkeydown={handleInlinePromptKeydown}
      ></textarea>
      {#if inlinePromptError}
        <div class="inline-agent-error">{inlinePromptError}</div>
      {/if}
      <div class="inline-agent-actions">
        <button type="button" class="inline-btn secondary" onclick={closeInlinePrompt} disabled={inlinePromptBusy}>
          취소
        </button>
        <button type="button" class="inline-btn primary" onclick={submitInlinePrompt} disabled={inlinePromptBusy}>
          {inlinePromptBusy ? "처리 중..." : "적용"}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .plain-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-surface);
  }

  .toolbar {
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
  }

  .mode-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-size: 11px;
    font-weight: 600;
  }

  .editor {
    flex: 1;
    width: 100%;
    border: none;
    outline: none;
    resize: none;
    padding: 14px;
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 13px;
    line-height: 1.55;
    color: var(--color-text);
    background: var(--color-bg);
  }

  .inline-agent-prompt {
    position: fixed;
    width: min(360px, calc(100vw - 24px));
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-surface-elevated) 94%, #0f172a);
    box-shadow: 0 18px 34px rgba(2, 6, 23, 0.28);
    z-index: 1600;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .inline-agent-head {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .inline-agent-head strong {
    font-size: 12px;
    color: var(--color-text);
  }

  .inline-agent-head span {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inline-agent-input {
    width: 100%;
    min-height: 72px;
    max-height: 140px;
    resize: vertical;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 12px;
    line-height: 1.45;
    padding: 8px 10px;
    outline: none;
    font-family: inherit;
  }

  .inline-agent-input:focus {
    border-color: color-mix(in srgb, var(--color-primary) 65%, var(--color-border));
  }

  .inline-agent-error {
    font-size: 11px;
    color: #ef4444;
  }

  .inline-agent-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .inline-btn {
    border-radius: 7px;
    border: 1px solid transparent;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .inline-btn.secondary {
    border-color: var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .inline-btn.secondary:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  .inline-btn.primary {
    background: var(--color-primary);
    color: #ffffff;
  }

  .inline-btn.primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .inline-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
