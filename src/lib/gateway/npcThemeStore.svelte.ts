/**
 * NPC Theme Store — manages character themes (Svelte 5 Runes)
 * Custom themes and per-gateway active theme IDs are persisted in SQLite.
 */

import { browser } from "$app/environment";
import { db } from "$lib/db";
import type { NpcThemeRow } from "$lib/db";
import type { NpcTheme, NpcThemeAvatar, NpcCharacterParts } from "./npcThemeTypes";

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

function deserializeTheme(row: NpcThemeRow): NpcTheme | null {
  try {
    const data = JSON.parse(row.data) as NpcTheme;
    return { ...data, id: row.id, name: row.name, description: row.description ?? data.description, builtIn: false };
  } catch {
    return null;
  }
}

// The store
export const npcThemeState = $state({
  themes: [...BUILTIN_THEMES] as NpcTheme[],
  activeThemeId: "default" as string,
});

/**
 * Load custom themes from SQLite (called during init).
 */
export async function loadCustomThemesFromDb(): Promise<void> {
  if (!browser) return;
  try {
    const rows = await db.themes.listCustom();
    const custom = rows.map(deserializeTheme).filter((t): t is NpcTheme => t !== null);
    // Merge: keep existing built-in themes, replace custom
    const builtIns = npcThemeState.themes.filter(t => t.builtIn);
    npcThemeState.themes = [...builtIns, ...custom];
  } catch (e) {
    console.error("Failed to load custom themes from DB:", e);
  }
}

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

/** Select a theme by ID, persist per gateway (in SQLite via gateway state) */
export function selectTheme(themeId: string, gatewayId: string | null): void {
  if (!npcThemeState.themes.find(t => t.id === themeId)) return;
  npcThemeState.activeThemeId = themeId;
  if (gatewayId) {
    db.gateways.updateState(gatewayId, "active_npc_theme_id", themeId).catch((e) => {
      console.error("Failed to save active theme ID:", e);
    });
  }
}

/** Load the active theme for a specific gateway (from the gatewayRowCache in store) */
export function loadThemeForGateway(gatewayId: string | null): void {
  if (!gatewayId) {
    npcThemeState.activeThemeId = "default";
    return;
  }
  // The active theme ID is stored on the gateway row and loaded into the gatewayRowCache.
  // We read it from there via the store's internal cache.
  // For now, use a fallback: try to read from the DB asynchronously.
  db.gateways.list().then(rows => {
    const gw = rows.find(r => r.id === gatewayId);
    npcThemeState.activeThemeId = gw?.activeNpcThemeId ?? "default";
  }).catch(() => {
    npcThemeState.activeThemeId = "default";
  });
}

/** Add a custom theme */
export function addCustomTheme(theme: NpcTheme): void {
  // Ensure it doesn't overwrite a built-in
  if (npcThemeState.themes.find(t => t.id === theme.id && t.builtIn)) return;
  theme.builtIn = false;
  npcThemeState.themes = [...npcThemeState.themes.filter(t => t.id !== theme.id), theme];
  // Persist to SQLite
  db.themes.save({
    id: theme.id,
    name: theme.name,
    description: theme.description ?? null,
    data: JSON.stringify(theme),
  }).catch((e) => {
    console.error("Failed to save custom theme:", e);
  });
}

/** Remove a custom theme */
export function removeCustomTheme(themeId: string): void {
  const theme = npcThemeState.themes.find(t => t.id === themeId);
  if (!theme || theme.builtIn) return;
  npcThemeState.themes = npcThemeState.themes.filter(t => t.id !== themeId);
  // Remove from SQLite
  db.themes.delete(themeId).catch((e) => {
    console.error("Failed to delete custom theme:", e);
  });
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
