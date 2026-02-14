<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { watchSceneTheme } from '../themeScene';
  import { get } from 'svelte/store';
  import { go3dStore, hoverAt, clearHover, placeStone } from '../store/go3dStore';

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let raf = 0;
  let unsubscribe: (() => void) | null = null;
  let cleanupTheme: (() => void) | null = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const stoneMeshes = new Map<string, THREE.Mesh>();
  const overlayMeshes: THREE.Object3D[] = [];
  let boardGroup: THREE.Group | null = null;
  let currentSize = 0;

  // Star points for standard Go boards
  const STAR_POINTS: Record<number, [number, number][]> = {
    9: [[2,2],[6,2],[4,4],[2,6],[6,6]],
    13: [[3,3],[9,3],[6,6],[3,9],[9,9],[3,6],[6,3],[6,9],[9,6]],
    19: [[3,3],[9,3],[15,3],[3,9],[9,9],[15,9],[3,15],[9,15],[15,15]],
  };

  function key(x: number, y: number) { return `${x},${y}`; }

  function buildBoard(size: number, spacing: number) {
    if (boardGroup) {
      scene.remove(boardGroup);
      boardGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    boardGroup = new THREE.Group();
    currentSize = size;

    const half = ((size - 1) * spacing) / 2;

    // Wooden board surface
    const boardMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size * spacing + 0.5, size * spacing + 0.5),
      new THREE.MeshStandardMaterial({ color: 0xbc8b5a, roughness: 0.9 }),
    );
    boardMesh.rotation.x = -Math.PI / 2;
    boardGroup.add(boardMesh);

    // Grid lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0x3b2a1f });
    for (let i = 0; i < size; i++) {
      const v = -half + i * spacing;
      const g1 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-half, 0.01, v),
        new THREE.Vector3(half, 0.01, v),
      ]);
      const g2 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(v, 0.01, -half),
        new THREE.Vector3(v, 0.01, half),
      ]);
      boardGroup.add(new THREE.Line(g1, lineMat));
      boardGroup.add(new THREE.Line(g2, lineMat));
    }

    // Star points
    const stars = STAR_POINTS[size] || [];
    for (const [sx, sy] of stars) {
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.1, 16),
        new THREE.MeshBasicMaterial({ color: 0x3b2a1f }),
      );
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(-half + sx * spacing, 0.015, -half + sy * spacing);
      boardGroup.add(dot);
    }

    scene.add(boardGroup);
  }

  function gridToWorld(x: number, y: number, size: number, spacing: number) {
    const half = ((size - 1) * spacing) / 2;
    return { X: -half + x * spacing, Z: -half + y * spacing };
  }

  function worldToGrid(X: number, Z: number, size: number, spacing: number) {
    const half = ((size - 1) * spacing) / 2;
    const x = Math.round((X + half) / spacing);
    const y = Math.round((Z + half) / spacing);
    if (x < 0 || x >= size || y < 0 || y >= size) return null;
    return { x, y };
  }

  function getSpacing(size: number): number {
    // Smaller boards get wider spacing for better visibility
    if (size <= 9) return 1.2;
    if (size <= 13) return 1.0;
    return 0.85;
  }

  function renderBoardState() {
    const state = get(go3dStore);
    if (!state.board.length) return;

    const size = state.size;
    const spacing = getSpacing(size);

    // Rebuild board mesh if size changed
    if (size !== currentSize) {
      buildBoard(size, spacing);
      // Clear all stone meshes
      for (const [, mesh] of stoneMeshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      stoneMeshes.clear();
      // Adjust camera
      const dist = size <= 9 ? 14 : size <= 13 ? 18 : 22;
      camera.position.set(0, dist, dist * 0.7);
      controls.target.set(0, 0, 0);
    }

    const wanted = new Set<string>();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = state.board[y][x];
        if (!v) continue;
        const k = key(x, y);
        wanted.add(k);
        if (!stoneMeshes.has(k)) {
          const radius = spacing * 0.46;
          const g = new THREE.SphereGeometry(radius, 22, 22);
          g.scale(1, 0.35, 1);
          const m = new THREE.MeshStandardMaterial({
            color: v === 1 ? 0x101010 : 0xf8f8f8,
            roughness: 0.4,
          });
          const mesh = new THREE.Mesh(g, m);
          const w = gridToWorld(x, y, size, spacing);
          mesh.position.set(w.X, 0.2, w.Z);
          scene.add(mesh);
          stoneMeshes.set(k, mesh);
        }
      }
    }

    // Remove stones no longer on board
    for (const [k, mesh] of stoneMeshes) {
      if (!wanted.has(k)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        stoneMeshes.delete(k);
      }
    }

    // Clear overlays
    for (const m of overlayMeshes) scene.remove(m);
    overlayMeshes.length = 0;

    // Ghost stone (hover preview)
    if (state.ghost) {
      const radius = spacing * 0.46;
      const g = new THREE.SphereGeometry(radius, 18, 18);
      g.scale(1, 0.35, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: state.ghost.legal ? (state.ghost.c === 1 ? 0x2e2e2e : 0xffffff) : 0xef4444,
        transparent: true,
        opacity: 0.45,
      });
      const ghost = new THREE.Mesh(g, mat);
      const w = gridToWorld(state.ghost.x, state.ghost.y, size, spacing);
      ghost.position.set(w.X, 0.18, w.Z);
      scene.add(ghost);
      overlayMeshes.push(ghost);
    }

    // Last move marker
    if (state.lastMove && state.lastMove !== 'pass') {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(spacing * 0.2, spacing * 0.28, 24),
        new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }),
      );
      const w = gridToWorld(state.lastMove.x, state.lastMove.y, size, spacing);
      marker.position.set(w.X, 0.35, w.Z);
      marker.rotation.x = -Math.PI / 2;
      scene.add(marker);
      overlayMeshes.push(marker);
    }

    // Highlight overlays
    for (const h of state.highlights) {
      if (h.type === 'candidate') {
        const torus = new THREE.Mesh(
          new THREE.TorusGeometry(spacing * 0.35, 0.05, 12, 28),
          new THREE.MeshBasicMaterial({ color: 0x22c55e }),
        );
        const w = gridToWorld(h.x, h.y, size, spacing);
        torus.position.set(w.X, 0.06, w.Z);
        torus.rotation.x = Math.PI / 2;
        scene.add(torus);
        overlayMeshes.push(torus);
      }
    }
  }

  function onPointerMove(e: MouseEvent) {
    const state = get(go3dStore);
    if (state.aiThinking || state.gameMode === 'ava') return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    if (!hits.length) { clearHover(); return; }
    const p = hits[0].point;
    const g = worldToGrid(p.x, p.z, state.size, getSpacing(state.size));
    if (g) hoverAt(g.x, g.y);
    else clearHover();
  }

  function onClick(e: MouseEvent) {
    const state = get(go3dStore);
    if (state.aiThinking || state.status !== 'playing' || state.gameMode === 'ava') return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    if (!hits.length) return;
    const p = hits[0].point;
    const g = worldToGrid(p.x, p.z, state.size, getSpacing(state.size));
    if (g) placeStone(g.x, g.y);
  }

  onMount(() => {
    scene = new THREE.Scene();
    cleanupTheme = watchSceneTheme(scene);

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(0, 14, 10);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 560);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.15;
    controls.maxPolarAngle = Math.PI * 0.45;
    controls.minDistance = 8;
    controls.maxDistance = 35;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(8, 20, 7);
    scene.add(dl);

    // Build initial board
    const state = get(go3dStore);
    buildBoard(state.size, getSpacing(state.size));

    renderer.domElement.addEventListener('mousemove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    unsubscribe = go3dStore.subscribe(() => renderBoardState());

    const onResize = () => {
      const w = container.clientWidth || 800;
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
    unsubscribe?.();
    cleanupTheme?.();
    cancelAnimationFrame(raf);
    renderer?.domElement?.removeEventListener('mousemove', onPointerMove);
    renderer?.domElement?.removeEventListener('click', onClick);
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
