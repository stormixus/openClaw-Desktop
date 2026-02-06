import { browser } from "$app/environment";
import { derived, writable } from "svelte/store";
import en from "./lang/en";
import ko from "./lang/ko";

/**
 * i18n System
 * 
 * Language files are stored in:
 * - src/lib/lang/en/index.ts
 * - src/lib/lang/ko/index.ts
 * 
 * To add a new language:
 * 1. Create src/lib/lang/{code}/index.ts
 * 2. Import and add to dictionaries below
 * 3. Add to resolveLocale function
 */

const dictionaries = {
  en,
  ko,
} as const;

export type Locale = keyof typeof dictionaries;
export type TranslationKey = keyof typeof en;

const FALLBACK_LOCALE: Locale = "en";
const STORAGE_KEY = "openclaw.locale";

export const locales: Locale[] = Object.keys(dictionaries) as Locale[];
export const locale = writable<Locale>(FALLBACK_LOCALE);

function resolveLocale(raw?: string | null): Locale {
  if (!raw) return FALLBACK_LOCALE;
  const normalized = raw.toLowerCase();
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("en")) return "en";
  return FALLBACK_LOCALE;
}

export function initLocale() {
  if (!browser) return;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    locale.set(resolveLocale(saved));
    return;
  }
  locale.set(resolveLocale(navigator.language));
}

export function setLocale(next: Locale) {
  locale.set(next);
  if (browser) {
    localStorage.setItem(STORAGE_KEY, next);
  }
}

export const t = derived(locale, ($locale) => {
  const dict = dictionaries[$locale] ?? dictionaries[FALLBACK_LOCALE];
  return (key: TranslationKey | string) => dict[key as keyof typeof dict] ?? key;
});

// Export locale names for UI
export const localeNames: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
};
