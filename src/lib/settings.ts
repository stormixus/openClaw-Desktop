import { browser } from "$app/environment";
import { writable } from "svelte/store";
import { db } from "$lib/db";
import type { SettingsRow } from "$lib/db";

export type ApiKeys = {
  openai: string;
  anthropic: string;
  google: string;
  groq: string;
  mistral: string;
  openrouter: string;
  custom: string;
  nanobanana: string;
};

export type SettingsState = {
  autoUpdate: boolean;
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  apiKeys: ApiKeys;
};

const DEFAULTS: SettingsState = {
  autoUpdate: true,
  launchOnStartup: false,
  minimizeToTray: true,
  apiKeys: {
    openai: "",
    anthropic: "",
    google: "",
    groq: "",
    mistral: "",
    openrouter: "",
    custom: "",
    nanobanana: "",
  },
};

export const settings = writable<SettingsState>({ ...DEFAULTS });

export async function initSettings() {
  if (!browser) return;
  try {
    const row = await db.settings.get();
    let apiKeys: ApiKeys = { ...DEFAULTS.apiKeys };
    try {
      const parsed = JSON.parse(row.apiKeys);
      apiKeys = { ...DEFAULTS.apiKeys, ...parsed };
    } catch {
      // keep defaults
    }
    settings.set({
      autoUpdate: row.autoUpdate,
      launchOnStartup: row.launchOnStartup,
      minimizeToTray: row.minimizeToTray,
      apiKeys,
    });
  } catch {
    settings.set({ ...DEFAULTS });
  }
}

export async function updateSettings(patch: Partial<SettingsState>) {
  settings.update((current) => {
    const next = { ...current, ...patch };
    if (browser) {
      const row: SettingsRow = {
        autoUpdate: next.autoUpdate,
        launchOnStartup: next.launchOnStartup,
        minimizeToTray: next.minimizeToTray,
        apiKeys: JSON.stringify(next.apiKeys),
      };
      db.settings.save(row).catch((e) => {
        console.error("Failed to save settings to DB:", e);
      });
    }
    return next;
  });
}

export const saveSettings = updateSettings;
