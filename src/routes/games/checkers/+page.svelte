<script lang="ts">
  import { t } from '$lib/i18n';
  import { kt } from '$lib/games/checkers/i18n';
  import { ArrowLeft } from '@lucide/svelte';
  import CheckersBoard from '$lib/games/checkers/CheckersBoard.svelte';
</script>

<svelte:head>
  <title>{$kt('title')} | {$t('nav.games')} | {$t('app.title')}</title>
</svelte:head>

<div class="page">
  <div class="header">
    <a href="/games" class="back-link"><ArrowLeft size={16} />{$kt('back')}</a>
    <h2>{$kt('title')}</h2>
  </div>
  <div class="content"><CheckersBoard /></div>
</div>

<style>
  .page{flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--color-bg)}
  .header{display:flex;align-items:center;gap:14px;padding:16px 24px;border-bottom:1px solid var(--color-border)}
  .back-link{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--color-text-muted);text-decoration:none;padding:5px 10px;border-radius:6px}
  .back-link:hover{background:var(--color-surface-hover);color:var(--color-primary)}
  h2{margin:0;font-size:16px}
  .content{flex:1;padding:24px;overflow:hidden}
</style>
