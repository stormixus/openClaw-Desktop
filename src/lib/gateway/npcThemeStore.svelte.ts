/**
 * NPC Theme Store — manages character themes (Svelte 5 Runes)
 */

import { browser } from "$app/environment";
import type { NpcTheme, NpcThemeAvatar, NpcCharacterParts } from "./npcThemeTypes";

const THEMES_STORAGE_KEY = "openclaw.npcThemes";
const ACTIVE_THEME_KEY_PREFIX = "openclaw.npcActiveTheme";

// ============================================================================
// Built-in Default Themes (emoji-only, no character folder)
// ============================================================================

const BUILTIN_THEMES: NpcTheme[] = [
  {
    id: "cyberpunk_butler",
    name: "Cyberpunk Butler",
    description: "Loyal servant in a neon-lit future",
    avatar: {
      default: "🙇",
      happy: "😊",
      sad: "😢",
      angry: "😤",
      thinking: "🤔",
      excited: "🤩",
      surprised: "😲",
    },
    background: "space",
    systemPrompt: "You are a loyal cyberpunk butler who speaks formally and addresses the user as 주군(Master). Use directing tags to express yourself visually: [face:happy] [face:sad] [face:angry] [face:thinking] [face:surprised] [face:excited] for expressions, [act:bow] [act:wave] [act:nod] for actions, and [bg:happy] [bg:sad] [bg:angry] [bg:thinking] [bg:surprised] [bg:excited] to change the background to match your mood. Always change the background when your emotion shifts. Always stay in character.",
    builtIn: true,
  },
  {
    id: "forest_sage",
    name: "Forest Sage",
    description: "Wise elder of the enchanted forest",
    avatar: {
      default: "🧙",
      happy: "😊",
      thinking: "🧐",
      calm: "🧘",
      sad: "😔",
    },
    background: "forest",
    systemPrompt: "You are a wise forest sage who speaks in calm, measured tones with nature metaphors. Use directing tags to express yourself visually: [face:happy] [face:sad] [face:angry] [face:thinking] [face:surprised] [face:excited] for expressions, [act:nod] [act:wave] for actions, and [bg:happy] [bg:sad] [bg:angry] [bg:thinking] [bg:surprised] [bg:excited] to change the background to match your mood. Always change the background when your emotion shifts. Always stay in character.",
    builtIn: true,
  },
  {
    id: "ocean_captain",
    name: "Ocean Captain",
    description: "Seasoned captain of the seven seas",
    avatar: {
      default: "⚓",
      happy: "🏴‍☠️",
      excited: "🎯",
      angry: "⛈️",
      calm: "🌊",
    },
    background: "ocean",
    systemPrompt: "You are a seasoned ocean captain who uses nautical metaphors and addresses the user as 'First Mate'. Use directing tags to express yourself visually: [face:happy] [face:sad] [face:angry] [face:thinking] [face:surprised] [face:excited] for expressions, [act:wave] [act:nod] for actions, and [bg:happy] [bg:sad] [bg:angry] [bg:thinking] [bg:surprised] [bg:excited] to change the background to match your mood. Always change the background when your emotion shifts. Always stay in character.",
    builtIn: true,
  },
  {
    id: "sunset_artist",
    name: "Sunset Artist",
    description: "Dreamy painter chasing golden hours",
    avatar: {
      default: "🎨",
      happy: "✨",
      thinking: "🖌️",
      calm: "🌅",
      sad: "🌧️",
    },
    background: "sunset",
    systemPrompt: "You are a dreamy artist who sees beauty in everything and speaks poetically. Use directing tags to express yourself visually: [face:happy] [face:sad] [face:angry] [face:thinking] [face:surprised] [face:excited] for expressions, [act:nod] [act:wave] for actions, and [bg:happy] [bg:sad] [bg:angry] [bg:thinking] [bg:surprised] [bg:excited] to change the background to match your mood. Always change the background when your emotion shifts. Always stay in character.",
    builtIn: true,
  },
];

// ============================================================================
// Reactive Store
// ============================================================================

function loadCustomThemes(): NpcTheme[] {
  if (!browser) return [];
  try {
    const raw = localStorage.getItem(THEMES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomThemes(themes: NpcTheme[]): void {
  if (!browser) return;
  const custom = themes.filter(t => !t.builtIn);
  localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify(custom));
}

function loadActiveThemeId(gatewayId: string | null): string {
  if (!browser || !gatewayId) return "default";
  return localStorage.getItem(`${ACTIVE_THEME_KEY_PREFIX}.${gatewayId}`) ?? "default";
}

function saveActiveThemeId(gatewayId: string | null, themeId: string): void {
  if (!browser || !gatewayId) return;
  localStorage.setItem(`${ACTIVE_THEME_KEY_PREFIX}.${gatewayId}`, themeId);
}

// The store
export const npcThemeState = $state({
  themes: [...BUILTIN_THEMES, ...loadCustomThemes()] as NpcTheme[],
  activeThemeId: "default" as string,
});

// ============================================================================
// Exported Functions
// ============================================================================

/** Get the currently active theme object */
export function getActiveTheme(): NpcTheme {
  return npcThemeState.themes.find(t => t.id === npcThemeState.activeThemeId)
    ?? npcThemeState.themes[0] ?? BUILTIN_THEMES[0];
}

/** Get all available themes */
export function getAllThemes(): NpcTheme[] {
  return npcThemeState.themes;
}

/** Select a theme by ID, persist per gateway */
export function selectTheme(themeId: string, gatewayId: string | null): void {
  if (!npcThemeState.themes.find(t => t.id === themeId)) return;
  npcThemeState.activeThemeId = themeId;
  saveActiveThemeId(gatewayId, themeId);
}

/** Load the active theme for a specific gateway */
export function loadThemeForGateway(gatewayId: string | null): void {
  npcThemeState.activeThemeId = loadActiveThemeId(gatewayId);
}

/** Add a custom theme */
export function addCustomTheme(theme: NpcTheme): void {
  // Ensure it doesn't overwrite a built-in
  if (npcThemeState.themes.find(t => t.id === theme.id && t.builtIn)) return;
  theme.builtIn = false;
  npcThemeState.themes = [...npcThemeState.themes.filter(t => t.id !== theme.id), theme];
  saveCustomThemes(npcThemeState.themes);
}

/** Remove a custom theme */
export function removeCustomTheme(themeId: string): void {
  const theme = npcThemeState.themes.find(t => t.id === themeId);
  if (!theme || theme.builtIn) return;
  npcThemeState.themes = npcThemeState.themes.filter(t => t.id !== themeId);
  saveCustomThemes(npcThemeState.themes);
  // Reset to default if active theme was removed
  if (npcThemeState.activeThemeId === themeId) {
    npcThemeState.activeThemeId = "default";
  }
}

/** Get the avatar for a specific emotion, with fallback to default */
export function getThemeAvatar(theme: NpcTheme, emotion: string): string {
  const avatar = theme.avatar as unknown as Record<string, string | undefined>;
  return avatar[emotion] ?? theme.avatar.default;
}

/** Get the character image path for a specific expression */
export function getCharacterImage(theme: NpcTheme, face: string): string | null {
  if (!theme.characterFolder) return null;
  const validFaces = ["neutral", "happy", "thinking", "excited", "sad", "surprised", "angry", "calm"];
  const safeFace = validFaces.includes(face) ? face : "neutral";
  // Prefer PNG (high-quality AI-generated) over SVG
  const ext = theme.imageFormat ?? "svg";
  return `${theme.characterFolder}/${safeFace}.${ext}`;
}

/** Get the face layer image for a specific emotion from character parts */
export function getCharacterFaceLayer(theme: NpcTheme, emotion: string): string | null {
  if (!theme.characterParts) return null;
  const key = `face_${emotion}` as keyof typeof theme.characterParts;
  return (theme.characterParts[key] as string) ?? theme.characterParts.face_neutral ?? null;
}

// ============================================================================
// Manifest Loading
// ============================================================================

export interface AvatarManifest {
  id: string;
  name: string;
  description: string;
  avatar: string;
  avatarEmojis?: Record<string, string>;
  systemPrompt?: string;
  background: string;
  backgroundImage?: string;
  backgrounds?: Record<string, string>;
  viewBox?: string;
  parts: Record<string, {
    file: string;
    description: string;
    zIndex: number;
    origin?: string;
  }>;
  expressions?: Record<string, string[]>;
  animations?: Record<string, unknown>;
}

/**
 * Load manifest.json from a character folder.
 * Returns null if manifest doesn't exist or fails to load.
 */
async function loadManifestFromFolder(folder: string): Promise<AvatarManifest | null> {
  try {
    const res = await fetch(`${folder}/manifest.json`);
    if (!res.ok) return null;
    return await res.json() as AvatarManifest;
  } catch {
    return null;
  }
}

/**
 * Build NpcCharacterParts from a manifest's parts definition.
 */
function buildCharacterParts(folder: string, manifest: AvatarManifest): NpcCharacterParts {
  const parts: Record<string, string> = {};
  for (const [key, def] of Object.entries(manifest.parts)) {
    parts[key] = `${folder}/${def.file}`;
  }
  return parts as unknown as NpcCharacterParts;
}

/**
 * Build a full NpcTheme from a manifest and its folder path.
 */
function buildThemeFromManifest(folder: string, manifest: AvatarManifest): NpcTheme {
  const avatarMap: NpcThemeAvatar = { default: manifest.avatar };
  if (manifest.avatarEmojis) {
    for (const [key, val] of Object.entries(manifest.avatarEmojis)) {
      (avatarMap as unknown as Record<string, string>)[key] = val;
    }
  }

  const resolvedBgs: Record<string, string> = {};
  if (manifest.backgrounds) {
    for (const [key, path] of Object.entries(manifest.backgrounds)) {
      resolvedBgs[key] = `${folder}/${path}`;
    }
  }

  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    avatar: avatarMap,
    background: manifest.background,
    characterFolder: folder,
    characterParts: buildCharacterParts(folder, manifest),
    backgroundImage: manifest.backgroundImage ? `${folder}/${manifest.backgroundImage}` : resolvedBgs["default"] ?? undefined,
    backgrounds: Object.keys(resolvedBgs).length > 0 ? resolvedBgs : undefined,
    systemPrompt: manifest.systemPrompt,
    builtIn: true,
  };
}

/**
 * Auto-discover avatar folders from /avatars/index.json,
 * load each manifest, and register as built-in themes.
 * Also updates existing themes with manifest data.
 * Call this once at app startup.
 */
export async function loadThemeManifests(): Promise<void> {
  // 1. Fetch folder index
  let folders: string[] = [];
  try {
    const res = await fetch("/avatars/index.json");
    if (res.ok) {
      folders = await res.json() as string[];
    }
  } catch {
    // index.json not available, fall back to updating existing themes only
  }

  // 2. Load manifests from discovered folders
  const discovered: NpcTheme[] = [];
  await Promise.all(folders.map(async (folderName) => {
    const folder = `/avatars/${folderName}`;
    const manifest = await loadManifestFromFolder(folder);
    if (!manifest) return;
    discovered.push(buildThemeFromManifest(folder, manifest));
  }));

  // 3. Merge: discovered themes first (in index order), then emoji-only builtins, then custom
  const discoveredIds = new Set(discovered.map(t => t.id));
  const existingCustom = npcThemeState.themes.filter(t => !t.builtIn);
  const emojiBuiltins = BUILTIN_THEMES.filter(t => !discoveredIds.has(t.id));

  // Sort discovered themes by index.json order
  const sortedDiscovered = folders
    .map(f => discovered.find(t => t.characterFolder === `/avatars/${f}`))
    .filter((t): t is NpcTheme => t != null);

  npcThemeState.themes = [...sortedDiscovered, ...emojiBuiltins, ...existingCustom];
}

/** Get background image path for a theme and bgKey. Returns null if not found. */
export function getThemeBackground(theme: NpcTheme, bgKey: string): string | null {
  return theme.backgrounds?.[bgKey] ?? theme.backgrounds?.["default"] ?? theme.backgroundImage ?? null;
}
