<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { initLocale, t } from "../lib/i18n";

  let name = $state("");
  let greetMsg = $state("");

  onMount(() => {
    initLocale();
  });

  async function greet(event: Event) {
    event.preventDefault();
    greetMsg = await invoke("greet", { name });
  }
</script>

<main class="container">
  <section class="hero">
    <div class="hero-left">
      <div class="badge">openclaw · AI agent</div>
      <h1>{$t("app.title")}</h1>
      <p class="tagline">{$t("app.tagline")}</p>
      <div class="actions">
        <a class="primary" href="/settings">{$t("nav.settings")}</a>
        <button class="ghost" type="button">Learn more</button>
      </div>
      <div class="quick">
        <div class="quick-item">
          <span class="quick-dot"></span>
          <div>
            <h3>Workflows</h3>
            <p>Launch tasks faster with desktop-native flows.</p>
          </div>
        </div>
        <div class="quick-item">
          <span class="quick-dot"></span>
          <div>
            <h3>Agents</h3>
            <p>Keep AI helpers close to your daily work.</p>
          </div>
        </div>
      </div>
    </div>
    <div class="hero-card">
      <div class="card-header">
        <div>
          <h2>Activity</h2>
          <p>Latest system check</p>
        </div>
        <span class="status">Healthy</span>
      </div>
      <div class="meter">
        <div class="meter-fill"></div>
      </div>
      <div class="card-grid">
        <div class="card-item">
          <span class="pill">Latency</span>
          <strong>42ms</strong>
        </div>
        <div class="card-item">
          <span class="pill">Queue</span>
          <strong>0</strong>
        </div>
        <div class="card-item">
          <span class="pill">Agents</span>
          <strong>3</strong>
        </div>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <div>
        <h2>{$t("greet.title")}</h2>
        <p class="panel-note">Bridge test for the Rust command.</p>
      </div>
      <span class="pill">Dev</span>
    </div>
    <form class="row" onsubmit={greet}>
      <input id="greet-input" placeholder={$t("greet.placeholder")} bind:value={name} />
      <button type="submit">{$t("greet.button")}</button>
    </form>
    {#if greetMsg}
      <p class="message">{greetMsg}</p>
    {/if}
  </section>
</main>

<style>
  .container {
    min-height: 100vh;
    padding: 56px 6vw 72px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    gap: 28px;
    align-items: stretch;
  }

  .hero-left {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  h1 {
    margin: 0;
    font-size: 36px;
  }

  .tagline {
    margin: 0;
    color: var(--muted);
    font-size: 16px;
  }

  .badge {
    align-self: flex-start;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(47, 102, 255, 0.12);
    color: var(--accent);
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .primary {
    padding: 10px 16px;
    border-radius: 999px;
    background: var(--text);
    color: #fff;
    text-decoration: none;
    font-size: 14px;
  }

  .ghost {
    padding: 10px 16px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
  }

  .quick {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }

  .quick-item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .quick-item h3 {
    margin: 0 0 4px;
    font-size: 14px;
  }

  .quick-item p {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .quick-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--accent);
    margin-top: 6px;
  }

  .hero-card {
    background: var(--surface);
    border-radius: 22px;
    padding: 22px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .card-header h2 {
    margin: 0;
    font-size: 18px;
  }

  .card-header p {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--muted);
  }

  .status {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(46, 196, 134, 0.15);
    color: #1d8e62;
    font-size: 12px;
  }

  .meter {
    width: 100%;
    height: 10px;
    border-radius: 999px;
    background: var(--surface-strong);
    overflow: hidden;
  }

  .meter-fill {
    width: 72%;
    height: 100%;
    background: linear-gradient(90deg, #ff3b3b, #2f66ff);
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .card-item {
    background: var(--surface-strong);
    border-radius: 14px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }

  .card-item strong {
    font-size: 16px;
  }

  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  input,
  button {
    border-radius: 10px;
    border: 1px solid var(--border);
    padding: 10px 14px;
    font-size: 14px;
    font-family: inherit;
  }

  input {
    flex: 1 1 200px;
    background: var(--surface);
    color: var(--text);
  }

  button {
    background: var(--text);
    color: #ffffff;
    cursor: pointer;
    border-color: transparent;
  }

  .message {
    margin: 0;
    color: var(--accent);
    font-weight: 600;
  }

  .panel {
    background: var(--surface);
    border-radius: 20px;
    padding: 22px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-note {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--muted);
  }

  @media (max-width: 960px) {
    .hero {
      grid-template-columns: 1fr;
    }

    .card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .card-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
