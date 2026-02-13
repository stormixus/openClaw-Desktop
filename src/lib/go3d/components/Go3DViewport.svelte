<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { get } from 'svelte/store';
  import { go3dStore, hoverAt, tryPlace } from '$lib/go3d/store/go3dStore';
  import type { GoPuzzle } from '$lib/go3d/core/types';

  export let puzzle: GoPuzzle;

  const GRID = 19;
  const SPACING = 1.0;
  const originX = -((GRID - 1) * SPACING) / 2;
  const originZ = -((GRID - 1) * SPACING) / 2;

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let raf = 0;
  let unsubscribe: (() => void) | null = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const stoneMeshes = new Map<string, THREE.Mesh>();
  const overlayMeshes: THREE.Object3D[] = [];

  function gridToWorld(x: number, y: number) {
    return { X: originX + x * SPACING, Z: originZ + y * SPACING };
  }

  function worldToGrid(X: number, Z: number) {
    const x = Math.round((X - originX) / SPACING);
    const y = Math.round((Z - originZ) / SPACING);
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return null;
    return { x, y };
  }

  function key(x: number, y: number) { return `${x},${y}`; }

  function renderBoardState() {
    const state = get(go3dStore);
    if (!state.board.length) return;

    const wanted = new Set<string>();
    for (let y = 0; y < state.board.length; y++) {
      for (let x = 0; x < state.board.length; x++) {
        const v = state.board[y][x];
        if (!v) continue;
        const k = key(x, y);
        wanted.add(k);
        if (!stoneMeshes.has(k)) {
          const g = new THREE.SphereGeometry(0.55, 22, 22);
          g.scale(1, 0.35, 1);
          const m = new THREE.MeshStandardMaterial({ color: v === 1 ? 0x101010 : 0xf8f8f8, roughness: 0.4 });
          const mesh = new THREE.Mesh(g, m);
          const w = gridToWorld(x, y);
          mesh.position.set(w.X, 0.2, w.Z);
          scene.add(mesh);
          stoneMeshes.set(k, mesh);
        }
      }
    }

    for (const [k, mesh] of stoneMeshes) {
      if (!wanted.has(k)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        stoneMeshes.delete(k);
      }
    }

    for (const m of overlayMeshes) scene.remove(m);
    overlayMeshes.length = 0;

    if (state.ghost) {
      const g = new THREE.SphereGeometry(0.55, 18, 18);
      g.scale(1, 0.35, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: state.ghost.legal ? (state.ghost.c === 1 ? 0x2e2e2e : 0xffffff) : 0xef4444,
        transparent: true,
        opacity: 0.45,
      });
      const ghost = new THREE.Mesh(g, mat);
      const w = gridToWorld(state.ghost.x, state.ghost.y);
      ghost.position.set(w.X, 0.18, w.Z);
      scene.add(ghost);
      overlayMeshes.push(ghost);
    }

    for (const h of state.highlights) {
      if (h.type === 'candidate') {
        const torus = new THREE.Mesh(
          new THREE.TorusGeometry(0.42, 0.05, 12, 28),
          new THREE.MeshBasicMaterial({ color: 0x22c55e }),
        );
        const w = gridToWorld(h.x, h.y);
        torus.position.set(w.X, 0.06, w.Z);
        torus.rotation.x = Math.PI / 2;
        scene.add(torus);
        overlayMeshes.push(torus);
      }
      if (h.type === 'region') {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(h.r - 0.1, h.r + 0.1, 48),
          new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
        );
        const w = gridToWorld(h.x, h.y);
        ring.position.set(w.X, 0.05, w.Z);
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);
        overlayMeshes.push(ring);
      }
    }
  }

  function onPointerMove(e: MouseEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    if (!hits.length) return;
    const p = hits[0].point;
    const g = worldToGrid(p.x, p.z);
    if (g) hoverAt(g.x, g.y);
  }

  function onClick(e: MouseEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    if (!hits.length) return;
    const p = hits[0].point;
    const g = worldToGrid(p.x, p.z);
    if (g) tryPlace(g.x, g.y, puzzle);
  }

  onMount(() => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1220);

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(0, 17, 15);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 560);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.19;
    controls.maxPolarAngle = Math.PI * 0.42;
    controls.minDistance = 12;
    controls.maxDistance = 32;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(8, 20, 7);
    scene.add(dl);

    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(19.5, 19.5),
      new THREE.MeshStandardMaterial({ color: 0xbc8b5a, roughness: 0.9 }),
    );
    board.rotation.x = -Math.PI / 2;
    scene.add(board);

    const lineMat = new THREE.LineBasicMaterial({ color: 0x3b2a1f });
    for (let i = 0; i < GRID; i++) {
      const v = originX + i * SPACING;
      const l1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(originX, 0.01, v), new THREE.Vector3(-originX, 0.01, v)]);
      const l2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(v, 0.01, originZ), new THREE.Vector3(v, 0.01, -originZ)]);
      scene.add(new THREE.Line(l1, lineMat));
      scene.add(new THREE.Line(l2, lineMat));
    }

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
    background: #0d1220;
  }
</style>
