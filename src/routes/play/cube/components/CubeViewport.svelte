<script lang="ts">
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { watchSceneTheme } from '../themeScene';
  import type { Color, Face, FaceColors } from '../core/types';
  import { cubeStore } from '../store/cubeStore';

  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let cubies: THREE.Mesh[] = [];
  let cleanupTheme: (() => void) | null = null;

  const colorMap: Record<Color, number> = {
    white: 0xffffff,
    yellow: 0xffd500,
    red: 0xb71234,
    orange: 0xff5800,
    blue: 0x0046ad,
    green: 0x009b48
  };

  function initScene() {
    scene = new THREE.Scene();
    cleanupTheme = watchSceneTheme(scene);

    camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    createCube();
    animate();
  }

  function createCube() {
    // Remove old cubies
    cubies.forEach((cubie) => scene.remove(cubie));
    cubies = [];

    const state = $cubeStore;

    // Create 26 visible cubies (3x3x3 - 1 center)
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          // Skip center cubie
          if (x === 0 && y === 0 && z === 0) continue;

          const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
          const materials: THREE.MeshStandardMaterial[] = [];

          // Create materials for each face of the cubie
          // Order: right, left, top, bottom, front, back
          const faceColors = getCubieFaceColors(x, y, z, state.faces);

          for (let i = 0; i < 6; i++) {
            const color = faceColors[i];
            materials.push(
              new THREE.MeshStandardMaterial({
                color: color !== null ? colorMap[color] : 0x000000,
                roughness: 0.3,
                metalness: 0.1
              })
            );
          }

          const cubie = new THREE.Mesh(geometry, materials);
          cubie.position.set(x, y, z);
          scene.add(cubie);
          cubies.push(cubie);
        }
      }
    }
  }

  function getCubieFaceColors(
    x: number,
    y: number,
    z: number,
    faces: Record<Face, FaceColors>
  ): (Color | null)[] {
    // Returns [right, left, top, bottom, front, back] colors for a cubie
    // null means internal/hidden face (black)

    const result: (Color | null)[] = [null, null, null, null, null, null];

    // Map cubie position to face grid coordinates
    // Grid coordinates are [0,1,2] for each axis

    const gridX = x + 1; // -1,0,1 -> 0,1,2
    const gridY = y + 1;
    const gridZ = z + 1;

    // Right face (R, x=1)
    if (x === 1) {
      result[0] = faces.R[1 - y][gridZ];
    }

    // Left face (L, x=-1)
    if (x === -1) {
      result[1] = faces.L[1 - y][2 - gridZ];
    }

    // Top face (U, y=1)
    if (y === 1) {
      result[2] = faces.U[2 - gridZ][gridX];
    }

    // Bottom face (D, y=-1)
    if (y === -1) {
      result[3] = faces.D[gridZ][gridX];
    }

    // Front face (F, z=1)
    if (z === 1) {
      result[4] = faces.F[1 - y][gridX];
    }

    // Back face (B, z=-1)
    if (z === -1) {
      result[5] = faces.B[1 - y][2 - gridX];
    }

    return result;
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  function handleResize() {
    if (!container || !camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  onMount(() => {
    initScene();
    window.addEventListener('resize', handleResize);

    return () => {
      cleanupTheme?.();
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      controls.dispose();
    };
  });

  // Recreate cube when state changes
  $: if ($cubeStore && scene) {
    createCube();
  }
</script>

<div bind:this={container} class="cube-viewport"></div>

<style>
  .cube-viewport {
    width: 100%;
    height: 100%;
    position: relative;
  }
</style>
