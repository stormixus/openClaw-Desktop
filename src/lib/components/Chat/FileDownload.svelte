<script lang="ts">
  import { FileText, Download, Check, AlertCircle } from "@lucide/svelte";
  import { t } from "$lib/i18n";

  interface Props {
    fileName: string;
    contentType?: string;
    content?: string; // Base64 content
    url?: string;     // Download URL
    size?: string;    // Human readable size
  }

  const { fileName, contentType = "application/octet-stream", content, url, size }: Props = $props();

  let isDownloading = $state(false);
  let downloadStatus = $state<"idle" | "success" | "error">("idle");

  async function handleDownload() {
    isDownloading = true;
    downloadStatus = "idle";

    try {
      if (content) {
        // Handle Base64 content download
        const byteCharacters = atob(content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: contentType });

        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        window.URL.revokeObjectURL(link.href);

        downloadStatus = "success";
      } else if (url) {
        // Validate URL scheme
        if (!/^https?:\/\//.test(url) && !/^blob:/.test(url)) {
          throw new Error("Invalid URL scheme");
        }

        // Handle URL download
        // In Tauri, we might want to use the download API or open in browser
        // For now, simple anchor tag behavior
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.target = "_blank";
        link.click();

        downloadStatus = "success";
      } else {
        throw new Error("No content or URL provided");
      }
    } catch (e) {
      console.error("Download failed:", e);
      downloadStatus = "error";
    } finally {
      isDownloading = false;
      setTimeout(() => {
        if (downloadStatus === "success") downloadStatus = "idle";
      }, 3000);
    }
  }
</script>

<div class="file-download-card">
  <div class="icon-wrapper">
    <FileText size={24} strokeWidth={1.5} />
  </div>

  <div class="file-info">
    <div class="filename" title={fileName}>{fileName}</div>
    {#if size}
      <div class="meta">{size}</div>
    {/if}
  </div>

  <button
    class="download-btn"
    class:success={downloadStatus === "success"}
    class:error={downloadStatus === "error"}
    onclick={handleDownload}
    disabled={isDownloading}
    title={$t("message.download")}
  >
    {#if isDownloading}
      <div class="spinner"></div>
    {:else if downloadStatus === "success"}
      <Check size={16} />
    {:else if downloadStatus === "error"}
      <AlertCircle size={16} />
    {:else}
      <Download size={16} />
    {/if}
  </button>
</div>

<style>
  .file-download-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    max-width: 320px;
    margin-top: 8px;
    transition: border-color 0.2s;
  }

  .file-download-card:hover {
    border-color: var(--color-border-strong);
  }

  .icon-wrapper {
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--color-surface-hover);
    border-radius: 8px;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .filename {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .download-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .download-btn:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  .download-btn.success {
    color: var(--color-success);
    border-color: var(--color-success);
    background: rgba(34, 197, 94, 0.1);
  }

  .download-btn.error {
    color: var(--color-error);
    border-color: var(--color-error);
    background: rgba(239, 68, 68, 0.1);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
