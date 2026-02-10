import { browser } from "$app/environment";
import { writable } from "svelte/store";

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

const STORAGE_KEY = "openclaw.settings";

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

export function initSettings() {
  if (!browser) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    settings.set({
      ...DEFAULTS,
      ...parsed,
    });
  } catch {
    settings.set({ ...DEFAULTS });
  }
}

export function updateSettings(patch: Partial<SettingsState>) {
  settings.update((current) => {
    const next = { ...current, ...patch };
    if (browser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    return next;
  });
}
