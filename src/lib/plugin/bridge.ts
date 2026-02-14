/**
 * PluginBridge — MessageChannel-based communication between host and plugin iframe.
 * Handles permission gating, LLM proxy, and scoped storage.
 */

import type {
  OcMessage,
  GrantedPermissions,
  InitPayload,
  LlmInvokePayload,
} from './types';
import { store, getActiveClient } from '$lib/gateway/store.svelte';
import { invoke } from '@tauri-apps/api/core';

function uuid(): string {
  return crypto.randomUUID();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class PluginBridge {
  private port: MessagePort | null = null;
  private pluginId: string;
  private permissions: GrantedPermissions;
  private destroyed = false;

  constructor(
    private iframe: HTMLIFrameElement,
    pluginId: string,
    permissions: GrantedPermissions,
  ) {
    this.pluginId = pluginId;
    this.permissions = permissions;
  }

  /**
   * Initiate the handshake: create a MessageChannel and pass port2 to the plugin.
   */
  connect(initPayload: InitPayload): void {
    const channel = new MessageChannel();
    this.port = channel.port1;
    this.port.onmessage = (e) => this.handleMessage(e.data);

    // Send port2 to the iframe via postMessage
    this.iframe.contentWindow?.postMessage(
      { type: 'oc:handshake' },
      '*',
      [channel.port2],
    );

    // Send init after a brief delay to let the plugin set up its port listener
    setTimeout(() => {
      this.send({ v: '0.1', id: uuid(), type: 'oc:init', payload: initPayload });
    }, 50);
  }

  /**
   * Send a typed message to the plugin.
   */
  private send(msg: OcMessage): void {
    if (this.destroyed || !this.port) return;
    this.port.postMessage(msg);
  }

  /**
   * Reply to a plugin request.
   */
  private reply(original: OcMessage, payload: unknown): void {
    this.send({
      v: '0.1',
      id: uuid(),
      type: `${original.type}.reply`,
      payload,
      replyTo: original.id,
    });
  }

  /**
   * Send an error reply.
   */
  private error(original: OcMessage, message: string): void {
    this.send({
      v: '0.1',
      id: uuid(),
      type: `${original.type}.error`,
      payload: { error: message },
      replyTo: original.id,
    });
  }

  /**
   * Route incoming messages from the plugin.
   */
  private handleMessage(msg: OcMessage): void {
    if (this.destroyed) return;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'plugin:ready':
        console.log(`[PluginBridge] Plugin ${this.pluginId} ready`);
        break;

      case 'storage:get':
      case 'storage:set':
      case 'storage:delete':
      case 'storage:list':
        this.handleStorage(msg);
        break;

      case 'llm:invoke':
        this.handleLlmInvoke(msg);
        break;

      case 'plugin:saveStateResult':
        this.handleSaveState(msg);
        break;

      default:
        console.warn(`[PluginBridge] Unknown message type: ${msg.type}`);
    }
  }

  // ===========================================================================
  // Storage
  // ===========================================================================

  private async handleStorage(msg: OcMessage): Promise<void> {
    if (!this.permissions.storage) {
      return this.error(msg, 'Storage permission denied');
    }

    try {
      const payload = msg.payload as Record<string, unknown>;
      const scopedKey = `${this.pluginId}/${payload.key ?? ''}`;

      switch (msg.type) {
        case 'storage:get': {
          const value = await invoke('plugin_storage_get', { pluginId: this.pluginId, key: scopedKey });
          this.reply(msg, { value });
          break;
        }
        case 'storage:set': {
          await invoke('plugin_storage_set', { pluginId: this.pluginId, key: scopedKey, value: JSON.stringify(payload.value) });
          this.reply(msg, { ok: true });
          break;
        }
        case 'storage:delete': {
          await invoke('plugin_storage_delete', { pluginId: this.pluginId, key: scopedKey });
          this.reply(msg, { ok: true });
          break;
        }
        case 'storage:list': {
          const keys = await invoke('plugin_storage_list', { pluginId: this.pluginId, prefix: scopedKey });
          this.reply(msg, { keys });
          break;
        }
      }
    } catch (e: any) {
      this.error(msg, e.message || String(e));
    }
  }

  // ===========================================================================
  // LLM Proxy
  // ===========================================================================

  private async handleLlmInvoke(msg: OcMessage): Promise<void> {
    if (!this.permissions.llm) {
      return this.error(msg, 'LLM permission denied');
    }

    const client = getActiveClient();
    if (!client || !store.activeGatewayId) {
      return this.error(msg, 'No gateway connected');
    }

    const payload = msg.payload as LlmInvokePayload;
    const sessKey = `plugin-${this.pluginId}-${uuid().slice(0, 8)}`;

    try {
      const prompt = payload.messages
        .map((m) => (m.role === 'system' ? `[System] ${m.content}` : m.content))
        .join('\n\n');

      await client.sendChat({
        sessionKey: sessKey,
        message: prompt,
        idempotencyKey: uuid(),
        deliver: false,
      });

      // Poll for response (same pattern as chess/janggi)
      let response = '';
      for (let i = 0; i < 30; i++) {
        await delay(1000);
        if (this.destroyed) return;
        try {
          const hist = await client.getChatHistory(sessKey);
          const assist = hist.find((m: any) => m.role === 'assistant');
          if (assist?.content) {
            response = assist.content;
            break;
          }
        } catch { /* keep polling */ }
      }

      if (response) {
        this.reply(msg, {
          content: response,
          tokensUsed: Math.round(response.length * 1.3),
        });
      } else {
        this.error(msg, 'LLM response timeout');
      }
    } catch (e: any) {
      this.error(msg, e.message || String(e));
    }
  }

  // ===========================================================================
  // Save State
  // ===========================================================================

  private handleSaveState(msg: OcMessage): void {
    // Store the plugin's save state via Tauri
    const data = msg.payload;
    invoke('plugin_storage_set', {
      pluginId: this.pluginId,
      key: `${this.pluginId}/__save_state__`,
      value: JSON.stringify(data),
    }).catch((e) => console.error('[PluginBridge] Save state error:', e));
  }

  /**
   * Request the plugin to save its state.
   */
  requestSaveState(): void {
    this.send({ v: '0.1', id: uuid(), type: 'plugin:saveState' });
  }

  /**
   * Notify the plugin of theme/locale changes.
   */
  updateTheme(theme: Record<string, string>): void {
    this.send({ v: '0.1', id: uuid(), type: 'oc:themeUpdate', payload: { theme } });
  }

  updateLocale(locale: string): void {
    this.send({ v: '0.1', id: uuid(), type: 'oc:localeUpdate', payload: { locale } });
  }

  /**
   * Tear down the bridge.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.send({ v: '0.1', id: uuid(), type: 'oc:unmount' });
    setTimeout(() => {
      this.port?.close();
      this.port = null;
    }, 100);
  }
}
