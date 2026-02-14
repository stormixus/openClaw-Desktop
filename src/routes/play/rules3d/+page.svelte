<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import { t } from '$lib/i18n';
  import Rules3DViewport from './components/Rules3DViewport.svelte';
  import HUD from './components/HUD.svelte';
  import AgentPanel from './components/AgentPanel.svelte';
  import RulesPanel from './components/RulesPanel.svelte';
</script>

<svelte:head>
  <title>RULES3D | {$t('nav.play')} | {$t('app.title')}</title>
</svelte:head>

<div class="page">
  <div class="header">
    <a href="/play" class="back-link"><ArrowLeft size={16} />{$t('games.back')}</a>
    <h2>RULES3D</h2>
  </div>
  <div class="layout">
    <div class="left"><Rules3DViewport /></div>
    <div class="right"><HUD /><RulesPanel /><AgentPanel /></div>
  </div>
</div>

<style>
.page{flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--color-bg)}
.header{display:flex;align-items:center;gap:14px;padding:16px 24px;border-bottom:1px solid var(--color-border)}
.back-link{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--color-text-muted);text-decoration:none;padding:5px 10px;border-radius:6px}
.back-link:hover{background:var(--color-surface-hover);color:var(--color-primary)}
h2{margin:0;font-size:16px}
.layout{flex:1;display:grid;grid-template-columns:1fr 320px;gap:16px;padding:20px;min-height:0}
.right{display:flex;flex-direction:column;gap:12px;overflow:auto}
@media(max-width:960px){.layout{grid-template-columns:1fr}}
</style>
