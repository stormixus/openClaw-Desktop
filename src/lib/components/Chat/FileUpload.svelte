<script context="module" lang="ts">
  export interface UploadedFile {
    id: string;
    name: string;
    size: number;
    type: string;
    preview?: string;
    file: File;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { t } from "$lib/i18n";

  export let files: UploadedFile[] = [];
  export let maxFiles = 10;
  export let maxSize = 50 * 1024 * 1024; // 50MB

  const dispatch = createEventDispatcher<{
    add: UploadedFile[];
    remove: string;
  }>();

  let isDragging = false;
  let fileInput: HTMLInputElement;

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    
    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles) {
      await processFiles(Array.from(droppedFiles));
    }
  }

  async function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      await processFiles(Array.from(target.files));
      target.value = "";
    }
  }

  async function processFiles(fileList: File[]) {
    const newFiles: UploadedFile[] = [];

    for (const file of fileList) {
      if (files.length + newFiles.length >= maxFiles) {
        break;
      }

      if (file.size > maxSize) {
        console.warn(`File ${file.name} exceeds max size`);
        continue;
      }

      const uploadedFile: UploadedFile = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        file,
      };

      // Generate preview for images
      if (file.type.startsWith("image/")) {
        uploadedFile.preview = await createImagePreview(file);
      }

      newFiles.push(uploadedFile);
    }

    if (newFiles.length > 0) {
      dispatch("add", newFiles);
    }
  }

  function createImagePreview(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  }

  function removeFile(id: string) {
    dispatch("remove", id);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getFileIcon(type: string): string {
    if (type.startsWith("image/")) return "🖼️";
    if (type.includes("pdf")) return "📕";
    if (type.includes("word") || type.includes("document")) return "📄";
    if (type.includes("excel") || type.includes("spreadsheet")) return "📊";
    if (type.includes("powerpoint") || type.includes("presentation")) return "📽️";
    if (type.includes("text")) return "📝";
    if (type.includes("video")) return "🎬";
    if (type.includes("audio")) return "🎵";
    if (type.includes("zip") || type.includes("archive")) return "📦";
    return "📎";
  }

  function openFilePicker() {
    fileInput?.click();
  }
</script>

<div 
  class="file-upload"
  class:dragging={isDragging}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
  role="region"
  aria-label="File upload area"
>
  <input
    bind:this={fileInput}
    type="file"
    multiple
    on:change={handleFileSelect}
    style="display: none"
    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md"
  />

  {#if files.length === 0}
    <button class="upload-trigger" on:click={openFilePicker}>
      <span class="icon">➕</span>
      <span class="label">{$t("file.add")}</span>
    </button>
  {:else}
    <div class="file-previews">
      {#each files as file (file.id)}
        <div class="file-item">
          {#if file.preview}
            <img src={file.preview} alt={file.name} class="preview-image" />
          {:else}
            <span class="file-icon">{getFileIcon(file.type)}</span>
          {/if}
          <div class="file-info">
            <span class="file-name">{file.name}</span>
            <span class="file-size">{formatSize(file.size)}</span>
          </div>
          <button class="remove-btn" on:click={() => removeFile(file.id)} title="Remove">
            ✕
          </button>
        </div>
      {/each}
      
      {#if files.length < maxFiles}
        <button class="add-more" on:click={openFilePicker}>
          <span>+</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

{#if isDragging}
  <div class="drop-overlay">
    <div class="drop-content">
      <span class="drop-icon">📥</span>
      <p>Drop files here</p>
    </div>
  </div>
{/if}

<style>
  .file-upload {
    position: relative;
  }

  .file-upload.dragging {
    opacity: 0.7;
  }

  .upload-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 13px;
    transition: all 0.15s ease;
  }

  .upload-trigger:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .upload-trigger .icon {
    font-size: 16px;
  }

  .file-previews {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px 0;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    max-width: 200px;
  }

  .preview-image {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 4px;
  }

  .file-icon {
    font-size: 24px;
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-size {
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .remove-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 12px;
    transition: all 0.15s ease;
  }

  .remove-btn:hover {
    background: var(--color-error);
    color: white;
  }

  .add-more {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px dashed var(--color-border);
    border-radius: 8px;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 20px;
    transition: all 0.15s ease;
  }

  .add-more:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .drop-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    pointer-events: none;
  }

  .drop-content {
    text-align: center;
    color: white;
  }

  .drop-icon {
    font-size: 64px;
    margin-bottom: 16px;
    display: block;
  }

  .drop-content p {
    font-size: 18px;
    font-weight: 500;
  }
</style>
