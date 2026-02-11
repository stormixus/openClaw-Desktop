<script lang="ts">
  import DiffViewer from './DiffViewer.svelte';
  import type { PatchPreview } from '$lib/stores/document.svelte';
  import { Check, X, Save, AlertTriangle } from '@lucide/svelte';
  import { fade, fly } from 'svelte/transition';

  interface Props {
    preview: PatchPreview;
    fileName: string;
    onApprove: () => void;
    onReject: () => void;
  }

  const { preview, fileName, onApprove, onReject }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onReject();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-backdrop" transition:fade={{ duration: 200 }}>
  <div class="modal-card" transition:fly={{ y: 20, duration: 300 }}>
    <div class="modal-header">
      <div class="title-group">
        <AlertTriangle class="icon-warn" size={20} />
        <div>
          <h3>Review Changes</h3>
          <span class="subtitle">Agent wants to modify <strong>{fileName}</strong></span>
        </div>
      </div>
      <button class="close-btn" onclick={onReject} aria-label="Close">
        <X size={20} />
      </button>
    </div>

    <div class="modal-body">
      <DiffViewer changes={preview.changes} summary={preview.summary} />
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick={onReject}>
        <X size={16} />
        Reject
      </button>

      <!-- Placeholder for "Save As" if needed later -->
      <!-- <button class="btn btn-outline">Save As...</button> -->

      <button class="btn btn-primary" onclick={onApprove}>
        <Check size={16} />
        Approve & Save
      </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 24px;
  }

  .modal-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    width: 100%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
  }

  .modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .title-group {
    display: flex;
    gap: 12px;
  }

  :global(.icon-warn) {
    color: #f59e0b; /* amber-500 */
    margin-top: 2px;
  }

  h3 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
  }

  .subtitle {
    font-size: 13px;
    color: var(--color-text-muted);
  }

  strong {
    color: var(--color-text);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    background: var(--color-bg);
  }

  .modal-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    background: var(--color-surface);
    border-radius: 0 0 var(--radius-xl) var(--radius-xl);
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: var(--color-primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--color-primary-hover, #4f46e5);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }

  .btn-secondary {
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .btn-secondary:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border-hover);
  }

  /* .btn-outline {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text);
  } */
</style>
