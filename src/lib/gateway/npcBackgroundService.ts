/**
 * NPC Background Generation Service
 * Uses Google AI Imagen API to generate background images for NPC themes.
 * Stores generated images as base64 data URLs in localStorage.
 */

import { get } from "svelte/store";
import { settings } from "$lib/settings";

const BG_CACHE_PREFIX = "openclaw.npcBg.";
const IMAGEN_MODEL = "imagen-3.0-generate-002";

/** Default background prompts per theme background key */
const DEFAULT_PROMPTS: Record<string, string> = {
  default: "Futuristic dark control room with holographic displays, deep blue and indigo tones, atmospheric lighting, no characters, no text, cinematic wide shot",
  space: "Deep space nebula with distant stars and galaxies, dark purple and blue cosmic colors, ethereal atmosphere, no characters, no text, cinematic wide shot",
  forest: "Enchanted dark forest with bioluminescent plants and fireflies, deep green and emerald tones, misty atmosphere, no characters, no text, cinematic wide shot",
  ocean: "Deep ocean underwater scene with coral reefs and light rays from surface, dark teal and blue tones, mysterious atmosphere, no characters, no text, cinematic wide shot",
  sunset: "Dramatic sunset over mountains with purple and orange sky, silhouetted landscape, warm atmospheric glow, no characters, no text, cinematic wide shot",
};

export interface BgGenerationResult {
  success: boolean;
  dataUrl?: string;
  error?: string;
}

/** Check if Google AI key is available */
export function hasGoogleAiKey(): boolean {
  const s = get(settings);
  return !!(s.apiKeys?.google?.trim());
}

/** Get cached background for a theme (returns data URL or null) */
export function getCachedBackground(themeId: string): string | null {
  try {
    return localStorage.getItem(BG_CACHE_PREFIX + themeId);
  } catch {
    return null;
  }
}

/** Clear cached background for a theme */
export function clearCachedBackground(themeId: string): void {
  try {
    localStorage.removeItem(BG_CACHE_PREFIX + themeId);
  } catch {
    // ignore
  }
}

/**
 * Generate a background image using Google AI Imagen API.
 * @param themeId   - Theme ID for caching
 * @param bgKey     - Background key (default, space, forest, ocean, sunset) or custom prompt
 * @param customPrompt - Optional custom prompt (overrides bgKey default)
 */
export async function generateNpcBackground(
  themeId: string,
  bgKey: string,
  customPrompt?: string
): Promise<BgGenerationResult> {
  const s = get(settings);
  const apiKey = s.apiKeys?.google?.trim();
  if (!apiKey) {
    return { success: false, error: "Google AI API key not set" };
  }

  const prompt =
    customPrompt ||
    DEFAULT_PROMPTS[bgKey] ||
    `${bgKey} themed scene, atmospheric background, no characters, no text, cinematic wide shot`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "16:9",
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[BG] Imagen API error:", response.status, errText);
      return { success: false, error: `API error ${response.status}: ${errText}` };
    }

    const data = await response.json();
    const imageBytes =
      data?.predictions?.[0]?.bytesBase64Encoded ||
      data?.generatedImages?.[0]?.image?.imageBytes;

    if (!imageBytes) {
      console.error("[BG] No image data in response:", data);
      return { success: false, error: "No image data returned" };
    }

    const dataUrl = `data:image/png;base64,${imageBytes}`;

    // Cache to localStorage
    try {
      localStorage.setItem(BG_CACHE_PREFIX + themeId, dataUrl);
    } catch (e) {
      console.warn("[BG] Failed to cache background (localStorage full?):", e);
    }

    return { success: true, dataUrl };
  } catch (e) {
    console.error("[BG] Imagen generation failed:", e);
    return { success: false, error: String(e) };
  }
}
