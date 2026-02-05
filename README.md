# openClaw Desktop

openClaw Desktop is a cross-platform desktop app (macOS/Windows/Linux) built with Tauri, SvelteKit, and TypeScript.

## Stack
- Tauri 2
- SvelteKit + TypeScript
- Bun

## Setup
```bash
bun install
```

## Run (Desktop)
```bash
bun run tauri dev
```

## Build (Desktop)
```bash
bun run tauri build
```

## Notes
- i18n is implemented without external libraries (`src/lib/i18n.ts`).
- Theme selection (system/light/dark) is stored locally (`src/lib/theme.ts`).
- Settings toggles are currently UI-only (`src/lib/settings.ts`).
- Updater is configured with a placeholder endpoint in `src-tauri/tauri.conf.json`.

## IDE Setup (Optional)
VS Code with Svelte + Tauri + rust-analyzer extensions.

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
