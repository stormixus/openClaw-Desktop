<script lang="ts">
  import { onMount } from "svelte";
  import { settings, saveSettings } from "$lib/settings";
  import { t } from "$lib/i18n";
  import { Plus, Trash2, Key, Eye, EyeOff } from "@lucide/svelte";

  // Local state for the form
  let keys = $state<{ key: string; value: string; visible: boolean }[]>([]);
  let isDirty = $state(false);

  // Initialize from settings
  $effect(() => {
    if ($settings.apiKeys) {
      try {
        // In store, apiKeys is already an object, not a string
        const currentKeys = $settings.apiKeys;
        // Only update if keys is empty to avoid overwriting user edits
        if (keys.length === 0 && Object.keys(currentKeys).length > 0) {
          keys = Object.entries(currentKeys).map(([k, v]) => ({
            key: k,
            value: v as string,
            visible: false
          }));
        }
      } catch (e) {
        console.error("Failed to parse API keys:", e);
      }
    }
  });

  function addKey() {
    keys = [...keys, { key: "", value: "", visible: true }];
    isDirty = true;
  }

  function removeKey(index: number) {
    keys = keys.filter((_, i) => i !== index);
    isDirty = true;
    save();
  }

  function toggleVisibility(index: number) {
    keys[index].visible = !keys[index].visible;
  }

  function updateKey(index: number, field: "key" | "value", val: string) {
    if (field === "key") keys[index].key = val;
    else keys[index].value = val;
    isDirty = true;
  }

  async function save() {
    const keysObj: Record<string, string> = {};
    keys.forEach(k => {
      if (k.key.trim()) {
        keysObj[k.key.trim()] = k.value.trim();
      }
    });

    try {
      // Update global settings object directly
      // Note: In Svelte 5 with proxied state, we should update properties, not replace the object if possible
      // But settings is likely a reactive object from $lib/settings

      // We need to call a method to update it in the store AND save to DB
      await saveSettings({
        ...$settings,
        apiKeys: keysObj as any // Cast to satisfy type checker if needed, but it should match ApiKeys type roughly
      });
      isDirty = false;
    } catch (e) {
      console.error("Failed to save API keys:", e);
    }
  }
</script>

<div class="api-keys-panel">
  <div class="header">
    <h3>{$t("settings.api_keys")}</h3>
    <button class="add-btn" onclick={addKey}>
      <Plus size={14} />
      <span>{$t("settings.add_key")}</span>
    </button>
  </div>

  <div class="keys-list">
    {#if keys.length === 0}
      <div class="empty-state">
        <Key size={32} />
        <p>{$t("settings.no_keys")}</p>
      </div>
    {:else}
      {#each keys as k, i}
        <div class="key-row">
          <input
            type="text"
            placeholder="Service Name (e.g. OPENAI_API_KEY)"
            value={k.key}
            oninput={(e) => updateKey(i, "key", e.currentTarget.value)}
            class="key-input"
          />
          <div class="value-wrapper">
            <input
              type={k.visible ? "text" : "password"}
              placeholder="API Key Value"
              value={k.value}
              oninput={(e) => updateKey(i, "value", e.currentTarget.value)}
              onblur={save}
              class="value-input"
            />
            <button class="icon-btn" onclick={() => toggleVisibility(i)} title="Toggle visibility">
              {#if k.visible}
                <EyeOff size={14} />
              {:else}
                <Eye size={14} />
              {/if}
            </button>
          </div>
          <button class="icon-btn delete" onclick={() => removeKey(i)} title="Remove">
            <Trash2 size={14} />
          </button>
        </div>
      {/each}
    {/if}
  </div>

  {#if isDirty}
    <div class="save-indicator">
      <span>Unsaved changes...</span>
      <button class="save-btn" onclick={save}>Save</button>
    </div>
  {/if}
</div>

<style>
  .api-keys-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
  }

  .add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .add-btn:hover {
    background: var(--color-primary-hover);
  }

  .keys-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
    background: var(--color-bg);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    border: 1px dashed var(--color-border);
  }

  .empty-state p {
    margin-top: var(--space-sm);
    font-size: 13px;
  }

  .key-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  input {
    background: var(--color-input-bg, rgba(0,0,0,0.05));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    color: var(--color-text);
    font-size: 13px;
  }

  :global([data-theme="dark"]) input {
    background: rgba(255,255,255,0.05);
  }

  input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .key-input {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .value-wrapper {
    flex: 2;
    display: flex;
    position: relative;
  }

  .value-input {
    width: 100%;
    padding-right: 32px;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .icon-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: color 0.2s;
  }

  .value-wrapper .icon-btn {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
  }

  .icon-btn:hover {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  .icon-btn.delete:hover {
    color: var(--color-error);
    background: rgba(239, 68, 68, 0.1);
  }

  .save-indicator {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-sm);
    color: var(--color-warning);
    font-size: 12px;
    margin-top: 8px;
  }

  .save-btn {
    background: var(--color-warning);
    color: black;
    border: none;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
