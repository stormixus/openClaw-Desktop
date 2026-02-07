<script lang="ts">
  import { 
    store, 
    sendMessage, 
    abortMessage 
  } from "$lib/gateway/store.svelte";
  import { t } from "$lib/i18n";
  import type { ChatMessage } from "$lib/gateway/types";
  import ChatInput from "./ChatInput.svelte";
  import MessageBubble from "./MessageBubble.svelte";
  import ImageLightbox from "./ImageLightbox.svelte";
  import CodeSnippets from "./CodeSnippets.svelte";
  import ForwardModal from "./ForwardModal.svelte";
  import { Upload } from "@lucide/svelte";

  let messagesContainer: HTMLDivElement | undefined = $state(undefined);
  let isDragOver = $state(false);
  let droppedFiles = $state<File[]>([]);
  
  // Lightbox state
  let lightboxImage = $state<string | null>(null);
  
  // Forward modal state
  let forwardContent = $state<string | null>(null);
  
  // Code snippets ref
  let codeSnippetsComponent: CodeSnippets;

  // Expose addSnippet globally for code blocks
  if (typeof window !== 'undefined') {
    (window as any).__addCodeSnippet = (code: string, lang: string) => {
      codeSnippetsComponent?.addSnippet(code, lang);
    };
  }

  // Group consecutive messages by role
  interface MessageGroup {
    role: "user" | "assistant" | "system";
    messages: ChatMessage[];
  }

  const groupedMessages = $derived(() => {
    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    for (const message of store.chatMessages) {
      if (!currentGroup || currentGroup.role !== message.role) {
        currentGroup = { role: message.role, messages: [] };
        groups.push(currentGroup);
      }
      currentGroup.messages.push(message);
    }

    return groups;
  });

  // Auto-scroll to bottom on new messages
  $effect(() => {
    if (store.chatMessages.length || store.streamingContent) {
      scrollToBottom();
    }
  });

  function scrollToBottom() {
    if (messagesContainer) {
      setTimeout(() => {
        messagesContainer!.scrollTop = messagesContainer!.scrollHeight;
      }, 10);
    }
  }

  async function handleSend(content: string, files?: File[]) {
    if (!content.trim() && (!files || files.length === 0)) return;
    await sendMessage(content, files);
    droppedFiles = [];
  }

  async function handleAbort() {
    await abortMessage();
  }

  // Drag and drop handlers
  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container entirely
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !e.currentTarget || !(e.currentTarget as HTMLElement).contains(relatedTarget)) {
      isDragOver = false;
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragOver = false;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      droppedFiles = [...droppedFiles, ...Array.from(files)];
    }
  }

  function removeFile(index: number) {
    // Revoke object URL to free memory
    const file = droppedFiles[index];
    if (file.type.startsWith('image/') && imageUrls.has(file)) {
      URL.revokeObjectURL(imageUrls.get(file)!);
      imageUrls.delete(file);
    }
    droppedFiles = droppedFiles.filter((_, i) => i !== index);
  }

  // Image preview URLs cache
  const imageUrls = new Map<File, string>();

  function getImagePreviewUrl(file: File): string {
    if (!imageUrls.has(file)) {
      imageUrls.set(file, URL.createObjectURL(file));
    }
    return imageUrls.get(file)!;
  }

  function isImage(file: File): boolean {
    return file.type.startsWith('image/');
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getFileIcon(type: string): string {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📄';
    if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return '📦';
    if (type.includes('text') || type.includes('json') || type.includes('xml')) return '📝';
    return '📎';
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  class="chat-container" 
  class:drag-over={isDragOver}
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondragover={handleDragOver}
  ondrop={handleDrop}
>
  <!-- Drop overlay -->
  {#if isDragOver}
    <div class="drop-overlay">
      <div class="drop-content">
        <div class="drop-icon">
          <Upload size={48} strokeWidth={1.5} />
        </div>
        <h3>Drop files here</h3>
        <p>Images, documents, and more</p>
      </div>
    </div>
  {/if}

  <div class="messages" bind:this={messagesContainer}>
    {#if store.chatMessages.length === 0 && !store.streamingContent}
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <p>{$t("chat.empty")}</p>
      </div>
    {:else}
      {#each groupedMessages() as group, groupIndex}
        <div class="message-group" class:user={group.role === "user"} class:assistant={group.role === "assistant"}>
          {#each group.messages as message, msgIndex (message.id)}
            <MessageBubble 
              {message} 
              isFirst={msgIndex === 0}
              isLast={msgIndex === group.messages.length - 1}
              isGrouped={group.messages.length > 1}
              onforward={(content) => forwardContent = content}
            />
          {/each}
        </div>
      {/each}
      
      {#if store.streamingContent}
        <div class="message-group assistant">
          <MessageBubble 
            message={{
              id: "streaming",
              role: "assistant",
              content: store.streamingContent,
              timestamp: new Date().toISOString(),
            }}
            showIndicator={true}
            isFirst={true}
            isLast={true}
          />
        </div>
      {/if}
    {/if}
  </div>

  <!-- Dropped files preview -->
  {#if droppedFiles.length > 0}
    <div class="files-preview">
      {#each droppedFiles as file, index}
        {#if isImage(file)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="image-preview" onclick={() => lightboxImage = getImagePreviewUrl(file)}>
            <img src={getImagePreviewUrl(file)} alt={file.name} />
            <button class="file-remove" onclick={(e) => { e.stopPropagation(); removeFile(index); }}>×</button>
            <span class="image-name">{file.name}</span>
          </div>
        {:else}
          <div class="file-item">
            <span class="file-icon">{getFileIcon(file.type)}</span>
            <div class="file-info">
              <span class="file-name">{file.name}</span>
              <span class="file-size">{formatFileSize(file.size)}</span>
            </div>
            <button class="file-remove" onclick={() => removeFile(index)}>×</button>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <ChatInput 
    onsend={(content) => handleSend(content, droppedFiles)}
    onabort={handleAbort}
  />
</div>

<!-- Lightbox -->
{#if lightboxImage}
  <ImageLightbox 
    src={lightboxImage} 
    onclose={() => lightboxImage = null} 
  />
{/if}

<!-- Forward Modal -->
{#if forwardContent}
  <ForwardModal 
    content={forwardContent} 
    onclose={() => forwardContent = null} 
  />
{/if}

<!-- Code Snippets -->
<CodeSnippets bind:this={codeSnippetsComponent} />

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--color-bg);
    position: relative;
  }

  .chat-container.drag-over {
    background: var(--color-surface-hover);
  }

  /* Drop overlay */
  .drop-overlay {
    position: absolute;
    inset: 0;
    background: rgba(99, 102, 241, 0.1);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    border: 3px dashed var(--color-primary);
    border-radius: 16px;
    margin: 8px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { border-color: var(--color-primary); }
    50% { border-color: var(--color-accent); }
  }

  .drop-content {
    text-align: center;
    color: var(--color-primary);
  }

  .drop-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
    border-radius: 20px;
    animation: bounce 0.6s ease infinite alternate;
  }

  @keyframes bounce {
    from { transform: translateY(0); }
    to { transform: translateY(-8px); }
  }

  .drop-content h3 {
    margin: 0 0 4px;
    font-size: 20px;
    font-weight: 600;
  }

  .drop-content p {
    margin: 0;
    font-size: 14px;
    opacity: 0.8;
  }

  /* Files preview */
  .files-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 20px;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }

  /* Image preview */
  .image-preview {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid var(--color-border);
    transition: all 0.2s ease;
  }

  .image-preview:hover {
    border-color: var(--color-primary);
    transform: scale(1.05);
  }

  .image-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .image-preview .file-remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .image-preview:hover .file-remove {
    opacity: 1;
  }

  .image-name {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 4px;
    background: linear-gradient(transparent, rgba(0,0,0,0.7));
    color: white;
    font-size: 9px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    max-width: 200px;
  }

  .file-icon {
    font-size: 20px;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
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

  .file-remove {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-hover);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .file-remove:hover {
    background: var(--color-error);
    color: white;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .message-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .message-group.user {
    align-items: flex-end;
  }

  .message-group.assistant {
    align-items: flex-start;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-state p {
    font-size: 14px;
  }
</style>
