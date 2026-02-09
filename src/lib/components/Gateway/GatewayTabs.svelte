<script lang="ts">
  import { 
    store, 
    connectGateway, 
    disconnectGateway, 
    setActiveGateway,
    sendMessageToGateway,
    toggleChatMode 
  } from "$lib/gateway/store.svelte";
  import type { ConnectionStatus } from "$lib/gateway/types";
  import { Plus, RefreshCw, Gamepad2, MessageSquare } from "@lucide/svelte";
  import { t } from "$lib/i18n";

  interface Props {
    onadd?: () => void;
  }

  const { onadd }: Props = $props();

  // Drag state for each tab
  let dragOverTabId = $state<string | null>(null);
  
  // Dropdown state
  let showDropdown = $state(false);

  // Gateways that are configured but not yet active as tabs (not connected / no state)
  const untabbedGateways = $derived(
    store.gateways.filter(g => {
      const state = store.gatewayStates.get(g.id);
      return !state || state.status === "disconnected";
    })
  );

  function getStatusColor(status?: ConnectionStatus): string {
    switch (status) {
      case "connected": return "var(--color-success)";
      case "connecting":
      case "authenticating":
      case "reconnecting": return "var(--color-warning)";
      case "error": return "var(--color-error)";
      default: return "var(--color-text-subtle)";
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

  function handleRefresh() {
    const id = store.activeGatewayId;
    if (!id) return;
    const state = store.gatewayStates.get(id);
    if (state?.status === "connected") {
      disconnectGateway(id);
      setTimeout(() => connectGateway(id), 300);
    } else {
      connectGateway(id);
    }
  }

  function handleAddClick() {
    showDropdown = !showDropdown;
  }

  function handleSelectGateway(id: string) {
    showDropdown = false;
    setActiveGateway(id);
    connectGateway(id);
  }

  function handleAddNew() {
    showDropdown = false;
    onadd?.();
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(".add-wrapper")) {
      showDropdown = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      showDropdown = false;
    }
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="gateway-tabs" onkeydown={handleKeydown}>
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
        <span class="status-dot" style="background: {getStatusColor(state?.status)}"></span>
        <span class="name">{gateway.name}</span>
      </button>
    {/each}
    
    <div class="add-wrapper">
      <button class="add-tab" onclick={handleAddClick} title="Add Gateway">
        <Plus size={14} strokeWidth={2} />
      </button>

      {#if showDropdown}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="dropdown-backdrop" onclick={() => showDropdown = false}></div>
        <div class="dropdown">
          {#if untabbedGateways.length > 0}
            <div class="dropdown-label">{$t("gateway.title")}</div>
            {#each untabbedGateways as gw (gw.id)}
              <button class="dropdown-item" onclick={() => handleSelectGateway(gw.id)}>
                <span class="dropdown-dot"></span>
                <span class="dropdown-name">{gw.name}</span>
                <span class="dropdown-badge">{$t(`gateway.auth.${gw.authMethod}`)}</span>
              </button>
            {/each}
            <div class="dropdown-divider"></div>
          {/if}
          <button class="dropdown-item add-new" onclick={handleAddNew}>
            <Plus size={13} strokeWidth={2} />
            <span>{$t("gateway.add_new")}</span>
          </button>
        </div>
      {/if}
    </div>

    <button class="refresh-btn" onclick={handleRefresh} title="Refresh connection">
      <RefreshCw size={13} strokeWidth={2} />
    </button>

    <button 
      class="mode-toggle-btn" 
      class:npc-active={store.chatMode === 'npc'}
      onclick={toggleChatMode} 
      title={store.chatMode === 'npc' ? 'Switch to Chat' : 'Switch to NPC Mode'}
    >
      {#if store.chatMode === 'npc'}
        <MessageSquare size={13} strokeWidth={2} />
      {:else}
        <Gamepad2 size={13} strokeWidth={2} />
      {/if}
    </button>
  </div>
</div>

<style>
  .gateway-tabs {
    display: flex;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: var(--space-sm) var(--space-md) 0;
  }

  .tabs-scroll {
    display: flex;
    gap: 2px;
    overflow-x: auto;
    flex: 1;
  }

  .tabs-scroll::-webkit-scrollbar {
    height: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 500;
    transition: all var(--duration-fast) var(--ease-out);
    white-space: nowrap;
    position: relative;
  }

  .tab:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .tab.active {
    background: var(--color-bg);
    color: var(--color-text);
  }

  .tab.active::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: var(--space-md);
    right: var(--space-md);
    height: 2px;
    background: var(--color-primary);
    border-radius: 2px 2px 0 0;
  }

  .tab.drop-target {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.1));
    outline: 2px dashed var(--color-primary);
    outline-offset: -2px;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 4px currentColor;
  }

  .name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .add-wrapper {
    position: relative;
    align-self: center;
  }

  .add-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-text-subtle);
    transition: all var(--duration-fast) var(--ease-out);
    margin-left: var(--space-xs);
  }

  .add-tab:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-surface-hover);
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-text-subtle);
    transition: all var(--duration-fast) var(--ease-out);
    margin-left: var(--space-xs);
    flex-shrink: 0;
  }

  .refresh-btn:hover {
    color: var(--color-primary);
    background: var(--color-surface-hover);
  }

  .refresh-btn:active {
    transform: rotate(90deg);
  }

  .mode-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-text-subtle);
    transition: all var(--duration-fast) var(--ease-out);
    margin-left: var(--space-xs);
    flex-shrink: 0;
  }

  .mode-toggle-btn:hover {
    color: var(--color-primary);
    background: var(--color-surface-hover);
  }

  .mode-toggle-btn.npc-active {
    color: var(--color-accent);
    background: rgba(147, 130, 255, 0.12);
  }

  /* Dropdown */
  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 220px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    padding: var(--space-xs);
    z-index: 50;
    animation: dropdown-in 0.15s var(--ease-out);
  }

  @keyframes dropdown-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .dropdown-label {
    padding: var(--space-xs) var(--space-sm);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-subtle);
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: 8px var(--space-sm);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-text);
    font-size: 12px;
    text-align: left;
    transition: background var(--duration-fast) var(--ease-out);
  }

  .dropdown-item:hover {
    background: var(--color-surface-hover);
  }

  .dropdown-item.add-new {
    color: var(--color-primary);
    font-weight: 500;
  }

  .dropdown-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-subtle);
    flex-shrink: 0;
  }

  .dropdown-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-badge {
    padding: 2px 6px;
    border-radius: var(--radius-full);
    background: var(--color-surface);
    font-size: 10px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .dropdown-divider {
    height: 1px;
    background: var(--color-border);
    margin: var(--space-xs) 0;
  }
</style>
