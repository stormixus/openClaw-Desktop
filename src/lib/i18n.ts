import { browser } from "$app/environment";
import { derived, writable } from "svelte/store";

const dictionaries = {
  en: {
    "app.title": "openClaw Desktop",
    "app.tagline": "Use openClaw as a desktop app for better convenience.",
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.language.en": "English",
    "settings.language.ko": "Korean",
    "settings.appearance": "Appearance",
    "settings.theme": "Theme",
    "settings.theme.system": "System",
    "settings.theme.light": "Light",
    "settings.theme.dark": "Dark",
    "settings.system": "System",
    "settings.auto_update": "Automatic updates",
    "settings.auto_update_desc": "Download and install updates automatically.",
    "settings.launch_on_startup": "Launch on startup",
    "settings.launch_on_startup_desc": "Start openClaw Desktop when you log in.",
    "settings.minimize_to_tray": "Minimize to tray",
    "settings.minimize_to_tray_desc": "Keep running in the background when closed.",
    "nav.settings": "Settings",
    "nav.home": "Home",
    "greet.title": "Tauri Bridge Test",
    "greet.placeholder": "Enter a name...",
    "greet.button": "Greet",
  },
  ko: {
    "app.title": "openClaw Desktop",
    "app.tagline": "openClaw를 데스크톱 앱으로 사용해 더 편리하게 만듭니다.",
    "settings.title": "설정",
    "settings.language": "언어",
    "settings.language.en": "영어",
    "settings.language.ko": "한국어",
    "settings.appearance": "외형",
    "settings.theme": "테마",
    "settings.theme.system": "시스템",
    "settings.theme.light": "라이트",
    "settings.theme.dark": "다크",
    "settings.system": "시스템",
    "settings.auto_update": "자동 업데이트",
    "settings.auto_update_desc": "업데이트를 자동으로 내려받아 설치합니다.",
    "settings.launch_on_startup": "로그인 시 실행",
    "settings.launch_on_startup_desc": "로그인하면 openClaw Desktop을 자동 실행합니다.",
    "settings.minimize_to_tray": "트레이로 최소화",
    "settings.minimize_to_tray_desc": "닫아도 백그라운드에서 계속 실행합니다.",
    "nav.settings": "설정",
    "nav.home": "홈",
    "greet.title": "Tauri 브리지 테스트",
    "greet.placeholder": "이름을 입력하세요...",
    "greet.button": "인사하기",
  },
} as const;

export type Locale = keyof typeof dictionaries;

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
  return (key: string) => dict[key as keyof typeof dict] ?? key;
});
