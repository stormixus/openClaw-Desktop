<script lang="ts">
  import { onDestroy } from 'svelte';
  import { kt } from './i18n';
  import { createBoard, legalMoves, applyMove, winner, aiPick, type Board } from './engine';
  import { clearCheckersState, loadCheckersState, saveCheckersState } from './state';

  const restored = loadCheckersState();
  let board = $state<Board>(restored?.board ?? createBoard());
  let turn = $state<'w'|'b'>(restored?.turn ?? 'w');
  let moveList = $state<string[]>(restored?.moveList ?? []);
  let useAgent = $state(restored?.useAgent ?? true);
  let selected = $state<[number,number] | null>(null);
  let targets = $state<string[]>([]);

  const win = $derived(winner(board));
  const status = $derived(win ? (win==='w' ? $kt('win') : $kt('lose')) : (turn==='w' ? $kt('your_turn') : $kt('ai_turn')));

  function cellKey(x:number,y:number){ return `${x},${y}`; }

  function refreshTargets() {
    if (!selected) { targets=[]; return; }
    const [sx,sy] = selected;
    const all = legalMoves(board, turn);
    targets = all.filter(m => m.from[0]===sx && m.from[1]===sy).map(m => cellKey(m.to[0],m.to[1]));
  }

  function clickCell(x:number,y:number) {
    if (win || turn!=='w') return;
    const k = cellKey(x,y);
    const piece = board[y][x];
    if (selected && targets.includes(k)) {
      const mv = legalMoves(board,'w').find(m => m.from[0]===selected![0] && m.from[1]===selected![1] && m.to[0]===x && m.to[1]===y);
      if (!mv) return;
      board = applyMove(board,mv);
      moveList = [...moveList, `${String.fromCharCode(97+mv.from[0])}${8-mv.from[1]}-${String.fromCharCode(97+mv.to[0])}${8-mv.to[1]}`];
      selected=null; targets=[]; turn='b';
      aiTurn();
      return;
    }
    if (piece?.c==='w') { selected=[x,y]; refreshTargets(); }
    else { selected=null; targets=[]; }
  }

  async function aiTurn() {
    if (!useAgent || win) return;
    await new Promise(r=>setTimeout(r,400));
    const mv = aiPick(board,'b');
    if (!mv) return;
    board = applyMove(board,mv);
    moveList = [...moveList, `${String.fromCharCode(97+mv.from[0])}${8-mv.from[1]}-${String.fromCharCode(97+mv.to[0])}${8-mv.to[1]}`];
    turn='w';
  }

  function newGame(){ board=createBoard(); turn='w'; moveList=[]; selected=null; targets=[]; clearCheckersState(); }

  onDestroy(() => {
    if (!winner(board)) saveCheckersState({ board, turn, moveList, useAgent });
    else clearCheckersState();
  });
</script>

<div class="wrap">
  <div class="board">
    {#each Array.from({length:8}) as _, y}
      {#each Array.from({length:8}) as __, x}
        {@const p = board[y][x]}
        {@const dark = (x+y)%2===1}
        {@const sel = selected && selected[0]===x && selected[1]===y}
        {@const tgt = targets.includes(`${x},${y}`)}
        <button class="cell" class:dark class:sel class:tgt onclick={() => clickCell(x,y)}>
          {#if p}
            <span class="piece" class:black={p.c==='b'} class:king={p.k}></span>
          {/if}
        </button>
      {/each}
    {/each}
  </div>

  <div class="panel">
    <div class="status">{status}</div>
    <div class="toggle">
      <button class:active={useAgent} onclick={() => useAgent=true}>{$kt('agent')}</button>
      <button class:active={!useAgent} onclick={() => useAgent=false}>{$kt('offline')}</button>
    </div>
    <button class="new" onclick={newGame}>{$kt('new_game')}</button>
    <div class="moves"><b>{$kt('moves')}</b> {moveList.join(' ')}</div>
  </div>
</div>

<style>
  .wrap{display:flex;gap:16px;width:100%;height:100%;min-height:520px}
  .board{display:grid;grid-template-columns:repeat(8,1fr);width:min(72vh,560px);aspect-ratio:1;border:2px solid #3d2b1f;border-radius:10px;overflow:hidden}
  .cell{border:0;background:#f0d9b5;display:grid;place-items:center}
  .cell.dark{background:#b58863}
  .cell.sel{box-shadow:inset 0 0 0 3px #6366f1}
  .cell.tgt{box-shadow:inset 0 0 0 3px #22c55e}
  .piece{width:70%;height:70%;border-radius:50%;background:#efefef;box-shadow: inset 0 -5px 0 rgba(0,0,0,.12)}
  .piece.black{background:#1f2937}
  .piece.king{outline:3px solid #fbbf24;outline-offset:-6px}
  .panel{flex:1;min-width:240px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px}
  .status{font-weight:600}
  .toggle{display:flex;gap:8px}.toggle button{flex:1}
  button{padding:8px 10px;border-radius:8px;border:1px solid var(--color-border);background:var(--color-surface-elevated)}
  button.active{background:var(--color-primary);color:white}
  .moves{font-size:12px;color:var(--color-text-muted);line-height:1.5}
  @media(max-width:900px){.wrap{flex-direction:column}.board{width:100%}}
</style>
