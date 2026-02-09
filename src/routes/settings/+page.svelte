<script lang="ts">
  import { onMount } from "svelte";
  import { initLocale, locale, locales, setLocale, t, type Locale } from "../../lib/i18n";
  import { initTheme, setTheme, theme, type Theme } from "../../lib/theme";
  import { initSettings, settings, updateSettings } from "../../lib/settings";
  import { store, loadGateways, removeGateway, connectGateway, disconnectGateway } from "$lib/gateway/store.svelte";
  import type { GatewayConfig, ConnectionStatus } from "$lib/gateway/types";
  import AddGatewayModal from "$lib/components/Gateway/AddGatewayModal.svelte";
  import { Radio, Pencil, Trash2, Plus, Shield, Key, Lock, Palette, Monitor, Eye, EyeOff, Check } from "@lucide/svelte";

  type Section = "appearance" | "system" | "gateway" | "apikeys";
  let activeSection = $state<Section>("appearance");
  let showGatewayModal = $state(false);
  let editingGateway = $state<GatewayConfig | null>(null);

  // API Key UI state
  let visibleKeys = $state<Record<string, boolean>>({});
  let savedKeys = $state<Record<string, boolean>>({});

  const API_PROVIDERS: { key: string; icon: string; color: string }[] = [
    { key: "openai", icon: "⚡", color: "#10a37f" },
    { key: "anthropic", icon: "🔶", color: "#d4a574" },
    { key: "google", icon: "🔮", color: "#4285f4" },
    { key: "groq", icon: "⚙️", color: "#f55036" },
    { key: "mistral", icon: "🌊", color: "#ff7000" },
    { key: "openrouter", icon: "🔗", color: "#6366f1" },
    { key: "custom", icon: "🛠️", color: "#8b5cf6" },
  ];

  function toggleKeyVisibility(provider: string) {
    visibleKeys[provider] = !visibleKeys[provider];
  }

  function handleApiKeyChange(provider: string, value: string) {
    const current = { ...$settings.apiKeys } as Record<string, string>;
    current[provider] = value;
    updateSettings({ apiKeys: current as any });
    savedKeys[provider] = true;
    setTimeout(() => { savedKeys[provider] = false; }, 1500);
  }

  function maskKey(key: string): string {
    if (!key || key.length < 8) return key;
    return key.slice(0, 4) + "•".repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
  }

  onMount(() => {
    initLocale();
    initTheme();
    initSettings();
    loadGateways();
  });

  const themes: Theme[] = ["system", "light", "dark"];

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

  function getStatusLabel(status?: ConnectionStatus): string {
    switch (status) {
      case "connected": return $t("gateway.status.connected");
      case "connecting":
      case "authenticating": return $t("gateway.status.connecting");
      case "error": return $t("gateway.status.error");
      default: return $t("gateway.status.disconnected");
    }
  }

  function handleEditGateway(gateway: GatewayConfig) {
    editingGateway = gateway;
    showGatewayModal = true;
  }

  function handleAddGateway() {
    editingGateway = null;
    showGatewayModal = true;
  }

  function handleDeleteGateway(gateway: GatewayConfig) {
    if (confirm($t("gateway.confirm_delete"))) {
      removeGateway(gateway.id);
    }
  }

  function handleToggleConnect(gateway: GatewayConfig) {
    const state = store.gatewayStates.get(gateway.id);
    if (state?.status === "connected") {
      disconnectGateway(gateway.id);
    } else {
      connectGateway(gateway.id);
    }
  }

  function closeGatewayModal() {
    showGatewayModal = false;
    editingGateway = null;
  }
</script>

<main class="container">
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="orb"></div>
        <div>
          <h1>{$t("settings.title")}</h1>
          <p class="subtitle">{$t("app.tagline")}</p>
        </div>
      </div>

      <nav class="menu">
        <button class="menu-item" class:active={activeSection === "appearance"} onclick={() => activeSection = "appearance"}>
          <Palette size={15} />
          {$t("settings.section.appearance")}
        </button>
        <button class="menu-item" class:active={activeSection === "system"} onclick={() => activeSection = "system"}>
          <Monitor size={15} />
          {$t("settings.section.system")}
        </button>
        <button class="menu-item" class:active={activeSection === "gateway"} onclick={() => activeSection = "gateway"}>
          <Radio size={15} />
          {$t("settings.section.gateway")}
        </button>
        <button class="menu-item" class:active={activeSection === "apikeys"} onclick={() => activeSection = "apikeys"}>
          <Key size={15} />
          {$t("settings.section.apikeys")}
        </button>
        <div class="menu-divider"></div>
        <a class="menu-item" href="/">
          <span class="dot ghost"></span>
          {$t("nav.home")}
        </a>
      </nav>

      <div class="status">
        <span class="chip">v0.1.0</span>
        <span class="hint">openClaw Desktop</span>
      </div>
    </aside>

    <section class="content">
      <header class="header">
        <div>
          <h2>{$t(`settings.section.${activeSection}`)}</h2>
          <p class="subtitle">{$t("settings.title")}</p>
        </div>
      </header>

    {#if activeSection === "appearance"}

      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <span class="icon-wrap" aria-hidden="true">
              <svg class="icon-svg" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 5h8a4 4 0 0 1 4 4v10H8a4 4 0 0 1-4-4V5z"
                  stroke="currentColor"
                  stroke-width="1.6"
                />
                <path d="M8 9h8M8 12h6M8 15h4" stroke="currentColor" stroke-width="1.6" />
                <circle cx="18" cy="8" r="3" stroke="currentColor" stroke-width="1.6" />
              </svg>
            </span>
            <div>
              <h3>{$t("settings.language")}</h3>
              <p class="panel-note">UI language for menus and messages.</p>
            </div>
          </div>
        <span class="pill">Global</span>
      </div>
        <div class="control">
          <label for="language-select">{$t("settings.language")}</label>
          <select
            id="language-select"
            class="select"
            value={$locale}
            onchange={(event) => setLocale((event.currentTarget as HTMLSelectElement).value as Locale)}
          >
            {#each locales as entry}
              <option value={entry}>{$t(`settings.language.${entry}`)}</option>
            {/each}
          </select>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <span class="icon-wrap" aria-hidden="true">
              <svg class="icon-svg" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4a7 7 0 1 0 7 7A7 7 0 0 1 12 4z"
                  stroke="currentColor"
                  stroke-width="1.6"
                />
                <circle cx="17.5" cy="6.5" r="2" fill="currentColor" />
              </svg>
            </span>
            <div>
              <h3>{$t("settings.theme")}</h3>
              <p class="panel-note">Match system or choose a fixed theme.</p>
            </div>
          </div>
        <span class="pill">Personal</span>
        </div>
        <div class="control">
          <label id="theme-label">{$t("settings.theme")}</label>
          <div class="segmented" role="group" aria-labelledby="theme-label">
            {#each themes as entry}
              <button
                type="button"
                class:selected={$theme === entry}
                onclick={() => setTheme(entry)}
              >
                {$t(`settings.theme.${entry}`)}
              </button>
            {/each}
          </div>
        </div>
      </section>
    {:else if activeSection === "system"}
      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <span class="icon-wrap" aria-hidden="true">
              <svg class="icon-svg" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="12" rx="3" stroke="currentColor" stroke-width="1.6" />
                <path d="M7 19h10" stroke="currentColor" stroke-width="1.6" />
                <circle cx="8" cy="9" r="1.5" fill="currentColor" />
                <circle cx="12" cy="9" r="1.5" fill="currentColor" />
                <circle cx="16" cy="9" r="1.5" fill="currentColor" />
              </svg>
            </span>
            <div>
              <h3>{$t("settings.system")}</h3>
              <p class="panel-note">Background behaviors and updates.</p>
            </div>
          </div>
          <span class="pill">Device</span>
        </div>
        <div class="list">
          <div class="list-row">
            <div>
              <div class="row-title">
                <svg class="mini-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 12a6 6 0 0 1 10.24-4.24L18 9"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                  />
                  <path d="M18 9V5h-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  <path
                    d="M18 12a6 6 0 0 1-10.24 4.24L6 15"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                  />
                  <path d="M6 15v4h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
                <h4>{$t("settings.auto_update")}</h4>
              </div>
              <p>{$t("settings.auto_update_desc")}</p>
            </div>
            <button
              type="button"
              class:toggle-on={$settings.autoUpdate}
              class="toggle"
              onclick={() => updateSettings({ autoUpdate: !$settings.autoUpdate })}
              aria-label={$t("settings.auto_update")}
              title={$t("settings.auto_update_desc")}
            >
              <span class="knob"></span>
            </button>
          </div>

          <div class="list-row">
            <div>
              <div class="row-title">
                <svg class="mini-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 4v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  <path d="M8.5 7.5L12 4l3.5 3.5" stroke="currentColor" stroke-width="1.6" />
                  <rect x="5" y="13" width="14" height="7" rx="3" stroke="currentColor" stroke-width="1.6" />
                </svg>
                <h4>{$t("settings.launch_on_startup")}</h4>
              </div>
              <p>{$t("settings.launch_on_startup_desc")}</p>
            </div>
            <button
              type="button"
              class:toggle-on={$settings.launchOnStartup}
              class="toggle"
              onclick={() => updateSettings({ launchOnStartup: !$settings.launchOnStartup })}
              aria-label={$t("settings.launch_on_startup")}
              title={$t("settings.launch_on_startup_desc")}
            >
              <span class="knob"></span>
            </button>
          </div>

          <div class="list-row">
            <div>
              <div class="row-title">
                <svg class="mini-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="4" y="6" width="16" height="10" rx="2.5" stroke="currentColor" stroke-width="1.6" />
                  <path d="M9 18h6" stroke="currentColor" stroke-width="1.6" />
                  <path d="M12 9v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
                <h4>{$t("settings.minimize_to_tray")}</h4>
              </div>
              <p>{$t("settings.minimize_to_tray_desc")}</p>
            </div>
            <button
              type="button"
              class:toggle-on={$settings.minimizeToTray}
              class="toggle"
              onclick={() => updateSettings({ minimizeToTray: !$settings.minimizeToTray })}
              aria-label={$t("settings.minimize_to_tray")}
              title={$t("settings.minimize_to_tray_desc")}
            >
              <span class="knob"></span>
            </button>
          </div>
        </div>
      </section>
    {:else if activeSection === "gateway"}
      <!-- Gateway Management Panel -->
      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <span class="icon-wrap" aria-hidden="true">
              <Radio size={20} color="var(--color-primary)" />
            </span>
            <div>
              <h3>{$t("gateway.manage")}</h3>
              <p class="panel-note">{$t("gateway.manage_desc")}</p>
            </div>
          </div>
          <span class="pill">Connection</span>
        </div>

        {#if store.gateways.length === 0}
          <div class="gateway-empty">
            <p>{$t("gateway.empty")}</p>
          </div>
        {:else}
          <div class="gateway-list">
            {#each store.gateways as gateway (gateway.id)}
              {@const state = store.gatewayStates.get(gateway.id)}
              <div class="gateway-row">
                <button class="gateway-status-btn" onclick={() => handleToggleConnect(gateway)} title={state?.status === "connected" ? $t("gateway.disconnect") : $t("gateway.connect")}>
                  <span class="gw-dot" style="background: {getStatusColor(state?.status)}"></span>
                </button>
                <div class="gateway-info">
                  <div class="gateway-name">{gateway.name}</div>
                  <div class="gateway-meta">
                    <span class="gateway-url">{gateway.url}</span>
                    <span class="gateway-auth-badge">
                      {#if gateway.authMethod === "tailscale"}
                        <Shield size={10} />
                      {:else if gateway.authMethod === "token"}
                        <Key size={10} />
                      {:else}
                        <Lock size={10} />
                      {/if}
                      {$t(`gateway.auth.${gateway.authMethod}`)}
                    </span>
                    <span class="gateway-status-label">{getStatusLabel(state?.status)}</span>
                  </div>
                </div>
                <div class="gateway-actions">
                  <button class="gw-action-btn" onclick={() => handleEditGateway(gateway)} title={$t("common.edit")}>
                    <Pencil size={13} />
                  </button>
                  <button class="gw-action-btn danger" onclick={() => handleDeleteGateway(gateway)} title={$t("gateway.remove")}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <button class="gateway-add-btn" onclick={handleAddGateway}>
          <Plus size={15} strokeWidth={2} />
          {$t("gateway.add")}
        </button>
      </section>
    {:else if activeSection === "apikeys"}
      <!-- API Keys Panel -->
      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <span class="icon-wrap" aria-hidden="true">
              <Key size={20} color="var(--color-primary)" />
            </span>
            <div>
              <h3>{$t("settings.apikeys")}</h3>
              <p class="panel-note">{$t("settings.apikeys.desc")}</p>
            </div>
          </div>
          <span class="pill">Local</span>
        </div>

        <div class="apikey-list">
          {#each API_PROVIDERS as provider (provider.key)}
            <div class="apikey-row">
              <div class="apikey-provider">
                <span class="apikey-icon" style="background: {provider.color}20; color: {provider.color}">{provider.icon}</span>
                <div class="apikey-meta">
                  <span class="apikey-name">{$t(`settings.apikeys.${provider.key}`)}</span>
                  <span class="apikey-desc">{$t(`settings.apikeys.${provider.key}.desc`)}</span>
                </div>
              </div>
              <div class="apikey-input-wrap">
                <input
                  type={visibleKeys[provider.key] ? "text" : "password"}
                  class="apikey-input"
                  placeholder={$t("settings.apikeys.placeholder")}
                  value={$settings.apiKeys[provider.key]}
                  onchange={(e) => handleApiKeyChange(provider.key, (e.currentTarget as HTMLInputElement).value)}
                />
                <button class="apikey-toggle" onclick={() => toggleKeyVisibility(provider.key)} title="Toggle visibility">
                  {#if visibleKeys[provider.key]}
                    <EyeOff size={14} />
                  {:else}
                    <Eye size={14} />
                  {/if}
                </button>
                {#if savedKeys[provider.key]}
                  <span class="apikey-saved">
                    <Check size={12} />
                    {$t("settings.apikeys.saved")}
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <div class="apikey-security">
          <Lock size={13} />
          <span>{$t("settings.apikeys.security_note")}</span>
        </div>
      </section>
    {/if}
    </section>
  </div>
</main>

{#if showGatewayModal}
  <AddGatewayModal editGateway={editingGateway} onclose={closeGatewayModal} />
{/if}


<style>
  .container {
    height: 100%;
    padding: 40px 5vw 64px;
    overflow-y: auto;
  }

  .shell {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: 24px;
    animation: fade-in 0.6s ease;
  }

  .sidebar {
    background: linear-gradient(150deg, rgba(99, 102, 241, 0.12), transparent 60%),
      var(--color-surface);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .brand {
    display: flex;
    gap: 14px;
    align-items: center;
  }

  .orb {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35);
  }

  h1 {
    margin: 0;
    font-size: 20px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
  }

  h3 {
    margin: 0;
    font-size: 16px;
  }

  .subtitle {
    margin: 4px 0 0;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--color-text);
    background: transparent;
    border: none;
    font-size: 13px;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .menu-item:hover {
    background: var(--color-surface-hover);
  }

  .menu-item.active {
    background: var(--color-surface-elevated);
    color: var(--color-primary);
    font-weight: 500;
  }

  .menu-divider {
    height: 1px;
    background: var(--color-border);
    margin: var(--space-xs) 0;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-primary);
  }

  .dot.ghost {
    background: var(--color-border-strong);
  }

  .status {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chip {
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    background: var(--color-surface-elevated);
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .hint {
    font-size: 12px;
    color: var(--color-text-subtle);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    flex: 1;
    overflow-y: auto;
  }

  .header {
    background: var(--color-surface);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--color-border);
  }

  .panel {
    background: var(--color-surface);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    animation: rise-in 0.4s var(--ease-out);
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .icon-wrap {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05));
    position: relative;
  }

  .icon-svg {
    width: 20px;
    height: 20px;
    color: var(--color-primary);
  }

  .panel-note {
    margin: 4px 0 0;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .row-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mini-icon {
    width: 16px;
    height: 16px;
    color: var(--color-primary);
  }

  h4 {
    margin: 0 0 4px;
    font-size: 14px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .list-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-lg);
    align-items: center;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-surface-elevated);
  }

  .list-row p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .pill {
    padding: 4px 10px;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .control {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  label {
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .select {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: 13px;
    outline: none;
    transition: border-color var(--duration-fast) var(--ease-out);
  }

  .select:focus {
    border-color: var(--color-primary);
  }

  .segmented {
    display: inline-flex;
    gap: 4px;
    background: var(--color-surface-elevated);
    padding: var(--space-xs);
    border-radius: var(--radius-full);
  }

  .segmented button {
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-full);
    cursor: pointer;
    font-size: 12px;
    font-family: var(--font-sans);
    transition: all var(--duration-fast) var(--ease-out);
  }

  .segmented button.selected {
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-sm);
  }

  .toggle {
    width: 44px;
    height: 24px;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
    position: relative;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .toggle .knob {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    position: absolute;
    top: 2px;
    left: 3px;
    transition: transform var(--duration-fast) var(--ease-spring);
    box-shadow: var(--shadow-sm);
  }

  .toggle.toggle-on {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  .toggle.toggle-on .knob {
    transform: translateX(19px);
  }

  .menu-item,
  .panel,
  .header,
  .sidebar {
    transition: transform var(--duration-normal) var(--ease-out),
                box-shadow var(--duration-normal) var(--ease-out);
  }

  .panel:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .menu-item:hover {
    transform: translateX(2px);
  }

  .segmented button:hover {
    transform: translateY(-1px);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes rise-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Gateway Panel */
  .gateway-empty {
    text-align: center;
    padding: var(--space-xl);
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .gateway-empty p {
    margin: 0;
  }

  .gateway-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gateway-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    transition: background var(--duration-fast) var(--ease-out);
  }

  .gateway-row:hover {
    background: var(--color-surface-elevated);
  }

  .gateway-row:hover .gateway-actions {
    opacity: 1;
  }

  .gateway-status-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--duration-fast) var(--ease-out);
  }

  .gateway-status-btn:hover {
    background: var(--color-surface-hover);
  }

  .gw-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    box-shadow: 0 0 5px currentColor;
  }

  .gateway-info {
    flex: 1;
    min-width: 0;
  }

  .gateway-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gateway-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: 2px;
    flex-wrap: wrap;
  }

  .gateway-url {
    font-size: 11px;
    color: var(--color-text-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .gateway-auth-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-full);
    background: rgba(99, 102, 241, 0.1);
    color: var(--color-primary);
    white-space: nowrap;
  }

  .gateway-status-label {
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .gateway-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .gw-action-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .gw-action-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .gw-action-btn.danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-error);
  }

  .gateway-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .gateway-add-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: rgba(99, 102, 241, 0.05);
  }

  /* API Keys Panel */
  .apikey-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .apikey-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-surface-elevated);
    transition: background var(--duration-fast) var(--ease-out);
  }

  .apikey-row:hover {
    background: var(--color-surface-hover);
  }

  .apikey-provider {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .apikey-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }

  .apikey-meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .apikey-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }

  .apikey-desc {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .apikey-input-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    position: relative;
  }

  .apikey-input {
    flex: 1;
    padding: 7px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    outline: none;
    transition: border-color var(--duration-fast) var(--ease-out);
  }

  .apikey-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
  }

  .apikey-input::placeholder {
    color: var(--color-text-subtle);
    font-family: var(--font-sans);
  }

  .apikey-toggle {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .apikey-toggle:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-surface-hover);
  }

  .apikey-saved {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: var(--color-success, #22c55e);
    font-weight: 500;
    animation: saved-fade 1.5s ease forwards;
    flex-shrink: 0;
  }

  @keyframes saved-fade {
    0% { opacity: 0; transform: translateY(2px); }
    15% { opacity: 1; transform: translateY(0); }
    75% { opacity: 1; }
    100% { opacity: 0; }
  }

  .apikey-security {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: var(--space-sm) var(--space-md);
    background: rgba(99, 102, 241, 0.06);
    border-radius: var(--radius-md);
    border: 1px solid rgba(99, 102, 241, 0.1);
    font-size: 11px;
    color: var(--color-text-muted);
  }

  @media (max-width: 900px) {
    .shell {
      grid-template-columns: 1fr;
    }
  }
</style>
