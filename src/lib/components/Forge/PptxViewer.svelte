<script lang="ts">
  interface SlideData {
    name: string;
    content: string;
  }

  interface Props {
    slides: SlideData[];
    editable?: boolean;
    isAgentEditing?: boolean;
    onchange?: (slideIndex: number, content: string) => void;
  }

  const { slides, editable = false, isAgentEditing = false, onchange }: Props = $props();

  let currentSlideIndex = $state(0);
  let debounceTimer = $state<ReturnType<typeof setTimeout> | null>(null);

  const currentSlide = $derived(slides[currentSlideIndex] ?? null);
  const totalSlides = $derived(slides.length);

  function selectSlide(index: number) {
    if (index >= 0 && index < totalSlides) {
      currentSlideIndex = index;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    // Don't intercept arrows when editing content
    if (editable && (event.target as HTMLElement)?.isContentEditable) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectSlide(currentSlideIndex - 1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectSlide(currentSlideIndex + 1);
    }
  }

  function handleSlideInput(event: Event) {
    if (!onchange) return;
    const target = event.target as HTMLElement;
    const newHtml = target.innerHTML;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onchange(currentSlideIndex, newHtml);
    }, 350);
  }

  function stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="pptx-viewer">
  {#if totalSlides === 0}
    <div class="empty-state">No slides found</div>
  {:else}
    <div class="viewer-content">
      <!-- Slide sidebar -->
      <div class="sidebar">
        <div class="sidebar-header">
          {totalSlides} Slides
        </div>
        <div class="slide-list">
          {#each slides as slide, i}
            <button
              type="button"
              class="slide-thumb"
              class:active={i === currentSlideIndex}
              onclick={() => selectSlide(i)}
            >
              <span class="slide-number">{i + 1}</span>
              <span class="slide-preview">{stripHtml(slide.content).slice(0, 60) || "(empty)"}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Main slide view -->
      <div class="main-view">
        <div class="slide-header">
          <span class="slide-indicator">{currentSlide?.name ?? ""} / {totalSlides}</span>
          {#if editable}
            <span class="editable-badge">Editable</span>
          {/if}
        </div>
        <div class="slide-canvas">
          {#if isAgentEditing}
            <div class="agent-editing-overlay">
              <div class="agent-editing-spinner"></div>
              <span>AI가 슬라이드를 수정하고 있습니다...</span>
            </div>
          {/if}
          {#if currentSlide}
            {#if editable}
              <div
                class="slide-content"
                contenteditable="true"
                oninput={handleSlideInput}
              >
                {@html currentSlide.content}
              </div>
            {:else}
              <div class="slide-content">
                {@html currentSlide.content}
              </div>
            {/if}
          {/if}
        </div>
        <div class="slide-nav">
          <button
            type="button"
            class="nav-btn"
            disabled={currentSlideIndex === 0}
            onclick={() => selectSlide(currentSlideIndex - 1)}
          >
            Prev
          </button>
          <span class="nav-indicator">{currentSlideIndex + 1} / {totalSlides}</span>
          <button
            type="button"
            class="nav-btn"
            disabled={currentSlideIndex >= totalSlides - 1}
            onclick={() => selectSlide(currentSlideIndex + 1)}
          >
            Next
          </button>
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

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    font-size: 14px;
  }

  .viewer-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    width: 200px;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-header {
    padding: 12px 16px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
  }

  .slide-list {
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .slide-thumb {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    font-size: 11px;
    color: var(--color-text-muted);
    transition: border-color 0.15s, background 0.15s;
  }

  .slide-thumb:hover {
    border-color: var(--color-primary);
    background: var(--color-surface-hover);
  }

  .slide-thumb.active {
    border-color: var(--color-primary);
    background: rgba(99, 102, 241, 0.1);
  }

  .slide-number {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: var(--color-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 10px;
    color: var(--color-text);
  }

  .slide-thumb.active .slide-number {
    background: var(--color-primary);
    color: white;
  }

  .slide-preview {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.4;
  }

  /* Main View */
  .main-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg);
  }

  .slide-header {
    padding: 8px 16px;
    border-bottom: 1px solid var(--color-border);
    font-size: 12px;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .slide-indicator {
    font-weight: 500;
  }

  .editable-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 2px 6px;
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border-radius: 4px;
  }

  .slide-canvas {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 24px;
    position: relative;
  }

  .agent-editing-overlay {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-primary);
    backdrop-filter: blur(4px);
  }

  .agent-editing-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(99, 102, 241, 0.3);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .slide-content {
    width: 100%;
    max-width: 900px;
    min-height: 400px;
    background: white;
    color: #1a1a1a;
    border-radius: 4px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
    padding: 40px 48px;
    line-height: 1.6;
    font-size: 14px;
  }

  .slide-content[contenteditable="true"] {
    outline: none;
    border: 2px solid transparent;
    transition: border-color 0.15s;
  }

  .slide-content[contenteditable="true"]:focus {
    border-color: var(--color-primary);
  }

  .slide-content :global(h1) {
    font-size: 28px;
    font-weight: 700;
    margin: 0 0 16px;
  }

  .slide-content :global(h2) {
    font-size: 22px;
    font-weight: 600;
    margin: 0 0 12px;
  }

  .slide-content :global(h3) {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 8px;
  }

  .slide-content :global(p) {
    margin: 0 0 8px;
  }

  .slide-content :global(.slide-root) {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Navigation */
  .slide-nav {
    padding: 8px 16px;
    border-top: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .nav-btn {
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 12px;
    cursor: pointer;
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--color-surface-hover);
    border-color: var(--color-primary);
  }

  .nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .nav-indicator {
    font-size: 12px;
    color: var(--color-text-muted);
    font-weight: 500;
    min-width: 60px;
    text-align: center;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .sidebar {
      width: 140px;
    }

    .slide-content {
      padding: 24px;
    }
  }
</style>
