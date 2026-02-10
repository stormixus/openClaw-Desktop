<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { initLocale } from "$lib/i18n";
  import { applyThemeToDocument, initTheme, theme } from "$lib/theme";
  import { initGatewayStore } from "$lib/gateway/store.svelte";
  import { initBackgroundService } from "$lib/gateway/npcBackgroundService";
  import { loadThemeManifests } from "$lib/gateway/npcThemeStore.svelte";

  import Sidebar from "$lib/components/Sidebar.svelte";
  import SetupWizard from "$lib/components/Wizard/SetupWizard.svelte";

  let { children } = $props();

  let showWizard = $state(false);
  let initialized = $state(false);

  onMount(() => {
    initLocale();
    initTheme();
    initGatewayStore();
    initBackgroundService();
    loadThemeManifests();

    // Check if first run
    if (browser) {
      const wizardComplete = localStorage.getItem("openclaw.wizardComplete");
      showWizard = !wizardComplete;
    }

    initialized = true;

    const unsubscribe = theme.subscribe((value) => {
      applyThemeToDocument(value);
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      let current: string | null = null;
      const stop = theme.subscribe((value) => {
        current = value;
      });
      stop();
      if (current === "system") {
        applyThemeToDocument("system");
      }
    };
    media.addEventListener("change", listener);

    return () => {
      unsubscribe();
      media.removeEventListener("change", listener);
    };
  });

  function handleWizardComplete() {
    showWizard = false;
  }
</script>

{#if showWizard}
  <SetupWizard oncomplete={handleWizardComplete} />
{/if}

<div class="app-container">
  <div class="app-shell">
    <Sidebar />
    <main class="main-content">
      {@render children()}
    </main>
  </div>
</div>

<style>
  /* ============================================================================
   * Design System — openClaw Desktop
   * ============================================================================ */
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  :global(:root) {
    /* Typography */
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI",
                 "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
    --font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;

    /* Colors — Light Theme */
    --color-bg: #f5f5f7;
    --color-surface: #ffffff;
    --color-surface-elevated: #f0f0f3;
    --color-surface-hover: rgba(99, 102, 241, 0.07);
    --color-text: #1a1a2e;
    --color-text-muted: #6b7280;
    --color-text-subtle: #9ca3af;
    --color-border: rgba(0, 0, 0, 0.08);
    --color-border-strong: rgba(0, 0, 0, 0.14);
    --color-primary: #6366f1;
    --color-primary-hover: #4f46e5;
    --color-accent: #8b5cf6;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-error: #ef4444;

    /* Sidebar */
    --sidebar-bg: rgba(245, 245, 247, 0.85);
    --sidebar-width: 72px;

    /* Shadows — Light */
    --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
    --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(0, 0, 0, 0.06);
    --shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.06);
    --shadow-glow: 0 0 24px rgba(99, 102, 241, 0.15);
    --shadow-glow-strong: 0 0 40px rgba(99, 102, 241, 0.25);

    /* Radius */
    --radius-xs: 6px;
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 20px;
    --radius-2xl: 24px;
    --radius-full: 9999px;

    /* Spacing */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 12px;
    --space-lg: 16px;
    --space-xl: 24px;
    --space-2xl: 32px;
    --space-3xl: 48px;

    /* Transitions */
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --duration-fast: 150ms;
    --duration-normal: 250ms;
    --duration-slow: 400ms;
  }

  :global(:root[data-theme="dark"]) {
    /* Colors — Dark Theme (layered depth) */
    --color-bg: #0a0a0f;
    --color-surface: #141419;
    --color-surface-elevated: #1e1e26;
    --color-surface-hover: rgba(129, 140, 248, 0.1);
    --color-text: #f0f0f5;
    --color-text-muted: #8b8b9e;
    --color-text-subtle: #5c5c72;
    --color-border: rgba(255, 255, 255, 0.07);
    --color-border-strong: rgba(255, 255, 255, 0.12);
    --color-primary: #818cf8;
    --color-primary-hover: #6366f1;
    --color-accent: #a78bfa;
    --color-success: #34d399;
    --color-warning: #fbbf24;
    --color-error: #f87171;

    /* Sidebar */
    --sidebar-bg: rgba(14, 14, 20, 0.9);

    /* Shadows — Dark (more subtle, with colored glows) */
    --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.2);
    --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.35), 0 1px 4px rgba(0, 0, 0, 0.2);
    --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.25);
    --shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.5);
    --shadow-glow: 0 0 24px rgba(129, 140, 248, 0.12);
    --shadow-glow-strong: 0 0 40px rgba(129, 140, 248, 0.2);
  }

  /* ============================================================================
   * Global Resets
   * ============================================================================ */
  :global(*) {
    box-sizing: border-box;
  }

  :global(html), :global(body) {
    margin: 0;
    padding: 0;
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-text);
    background: transparent;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  }

  :global(button) {
    font-family: inherit;
  }

  :global(a) {
    text-decoration: none;
    color: inherit;
  }

  /* Scrollbar styling */
  :global(::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }

  :global(::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(::-webkit-scrollbar-thumb) {
    background: var(--color-border-strong);
    border-radius: var(--radius-full);
  }

  :global(::-webkit-scrollbar-thumb:hover) {
    background: var(--color-text-muted);
  }

  /* Selection */
  :global(::selection) {
    background: rgba(99, 102, 241, 0.25);
    color: inherit;
  }

  /* ============================================================================
   * App Layout
   * ============================================================================ */
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--color-bg);
  }

  /* Vibrancy effect for macOS */
  @supports (-webkit-backdrop-filter: blur(20px)) or (backdrop-filter: blur(20px)) {
    .app-container {
      background: rgba(245, 245, 247, 0.88);
      -webkit-backdrop-filter: blur(24px) saturate(200%);
      backdrop-filter: blur(24px) saturate(200%);
    }

    :global(:root[data-theme="dark"]) .app-container {
      background: rgba(10, 10, 15, 0.88);
    }
  }

  .app-shell {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
