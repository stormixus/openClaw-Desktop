<script lang="ts">
  import { X, Send } from "@lucide/svelte";
  import { store, sendMessageToGateway } from "$lib/gateway/store.svelte";
  import { t } from "$lib/i18n";

  interface Props {
    content: string;
    onclose?: () => void;
    onsent?: () => void;
  }

  const { content, onclose, onsent }: Props = $props();

  // Get other gateways (excluding current)
  const otherGateways = $derived(
    store.gateways.filter(g => g.id !== store.activeGatewayId)
  );

  async function forwardTo(gatewayId: string) {
    await sendMessageToGateway(gatewayId, content);
    onsent?.();
    onclose?.();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose?.();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={handleOverlayClick}>
  <div class="modal">
    <div class="header">
      <h3>{$t("forward.title")}</h3>
      <button class="close-btn" onclick={() => onclose?.()}>
        <X size={18} />
      </button>
    </div>

    <div class="preview">
      <p>{content.length > 200 ? content.substring(0, 200) + "..." : content}</p>
    </div>

    <div class="gateway-list">
      <span class="label">{$t("forward.send_to")}</span>
      {#each otherGateways as gateway (gateway.id)}
        {@const state = store.gatewayStates.get(gateway.id)}
        <button
          class="gateway-item"
          class:connected={state?.status === "connected"}
          onclick={() => forwardTo(gateway.id)}
          disabled={state?.status !== "connected"}
        >
          <span class="gateway-name">{gateway.name}</span>
          <span class="gateway-status">
            {#if state?.status === "connected"}
              <span class="status-dot connected"></span>
              {$t("gateway.status.connected")}
            {:else}
              <span class="status-dot"></span>
              {$t("gateway.status.disconnected")}
            {/if}
          </span>
          <Send size={14} />
        </button>
      {/each}

      {#if otherGateways.length === 0}
        <div class="empty">{$t("forward.empty")}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    width: 400px;
    max-width: 90vw;
    background: var(--color-surface);
    border-radius: 16px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    animation: slideUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes slideUp {
    from { 
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to { 
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
  }

  .header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-elevated);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .preview {
    padding: 16px 20px;
    background: var(--color-surface-elevated);
    border-bottom: 1px solid var(--color-border);
  }

  .preview p {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .gateway-list {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .gateway-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .gateway-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gateway-item:not(:disabled):hover {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  .gateway-item:not(:disabled):hover .gateway-status {
    color: rgba(255, 255, 255, 0.8);
  }

  .gateway-name {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text);
  }

  .gateway-item:not(:disabled):hover .gateway-name {
    color: white;
  }

  .gateway-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-muted);
  }

  .status-dot.connected {
    background: var(--color-success);
  }

  .empty {
    text-align: center;
    padding: 20px;
    color: var(--color-text-muted);
    font-size: 14px;
  }
</style>
