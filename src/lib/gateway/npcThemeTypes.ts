/**
 * NPC Theme Types
 */

/** Avatar configuration — supports per-expression overrides */
export interface NpcThemeAvatar {
  default: string;    // URL or emoji
  happy?: string;
  sad?: string;
  angry?: string;
  surprised?: string;
  thinking?: string;
  excited?: string;
  calm?: string;
  neutral?: string;
}

/** Layered character parts for VN-style display */
export interface NpcCharacterParts {
  body: string;              // base body image (always visible)
  face_neutral: string;      // face layer — neutral expression
  face_happy?: string;
  face_sad?: string;
  face_angry?: string;
  face_surprised?: string;
  face_thinking?: string;
  face_excited?: string;
  face_calm?: string;
  arm_left?: string;         // left arm layer
  arm_right?: string;        // right arm layer
  eyes_open?: string;        // open eyes overlay (for blink)
  eyes_closed?: string;      // closed eyes overlay (for blink)
}

/** Per-part position offset */
export interface NpcPartOffset {
  x: number;  // horizontal offset in px
  y: number;  // vertical offset in px
}

/** Per-part rotation origin (transform-origin) */
export interface NpcPartOrigin {
  x: number;  // horizontal origin in % (0-100)
  y: number;  // vertical origin in % (0-100)
}

export type NpcAnimEasing = "linear" | "easeInOutSine" | "easeOutCubic" | "easeInOutQuad";

/** One keyframe sampled on a normalized timeline (0..1) */
export interface NpcAnimationKeyframe {
  t: number;
  x?: number;
  y?: number;
  rotate?: number; // degrees
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
}

/** Per-part animation track */
export interface NpcAnimationTrack {
  enabled?: boolean;
  easing?: NpcAnimEasing;
  keyframes: NpcAnimationKeyframe[];
}

/** A named motion clip (idle/talk/wave/etc.) */
export interface NpcMotionDefinition {
  durationMs?: number;
  tracks: Record<string, NpcAnimationTrack>;
}

export interface NpcMeshPointOffset {
  x: number; // percentage of part width
  y: number; // percentage of part height
}

/** Mesh-based per-part warp deformation */
export interface NpcMeshDeformer {
  cols: number; // control points in x-axis (>= 2)
  rows: number; // control points in y-axis (>= 2)
  points?: Record<string, NpcMeshPointOffset>; // key: "col,row"
}

export type NpcSpringAxis = "x" | "y" | "rotate";

/** Damped spring config applied after keyframe sampling */
export interface NpcSpringConfig {
  enabled?: boolean;
  follow?: NpcSpringAxis[]; // defaults to ["x", "y", "rotate"]
  stiffness?: number; // defaults to 170
  damping?: number; // defaults to 24
  mass?: number; // defaults to 1
  maxOffsetX?: number; // clamp around target
  maxOffsetY?: number; // clamp around target
  maxRotate?: number; // degrees clamp around target
}

/** Character rig animation definition */
export interface NpcAnimationRig {
  version: number;
  baseDurationMs?: number;
  motions: Record<string, NpcMotionDefinition>;
  deformers?: Record<string, NpcMeshDeformer>;
  springs?: Record<string, NpcSpringConfig>;
}

/** Complete NPC theme definition */
export interface NpcTheme {
  id: string;              // unique key, e.g. "cyberpunk_butler"
  name: string;            // display name
  description: string;     // short description
  avatar: NpcThemeAvatar;  // expression-specific avatars (emoji/URL)
  background: string;      // gradient preset name (default, space, forest, ocean, sunset)
  backgroundImage?: string; // path to default background image
  backgrounds?: Record<string, string>; // map of bgKey -> image path (e.g. { "default": "/avatars/lobster/bg/default.svg" })
  characterFolder?: string; // path to character expression images, e.g. "/avatars/default"
  characterParts?: NpcCharacterParts; // layered character parts for VN display
  partOffsets?: Record<string, NpcPartOffset>; // per-part position offsets
  partOrigins?: Record<string, NpcPartOrigin>; // per-part rotation pivot points
  partZIndex?: Record<string, number>; // per-part draw order
  animationRig?: NpcAnimationRig; // keyframe rig for canvas animation
  imageFormat?: "svg" | "png";  // format for expression images (default: svg)
  systemPrompt?: string;   // optional personality prompt
  builtIn?: boolean;       // true for default themes (can't delete)
}
