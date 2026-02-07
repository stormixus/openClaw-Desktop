<script lang="ts">
  import { 
    store, 
    connectGateway, 
    disconnectGateway, 
    setActiveGateway,
    sendMessageToGateway 
  } from "$lib/gateway/store.svelte";
  import type { ConnectionStatus } from "$lib/gateway/types";

  interface Props {
    onadd?: () => void;
  }

  const { onadd }: Props = $props();

  // Drag state for each tab
  let dragOverTabId = $state<string | null>(null);

  function getStatusColor(status?: ConnectionStatus): string {
    switch (status) {
      case "connected": return "var(--color-success)";
      case "connecting":
      case "authenticating":
      case "reconnecting": return "var(--color-warning)";
      case "error": return "var(--color-error)";
      default: return "var(--color-text-muted)";
    }
  }

  function getStatusIcon(status?: ConnectionStatus): string {
    switch (status) {
      case "connected": return "🟢";
      case "connecting":
      case "authenticating":
      case "reconnecting": return "🟡";
      case "error": return "🔴";
      default: return "⚪";
    }
  }

  function handleTabClick(id: string) {
    setActiveGateway(id);
  }

  function handleConnect(id: string) {
    const state = store.gatewayStates.get(id);
    if (state?.status === "connected") {
      disconnectGateway(id);
    } else {
      connectGateway(id);
    }
  }

  function handleAdd() {
    onadd?.();
  }

  // Drag and drop handlers
  function handleDragOver(e: DragEvent, gatewayId: string) {
    e.preventDefault();
    const state = store.gatewayStates.get(gatewayId);
    // Only allow drop on connected gateways that are not current
    if (state?.status === "connected" && gatewayId !== store.activeGatewayId) {
      e.dataTransfer!.dropEffect = "copy";
      dragOverTabId = gatewayId;
    } else {
      e.dataTransfer!.dropEffect = "none";
    }
  }

  function handleDragLeave(e: DragEvent) {
    dragOverTabId = null;
  }

  async function handleDrop(e: DragEvent, gatewayId: string) {
    e.preventDefault();
    dragOverTabId = null;

    const messageContent = e.dataTransfer?.getData("text/plain");
    if (messageContent && gatewayId !== store.activeGatewayId) {
      const state = store.gatewayStates.get(gatewayId);
      if (state?.status === "connected") {
        await sendMessageToGateway(gatewayId, messageContent);
      }
    }
  }
</script>

<div class="gateway-tabs">
  <div class="tabs-scroll">
    {#each store.gateways as gateway (gateway.id)}
      {@const state = store.gatewayStates.get(gateway.id)}
      <button
        class="tab"
        class:active={gateway.id === store.activeGatewayId}
        class:drop-target={dragOverTabId === gateway.id}
        onclick={() => handleTabClick(gateway.id)}
        ondblclick={() => handleConnect(gateway.id)}
        ondragover={(e) => handleDragOver(e, gateway.id)}
        ondragleave={handleDragLeave}
        ondrop={(e) => handleDrop(e, gateway.id)}
        title={`${gateway.name}\nDouble-click to ${state?.status === "connected" ? "disconnect" : "connect"}\nDrag message here to forward`}
      >
        <span class="status-icon">{getStatusIcon(state?.status)}</span>
        <span class="name">{gateway.name}</span>
      </button>
    {/each}
    
    <button class="add-tab" onclick={handleAdd} title="Add Gateway">
      <span>+</span>
    </button>
  </div>
</div>

<style>
  .gateway-tabs {
    display: flex;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 8px 12px 0;
  }

  .tabs-scroll {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    flex: 1;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-radius: 8px 8px 0 0;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .tab:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .tab.active {
    background: var(--color-bg);
    color: var(--color-text);
    border-bottom: 2px solid var(--color-primary);
  }

  .tab.drop-target {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
    border: 2px dashed var(--color-primary);
    transform: scale(1.05);
  }

  .status-icon {
    font-size: 10px;
  }

  .name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .add-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: 1px dashed var(--color-border);
    border-radius: 8px;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 18px;
    transition: all 0.2s ease;
    margin-left: 4px;
  }

  .add-tab:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-surface-hover);
  }
</style>
