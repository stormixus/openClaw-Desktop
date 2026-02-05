import { browser } from "$app/environment";
import { writable } from "svelte/store";

export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "openclaw.theme";

export const theme = writable<Theme>("system");

function prefersDark() {
  if (!browser) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function initTheme() {
  if (!browser) return;
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (saved === "light" || saved === "dark" || saved === "system") {
    theme.set(saved);
  }
}

export function setTheme(next: Theme) {
  theme.set(next);
  if (browser) {
    localStorage.setItem(STORAGE_KEY, next);
  }
}

export function applyThemeToDocument(next: Theme) {
  if (!browser) return;
  const resolved = next === "system" ? (prefersDark() ? "dark" : "light") : next;
  document.documentElement.dataset.theme = resolved;
}
