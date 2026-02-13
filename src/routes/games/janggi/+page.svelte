<script lang="ts">
  import { t } from "$lib/i18n";
  import { jt } from "$lib/games/janggi/i18n";
  import { ArrowLeft } from "@lucide/svelte";
  import JanggiBoard from "$lib/games/janggi/JanggiBoard.svelte";
</script>

<svelte:head>
  <title>{$jt("title")} | {$t("nav.games")} | {$t("app.title")}</title>
</svelte:head>

<div class="janggi-page">
  <div class="janggi-header">
    <a href="/games" class="back-link">
      <ArrowLeft size={16} />
      {$jt("back")}
    </a>
    <h2>{$jt("title")}</h2>
  </div>

  <div class="janggi-content">
    <JanggiBoard />
  </div>
</div>

<style>
  .janggi-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg);
  }

  .janggi-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 24px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
    text-decoration: none;
    padding: 5px 10px;
    border-radius: 6px;
    transition: all 150ms ease;
  }

  .back-link:hover {
    background: var(--color-surface-hover);
    color: var(--color-primary);
  }

  .janggi-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
  }

  .janggi-content {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 24px;
    color: var(--color-text-muted);
  }
</style>
