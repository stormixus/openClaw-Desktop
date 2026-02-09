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
  import {
    getActiveTheme,
    getCharacterImage,
    getCharacterFaceLayer,
    getThemeAvatar,
  } from "$lib/gateway/npcThemeStore.svelte";
  import { getCachedBackground } from "$lib/gateway/npcBackgroundService";

  let messagesContainer: HTMLDivElement | undefined = $state(undefined);
  let isDragOver = $state(false);
  let droppedFiles = $state<File[]>([]);
  
  // Lightbox state
  let lightboxImage = $state<string | null>(null);
  
  // Forward modal state
  let forwardContent = $state<string | null>(null);
  
  // Code snippets ref
  let codeSnippetsComponent: CodeSnippets;

  // NPC mode state
  const isNpcMode = $derived(store.chatMode === "npc");
  const npcTheme = $derived(getActiveTheme());
  let npcEmotion = $state("neutral");
  let eyesOpen = $state(true);

  // Eye blink timer for NPC
  $effect(() => {
    if (!isNpcMode) return;
    const blink = () => {
      eyesOpen = false;
      setTimeout(() => { eyesOpen = true; }, 150);
    };
    const interval = setInterval(blink, 3000 + Math.random() * 4000);
    return () => clearInterval(interval);
  });

  // Emotion synonym map — groups related words to our 8 canonical emotions
  const EMOTION_SYNONYMS: Record<string, string[]> = {
    happy:     ["happy", "glad", "cheerful", "joyful", "delighted", "pleased", "grateful", "relieved", "amused", "laughing", "haha", "lol", "great", "wonderful", "smile", "smiling", "grin", "기뻐", "좋아", "감사", "웃", "행복", "즐거"],
    sad:       ["sad", "sorry", "unfortunate", "sorrow", "upset", "crying", "tearful", "heartbroken", "depressed", "gloomy", "miserable", "미안", "슬퍼", "우울", "안타깝", "눈물", "서운"],
    angry:     ["angry", "furious", "rage", "frustrated", "annoyed", "irritated", "mad", "outraged", "livid", "grumpy", "pissed", "화나", "짜증", "분노", "화남", "열받"],
    thinking:  ["think", "thinking", "hmm", "ponder", "consider", "wonder", "curious", "analyze", "contemplat", "musing", "deliberat", "생각", "음", "고민", "궁금", "흠"],
    surprised: ["surprised", "surprise", "shocked", "startled", "stunned", "astonished", "amazed", "gasp", "gasping", "faint", "whoa", "wow", "omg", "oh my", "unbelievable", "jaw", "놀라", "헐", "세상에", "맙소사", "어머", "깜짝", "충격", "멎"],
    excited:   ["excited", "thrilled", "pumped", "hyped", "ecstatic", "elated", "stoked", "enthusias", "eager", "fired up", "awesome", "amazing", "fantastic", "incredible", "신나", "대박", "우와", "짱", "최고", "흥분"],
    calm:      ["calm", "peace", "serene", "tranquil", "relax", "gentle", "soothing", "mellow", "composed", "zen", "meditat", "평온", "편안", "차분", "고요", "평화", "안정"],
  };

  // Map of face tag values → canonical emotion
  const FACE_TAG_MAP: Record<string, string> = {};
  for (const [emotion, synonyms] of Object.entries(EMOTION_SYNONYMS)) {
    for (const syn of synonyms) {
      FACE_TAG_MAP[syn] = emotion;
    }
  }

  // Derive emotion from latest assistant message
  $effect(() => {
    if (!isNpcMode) return;
    const lastAssistant = [...store.chatMessages].reverse().find(m => m.role === "assistant");
    if (!lastAssistant) { npcEmotion = "neutral"; return; }
    const text = (lastAssistant.content || "");
    const textLower = text.toLowerCase();

    // 1. Check [face:XXX] tags first (highest priority — last one wins)
    const faceTags = [...textLower.matchAll(/\[face:(\w+)\]/g)];
    if (faceTags.length > 0) {
      const lastTag = faceTags[faceTags.length - 1][1];
      if (FACE_TAG_MAP[lastTag]) {
        npcEmotion = FACE_TAG_MAP[lastTag];
        return;
      }
      // Direct match to our 8 emotions
      const validEmotions = ["happy", "sad", "angry", "thinking", "surprised", "excited", "calm", "neutral"];
      if (validEmotions.includes(lastTag)) {
        npcEmotion = lastTag;
        return;
      }
    }

    // 2. Emoji detection
    if (/😊|😄|😃|🥰|😁/.test(text)) { npcEmotion = "happy"; return; }
    if (/😢|😭|😥|🥺/.test(text)) { npcEmotion = "sad"; return; }
    if (/😠|😡|🤬|💢/.test(text)) { npcEmotion = "angry"; return; }
    if (/🤔|🧐|💭/.test(text)) { npcEmotion = "thinking"; return; }
    if (/😮|😲|😱|🫣|😳/.test(text)) { npcEmotion = "surprised"; return; }
    if (/🤩|🎉|✨|🔥/.test(text)) { npcEmotion = "excited"; return; }
    if (/😌|🧘|☮️|🌿/.test(text)) { npcEmotion = "calm"; return; }

    // 3. Keyword matching — check each emotion group
    for (const [emotion, keywords] of Object.entries(EMOTION_SYNONYMS)) {
      for (const kw of keywords) {
        if (textLower.includes(kw)) {
          npcEmotion = emotion;
          return;
        }
      }
    }

    npcEmotion = "neutral";
  });

  // Override emotion to 'thinking' while streaming
  const npcDisplayEmotion = $derived(
    isNpcMode && store.isStreaming ? "thinking" : npcEmotion
  );

  const npcCharSrc = $derived(getCharacterImage(npcTheme, npcDisplayEmotion));

  // NPC background map
  const NPC_BACKGROUNDS: Record<string, string> = {
    default: "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    space:   "linear-gradient(180deg, #0b0c1e 0%, #1a1040 40%, #2d1b69 70%, #0b0c1e 100%)",
    forest:  "linear-gradient(180deg, #0a1f0a 0%, #1a3a1a 40%, #2d4a2d 70%, #0f2b0f 100%)",
    ocean:   "linear-gradient(180deg, #0a1628 0%, #0d2137 40%, #164060 70%, #0a1628 100%)",
    sunset:  "linear-gradient(180deg, #1a0a1e 0%, #4a1942 30%, #8b3a4a 60%, #d4724a 100%)",
  };
  const npcBg = $derived(isNpcMode ? (NPC_BACKGROUNDS[npcTheme.background] ?? NPC_BACKGROUNDS.default) : "");
  // AI-generated background takes priority over gradient
  const npcBgImage = $derived(isNpcMode ? getCachedBackground(npcTheme.id) : null);

  // Thinking indicator phrases
  const THINKING_PHRASES = [
    "Thinking...", "Pondering...", "Hmm...", "Let me think...",
    "Processing...", "Considering...", "Working on it...",
    "생각 중...", "고민 중...", "분석 중...", "음...",
    "잠시만요...", "생각하는 중...",
  ];
  let thinkingPhraseIdx = $state(0);
  $effect(() => {
    if (!store.isStreaming || store.streamingContent) return;
    thinkingPhraseIdx = Math.floor(Math.random() * THINKING_PHRASES.length);
    const interval = setInterval(() => {
      thinkingPhraseIdx = (thinkingPhraseIdx + 1) % THINKING_PHRASES.length;
    }, 2500);
    return () => clearInterval(interval);
  });

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
  class:npc-mode={isNpcMode}
  style:background={npcBgImage ? undefined : (npcBg || undefined)}
  style:background-image={npcBgImage ? `url(${npcBgImage})` : undefined}
  style:background-size={npcBgImage ? 'cover' : undefined}
  style:background-position={npcBgImage ? 'center' : undefined}
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

  <!-- NPC Character Layer (behind messages) -->
  {#if isNpcMode}
    <div class="npc-character-layer">
      {#if npcTheme.characterParts}
        <!-- Parts-based layered rendering with animation -->
        <div class="npc-parts-container">
          <img src={npcTheme.characterParts.arm_left} alt="" class="npc-part npc-arm npc-arm-left" />
          <img src={npcTheme.characterParts.arm_right} alt="" class="npc-part npc-arm npc-arm-right" />
          <img src={npcTheme.characterParts.body} alt="" class="npc-part npc-body" />
          {#if eyesOpen}
            <img src={npcTheme.characterParts.eyes_open} alt="" class="npc-part npc-eyes" />
          {:else}
            <img src={npcTheme.characterParts.eyes_closed} alt="" class="npc-part npc-eyes" />
          {/if}
          {#if getCharacterFaceLayer(npcTheme, npcDisplayEmotion)}
            <img src={getCharacterFaceLayer(npcTheme, npcDisplayEmotion)} alt="" class="npc-part npc-face" />
          {/if}
        </div>
      {:else if npcCharSrc}
        <img src={npcCharSrc} alt={npcTheme.name} class="npc-character-img" />
      {:else}
        <div class="npc-character-emoji">{getThemeAvatar(npcTheme, npcEmotion)}</div>
      {/if}
    </div>
  {/if}

  <div class="messages" bind:this={messagesContainer}>
    {#if store.chatMessages.length === 0 && !store.streamingContent}
      <div class="empty-state">
        <div class="empty-icon">{isNpcMode ? getThemeAvatar(npcTheme, 'neutral') : '💬'}</div>
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

      <!-- Standalone thinking indicator (before first content arrives) -->
      {#if store.isStreaming && !store.streamingContent}
        <div class="message-group assistant">
          <div class="thinking-standalone">
            <span class="thinking-dot"></span>
            <span class="thinking-text">{THINKING_PHRASES[thinkingPhraseIdx]}</span>
          </div>
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
    background: rgba(99, 102, 241, 0.08);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    border: 2px dashed var(--color-primary);
    border-radius: var(--radius-lg);
    margin: var(--space-sm);
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
    width: 72px;
    height: 72px;
    margin: 0 auto var(--space-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.1));
    border-radius: var(--radius-xl);
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
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-xl);
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }

  /* Image preview */
  .image-preview {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 2px solid var(--color-border);
    transition: all var(--duration-fast) var(--ease-out);
  }

  .image-preview:hover {
    border-color: var(--color-primary);
    transform: scale(1.03);
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
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    position: relative;
    z-index: 1;
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
    margin-bottom: var(--space-lg);
    opacity: 0.4;
  }

  .empty-state p {
    font-size: 13px;
    color: var(--color-text-subtle);
  }

  /* ====== NPC Mode Styles ====== */
  .chat-container.npc-mode {
    position: relative;
  }

  .npc-character-layer {
    position: absolute;
    left: 0;
    top: 40%;
    transform: translateY(-50%);
    width: 38%;
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
    z-index: 2;
  }

  .npc-character-img {
    width: 85%;
    max-height: 75%;
    object-fit: contain;
    object-position: bottom;
    filter: drop-shadow(0 4px 24px rgba(0,0,0,0.3));
    transition: opacity 0.3s ease;
  }

  .npc-character-emoji {
    font-size: 120px;
    filter: drop-shadow(0 4px 16px rgba(0,0,0,0.2));
    user-select: none;
  }

  .npc-parts-container {
    position: relative;
    width: 240px;
    height: 280px;
    animation: npcIdle 3s ease-in-out infinite;
  }

  .npc-part {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .npc-body { z-index: 2; }
  .npc-eyes { z-index: 3; }
  .npc-face { z-index: 3; }
  
  .npc-arm {
    z-index: 1;
    transform-origin: 50% 60%;
  }

  .npc-arm-left {
    animation: armSwingLeft 4s ease-in-out infinite;
  }

  .npc-arm-right {
    animation: armSwingRight 4s ease-in-out infinite;
  }

  @keyframes npcIdle {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }

  @keyframes armSwingLeft {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-5deg); }
  }

  @keyframes armSwingRight {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(5deg); }
  }

  /* Push messages to the right in NPC mode */
  .chat-container.npc-mode .messages {
    padding-left: 38%;
  }

  .chat-container.npc-mode .files-preview {
    padding-left: 38%;
  }

  .thinking-standalone {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(12px);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(255, 255, 255, 0.06);
    max-width: 240px;
    animation: fadeInUp 0.3s ease-out;
  }

  .thinking-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-primary, #6366f1);
    animation: pulse 1.4s ease-in-out infinite;
    flex-shrink: 0;
  }

  .thinking-text {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
    transition: opacity 0.3s ease;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.1); }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
