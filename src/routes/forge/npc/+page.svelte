<script lang="ts">
  import { t } from "$lib/i18n";
  import {
    npcThemeState,
    getAllThemes,
    addCustomTheme,
    removeCustomTheme,
    getCharacterImage,
    getThemeAvatar,
  } from "$lib/gateway/npcThemeStore.svelte";
  import type { NpcTheme, NpcThemeAvatar } from "$lib/gateway/npcThemeTypes";
  import { Plus, Trash2, Save, Image as ImageIcon, MessageSquare, Monitor, Smile, Eye } from "@lucide/svelte";

  // State
  let editingTheme = $state<NpcTheme | null>(null);
  let previewEmotion = $state("neutral");
  let savedToast = $state(false);

  // All expression keys
  const EXPRESSIONS = ["neutral", "happy", "thinking", "excited", "sad", "surprised", "angry", "calm"] as const;
  const EXPRESSION_LABELS: Record<string, string> = {
    neutral: "😐 Neutral",
    happy: "😊 Happy",
    thinking: "🤔 Thinking",
    excited: "🤩 Excited",
    sad: "😢 Sad",
    surprised: "😮 Surprised",
    angry: "😠 Angry",
    calm: "😌 Calm",
  };

  const BG_PRESETS = [
    { id: "default", label: "Default", gradient: "linear-gradient(135deg, #1a1032, #2d1b69)" },
    { id: "forest", label: "Forest", gradient: "linear-gradient(135deg, #0a1f0a, #2d7a2d)" },
    { id: "space", label: "Space", gradient: "linear-gradient(135deg, #020010, #0f0040)" },
    { id: "cozy", label: "Cozy", gradient: "linear-gradient(135deg, #2a1a0a, #6a4020)" },
    { id: "ocean", label: "Ocean", gradient: "linear-gradient(135deg, #001020, #005a7a)" },
    { id: "sunset", label: "Sunset", gradient: "linear-gradient(135deg, #6a2050, #f0a050)" },
  ];

  // Derived values
  const themes = $derived(getAllThemes());

  // Preview character image
  const previewCharSrc = $derived(() => {
    if (!editingTheme) return null;
    return getCharacterImage(editingTheme, previewEmotion);
  });

  // Preview avatar emoji
  const previewAvatarEmoji = $derived(() => {
    if (!editingTheme) return "?";
    return getThemeAvatar(editingTheme, previewEmotion);
  });

  // Computed bg style for preview
  const previewBgStyle = $derived(() => {
    if (!editingTheme) return "";
    const bg = editingTheme.background;
    const preset = BG_PRESETS.find(p => p.id === bg);
    if (preset) return `background: ${preset.gradient}`;
    if (bg && (bg.startsWith("http") || bg.startsWith("/"))) {
      return `background-image: url(${bg}); background-size: cover; background-position: center`;
    }
    return `background: ${BG_PRESETS[0].gradient}`;
  });

  function createNewTheme() {
    editingTheme = {
      id: `custom_${Date.now()}`,
      name: "New Persona",
      description: "A new custom character",
      avatar: { default: "🤖" },
      background: "default",
      characterFolder: "",
      systemPrompt: "You are a helpful assistant.",
      builtIn: false,
    };
    previewEmotion = "neutral";
  }

  function selectForEdit(theme: NpcTheme) {
    editingTheme = JSON.parse(JSON.stringify(theme));
    previewEmotion = "neutral";
  }

  function handleSave() {
    if (!editingTheme) return;
    addCustomTheme(editingTheme);
    savedToast = true;
    setTimeout(() => { savedToast = false; }, 2000);
  }

  function handleDelete() {
    if (!editingTheme) return;
    if (editingTheme.builtIn) return;
    removeCustomTheme(editingTheme.id);
    editingTheme = null;
  }

  function setAvatarExpression(expression: string, value: string) {
    if (!editingTheme) return;
    (editingTheme.avatar as any)[expression] = value || undefined;
  }

  function getAvatarExpression(expression: string): string {
    if (!editingTheme) return "";
    return (editingTheme.avatar as any)[expression] ?? "";
  }
</script>

<svelte:head>
  <title>Forge — NPC Personas | openClaw Desktop</title>
</svelte:head>

<div class="forge-container">
  <!-- Sidebar: Theme List -->
  <aside class="forge-sidebar">
    <div class="sidebar-header">
      <h2>🎭 Personas</h2>
      <button class="new-btn" onclick={createNewTheme}>
        <Plus size={16} />
        New
      </button>
    </div>

    <div class="theme-list">
      {#each themes as theme (theme.id)}
        <button
          class="theme-item"
          class:active={editingTheme?.id === theme.id}
          onclick={() => selectForEdit(theme)}
        >
          <div class="theme-avatar-mini">
            {#if theme.characterFolder}
              <img src="{getCharacterImage(theme, 'neutral')}" alt="" class="avatar-thumb" />
            {:else}
              <span class="avatar-emoji">{getThemeAvatar(theme, "neutral")}</span>
            {/if}
          </div>
          <div class="theme-meta">
            <span class="theme-name">{theme.name}</span>
            <span class="theme-desc">{theme.description}</span>
          </div>
          {#if theme.builtIn}
            <span class="built-in-badge">Built-in</span>
          {/if}
        </button>
      {/each}
    </div>
  </aside>

  <!-- Main Editor Area -->
  <main class="editor-area">
    {#if editingTheme}
      <div class="editor-header">
        <div class="header-left">
          <input
            type="text"
            bind:value={editingTheme.name}
            class="title-input"
            placeholder="Persona Name"
            disabled={editingTheme.builtIn}
          />
          <input
            type="text"
            bind:value={editingTheme.description}
            class="desc-input"
            placeholder="Short description..."
            disabled={editingTheme.builtIn}
          />
        </div>
        <div class="header-actions">
          {#if !editingTheme.builtIn}
            <button class="action-btn delete" onclick={handleDelete}>
              <Trash2 size={18} />
            </button>
          {/if}
          {#if !editingTheme.builtIn}
            <button class="action-btn save" onclick={handleSave}>
              <Save size={18} />
              Save
            </button>
          {/if}
        </div>
      </div>

      <div class="editor-content">
        <!-- Settings Panel -->
        <div class="settings-panel">

          <!-- Visuals Section -->
          <section class="config-section">
            <h3><Monitor size={16} /> Visuals</h3>

            <!-- Background selection -->
            <div class="input-group">
              <label>Background</label>
              <div class="preset-grid">
                {#each BG_PRESETS as preset}
                  <button
                    class="preset-swatch"
                    class:active={editingTheme.background === preset.id}
                    style="background: {preset.gradient}"
                    onclick={() => { if (editingTheme) editingTheme.background = preset.id; }}
                    disabled={editingTheme.builtIn}
                    title={preset.label}
                  >
                    {#if editingTheme.background === preset.id}
                      <span class="check">✓</span>
                    {/if}
                  </button>
                {/each}
              </div>
              <div class="url-input">
                <ImageIcon size={16} />
                <input
                  type="text"
                  bind:value={editingTheme.background}
                  placeholder="Or paste image URL..."
                  disabled={editingTheme.builtIn}
                />
              </div>
            </div>

            <!-- Character Folder -->
            <div class="input-group">
              <label>Character Images Folder</label>
              <div class="url-input">
                <Smile size={16} />
                <input
                  type="text"
                  bind:value={editingTheme.characterFolder}
                  placeholder="/avatars/my_character"
                  disabled={editingTheme.builtIn}
                />
              </div>
              <p class="hint">Folder with expression SVGs: neutral.svg, happy.svg, etc.</p>
            </div>
          </section>

          <!-- Expression Avatars Section -->
          <section class="config-section">
            <h3><Smile size={16} /> Expression Avatars</h3>
            <p class="hint" style="margin-bottom: 12px">Emoji or URL per expression (fallback to Default)</p>
            <div class="expression-grid">
              {#each EXPRESSIONS as expr}
                <div class="expression-item">
                  <label>{EXPRESSION_LABELS[expr]}</label>
                  <input
                    type="text"
                    value={getAvatarExpression(expr === "neutral" ? "default" : expr)}
                    oninput={(e) => setAvatarExpression(expr === "neutral" ? "default" : expr, (e.target as HTMLInputElement).value)}
                    placeholder={expr === "neutral" ? "Required" : "Optional"}
                    disabled={editingTheme.builtIn}
                  />
                </div>
              {/each}
            </div>
          </section>

          <!-- Personality Section -->
          <section class="config-section">
            <h3><MessageSquare size={16} /> Personality</h3>

            <div class="input-group">
              <label>System Prompt</label>
              <textarea
                bind:value={editingTheme.systemPrompt}
                rows="6"
                placeholder="You are a..."
                disabled={editingTheme.builtIn}
              ></textarea>
              <p class="hint">Define how the character speaks and behaves.</p>
            </div>
          </section>
        </div>

        <!-- Preview Panel -->
        <div class="preview-panel">
          <div class="preview-header">
            <span class="preview-label"><Eye size={14} /> Preview</span>
            <div class="emotion-tabs">
              {#each EXPRESSIONS as expr}
                <button
                  class="emotion-tab"
                  class:active={previewEmotion === expr}
                  onclick={() => { previewEmotion = expr; }}
                  title={EXPRESSION_LABELS[expr]}
                >
                  {EXPRESSION_LABELS[expr].split(" ")[0]}
                </button>
              {/each}
            </div>
          </div>

          <div class="stage-wrapper">
            <div class="preview-stage" style={previewBgStyle()}>
              <div class="preview-overlay"></div>

              <!-- Character -->
              <div class="preview-character">
                {#if previewCharSrc()}
                  <img src={previewCharSrc()} alt="Character" class="char-art" />
                {:else if editingTheme.avatar.default && editingTheme.avatar.default.startsWith("http")}
                  <img src={editingTheme.avatar.default} alt="Avatar" class="char-art" />
                {:else}
                  <div class="placeholder-char">
                    <span>{previewAvatarEmoji()}</span>
                  </div>
                {/if}
              </div>

              <!-- Dialogue box -->
              <div class="preview-dialogue">
                <span class="preview-name">{editingTheme.name}</span>
                <p class="preview-text">Hello! I'm ready to chat. Ask me anything.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {#if savedToast}
        <div class="save-toast">✓ Saved!</div>
      {/if}

    {:else}
      <div class="empty-state">
        <div class="empty-icon">🔨</div>
        <h2>Select a Persona to Edit</h2>
        <p>Or create a new one to get started.</p>
        <button class="primary-btn" onclick={createNewTheme}>Create New</button>
      </div>
    {/if}
  </main>
</div>

<style>
  .forge-container {
    display: flex;
    height: 100vh;
    background: var(--color-bg, #0d0a1a);
    color: var(--color-text, #e0e0ff);
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;

    --color-bg: #0d0a1a;
    --color-surface: rgba(15, 12, 30, 0.95);
    --color-surface-elevated: rgba(25, 22, 45, 0.9);
    --color-surface-hover: rgba(129, 140, 248, 0.08);
    --color-text: #e0e0f5;
    --color-text-muted: #7a7a95;
    --color-border: rgba(147, 130, 255, 0.12);
    --color-primary: #818cf8;
    --color-primary-hover: #6366f1;
    --color-error: #ef4444;
  }

  /* ========== Sidebar ========== */
  .forge-sidebar {
    width: 280px;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-header {
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .new-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    font-size: 12px;
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.2s;
  }

  .new-btn:hover {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .theme-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .theme-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    background: transparent;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    color: var(--color-text);
    transition: all 0.2s;
  }

  .theme-item:hover {
    background: var(--color-surface-hover);
  }

  .theme-item.active {
    background: var(--color-surface-elevated);
    box-shadow: inset 0 0 0 1px var(--color-primary);
  }

  .theme-avatar-mini {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(100, 80, 200, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .avatar-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-emoji {
    font-size: 22px;
    line-height: 1;
  }

  .theme-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .theme-name {
    font-size: 13px;
    font-weight: 500;
  }

  .theme-desc {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .built-in-badge {
    font-size: 9px;
    text-transform: uppercase;
    color: var(--color-text-muted);
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  /* ========== Editor Area ========== */
  .editor-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  .editor-header {
    padding: 16px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .title-input {
    font-size: 22px;
    font-weight: 700;
    background: transparent;
    border: none;
    outline: none;
    color: var(--color-text);
    width: 100%;
  }

  .title-input:disabled {
    opacity: 0.7;
  }

  .desc-input {
    font-size: 13px;
    color: var(--color-text-muted);
    background: transparent;
    border: none;
    outline: none;
    width: 100%;
  }

  .desc-input:disabled {
    opacity: 0.7;
  }

  .header-actions {
    display: flex;
    gap: 10px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .action-btn.save {
    background: var(--color-primary);
    color: white;
  }

  .action-btn.save:hover {
    background: var(--color-primary-hover);
  }

  .action-btn.delete {
    background: transparent;
    color: var(--color-error);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .action-btn.delete:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .editor-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* ========== Settings Panel ========== */
  .settings-panel {
    width: 380px;
    padding: 24px;
    overflow-y: auto;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 28px;
    flex-shrink: 0;
  }

  .config-section h3 {
    margin: 0 0 14px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }

  .input-group label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text);
  }

  .url-input {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 0 10px;
    color: var(--color-text-muted);
  }

  .url-input input {
    flex: 1;
    padding: 9px 4px;
    background: transparent;
    border: none;
    outline: none;
    font-size: 13px;
    color: var(--color-text);
  }

  .url-input input:disabled {
    opacity: 0.5;
  }

  .hint {
    font-size: 11px;
    color: var(--color-text-muted);
    margin: 0;
  }

  textarea {
    width: 100%;
    padding: 10px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    resize: vertical;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    color: var(--color-text);
  }

  textarea:disabled {
    opacity: 0.5;
  }

  /* Preset background swatches */
  .preset-grid {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .preset-swatch {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 12px;
  }

  .preset-swatch:hover {
    border-color: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }

  .preset-swatch.active {
    border-color: var(--color-primary);
    box-shadow: 0 0 10px rgba(129, 140, 248, 0.3);
  }

  .preset-swatch:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .preset-swatch .check {
    font-weight: bold;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }

  /* Expression avatar grid */
  .expression-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .expression-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .expression-item label {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .expression-item input {
    padding: 7px 10px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 12px;
    color: var(--color-text);
    outline: none;
    width: 100%;
  }

  .expression-item input:disabled {
    opacity: 0.5;
  }

  .expression-item input:focus {
    border-color: var(--color-primary);
  }

  /* ========== Preview Panel ========== */
  .preview-panel {
    flex: 1;
    padding: 20px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    flex-shrink: 0;
  }

  .preview-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .emotion-tabs {
    display: flex;
    gap: 2px;
  }

  .emotion-tab {
    padding: 4px 8px;
    font-size: 16px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    line-height: 1;
  }

  .emotion-tab:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .emotion-tab.active {
    background: rgba(129, 140, 248, 0.15);
    box-shadow: inset 0 0 0 1px rgba(129, 140, 248, 0.3);
  }

  .stage-wrapper {
    flex: 1;
    border-radius: 16px;
    overflow: hidden;
    position: relative;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    min-height: 300px;
  }

  .preview-stage {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
  }

  .preview-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 60%);
    z-index: 1;
  }

  .preview-character {
    position: absolute;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    height: 55%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    animation: char-breathe 4s ease-in-out infinite;
  }

  @keyframes char-breathe {
    0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
    50% { transform: translateX(-50%) translateY(-4px) scale(1.005); }
  }

  .char-art {
    max-height: 100%;
    max-width: 100%;
    object-fit: contain;
    filter: drop-shadow(0 4px 20px rgba(0, 0, 0, 0.5));
  }

  .placeholder-char {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(100, 80, 200, 0.3), rgba(60, 40, 140, 0.5));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 52px;
    border: 2px solid rgba(147, 130, 255, 0.3);
  }

  .preview-dialogue {
    position: relative;
    z-index: 3;
    width: 85%;
    margin-bottom: 24px;
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 16px 20px;
    color: white;
  }

  .preview-name {
    display: block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
    color: #a78bfa;
  }

  .preview-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    opacity: 0.9;
  }

  /* ========== Empty State ========== */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
    color: var(--color-text-muted);
  }

  .empty-icon {
    font-size: 48px;
  }

  .empty-state h2 {
    margin: 0;
    font-size: 20px;
    color: var(--color-text);
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
  }

  .primary-btn {
    padding: 10px 24px;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .primary-btn:hover {
    background: var(--color-primary-hover);
  }

  /* ========== Toast ========== */
  .save-toast {
    position: absolute;
    bottom: 24px;
    right: 24px;
    background: rgba(34, 197, 94, 0.9);
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    animation: toastIn 0.3s ease;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 100;
  }

  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
