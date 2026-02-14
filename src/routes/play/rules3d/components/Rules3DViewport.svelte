<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { watchSceneTheme } from '../themeScene';
  import { move, rules3dStore } from '../store/rules3dStore';

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let raf = 0;
  let unsub: (() => void) | null = null;
  let cleanupTheme: (() => void) | null = null;

  const tileMeshes = new Map<string, THREE.Mesh>();
  const objMeshes = new Map<string, THREE.Mesh>();
  const labelSprites = new Map<string, THREE.Sprite>();
  const overlays: THREE.Object3D[] = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let selectedId: string | null = null;

  let originX = 0;
  let originZ = 0;
  const SPACING = 1.05;

  function k(x: number, y: number) { return `${x},${y}`; }
  function toWorld(x: number, y: number) {
    return { X: originX + x * SPACING, Z: originZ + y * SPACING };
  }

  const colors: Record<string, number> = {
    WALL: 0x64748b,
    ROCK: 0xa16207,
    PLAYER: 0x22c55e,
    GOAL: 0xf59e0b,
    LAVA: 0xef4444,
    WATER: 0x3b82f6,
    KEY: 0xfacc15,
    DOOR: 0x92400e,
    IS: 0x6366f1,
    YOU: 0x10b981,
    WIN: 0xfbbf24,
    STOP: 0xef4444,
    PUSH: 0x38bdf8,
    DEFEAT: 0xb91c1c,
  };

  const targets = new Map<string, THREE.Vector3>();

  function makeWordSprite(text: string) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(15,23,42,0.92)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, c.width - 4, c.height - 4);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 46px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 8), c.width / 2, c.height / 2);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.72, 0.36, 1);
    return sp;
  }

  function ensureBoard() {
    const s = $rules3dStore;
    originX = -((s.width - 1) * SPACING) / 2;
    originZ = -((s.height - 1) * SPACING) / 2;

    if (tileMeshes.size === s.width * s.height) return;
    for (const m of tileMeshes.values()) scene.remove(m);
    tileMeshes.clear();

    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(0.95, 0.16, 0.95),
          new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.92 }),
        );
        const w = toWorld(x, y);
        tile.position.set(w.X, 0.08, w.Z);
        scene.add(tile);
        tileMeshes.set(k(x, y), tile);
      }
    }
  }

  function makeObjMesh(type: string, kind: 'ENTITY' | 'WORD') {
    const color = colors[type] ?? 0x475569;
    if (kind === 'WORD') {
      return new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 0.3, 0.74),
        new THREE.MeshStandardMaterial({ color, roughness: 0.58 }),
      );
    }
    return new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.4, 20),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
    );
  }

  function syncObjects() {
    const s = $rules3dStore;

    for (const ov of overlays) scene.remove(ov);
    overlays.length = 0;

    for (const [id, mesh] of objMeshes) {
      if (!s.objects[id]) {
        scene.remove(mesh);
        objMeshes.delete(id);
      }
    }

    for (const [id, sp] of labelSprites) {
      if (!s.objects[id] || s.objects[id].kind !== 'WORD') {
        scene.remove(sp);
        labelSprites.delete(id);
      }
    }

    for (const o of Object.values(s.objects)) {
      let mesh = objMeshes.get(o.id);
      if (!mesh) {
        mesh = makeObjMesh(o.type, o.kind);
        mesh.userData.objId = o.id;
        objMeshes.set(o.id, mesh);
        scene.add(mesh);
      }
      const w = toWorld(o.pos.x, o.pos.y);
      const stack = s.grid[o.pos.y][o.pos.x].objects.indexOf(o.id);
      const targetY = 0.24 + Math.max(0, stack) * 0.12;
      targets.set(o.id, new THREE.Vector3(w.X, targetY, w.Z));

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(colors[o.type] ?? 0x475569);
      mat.emissive.setHex(selectedId === o.id ? 0x334155 : 0x000000);

      if (o.kind === 'WORD') {
        let sp = labelSprites.get(o.id);
        if (!sp) {
          sp = makeWordSprite(o.type);
          labelSprites.set(o.id, sp);
          scene.add(sp);
        }
        sp.position.set(w.X, targetY + 0.3, w.Z);
      }
    }

    for (const h of s.hintHighlights) {
      const w = toWorld(h.x, h.y);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.05, 12, 32),
        new THREE.MeshBasicMaterial({ color: 0x22c55e }),
      );
      ring.position.set(w.X, 0.33, w.Z);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      overlays.push(ring);
    }

    const words = Object.values(s.objects).filter((o) => o.kind === 'WORD');
    const map = new Map<string, string>();
    for (const w of words) map.set(k(w.pos.x, w.pos.y), w.type);

    const addGlow = (x: number, y: number) => {
      const ww = toWorld(x, y);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.8),
        new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(ww.X, 0.18, ww.Z);
      scene.add(plane);
      overlays.push(plane);
    };

    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const a = map.get(k(x, y));
        const isH = map.get(k(x + 1, y));
        const b = map.get(k(x + 2, y));
        if (a && isH === 'IS' && b) { addGlow(x, y); addGlow(x + 1, y); addGlow(x + 2, y); }

        const isV = map.get(k(x, y + 1));
        const bv = map.get(k(x, y + 2));
        if (a && isV === 'IS' && bv) { addGlow(x, y); addGlow(x, y + 1); addGlow(x, y + 2); }
      }
    }
  }

  function animateObjects() {
    for (const [id, mesh] of objMeshes) {
      const t = targets.get(id);
      if (!t) continue;
      mesh.position.lerp(t, 0.22);
      const sp = labelSprites.get(id);
      if (sp) {
        sp.position.lerp(new THREE.Vector3(t.x, t.y + 0.3, t.z), 0.22);
      }
    }
  }

  function pickObject(e: MouseEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...objMeshes.values()], false);
    if (!hits.length) return null;
    return hits[0].object.userData.objId as string;
  }

  function onClick(e: MouseEvent) {
    const id = pickObject(e);
    selectedId = id;
  }

  onMount(() => {
    scene = new THREE.Scene();
    cleanupTheme = watchSceneTheme(scene);

    camera = new THREE.PerspectiveCamera(44, 1, 0.1, 300);
    camera.position.set(0, 15, 12);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || 900, container.clientHeight || 560);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.maxPolarAngle = Math.PI * 0.42;
    controls.minDistance = 8;
    controls.maxDistance = 35;

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const d = new THREE.DirectionalLight(0xffffff, 0.9);
    d.position.set(9, 20, 7);
    scene.add(d);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') move('U');
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') move('D');
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') move('L');
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') move('R');
    };
    window.addEventListener('keydown', onKey);

    renderer.domElement.addEventListener('click', onClick);

    unsub = rules3dStore.subscribe(() => {
      ensureBoard();
      syncObjects();
    });

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
      animateObjects();
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('click', onClick);
    };
  });

  onDestroy(() => {
    unsub?.();
    cleanupTheme?.();
    cancelAnimationFrame(raf);
    controls?.dispose();
    renderer?.dispose();
  });
</script>

<div class="viewport" bind:this={container}></div>

{#if selectedId && $rules3dStore.objects[selectedId]}
  <div class="tooltip">
    <b>{$rules3dStore.objects[selectedId].type}</b>
    <span>{$rules3dStore.objects[selectedId].kind}</span>
    <span>({$rules3dStore.objects[selectedId].pos.x}, {$rules3dStore.objects[selectedId].pos.y})</span>
  </div>
{/if}

<style>
  .viewport {
    width: 100%;
    height: 100%;
    min-height: 560px;
    border-radius: 12px;
    overflow: hidden;
    background: var(--color-bg);
  }

  .tooltip {
    margin-top: 8px;
    display: inline-flex;
    gap: 8px;
    align-items: center;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .tooltip b { color: var(--color-text); }
</style>
