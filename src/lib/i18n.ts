import { browser } from "$app/environment";
import { derived, writable } from "svelte/store";

const dictionaries = {
  en: {
    "app.title": "openClaw Desktop",
    "app.tagline": "Run openClaw locally with faster, native workflows.",
    "app.subtitle": "Your AI ops cockpit for capture, automate, and assist.",
    "home.badge": "openclaw · AI agent",
    "home.primary": "Open Settings",
    "home.secondary": "Start a workflow",
    "home.quick.workflows.title": "Workflows",
    "home.quick.workflows.desc": "One-click runs for daily routines.",
    "home.quick.agents.title": "Agents",
    "home.quick.agents.desc": "Keep specialized AI helpers ready.",
    "home.activity.title": "System",
    "home.activity.desc": "Local health and connectivity",
    "home.activity.status": "Healthy",
    "home.activity.latency": "Latency",
    "home.activity.queue": "Queue",
    "home.activity.agents": "Agents",
    "home.activity.last_sync": "Last sync",
    "home.activity.now": "Just now",
    "home.panel.note": "Desktop bridge check for native commands.",
    "nav.home": "Home",
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
    "nav.onboarding": "Onboarding",
    "greet.title": "Tauri Bridge Test",
    "greet.placeholder": "Enter a name...",
    "greet.button": "Greet",
    "onboarding.title": "Welcome to openClaw Desktop",
    "onboarding.subtitle": "Set up your workspace in a minute.",
    "onboarding.step1.title": "Connect your workflow",
    "onboarding.step1.desc": "Choose where openClaw should focus first.",
    "onboarding.step2.title": "Pick your style",
    "onboarding.step2.desc": "Use system theme or lock in light/dark.",
    "onboarding.step3.title": "Enable desktop boosts",
    "onboarding.step3.desc": "Auto updates and background run.",
    "onboarding.action.primary": "Finish setup",
    "onboarding.action.secondary": "Skip for now",
  },
  ko: {
    "app.title": "openClaw Desktop",
    "app.tagline": "openClaw를 로컬에서 더 빠르게 실행합니다.",
    "app.subtitle": "캡처, 자동화, 보조를 위한 AI 오퍼레이션 허브.",
    "home.badge": "openclaw · AI agent",
    "home.primary": "설정 열기",
    "home.secondary": "워크플로 시작",
    "home.quick.workflows.title": "워크플로",
    "home.quick.workflows.desc": "자주 쓰는 루틴을 원클릭으로 실행.",
    "home.quick.agents.title": "에이전트",
    "home.quick.agents.desc": "전문 AI 헬퍼를 상시 대기.",
    "home.activity.title": "시스템",
    "home.activity.desc": "로컬 상태와 연결",
    "home.activity.status": "정상",
    "home.activity.latency": "지연",
    "home.activity.queue": "대기열",
    "home.activity.agents": "에이전트",
    "home.activity.last_sync": "최근 동기화",
    "home.activity.now": "방금 전",
    "home.panel.note": "데스크톱 브리지 기본 테스트.",
    "nav.home": "홈",
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
    "nav.onboarding": "온보딩",
    "greet.title": "Tauri 브리지 테스트",
    "greet.placeholder": "이름을 입력하세요...",
    "greet.button": "인사하기",
    "onboarding.title": "openClaw Desktop에 오신 걸 환영합니다",
    "onboarding.subtitle": "1분 안에 기본 설정을 마칩니다.",
    "onboarding.step1.title": "워크플로 연결",
    "onboarding.step1.desc": "openClaw가 집중할 영역을 고르세요.",
    "onboarding.step2.title": "스타일 선택",
    "onboarding.step2.desc": "시스템 테마 또는 라이트/다크 고정.",
    "onboarding.step3.title": "데스크톱 강화",
    "onboarding.step3.desc": "자동 업데이트와 백그라운드 실행.",
    "onboarding.action.primary": "설정 완료",
    "onboarding.action.secondary": "나중에",
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
