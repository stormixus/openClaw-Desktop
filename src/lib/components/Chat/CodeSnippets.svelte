<script lang="ts">
  import { X, Minimize2 } from "@lucide/svelte";
  import { t } from "$lib/i18n";

  interface Snippet {
    id: string;
    code: string;
    lang: string;
  }

  let snippets = $state<Snippet[]>([]);
  let minimized = $state<Set<string>>(new Set());

  export function addSnippet(code: string, lang: string) {
    const id = crypto.randomUUID();
    snippets = [...snippets, { id, code, lang }];
  }

  export function removeSnippet(id: string) {
    snippets = snippets.filter(s => s.id !== id);
  }

  function toggleMinimize(id: string) {
    const newSet = new Set(minimized);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    minimized = newSet;
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
  }
</script>

<div class="snippets-container">
  {#each snippets as snippet, index (snippet.id)}
    <div 
      class="snippet-postit"
      class:minimized={minimized.has(snippet.id)}
      style="--offset: {index * 10}px"
    >
      <div class="postit-header">
        <span class="postit-lang">{snippet.lang || 'code'}</span>
        <div class="postit-actions">
          <button onclick={() => toggleMinimize(snippet.id)} title={$t("code.minimize")}>
            <Minimize2 size={12} />
          </button>
          <button onclick={() => removeSnippet(snippet.id)} title={$t("code.close")}>
            <X size={12} />
          </button>
        </div>
      </div>

      {#if !minimized.has(snippet.id)}
        <div class="postit-content">
          <pre><code>{snippet.code}</code></pre>
        </div>
        <button class="postit-copy" onclick={() => copyCode(snippet.code)}>
          {$t("code.copy")}
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .snippets-container {
    position: fixed;
    top: 60px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 1000;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
    pointer-events: none;
  }

  .snippet-postit {
    width: 280px;
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    border-radius: 4px;
    box-shadow: 
      2px 2px 8px rgba(0, 0, 0, 0.15),
      0 0 0 1px rgba(0, 0, 0, 0.05);
    transform: rotate(-1deg) translateX(var(--offset, 0));
    animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: auto;
    transition: all 0.2s ease;
  }

  .snippet-postit:hover {
    transform: rotate(0deg) translateX(var(--offset, 0)) scale(1.02);
    box-shadow: 
      4px 4px 16px rgba(0, 0, 0, 0.2),
      0 0 0 1px rgba(0, 0, 0, 0.05);
  }

  .snippet-postit.minimized {
    width: 120px;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: rotate(-1deg) translateX(100px);
    }
    to {
      opacity: 1;
      transform: rotate(-1deg) translateX(var(--offset, 0));
    }
  }

  .postit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
  }

  .postit-lang {
    font-size: 10px;
    font-weight: 600;
    color: #92400e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .postit-actions {
    display: flex;
    gap: 4px;
  }

  .postit-actions button {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.05);
    border: none;
    border-radius: 4px;
    color: #92400e;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .postit-actions button:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  .postit-content {
    padding: 10px;
    max-height: 200px;
    overflow: auto;
  }

  .postit-content pre {
    margin: 0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    line-height: 1.4;
    color: #451a03;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .postit-copy {
    display: block;
    width: 100%;
    padding: 6px;
    background: rgba(0, 0, 0, 0.05);
    border: none;
    border-top: 1px dashed rgba(0, 0, 0, 0.1);
    color: #92400e;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .postit-copy:hover {
    background: rgba(0, 0, 0, 0.1);
  }
</style>
