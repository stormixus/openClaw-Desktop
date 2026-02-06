<script lang="ts">
  import type { ModelsSnapshot, ModelInfo } from "$lib/gateway/types";
  import { t } from "$lib/i18n";

  interface Props {
    models: ModelsSnapshot | null;
    onselect?: (modelId: string) => void;
    onclose?: () => void;
  }

  const { models, onselect, onclose }: Props = $props();

  // Group models by provider
  const groupedModels = $derived(groupByProvider(models?.available ?? []));

  function groupByProvider(models: ModelInfo[]): Map<string, ModelInfo[]> {
    const grouped = new Map<string, ModelInfo[]>();
    for (const model of models) {
      const list = grouped.get(model.provider) ?? [];
      list.push(model);
      grouped.set(model.provider, list);
    }
    return grouped;
  }

  function selectModel(modelId: string) {
    onselect?.(modelId);
  }

  function handleClickOutside(e: MouseEvent) {
    onclose?.();
  }
</script>

<svelte:window onclick={handleClickOutside} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="model-selector" onclick={(e) => e.stopPropagation()}>
  <div class="header">
    <h4>{$t("model.select")}</h4>
  </div>

  {#if models?.current}
    <div class="current-model">
      <span class="label">{$t("model.current")}</span>
      <span class="model-item current">
        <span class="provider">{models.current.provider}</span>
        <span class="name">{models.current.displayName ?? models.current.name}</span>
      </span>
    </div>
  {/if}

  <div class="model-list">
    {#each [...groupedModels.entries()] as [provider, providerModels]}
      <div class="provider-group">
        <div class="provider-name">{provider}</div>
        {#each providerModels as model}
          <button
            class="model-option"
            class:active={model.id === models?.current?.id}
            onclick={() => selectModel(model.id)}
          >
            {model.displayName ?? model.name}
          </button>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .model-selector {
    position: absolute;
    bottom: 100%;
    left: 0;
    width: 280px;
    max-height: 400px;
    overflow-y: auto;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    z-index: 100;
    margin-bottom: 8px;
  }

  .header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .current-model {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .label {
    display: block;
    font-size: 11px;
    color: var(--color-text-muted);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .model-item {
    display: block;
  }

  .model-item.current {
    padding: 8px 12px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border-radius: 8px;
    color: white;
  }

  .provider {
    display: block;
    font-size: 10px;
    opacity: 0.8;
  }

  .name {
    font-size: 13px;
    font-weight: 500;
  }

  .model-list {
    padding: 8px;
  }

  .provider-group {
    margin-bottom: 8px;
  }

  .provider-group:last-child {
    margin-bottom: 0;
  }

  .provider-name {
    padding: 6px 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .model-option {
    display: block;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    color: var(--color-text);
    font-size: 13px;
    text-align: left;
    transition: all 0.15s ease;
  }

  .model-option:hover {
    background: var(--color-surface-hover);
  }

  .model-option.active {
    background: var(--color-primary);
    color: white;
  }
</style>
