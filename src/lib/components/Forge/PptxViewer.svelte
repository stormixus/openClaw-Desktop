<script lang="ts">
  import { onMount } from "svelte";
  import { FileText, AlertCircle } from "@lucide/svelte";

  // Note: Full PPTX rendering in JS is complex.
  // We can implement a simplified preview that extracts text/images
  // or renders a placeholder until a backend converter is available.
  // For this MVP, we'll show a "Preview Not Available" state with file info,
  // or a basic slide list if we can parse the zip structure (jszip).

  interface Props {
    file: File | null;
  }

  const { file }: Props = $props();

  let slideCount = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);

  onMount(async () => {
    if (!file) return;
    loading = true;
    // Mock loading process - in real app, unzip .pptx and read slide xmls
    setTimeout(() => {
      slideCount = 5; // Mock
      loading = false;
    }, 1000);
  });
</script>

<div class="pptx-viewer">
  {#if !file}
    <div class="empty-state">No presentation loaded</div>
  {:else if loading}
    <div class="loading-state">Loading presentation...</div>
  {:else if error}
    <div class="error-state">
      <AlertCircle size={24} />
      <span>{error}</span>
    </div>
  {:else}
    <div class="viewer-content">
      <div class="sidebar">
        {#each Array(slideCount) as _, i}
          <div class="slide-thumb">
            Slide {i + 1}
          </div>
        {/each}
      </div>
      <div class="main-view">
        <div class="slide-placeholder">
          <FileText size={48} />
          <h3>{file.name}</h3>
          <p>Slide View Placeholder</p>
          <p class="sub-text">Full PPTX rendering requires backend conversion</p>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .pptx-viewer {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    color: var(--color-text);
  }

  .viewer-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .sidebar {
    width: 200px;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .slide-thumb {
    aspect-ratio: 16/9;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .slide-thumb:hover {
    border-color: var(--color-primary);
  }

  .main-view {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
    padding: 32px;
  }

  .slide-placeholder {
    aspect-ratio: 16/9;
    width: 80%;
    background: white;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #333;
  }

  .sub-text {
    font-size: 12px;
    color: #666;
    margin-top: 8px;
  }

  .empty-state, .loading-state, .error-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }
</style>
