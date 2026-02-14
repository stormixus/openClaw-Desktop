<script lang="ts">
  import { t } from '$lib/i18n';
  import { kt } from './i18n';
  import { ArrowLeft } from '@lucide/svelte';
  import TexasPokerBoard from './TexasPokerBoard.svelte';
</script>

<svelte:head>
  <title>{$kt('title')} | {$t('nav.play')} | {$t('app.title')}</title>
</svelte:head>

<div class="page">
  <div class="header">
    <a href="/play" class="back-link"><ArrowLeft size={16} />{$kt('back')}</a>
    <h2>{$kt('title')}</h2>
  </div>
  <div class="content">
    <TexasPokerBoard />
  </div>
</div>

<style>
  .page {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg);
  }

  .header {
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

  h2 {
    margin: 0;
    font-size: 16px;
    color: var(--color-text);
  }

  .content {
    flex: 1;
    padding: 20px;
    overflow: auto;
  }

  @media (max-width: 720px) {
    .content {
      padding: 12px;
    }
  }
</style>
