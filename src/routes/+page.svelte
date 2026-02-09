<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { initLocale, t } from "../lib/i18n";
  import { Zap, Bot, ArrowRight } from "@lucide/svelte";

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
      <div class="badge">
        <span class="badge-dot"></span>
        {$t("home.badge")}
      </div>
      <h1>{$t("app.title")}</h1>
      <p class="tagline">{$t("app.tagline")}</p>
      <div class="actions">
        <a class="btn-primary" href="/chat">
          {$t("home.primary")}
          <ArrowRight size={16} strokeWidth={2} />
        </a>
        <a class="btn-ghost" href="/settings">{$t("home.secondary")}</a>
      </div>
    </div>
    <div class="hero-card">
      <div class="card-header">
        <div>
          <h2>{$t("home.activity.title")}</h2>
          <p>{$t("home.activity.desc")}</p>
        </div>
        <span class="status-badge">{$t("home.activity.status")}</span>
      </div>
      <div class="meter">
        <div class="meter-fill"></div>
      </div>
      <div class="card-grid">
        <div class="card-item">
          <span class="card-label">{$t("home.activity.latency")}</span>
          <strong>42ms</strong>
        </div>
        <div class="card-item">
          <span class="card-label">{$t("home.activity.queue")}</span>
          <strong>0</strong>
        </div>
        <div class="card-item">
          <span class="card-label">{$t("home.activity.agents")}</span>
          <strong>3</strong>
        </div>
        <div class="card-item">
          <span class="card-label">{$t("home.activity.last_sync")}</span>
          <strong>{$t("home.activity.now")}</strong>
        </div>
      </div>
    </div>
  </section>

  <section class="features">
    <div class="feature-card">
      <div class="feature-icon">
        <Zap size={20} strokeWidth={1.5} />
      </div>
      <div>
        <h3>{$t("home.quick.workflows.title")}</h3>
        <p>{$t("home.quick.workflows.desc")}</p>
      </div>
    </div>
    <div class="feature-card">
      <div class="feature-icon accent">
        <Bot size={20} strokeWidth={1.5} />
      </div>
      <div>
        <h3>{$t("home.quick.agents.title")}</h3>
        <p>{$t("home.quick.agents.desc")}</p>
      </div>
    </div>
  </section>
</main>

<style>
  .container {
    min-height: 100vh;
    padding: var(--space-3xl) 6vw;
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
    overflow-y: auto;
  }

  /* Hero */
  .hero {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: var(--space-xl);
    align-items: stretch;
    animation: fadeUp var(--duration-slow) var(--ease-out);
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .hero-left {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    justify-content: center;
  }

  .badge {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 6px 14px;
    border-radius: var(--radius-full);
    background: rgba(99, 102, 241, 0.1);
    color: var(--color-primary);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-success);
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
    animation: pulse 2s ease infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  h1 {
    margin: 0;
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
    background: linear-gradient(135deg, var(--color-text) 0%, var(--color-text-muted) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .tagline {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 15px;
    line-height: 1.6;
  }

  /* Buttons */
  .actions {
    display: flex;
    gap: var(--space-md);
    flex-wrap: wrap;
    margin-top: var(--space-sm);
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 10px 20px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    color: white;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    transition: all var(--duration-normal) var(--ease-out);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
  }

  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(99, 102, 241, 0.4);
  }

  .btn-ghost {
    display: inline-flex;
    align-items: center;
    padding: 10px 20px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-strong);
    background: transparent;
    color: var(--color-text);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    transition: all var(--duration-normal) var(--ease-out);
  }

  .btn-ghost:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  /* Hero Card */
  .hero-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    box-shadow: var(--shadow-md);
    transition: transform var(--duration-normal) var(--ease-out),
                box-shadow var(--duration-normal) var(--ease-out);
  }

  .hero-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .card-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .card-header p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .status-badge {
    flex-shrink: 0;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    background: rgba(16, 185, 129, 0.12);
    color: var(--color-success);
    font-size: 11px;
    font-weight: 600;
  }

  .meter {
    width: 100%;
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--color-surface-elevated);
    overflow: hidden;
  }

  .meter-fill {
    width: 72%;
    height: 100%;
    border-radius: var(--radius-full);
    background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
    transition: width 1s var(--ease-out);
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-sm);
  }

  .card-item {
    background: var(--color-surface-elevated);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .card-label {
    font-size: 11px;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .card-item strong {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text);
  }

  /* Feature Cards */
  .features {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-md);
    animation: fadeUp var(--duration-slow) var(--ease-out) 100ms both;
  }

  .feature-card {
    display: flex;
    gap: var(--space-lg);
    align-items: flex-start;
    padding: var(--space-xl);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-xs);
    transition: all var(--duration-normal) var(--ease-out);
    cursor: default;
  }

  .feature-card:hover {
    border-color: var(--color-border-strong);
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .feature-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05));
    color: var(--color-primary);
  }

  .feature-icon.accent {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.05));
    color: var(--color-accent);
  }

  .feature-card h3 {
    margin: 0 0 var(--space-xs);
    font-size: 14px;
    font-weight: 600;
  }

  .feature-card p {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  @media (max-width: 960px) {
    .hero {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .features {
      grid-template-columns: 1fr;
    }
    .card-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
