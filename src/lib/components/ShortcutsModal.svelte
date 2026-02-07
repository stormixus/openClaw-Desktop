<script lang="ts">
  import { X, Keyboard } from "@lucide/svelte";
  import { shortcuts } from "$lib/services/shortcuts";

  interface Props {
    onclose?: () => void;
  }

  const { onclose }: Props = $props();

  const allShortcuts = shortcuts.getAll();

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose?.();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={handleOverlayClick}>
  <div class="modal">
    <div class="header">
      <div class="header-left">
        <Keyboard size={20} />
        <h2>Keyboard Shortcuts</h2>
      </div>
      <button class="close-btn" onclick={() => onclose?.()}>
        <X size={18} />
      </button>
    </div>

    <div class="shortcuts-list">
      {#each allShortcuts as shortcut}
        <div class="shortcut-item">
          <span class="shortcut-desc">{shortcut.description}</span>
          <kbd class="shortcut-key">{shortcuts.formatShortcut(shortcut)}</kbd>
        </div>
      {/each}

      {#if allShortcuts.length === 0}
        <div class="empty">No shortcuts registered</div>
      {/if}
    </div>

    <div class="footer">
      <span class="hint">Press ESC to close</span>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    width: 400px;
    max-width: 90vw;
    max-height: 80vh;
    background: var(--color-surface);
    border-radius: 16px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    animation: slideUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes slideUp {
    from { 
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to { 
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--color-primary);
  }

  .header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .shortcuts-list {
    padding: 12px 20px;
    max-height: 400px;
    overflow-y: auto;
  }

  .shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--color-border);
  }

  .shortcut-item:last-child {
    border-bottom: none;
  }

  .shortcut-desc {
    font-size: 13px;
    color: var(--color-text);
  }

  .shortcut-key {
    padding: 4px 10px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-family: 'SF Mono', monospace;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .empty {
    text-align: center;
    padding: 20px;
    color: var(--color-text-muted);
    font-size: 14px;
  }

  .footer {
    padding: 12px 20px;
    border-top: 1px solid var(--color-border);
    text-align: center;
  }

  .hint {
    font-size: 12px;
    color: var(--color-text-muted);
  }
</style>
