<script lang="ts">
  import { AlignLeft } from "@lucide/svelte";

  interface Props {
    content?: string;
    editable?: boolean;
    onchange?: (content: string) => void;
  }

  const { content = "", editable = true, onchange }: Props = $props();

  let text = $state("");
  let isFocused = $state(false);
  let lastExternalContent: string | null = null;

  function handleInput(event: Event): void {
    const target = event.currentTarget as HTMLTextAreaElement;
    text = target.value;
    onchange?.(text);
  }

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
    value={text}
    readonly={!editable}
    spellcheck={false}
    oninput={handleInput}
    onfocus={() => (isFocused = true)}
    onblur={() => (isFocused = false)}
  ></textarea>
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
</style>
