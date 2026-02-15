<script lang="ts">
  import { CheckCircle2, AlertTriangle, Braces, Minimize2, WandSparkles } from "@lucide/svelte";
  import { t } from "$lib/i18n";

  interface Props {
    content?: string;
    editable?: boolean;
    onchange?: (content: string) => void;
  }

  const { content = "", editable = true, onchange }: Props = $props();

  let text = $state("");
  let parseError = $state<string | null>(null);
  let isFocused = $state(false);
  let lastExternalContent: string | null = null;

  function normalizeError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return $t("forge.json.invalid");
  }

  function validateJson(raw: string): void {
    const trimmed = raw.trim();
    if (!trimmed) {
      parseError = null;
      return;
    }
    try {
      JSON.parse(trimmed);
      parseError = null;
    } catch (err) {
      parseError = normalizeError(err);
    }
  }

  function formatJson(): void {
    try {
      const parsed = JSON.parse(text);
      text = JSON.stringify(parsed, null, 2);
      parseError = null;
      onchange?.(text);
    } catch (err) {
      parseError = normalizeError(err);
    }
  }

  function minifyJson(): void {
    try {
      const parsed = JSON.parse(text);
      text = JSON.stringify(parsed);
      parseError = null;
      onchange?.(text);
    } catch (err) {
      parseError = normalizeError(err);
    }
  }

  function handleInput(event: Event): void {
    const target = event.currentTarget as HTMLTextAreaElement;
    text = target.value;
    validateJson(text);
    onchange?.(text);
  }

  $effect(() => {
    const next = content ?? "";
    if (next === lastExternalContent) return;
    lastExternalContent = next;
    if (isFocused) return;
    text = next;
    validateJson(text);
  });
</script>

<div class="json-editor">
  <div class="toolbar">
    <div class="toolbar-left">
      <span class="mode-pill">
        <Braces size={14} />
        {$t("forge.json.mode")}
      </span>
      {#if parseError}
        <span class="status error">
          <AlertTriangle size={13} />
          {parseError}
        </span>
      {:else}
        <span class="status valid">
          <CheckCircle2 size={13} />
          {$t("forge.json.valid")}
        </span>
      {/if}
    </div>

    {#if editable}
      <div class="toolbar-right">
        <button class="action-btn" onclick={formatJson} title={$t("forge.json.format_title")}>
          <WandSparkles size={14} />
          {$t("forge.json.format")}
        </button>
        <button class="action-btn" onclick={minifyJson} title={$t("forge.json.minify_title")}>
          <Minimize2 size={14} />
          {$t("forge.json.minify")}
        </button>
      </div>
    {/if}
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
  .json-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-surface);
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .mode-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    color: var(--color-text);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status.valid {
    color: #22c55e;
  }

  .status.error {
    color: #f87171;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .action-btn:hover {
    background: var(--color-surface-hover);
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
    background: color-mix(in srgb, var(--color-bg) 94%, #0f172a);
    tab-size: 2;
  }
</style>
