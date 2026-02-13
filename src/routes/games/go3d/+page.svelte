<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft } from '@lucide/svelte';
  import { t } from '$lib/i18n';
  import Go3DViewport from '$lib/go3d/components/Go3DViewport.svelte';
  import HUD from '$lib/go3d/components/HUD.svelte';
  import AgentPanel from '$lib/go3d/components/AgentPanel.svelte';
  import { GO_PUZZLES } from '$lib/go3d/puzzles';
  import { loadPuzzle } from '$lib/go3d/store/go3dStore';

  const puzzle = GO_PUZZLES[0];
  onMount(() => loadPuzzle(puzzle));
</script>

<svelte:head>
  <title>3D Go Puzzle | {$t('nav.games')} | {$t('app.title')}</title>
</svelte:head>

<div class="page">
  <div class="header">
    <a href="/games" class="back-link"><ArrowLeft size={16} />{$t('games.back')}</a>
    <h2>3D Go Puzzle</h2>
  </div>

  <div class="layout">
    <div class="left"><Go3DViewport {puzzle} /></div>
    <div class="right">
      <HUD {puzzle} />
      <AgentPanel />
    </div>
  </div>
</div>

<style>
  .page { flex:1; display:flex; flex-direction:column; overflow:hidden; background:var(--color-bg); }
  .header { display:flex; align-items:center; gap:14px; padding:16px 24px; border-bottom:1px solid var(--color-border); }
  .back-link { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:500; color:var(--color-text-muted); text-decoration:none; padding:5px 10px; border-radius:6px; }
  .back-link:hover { background:var(--color-surface-hover); color:var(--color-primary); }
  .header h2 { margin:0; font-size:16px; }
  .layout { flex:1; display:grid; grid-template-columns: 1fr 300px; gap:16px; padding:20px; min-height:0; }
  .left { min-width:0; }
  .right { display:flex; flex-direction:column; gap:12px; overflow:auto; }
  @media (max-width:900px){ .layout{ grid-template-columns:1fr; } }
</style>
