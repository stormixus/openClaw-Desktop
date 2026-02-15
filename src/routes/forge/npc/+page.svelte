<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    getAllThemes,
    addCustomTheme,
    removeCustomTheme,
    getCharacterImage,
    getThemeAvatar,
    getCharacterFaceLayer,
    getThemeBackground,
  } from "$lib/gateway/npcThemeStore.svelte";
  import type {
    NpcTheme,
    NpcCharacterParts,
    NpcPartOffset,
    NpcPartOrigin,
    NpcAnimationRig,
    NpcAnimationTrack,
    NpcMeshDeformer,
    NpcSpringConfig,
    NpcSpringAxis,
  } from "$lib/gateway/npcThemeTypes";
  import { Plus, Trash2, Save, Image as ImageIcon, MessageSquare, Monitor, Smile, Eye, Upload, RotateCcw, X, Play, Pause, Sparkles, Code2, WandSparkles } from "@lucide/svelte";
  import { t } from "$lib/i18n";

  // State
  let editingTheme = $state<NpcTheme | null>(null);
  let originalParts = $state<NpcCharacterParts | null>(null);
  let originalBgs = $state<Record<string, string> | null>(null);
  let previewEmotion = $state("neutral");
  let savedToast = $state(false);
  let previewMotion = $state("idle");
  let previewSpeed = $state(1);
  let animationPlaying = $state(true);
  let useCanvasRenderer = $state(true);
  let rigJsonText = $state("");
  let rigJsonError = $state<string | null>(null);

  let selectedPart = $state<string | null>(null);
  let previewCanvasEl = $state<HTMLCanvasElement | null>(null);
  let stageHostEl = $state<HTMLDivElement | null>(null);

  let animationFrameHandle: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let loadedImageSources = "";
  let playbackTimeMs = 0;
  let lastFrameTs = 0;

  type AnimPose = {
    x: number;
    y: number;
    rotate: number;
    scaleX: number;
    scaleY: number;
    opacity: number;
  };

  type RenderPart = {
    key: string;
    src: string;
    zIndex: number;
  };

  type Point = { x: number; y: number };

  type SpringRuntimeState = {
    x: number;
    y: number;
    rotate: number;
    vx: number;
    vy: number;
    vr: number;
  };

  const imageCache = new Map<string, HTMLImageElement>();
  const partLoadErrors = new Set<string>();
  const springStateMap = new Map<string, SpringRuntimeState>();

  // All expression keys
  const EXPRESSIONS = ["neutral", "happy", "thinking", "excited", "sad", "surprised", "angry", "calm"] as const;
  const EXPRESSION_LABELS: Record<string, string> = {
    neutral: "😐 Neutral",
    happy: "😊 Happy",
    thinking: "🤔 Thinking",
    excited: "🤩 Excited",
    sad: "😢 Sad",
    surprised: "😮 Surprised",
    angry: "😠 Angry",
    calm: "😌 Calm",
  };

  const BG_PRESETS = [
    { id: "default", label: "Default", gradient: "linear-gradient(135deg, #1a1032, #2d1b69)" },
    { id: "forest", label: "Forest", gradient: "linear-gradient(135deg, #0a1f0a, #2d7a2d)" },
    { id: "space", label: "Space", gradient: "linear-gradient(135deg, #020010, #0f0040)" },
    { id: "cozy", label: "Cozy", gradient: "linear-gradient(135deg, #2a1a0a, #6a4020)" },
    { id: "ocean", label: "Ocean", gradient: "linear-gradient(135deg, #001020, #005a7a)" },
    { id: "sunset", label: "Sunset", gradient: "linear-gradient(135deg, #6a2050, #f0a050)" },
  ];

  function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
  }

  function createDefaultAnimationRig(): NpcAnimationRig {
    return {
      version: 1,
      baseDurationMs: 3000,
      deformers: {
        body: {
          cols: 3,
          rows: 3,
          points: {
            "1,0": { x: 0, y: -0.8 },
            "1,2": { x: 0, y: 0.8 },
          },
        },
      },
      springs: {
        body: {
          enabled: true,
          follow: ["y", "rotate"],
          stiffness: 165,
          damping: 23,
          maxOffsetY: 5,
          maxRotate: 2.2,
        },
        arm_left: {
          enabled: true,
          follow: ["rotate"],
          stiffness: 220,
          damping: 26,
          maxRotate: 10,
        },
        arm_right: {
          enabled: true,
          follow: ["rotate"],
          stiffness: 220,
          damping: 26,
          maxRotate: 10,
        },
      },
      motions: {
        idle: {
          durationMs: 3200,
          tracks: {
            body: {
              easing: "easeInOutSine",
              keyframes: [
                { t: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 },
                { t: 0.5, y: -6, rotate: 0.3, scaleX: 1.002, scaleY: 1.008 },
                { t: 1, y: 0, rotate: 0, scaleX: 1, scaleY: 1 },
              ],
            },
            arm_left: {
              easing: "easeInOutSine",
              keyframes: [
                { t: 0, rotate: -1.2 },
                { t: 0.5, rotate: 1.6 },
                { t: 1, rotate: -1.2 },
              ],
            },
            arm_right: {
              easing: "easeInOutSine",
              keyframes: [
                { t: 0, rotate: 1.2 },
                { t: 0.5, rotate: -1.6 },
                { t: 1, rotate: 1.2 },
              ],
            },
          },
        },
        talk: {
          durationMs: 900,
          tracks: {
            body: {
              easing: "easeInOutQuad",
              keyframes: [
                { t: 0, y: -1, rotate: 0 },
                { t: 0.5, y: -3, rotate: 0.6 },
                { t: 1, y: -1, rotate: 0 },
              ],
            },
            face_neutral: {
              easing: "easeInOutSine",
              keyframes: [
                { t: 0, scaleY: 1 },
                { t: 0.5, scaleY: 1.02 },
                { t: 1, scaleY: 1 },
              ],
            },
          },
        },
      },
    };
  }

  function ensureAnimationRig(theme: NpcTheme, persist = false): NpcAnimationRig {
    if (!theme.animationRig || typeof theme.animationRig !== "object") {
      const fallback = createDefaultAnimationRig();
      if (persist) theme.animationRig = clone(fallback);
      return fallback;
    }

    const motions = theme.animationRig.motions && Object.keys(theme.animationRig.motions).length > 0
      ? theme.animationRig.motions
      : createDefaultAnimationRig().motions;

    const normalized: NpcAnimationRig = {
      version: theme.animationRig.version || 1,
      baseDurationMs: theme.animationRig.baseDurationMs ?? 3000,
      motions,
      deformers: theme.animationRig.deformers,
      springs: theme.animationRig.springs,
    };

    if (persist) theme.animationRig = clone(normalized);
    return normalized;
  }

  function detectTuneProfile(theme: NpcTheme): "anime" | "ghost" | "robot" | "default" {
    const id = `${theme.id} ${theme.name} ${theme.description}`.toLowerCase();
    if (id.includes("anime") || id.includes("muse")) return "anime";
    if (id.includes("ghost") || id.includes("spirit")) return "ghost";
    if (id.includes("robot") || id.includes("default")) return "robot";
    return "default";
  }

  function retuneMotionTracks(rig: NpcAnimationRig, profile: "anime" | "ghost" | "robot" | "default") {
    const bodyY = profile === "ghost" ? 10 : profile === "anime" ? 7 : profile === "robot" ? 4 : 6;
    const bodyR = profile === "ghost" ? 0.9 : profile === "anime" ? 0.45 : profile === "robot" ? 0.2 : 0.35;
    const armR = profile === "robot" ? 1.4 : profile === "ghost" ? 3.6 : 2.6;

    if (!rig.motions.idle) {
      rig.motions.idle = { durationMs: 3200, tracks: {} };
    }
    if (!rig.motions.talk) {
      rig.motions.talk = { durationMs: 900, tracks: {} };
    }

    rig.motions.idle.durationMs = profile === "ghost" ? 3600 : profile === "anime" ? 3000 : 3200;
    rig.motions.idle.tracks.body = {
      easing: "easeInOutSine",
      keyframes: [
        { t: 0, y: 0, rotate: -bodyR, scaleX: 1, scaleY: 1 },
        { t: 0.5, y: -bodyY, rotate: bodyR, scaleX: 1.004, scaleY: 1.012 },
        { t: 1, y: 0, rotate: -bodyR, scaleX: 1, scaleY: 1 },
      ],
    };

    const armLeft = rig.motions.idle.tracks.arm_left;
    if (armLeft) {
      rig.motions.idle.tracks.arm_left = {
        ...(armLeft ?? {}),
        easing: "easeInOutSine",
        keyframes: [
          { t: 0, rotate: -armR },
          { t: 0.5, rotate: armR },
          { t: 1, rotate: -armR },
        ],
      };
    }
    const armRight = rig.motions.idle.tracks.arm_right;
    if (armRight) {
      rig.motions.idle.tracks.arm_right = {
        ...(armRight ?? {}),
        easing: "easeInOutSine",
        keyframes: [
          { t: 0, rotate: armR },
          { t: 0.5, rotate: -armR },
          { t: 1, rotate: armR },
        ],
      };
    }

    const talkHeight = profile === "ghost" ? -5 : profile === "anime" ? -3.2 : -2.4;
    rig.motions.talk.durationMs = 840;
    rig.motions.talk.tracks.body = {
      easing: "easeInOutQuad",
      keyframes: [
        { t: 0, y: talkHeight * 0.4, rotate: 0 },
        { t: 0.5, y: talkHeight, rotate: 0.8 },
        { t: 1, y: talkHeight * 0.4, rotate: 0 },
      ],
    };
  }

  function createAutoTunedRig(theme: NpcTheme): NpcAnimationRig {
    const base = clone(ensureAnimationRig(theme));
    const profile = detectTuneProfile(theme);
    const parts = theme.characterParts ? Object.keys(theme.characterParts as unknown as Record<string, unknown>) : [];

    if (!base.springs) base.springs = {};
    if (!base.deformers) base.deformers = {};
    retuneMotionTracks(base, profile);

    const bodyStiffness = profile === "ghost" ? 130 : profile === "anime" ? 150 : profile === "robot" ? 200 : 170;
    const bodyDamping = profile === "ghost" ? 16 : profile === "anime" ? 20 : profile === "robot" ? 28 : 24;
    const bodyYOffset = profile === "ghost" ? 14 : profile === "anime" ? 9 : profile === "robot" ? 5 : 7;
    const bodyRotate = profile === "ghost" ? 4 : profile === "anime" ? 2.8 : profile === "robot" ? 1.8 : 2.3;

    if (parts.includes("body")) {
      base.springs.body = {
        enabled: true,
        follow: ["y", "rotate"],
        stiffness: bodyStiffness,
        damping: bodyDamping,
        mass: 1.25,
        maxOffsetY: bodyYOffset,
        maxRotate: bodyRotate,
      };

      base.deformers.body = {
        cols: 4,
        rows: 4,
        points: {
          "1,0": { x: 0, y: profile === "ghost" ? -2.2 : -1.1 },
          "2,0": { x: 0, y: profile === "ghost" ? -2.2 : -1.1 },
          "0,1": { x: -0.4, y: 0 },
          "3,1": { x: 0.4, y: 0 },
          "1,3": { x: 0, y: profile === "ghost" ? 1.2 : 0.7 },
          "2,3": { x: 0, y: profile === "ghost" ? 1.2 : 0.7 },
        },
      };
    }

    for (const key of parts) {
      if (key.startsWith("arm_")) {
        base.springs[key] = {
          enabled: true,
          follow: ["rotate", "x", "y"],
          stiffness: profile === "robot" ? 250 : 210,
          damping: profile === "ghost" ? 19 : 24,
          mass: 0.9,
          maxOffsetX: profile === "ghost" ? 18 : 10,
          maxOffsetY: profile === "ghost" ? 14 : 9,
          maxRotate: profile === "ghost" ? 18 : 13,
        };
      }
      if (key.startsWith("face_")) {
        base.springs[key] = {
          enabled: true,
          follow: ["y", "rotate"],
          stiffness: profile === "robot" ? 220 : 185,
          damping: 25,
          mass: 0.8,
          maxOffsetY: profile === "ghost" ? 3.2 : 2.2,
          maxRotate: profile === "ghost" ? 1.8 : 1.2,
        };
      }
      if (key.startsWith("eyes_")) {
        base.springs[key] = {
          enabled: true,
          follow: ["y"],
          stiffness: 210,
          damping: 27,
          mass: 0.7,
          maxOffsetY: 1.4,
        };
      }
      if (key.includes("hair") || key.includes("ribbon") || key.includes("tail")) {
        base.springs[key] = {
          enabled: true,
          follow: ["x", "y", "rotate"],
          stiffness: 120,
          damping: 13,
          mass: 1.5,
          maxOffsetX: 22,
          maxOffsetY: 22,
          maxRotate: 26,
        };
      }
    }

    return base;
  }

  function getOrderedPartKeys(theme: NpcTheme, emotion: string): string[] {
    if (!theme.characterParts) return [];
    const parts = theme.characterParts as unknown as Record<string, string | undefined>;
    const keys = new Set<string>();
    for (const [key, src] of Object.entries(parts)) {
      if (src) keys.add(key);
    }
    const faceKey = `face_${emotion === "neutral" ? "neutral" : emotion}`;
    if (parts[faceKey]) keys.add(faceKey);

    if (parts.eyes_open) {
      keys.delete("eyes_closed");
      keys.add("eyes_open");
    }

    return [...keys].sort((a, b) => {
      const za = theme.partZIndex?.[a] ?? defaultZIndex(a);
      const zb = theme.partZIndex?.[b] ?? defaultZIndex(b);
      if (za !== zb) return za - zb;
      return a.localeCompare(b);
    });
  }

  function defaultZIndex(key: string): number {
    if (key.startsWith("arm_")) return 10;
    if (key === "body") return 20;
    if (key.startsWith("eyes_")) return 30;
    if (key.startsWith("face_")) return 40;
    return 20;
  }

  function getVisibleRenderParts(theme: NpcTheme, emotion: string): RenderPart[] {
    if (!theme.characterParts) return [];
    const parts = theme.characterParts as unknown as Record<string, string | undefined>;
    const keys = getOrderedPartKeys(theme, emotion);
    const blinkClosed = shouldBlink() && !!parts.eyes_closed;
    const result: RenderPart[] = [];

    for (const key of keys) {
      if (key === "eyes_open" && blinkClosed) continue;
      if (key === "eyes_closed" && !blinkClosed) continue;
      if (key.startsWith("face_") && key !== `face_${emotion === "neutral" ? "neutral" : emotion}`) continue;
      const src = parts[key];
      if (!src) continue;
      result.push({
        key,
        src,
        zIndex: theme.partZIndex?.[key] ?? defaultZIndex(key),
      });
    }
    return result.sort((a, b) => a.zIndex - b.zIndex);
  }

  function shouldBlink(): boolean {
    const ms = playbackTimeMs % 4200;
    return ms > 3000 && ms < 3140;
  }

  // Derived values
  const themes = $derived(getAllThemes());

  // Preview character image
  const previewCharSrc = $derived.by(() => {
    if (!editingTheme) return null;
    return getCharacterImage(editingTheme, previewEmotion);
  });

  // Preview avatar emoji
  const previewAvatarEmoji = $derived.by(() => {
    if (!editingTheme) return "?";
    return getThemeAvatar(editingTheme, previewEmotion);
  });

  // Preview background: prefer static manifest background, then gradient preset
  const previewBgImage = $derived.by(() => {
    if (!editingTheme) return null;
    return getThemeBackground(editingTheme, previewEmotion === "neutral" ? "default" : previewEmotion);
  });

  const previewBgStyle = $derived.by(() => {
    if (!editingTheme) return "";
    if (previewBgImage) return "";
    const bg = editingTheme.background;
    const preset = BG_PRESETS.find(p => p.id === bg);
    if (preset) return `background: ${preset.gradient}`;
    if (bg && (bg.startsWith("http") || bg.startsWith("/"))) {
      return `background-image: url(${bg}); background-size: cover; background-position: center`;
    }
    return `background: ${BG_PRESETS[0].gradient}`;
  });

  const motionOptions = $derived.by(() => {
    if (!editingTheme) return ["idle"];
    const rig = ensureAnimationRig(editingTheme);
    const keys = Object.keys(rig.motions);
    return keys.length > 0 ? keys : ["idle"];
  });

  function createNewTheme() {
    editingTheme = {
      id: `custom_${Date.now()}`,
      name: $t("npc.default_name"),
      description: $t("npc.default_desc"),
      avatar: { default: "🤖" },
      background: "default",
      characterFolder: "",
      systemPrompt: $t("npc.default_prompt"),
      animationRig: createDefaultAnimationRig(),
      builtIn: false,
    };
    syncRigEditorFromTheme();
    resetPlayback();
    previewEmotion = "neutral";
    previewMotion = "idle";
  }

  function selectForEdit(theme: NpcTheme) {
    editingTheme = clone(theme);
    if (editingTheme) ensureAnimationRig(editingTheme, true);
    originalParts = theme.characterParts ? clone(theme.characterParts) : null;
    originalBgs = theme.backgrounds ? clone(theme.backgrounds) : null;
    syncRigEditorFromTheme();
    resetPlayback();
    previewEmotion = "neutral";
    previewMotion = "idle";
  }

  function handleSave() {
    if (!editingTheme) return;
    ensureAnimationRig(editingTheme, true);
    addCustomTheme(editingTheme);
    savedToast = true;
    setTimeout(() => { savedToast = false; }, 2000);
  }

  function handleDelete() {
    if (!editingTheme) return;
    if (editingTheme.builtIn) return;
    removeCustomTheme(editingTheme.id);
    editingTheme = null;
    syncRigEditorFromTheme();
  }

  // Character part keys
  const PART_KEYS = [
    { key: "body", label: "Body" },
    { key: "face_neutral", label: "Face Neutral" },
    { key: "face_happy", label: "Face Happy" },
    { key: "face_angry", label: "Face Angry" },
    { key: "face_thinking", label: "Face Thinking" },
    { key: "eyes_open", label: "Eyes Open" },
    { key: "eyes_closed", label: "Eyes Closed" },
    { key: "arm_left", label: "Arm Left" },
    { key: "arm_right", label: "Arm Right" },
  ] as const;

  function getPartSrc(key: string): string | null {
    if (!editingTheme?.characterParts) return null;
    return (editingTheme.characterParts as unknown as Record<string, string | undefined>)[key] ?? null;
  }

  function handlePartUpload(key: string, event: Event) {
    if (!editingTheme) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (!editingTheme) return;
      if (!editingTheme.characterParts) {
        editingTheme.characterParts = { body: "", face_neutral: "" };
      }
      (editingTheme.characterParts as unknown as Record<string, string>)[key] = reader.result as string;
      // Trigger reactivity
      editingTheme = { ...editingTheme };
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function handlePartDelete(key: string) {
    if (!editingTheme?.characterParts || !originalParts) return;
    const orig = (originalParts as unknown as Record<string, string | undefined>)[key];
    if (orig) {
      // Revert to original
      (editingTheme.characterParts as unknown as Record<string, string>)[key] = orig;
    } else {
      // No original — remove
      delete (editingTheme.characterParts as unknown as Record<string, string | undefined>)[key];
    }
    editingTheme = { ...editingTheme };
  }

  function handleRollbackAll() {
    if (!editingTheme || !originalParts) return;
    editingTheme.characterParts = JSON.parse(JSON.stringify(originalParts));
    editingTheme = { ...editingTheme };
  }

  function isPartModified(key: string): boolean {
    if (!editingTheme?.characterParts || !originalParts) return false;
    const current = (editingTheme.characterParts as unknown as Record<string, string | undefined>)[key];
    const orig = (originalParts as unknown as Record<string, string | undefined>)[key];
    return current !== orig;
  }

  // Part offset editing

  function getPartOffset(key: string): NpcPartOffset {
    return editingTheme?.partOffsets?.[key] ?? { x: 0, y: 0 };
  }

  function setPartOffset(key: string, axis: "x" | "y", value: number) {
    if (!editingTheme) return;
    if (!editingTheme.partOffsets) editingTheme.partOffsets = {};
    if (!editingTheme.partOffsets[key]) editingTheme.partOffsets[key] = { x: 0, y: 0 };
    editingTheme.partOffsets[key][axis] = value;
    editingTheme = { ...editingTheme };
  }

  function resetPartOffset(key: string) {
    if (!editingTheme?.partOffsets) return;
    delete editingTheme.partOffsets[key];
    editingTheme = { ...editingTheme };
  }

  function partTransform(key: string): string {
    const offset = getPartOffset(key);
    if (offset.x === 0 && offset.y === 0) return "";
    return `translate(${offset.x}px, ${offset.y}px)`;
  }

  function getPartOrigin(key: string): NpcPartOrigin {
    return editingTheme?.partOrigins?.[key] ?? { x: 50, y: 50 };
  }

  function setPartOrigin(key: string, axis: "x" | "y", value: number) {
    if (!editingTheme) return;
    if (!editingTheme.partOrigins) editingTheme.partOrigins = {};
    if (!editingTheme.partOrigins[key]) editingTheme.partOrigins[key] = { x: 50, y: 50 };
    editingTheme.partOrigins[key][axis] = value;
    editingTheme = { ...editingTheme };
  }

  function resetPartOrigin(key: string) {
    if (!editingTheme?.partOrigins) return;
    delete editingTheme.partOrigins[key];
    editingTheme = { ...editingTheme };
  }

  function partOriginStyle(key: string): string {
    const origin = getPartOrigin(key);
    return `${origin.x}% ${origin.y}%`;
  }

  function setAvatarExpression(expression: string, value: string) {
    if (!editingTheme) return;
    (editingTheme.avatar as any)[expression] = value || undefined;
  }

  function getAvatarExpression(expression: string): string {
    if (!editingTheme) return "";
    return (editingTheme.avatar as any)[expression] ?? "";
  }

  // Background management
  const BG_EMOTIONS = ["default", "happy", "sad", "angry", "thinking", "surprised", "excited"] as const;
  const BG_EMOTION_LABELS: Record<string, string> = {
    default: "Default",
    happy: "Happy",
    sad: "Sad",
    angry: "Angry",
    thinking: "Thinking",
    surprised: "Surprised",
    excited: "Excited",
  };

  function getBgSrc(bgKey: string): string | null {
    if (!editingTheme?.backgrounds) return null;
    return editingTheme.backgrounds[bgKey] ?? null;
  }

  function handleBgUpload(bgKey: string, event: Event) {
    if (!editingTheme) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (!editingTheme) return;
      if (!editingTheme.backgrounds) editingTheme.backgrounds = {};
      editingTheme.backgrounds[bgKey] = reader.result as string;
      // Also set backgroundImage if it's the default key
      if (bgKey === "default") {
        editingTheme.backgroundImage = reader.result as string;
      }
      editingTheme = { ...editingTheme };
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function handleBgDelete(bgKey: string) {
    if (!editingTheme?.backgrounds) return;
    // Revert to original if available
    const orig = originalBgs?.[bgKey];
    if (orig) {
      editingTheme.backgrounds[bgKey] = orig;
      if (bgKey === "default") editingTheme.backgroundImage = orig;
    } else {
      delete editingTheme.backgrounds[bgKey];
      if (bgKey === "default") editingTheme.backgroundImage = undefined;
    }
    editingTheme = { ...editingTheme };
  }

  function handleBgRollbackAll() {
    if (!editingTheme) return;
    if (originalBgs) {
      editingTheme.backgrounds = JSON.parse(JSON.stringify(originalBgs));
      editingTheme.backgroundImage = originalBgs["default"] ?? undefined;
    } else {
      editingTheme.backgrounds = undefined;
      editingTheme.backgroundImage = undefined;
    }
    editingTheme = { ...editingTheme };
  }

  function isBgModified(bgKey: string): boolean {
    if (!editingTheme?.backgrounds) return false;
    const current = editingTheme.backgrounds[bgKey];
    const orig = originalBgs?.[bgKey];
    return current !== orig;
  }

  function syncRigEditorFromTheme() {
    if (!editingTheme) {
      rigJsonText = "";
      rigJsonError = null;
      return;
    }
    const rig = ensureAnimationRig(editingTheme, true);
    rigJsonText = JSON.stringify(rig, null, 2);
    rigJsonError = null;
  }

  function resetPlayback() {
    playbackTimeMs = 0;
    lastFrameTs = 0;
    springStateMap.clear();
  }

  function getMotionDuration(theme: NpcTheme, motionName: string): number {
    const rig = ensureAnimationRig(theme);
    const motion = rig.motions[motionName] ?? rig.motions.idle;
    const duration = motion?.durationMs ?? rig.baseDurationMs ?? 3000;
    return Math.max(200, duration);
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function easeValue(mode: string | undefined, t: number): number {
    const x = clamp(t, 0, 1);
    switch (mode) {
      case "easeOutCubic":
        return 1 - (1 - x) ** 3;
      case "easeInOutQuad":
        return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
      case "easeInOutSine":
        return -(Math.cos(Math.PI * x) - 1) / 2;
      default:
        return x;
    }
  }

  function interpolate(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  function toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  function springStateKey(theme: NpcTheme, partKey: string): string {
    return `${theme.id}:${previewMotion}:${partKey}`;
  }

  function getSpringAxes(config: NpcSpringConfig): NpcSpringAxis[] {
    const raw = config.follow ?? ["x", "y", "rotate"];
    const filtered = raw.filter((axis): axis is NpcSpringAxis => axis === "x" || axis === "y" || axis === "rotate");
    return filtered.length > 0 ? filtered : ["x", "y", "rotate"];
  }

  function getPartSpringConfig(theme: NpcTheme, partKey: string): NpcSpringConfig | null {
    const rig = ensureAnimationRig(theme);
    const cfg = rig.springs?.[partKey];
    if (!cfg || cfg.enabled === false) return null;
    return {
      enabled: true,
      follow: getSpringAxes(cfg),
      stiffness: Number.isFinite(cfg.stiffness) ? cfg.stiffness : 170,
      damping: Number.isFinite(cfg.damping) ? cfg.damping : 24,
      mass: Number.isFinite(cfg.mass) ? Math.max(0.1, Number(cfg.mass)) : 1,
      maxOffsetX: Number.isFinite(cfg.maxOffsetX) ? Math.max(0, Number(cfg.maxOffsetX)) : 60,
      maxOffsetY: Number.isFinite(cfg.maxOffsetY) ? Math.max(0, Number(cfg.maxOffsetY)) : 60,
      maxRotate: Number.isFinite(cfg.maxRotate) ? Math.max(0, Number(cfg.maxRotate)) : 30,
    };
  }

  function applySpringPose(theme: NpcTheme, partKey: string, target: AnimPose, dtMs: number): AnimPose {
    const spring = getPartSpringConfig(theme, partKey);
    if (!spring) return target;

    const key = springStateKey(theme, partKey);
    let state = springStateMap.get(key);
    if (!state) {
      state = {
        x: target.x,
        y: target.y,
        rotate: target.rotate,
        vx: 0,
        vy: 0,
        vr: 0,
      };
      springStateMap.set(key, state);
      return target;
    }

    if (dtMs <= 0) {
      return {
        ...target,
        x: state.x,
        y: state.y,
        rotate: state.rotate,
      };
    }

    const dt = clamp(dtMs / 1000, 1 / 240, 1 / 24);
    const stiffness = spring.stiffness ?? 170;
    const damping = spring.damping ?? 24;
    const invMass = 1 / (spring.mass ?? 1);
    const follow = getSpringAxes(spring);

    const step = (pos: number, vel: number, targetValue: number) => {
      const force = stiffness * (targetValue - pos) - damping * vel;
      const acc = force * invMass;
      const nextVel = vel + acc * dt;
      const nextPos = pos + nextVel * dt;
      return { pos: nextPos, vel: nextVel };
    };

    if (follow.includes("x")) {
      const next = step(state.x, state.vx, target.x);
      state.x = clamp(next.pos, target.x - (spring.maxOffsetX ?? 60), target.x + (spring.maxOffsetX ?? 60));
      state.vx = next.vel;
    } else {
      state.x = target.x;
      state.vx = 0;
    }

    if (follow.includes("y")) {
      const next = step(state.y, state.vy, target.y);
      state.y = clamp(next.pos, target.y - (spring.maxOffsetY ?? 60), target.y + (spring.maxOffsetY ?? 60));
      state.vy = next.vel;
    } else {
      state.y = target.y;
      state.vy = 0;
    }

    if (follow.includes("rotate")) {
      const next = step(state.rotate, state.vr, target.rotate);
      state.rotate = clamp(next.pos, target.rotate - (spring.maxRotate ?? 30), target.rotate + (spring.maxRotate ?? 30));
      state.vr = next.vel;
    } else {
      state.rotate = target.rotate;
      state.vr = 0;
    }

    return {
      ...target,
      x: state.x,
      y: state.y,
      rotate: state.rotate,
    };
  }

  function getPartMeshDeformer(theme: NpcTheme, partKey: string): NpcMeshDeformer | null {
    const rig = ensureAnimationRig(theme);
    const deformer = rig.deformers?.[partKey];
    if (!deformer) return null;
    const cols = Math.floor(Number(deformer.cols));
    const rows = Math.floor(Number(deformer.rows));
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 2 || rows < 2) return null;
    return {
      cols: clamp(cols, 2, 8),
      rows: clamp(rows, 2, 8),
      points: deformer.points ?? {},
    };
  }

  function hasMeshWarp(deformer: NpcMeshDeformer | null): boolean {
    if (!deformer?.points) return false;
    return Object.values(deformer.points).some((pt) =>
      Number.isFinite(pt?.x) && Number.isFinite(pt?.y) && (Math.abs(pt.x) > 0.001 || Math.abs(pt.y) > 0.001));
  }

  function applyPoseToPoint(point: Point, pivotX: number, pivotY: number, pose: AnimPose): Point {
    const tx = point.x - pivotX;
    const ty = point.y - pivotY;
    const sx = tx * pose.scaleX;
    const sy = ty * pose.scaleY;
    const sin = Math.sin(toRadians(pose.rotate));
    const cos = Math.cos(toRadians(pose.rotate));
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;
    return {
      x: rx + pivotX + pose.x,
      y: ry + pivotY + pose.y,
    };
  }

  function triangleTransform(src0: Point, src1: Point, src2: Point, dst0: Point, dst1: Point, dst2: Point) {
    const det = src0.x * (src1.y - src2.y) + src1.x * (src2.y - src0.y) + src2.x * (src0.y - src1.y);
    if (Math.abs(det) < 1e-5) return null;

    const a = (dst0.x * (src1.y - src2.y) + dst1.x * (src2.y - src0.y) + dst2.x * (src0.y - src1.y)) / det;
    const c = (dst0.x * (src2.x - src1.x) + dst1.x * (src0.x - src2.x) + dst2.x * (src1.x - src0.x)) / det;
    const e = (
      dst0.x * (src1.x * src2.y - src2.x * src1.y) +
      dst1.x * (src2.x * src0.y - src0.x * src2.y) +
      dst2.x * (src0.x * src1.y - src1.x * src0.y)
    ) / det;

    const b = (dst0.y * (src1.y - src2.y) + dst1.y * (src2.y - src0.y) + dst2.y * (src0.y - src1.y)) / det;
    const d = (dst0.y * (src2.x - src1.x) + dst1.y * (src0.x - src2.x) + dst2.y * (src1.x - src0.x)) / det;
    const f = (
      dst0.y * (src1.x * src2.y - src2.x * src1.y) +
      dst1.y * (src2.x * src0.y - src0.x * src2.y) +
      dst2.y * (src0.x * src1.y - src1.x * src0.y)
    ) / det;

    return { a, b, c, d, e, f };
  }

  function drawImageTriangle(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    srcRect: { x: number; y: number; w: number; h: number },
    src0: Point,
    src1: Point,
    src2: Point,
    dst0: Point,
    dst1: Point,
    dst2: Point,
  ) {
    const matrix = triangleTransform(src0, src1, src2, dst0, dst1, dst2);
    if (!matrix) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dst0.x, dst0.y);
    ctx.lineTo(dst1.x, dst1.y);
    ctx.lineTo(dst2.x, dst2.y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    ctx.drawImage(img, srcRect.x, srcRect.y, srcRect.w, srcRect.h);
    ctx.restore();
  }

  function drawMeshWarpedPart(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    rect: { x: number; y: number; w: number; h: number },
    pivotX: number,
    pivotY: number,
    pose: AnimPose,
    deformer: NpcMeshDeformer,
  ): Point[] {
    const cols = clamp(Math.floor(deformer.cols), 2, 8);
    const rows = clamp(Math.floor(deformer.rows), 2, 8);
    const sourcePoints: Point[] = [];
    const destinationPoints: Point[] = [];

    const pointOffset = (cx: number, cy: number): Point => {
      const raw = deformer.points?.[`${cx},${cy}`];
      if (!raw) return { x: 0, y: 0 };
      const ox = Number.isFinite(raw.x) ? raw.x : 0;
      const oy = Number.isFinite(raw.y) ? raw.y : 0;
      return { x: (ox / 100) * rect.w, y: (oy / 100) * rect.h };
    };

    for (let cy = 0; cy < rows; cy += 1) {
      for (let cx = 0; cx < cols; cx += 1) {
        const nx = cx / (cols - 1);
        const ny = cy / (rows - 1);
        const sx = rect.x + nx * rect.w;
        const sy = rect.y + ny * rect.h;
        const offset = pointOffset(cx, cy);
        const warped = { x: sx + offset.x, y: sy + offset.y };
        sourcePoints.push({ x: sx, y: sy });
        destinationPoints.push(applyPoseToPoint(warped, pivotX, pivotY, pose));
      }
    }

    const idx = (cx: number, cy: number) => cy * cols + cx;
    for (let cy = 0; cy < rows - 1; cy += 1) {
      for (let cx = 0; cx < cols - 1; cx += 1) {
        const i00 = idx(cx, cy);
        const i10 = idx(cx + 1, cy);
        const i01 = idx(cx, cy + 1);
        const i11 = idx(cx + 1, cy + 1);

        drawImageTriangle(
          ctx,
          img,
          rect,
          sourcePoints[i00],
          sourcePoints[i10],
          sourcePoints[i11],
          destinationPoints[i00],
          destinationPoints[i10],
          destinationPoints[i11],
        );
        drawImageTriangle(
          ctx,
          img,
          rect,
          sourcePoints[i00],
          sourcePoints[i11],
          sourcePoints[i01],
          destinationPoints[i00],
          destinationPoints[i11],
          destinationPoints[i01],
        );
      }
    }

    return destinationPoints;
  }

  function evaluateTrackPose(track: NpcAnimationTrack | undefined, timeline: number): AnimPose {
    const defaults: AnimPose = { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 };
    if (!track || track.keyframes.length === 0) return defaults;
    const keyframes = [...track.keyframes].sort((a, b) => a.t - b.t);
    if (keyframes.length === 1) {
      const [frame] = keyframes;
      return {
        x: frame.x ?? 0,
        y: frame.y ?? 0,
        rotate: frame.rotate ?? 0,
        scaleX: frame.scaleX ?? 1,
        scaleY: frame.scaleY ?? 1,
        opacity: frame.opacity ?? 1,
      };
    }

    let left = keyframes[0];
    let right = keyframes[keyframes.length - 1];
    for (let i = 0; i < keyframes.length - 1; i += 1) {
      const a = keyframes[i];
      const b = keyframes[i + 1];
      if (timeline >= a.t && timeline <= b.t) {
        left = a;
        right = b;
        break;
      }
    }

    const span = Math.max(0.0001, right.t - left.t);
    const local = easeValue(track.easing, (timeline - left.t) / span);
    const x = interpolate(left.x ?? 0, right.x ?? left.x ?? 0, local);
    const y = interpolate(left.y ?? 0, right.y ?? left.y ?? 0, local);
    const rotate = interpolate(left.rotate ?? 0, right.rotate ?? left.rotate ?? 0, local);
    const scaleX = interpolate(left.scaleX ?? 1, right.scaleX ?? left.scaleX ?? 1, local);
    const scaleY = interpolate(left.scaleY ?? 1, right.scaleY ?? left.scaleY ?? 1, local);
    const opacity = interpolate(left.opacity ?? 1, right.opacity ?? left.opacity ?? 1, local);
    return { x, y, rotate, scaleX, scaleY, opacity };
  }

  function getPartPose(theme: NpcTheme, partKey: string, timeline: number, dtMs: number): AnimPose {
    const rig = ensureAnimationRig(theme);
    const motion = rig.motions[previewMotion] ?? rig.motions.idle;
    const track = motion?.tracks?.[partKey];
    const animated = evaluateTrackPose(track, timeline);
    const offset = getPartOffset(partKey);
    const posed = {
      ...animated,
      x: animated.x + offset.x,
      y: animated.y + offset.y,
    };
    return applySpringPose(theme, partKey, posed, dtMs);
  }

  function normalizeRigCandidate(input: unknown): NpcAnimationRig {
    if (!input || typeof input !== "object") {
      throw new Error("JSON root must be an object.");
    }
    const raw = input as Record<string, unknown>;
    const rawMotions = raw.motions;
    if (!rawMotions || typeof rawMotions !== "object") {
      throw new Error("`motions` object is required.");
    }

    const motions: NpcAnimationRig["motions"] = {};
    for (const [motionName, motionValue] of Object.entries(rawMotions as Record<string, unknown>)) {
      if (!motionValue || typeof motionValue !== "object") continue;
      const rawMotion = motionValue as Record<string, unknown>;
      const rawTracks = rawMotion.tracks;
      if (!rawTracks || typeof rawTracks !== "object") continue;
      const tracks: Record<string, NpcAnimationTrack> = {};

      for (const [partKey, trackValue] of Object.entries(rawTracks as Record<string, unknown>)) {
        if (!trackValue || typeof trackValue !== "object") continue;
        const rawTrack = trackValue as Record<string, unknown>;
        const rawFrames = Array.isArray(rawTrack.keyframes) ? rawTrack.keyframes : [];
        const keyframes = rawFrames
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const frame = entry as Record<string, unknown>;
            const t = Number(frame.t);
            if (!Number.isFinite(t)) return null;
            const v = {
              t: clamp(t, 0, 1),
              x: Number.isFinite(Number(frame.x)) ? Number(frame.x) : undefined,
              y: Number.isFinite(Number(frame.y)) ? Number(frame.y) : undefined,
              rotate: Number.isFinite(Number(frame.rotate)) ? Number(frame.rotate) : undefined,
              scaleX: Number.isFinite(Number(frame.scaleX)) ? Number(frame.scaleX) : undefined,
              scaleY: Number.isFinite(Number(frame.scaleY)) ? Number(frame.scaleY) : undefined,
              opacity: Number.isFinite(Number(frame.opacity)) ? Number(frame.opacity) : undefined,
            };
            return v;
          })
          .filter((frame): frame is NonNullable<typeof frame> => frame != null)
          .sort((a, b) => a.t - b.t);

        if (keyframes.length === 0) continue;
        tracks[partKey] = {
          enabled: rawTrack.enabled === false ? false : true,
          easing: typeof rawTrack.easing === "string" ? rawTrack.easing as NpcAnimationTrack["easing"] : "linear",
          keyframes,
        };
      }

      if (Object.keys(tracks).length > 0) {
        const duration = Number(rawMotion.durationMs);
        motions[motionName] = {
          durationMs: Number.isFinite(duration) ? Math.max(200, duration) : undefined,
          tracks,
        };
      }
    }

    const deformers: NonNullable<NpcAnimationRig["deformers"]> = {};
    const rawDeformers = raw.deformers;
    if (rawDeformers && typeof rawDeformers === "object") {
      for (const [partKey, rawDefValue] of Object.entries(rawDeformers as Record<string, unknown>)) {
        if (!rawDefValue || typeof rawDefValue !== "object") continue;
        const rawDef = rawDefValue as Record<string, unknown>;
        const cols = Math.floor(Number(rawDef.cols));
        const rows = Math.floor(Number(rawDef.rows));
        if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 2 || rows < 2) continue;

        const points: NonNullable<NpcMeshDeformer["points"]> = {};
        const rawPoints = rawDef.points;
        if (rawPoints && typeof rawPoints === "object") {
          for (const [pointKey, rawPoint] of Object.entries(rawPoints as Record<string, unknown>)) {
            if (!rawPoint || typeof rawPoint !== "object") continue;
            const pointObj = rawPoint as Record<string, unknown>;
            const x = Number(pointObj.x);
            const y = Number(pointObj.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            points[pointKey] = { x, y };
          }
        }

        deformers[partKey] = {
          cols: clamp(cols, 2, 8),
          rows: clamp(rows, 2, 8),
          points,
        };
      }
    }

    const springs: NonNullable<NpcAnimationRig["springs"]> = {};
    const rawSprings = raw.springs;
    if (rawSprings && typeof rawSprings === "object") {
      for (const [partKey, rawSpringValue] of Object.entries(rawSprings as Record<string, unknown>)) {
        if (!rawSpringValue || typeof rawSpringValue !== "object") continue;
        const rawSpring = rawSpringValue as Record<string, unknown>;
        const followRaw = Array.isArray(rawSpring.follow) ? rawSpring.follow : ["x", "y", "rotate"];
        const follow = followRaw
          .map((axis) => String(axis))
          .filter((axis): axis is NpcSpringAxis => axis === "x" || axis === "y" || axis === "rotate");

        springs[partKey] = {
          enabled: rawSpring.enabled === false ? false : true,
          follow: follow.length > 0 ? follow : ["x", "y", "rotate"],
          stiffness: Number.isFinite(Number(rawSpring.stiffness)) ? Number(rawSpring.stiffness) : 170,
          damping: Number.isFinite(Number(rawSpring.damping)) ? Number(rawSpring.damping) : 24,
          mass: Number.isFinite(Number(rawSpring.mass)) ? Math.max(0.1, Number(rawSpring.mass)) : 1,
          maxOffsetX: Number.isFinite(Number(rawSpring.maxOffsetX)) ? Math.max(0, Number(rawSpring.maxOffsetX)) : 60,
          maxOffsetY: Number.isFinite(Number(rawSpring.maxOffsetY)) ? Math.max(0, Number(rawSpring.maxOffsetY)) : 60,
          maxRotate: Number.isFinite(Number(rawSpring.maxRotate)) ? Math.max(0, Number(rawSpring.maxRotate)) : 30,
        };
      }
    }

    if (Object.keys(motions).length === 0) {
      throw new Error("At least one motion with keyframes is required.");
    }

    const version = Number(raw.version);
    const baseDuration = Number(raw.baseDurationMs);
    return {
      version: Number.isFinite(version) ? version : 1,
      baseDurationMs: Number.isFinite(baseDuration) ? Math.max(200, baseDuration) : 3000,
      motions,
      deformers: Object.keys(deformers).length > 0 ? deformers : undefined,
      springs: Object.keys(springs).length > 0 ? springs : undefined,
    };
  }

  function applyRigJson() {
    if (!editingTheme || editingTheme.builtIn) return;
    try {
      const parsed = JSON.parse(rigJsonText);
      const normalized = normalizeRigCandidate(parsed);
      editingTheme.animationRig = normalized;
      editingTheme = { ...editingTheme };
      rigJsonText = JSON.stringify(normalized, null, 2);
      rigJsonError = null;
      const options = Object.keys(normalized.motions);
      if (!options.includes(previewMotion)) previewMotion = options[0] ?? "idle";
      resetPlayback();
    } catch (err) {
      rigJsonError = err instanceof Error ? err.message : "Failed to parse animation JSON.";
    }
  }

  function autoTuneRig() {
    if (!editingTheme) return;
    editingTheme.animationRig = createAutoTunedRig(editingTheme);
    editingTheme = { ...editingTheme };
    syncRigEditorFromTheme();
    resetPlayback();
  }

  function formatRigJson() {
    try {
      const parsed = JSON.parse(rigJsonText);
      rigJsonText = JSON.stringify(parsed, null, 2);
      rigJsonError = null;
    } catch (err) {
      rigJsonError = err instanceof Error ? err.message : "Invalid JSON.";
    }
  }

  function resetRigJson() {
    if (!editingTheme || editingTheme.builtIn) return;
    editingTheme.animationRig = createDefaultAnimationRig();
    editingTheme = { ...editingTheme };
    previewMotion = "idle";
    syncRigEditorFromTheme();
    resetPlayback();
  }

  function togglePlayback() {
    animationPlaying = !animationPlaying;
    lastFrameTs = 0;
  }

  function imageDestinationRect(img: HTMLImageElement, canvasW: number, canvasH: number) {
    const scale = Math.min(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (canvasW - w) / 2;
    const y = canvasH - h;
    return { x, y, w, h };
  }

  function resizeCanvasToContainer() {
    if (!previewCanvasEl || !stageHostEl) return;
    const rect = stageHostEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (previewCanvasEl.width !== width || previewCanvasEl.height !== height) {
      previewCanvasEl.width = width;
      previewCanvasEl.height = height;
      previewCanvasEl.style.width = `${rect.width}px`;
      previewCanvasEl.style.height = `${rect.height}px`;
    }
  }

  function ensureImage(src: string): Promise<void> {
    if (imageCache.has(src) || partLoadErrors.has(src)) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        imageCache.set(src, img);
        resolve();
      };
      img.onerror = () => {
        partLoadErrors.add(src);
        resolve();
      };
      img.src = src;
    });
  }

  async function preloadCanvasImages(theme: NpcTheme) {
    if (!theme.characterParts) return;
    const parts = theme.characterParts as unknown as Record<string, string | undefined>;
    const allSources = Object.values(parts).filter((value): value is string => !!value).sort();
    const signature = allSources.join("|");
    if (signature === loadedImageSources) return;
    loadedImageSources = signature;
    await Promise.all(allSources.map((src) => ensureImage(src)));
  }

  function drawCanvasFrame(ts: number) {
    if (!useCanvasRenderer || !previewCanvasEl || !editingTheme?.characterParts) return;
    const ctx = previewCanvasEl.getContext("2d");
    if (!ctx) return;

    if (previewCanvasEl.width < 2 || previewCanvasEl.height < 2) {
      resizeCanvasToContainer();
      return;
    }

    if (lastFrameTs === 0) {
      lastFrameTs = ts;
    }
    const dt = ts - lastFrameTs;
    lastFrameTs = ts;
    if (animationPlaying) {
      playbackTimeMs += dt * clamp(previewSpeed, 0.2, 3);
    }
    const physicsDt = animationPlaying ? dt : 0;

    const duration = getMotionDuration(editingTheme, previewMotion);
    const timeline = ((playbackTimeMs % duration) + duration) % duration / duration;
    ctx.clearRect(0, 0, previewCanvasEl.width, previewCanvasEl.height);

    const parts = getVisibleRenderParts(editingTheme, previewEmotion);
    for (const part of parts) {
      const img = imageCache.get(part.src);
      if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) continue;

      const pose = getPartPose(editingTheme, part.key, timeline, physicsDt);
      const origin = getPartOrigin(part.key);
      const rect = imageDestinationRect(img, previewCanvasEl.width, previewCanvasEl.height);
      const pivotX = rect.x + (rect.w * origin.x) / 100;
      const pivotY = rect.y + (rect.h * origin.y) / 100;

      const deformer = getPartMeshDeformer(editingTheme, part.key);
      const meshEnabled = hasMeshWarp(deformer);
      if (meshEnabled && deformer) {
        ctx.save();
        ctx.globalAlpha = clamp(pose.opacity, 0, 1);
        const destPoints = drawMeshWarpedPart(ctx, img, rect, pivotX, pivotY, pose, deformer);
        ctx.restore();

        if (selectedPart === part.key && destPoints.length > 0) {
          const cols = deformer.cols;
          const rows = deformer.rows;
          const idx = (cx: number, cy: number) => cy * cols + cx;
          const border: Point[] = [];
          for (let cx = 0; cx < cols; cx += 1) border.push(destPoints[idx(cx, 0)]);
          for (let cy = 1; cy < rows; cy += 1) border.push(destPoints[idx(cols - 1, cy)]);
          for (let cx = cols - 2; cx >= 0; cx -= 1) border.push(destPoints[idx(cx, rows - 1)]);
          for (let cy = rows - 2; cy >= 1; cy -= 1) border.push(destPoints[idx(0, cy)]);

          ctx.save();
          ctx.strokeStyle = "rgba(129, 140, 248, 0.92)";
          ctx.lineWidth = Math.max(2, Math.round((window.devicePixelRatio || 1) * 1.1));
          ctx.beginPath();
          ctx.moveTo(border[0].x, border[0].y);
          for (let i = 1; i < border.length; i += 1) ctx.lineTo(border[i].x, border[i].y);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }
        continue;
      }

      const corners = [
        applyPoseToPoint({ x: rect.x, y: rect.y }, pivotX, pivotY, pose),
        applyPoseToPoint({ x: rect.x + rect.w, y: rect.y }, pivotX, pivotY, pose),
        applyPoseToPoint({ x: rect.x + rect.w, y: rect.y + rect.h }, pivotX, pivotY, pose),
        applyPoseToPoint({ x: rect.x, y: rect.y + rect.h }, pivotX, pivotY, pose),
      ];

      ctx.save();
      ctx.globalAlpha = clamp(pose.opacity, 0, 1);
      ctx.translate(pivotX + pose.x, pivotY + pose.y);
      ctx.rotate(toRadians(pose.rotate));
      ctx.scale(pose.scaleX, pose.scaleY);
      ctx.translate(-pivotX, -pivotY);
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();

      if (selectedPart === part.key) {
        ctx.save();
        ctx.strokeStyle = "rgba(129, 140, 248, 0.92)";
        ctx.lineWidth = Math.max(2, Math.round((window.devicePixelRatio || 1) * 1.1));
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function canvasLoop(ts: number) {
    drawCanvasFrame(ts);
    animationFrameHandle = requestAnimationFrame(canvasLoop);
  }

  $effect(() => {
    const options = motionOptions;
    if (!options.includes(previewMotion)) {
      previewMotion = options[0] ?? "idle";
    }
  });

  $effect(() => {
    const theme = editingTheme;
    if (!theme || !theme.characterParts || !useCanvasRenderer) return;
    void preloadCanvasImages(theme);
  });

  $effect(() => {
    previewMotion;
    resetPlayback();
  });

  onMount(() => {
    if (typeof window === "undefined") return;
    resizeCanvasToContainer();
    animationFrameHandle = requestAnimationFrame(canvasLoop);
    resizeObserver = new ResizeObserver(() => {
      resizeCanvasToContainer();
    });
    if (stageHostEl) resizeObserver.observe(stageHostEl);
    window.addEventListener("resize", resizeCanvasToContainer);
  });

  $effect(() => {
    if (!resizeObserver || !stageHostEl) return;
    const host = stageHostEl;
    resizeObserver.observe(host);
    resizeCanvasToContainer();
    return () => {
      resizeObserver?.unobserve(host);
    };
  });

  onDestroy(() => {
    if (animationFrameHandle != null) cancelAnimationFrame(animationFrameHandle);
    if (resizeObserver) resizeObserver.disconnect();
    if (typeof window !== "undefined") window.removeEventListener("resize", resizeCanvasToContainer);
  });
</script>

<svelte:head>
  <title>{$t("forge.title")} — {$t("npc.page_title")} | {$t("app.title")}</title>
</svelte:head>

<div class="forge-container">
  <!-- Sidebar: Theme List -->
  <aside class="forge-sidebar">
    <div class="sidebar-header">
      <h2>{$t("npc.sidebar_title")}</h2>
      <button class="new-btn" onclick={createNewTheme}>
        <Plus size={16} />
        {$t("npc.new")}
      </button>
    </div>

    <div class="theme-list">
      {#each themes as theme (theme.id)}
        <button
          class="theme-item"
          class:active={editingTheme?.id === theme.id}
          onclick={() => selectForEdit(theme)}
        >
          <div class="theme-avatar-mini">
            {#if theme.characterFolder}
              <img src="{getCharacterImage(theme, 'neutral')}" alt="" class="avatar-thumb" />
            {:else}
              <span class="avatar-emoji">{getThemeAvatar(theme, "neutral")}</span>
            {/if}
          </div>
          <div class="theme-meta">
            <span class="theme-name">{theme.name}</span>
            <span class="theme-desc">{theme.description}</span>
          </div>
          {#if theme.builtIn}
            <span class="built-in-badge">{$t("npc.built_in")}</span>
          {/if}
        </button>
      {/each}
    </div>
  </aside>

  <!-- Main Editor Area -->
  <main class="editor-area">
    {#if editingTheme}
      <div class="editor-header">
        <div class="header-left">
          <input
            type="text"
            bind:value={editingTheme.name}
            class="title-input"
            placeholder={$t("npc.placeholder_name")}
            disabled={editingTheme.builtIn}
          />
          <input
            type="text"
            bind:value={editingTheme.description}
            class="desc-input"
            placeholder={$t("npc.placeholder_desc")}
            disabled={editingTheme.builtIn}
          />
        </div>
        <div class="header-actions">
          {#if !editingTheme.builtIn}
            <button class="action-btn delete" onclick={handleDelete}>
              <Trash2 size={18} />
            </button>
          {/if}
          {#if !editingTheme.builtIn}
            <button class="action-btn save" onclick={handleSave}>
              <Save size={18} />
              {$t("npc.save")}
            </button>
          {/if}
        </div>
      </div>

      <div class="editor-content">
        <!-- Settings Panel -->
        <div class="settings-panel">

          <!-- Visuals Section -->
          <section class="config-section">
            <h3><Monitor size={16} /> {$t("npc.visuals")}</h3>

            <!-- Background selection -->
            <div class="input-group">
              <!-- svelte-ignore a11y_label_has_associated_control -->
              <label>{$t("npc.background")}</label>
              <div class="preset-grid">
                {#each BG_PRESETS as preset}
                  <button
                    class="preset-swatch"
                    class:active={editingTheme.background === preset.id}
                    style="background: {preset.gradient}"
                    onclick={() => { if (editingTheme) editingTheme.background = preset.id; }}
                    disabled={editingTheme.builtIn}
                    title={$t("npc.bg." + preset.id)}
                  >
                    {#if editingTheme.background === preset.id}
                      <span class="check">✓</span>
                    {/if}
                  </button>
                {/each}
              </div>
              <div class="url-input">
                <ImageIcon size={16} />
                <input
                  type="text"
                  bind:value={editingTheme.background}
                  placeholder={$t("npc.placeholder_image_url")}
                  disabled={editingTheme.builtIn}
                />
              </div>
            </div>

            <!-- Character Folder -->
            <div class="input-group">
              <!-- svelte-ignore a11y_label_has_associated_control -->
              <label>{$t("npc.character_folder")}</label>
              <div class="url-input">
                <Smile size={16} />
                <input
                  type="text"
                  bind:value={editingTheme.characterFolder}
                  placeholder="/avatars/my_character"
                  disabled={editingTheme.builtIn}
                />
              </div>
              <p class="hint">{$t("npc.character_folder_hint")}</p>
            </div>
          </section>

          <!-- Backgrounds Section -->
          {#if editingTheme.backgrounds || editingTheme.backgroundImage}
            <section class="config-section">
              <div class="section-header-row">
                <h3><ImageIcon size={16} /> {$t("npc.backgrounds")}</h3>
                {#if originalBgs}
                  <button class="rollback-btn" onclick={handleBgRollbackAll} title={$t("npc.rollback_all_bg")}>
                    <RotateCcw size={14} />
                    {$t("npc.rollback")}
                  </button>
                {/if}
              </div>
              <p class="hint" style="margin-bottom: 12px">{$t("npc.bg_hint")}</p>
              <div class="bg-grid">
                {#each BG_EMOTIONS as bgKey}
                  {@const src = getBgSrc(bgKey)}
                  {@const modified = isBgModified(bgKey)}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="bg-card" class:modified class:active={
                    (previewEmotion === "neutral" && bgKey === "default") ||
                    (previewEmotion !== "neutral" && bgKey === previewEmotion)
                  }>
                    <button class="bg-thumb" onclick={() => {
                      previewEmotion = bgKey === "default" ? "neutral" : bgKey;
                    }}>
                      {#if src}
                        <img src={src} alt={$t("npc.bg_emotion." + bgKey)} />
                      {:else}
                        <span class="bg-empty">--</span>
                      {/if}
                    </button>
                    <span class="bg-label">{$t("npc.bg_emotion." + bgKey)}</span>
                    <div class="part-actions">
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                      <label class="part-upload-btn" title="Upload {BG_EMOTION_LABELS[bgKey]} background" onclick={(e) => e.stopPropagation()}>
                        <Upload size={12} />
                        <input
                          type="file"
                          accept=".svg,.png,.jpg,.jpeg,.webp,image/*"
                          onchange={(e) => handleBgUpload(bgKey, e)}
                          hidden
                        />
                      </label>
                      {#if modified}
                        <button class="part-delete-btn" onclick={() => handleBgDelete(bgKey)} title="Revert {BG_EMOTION_LABELS[bgKey]}">
                          <X size={12} />
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </section>
          {/if}

          <!-- Character Parts Section -->
          {#if editingTheme.characterParts}
            <section class="config-section">
              <div class="section-header-row">
                <h3><ImageIcon size={16} /> {$t("npc.character_parts")}</h3>
                {#if originalParts}
                  <button class="rollback-btn" onclick={handleRollbackAll} title={$t("npc.rollback_all_parts")}>
                    <RotateCcw size={14} />
                    {$t("npc.rollback")}
                  </button>
                {/if}
              </div>
              <div class="parts-grid">
                {#each PART_KEYS as { key, label }}
                  {@const src = getPartSrc(key)}
                  {@const modified = isPartModified(key)}
                  {@const selected = selectedPart === key}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="part-card" class:modified class:selected onclick={() => {
                    selectedPart = selected ? null : key;
                    // Auto-switch preview emotion when selecting a face part
                    if (!selected && key.startsWith("face_")) {
                      const emotion = key.replace("face_", "");
                      previewEmotion = emotion;
                    }
                  }}>
                    <div class="part-thumb">
                      {#if src}
                        <img src={src} alt={$t("npc.part." + key)} />
                      {:else}
                        <span class="part-empty">--</span>
                      {/if}
                    </div>
                    <span class="part-label">{$t("npc.part." + key)}</span>
                    <div class="part-actions">
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                      <label class="part-upload-btn" title="Upload {label}" onclick={(e) => e.stopPropagation()}>
                        <Upload size={12} />
                        <input
                          type="file"
                          accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp"
                          onchange={(e) => handlePartUpload(key, e)}
                          hidden
                        />
                      </label>
                      {#if modified}
                        <button class="part-delete-btn" onclick={(e) => { e.stopPropagation(); handlePartDelete(key); }} title="Revert {label}">
                          <X size={12} />
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>

              <!-- Controls for selected part -->
              {#if selectedPart}
                {@const offset = getPartOffset(selectedPart)}
                {@const origin = getPartOrigin(selectedPart)}
                <div class="offset-controls">
                  <div class="offset-header">
                    <span class="offset-title">{$t("npc.part." + selectedPart)} — {$t("npc.position")}</span>
                    <button class="offset-reset" onclick={() => resetPartOffset(selectedPart!)}>{$t("npc.reset")}</button>
                  </div>
                  <div class="offset-row">
                    <!-- svelte-ignore a11y_label_has_associated_control -->
                    <label>X</label>
                    <input type="range" min="-50" max="50" step="1" value={offset.x}
                      oninput={(e) => setPartOffset(selectedPart!, "x", Number((e.target as HTMLInputElement).value))} />
                    <span class="offset-value">{offset.x}px</span>
                  </div>
                  <div class="offset-row">
                    <!-- svelte-ignore a11y_label_has_associated_control -->
                    <label>Y</label>
                    <input type="range" min="-50" max="50" step="1" value={offset.y}
                      oninput={(e) => setPartOffset(selectedPart!, "y", Number((e.target as HTMLInputElement).value))} />
                    <span class="offset-value">{offset.y}px</span>
                  </div>
                </div>

                <div class="offset-controls">
                  <div class="offset-header">
                    <span class="offset-title">{$t("npc.part." + selectedPart)} — {$t("npc.pivot")}</span>
                    <button class="offset-reset" onclick={() => resetPartOrigin(selectedPart!)}>{$t("npc.reset")}</button>
                  </div>
                  <div class="offset-row">
                    <!-- svelte-ignore a11y_label_has_associated_control -->
                    <label>X</label>
                    <input type="range" min="0" max="100" step="1" value={origin.x}
                      oninput={(e) => setPartOrigin(selectedPart!, "x", Number((e.target as HTMLInputElement).value))} />
                    <span class="offset-value">{origin.x}%</span>
                  </div>
                  <div class="offset-row">
                    <!-- svelte-ignore a11y_label_has_associated_control -->
                    <label>Y</label>
                    <input type="range" min="0" max="100" step="1" value={origin.y}
                      oninput={(e) => setPartOrigin(selectedPart!, "y", Number((e.target as HTMLInputElement).value))} />
                    <span class="offset-value">{origin.y}%</span>
                  </div>
                </div>
              {/if}
            </section>
          {/if}

          <!-- Animation Rig Section -->
          <section class="config-section">
            <div class="section-header-row">
              <h3><Sparkles size={16} /> {$t("npc.motion_rig")}</h3>
              <div class="rig-actions">
                <button class="offset-reset" onclick={autoTuneRig} title={$t(editingTheme.builtIn ? "npc.auto_tune_builtin" : "npc.auto_tune_custom")}>
                  <Sparkles size={12} />
                  {$t("npc.auto_tune")}
                </button>
                <button class="offset-reset" onclick={formatRigJson} title={$t("npc.prettify_json")}>
                  <Code2 size={12} />
                  {$t("npc.format")}
                </button>
                {#if !editingTheme.builtIn}
                  <button class="offset-reset" onclick={applyRigJson} title={$t("npc.apply_preview")}>
                    <WandSparkles size={12} />
                    {$t("npc.apply")}
                  </button>
                  <button class="offset-reset" onclick={resetRigJson} title={$t("npc.reset_rig")}>
                    <RotateCcw size={12} />
                    {$t("npc.reset")}
                  </button>
                {/if}
              </div>
            </div>

            <div class="motion-toolbar">
              <div class="motion-item">
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label>{$t("npc.motion")}</label>
                <select bind:value={previewMotion}>
                  {#each motionOptions as motionName}
                    <option value={motionName}>{motionName}</option>
                  {/each}
                </select>
              </div>
              <div class="motion-item">
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label>{$t("npc.speed")}</label>
                <input type="range" min="0.2" max="2.5" step="0.1" bind:value={previewSpeed} />
                <span class="offset-value">{previewSpeed.toFixed(1)}x</span>
              </div>
              <button class="play-toggle" onclick={togglePlayback} title={animationPlaying ? $t("npc.pause") : $t("npc.play")}>
                {#if animationPlaying}
                  <Pause size={14} />
                {:else}
                  <Play size={14} />
                {/if}
              </button>
            </div>

            <textarea
              class="rig-editor"
              bind:value={rigJsonText}
              rows="14"
              placeholder={"{\"version\":1,\"motions\":{\"idle\":{\"tracks\":{}}},\"deformers\":{},\"springs\":{}}"}
              disabled={editingTheme.builtIn}
            ></textarea>
            {#if rigJsonError}
              <p class="rig-error">{rigJsonError}</p>
            {/if}
            <p class="hint">{$t("npc.rig_hint")}</p>
          </section>

          <!-- Expression Avatars Section -->
          <section class="config-section">
            <h3><Smile size={16} /> {$t("npc.expression_avatars")}</h3>
            <p class="hint" style="margin-bottom: 12px">{$t("npc.avatar_hint")}</p>
            <div class="expression-grid">
              {#each EXPRESSIONS as expr}
                <div class="expression-item">
                  <!-- svelte-ignore a11y_label_has_associated_control -->
                  <label>{$t("npc.expr." + expr)}</label>
                  <input
                    type="text"
                    value={getAvatarExpression(expr === "neutral" ? "default" : expr)}
                    oninput={(e) => setAvatarExpression(expr === "neutral" ? "default" : expr, (e.target as HTMLInputElement).value)}
                    placeholder={expr === "neutral" ? $t("npc.required") : $t("npc.optional")}
                    disabled={editingTheme.builtIn}
                  />
                </div>
              {/each}
            </div>
          </section>

          <!-- Personality Section -->
          <section class="config-section">
            <h3><MessageSquare size={16} /> {$t("npc.personality")}</h3>

            <div class="input-group">
              <!-- svelte-ignore a11y_label_has_associated_control -->
              <label>{$t("npc.system_prompt")}</label>
              <textarea
                bind:value={editingTheme.systemPrompt}
                rows="6"
                placeholder={$t("npc.placeholder_prompt")}
                disabled={editingTheme.builtIn}
              ></textarea>
              <p class="hint">{$t("npc.prompt_hint")}</p>
            </div>
          </section>
        </div>

        <!-- Preview Panel -->
        <div class="preview-panel">
          <div class="preview-header">
            <div class="preview-header-main">
              <span class="preview-label"><Eye size={14} /> {$t("npc.preview")}</span>
              <div class="renderer-switch">
                <button class="renderer-tab" class:active={useCanvasRenderer} onclick={() => { useCanvasRenderer = true; }}>
                  {$t("npc.canvas")}
                </button>
                <button class="renderer-tab" class:active={!useCanvasRenderer} onclick={() => { useCanvasRenderer = false; }}>
                  {$t("npc.dom")}
                </button>
              </div>
            </div>
            <div class="emotion-tabs">
              {#each EXPRESSIONS as expr}
                <button
                  class="emotion-tab"
                  class:active={previewEmotion === expr}
                  onclick={() => { previewEmotion = expr; }}
                  title={$t("npc.expr." + expr)}
                >
                  {$t("npc.expr." + expr).split(" ")[0]}
                </button>
              {/each}
            </div>
          </div>

          <div class="stage-wrapper" bind:this={stageHostEl}>
            <div class="preview-stage" style={previewBgStyle}>
              {#if previewBgImage}
                <img src={previewBgImage} alt="" class="preview-bg-img" />
              {/if}
              <div class="preview-overlay"></div>

              <!-- Character -->
              <div class="preview-character" class:canvas-render={useCanvasRenderer && !!editingTheme.characterParts}>
                {#if editingTheme.characterParts && useCanvasRenderer}
                  <canvas bind:this={previewCanvasEl} class="preview-canvas"></canvas>
                {:else if editingTheme.characterParts}
                  <div class="preview-parts">
                    <img src={editingTheme.characterParts.body} alt="" class="preview-part"
                      class:part-highlight={selectedPart === "body"}
                      style:transform={partTransform("body")}
                      style:transform-origin={partOriginStyle("body")} />
                    <img src={editingTheme.characterParts.eyes_open} alt="" class="preview-part"
                      class:part-highlight={selectedPart === "eyes_open"}
                      style:transform={partTransform("eyes_open")}
                      style:transform-origin={partOriginStyle("eyes_open")} />
                    {#if getCharacterFaceLayer(editingTheme, previewEmotion)}
                      {@const faceKey = `face_${previewEmotion === "neutral" ? "neutral" : previewEmotion}`}
                      <img src={getCharacterFaceLayer(editingTheme, previewEmotion)} alt="" class="preview-part"
                        class:part-highlight={selectedPart?.startsWith("face_")}
                        style:transform={partTransform(faceKey)}
                        style:transform-origin={partOriginStyle(faceKey)} />
                    {/if}
                    {#if editingTheme.characterParts.arm_left}
                      <img src={editingTheme.characterParts.arm_left} alt="" class="preview-part"
                        class:part-highlight={selectedPart === "arm_left"}
                        style:transform={partTransform("arm_left")}
                        style:transform-origin={partOriginStyle("arm_left")} />
                    {/if}
                    {#if editingTheme.characterParts.arm_right}
                      <img src={editingTheme.characterParts.arm_right} alt="" class="preview-part"
                        class:part-highlight={selectedPart === "arm_right"}
                        style:transform={partTransform("arm_right")}
                        style:transform-origin={partOriginStyle("arm_right")} />
                    {/if}
                  </div>
                {:else if previewCharSrc}
                  <img src={previewCharSrc} alt="Character" class="char-art" />
                {:else if editingTheme.avatar.default && editingTheme.avatar.default.startsWith("http")}
                  <img src={editingTheme.avatar.default} alt="Avatar" class="char-art" />
                {:else}
                  <div class="placeholder-char">
                    <span>{previewAvatarEmoji}</span>
                  </div>
                {/if}
              </div>

              <!-- Dialogue box -->
              <div class="preview-dialogue">
                <span class="preview-name">{editingTheme.name}</span>
                <p class="preview-text">{$t("npc.preview_dialogue")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {#if savedToast}
        <div class="save-toast">✓ {$t("npc.saved")}</div>
      {/if}

    {:else}
      <div class="empty-state">
        <div class="empty-icon">🔨</div>
        <h2>{$t("npc.empty_title")}</h2>
        <p>{$t("npc.empty_desc")}</p>
        <button class="primary-btn" onclick={createNewTheme}>{$t("npc.create_new")}</button>
      </div>
    {/if}
  </main>
</div>

<style>
  .forge-container {
    display: flex;
    height: 100vh;
    background: var(--color-bg, #0d0a1a);
    color: var(--color-text, #e0e0ff);
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;

    --color-bg: #0d0a1a;
    --color-surface: rgba(15, 12, 30, 0.95);
    --color-surface-elevated: rgba(25, 22, 45, 0.9);
    --color-surface-hover: rgba(129, 140, 248, 0.08);
    --color-text: #e0e0f5;
    --color-text-muted: #7a7a95;
    --color-border: rgba(147, 130, 255, 0.12);
    --color-primary: #818cf8;
    --color-primary-hover: #6366f1;
    --color-error: #ef4444;
  }

  /* ========== Sidebar ========== */
  .forge-sidebar {
    width: 280px;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-header {
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .new-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    font-size: 12px;
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.2s;
  }

  .new-btn:hover {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .theme-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .theme-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    background: transparent;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    color: var(--color-text);
    transition: all 0.2s;
  }

  .theme-item:hover {
    background: var(--color-surface-hover);
  }

  .theme-item.active {
    background: var(--color-surface-elevated);
    box-shadow: inset 0 0 0 1px var(--color-primary);
  }

  .theme-avatar-mini {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(100, 80, 200, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .avatar-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-emoji {
    font-size: 22px;
    line-height: 1;
  }

  .theme-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .theme-name {
    font-size: 13px;
    font-weight: 500;
  }

  .theme-desc {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .built-in-badge {
    font-size: 9px;
    text-transform: uppercase;
    color: var(--color-text-muted);
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  /* ========== Editor Area ========== */
  .editor-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  .editor-header {
    padding: 16px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .title-input {
    font-size: 22px;
    font-weight: 700;
    background: transparent;
    border: none;
    outline: none;
    color: var(--color-text);
    width: 100%;
  }

  .title-input:disabled {
    opacity: 0.7;
  }

  .desc-input {
    font-size: 13px;
    color: var(--color-text-muted);
    background: transparent;
    border: none;
    outline: none;
    width: 100%;
  }

  .desc-input:disabled {
    opacity: 0.7;
  }

  .header-actions {
    display: flex;
    gap: 10px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .action-btn.save {
    background: var(--color-primary);
    color: white;
  }

  .action-btn.save:hover {
    background: var(--color-primary-hover);
  }

  .action-btn.delete {
    background: transparent;
    color: var(--color-error);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .action-btn.delete:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .editor-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* ========== Settings Panel ========== */
  .settings-panel {
    width: 380px;
    padding: 24px;
    overflow-y: auto;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 28px;
    flex-shrink: 0;
  }

  .config-section h3 {
    margin: 0 0 14px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }

  .input-group label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text);
  }

  .url-input {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 0 10px;
    color: var(--color-text-muted);
  }

  .url-input input {
    flex: 1;
    padding: 9px 4px;
    background: transparent;
    border: none;
    outline: none;
    font-size: 13px;
    color: var(--color-text);
  }

  .url-input input:disabled {
    opacity: 0.5;
  }

  .hint {
    font-size: 11px;
    color: var(--color-text-muted);
    margin: 0;
  }

  textarea {
    width: 100%;
    padding: 10px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    resize: vertical;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    color: var(--color-text);
  }

  textarea:disabled {
    opacity: 0.5;
  }

  /* Preset background swatches */
  .preset-grid {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .preset-swatch {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 12px;
  }

  .preset-swatch:hover {
    border-color: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }

  .preset-swatch.active {
    border-color: var(--color-primary);
    box-shadow: 0 0 10px rgba(129, 140, 248, 0.3);
  }

  .preset-swatch:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .preset-swatch .check {
    font-weight: bold;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }

  /* Character parts editor */
  .section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }

  .section-header-row h3 {
    margin: 0;
  }

  .rig-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .rollback-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 11px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .rollback-btn:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .parts-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .part-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    transition: all 0.2s;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }

  .part-card:hover {
    background: var(--color-surface-hover);
  }

  .part-card.selected {
    border-color: var(--color-primary);
    box-shadow: 0 0 12px rgba(129, 140, 248, 0.25);
    background: rgba(129, 140, 248, 0.08);
  }

  .part-card.modified {
    border-color: rgba(129, 140, 248, 0.5);
    box-shadow: 0 0 8px rgba(129, 140, 248, 0.15);
  }

  .part-thumb {
    width: 52px;
    height: 52px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .part-thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .part-empty {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .part-label {
    font-size: 9px;
    color: var(--color-text-muted);
    text-align: center;
    line-height: 1.2;
  }

  .part-actions {
    display: flex;
    gap: 4px;
  }

  .part-upload-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: rgba(129, 140, 248, 0.15);
    color: var(--color-primary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .part-upload-btn:hover {
    background: rgba(129, 140, 248, 0.3);
  }

  .part-delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .part-delete-btn:hover {
    background: rgba(239, 68, 68, 0.25);
  }

  /* Background grid */
  .bg-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .bg-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 4px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    transition: all 0.2s;
  }

  .bg-card.active {
    border-color: var(--color-primary);
    box-shadow: 0 0 12px rgba(129, 140, 248, 0.25);
    background: rgba(129, 140, 248, 0.08);
  }

  .bg-card.modified {
    border-color: rgba(129, 140, 248, 0.5);
    box-shadow: 0 0 8px rgba(129, 140, 248, 0.15);
  }

  .bg-thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: all 0.2s;
  }

  .bg-thumb:hover {
    opacity: 0.8;
  }

  .bg-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .bg-empty {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .bg-label {
    font-size: 9px;
    color: var(--color-text-muted);
    text-align: center;
    line-height: 1.2;
  }

  /* Offset controls */
  .offset-controls {
    margin-top: 10px;
    padding: 12px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .offset-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .offset-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text);
  }

  .offset-reset {
    font-size: 10px;
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .offset-reset:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text);
  }

  .motion-toolbar {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 8px;
    margin-bottom: 10px;
    align-items: center;
  }

  .motion-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .motion-item label {
    font-size: 11px;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .motion-item select {
    background: var(--color-surface-elevated);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 8px;
    font-size: 12px;
    outline: none;
  }

  .motion-item select:focus {
    border-color: var(--color-primary);
  }

  .play-toggle {
    width: 32px;
    height: 32px;
    border-radius: 7px;
    border: 1px solid var(--color-border);
    color: var(--color-text);
    background: var(--color-surface-elevated);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 16px;
  }

  .play-toggle:hover {
    border-color: var(--color-primary);
    background: rgba(129, 140, 248, 0.18);
  }

  .rig-editor {
    min-height: 220px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    line-height: 1.35;
    tab-size: 2;
  }

  .rig-error {
    margin: 8px 0 0;
    font-size: 11px;
    color: #f87171;
  }

  .offset-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .offset-row label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    width: 14px;
    flex-shrink: 0;
  }

  .offset-row input[type="range"] {
    flex: 1;
    height: 4px;
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  .offset-value {
    font-size: 10px;
    color: var(--color-text-muted);
    width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* Preview part highlight */
  .preview-part.part-highlight {
    filter: drop-shadow(0 0 4px rgba(129, 140, 248, 0.8));
  }

  /* Expression avatar grid */
  .expression-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .expression-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .expression-item label {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .expression-item input {
    padding: 7px 10px;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 12px;
    color: var(--color-text);
    outline: none;
    width: 100%;
  }

  .expression-item input:disabled {
    opacity: 0.5;
  }

  .expression-item input:focus {
    border-color: var(--color-primary);
  }

  /* ========== Preview Panel ========== */
  .preview-panel {
    flex: 1;
    padding: 20px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    flex-shrink: 0;
    gap: 10px;
  }

  .preview-header-main {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .preview-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .emotion-tabs {
    display: flex;
    gap: 2px;
  }

  .renderer-switch {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--color-border);
    border-radius: 7px;
    padding: 2px;
  }

  .renderer-tab {
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .renderer-tab.active {
    background: rgba(129, 140, 248, 0.2);
    color: var(--color-text);
  }

  .emotion-tab {
    padding: 4px 8px;
    font-size: 16px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    line-height: 1;
  }

  .emotion-tab:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .emotion-tab.active {
    background: rgba(129, 140, 248, 0.15);
    box-shadow: inset 0 0 0 1px rgba(129, 140, 248, 0.3);
  }

  .stage-wrapper {
    flex: 1;
    border-radius: 16px;
    overflow: hidden;
    position: relative;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    min-height: 300px;
  }

  .preview-stage {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
  }

  .preview-bg-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 0;
  }

  .preview-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 60%);
    z-index: 1;
  }

  .preview-parts {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .preview-part {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center bottom;
  }

  .preview-canvas {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    display: block;
    image-rendering: auto;
  }

  .preview-character {
    position: absolute;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    width: 60%;
    height: 55%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    animation: char-breathe 4s ease-in-out infinite;
  }

  .preview-character.canvas-render {
    width: 72%;
    height: 68%;
    bottom: 72px;
    animation: none;
  }

  @keyframes char-breathe {
    0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
    50% { transform: translateX(-50%) translateY(-4px) scale(1.005); }
  }

  .char-art {
    max-height: 100%;
    max-width: 100%;
    object-fit: contain;
    filter: drop-shadow(0 4px 20px rgba(0, 0, 0, 0.5));
  }

  .placeholder-char {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(100, 80, 200, 0.3), rgba(60, 40, 140, 0.5));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 52px;
    border: 2px solid rgba(147, 130, 255, 0.3);
  }

  .preview-dialogue {
    position: relative;
    z-index: 3;
    width: 85%;
    margin-bottom: 24px;
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 16px 20px;
    color: white;
  }

  .preview-name {
    display: block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
    color: #a78bfa;
  }

  .preview-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    opacity: 0.9;
  }

  /* ========== Empty State ========== */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
    color: var(--color-text-muted);
  }

  .empty-icon {
    font-size: 48px;
  }

  .empty-state h2 {
    margin: 0;
    font-size: 20px;
    color: var(--color-text);
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
  }

  .primary-btn {
    padding: 10px 24px;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .primary-btn:hover {
    background: var(--color-primary-hover);
  }

  /* ========== Toast ========== */
  .save-toast {
    position: absolute;
    bottom: 24px;
    right: 24px;
    background: rgba(34, 197, 94, 0.9);
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    animation: toastIn 0.3s ease;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 100;
  }

  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
