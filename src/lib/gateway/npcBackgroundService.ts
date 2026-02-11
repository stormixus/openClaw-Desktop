/**
 * NPC Background Generation Service
 * Supports multiple providers: Google Imagen (default) and Nanobanana.
 * Stores generated images as PNG files via Tauri Rust backend.
 * Uses SQLite for path references and an in-memory cache for synchronous access.
 */

import { get, writable } from "svelte/store";
import { settings } from "$lib/settings";
import { db } from "$lib/db";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

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

export type BgGenerationState = {
  isGenerating: boolean;
  provider: string | null;
  error?: string;
};

// ============================================================================
// State Store
// ============================================================================

export const bgGenerationState = writable<BgGenerationState>({
  isGenerating: false,
  provider: null,
});

// ============================================================================
// Provider Interface & Implementations
// ============================================================================

interface BackgroundProvider {
  name: string;
  isConfigured(): boolean;
  generate(prompt: string, themeId: string): Promise<BgGenerationResult>;
}

class GoogleImagenProvider implements BackgroundProvider {
  name = "Google Imagen";
  private model = "imagen-3.0-generate-002";

  isConfigured(): boolean {
    const s = get(settings);
    return !!(s.apiKeys?.google?.trim());
  }

  async generate(prompt: string, themeId: string): Promise<BgGenerationResult> {
    const s = get(settings);
    const apiKey = s.apiKeys?.google?.trim();
    if (!apiKey) return { success: false, error: "Google AI API key not set" };

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:predict?key=${apiKey}`;

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

      return await saveGeneratedImage(themeId, imageBytes);

    } catch (e) {
      console.error("[BG] Imagen generation failed:", e);
      return { success: false, error: String(e) };
    }
  }
}

class NanobananaProvider implements BackgroundProvider {
  name = "Nanobanana";
  // NOTE: Verify this endpoint. Using a generic structure based on planning.
  private baseUrl = "https://nanobananaapi.ai/api/v1/generate";

  isConfigured(): boolean {
    const s = get(settings);
    return !!(s.apiKeys?.nanobanana?.trim());
  }

  async generate(prompt: string, themeId: string): Promise<BgGenerationResult> {
    const s = get(settings);
    const apiKey = s.apiKeys?.nanobanana?.trim();
    if (!apiKey) return { success: false, error: "Nanobanana API key not set" };

    try {
      // Assuming a standard POST structure.
      // Replace with actual endpoint and body structure if different.
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`, // Usual pattern
          "X-API-Key": apiKey // Alternative pattern
        },
        body: JSON.stringify({
          prompt,
          model: "nanobanana-v1", // distinct model name if needed
          size: "1024x576", // 16:9 approx
          response_format: "b64_json"
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("[BG] Nanobanana API error:", response.status, errText);
        return { success: false, error: `API error ${response.status}: ${errText}` };
      }

      const data = await response.json();
      // Adjust based on actual response structure
      const imageBytes = data?.data?.[0]?.b64_json || data?.image || data?.output;

      if (!imageBytes) {
        console.error("[BG] No image data in Nanobanana response:", data);
        return { success: false, error: "No image data returned" };
      }

      return await saveGeneratedImage(themeId, imageBytes);

    } catch (e) {
      console.error("[BG] Nanobanana generation failed:", e);
      return { success: false, error: String(e) };
    }
  }
}

/** Helper to save base64 image and return URL */
async function saveGeneratedImage(themeId: string, base64Data: string): Promise<BgGenerationResult> {
  try {
     // Save to file via Tauri backend
     const filePath = await invoke<string>("save_npc_background", {
      themeId,
      base64Data,
    });

    // Convert to webview-accessible URL
    const assetUrl = convertFileSrc(filePath);

    // Cache in memory and SQLite
    memCache.set(themeId, assetUrl);
    db.bgPaths.set(themeId, filePath).catch((e) => {
      console.warn("[BG] Failed to save bg path to DB:", e);
    });

    return { success: true, dataUrl: assetUrl };
  } catch (e) {
    console.error("[BG] Failed to save image:", e);
    return { success: false, error: String(e) };
  }
}

// ============================================================================
// In-memory cache (for synchronous access)
// ============================================================================

const memCache = new Map<string, string>();
const providers = {
  google: new GoogleImagenProvider(),
  nanobanana: new NanobananaProvider()
};

// ============================================================================
// Public API
// ============================================================================

/** Check if ANY generation key is available */
export function hasGenerationKey(): boolean {
  return providers.google.isConfigured() || providers.nanobanana.isConfigured();
}

/** Backward compatibility */
export const hasGoogleAiKey = hasGenerationKey;

/** Get cached background URL for a theme (synchronous, from memory cache) */
export function getCachedBackground(themeId: string): string | null {
  return memCache.get(themeId) ?? null;
}

/** Load cached background from SQLite/filesystem into memory cache */
export async function loadCachedBackground(themeId: string): Promise<string | null> {
  // Already in memory
  const cached = memCache.get(themeId);
  if (cached) return cached;

  // Check SQLite for saved file path
  try {
    const savedPath = await db.bgPaths.get(themeId);
    if (savedPath) {
      const assetUrl = convertFileSrc(savedPath);
      memCache.set(themeId, assetUrl);
      return assetUrl;
    }
  } catch (e) {
    console.warn("[BG] Failed to read bg path from DB:", e);
  }

  // Check if file exists on disk (may have been saved before but DB was empty)
  try {
    const filePath = await invoke<string | null>("get_npc_bg_path", { themeId });
    if (filePath) {
      const assetUrl = convertFileSrc(filePath);
      memCache.set(themeId, assetUrl);
      // Store in DB for next time
      db.bgPaths.set(themeId, filePath).catch(() => {});
      return assetUrl;
    }
  } catch (e) {
    console.warn("[BG] Failed to check bg path:", e);
  }

  return null;
}

/** Initialize background service — pre-load cached paths from SQLite into memory */
export async function initBackgroundService(): Promise<void> {
  // Load all known bg paths from the DB's npc_bg_paths table
  // We don't have a "list all" command, so we'll rely on loadCachedBackground
  // being called on-demand for each theme. The initial scan from localStorage
  // is no longer needed since we've migrated to SQLite.
}

/** Clear cached background for a theme */
export async function clearCachedBackground(themeId: string): Promise<void> {
  memCache.delete(themeId);
  try {
    // Remove from DB
    // Note: We don't have a dedicated delete command for bg_paths,
    // but we can overwrite with empty or just let it be.
    // The actual file deletion handles cleanup.
    await invoke("delete_npc_background", { themeId });
  } catch (e) {
    console.warn("[BG] Failed to delete bg file:", e);
  }
}

/**
 * Generate a background image using the configured provider.
 * Priority: Nanobanana (if key set) -> Google Imagen (if key set)
 */
export async function generateNpcBackground(
  themeId: string,
  bgKey: string,
  customPrompt?: string
): Promise<BgGenerationResult> {

  const prompt =
    customPrompt ||
    DEFAULT_PROMPTS[bgKey] ||
    `${bgKey} themed scene, atmospheric background, no characters, no text, cinematic wide shot`;

  // Determine provider priority
  let provider: BackgroundProvider | null = null;

  if (providers.nanobanana.isConfigured()) {
    provider = providers.nanobanana;
  } else if (providers.google.isConfigured()) {
    provider = providers.google;
  }

  if (!provider) {
    return { success: false, error: "No AI image generation API key set" };
  }

  console.log(`[BG] Generating background for ${themeId} using ${provider.name}`);

  bgGenerationState.set({ isGenerating: true, provider: provider.name });

  try {
    const result = await provider.generate(prompt, themeId);
    bgGenerationState.set({
      isGenerating: false,
      provider: null,
      error: result.error
    });
    return result;
  } catch (e) {
    bgGenerationState.set({
      isGenerating: false,
      provider: null,
      error: String(e)
    });
    throw e;
  }
}
