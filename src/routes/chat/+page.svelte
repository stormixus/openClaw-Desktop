<script lang="ts">
  import { onMount } from "svelte";
  import GatewayTabs from "$lib/components/Gateway/GatewayTabs.svelte";
  import AddGatewayModal from "$lib/components/Gateway/AddGatewayModal.svelte";
  import ChatPanel from "$lib/components/Chat/ChatPanel.svelte";
  import ShortcutsModal from "$lib/components/ShortcutsModal.svelte";
  import { store, abortMessage } from "$lib/gateway/store.svelte";
  import { shortcuts } from "$lib/services/shortcuts";
  import { t } from "$lib/i18n";

  let showAddGatewayModal = $state(false);
  let showShortcutsModal = $state(false);

  // Derived values for the active gateway
  const activeGateway = $derived(store.gateways.find(g => g.id === store.activeGatewayId) ?? null);
  const activeGatewayState = $derived(store.activeGatewayId ? store.gatewayStates.get(store.activeGatewayId) ?? null : null);

  function openAddModal() {
    showAddGatewayModal = true;
  }

  function closeAddModal() {
    showAddGatewayModal = false;
  }

  // Register keyboard shortcuts
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
  <!-- Gateway Tabs -->
  <GatewayTabs onadd={openAddModal} />

  <!-- Chat Content -->
  {#if activeGateway}
    {#if activeGatewayState?.status === "connected"}
      <ChatPanel />
    {:else if activeGatewayState?.status === "connecting" || activeGatewayState?.status === "authenticating"}
      <div class="status-message">
        <div class="spinner"></div>
        <p>{$t("gateway.status.connecting")}</p>
      </div>
    {:else if activeGatewayState?.status === "error"}
      <div class="status-message error">
        <span class="icon">❌</span>
        <p>{$t("gateway.status.error")}</p>
        <p class="error-detail">{activeGatewayState?.error}</p>
      </div>
    {:else}
      <div class="status-message">
        <span class="icon">🔌</span>
        <p>{$t("gateway.status.disconnected")}</p>
        <p class="hint">Double-click the tab to connect</p>
      </div>
    {/if}
  {:else}
    <div class="empty-state">
      <span class="icon">🌐</span>
      <h2>{$t("gateway.title")}</h2>
      <p>Add a gateway to get started</p>
      <button class="primary-btn" onclick={openAddModal}>{$t("gateway.add")}</button>
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
    gap: 12px;
    color: var(--color-text-muted);
  }

  .status-message .icon {
    font-size: 48px;
    opacity: 0.5;
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
  }

  .hint {
    font-size: 12px;
    opacity: 0.6;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--color-text-muted);
    text-align: center;
  }

  .empty-state .icon {
    font-size: 64px;
    opacity: 0.4;
  }

  .empty-state h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text);
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
  }

  .primary-btn {
    margin-top: 8px;
    padding: 10px 24px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border: none;
    border-radius: 20px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .primary-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
  }
</style>
