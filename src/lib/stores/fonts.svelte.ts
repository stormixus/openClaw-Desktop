import { invoke } from "@tauri-apps/api/core";

const DEFAULT_FONTS = [
  "Arial",
  "Calibri",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Georgia",
  "맑은 고딕",
  "나눔고딕",
  "바탕",
  "돋움",
  "굴림",
];

let loaded = false;
let fonts = $state<string[]>([]);

/** Sorted, deduplicated list of system font family names. Falls back to defaults. */
const systemFontsDerived = $derived(fonts.length > 0 ? fonts : DEFAULT_FONTS);
export function getSystemFonts(): string[] {
  return systemFontsDerived;
}

/** Load system fonts via Tauri backend. Safe to call multiple times (no-op after first success). */
export async function loadSystemFonts(): Promise<void> {
  if (loaded) return;
  try {
    const result = await invoke<string[]>("list_system_fonts");
    if (result.length > 0) {
      fonts = result;
      loaded = true;
    }
  } catch {
    // Keep DEFAULT_FONTS as fallback
  }
}
