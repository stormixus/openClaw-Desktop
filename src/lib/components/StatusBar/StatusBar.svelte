<script lang="ts">
  import { store, getActiveGatewayState } from "$lib/gateway/store.svelte";
  import { t } from "$lib/i18n";
  import { Wifi, WifiOff, Activity } from "@lucide/svelte";

  // Derived state
  const gatewayState = $derived(getActiveGatewayState());
  const isConnected = $derived(gatewayState?.status === "connected");
  const isConnecting = $derived(gatewayState?.status === "connecting" || gatewayState?.status === "reconnecting");
  const modelName = $derived(store.modelsSnapshot?.current?.name || "Unknown Model");
  const agentName = $derived(store.assistantMeta?.name || "Assistant");
  const sessionKey = $derived(store.sessionKey ? store.sessionKey.slice(0, 8) + "..." : "No Session");

  // Mock token usage (replace with actual store data when available)
  const tokens = $state({ input: 0, output: 0, total: 0 });

</script>

<div class="status-bar">
  <div class="left-section">
    <div class="connection-status" class:connected={isConnected} class:connecting={isConnecting}>
      {#if isConnected}
        <Wifi size={14} />
        <span>{$t("status.connected")}</span>
      {:else if isConnecting}
        <Activity size={14} class="spin" />
        <span>{$t("status.connecting")}</span>
      {:else}
        <WifiOff size={14} />
        <span>{$t("status.disconnected")}</span>
      {/if}
    </div>

    <div class="separator"></div>

    <div class="context-info">
      <span class="label">Agent:</span> <span class="value">{agentName}</span>
      <span class="divider">•</span>
      <span class="label">Model:</span> <span class="value">{modelName}</span>
      <span class="divider">•</span>
      <span class="label">Session:</span> <span class="value">{sessionKey}</span>
    </div>
  </div>

  <div class="right-section">
    <div class="token-usage">
      <span class="token-pill">
        <span class="label">In:</span> {tokens.input}
      </span>
      <span class="token-pill">
        <span class="label">Out:</span> {tokens.output}
      </span>
      <span class="token-pill total">
        <span class="label">Total:</span> {tokens.total}
      </span>
    </div>
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 28px;
    padding: 0 var(--space-md);
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    font-size: 11px;
    color: var(--color-text-subtle);
    user-select: none;
  }

  .left-section, .right-section {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .separator {
    width: 1px;
    height: 12px;
    background: var(--color-border);
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-text-muted);
  }

  .connection-status.connected {
    color: var(--color-success);
  }

  .connection-status.connecting {
    color: var(--color-warning);
  }

  /* Spin animation for connecting icon */
  :global(.spin) {
    animation: spin 2s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .context-info {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .label {
    color: var(--color-text-muted);
  }

  .value {
    color: var(--color-text);
    font-weight: 500;
  }

  .divider {
    color: var(--color-border-strong);
  }

  .token-usage {
    display: flex;
    gap: 8px;
  }

  .token-pill {
    display: flex;
    gap: 4px;
  }

  .token-pill.total {
    color: var(--color-text);
    font-weight: 500;
  }
</style>
