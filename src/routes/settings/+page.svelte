<script lang="ts">
  import { onMount } from "svelte";
  import { initLocale, locale, locales, setLocale, t, type Locale } from "../../lib/i18n";
  import { initTheme, setTheme, theme, type Theme } from "../../lib/theme";
  import { initSettings, settings, updateSettings } from "../../lib/settings";

  onMount(() => {
    initLocale();
    initTheme();
    initSettings();
  });

  const themes: Theme[] = ["system", "light", "dark"];
</script>

<main class="container">
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="orb"></div>
        <div>
          <h1>{$t("settings.title")}</h1>
          <p class="subtitle">{$t("app.tagline")}</p>
        </div>
      </div>

      <nav class="menu">
        <a class="menu-item active" href="/settings">
          <span class="dot"></span>
          {$t("settings.title")}
        </a>
        <a class="menu-item" href="/">
          <span class="dot ghost"></span>
          {$t("nav.home")}
        </a>
      </nav>

      <div class="status">
        <span class="chip">v0.1.0</span>
        <span class="hint">openClaw Desktop</span>
      </div>
    </aside>

    <section class="content">
      <header class="header">
        <div>
          <h2>{$t("settings.title")}</h2>
          <p class="subtitle">{$t("settings.appearance")}</p>
        </div>
      </header>

      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <span class="icon-wrap" aria-hidden="true">
              <svg class="icon-svg" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 5h8a4 4 0 0 1 4 4v10H8a4 4 0 0 1-4-4V5z"
                  stroke="currentColor"
                  stroke-width="1.6"
                />
                <path d="M8 9h8M8 12h6M8 15h4" stroke="currentColor" stroke-width="1.6" />
                <circle cx="18" cy="8" r="3" stroke="currentColor" stroke-width="1.6" />
              </svg>
            </span>
            <div>
              <h3>{$t("settings.language")}</h3>
              <p class="panel-note">UI language for menus and messages.</p>
            </div>
          </div>
        <span class="pill">Global</span>
      </div>
        <div class="control">
          <label for="language-select">{$t("settings.language")}</label>
          <select
            id="language-select"
            class="select"
            value={$locale}
            on:change={(event) => setLocale((event.currentTarget as HTMLSelectElement).value as Locale)}
          >
            {#each locales as entry}
              <option value={entry}>{$t(`settings.language.${entry}`)}</option>
            {/each}
          </select>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <span class="icon-wrap" aria-hidden="true">
              <svg class="icon-svg" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4a7 7 0 1 0 7 7A7 7 0 0 1 12 4z"
                  stroke="currentColor"
                  stroke-width="1.6"
                />
                <circle cx="17.5" cy="6.5" r="2" fill="currentColor" />
              </svg>
            </span>
            <div>
              <h3>{$t("settings.theme")}</h3>
              <p class="panel-note">Match system or choose a fixed theme.</p>
            </div>
          </div>
        <span class="pill">Personal</span>
        </div>
        <div class="control">
          <label id="theme-label">{$t("settings.theme")}</label>
          <div class="segmented" role="group" aria-labelledby="theme-label">
            {#each themes as entry}
              <button
                type="button"
                class:selected={$theme === entry}
                on:click={() => setTheme(entry)}
              >
                {$t(`settings.theme.${entry}`)}
              </button>
            {/each}
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <span class="icon-wrap" aria-hidden="true">
              <svg class="icon-svg" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="12" rx="3" stroke="currentColor" stroke-width="1.6" />
                <path d="M7 19h10" stroke="currentColor" stroke-width="1.6" />
                <circle cx="8" cy="9" r="1.5" fill="currentColor" />
                <circle cx="12" cy="9" r="1.5" fill="currentColor" />
                <circle cx="16" cy="9" r="1.5" fill="currentColor" />
              </svg>
            </span>
            <div>
              <h3>{$t("settings.system")}</h3>
              <p class="panel-note">Background behaviors and updates.</p>
            </div>
          </div>
          <span class="pill">Device</span>
        </div>
        <div class="list">
          <div class="list-row">
            <div>
              <div class="row-title">
                <svg class="mini-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 12a6 6 0 0 1 10.24-4.24L18 9"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                  />
                  <path d="M18 9V5h-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  <path
                    d="M18 12a6 6 0 0 1-10.24 4.24L6 15"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                  />
                  <path d="M6 15v4h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
                <h4>{$t("settings.auto_update")}</h4>
              </div>
              <p>{$t("settings.auto_update_desc")}</p>
            </div>
            <button
              type="button"
              class:toggle-on={$settings.autoUpdate}
              class="toggle"
              on:click={() => updateSettings({ autoUpdate: !$settings.autoUpdate })}
              aria-label={$t("settings.auto_update")}
              title={$t("settings.auto_update_desc")}
            >
              <span class="knob"></span>
            </button>
          </div>

          <div class="list-row">
            <div>
              <div class="row-title">
                <svg class="mini-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 4v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  <path d="M8.5 7.5L12 4l3.5 3.5" stroke="currentColor" stroke-width="1.6" />
                  <rect x="5" y="13" width="14" height="7" rx="3" stroke="currentColor" stroke-width="1.6" />
                </svg>
                <h4>{$t("settings.launch_on_startup")}</h4>
              </div>
              <p>{$t("settings.launch_on_startup_desc")}</p>
            </div>
            <button
              type="button"
              class:toggle-on={$settings.launchOnStartup}
              class="toggle"
              on:click={() => updateSettings({ launchOnStartup: !$settings.launchOnStartup })}
              aria-label={$t("settings.launch_on_startup")}
              title={$t("settings.launch_on_startup_desc")}
            >
              <span class="knob"></span>
            </button>
          </div>

          <div class="list-row">
            <div>
              <div class="row-title">
                <svg class="mini-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="4" y="6" width="16" height="10" rx="2.5" stroke="currentColor" stroke-width="1.6" />
                  <path d="M9 18h6" stroke="currentColor" stroke-width="1.6" />
                  <path d="M12 9v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
                <h4>{$t("settings.minimize_to_tray")}</h4>
              </div>
              <p>{$t("settings.minimize_to_tray_desc")}</p>
            </div>
            <button
              type="button"
              class:toggle-on={$settings.minimizeToTray}
              class="toggle"
              on:click={() => updateSettings({ minimizeToTray: !$settings.minimizeToTray })}
              aria-label={$t("settings.minimize_to_tray")}
              title={$t("settings.minimize_to_tray_desc")}
            >
              <span class="knob"></span>
            </button>
          </div>
        </div>
      </section>
    </section>
  </div>
</main>

<style>
  .container {
    min-height: 100vh;
    padding: 40px 5vw 64px;
  }

  .shell {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: 24px;
    animation: fade-in 0.6s ease;
  }

  .sidebar {
    background: linear-gradient(150deg, rgba(47, 102, 255, 0.16), transparent 60%),
      var(--surface);
    border-radius: 24px;
    padding: 22px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .brand {
    display: flex;
    gap: 14px;
    align-items: center;
  }

  .orb {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    background: radial-gradient(circle at 30% 20%, #8fb2ff, #2f66ff);
    box-shadow: 0 12px 24px rgba(47, 102, 255, 0.35);
  }

  h1 {
    margin: 0;
    font-size: 20px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
  }

  h3 {
    margin: 0;
    font-size: 16px;
  }

  .subtitle {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 13px;
  }

  .menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 14px;
    text-decoration: none;
    color: var(--text);
    background: transparent;
    font-size: 14px;
  }

  .menu-item.active {
    background: var(--surface-strong);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--accent);
  }

  .dot.ghost {
    background: var(--border);
  }

  .status {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chip {
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--surface-strong);
    font-size: 12px;
    color: var(--muted);
  }

  .hint {
    font-size: 12px;
    color: var(--muted);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .header {
    background: var(--surface);
    border-radius: 20px;
    padding: 20px 24px;
    box-shadow: var(--shadow);
  }

  .panel {
    background: var(--surface);
    border-radius: 20px;
    padding: 20px 24px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: rise-in 0.6s ease;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .icon-wrap {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg, rgba(47, 102, 255, 0.2), rgba(47, 102, 255, 0.06));
    position: relative;
  }

  .icon-svg {
    width: 22px;
    height: 22px;
    color: var(--accent);
  }

  .panel-note {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 13px;
  }

  .row-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mini-icon {
    width: 16px;
    height: 16px;
    color: var(--accent);
  }

  h4 {
    margin: 0 0 4px;
    font-size: 14px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .list-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface-strong);
  }

  .list-row p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }

  .pill {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-size: 11px;
    color: var(--muted);
  }

  .control {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  label {
    color: var(--muted);
    font-size: 14px;
  }

  .select {
    padding: 8px 12px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
  }

  .segmented {
    display: inline-flex;
    gap: 6px;
    background: var(--surface-strong);
    padding: 6px;
    border-radius: 999px;
  }

  .segmented button {
    border: none;
    background: transparent;
    color: var(--muted);
    padding: 8px 14px;
    border-radius: 999px;
    cursor: pointer;
    font-size: 13px;
  }

  .segmented button.selected {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
  }

  .toggle {
    width: 46px;
    height: 26px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    position: relative;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .toggle .knob {
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: var(--surface-strong);
    position: absolute;
    top: 2px;
    left: 3px;
    transition: transform 0.2s ease, background 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  }

  .toggle.toggle-on {
    background: rgba(47, 102, 255, 0.2);
    border-color: rgba(47, 102, 255, 0.5);
  }

  .toggle.toggle-on .knob {
    transform: translateX(18px);
    background: var(--accent);
  }

  .menu-item,
  .panel,
  .header,
  .sidebar {
    transition: transform 0.25s ease, box-shadow 0.25s ease;
  }

  .panel:hover {
    transform: translateY(-2px);
  }

  .menu-item:hover {
    transform: translateX(2px);
  }

  .segmented button {
    transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
  }

  .segmented button:hover {
    transform: translateY(-1px);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes rise-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 900px) {
    .shell {
      grid-template-columns: 1fr;
    }
  }
</style>
