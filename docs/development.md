# Development Guide

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Frontend tooling |
| Rust | stable | Backend compilation |
| Cargo | (with Rust) | Rust package manager |
| Tauri CLI | 2.x | Desktop app framework |

Optional:
- **Bun** — faster package management (drop-in npm replacement)
- **Xcode** (macOS) — code signing and notarization

## Setup

```bash
# Clone repository
git clone <repo-url>
cd "openClaw Desktop"

# Install frontend dependencies
npm install

# Run in development mode (launches Tauri app with hot reload)
npm run tauri dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 1420) |
| `npm run build` | Build SvelteKit production bundle |
| `npm run preview` | Preview production build |
| `npm run check` | Run svelte-check (TypeScript + Svelte diagnostics) |
| `npm run check:watch` | Watch mode for svelte-check |
| `npm run tauri dev` | Launch Tauri desktop app (dev mode) |
| `npm run tauri build` | Build distributable desktop app |
| `npm run icon:light` | Generate app icons from light SVG |
| `npm run icon:dark` | Generate app icons from dark SVG |

## Project Configuration

### Vite (`vite.config.js`)
- Dev server on port `1420`
- SvelteKit plugin with Svelte 5 runes mode

### SvelteKit (`svelte.config.js`)
- Static adapter (SPA mode)
- Fallback to `index.html` for client-side routing

### Tauri (`src-tauri/tauri.conf.json`)
- App identifier and version
- Window configuration
- Security capabilities
- Plugin registrations (dialog, opener)

### TypeScript (`tsconfig.json`)
- Strict mode enabled
- Path aliases: `$lib` → `src/lib`

## Coding Conventions

### Svelte 5 Runes

This project uses **Svelte 5 runes** exclusively:

```typescript
// State
let count = $state(0);
let items = $state<string[]>([]);

// Raw state (for complex third-party objects like TipTap Editor)
let editor = $state.raw(null);

// Derived
const doubled = $derived(count * 2);
const filtered = $derived.by(() => items.filter(i => i.length > 0));

// Effects
$effect(() => {
  console.log('count changed:', count);
});

// Props
interface Props { name: string; age?: number; }
const { name, age = 0 }: Props = $props();
```

**Important**: Never use `$state()` for complex third-party objects (TipTap Editor, Three.js objects, etc.). Svelte 5 deep-proxies `$state` objects, causing internal mutations to trigger reactive cascades. Use `$state.raw()` instead — it tracks reference changes only.

### Component Structure

```svelte
<script lang="ts">
  // 1. Imports
  // 2. Props interface + destructuring
  // 3. Local state
  // 4. Derived values
  // 5. Effects
  // 6. Functions
  // 7. Lifecycle (onMount, onDestroy)
</script>

<!-- Template -->

<style>
  /* Scoped styles */
</style>
```

### Store Pattern

Stores use `.svelte.ts` extension for rune support:

```typescript
// src/lib/stores/example.svelte.ts

class ExampleStore {
  items = $state<Item[]>([]);
  activeId = $state<string | null>(null);

  get active() {
    return this.items.find(i => i.id === this.activeId) ?? null;
  }

  add(item: Item) {
    this.items.push(item);
  }
}

export const store = new ExampleStore();
```

### i18n

- All user-visible strings must use `$t('key')` (global) or `$kt('key')` (game-local)
- Never hardcode display text in templates
- Both EN and KO translations must be added simultaneously
- See [i18n.md](./i18n.md) for key naming conventions

### Styling

- **Scoped styles** via Svelte `<style>` blocks (default)
- **CSS variables** for theming: `var(--color-surface)`, `var(--color-text)`, etc.
- **Global styles** via `:global()` selector when targeting third-party DOM (e.g., ProseMirror)
- No CSS framework — custom design system

### Sound

Games use **Web Audio API** for synthesized sounds (no audio files):

```typescript
// Typical sound function
export function playClick(): void {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain).connect(ctx.destination);
  osc.frequency.value = 800;
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}
```

## Build & Release

### Development Build
```bash
npm run tauri dev
```
Hot reloads frontend. Rust backend recompiles on `src-tauri/` changes.

### Production Build
```bash
npm run tauri build
```
Outputs platform-specific installer:
- **macOS**: `.dmg` + `.app` bundle
- **Windows**: `.msi` installer
- **Linux**: `.deb` / `.AppImage`

### macOS Code Signing

The project includes a GitHub Actions workflow for automated signing and notarization:
- Apple Developer certificate (p12)
- Notarization via `notarytool`
- Stapling for offline verification

### CI/CD

GitHub Actions workflows handle:
- Multi-platform builds (macOS, Windows, Linux)
- Code signing (macOS)
- Release artifact uploads

## Troubleshooting

### `effect_update_depth_exceeded`
Svelte 5 error indicating an infinite reactive loop. Common cause: wrapping complex third-party objects in `$state()`. Fix: use `$state.raw()`.

### `svelte-check` warnings
Run `npx svelte-check --threshold error` to focus on errors only. Warnings are informational (unused CSS, a11y hints).

### Rust compilation slow
First build compiles all dependencies. Subsequent builds use incremental compilation. Consider `cargo install sccache` for caching.

### Font rendering issues
System fonts are enumerated via Rust `font-kit`. If fonts don't appear, check `fonts.svelte.ts` store initialization.
