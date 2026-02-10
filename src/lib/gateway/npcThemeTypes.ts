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
  imageFormat?: "svg" | "png";  // format for expression images (default: svg)
  systemPrompt?: string;   // optional personality prompt
  builtIn?: boolean;       // true for default themes (can't delete)
}
