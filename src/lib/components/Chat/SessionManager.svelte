<script lang="ts">
  import { t } from "$lib/i18n";
  import { store, switchSession, loadSessions } from "$lib/gateway/store.svelte";

  interface Props {
    isOpen?: boolean;
    onclose?: () => void;
  }

  const { isOpen = false, onclose }: Props = $props();

  function selectSession(id: string) {
    switchSession(id);
    onclose?.();
  }

  function newSession() {
    // Generate a new session key
    const newKey = `desktop-${crypto.randomUUID().slice(0, 8)}`;
    switchSession(newKey);
    onclose?.();
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

  function refreshSessions() {
    loadSessions();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="session-manager" onclick={(e) => e.stopPropagation()}>
    <div class="header">
      <h4>{$t("session.title")}</h4>
      <div class="header-actions">
        <button class="icon-btn" onclick={refreshSessions} title="Refresh">
          <span>🔄</span>
        </button>
        <button class="icon-btn" onclick={newSession} title="New Session">
          <span>+</span>
        </button>
      </div>
    </div>

    <div class="current-session">
      <span class="label">Current:</span>
      <span class="value">{store.sessionKey}</span>
    </div>

    <div class="session-list">
      {#if store.sessions.length === 0}
        <div class="empty">
          <span class="icon">📝</span>
          <p>No sessions found</p>
          <button class="create-btn" onclick={newSession}>
            Create New Session
          </button>
        </div>
      {:else}
        {#each store.sessions as session}
          <button
            class="session-item"
            class:active={session.key === store.sessionKey}
            onclick={() => selectSession(session.key)}
          >
            <div class="session-info">
              <span class="session-title">
                {session.key}
              </span>
              {#if session.lastActiveAt}
                <span class="session-date">{formatDate(session.lastActiveAt)}</span>
              {/if}
            </div>
            {#if session.key === store.sessionKey}
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
    width: 320px;
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

  .header-actions {
    display: flex;
    gap: 4px;
  }

  .icon-btn {
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
    font-size: 14px;
    transition: all 0.15s ease;
  }

  .icon-btn:hover {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  .current-session {
    padding: 8px 16px;
    background: var(--color-surface-elevated);
    border-bottom: 1px solid var(--color-border);
    font-size: 12px;
  }

  .current-session .label {
    color: var(--color-text-muted);
    margin-right: 6px;
  }

  .current-session .value {
    color: var(--color-primary);
    font-weight: 500;
    font-family: monospace;
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
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text);
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-date {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .session-preview {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
