<script lang="ts">
  import { t } from "$lib/i18n";
  import { addGateway, connectGateway, setActiveGateway } from "$lib/gateway/store.svelte";
  import type { AuthMethod } from "$lib/gateway/types";

  interface Props {
    onclose?: () => void;
    onadded?: (id: string) => void;
  }

  const { onclose, onadded }: Props = $props();

  let name = $state("");
  let url = $state("");
  let authMethod = $state<AuthMethod>("tailscale");
  let token = $state("");
  let password = $state("");

  const isValid = $derived(() => {
    let valid = name.trim().length > 0 && isValidUrl(url);
    if (authMethod === "token") {
      valid = valid && token.trim().length > 0;
    } else if (authMethod === "password") {
      valid = valid && password.trim().length > 0;
    }
    return valid;
  });

  function isValidUrl(str: string): boolean {
    try {
      const u = new URL(str);
      return u.protocol === "ws:" || u.protocol === "wss:";
    } catch {
      return false;
    }
  }

  function handleClose() {
    onclose?.();
  }

  function handleSubmit() {
    if (!isValid()) return;

    const id = addGateway({
      name: name.trim(),
      url: url.trim(),
      authMethod,
      token: authMethod === "token" ? token : undefined,
      password: authMethod === "password" ? password : undefined,
    });

    // Auto-connect and set as active
    setActiveGateway(id);
    connectGateway(id);

    onadded?.(id);
    onclose?.();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="modal-overlay" onclick={handleClose} role="dialog" aria-modal="true">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal" onclick={(e) => e.stopPropagation()} role="document">
    <div class="modal-header">
      <h2>{$t("gateway.add")}</h2>
      <button class="close-btn" onclick={handleClose}>✕</button>
    </div>

    <div class="modal-body">
      <div class="form-group">
        <label for="gateway-name">{$t("gateway.name")}</label>
        <input
          id="gateway-name"
          type="text"
          bind:value={name}
          placeholder="e.g. Home Server"
        />
      </div>

      <div class="form-group">
        <label for="gateway-url">{$t("gateway.url")}</label>
        <input
          id="gateway-url"
          type="text"
          bind:value={url}
          placeholder="ws://192.168.1.100:18789"
        />
        <span class="hint">WebSocket URL (ws:// or wss://)</span>
      </div>

      <div class="form-group">
        <label>Authentication</label>
        <div class="auth-options">
          <button
            class="auth-option"
            class:selected={authMethod === "tailscale"}
            onclick={() => authMethod = "tailscale"}
          >
            <span class="icon">🔒</span>
            <span>Tailscale</span>
          </button>
          <button
            class="auth-option"
            class:selected={authMethod === "token"}
            onclick={() => authMethod = "token"}
          >
            <span class="icon">🔑</span>
            <span>Token</span>
          </button>
          <button
            class="auth-option"
            class:selected={authMethod === "password"}
            onclick={() => authMethod = "password"}
          >
            <span class="icon">🔐</span>
            <span>Password</span>
          </button>
        </div>
      </div>

      {#if authMethod === "token"}
        <div class="form-group">
          <label for="gateway-token">{$t("gateway.token")}</label>
          <input
            id="gateway-token"
            type="password"
            bind:value={token}
            placeholder="Enter your token"
          />
        </div>
      {:else if authMethod === "password"}
        <div class="form-group">
          <label for="gateway-password">Password</label>
          <input
            id="gateway-password"
            type="password"
            bind:value={password}
            placeholder="Enter your password"
          />
        </div>
      {:else}
        <div class="tailscale-info">
          <span class="icon">ℹ️</span>
          <p>Tailscale authentication uses your network identity. No credentials needed.</p>
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="cancel-btn" onclick={handleClose}>
        {$t("common.cancel")}
      </button>
      <button class="submit-btn" disabled={!isValid()} onclick={handleSubmit}>
        {$t("gateway.connect")}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    width: 420px;
    max-width: 90vw;
    background: var(--color-surface);
    border-radius: 16px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--color-border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
  }

  .close-btn {
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .modal-body {
    padding: 24px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
    margin-bottom: 8px;
  }

  .form-group input {
    width: 100%;
    padding: 12px 16px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    color: var(--color-text);
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s ease;
  }

  .form-group input:focus {
    border-color: var(--color-primary);
  }

  .form-group input::placeholder {
    color: var(--color-text-muted);
  }

  .hint {
    display: block;
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 6px;
  }

  .auth-options {
    display: flex;
    gap: 8px;
  }

  .auth-option {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    background: var(--color-surface-elevated);
    border: 2px solid var(--color-border);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: var(--color-text);
    font-size: 12px;
  }

  .auth-option:hover {
    border-color: var(--color-primary);
  }

  .auth-option.selected {
    border-color: var(--color-primary);
    background: rgba(59, 130, 246, 0.1);
  }

  .auth-option .icon {
    font-size: 20px;
  }

  .tailscale-info {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 16px;
    background: var(--color-surface-elevated);
    border-radius: 10px;
    border: 1px solid var(--color-border);
  }

  .tailscale-info .icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .tailscale-info p {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--color-border);
  }

  .cancel-btn,
  .submit-btn {
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .cancel-btn:hover {
    background: var(--color-surface-hover);
  }

  .submit-btn {
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border: none;
    color: white;
  }

  .submit-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
