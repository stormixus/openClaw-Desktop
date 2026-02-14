<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { watchSceneTheme } from '../themeScene';
  import { nonogramStore, fillCell, markCell } from '../store/nonogramStore';

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let raf = 0;

  const tileMeshes = new Map<string, THREE.Mesh>();
  const rowClueSprites = new Map<number, THREE.Sprite>();
  const colClueSprites = new Map<number, THREE.Sprite>();
  const markSprites = new Map<string, THREE.Sprite>();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let unsub: (() => void) | null = null;
  let cleanupTheme: (() => void) | null = null;

  let originX = 0;
  let originZ = 0;
  const SPACING = 1.05;

  function key(x: number, y: number) {
    return `${x},${y}`;
  }

  function gridToWorld(x: number, y: number) {
    return { X: originX + x * SPACING, Z: originZ + y * SPACING };
  }

  function makeClueSprite(clue: number[]): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#e0e7ff';
    ctx.font = 'bold 48px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = clue.join(' ');
    ctx.fillText(text, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    return new THREE.Sprite(mat);
  }

  function makeXSprite(): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(108, 108);
    ctx.moveTo(108, 20);
    ctx.lineTo(20, 108);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    return new THREE.Sprite(mat);
  }

  function rebuildBoard() {
    const s = $nonogramStore;
    originX = -((s.width - 1) * SPACING) / 2;
    originZ = -((s.height - 1) * SPACING) / 2;

    // Clear existing meshes
    for (const m of tileMeshes.values()) scene.remove(m);
    for (const sp of rowClueSprites.values()) scene.remove(sp);
    for (const sp of colClueSprites.values()) scene.remove(sp);
    for (const sp of markSprites.values()) scene.remove(sp);
    tileMeshes.clear();
    rowClueSprites.clear();
    colClueSprites.clear();
    markSprites.clear();

    const emptyMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });

    // Create tiles
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.95), emptyMat.clone());
        const w = gridToWorld(x, y);
        mesh.position.set(w.X, 0.15, w.Z);
        mesh.userData = { x, y };
        scene.add(mesh);
        tileMeshes.set(key(x, y), mesh);
      }
    }

    // Add row clues (on the left)
    for (let y = 0; y < s.height; y++) {
      const sp = makeClueSprite(s.rowClues[y]);
      const w = gridToWorld(-1, y);
      sp.position.set(w.X - 1.2, 0.5, w.Z);
      sp.scale.set(1.5, 0.75, 1);
      scene.add(sp);
      rowClueSprites.set(y, sp);
    }

    // Add column clues (on the top)
    for (let x = 0; x < s.width; x++) {
      const sp = makeClueSprite(s.colClues[x]);
      const w = gridToWorld(x, -1);
      sp.position.set(w.X, 0.5, w.Z - 1.2);
      sp.scale.set(1.5, 0.75, 1);
      scene.add(sp);
      colClueSprites.set(x, sp);
    }
  }

  function updateVisuals() {
    const s = $nonogramStore;

    // Clear mark sprites
    for (const sp of markSprites.values()) scene.remove(sp);
    markSprites.clear();

    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const cellState = s.grid[y][x];
        const k = key(x, y);
        const tile = tileMeshes.get(k)!;
        const mat = tile.material as THREE.MeshStandardMaterial;

        if (cellState === 'empty') {
          mat.color.setHex(0x475569);
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
          tile.position.y = 0.15;
        } else if (cellState === 'filled') {
          mat.color.setHex(0x6366f1);
          mat.emissive.setHex(0x4f46e5);
          mat.emissiveIntensity = 0.3;
          tile.position.y = 0.08;
        } else if (cellState === 'marked') {
          mat.color.setHex(0x64748b);
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
          tile.position.y = 0.15;

          // Add X sprite
          const xSprite = makeXSprite();
          const w = gridToWorld(x, y);
          xSprite.position.set(w.X, 0.5, w.Z);
          xSprite.scale.set(0.7, 0.7, 0.7);
          scene.add(xSprite);
          markSprites.set(k, xSprite);
        }
      }
    }
  }

  function pick(e: MouseEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...tileMeshes.values()], false);
    if (!hits.length) return null;
    const x = hits[0].object.userData.x as number;
    const y = hits[0].object.userData.y as number;
    return { x, y };
  }

  function onClick(e: MouseEvent) {
    const p = pick(e);
    if (!p) return;
    fillCell(p.x, p.y);
  }

  function onContext(e: MouseEvent) {
    e.preventDefault();
    const p = pick(e);
    if (!p) return;
    markCell(p.x, p.y);
  }

  onMount(() => {
    scene = new THREE.Scene();
    cleanupTheme = watchSceneTheme(scene);

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    camera.position.set(0, 12, 10);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth || 900, container.clientHeight || 560);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.15;
    controls.maxPolarAngle = Math.PI * 0.45;
    controls.minDistance = 8;
    controls.maxDistance = 50;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const d = new THREE.DirectionalLight(0xffffff, 0.8);
    d.position.set(8, 20, 6);
    scene.add(d);

    unsub = nonogramStore.subscribe(() => {
      if (
        !tileMeshes.size ||
        tileMeshes.size !== $nonogramStore.width * $nonogramStore.height
      ) {
        rebuildBoard();
      }
      updateVisuals();
    });

    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('contextmenu', onContext);

    const onResize = () => {
      const w = container.clientWidth || 900;
      const h = container.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    onResize();

    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => window.removeEventListener('resize', onResize);
  });

  onDestroy(() => {
    unsub?.();
    cleanupTheme?.();
    cancelAnimationFrame(raf);
    renderer?.domElement?.removeEventListener('click', onClick);
    renderer?.domElement?.removeEventListener('contextmenu', onContext);
    controls?.dispose();
    renderer?.dispose();
  });
</script>

<div class="viewport" bind:this={container}></div>

<style>
  .viewport {
    width: 100%;
    height: 100%;
    min-height: 560px;
    border-radius: 12px;
    overflow: hidden;
    background: var(--color-bg);
  }
</style>
