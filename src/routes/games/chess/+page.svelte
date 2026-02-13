<script lang="ts">
  import { t } from "$lib/i18n";
  import { ct } from "$lib/games/chess/i18n";
  import { ArrowLeft } from "@lucide/svelte";
  import ChessBoard from "$lib/games/chess/ChessBoard.svelte";
</script>

<svelte:head>
  <title>{$ct("title")} | {$t("nav.games")} | {$t("app.title")}</title>
</svelte:head>

<div class="chess-page">
  <div class="chess-header">
    <a href="/games" class="back-link">
      <ArrowLeft size={16} />
      {$ct("back")}
    </a>
    <h2>{$ct("title")}</h2>
  </div>

  <div class="chess-content">
    <ChessBoard />
  </div>
</div>

<style>
  .chess-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg);
  }

  .chess-header {
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

  .chess-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
  }

  .chess-content {
    flex: 1;
    display: flex;
    padding: 24px;
    overflow: hidden;
  }
</style>
