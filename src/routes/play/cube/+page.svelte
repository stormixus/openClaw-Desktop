<script lang="ts">
  import CubeViewport from './components/CubeViewport.svelte';
  import HUD from './components/HUD.svelte';
  import AgentPanel from './components/AgentPanel.svelte';
  import { cubeStore } from './store/cubeStore';
</script>

<svelte:head>
  <title>Rubik's Cube - openClaw</title>
</svelte:head>

<div class="page">
  <header class="header">
    <h1>🧊 Rubik's Cube</h1>
    <p class="subtitle">Solve the classic 3x3x3 puzzle cube</p>
  </header>

  <div class="game-layout">
    <div class="viewport-container">
      <CubeViewport />
    </div>

    <div class="side-panel">
      <HUD />
      <AgentPanel />
    </div>
  </div>
</div>

<style>
  .page {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    color: white;
    overflow: hidden;
  }

  .header {
    padding: 1.5rem 2rem;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header h1 {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
  }

  .subtitle {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .game-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: 1rem;
    padding: 1rem;
    overflow: hidden;
  }

  .viewport-container {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
  }

  .side-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
  }

  @media (max-width: 1024px) {
    .game-layout {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }

    .side-panel {
      max-height: 400px;
    }
  }
</style>
