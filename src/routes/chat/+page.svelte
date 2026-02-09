<script lang="ts">
  import { onMount } from "svelte";
  import GatewayTabs from "$lib/components/Gateway/GatewayTabs.svelte";
  import AddGatewayModal from "$lib/components/Gateway/AddGatewayModal.svelte";
  import ChatPanel from "$lib/components/Chat/ChatPanel.svelte";
  import ShortcutsModal from "$lib/components/ShortcutsModal.svelte";
  import { store, abortMessage } from "$lib/gateway/store.svelte";
  import { shortcuts } from "$lib/services/shortcuts";
  import { t } from "$lib/i18n";
  import { Globe, AlertCircle, Unplug, Loader2, Plus } from "@lucide/svelte";

  let showAddGatewayModal = $state(false);
  let showShortcutsModal = $state(false);

  const activeGateway = $derived(store.gateways.find(g => g.id === store.activeGatewayId) ?? null);
  const activeGatewayState = $derived(store.activeGatewayId ? store.gatewayStates.get(store.activeGatewayId) ?? null : null);

  function openAddModal() {
    showAddGatewayModal = true;
  }

  function closeAddModal() {
    showAddGatewayModal = false;
  }

  onMount(() => {
    const unregister = shortcuts.registerMany([
      {
        key: "k",
        meta: true,
        ctrl: true,
        description: "Show keyboard shortcuts",
        action: () => showShortcutsModal = !showShortcutsModal,
      },
      {
        key: "n",
        meta: true,
        ctrl: true,
        description: "Add new gateway",
        action: () => showAddGatewayModal = true,
      },
      {
        key: "Escape",
        description: "Stop streaming / Close modal",
        action: () => {
          if (store.isStreaming) {
            abortMessage();
          } else if (showAddGatewayModal) {
            showAddGatewayModal = false;
          } else if (showShortcutsModal) {
            showShortcutsModal = false;
          }
        },
      },
      {
        key: "/",
        meta: true,
        ctrl: true,
        description: "Focus chat input",
        action: () => {
          const input = document.querySelector(".chat-input-wrapper textarea") as HTMLTextAreaElement;
          input?.focus();
        },
      },
    ]);

    return unregister;
  });
</script>

<svelte:head>
  <title>{$t("nav.chat")} | {$t("app.title")}</title>
</svelte:head>

{#if showAddGatewayModal}
  <AddGatewayModal onclose={closeAddModal} />
{/if}

{#if showShortcutsModal}
  <ShortcutsModal onclose={() => showShortcutsModal = false} />
{/if}

<div class="chat-page">
  <GatewayTabs onadd={openAddModal} />

  {#if activeGateway}
    {#if activeGatewayState?.status === "connected"}
      <ChatPanel />
    {:else if activeGatewayState?.status === "connecting" || activeGatewayState?.status === "authenticating"}
      <div class="status-message">
        <div class="status-icon connecting">
          <Loader2 size={28} strokeWidth={1.5} />
        </div>
        <p>{$t("gateway.status.connecting")}</p>
      </div>
    {:else if activeGatewayState?.status === "error"}
      <div class="status-message error">
        <div class="status-icon error-icon">
          <AlertCircle size={28} strokeWidth={1.5} />
        </div>
        <p>{$t("gateway.status.error")}</p>
        <p class="error-detail">{activeGatewayState?.error}</p>
      </div>
    {:else}
      <div class="status-message">
        <div class="status-icon">
          <Unplug size={28} strokeWidth={1.5} />
        </div>
        <p>{$t("gateway.status.disconnected")}</p>
        <p class="hint">Double-click the tab to connect</p>
      </div>
    {/if}
  {:else}
    <div class="empty-state">
      <div class="empty-icon">
        <Globe size={36} strokeWidth={1} />
      </div>
      <h2>{$t("gateway.title")}</h2>
      <p>Add a gateway to get started</p>
      <button class="primary-btn" onclick={openAddModal}>
        <Plus size={16} strokeWidth={2} />
        {$t("gateway.add")}
      </button>
    </div>
  {/if}
</div>

<style>
  .chat-page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--color-bg);
  }

  .status-message {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    color: var(--color-text-muted);
  }

  .status-icon {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    color: var(--color-text-muted);
    margin-bottom: var(--space-sm);
  }

  .status-icon.connecting {
    color: var(--color-warning);
    animation: spin 1.2s linear infinite;
  }

  .status-icon.error-icon {
    color: var(--color-error);
    background: rgba(239, 68, 68, 0.1);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .status-message p {
    margin: 0;
    font-size: 14px;
  }

  .status-message.error {
    color: var(--color-error);
  }

  .error-detail {
    font-size: 12px;
    opacity: 0.7;
    max-width: 400px;
    text-align: center;
  }

  .hint {
    font-size: 12px;
    color: var(--color-text-subtle);
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    color: var(--color-text-muted);
    text-align: center;
  }

  .empty-icon {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    color: var(--color-text-subtle);
    margin-bottom: var(--space-sm);
  }

  .empty-state h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
  }

  .primary-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
    padding: 10px 20px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-out);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
  }

  .primary-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(99, 102, 241, 0.4);
  }
</style>
