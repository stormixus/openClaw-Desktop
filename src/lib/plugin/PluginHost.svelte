<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { ArrowLeft } from '@lucide/svelte';
  import { t } from '$lib/i18n';
  import { locale } from '$lib/i18n';
  import { PluginBridge } from './bridge';
  import type { PluginMeta, GrantedPermissions, InitPayload } from './types';

  interface Props {
    pluginId: string;
  }
  let { pluginId }: Props = $props();

  let iframe: HTMLIFrameElement;
  let bridge: PluginBridge | null = null;
  let pluginMeta = $state<PluginMeta | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  function getThemeVars(): Record<string, string> {
    const style = getComputedStyle(document.documentElement);
    const vars: Record<string, string> = {};
    const keys = [
      'color-bg', 'color-surface', 'color-surface-elevated', 'color-surface-hover',
      'color-border', 'color-text', 'color-text-muted', 'color-text-subtle',
      'color-primary', 'radius-md', 'radius-lg', 'radius-xl',
    ];
    for (const k of keys) {
      vars[k] = style.getPropertyValue(`--${k}`).trim();
    }
    return vars;
  }

  onMount(async () => {
    try {
      pluginMeta = await invoke<PluginMeta>('plugin_get_meta', { pluginId });

      // Default: grant all declared permissions (future: show permission dialog)
      const granted: GrantedPermissions = {
        storage: pluginMeta.permissions.storage === 'scoped',
        clipboard: pluginMeta.permissions.clipboard || false,
        network: pluginMeta.permissions.network?.mode === 'allow',
        llm: pluginMeta.permissions.llm?.mode !== 'deny',
        notifications: pluginMeta.permissions.notifications ?? false,
      };

      bridge = new PluginBridge(iframe, pluginId, granted);

      // Wait for iframe to load before connecting
      iframe.onload = () => {
        const initPayload: InitPayload = {
          pluginId,
          sessionId: crypto.randomUUID(),
          locale: $locale,
          theme: getThemeVars(),
          capabilities: ['storage', 'llm'],
          grantedPermissions: granted,
        };
        bridge!.connect(initPayload);
        loading = false;
      };
    } catch (e: any) {
      error = e.message || String(e);
      loading = false;
    }
  });

  onDestroy(() => {
    bridge?.destroy();
    bridge = null;
  });
</script>

<div class="plugin-page">
  <div class="plugin-header">
    <a href="/play" class="back-link">
      <ArrowLeft size={16} />
      {$t('games.back') ?? 'Play'}
    </a>
    <h2>{pluginMeta?.name ?? pluginId}</h2>
    {#if pluginMeta?.version}
      <span class="version">v{pluginMeta.version}</span>
    {/if}
  </div>

  {#if error}
    <div class="plugin-error">
      <p>Failed to load plugin: {error}</p>
      <a href="/play">Back to Play</a>
    </div>
  {:else}
    {#if loading}
      <div class="plugin-loading">
        <span class="spinner"></span>
        <p>Loading plugin...</p>
      </div>
    {/if}
    <iframe
      bind:this={iframe}
      src={pluginMeta ? `tauri://localhost/plugin/${pluginId}/${pluginMeta.entry}` : 'about:blank'}
      sandbox="allow-scripts"
      class="plugin-frame"
      class:hidden={loading}
      title={pluginMeta?.name ?? pluginId}
    ></iframe>
  {/if}
</div>

<style>
  .plugin-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg);
  }

  .plugin-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 24px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
    text-decoration: none;
    padding: 5px 10px;
    border-radius: 6px;
    transition: all 150ms ease;
  }

  .back-link:hover {
    background: var(--color-surface-hover);
    color: var(--color-primary);
  }

  .plugin-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
  }

  .version {
    font-size: 11px;
    color: var(--color-text-subtle);
    background: var(--color-surface-elevated);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .plugin-frame {
    flex: 1;
    border: none;
    width: 100%;
    background: var(--color-bg);
  }

  .plugin-frame.hidden {
    opacity: 0;
  }

  .plugin-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .plugin-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .plugin-error a {
    color: var(--color-primary);
    text-decoration: none;
  }
</style>
