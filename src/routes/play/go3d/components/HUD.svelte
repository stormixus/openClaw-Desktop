<script lang="ts">
  import { Bot, Cpu, Swords, RotateCcw, Undo2, Flag, Hand } from '@lucide/svelte';
  import {
    go3dStore,
    BOARD_SIZES,
    newGoGame,
    setMode,
    setAvaGateway,
    pass,
    resign,
    undo,
    startAva,
    stopAva,
    type BoardSize,
  } from '../store/go3dStore';
  import { store as gwStore } from '$lib/gateway/store.svelte';

  const connectedGateways = $derived(
    gwStore.gateways.filter((g) => {
      const state = gwStore.gatewayStates.get(g.id);
      return state?.status === 'connected';
    }),
  );
  const canAva = $derived(connectedGateways.length >= 2);
</script>

<div class="hud">
  <!-- Mode Toggle -->
  <div class="section">
    <span class="label">Mode</span>
    <div class="toggle">
      <button
        class="mode-btn"
        class:active={$go3dStore.gameMode === 'agent'}
        onclick={() => setMode('agent')}
        disabled={$go3dStore.aiThinking}
      >
        <Bot size={13} /> Agent
      </button>
      <button
        class="mode-btn"
        class:active={$go3dStore.gameMode === 'offline'}
        onclick={() => setMode('offline')}
        disabled={$go3dStore.aiThinking}
      >
        <Cpu size={13} /> Offline
      </button>
      {#if canAva}
        <button
          class="mode-btn"
          class:active={$go3dStore.gameMode === 'ava'}
          onclick={() => setMode('ava')}
          disabled={$go3dStore.aiThinking}
        >
          <Swords size={13} /> AvA
        </button>
      {/if}
    </div>
  </div>

  <!-- AvA Config -->
  {#if $go3dStore.gameMode === 'ava'}
    <div class="section ava">
      <span class="label">Agent vs Agent</span>
      <div class="ava-row">
        <span class="ava-side">Black</span>
        <select
          class="ava-select"
          value={$go3dStore.avaBlackGw}
          onchange={(e) => setAvaGateway('black', (e.target as HTMLSelectElement).value)}
          disabled={$go3dStore.avaRunning}
        >
          <option value="">Select gateway...</option>
          {#each connectedGateways as gw}
            <option value={gw.id}>{gw.name || gw.url}</option>
          {/each}
        </select>
      </div>
      <div class="ava-row">
        <span class="ava-side">White</span>
        <select
          class="ava-select"
          value={$go3dStore.avaWhiteGw}
          onchange={(e) => setAvaGateway('white', (e.target as HTMLSelectElement).value)}
          disabled={$go3dStore.avaRunning}
        >
          <option value="">Select gateway...</option>
          {#each connectedGateways as gw}
            <option value={gw.id}>{gw.name || gw.url}</option>
          {/each}
        </select>
      </div>
      <div class="ava-ctrl">
        {#if $go3dStore.avaRunning}
          <button class="ava-stop" onclick={stopAva}>Stop</button>
        {:else}
          <button
            class="ava-start"
            onclick={startAva}
            disabled={!$go3dStore.avaBlackGw || !$go3dStore.avaWhiteGw}
          >Start Match</button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Board Size -->
  <div class="section">
    <span class="label">Board</span>
    <div class="toggle">
      {#each BOARD_SIZES as s}
        <button
          class="mode-btn"
          class:active={$go3dStore.size === s}
          onclick={() => newGoGame(s as BoardSize)}
          disabled={$go3dStore.aiThinking || $go3dStore.avaRunning}
        >
          {s}x{s}
        </button>
      {/each}
    </div>
  </div>

  <!-- Status -->
  <div class="status" class:thinking={$go3dStore.aiThinking} class:ended={$go3dStore.status === 'ended'}>
    {#if $go3dStore.aiThinking}
      <span class="pulse"></span>
    {/if}
    {#if $go3dStore.status === 'ended'}
      {$go3dStore.winReason}
    {:else if $go3dStore.aiThinking}
      {$go3dStore.gameMode === 'ava'
        ? ($go3dStore.turn === 1 ? 'Black thinking...' : 'White thinking...')
        : 'AI thinking...'}
    {:else}
      {$go3dStore.turn === 1 ? 'Black' : 'White'} to play
    {/if}
  </div>

  <!-- Score / Captures -->
  <div class="captures">
    <span>Captures: B {$go3dStore.capturedByBlack} / W {$go3dStore.capturedByWhite}</span>
    {#if $go3dStore.score}
      <span>Score: B {$go3dStore.score.black} / W {$go3dStore.score.white}</span>
    {/if}
  </div>

  <!-- Move list -->
  <div class="section moves">
    <span class="label">Moves ({$go3dStore.moveList.length})</span>
    <div class="move-list">
      {#if $go3dStore.moveList.length === 0}
        <span class="empty">—</span>
      {:else}
        {#each $go3dStore.moveList as move, i}
          {#if i % 2 === 0}
            <span class="move-pair">
              <span class="move-num">{Math.floor(i / 2) + 1}.</span>
              <span class="move-b">{move}</span>
              {#if $go3dStore.moveList[i + 1]}
                <span class="move-w">{$go3dStore.moveList[i + 1]}</span>
              {/if}
            </span>
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <!-- Controls -->
  <div class="controls">
    {#if $go3dStore.gameMode !== 'ava' && $go3dStore.status === 'playing'}
      <button class="ctrl-btn" onclick={pass} disabled={$go3dStore.aiThinking}>
        <Hand size={13} /> Pass
      </button>
      <button class="ctrl-btn danger" onclick={resign} disabled={$go3dStore.aiThinking}>
        <Flag size={13} /> Resign
      </button>
    {/if}
    <button class="ctrl-btn" onclick={undo} disabled={$go3dStore.aiThinking || $go3dStore.avaRunning || $go3dStore.history.length <= 1}>
      <Undo2 size={13} /> Undo
    </button>
    <button class="ctrl-btn" onclick={() => newGoGame($go3dStore.size as BoardSize)} disabled={$go3dStore.aiThinking && !$go3dStore.avaRunning}>
      <RotateCcw size={13} /> New
    </button>
  </div>
</div>

<style>
  .hud { display:flex; flex-direction:column; gap:10px; padding:14px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-surface); }
  .section { display:flex; flex-direction:column; gap:5px; }
  .label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--color-text-subtle); }
  .toggle { display:flex; gap:4px; background:var(--color-surface-elevated); border-radius:8px; padding:3px; }
  .mode-btn { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:5px 6px; font-size:11px; font-weight:600; border:none; border-radius:6px; background:transparent; color:var(--color-text-muted); cursor:pointer; transition:all 120ms; }
  .mode-btn.active { background:var(--color-primary); color:white; }
  .mode-btn:disabled { opacity:0.4; cursor:not-allowed; }

  .ava { gap:6px; }
  .ava-row { display:flex; align-items:center; gap:6px; }
  .ava-side { font-size:11px; font-weight:600; width:36px; }
  .ava-select { flex:1; font-size:11px; padding:4px 6px; border-radius:6px; border:1px solid var(--color-border); background:var(--color-surface-elevated); color:var(--color-text); }
  .ava-ctrl { display:flex; gap:6px; }
  .ava-start, .ava-stop { flex:1; padding:6px; font-size:11px; font-weight:600; border-radius:6px; border:none; cursor:pointer; }
  .ava-start { background:var(--color-primary); color:white; }
  .ava-start:disabled { opacity:0.4; cursor:not-allowed; }
  .ava-stop { background:#ef4444; color:white; }

  .status { padding:8px 10px; border-radius:8px; font-size:12px; font-weight:600; background:var(--color-surface-elevated); display:flex; align-items:center; gap:6px; }
  .status.thinking { color:var(--color-primary); }
  .status.ended { color:#ef4444; }
  .pulse { width:8px; height:8px; border-radius:50%; background:var(--color-primary); animation:blink 1s infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

  .captures { font-size:11px; color:var(--color-text-muted); display:flex; flex-direction:column; gap:2px; }

  .moves { max-height:120px; overflow:auto; }
  .move-list { display:flex; flex-wrap:wrap; gap:2px 8px; font-size:11px; font-family:monospace; }
  .move-pair { display:inline-flex; gap:3px; }
  .move-num { color:var(--color-text-subtle); }
  .move-b { font-weight:600; }
  .move-w { color:var(--color-text-muted); }
  .empty { color:var(--color-text-subtle); }

  .controls { display:flex; flex-wrap:wrap; gap:6px; }
  .ctrl-btn { display:inline-flex; align-items:center; gap:4px; padding:6px 10px; font-size:11px; font-weight:600; border-radius:8px; border:1px solid var(--color-border); background:var(--color-surface-elevated); color:var(--color-text); cursor:pointer; transition:all 120ms; }
  .ctrl-btn:hover:not(:disabled) { background:var(--color-surface-hover); }
  .ctrl-btn:disabled { opacity:0.4; cursor:not-allowed; }
  .ctrl-btn.danger { color:#ef4444; border-color:#ef4444; }
  .ctrl-btn.danger:hover:not(:disabled) { background:#ef44441a; }
</style>
