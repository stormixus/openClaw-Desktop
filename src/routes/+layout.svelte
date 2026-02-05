<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { initLocale, t } from "../lib/i18n";
  import { applyThemeToDocument, initTheme, theme } from "../lib/theme";

  onMount(() => {
    initLocale();
    initTheme();
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
</script>

<div class="app-shell">
  <header class="topbar">
    <div class="brand">
      <div class="logo"></div>
      <div>
        <strong>{$t("app.title")}</strong>
        <span>{$t("app.subtitle")}</span>
      </div>
    </div>
    <nav class="nav">
      <a class:active={$page.url.pathname === "/"} href="/">{$t("nav.home")}</a>
      <a class:active={$page.url.pathname.startsWith("/settings")} href="/settings">{$t("nav.settings")}</a>
      <a class:active={$page.url.pathname.startsWith("/onboarding")} href="/onboarding">
        {$t("nav.onboarding")}
      </a>
    </nav>
  </header>
  <slot />
</div>

<style>
  :global(:root) {
    --bg: #f5f7fb;
    --surface: #ffffff;
    --surface-strong: #eef1f6;
    --text: #171a1f;
    --muted: #5a6472;
    --border: #d6dbe5;
    --shadow: 0 12px 30px rgba(16, 24, 40, 0.08);
    --accent: #2f66ff;
  }

  :global(:root[data-theme="dark"]) {
    --bg: #0e1117;
    --surface: #141923;
    --surface-strong: #1c2230;
    --text: #f4f6fb;
    --muted: #b7c0cc;
    --border: #2a3240;
    --shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    --accent: #2f66ff;
  }

  :global(body) {
    margin: 0;
    font-family: "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
    color: var(--text);
    background: radial-gradient(circle at top, rgba(47, 102, 255, 0.08), transparent 45%),
      var(--bg);
  }

  .app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 20px 6vw;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: radial-gradient(circle at 30% 20%, #ff5a5f, #2f66ff);
    box-shadow: 0 10px 20px rgba(47, 102, 255, 0.25);
  }

  .brand strong {
    display: block;
    font-size: 14px;
  }

  .brand span {
    display: block;
    font-size: 12px;
    color: var(--muted);
  }

  .nav {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .nav a {
    text-decoration: none;
    color: var(--muted);
    font-size: 13px;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid transparent;
  }

  .nav a.active {
    color: var(--text);
    background: var(--surface);
    border-color: var(--border);
    box-shadow: var(--shadow);
  }

  @media (max-width: 900px) {
    .topbar {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
