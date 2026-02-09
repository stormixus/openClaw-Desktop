<script lang="ts">
  import { 
    npcThemeState, 
    getAllThemes, 
    selectTheme, 
    getThemeAvatar,
    getCharacterImage 
  } from "$lib/gateway/npcThemeStore.svelte";
  import { store } from "$lib/gateway/store.svelte";
  import type { NpcTheme } from "$lib/gateway/npcThemeTypes";
  import { X } from "@lucide/svelte";

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const themes = $derived(getAllThemes());
  const activeId = $derived(npcThemeState.activeThemeId);

  // Background preset color swatches
  const bgSwatches: Record<string, string> = {
    default: "linear-gradient(135deg, #1a1032, #2d1b69)",
    forest: "linear-gradient(135deg, #0a1f0a, #2d7a2d)",
    space: "linear-gradient(135deg, #020010, #0f0040)",
    cozy: "linear-gradient(135deg, #2a1a0a, #6a4020)",
    ocean: "linear-gradient(135deg, #001020, #005a7a)",
    sunset: "linear-gradient(135deg, #6a2050, #f0a050)",
  };

  function handleSelect(theme: NpcTheme) {
    selectTheme(theme.id, store.activeGatewayId);
    onclose();
  }

  function getBgStyle(bg: string): string {
    return bgSwatches[bg] ?? `url(${bg})`;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="theme-overlay" onclick={onclose}>
  <div class="theme-panel" onclick={(e) => e.stopPropagation()}>
    <div class="theme-header">
      <h3>🎭 NPC Themes</h3>
      <button class="close-btn" onclick={onclose}>
        <X size={16} />
      </button>
    </div>

    <div class="theme-grid">
      {#each themes as theme (theme.id)}
        <button 
          class="theme-card" 
          class:active={theme.id === activeId}
          onclick={() => handleSelect(theme)}
        >
          <div class="theme-preview" style="background: {getBgStyle(theme.background)}">
            {#if getCharacterImage(theme, "neutral")}
              <img src={getCharacterImage(theme, "neutral")} alt={theme.name} class="theme-char-thumb" />
            {:else}
              <span class="theme-avatar">{getThemeAvatar(theme, "default")}</span>
            {/if}
          </div>
          <div class="theme-info">
            <span class="theme-name">{theme.name}</span>
            <span class="theme-desc">{theme.description}</span>
          </div>
          {#if theme.id === activeId}
            <div class="active-badge">✓</div>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .theme-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .theme-panel {
    background: var(--color-bg, #1a1a2e);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 20px;
    max-width: 480px;
    width: 90vw;
    max-height: 70vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .theme-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .theme-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #e0e0ff);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary, #888);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text, #e0e0ff);
  }

  .theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .theme-card {
    position: relative;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid transparent;
    border-radius: 12px;
    padding: 0;
    cursor: pointer;
    overflow: hidden;
    text-align: left;
    transition: all 0.25s ease;
    color: var(--color-text, #e0e0ff);
  }

  .theme-card:hover {
    border-color: rgba(147, 130, 255, 0.4);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(100, 80, 200, 0.2);
  }

  .theme-card.active {
    border-color: rgba(147, 130, 255, 0.8);
    background: rgba(147, 130, 255, 0.1);
  }

  .theme-preview {
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-size: cover;
    background-position: center;
    position: relative;
  }

  .theme-avatar {
    font-size: 36px;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4));
    line-height: 1;
  }

  .theme-char-thumb {
    height: 70px;
    object-fit: contain;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4));
  }

  .theme-info {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .theme-name {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .theme-desc {
    font-size: 11px;
    color: var(--color-text-secondary, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .active-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(100, 200, 100, 0.9);
    color: #fff;
    font-size: 12px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
</style>
