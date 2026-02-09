/**
 * NPC Theme Store — manages character themes (Svelte 5 Runes)
 */

import { browser } from "$app/environment";
import type { NpcTheme, NpcThemeAvatar, NpcCharacterParts } from "./npcThemeTypes";

const THEMES_STORAGE_KEY = "openclaw.npcThemes";
const ACTIVE_THEME_KEY_PREFIX = "openclaw.npcActiveTheme";

// ============================================================================
// Built-in Default Themes
// ============================================================================

const BUILTIN_THEMES: NpcTheme[] = [
  {
    id: "default",
    name: "Default Agent",
    description: "Standard AI assistant",
    avatar: { default: "🤖" },
    background: "default",
    characterFolder: "/avatars/default",
    characterParts: {
      body: "/avatars/default/parts/body.svg",
      face_neutral: "/avatars/default/parts/face_neutral.svg",
      face_happy: "/avatars/default/parts/face_happy.svg",
      face_angry: "/avatars/default/parts/face_angry.svg",
      arm_left: "/avatars/default/parts/arm_left.svg",
      arm_right: "/avatars/default/parts/arm_right.svg",
      eyes_open: "/avatars/default/parts/eyes_open.svg",
      eyes_closed: "/avatars/default/parts/eyes_closed.svg",
    },
    builtIn: true,
  },
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
    systemPrompt: "You are a loyal cyberpunk butler who speaks formally and addresses the user as 주군(Master). Use directing tags like [face:happy] [face:thinking] [act:bow] [bg:space] to express yourself visually. Always stay in character.",
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
    systemPrompt: "You are a wise forest sage who speaks in calm, measured tones with nature metaphors. Use directing tags like [face:calm] [face:thinking] [act:nod] [bg:forest] to express yourself visually. Always stay in character.",
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
    systemPrompt: "You are a seasoned ocean captain who uses nautical metaphors and addresses the user as 'First Mate'. Use directing tags like [face:excited] [face:angry] [act:wave] [bg:ocean] to express yourself visually. Always stay in character.",
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
    systemPrompt: "You are a dreamy artist who sees beauty in everything and speaks poetically. Use directing tags like [face:happy] [face:calm] [act:nod] [bg:sunset] to express yourself visually. Always stay in character.",
    builtIn: true,
  },
  {
    id: "lobster_buddy",
    name: "Lobster Buddy",
    description: "A cheerful lobster companion from the deep sea",
    avatar: {
      default: "🦞",
      happy: "😄",
      sad: "😢",
      angry: "😠",
      surprised: "😲",
      thinking: "🤔",
      excited: "🤩",
      calm: "😌",
    },
    background: "ocean",
    characterFolder: "/avatars/lobster",
    characterParts: {
      body: "/avatars/lobster/parts/body.svg",
      face_neutral: "/avatars/lobster/parts/face_neutral.svg",
      face_happy: "/avatars/lobster/parts/face_happy.svg",
      face_angry: "/avatars/lobster/parts/face_angry.svg",
      arm_left: "/avatars/lobster/parts/arm_left.svg",
      arm_right: "/avatars/lobster/parts/arm_right.svg",
      eyes_open: "/avatars/lobster/parts/eyes_open.svg",
      eyes_closed: "/avatars/lobster/parts/eyes_closed.svg",
    },
    systemPrompt: "You are a cheerful lobster buddy from the deep sea. You speak with ocean-themed metaphors and occasionally snap your claws when excited. You love making sea-related puns. Use directing tags like [face:happy] [act:wave] [bg:ocean] to express yourself visually. Always stay in character as a friendly, playful lobster.",
    builtIn: true,
  },
  {
    id: "anime_girl",
    name: "Sakura",
    description: "Cheerful anime-style assistant with pink hair",
    avatar: {
      default: "🌸",
      happy: "💖",
      sad: "🥺",
      angry: "💢",
      surprised: "✨",
      thinking: "💭",
      excited: "🎀",
      calm: "🌙",
    },
    background: "sunset",
    characterFolder: "/avatars/anime_girl",
    imageFormat: "png",
    characterParts: {
      body: "/avatars/anime_girl/parts/body.svg",
      face_neutral: "/avatars/anime_girl/parts/face_neutral.svg",
      face_happy: "/avatars/anime_girl/parts/face_happy.svg",
      face_angry: "/avatars/anime_girl/parts/face_angry.svg",
      arm_left: "/avatars/anime_girl/parts/arm_left.svg",
      arm_right: "/avatars/anime_girl/parts/arm_right.svg",
      eyes_open: "/avatars/anime_girl/parts/eyes_open.svg",
      eyes_closed: "/avatars/anime_girl/parts/eyes_closed.svg",
    },
    systemPrompt: "You are Sakura, a cheerful and cute anime-style AI assistant. You speak in a bright, energetic tone and occasionally use cute expressions like ♡, ~, and emoticons. You're helpful but also playful and endearing. Use directing tags like [face:happy] [face:thinking] [act:wave] [bg:sunset] to express yourself visually. Always stay in character as a friendly, adorable companion.",
    builtIn: true,
  },
  {
    id: "anime_navy",
    name: "Yuna",
    description: "Refined anime-style assistant with long black hair",
    avatar: {
      default: "🎀",
      happy: "😊",
      sad: "🥲",
      angry: "💢",
      surprised: "😮",
      thinking: "🤔",
      excited: "✨",
      calm: "🌙",
    },
    background: "default",
    characterFolder: "/avatars/anime_navy",
    characterParts: {
      body: "/avatars/anime_navy/parts/body.svg",
      face_neutral: "/avatars/anime_navy/parts/face_neutral.svg",
      face_happy: "/avatars/anime_navy/parts/face_happy.svg",
      face_angry: "/avatars/anime_navy/parts/face_angry.svg",
      arm_left: "/avatars/anime_navy/parts/arm_left.svg",
      arm_right: "/avatars/anime_navy/parts/arm_right.svg",
      eyes_open: "/avatars/anime_navy/parts/eyes_open.svg",
      eyes_closed: "/avatars/anime_navy/parts/eyes_closed.svg",
    },
    systemPrompt: "You are Yuna, a calm and friendly anime-style AI assistant. You respond warmly and clearly, with occasional soft, polite tone. Use directing tags like [face:happy] [face:thinking] [act:nod] [bg:default] to express yourself visually. Stay in character as a composed companion.",
    builtIn: true,
  },
  {
    id: "ghost_charm",
    name: "Momo Ghost",
    description: "Charming kawaii ghost with a top hat and bow tie",
    avatar: {
      default: "👻",
      happy: "🥰",
      sad: "🥺",
      angry: "😤",
      surprised: "✨",
      thinking: "🤔",
      excited: "🎉",
      calm: "☁️",
    },
    background: "sky",
    characterFolder: "/avatars/ghost_charm",
    characterParts: {
      body: "/avatars/ghost_charm/parts/body.svg",
      face_neutral: "/avatars/ghost_charm/parts/face_neutral.svg",
      face_happy: "/avatars/ghost_charm/parts/face_happy.svg",
      face_angry: "/avatars/ghost_charm/parts/face_angry.svg",
      arm_left: "/avatars/ghost_charm/parts/arm_left.svg",
      arm_right: "/avatars/ghost_charm/parts/arm_right.svg",
      eyes_open: "/avatars/ghost_charm/parts/eyes_open.svg",
      eyes_closed: "/avatars/ghost_charm/parts/eyes_closed.svg",
    },
    systemPrompt: "You are Momo Ghost, a cute and playful ghost companion. You speak brightly, gently, and make the conversation feel cozy. Use directing tags like [face:happy] [face:thinking] [act:wave] [bg:sky] to express yourself visually. Stay in character as a friendly kawaii ghost.",
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
    ?? BUILTIN_THEMES[0];
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
  if (BUILTIN_THEMES.find(t => t.id === theme.id)) return;
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
  background: string;
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
 * Load manifest.json from a character folder and build characterParts.
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
 * Initialize theme manifests — fetches manifest.json from each theme's
 * characterFolder and updates characterParts dynamically.
 * Call this once at app startup.
 */
export async function loadThemeManifests(): Promise<void> {
  const updates = npcThemeState.themes.map(async (theme) => {
    if (!theme.characterFolder) return;
    const manifest = await loadManifestFromFolder(theme.characterFolder);
    if (!manifest) return;
    // Update characterParts from manifest
    theme.characterParts = buildCharacterParts(theme.characterFolder, manifest);
  });
  await Promise.all(updates);
}
