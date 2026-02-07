<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { initLocale } from "$lib/i18n";
  import { applyThemeToDocument, initTheme, theme } from "$lib/theme";
  import { initGatewayStore } from "$lib/gateway/store.svelte";
  import TitleBar from "$lib/components/TitleBar.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import SetupWizard from "$lib/components/Wizard/SetupWizard.svelte";

  let showWizard = $state(false);
  let initialized = $state(false);

  onMount(() => {
    initLocale();
    initTheme();
    initGatewayStore();

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
  <TitleBar />
  <div class="app-shell">
    <Sidebar />
    <main class="main-content">
      <slot />
    </main>
  </div>
</div>

<style>
  /* ============================================================================
   * CSS Variables - CleanMyMac Premium Style
   * ============================================================================ */
  :global(:root) {
    /* Colors - Light Theme */
    --color-bg: #f8fafc;
    --color-surface: #ffffff;
    --color-surface-elevated: #f1f5f9;
    --color-surface-hover: rgba(99, 102, 241, 0.08);
    --color-text: #0f172a;
    --color-text-muted: #64748b;
    --color-border: #e2e8f0;
    --color-primary: #6366f1;
    --color-accent: #8b5cf6;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-error: #ef4444;

    /* Sidebar */
    --sidebar-bg: rgba(241, 245, 249, 0.8);
    --sidebar-width: 80px;

    /* Shadows */
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
    --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
    --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.12);
    --shadow-glow: 0 0 20px rgba(99, 102, 241, 0.15);

    /* Radius */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 24px;
  }

  :global(:root[data-theme="dark"]) {
    /* Colors - Dark Theme (Premium dark) */
    --color-bg: #09090b;
    --color-surface: #18181b;
    --color-surface-elevated: #27272a;
    --color-surface-hover: rgba(99, 102, 241, 0.12);
    --color-text: #fafafa;
    --color-text-muted: #a1a1aa;
    --color-border: #3f3f46;
    --color-primary: #818cf8;
    --color-accent: #a78bfa;
    --color-success: #34d399;
    --color-warning: #fbbf24;
    --color-error: #f87171;

    /* Sidebar */
    --sidebar-bg: rgba(24, 24, 27, 0.9);
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(html), :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", 
                 "Noto Sans KR", system-ui, sans-serif;
    color: var(--color-text);
    background: transparent;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :global(button) {
    font-family: inherit;
  }

  /* App Container */
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--color-bg);
    border-radius: 10px;
    border: 1px solid var(--color-border);
  }

  /* Vibrancy effect for macOS */
  @supports (-webkit-backdrop-filter: blur(20px)) or (backdrop-filter: blur(20px)) {
    .app-container {
      background: rgba(248, 250, 252, 0.85);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      backdrop-filter: blur(20px) saturate(180%);
    }

    :global(:root[data-theme="dark"]) .app-container {
      background: rgba(9, 9, 11, 0.85);
    }
  }

  /* App Shell Layout */
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
