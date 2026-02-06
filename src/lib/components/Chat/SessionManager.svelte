<script context="module" lang="ts">
  export interface Session {
    id: string;
    shortId: string;
    title?: string;
    createdAt?: string;
    thinking?: boolean;
    verbose?: boolean;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { t } from "$lib/i18n";

  export let sessions: Session[] = [];
  export let currentSession: string = "";
  export let isOpen = false;

  const dispatch = createEventDispatcher<{
    select: string;
    new: void;
    close: void;
  }>();

  function selectSession(id: string) {
    dispatch("select", id);
    dispatch("close");
  }

  function newSession() {
    dispatch("new");
    dispatch("close");
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { 
      month: "short", 
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
</script>

{#if isOpen}
  <div class="session-manager" on:click|stopPropagation role="menu">
    <div class="header">
      <h4>{$t("session.title")}</h4>
      <button class="new-btn" on:click={newSession} title="New Session">
        <span>+</span>
      </button>
    </div>

    <div class="session-list">
      {#if sessions.length === 0}
        <div class="empty">
          <span class="icon">📝</span>
          <p>No sessions yet</p>
          <button class="create-btn" on:click={newSession}>
            Create New Session
          </button>
        </div>
      {:else}
        {#each sessions as session}
          <button
            class="session-item"
            class:active={session.id === currentSession}
            on:click={() => selectSession(session.id)}
          >
            <div class="session-info">
              <span class="session-title">
                {session.title || `Session ${session.shortId}`}
              </span>
              {#if session.createdAt}
                <span class="session-date">{formatDate(session.createdAt)}</span>
              {/if}
            </div>
            <div class="session-badges">
              {#if session.thinking}
                <span class="badge thinking" title="Thinking enabled">🧠</span>
              {/if}
              {#if session.verbose}
                <span class="badge verbose" title="Verbose enabled">📋</span>
              {/if}
            </div>
            {#if session.id === currentSession}
              <span class="active-dot"></span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .session-manager {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 8px;
    width: 300px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    z-index: 50;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .header h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }

  .new-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    cursor: pointer;
    color: var(--color-text);
    font-size: 16px;
    transition: all 0.15s ease;
  }

  .new-btn:hover {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  .session-list {
    max-height: 320px;
    overflow-y: auto;
    padding: 8px;
  }

  .empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--color-text-muted);
  }

  .empty .icon {
    font-size: 32px;
    opacity: 0.5;
  }

  .empty p {
    margin: 8px 0 16px;
    font-size: 13px;
  }

  .create-btn {
    padding: 8px 16px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border: none;
    border-radius: 16px;
    color: white;
    font-size: 12px;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .create-btn:hover {
    transform: translateY(-1px);
  }

  .session-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .session-item:hover {
    background: var(--color-surface-hover);
  }

  .session-item.active {
    background: rgba(59, 130, 246, 0.15);
  }

  .session-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .session-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-date {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .session-badges {
    display: flex;
    gap: 4px;
  }

  .badge {
    font-size: 12px;
    opacity: 0.7;
  }

  .active-dot {
    width: 8px;
    height: 8px;
    background: var(--color-primary);
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
