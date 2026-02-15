<script lang="ts">
  import { t } from "$lib/i18n";
  import { History, GitCommit, User, Bot, RotateCcw } from "@lucide/svelte";

  interface HistoryItem {
    id: string;
    timestamp: string;
    author: "user" | "agent";
    summary: string;
  }

  interface Props {
    history?: HistoryItem[];
    onrestore?: (id: string) => void;
  }

  const { history = [], onrestore }: Props = $props();

  // Mock history if empty
  const items = $derived(history.length > 0 ? history : [
    { id: "1", timestamp: new Date().toISOString(), author: "user", summary: $t("forge.history.initial_version") },
    { id: "2", timestamp: new Date(Date.now() - 1000 * 60).toISOString(), author: "agent", summary: $t("forge.history.updated_formatting") }
  ] as HistoryItem[]);

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="history-timeline">
  <div class="header">
    <h3>
      <History size={16} />
      <span>{$t("forge.history.title")}</span>
    </h3>
  </div>

  <div class="timeline-list">
    {#each items as item}
      <div class="timeline-item">
        <div class="timeline-line"></div>
        <div class="timeline-dot" class:agent={item.author === "agent"}>
          {#if item.author === "agent"}
            <Bot size={10} />
          {:else}
            <User size={10} />
          {/if}
        </div>

        <div class="timeline-content">
          <div class="meta">
            <span class="author">{item.author === "agent" ? $t("forge.history.author.assistant") : $t("forge.history.author.you")}</span>
            <span class="time">{formatTime(item.timestamp)}</span>
          </div>
          <div class="summary">{item.summary}</div>

          <button class="restore-btn" onclick={() => onrestore?.(item.id)} title={$t("forge.history.restore_title")}>
            <RotateCcw size={12} />
            <span>{$t("forge.history.restore")}</span>
          </button>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .history-timeline {
    width: 250px;
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
  }

  .header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .header h3 {
    margin: 0;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text);
  }

  .timeline-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .timeline-item {
    position: relative;
    padding-bottom: 24px;
    padding-left: 24px;
  }

  .timeline-item:last-child {
    padding-bottom: 0;
  }

  .timeline-line {
    position: absolute;
    left: 9px;
    top: 24px;
    bottom: 0;
    width: 2px;
    background: var(--color-border);
  }

  .timeline-item:last-child .timeline-line {
    display: none;
  }

  .timeline-dot {
    position: absolute;
    left: 0;
    top: 0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--color-surface-elevated);
    border: 2px solid var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary);
    z-index: 1;
  }

  .timeline-dot.agent {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .timeline-content {
    background: var(--color-surface-elevated);
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }

  .meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 11px;
  }

  .author {
    font-weight: 600;
    color: var(--color-text);
  }

  .time {
    color: var(--color-text-muted);
  }

  .summary {
    font-size: 12px;
    color: var(--color-text-subtle);
    margin-bottom: 8px;
  }

  .restore-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 10px;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: all 0.2s;
  }

  .restore-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
    border-color: var(--color-text-muted);
  }
</style>
