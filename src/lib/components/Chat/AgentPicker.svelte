<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { t } from "$lib/i18n";

  export let agents: Array<{ id: string; name: string; description?: string }> = [];
  export let currentAgent: string = "";
  export let isOpen = false;

  const dispatch = createEventDispatcher<{
    select: string;
    close: void;
  }>();

  function selectAgent(id: string) {
    dispatch("select", id);
    dispatch("close");
  }
</script>

{#if isOpen}
  <div class="agent-picker" on:click|stopPropagation role="menu">
    <div class="header">
      <h4>{$t("agent.select")}</h4>
    </div>

    <div class="agent-list">
      {#if agents.length === 0}
        <div class="empty">No agents available</div>
      {:else}
        {#each agents as agent}
          <button
            class="agent-option"
            class:active={agent.id === currentAgent}
            on:click={() => selectAgent(agent.id)}
          >
            <span class="agent-icon">🤖</span>
            <div class="agent-info">
              <span class="agent-name">{agent.name}</span>
              {#if agent.description}
                <span class="agent-desc">{agent.description}</span>
              {/if}
            </div>
            {#if agent.id === currentAgent}
              <span class="check">✓</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .agent-picker {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 8px;
    width: 280px;
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

  .agent-list {
    max-height: 240px;
    overflow-y: auto;
    padding: 8px;
  }

  .empty {
    padding: 16px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .agent-option {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .agent-option:hover {
    background: var(--color-surface-hover);
  }

  .agent-option.active {
    background: rgba(59, 130, 246, 0.15);
  }

  .agent-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .agent-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .agent-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
  }

  .agent-desc {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .check {
    color: var(--color-primary);
    font-size: 14px;
  }
</style>
