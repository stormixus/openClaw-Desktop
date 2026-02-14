<script lang="ts">
  import { t } from '$lib/i18n';
  import { kt } from './i18n';
  import { ArrowLeft } from '@lucide/svelte';
  import Sokoban3DViewport from './components/Sokoban3DViewport.svelte';
  import HUD from './components/HUD.svelte';
  import AgentPanel from './components/AgentPanel.svelte';
</script>

<svelte:head>
  <title>{$kt('title')} | {$t('nav.play')} | {$t('app.title')}</title>
</svelte:head>

<div class="page">
  <div class="header">
    <a href="/play" class="back-link"><ArrowLeft size={16} />{$kt('back')}</a>
    <h2>{$kt('title')}</h2>
  </div>

  <div class="game-container">
    <div class="viewport-container">
      <Sokoban3DViewport />
    </div>

    <aside class="sidebar">
      <HUD />
      <AgentPanel />
    </aside>
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

  .game-container {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 16px;
    padding: 16px;
    flex: 1;
    overflow: hidden;
  }

  .viewport-container {
    position: relative;
    border-radius: 10px;
    overflow: hidden;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  @media (max-width: 900px) {
    .game-container {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }

    .viewport-container {
      height: 60vh;
    }
  }
</style>
