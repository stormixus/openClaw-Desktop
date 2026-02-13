<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { mines3dStore, revealAt, toggleFlagAt, setHover, clearHover, chordAt } from '$lib/mines3d/store/mines3dStore';

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let raf = 0;

  const tileMeshes = new Map<string, THREE.Mesh>();
  const numberSprites = new Map<string, THREE.Sprite>();
  const highlightMeshes: THREE.Object3D[] = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let unsub: (() => void) | null = null;

  let originX = 0;
  let originZ = 0;
  const SPACING = 1.05;

  function key(x: number, y: number) { return `${x},${y}`; }
  function gridToWorld(x: number, y: number) { return { X: originX + x * SPACING, Z: originZ + y * SPACING }; }

  function makeNumberSprite(n: number) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 128, 128);
    const colors = ['#000', '#3b82f6', '#16a34a', '#dc2626', '#7c3aed', '#ea580c', '#0f766e', '#111827', '#475569'];
    ctx.fillStyle = colors[n] ?? '#111';
    ctx.font = 'bold 92px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 64, 70);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    return new THREE.Sprite(mat);
  }

  function rebuildBoard() {
    const s = $mines3dStore;
    originX = -((s.width - 1) * SPACING) / 2;
    originZ = -((s.height - 1) * SPACING) / 2;

    for (const m of tileMeshes.values()) scene.remove(m);
    for (const sp of numberSprites.values()) scene.remove(sp);
    tileMeshes.clear(); numberSprites.clear();

    const hiddenMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 });

    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.95), hiddenMat.clone());
        const w = gridToWorld(x, y);
        mesh.position.set(w.X, 0.15, w.Z);
        mesh.userData = { x, y };
        scene.add(mesh);
        tileMeshes.set(key(x, y), mesh);
      }
    }
  }

  function updateVisuals() {
    const s = $mines3dStore;

    for (const h of highlightMeshes) scene.remove(h);
    highlightMeshes.length = 0;

    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const c = s.grid[y][x];
        const k = key(x, y);
        const tile = tileMeshes.get(k)!;
        const mat = tile.material as THREE.MeshStandardMaterial;

        if (!c.revealed) {
          mat.color.setHex(0x64748b);
          tile.position.y = 0.15;
        } else {
          tile.position.y = 0.08;
          if (c.mine) mat.color.setHex(0xef4444);
          else mat.color.setHex(0xd1d5db);
        }

        if (c.flagged && !c.revealed) {
          mat.color.setHex(0xf59e0b);
        }

        const old = numberSprites.get(k);
        if (old) { scene.remove(old); numberSprites.delete(k); }
        if (c.revealed && !c.mine && c.adj > 0) {
          const sp = makeNumberSprite(c.adj);
          const w = gridToWorld(x, y);
          sp.position.set(w.X, 0.36, w.Z);
          sp.scale.set(0.55, 0.55, 0.55);
          scene.add(sp);
          numberSprites.set(k, sp);
        }
      }
    }

    for (const hl of s.highlights) {
      const w = gridToWorld(hl.x, hl.y);
      if (hl.type === 'candidateSafe' || hl.type === 'candidateMine') {
        const color = hl.type === 'candidateSafe' ? 0x22c55e : 0xef4444;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 12, 28), new THREE.MeshBasicMaterial({ color }));
        ring.position.set(w.X, 0.32, w.Z);
        ring.rotation.x = Math.PI / 2;
        scene.add(ring);
        highlightMeshes.push(ring);
      }
      if (hl.type === 'region') {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(Math.max(0.5, hl.r - 0.15), hl.r + 0.15, 42),
          new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
        );
        ring.position.set(w.X, 0.28, w.Z);
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);
        highlightMeshes.push(ring);
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

  function onMove(e: MouseEvent) {
    const p = pick(e);
    if (!p) return clearHover();
    setHover(p.x, p.y, true);
  }

  function onClick(e: MouseEvent) {
    const p = pick(e);
    if (!p) return;
    if (e.shiftKey) chordAt(p.x, p.y);
    else revealAt(p.x, p.y);
  }

  function onContext(e: MouseEvent) {
    e.preventDefault();
    const p = pick(e);
    if (!p) return;
    toggleFlagAt(p.x, p.y);
  }

  onMount(() => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1020);

    camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
    camera.position.set(0, 16, 14);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth || 900, container.clientHeight || 560);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.maxPolarAngle = Math.PI * 0.42;
    controls.minDistance = 10;
    controls.maxDistance = 60;

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const d = new THREE.DirectionalLight(0xffffff, 0.9);
    d.position.set(10, 24, 8);
    scene.add(d);

    unsub = mines3dStore.subscribe(() => {
      if (!tileMeshes.size || tileMeshes.size !== $mines3dStore.width * $mines3dStore.height) rebuildBoard();
      updateVisuals();
    });

    renderer.domElement.addEventListener('mousemove', onMove);
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
    cancelAnimationFrame(raf);
    renderer?.domElement?.removeEventListener('mousemove', onMove);
    renderer?.domElement?.removeEventListener('click', onClick);
    renderer?.domElement?.removeEventListener('contextmenu', onContext);
    controls?.dispose();
    renderer?.dispose();
  });
</script>

<div class="viewport" bind:this={container}></div>

<style>
  .viewport{width:100%;height:100%;min-height:560px;border-radius:12px;overflow:hidden;background:#0b1020}
</style>
