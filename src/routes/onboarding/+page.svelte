<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { initLocale, t } from "../../lib/i18n";

  onMount(() => {
    initLocale();
  });

  function finish() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("openclaw.onboarding", "done");
    }
    goto("/");
  }
</script>

<main class="container">
  <section class="card">
    <div class="hero">
      <div class="badge">openClaw</div>
      <h1>{$t("onboarding.title")}</h1>
      <p>{$t("onboarding.subtitle")}</p>
    </div>

    <div class="steps">
      <div class="step">
        <div class="icon"></div>
        <div>
          <h2>{$t("onboarding.step1.title")}</h2>
          <p>{$t("onboarding.step1.desc")}</p>
        </div>
      </div>
      <div class="step">
        <div class="icon"></div>
        <div>
          <h2>{$t("onboarding.step2.title")}</h2>
          <p>{$t("onboarding.step2.desc")}</p>
        </div>
      </div>
      <div class="step">
        <div class="icon"></div>
        <div>
          <h2>{$t("onboarding.step3.title")}</h2>
          <p>{$t("onboarding.step3.desc")}</p>
        </div>
      </div>
    </div>

    <div class="actions">
      <button class="primary" type="button" on:click={finish}>
        {$t("onboarding.action.primary")}
      </button>
      <button class="ghost" type="button" on:click={finish}>
        {$t("onboarding.action.secondary")}
      </button>
    </div>
  </section>
</main>

<style>
  .container {
    min-height: calc(100vh - 90px);
    padding: 40px 6vw 64px;
    display: flex;
    justify-content: center;
  }

  .card {
    max-width: 720px;
    width: 100%;
    background: var(--surface);
    border-radius: 24px;
    padding: 28px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .hero h1 {
    margin: 12px 0 6px;
    font-size: 28px;
  }

  .hero p {
    margin: 0;
    color: var(--muted);
  }

  .badge {
    display: inline-flex;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(47, 102, 255, 0.12);
    color: var(--accent);
    font-size: 12px;
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .step {
    display: flex;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 18px;
    background: var(--surface-strong);
  }

  .icon {
    width: 32px;
    height: 32px;
    border-radius: 12px;
    background: linear-gradient(135deg, #ff3b3b, #2f66ff);
  }

  .step h2 {
    margin: 0 0 4px;
    font-size: 16px;
  }

  .step p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .primary {
    padding: 10px 18px;
    border-radius: 999px;
    border: none;
    background: var(--text);
    color: #fff;
    font-size: 14px;
    cursor: pointer;
  }

  .ghost {
    padding: 10px 18px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
  }
</style>
