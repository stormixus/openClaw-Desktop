<script lang="ts">
  import { t } from "$lib/i18n";
</script>

<svelte:head>
  <title>{$t("nav.forge")} | {$t("app.title")}</title>
</svelte:head>

<div class="forge-page">
  <div class="coming-soon">
    <span class="icon">🔨</span>
    <h2>{$t("forge.title")}</h2>
    <p>Document collaboration with AI coming soon</p>
    
    <div class="features-preview">
      <div class="feature">
        <span>📊</span>
        <span>Excel / Spreadsheets</span>
      </div>
      <div class="feature">
        <span>📝</span>
        <span>Word Documents</span>
      </div>
      <div class="feature">
        <span>📊</span>
        <span>PowerPoint Slides</span>
      </div>
    </div>
  </div>
</div>

<style>
  .forge-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--color-bg);
  }

  .coming-soon {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    text-align: center;
  }

  .icon {
    font-size: 64px;
    opacity: 0.6;
  }

  h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--color-text);
  }

  p {
    margin: 0;
    font-size: 14px;
    color: var(--color-text-muted);
  }

  .features-preview {
    display: flex;
    gap: 16px;
    margin-top: 24px;
  }

  .feature {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px 24px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 16px;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .feature span:first-child {
    font-size: 28px;
  }
</style>
