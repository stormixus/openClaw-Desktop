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

function isSupportedLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

function resolveLocale(raw?: string | null): Locale | null {
  if (!raw) return null;

  const normalized = raw
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();
  if (!normalized) return null;

  // Accept single locale tags or header-like values (e.g. "ko-KR,en-US;q=0.9").
  const firstCandidate = normalized
    .split(",")[0]
    ?.split(";")[0]
    ?.trim();
  if (!firstCandidate) return null;

  if (isSupportedLocale(firstCandidate)) return firstCandidate;
  const base = firstCandidate.split("-")[0];
  if (isSupportedLocale(base)) return base;

  // Friendly fallback mapping for future locale-file expansion.
  if (firstCandidate.startsWith("ko")) return "ko";
  if (firstCandidate.startsWith("en")) return "en";
  return null;
}

function detectBrowserLocale(): Locale {
  const candidates: string[] = [];

  if (browser) {
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (typeof navigator.language === "string" && navigator.language.trim()) {
      candidates.push(navigator.language);
    }
  }

  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (intlLocale) candidates.push(intlLocale);
  } catch {
    // Ignore platform Intl failures and fall back below.
  }

  for (const candidate of candidates) {
    const resolved = resolveLocale(candidate);
    if (resolved) return resolved;
  }

  return FALLBACK_LOCALE;
}

export function initLocale() {
  if (!browser) return;
  const savedRaw = localStorage.getItem(STORAGE_KEY);
  const saved = resolveLocale(savedRaw);
  if (saved) {
    locale.set(saved);
    return;
  }
  if (savedRaw) {
    localStorage.removeItem(STORAGE_KEY);
  }

  locale.set(detectBrowserLocale());
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
