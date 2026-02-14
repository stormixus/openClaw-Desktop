<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { watchSceneTheme } from '../themeScene';
  import { slitherlinkStore, toggleEdgeAction } from '../store/slitherlinkStore';
  import { getCellStatus } from '../core/engine';
  import type { Edge } from '../core/types';

  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let cleanupTheme: (() => void) | null = null;

  // Edge meshes and hit areas
  let edgeObjects: Map<string, { line: THREE.Mesh; cross: THREE.Group | THREE.Mesh; hitArea: THREE.Mesh }> = new Map();
  let dotMeshes: THREE.Mesh[] = [];
  let clueMeshes: Map<string, THREE.Sprite> = new Map();
  let raycaster = new THREE.Raycaster();
  let mouse = new THREE.Vector2();

  function edgeKey(edge: Edge): string {
    return `${edge.orientation}-${edge.row}-${edge.col}`;
  }

  function initScene() {
    scene = new THREE.Scene();
    cleanupTheme = watchSceneTheme(scene);

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 15, 15);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);
  }

  function buildBoard(state: typeof $slitherlinkStore) {
    // Clear existing objects
    edgeObjects.forEach((obj) => {
      scene.remove(obj.line);
      scene.remove(obj.cross);
      scene.remove(obj.hitArea);
    });
    edgeObjects.clear();

    dotMeshes.forEach((dot) => scene.remove(dot));
    dotMeshes = [];

    clueMeshes.forEach((sprite) => scene.remove(sprite));
    clueMeshes = new Map();

    const { width, height, clues } = state;
    const cellSize = 2;
    const offsetX = -(width * cellSize) / 2;
    const offsetZ = -(height * cellSize) / 2;

    // Create dots at grid intersections
    const dotGeometry = new THREE.SphereGeometry(0.08, 16, 16);
    const dotMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });

    for (let row = 0; row <= height; row++) {
      for (let col = 0; col <= width; col++) {
        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        dot.position.set(offsetX + col * cellSize, 0, offsetZ + row * cellSize);
        scene.add(dot);
        dotMeshes.push(dot);
      }
    }

    // Create clue sprites
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const clue = clues[row][col];
        if (clue === null) continue;

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;

        const status = getCellStatus(state, row, col);
        ctx.fillStyle =
          status === 'satisfied' ? '#00ff88' : status === 'violated' ? '#ff4444' : '#ffffff';
        ctx.font = 'bold 96px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(clue), 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(
          offsetX + col * cellSize + cellSize / 2,
          0.1,
          offsetZ + row * cellSize + cellSize / 2
        );
        sprite.scale.set(1, 1, 1);
        scene.add(sprite);
        clueMeshes.set(`${row}-${col}`, sprite);
      }
    }

    // Create horizontal edges
    for (let row = 0; row <= height; row++) {
      for (let col = 0; col < width; col++) {
        const edge: Edge = { orientation: 'h', row, col };
        createEdgeObjects(edge, offsetX, offsetZ, cellSize);
      }
    }

    // Create vertical edges
    for (let row = 0; row < height; row++) {
      for (let col = 0; col <= width; col++) {
        const edge: Edge = { orientation: 'v', row, col };
        createEdgeObjects(edge, offsetX, offsetZ, cellSize);
      }
    }

    updateEdgeVisibility(state);
  }

  function createEdgeObjects(edge: Edge, offsetX: number, offsetZ: number, cellSize: number) {
    const key = edgeKey(edge);

    // Calculate edge position and direction
    let x1: number, z1: number, x2: number, z2: number;

    if (edge.orientation === 'h') {
      x1 = offsetX + edge.col * cellSize;
      z1 = offsetZ + edge.row * cellSize;
      x2 = x1 + cellSize;
      z2 = z1;
    } else {
      x1 = offsetX + edge.col * cellSize;
      z1 = offsetZ + edge.row * cellSize;
      x2 = x1;
      z2 = z1 + cellSize;
    }

    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const angle = Math.atan2(z2 - z1, x2 - x1);

    // Line mesh (glowing tube)
    const lineGeometry = new THREE.CylinderGeometry(0.08, 0.08, length, 8);
    const lineMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ddff,
      emissive: 0x00ddff,
      emissiveIntensity: 0.5,
    });
    const lineMesh = new THREE.Mesh(lineGeometry, lineMaterial);
    lineMesh.position.set(midX, 0, midZ);
    lineMesh.rotation.z = Math.PI / 2;
    lineMesh.rotation.y = -angle;
    lineMesh.visible = false;
    scene.add(lineMesh);

    // Cross mesh (X mark)
    const crossGroup = new THREE.Group();
    const crossBar = new THREE.BoxGeometry(0.5, 0.05, 0.05);
    const crossMaterial = new THREE.MeshStandardMaterial({ color: 0xff6666 });
    const bar1 = new THREE.Mesh(crossBar, crossMaterial);
    bar1.rotation.y = Math.PI / 4;
    const bar2 = new THREE.Mesh(crossBar, crossMaterial);
    bar2.rotation.y = -Math.PI / 4;
    crossGroup.add(bar1, bar2);
    crossGroup.position.set(midX, 0, midZ);
    crossGroup.visible = false;
    scene.add(crossGroup);

    // Hit area (invisible box for raycasting)
    const hitGeometry = new THREE.BoxGeometry(length, 0.5, 0.3);
    const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
    hitMesh.position.set(midX, 0, midZ);
    hitMesh.rotation.y = -angle;
    hitMesh.userData = { edge };
    scene.add(hitMesh);

    edgeObjects.set(key, { line: lineMesh, cross: crossGroup, hitArea: hitMesh });
  }

  function updateEdgeVisibility(state: typeof $slitherlinkStore) {
    // Update horizontal edges
    for (let row = 0; row <= state.height; row++) {
      for (let col = 0; col < state.width; col++) {
        const edge: Edge = { orientation: 'h', row, col };
        const edgeState = state.hEdges[row][col];
        const obj = edgeObjects.get(edgeKey(edge));
        if (obj) {
          obj.line.visible = edgeState === 'line';
          obj.cross.visible = edgeState === 'cross';
        }
      }
    }

    // Update vertical edges
    for (let row = 0; row < state.height; row++) {
      for (let col = 0; col <= state.width; col++) {
        const edge: Edge = { orientation: 'v', row, col };
        const edgeState = state.vEdges[row][col];
        const obj = edgeObjects.get(edgeKey(edge));
        if (obj) {
          obj.line.visible = edgeState === 'line';
          obj.cross.visible = edgeState === 'cross';
        }
      }
    }

    // Update clue colors
    for (let row = 0; row < state.height; row++) {
      for (let col = 0; col < state.width; col++) {
        const clue = state.clues[row][col];
        if (clue === null) continue;

        const sprite = clueMeshes.get(`${row}-${col}`);
        if (!sprite) continue;

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;

        const status = getCellStatus(state, row, col);
        ctx.fillStyle =
          status === 'satisfied' ? '#00ff88' : status === 'violated' ? '#ff4444' : '#ffffff';
        ctx.font = 'bold 96px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(clue), 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        sprite.material.map = texture;
        sprite.material.needsUpdate = true;
      }
    }
  }

  function onClick(event: MouseEvent) {
    if (!container || $slitherlinkStore.status === 'won') return;

    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const hitAreas = Array.from(edgeObjects.values()).map((obj) => obj.hitArea);
    const intersects = raycaster.intersectObjects(hitAreas);

    if (intersects.length > 0) {
      const edge = intersects[0].object.userData.edge as Edge;
      toggleEdgeAction(edge);
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  function onResize() {
    if (!container || !camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  onMount(() => {
    initScene();
    buildBoard($slitherlinkStore);
    animate();
    window.addEventListener('resize', onResize);
  });

  onDestroy(() => {
    cleanupTheme?.();
    window.removeEventListener('resize', onResize);
    if (renderer) renderer.dispose();
    if (controls) controls.dispose();
  });

  // Rebuild board when state changes significantly
  $: {
    if (scene && $slitherlinkStore) {
      // Only rebuild if dimensions changed
      const currentWidth = $slitherlinkStore.width;
      const currentHeight = $slitherlinkStore.height;
      const needsRebuild =
        edgeObjects.size === 0 ||
        dotMeshes.length !== (currentWidth + 1) * (currentHeight + 1);

      if (needsRebuild) {
        buildBoard($slitherlinkStore);
      } else {
        updateEdgeVisibility($slitherlinkStore);
      }
    }
  }
</script>

<div class="viewport" bind:this={container} onclick={onClick} role="button" tabindex="0"></div>

<style>
  .viewport {
    width: 100%;
    height: 100%;
    border-radius: 12px;
    overflow: hidden;
    background: var(--color-bg);
    cursor: pointer;
  }
</style>
