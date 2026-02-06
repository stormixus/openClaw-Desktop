<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { initLocale } from "$lib/i18n";
  import { applyThemeToDocument, initTheme, theme } from "$lib/theme";
  import { initGatewayStore } from "$lib/gateway/store.svelte";
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

<div class="app-shell">
  <Sidebar />
  <main class="main-content">
    <slot />
  </main>
</div>

<style>
  /* ============================================================================
   * CSS Variables - CleanMyMac Style
   * ============================================================================ */
  :global(:root) {
    /* Colors - Light Theme */
    --color-bg: #f5f7fb;
    --color-surface: #ffffff;
    --color-surface-elevated: #f8f9fc;
    --color-surface-hover: rgba(0, 0, 0, 0.05);
    --color-text: #171a1f;
    --color-text-muted: #6b7280;
    --color-border: #e5e7eb;
    --color-primary: #3b82f6;
    --color-accent: #8b5cf6;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-error: #ef4444;

    /* Sidebar */
    --sidebar-bg: #f0f2f5;
    --sidebar-width: 80px;

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 12px 30px rgba(0, 0, 0, 0.15);

    /* Radius */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 20px;
  }

  :global(:root[data-theme="dark"]) {
    /* Colors - Dark Theme */
    --color-bg: #0d0f14;
    --color-surface: #141820;
    --color-surface-elevated: #1a1f2a;
    --color-surface-hover: rgba(255, 255, 255, 0.08);
    --color-text: #f4f6fb;
    --color-text-muted: #9ca3af;
    --color-border: #2a3140;
    --color-primary: #3b82f6;
    --color-accent: #8b5cf6;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-error: #ef4444;

    /* Sidebar */
    --sidebar-bg: #0a0c10;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", 
                 "Noto Sans KR", system-ui, sans-serif;
    color: var(--color-text);
    background: var(--color-bg);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :global(button) {
    font-family: inherit;
  }

  /* App Shell Layout */
  .app-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--color-bg);
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
