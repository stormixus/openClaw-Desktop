<script lang="ts">
  import Sokoban3DViewport from './components/Sokoban3DViewport.svelte';
  import HUD from './components/HUD.svelte';
  import AgentPanel from './components/AgentPanel.svelte';
</script>

<svelte:head>
  <title>Sokoban 3D - openClaw</title>
</svelte:head>

<div class="page-container">
  <header class="page-header">
    <a href="/play" class="back-link">
      ← Back to Games
    </a>
    <h1>Sokoban 3D</h1>
  </header>

  <main class="game-layout">
    <div class="viewport-container">
      <Sokoban3DViewport />
    </div>

    <aside class="sidebar">
      <HUD />
      <AgentPanel />
    </aside>
  </main>
</div>

<style>
  .page-container {
    width: 100%;
    min-height: 100vh;
    background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
    padding: 2rem;
  }

  .page-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .back-link {
    color: rgba(255, 255, 255, 0.7);
    text-decoration: none;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: white;
  }

  .page-header h1 {
    margin: 0;
    font-size: 2rem;
    font-weight: bold;
    color: white;
  }

  .game-layout {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: 2rem;
    height: calc(100vh - 8rem);
  }

  .viewport-container {
    background: rgba(15, 15, 26, 0.5);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    overflow-y: auto;
  }

  @media (max-width: 1024px) {
    .game-layout {
      grid-template-columns: 1fr;
      height: auto;
    }

    .viewport-container {
      height: 60vh;
    }
  }
</style>
