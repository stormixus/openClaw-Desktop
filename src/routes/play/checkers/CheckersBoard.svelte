<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { watchSceneTheme } from './themeScene';
  import { locale } from '$lib/i18n';
  import { kt } from './i18n';
  import { createBoard, legalMoves, applyMove, winner, aiPick, buildCheckersPrompt, parseCheckersMove, type Board } from './engine';
  import { clearCheckersState, loadCheckersState, saveCheckersState } from './state';
  import { store, getActiveClient } from '$lib/gateway/store.svelte';

  const restored = loadCheckersState();
  let board = $state<Board>(restored?.board ?? createBoard());
  let turn = $state<'w'|'b'>(restored?.turn ?? 'w');
  let moveList = $state<string[]>(restored?.moveList ?? []);
  let useAgent = $state(restored?.useAgent ?? true);
  let selected = $state<[number,number] | null>(null);
  let targets = $state<string[]>([]);
  let thinking = $state(false);
  let commentary = $state('');

  const win = $derived(winner(board));
  const status = $derived(
    thinking ? ($kt('ai_turn') + '...')
    : win ? (win==='w' ? $kt('win') : $kt('lose'))
    : (turn==='w' ? $kt('your_turn') : $kt('ai_turn'))
  );

  function cellKey(x:number,y:number){ return `${x},${y}`; }

  function refreshTargets() {
    if (!selected) { targets=[]; return; }
    const [sx,sy] = selected;
    const all = legalMoves(board, turn);
    targets = all.filter(m => m.from[0]===sx && m.from[1]===sy).map(m => cellKey(m.to[0],m.to[1]));
  }

  function clickCell(x:number,y:number) {
    if (win || turn!=='w' || thinking) return;
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

    const client = getActiveClient();
    if (client && store.activeGatewayId) {
      thinking = true;
      try {
        const prompt = buildCheckersPrompt(board, 'b', moveList, $locale);
        const sessKey = `checkers-${crypto.randomUUID().slice(0, 8)}`;
        await client.sendChat({
          sessionKey: sessKey,
          message: prompt,
          idempotencyKey: crypto.randomUUID(),
          deliver: false,
        });

        let response = '';
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const hist = await client.getChatHistory(sessKey);
            const assist = hist.find((m: any) => m.role === 'assistant');
            if (assist?.content) { response = assist.content; break; }
          } catch { /* keep polling */ }
        }

        if (response) {
          const mv = parseCheckersMove(response, board, 'b');
          if (mv) {
            board = applyMove(board, mv);
            moveList = [...moveList, `${String.fromCharCode(97+mv.from[0])}${8-mv.from[1]}-${String.fromCharCode(97+mv.to[0])}${8-mv.to[1]}`];
            // Extract commentary (remove the move notation from response)
            const movePattern = /[a-h][1-8]\s*[-x\s]\s*[a-h][1-8]/gi;
            commentary = response.replace(movePattern, '').replace(/^\s*[.:,\s]+/, '').trim().slice(0, 200);
            turn = 'w';
            thinking = false;
            return;
          }
        }
      } catch { /* fall through to random */ }
      thinking = false;
    }

    // Fallback: random move
    await new Promise(r => setTimeout(r, 400));
    const mv = aiPick(board, 'b');
    if (!mv) return;
    board = applyMove(board, mv);
    moveList = [...moveList, `${String.fromCharCode(97+mv.from[0])}${8-mv.from[1]}-${String.fromCharCode(97+mv.to[0])}${8-mv.to[1]}`];
    commentary = '';
    turn = 'w';
  }

  function newGame(){ board=createBoard(); turn='w'; moveList=[]; selected=null; targets=[]; commentary=''; clearCheckersState(); }

  onDestroy(() => {
    if (!winner(board)) saveCheckersState({ board, turn, moveList, useAgent });
    else clearCheckersState();
  });

  // =============================================================================
  // Three.js 3D Rendering
  // =============================================================================

  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let raycaster: THREE.Raycaster;
  let mouse: THREE.Vector2;
  let cleanupTheme: (() => void) | null = null;

  // Meshes
  let boardMesh: THREE.Group;
  let pieceMeshes: Map<string, THREE.Group> = new Map();
  let highlightMeshes: THREE.Group;

  const SQUARE_SIZE = 1;
  const BOARD_OFFSET = -3.5; // Center the board at origin

  function createBoard3D() {
    boardMesh = new THREE.Group();

    // Create frame/border
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
    const frameThickness = 0.3;
    const frameHeight = 0.2;

    // Top frame
    const topFrame = new THREE.Mesh(
      new THREE.BoxGeometry(8 + frameThickness * 2, frameHeight, frameThickness),
      frameMaterial
    );
    topFrame.position.set(BOARD_OFFSET + 4, -frameHeight/2, BOARD_OFFSET - frameThickness/2);
    boardMesh.add(topFrame);

    // Bottom frame
    const bottomFrame = new THREE.Mesh(
      new THREE.BoxGeometry(8 + frameThickness * 2, frameHeight, frameThickness),
      frameMaterial
    );
    bottomFrame.position.set(BOARD_OFFSET + 4, -frameHeight/2, BOARD_OFFSET + 8 + frameThickness/2);
    boardMesh.add(bottomFrame);

    // Left frame
    const leftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, frameHeight, 8),
      frameMaterial
    );
    leftFrame.position.set(BOARD_OFFSET - frameThickness/2, -frameHeight/2, BOARD_OFFSET + 4);
    boardMesh.add(leftFrame);

    // Right frame
    const rightFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, frameHeight, 8),
      frameMaterial
    );
    rightFrame.position.set(BOARD_OFFSET + 8 + frameThickness/2, -frameHeight/2, BOARD_OFFSET + 4);
    boardMesh.add(rightFrame);

    // Create 64 squares
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const isDark = (x + y) % 2 === 1;
        const squareColor = isDark ? 0xb58863 : 0xf0d9b5;

        const squareGeometry = new THREE.BoxGeometry(SQUARE_SIZE, 0.1, SQUARE_SIZE);
        const squareMaterial = new THREE.MeshStandardMaterial({ color: squareColor });
        const square = new THREE.Mesh(squareGeometry, squareMaterial);

        square.position.set(
          BOARD_OFFSET + x + 0.5,
          -0.05,
          BOARD_OFFSET + y + 0.5
        );

        // Add user data for raycasting
        square.userData = { type: 'square', x, y };

        boardMesh.add(square);
      }
    }

    scene.add(boardMesh);
  }

  function createPieceMesh(color: 'w' | 'b', isKing: boolean): THREE.Group {
    const group = new THREE.Group();

    // Main piece cylinder
    const pieceGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.15, 32);
    const pieceColor = color === 'w' ? 0xefefef : 0x1f2937;
    const pieceMaterial = new THREE.MeshStandardMaterial({
      color: pieceColor,
      roughness: 0.5,
      metalness: 0.1
    });
    const pieceMesh = new THREE.Mesh(pieceGeometry, pieceMaterial);
    pieceMesh.castShadow = true;
    pieceMesh.receiveShadow = true;
    group.add(pieceMesh);

    // King crown
    if (isKing) {
      const crownGeometry = new THREE.TorusGeometry(0.25, 0.04, 16, 32);
      const crownMaterial = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.3,
        metalness: 0.7
      });
      const crown = new THREE.Mesh(crownGeometry, crownMaterial);
      crown.rotation.x = Math.PI / 2;
      crown.position.y = 0.1;
      group.add(crown);
    }

    return group;
  }

  function syncPieces3D() {
    // Remove all existing piece meshes
    pieceMeshes.forEach((mesh) => {
      scene.remove(mesh);
    });
    pieceMeshes.clear();

    // Add pieces based on current board state
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const piece = board[y][x];
        if (piece) {
          const pieceMesh = createPieceMesh(piece.c, piece.k);
          pieceMesh.position.set(
            BOARD_OFFSET + x + 0.5,
            0.15,
            BOARD_OFFSET + y + 0.5
          );
          pieceMesh.userData = { type: 'piece', x, y, color: piece.c };

          const key = cellKey(x, y);
          pieceMeshes.set(key, pieceMesh);
          scene.add(pieceMesh);
        }
      }
    }
  }

  function updateHighlights3D() {
    // Remove old highlights
    if (highlightMeshes) {
      scene.remove(highlightMeshes);
    }
    highlightMeshes = new THREE.Group();

    // Selected piece highlight
    if (selected) {
      const [sx, sy] = selected;
      const ringGeometry = new THREE.TorusGeometry(0.45, 0.05, 16, 32);
      const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x6366f1,
        emissive: 0x6366f1,
        emissiveIntensity: 0.5
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(
        BOARD_OFFSET + sx + 0.5,
        0.05,
        BOARD_OFFSET + sy + 0.5
      );
      highlightMeshes.add(ring);
    }

    // Legal move target highlights
    targets.forEach(targetKey => {
      const [x, y] = targetKey.split(',').map(Number);
      const circleGeometry = new THREE.CircleGeometry(0.3, 32);
      const circleMaterial = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.6,
        emissive: 0x22c55e,
        emissiveIntensity: 0.3
      });
      const circle = new THREE.Mesh(circleGeometry, circleMaterial);
      circle.rotation.x = -Math.PI / 2;
      circle.position.set(
        BOARD_OFFSET + x + 0.5,
        0.06,
        BOARD_OFFSET + y + 0.5
      );
      highlightMeshes.add(circle);
    });

    scene.add(highlightMeshes);
  }

  function onClick3D(event: MouseEvent) {
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Check for intersections with pieces first
    const pieceMeshArray = Array.from(pieceMeshes.values());
    const pieceIntersects = raycaster.intersectObjects(pieceMeshArray, true);

    if (pieceIntersects.length > 0) {
      // Find the piece group (traverse up to find userData)
      let obj = pieceIntersects[0].object;
      while (obj.parent && !obj.userData.type) {
        obj = obj.parent;
      }
      if (obj.userData.type === 'piece') {
        clickCell(obj.userData.x, obj.userData.y);
        return;
      }
    }

    // Check for intersections with board squares
    const boardIntersects = raycaster.intersectObjects(boardMesh.children, false);
    if (boardIntersects.length > 0) {
      const obj = boardIntersects[0].object;
      if (obj.userData.type === 'square') {
        clickCell(obj.userData.x, obj.userData.y);
      }
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  function handleResize() {
    if (!container || !camera || !renderer) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  onMount(() => {
    // Initialize Three.js scene
    scene = new THREE.Scene();
    cleanupTheme = watchSceneTheme(scene);

    // Camera setup
    camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 12, 8);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI / 2.2; // Limit rotation to keep mostly top-down

    // Raycaster for mouse picking
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Create board
    createBoard3D();
    syncPieces3D();
    updateHighlights3D();

    // Event listeners
    renderer.domElement.addEventListener('click', onClick3D);
    window.addEventListener('resize', handleResize);

    // Start animation loop
    animate();
  });

  // Reactive effects to update 3D when state changes
  $effect(() => {
    if (scene) {
      syncPieces3D();
      updateHighlights3D();
    }
  });

  onDestroy(() => {
    cleanupTheme?.();
    if (renderer) {
      renderer.domElement.removeEventListener('click', onClick3D);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    }
    if (!winner(board)) saveCheckersState({ board, turn, moveList, useAgent });
    else clearCheckersState();
  });
</script>

<div class="wrap">
  <div class="viewport" bind:this={container}></div>

  <div class="panel">
    <div class="status">{status}</div>
    <div class="toggle">
      <button class:active={useAgent} onclick={() => useAgent=true}>{$kt('agent')}</button>
      <button class:active={!useAgent} onclick={() => useAgent=false}>{$kt('offline')}</button>
    </div>
    <button class="new" onclick={newGame}>{$kt('new_game')}</button>
    {#if commentary}
      <div class="commentary">{commentary}</div>
    {/if}
    {#if thinking}
      <div class="thinking"><span class="dot-pulse"></span></div>
    {/if}
    <div class="moves"><b>{$kt('moves')}</b> {moveList.join(' ')}</div>
  </div>
</div>

<style>
  .wrap{display:flex;gap:16px;width:100%;height:100%;min-height:520px}
  .viewport{flex:1;width:min(72vh,560px);aspect-ratio:1;border-radius:10px;overflow:hidden;background:var(--color-bg)}
  .panel{flex:1;min-width:240px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px}
  .status{font-weight:600}
  .toggle{display:flex;gap:8px}.toggle button{flex:1}
  button{padding:8px 10px;border-radius:8px;border:1px solid var(--color-border);background:var(--color-surface-elevated)}
  button.active{background:var(--color-primary);color:white}
  .commentary{font-size:12px;color:var(--color-text-muted);line-height:1.5;padding:8px;background:var(--color-surface-elevated);border-radius:6px;font-style:italic}
  .thinking{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--color-text-subtle)}
  .dot-pulse{width:6px;height:6px;border-radius:50%;background:var(--color-primary);animation:pulse 1s ease infinite}
  @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
  .moves{font-size:12px;color:var(--color-text-muted);line-height:1.5}
  @media(max-width:900px){.wrap{flex-direction:column}.viewport{width:100%}}
</style>
