<script lang="ts">
  import { onMount } from "svelte";
  import { applyThemeToDocument, initTheme, theme } from "../lib/theme";

  onMount(() => {
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

<slot />

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
</style>
