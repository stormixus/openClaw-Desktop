<script context="module" lang="ts">
  export interface ChatSettings {
    thinkingLevel: "none" | "low" | "medium" | "high";
    verbose: boolean;
    reasoning: boolean;
    deliver: boolean;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { t } from "$lib/i18n";

  export let settings: ChatSettings = {
    thinkingLevel: "medium",
    verbose: false,
    reasoning: true,
    deliver: true,
  };
  export let isOpen = false;

  const dispatch = createEventDispatcher<{
    change: ChatSettings;
    close: void;
  }>();

  const thinkingLevels = [
    { value: "none", label: "None", icon: "🚫" },
    { value: "low", label: "Low", icon: "💭" },
    { value: "medium", label: "Medium", icon: "🤔" },
    { value: "high", label: "High", icon: "🧠" },
  ] as const;

  function updateSetting<K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) {
    settings = { ...settings, [key]: value };
    dispatch("change", settings);
  }

  function setThinkingLevel(level: ChatSettings["thinkingLevel"]) {
    updateSetting("thinkingLevel", level);
  }
</script>

{#if isOpen}
  <div class="settings-panel" on:click|stopPropagation role="menu">
    <div class="header">
      <h4>⚙️ {$t("settings.chat")}</h4>
    </div>

    <div class="settings-content">
      <!-- Thinking Level -->
      <div class="setting-group">
        <label class="setting-label">{$t("settings.thinking")}</label>
        <div class="thinking-options">
          {#each thinkingLevels as level}
            <button
              class="thinking-btn"
              class:active={settings.thinkingLevel === level.value}
              on:click={() => setThinkingLevel(level.value)}
              title={level.label}
            >
              <span class="icon">{level.icon}</span>
              <span class="text">{level.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Toggle Settings -->
      <div class="toggle-group">
        <div class="toggle-item">
          <div class="toggle-info">
            <span class="toggle-label">{$t("settings.verbose")}</span>
            <span class="toggle-desc">Show detailed agent output</span>
          </div>
          <label class="toggle-switch">
            <input 
              type="checkbox" 
              checked={settings.verbose}
              on:change={(e) => updateSetting("verbose", e.currentTarget.checked)}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="toggle-item">
          <div class="toggle-info">
            <span class="toggle-label">{$t("settings.reasoning")}</span>
            <span class="toggle-desc">Display reasoning process</span>
          </div>
          <label class="toggle-switch">
            <input 
              type="checkbox" 
              checked={settings.reasoning}
              on:change={(e) => updateSetting("reasoning", e.currentTarget.checked)}
            />
            <span class="slider"></span>
          </label>
        </div>

        <div class="toggle-item">
          <div class="toggle-info">
            <span class="toggle-label">{$t("settings.deliver")}</span>
            <span class="toggle-desc">Auto-deliver completed responses</span>
          </div>
          <label class="toggle-switch">
            <input 
              type="checkbox" 
              checked={settings.deliver}
              on:change={(e) => updateSetting("deliver", e.currentTarget.checked)}
            />
            <span class="slider"></span>
          </label>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-panel {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 8px;
    width: 320px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    z-index: 50;
  }

  .header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .header h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }

  .settings-content {
    padding: 16px;
  }

  .setting-group {
    margin-bottom: 20px;
  }

  .setting-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
    margin-bottom: 8px;
  }

  .thinking-options {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .thinking-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
    background: var(--color-surface-elevated);
    border: 2px solid var(--color-border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    color: var(--color-text);
  }

  .thinking-btn:hover {
    border-color: var(--color-primary);
  }

  .thinking-btn.active {
    border-color: var(--color-primary);
    background: rgba(59, 130, 246, 0.15);
  }

  .thinking-btn .icon {
    font-size: 18px;
  }

  .thinking-btn .text {
    font-size: 10px;
    font-weight: 500;
  }

  .toggle-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .toggle-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .toggle-info {
    flex: 1;
  }

  .toggle-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
  }

  .toggle-desc {
    display: block;
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .toggle-switch {
    position: relative;
    width: 40px;
    height: 22px;
    flex-shrink: 0;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 11px;
    transition: all 0.2s ease;
  }

  .slider::before {
    content: "";
    position: absolute;
    width: 16px;
    height: 16px;
    left: 2px;
    bottom: 2px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch input:checked + .slider {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  .toggle-switch input:checked + .slider::before {
    transform: translateX(18px);
  }
</style>
