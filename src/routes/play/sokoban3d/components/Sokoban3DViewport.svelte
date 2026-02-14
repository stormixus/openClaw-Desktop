<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { watchSceneTheme } from '../themeScene';
  import { store } from '../store/sokobanStore';
  import type { Dir } from '../core/types';

  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let animationId: number;
  let cleanupTheme: (() => void) | null = null;

  let playerMesh: THREE.Mesh;
  let boxMeshes: THREE.Mesh[] = [];
  let targetMeshes: THREE.Mesh[] = [];

  let targetPlayerPos = { x: 0, y: 0 };
  let currentPlayerPos = { x: 0, y: 0 };
  let targetBoxPositions: { x: number; y: number }[] = [];
  let currentBoxPositions: { x: number; y: number }[] = [];
  let isAnimating = false;

  const ANIMATION_DURATION = 150;
  let animationStartTime = 0;

  function initScene() {
    scene = new THREE.Scene();
    cleanupTheme = watchSceneTheme(scene);

    camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minPolarAngle = Math.PI / 6;
    controls.maxPolarAngle = Math.PI / 2.5;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    buildLevel();
    animate();
  }

  function buildLevel() {
    scene.clear();
    boxMeshes = [];
    targetMeshes = [];

    const state = $store;
    const level = state.level;

    const centerX = level.width / 2;
    const centerY = level.height / 2;

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const cell = level.grid[y][x];
        const posX = x - centerX;
        const posZ = y - centerY;

        if (cell === 'wall') {
          const geometry = new THREE.BoxGeometry(1, 1, 1);
          const material = new THREE.MeshStandardMaterial({
            color: 0x2a2a3a,
            roughness: 0.8
          });
          const wall = new THREE.Mesh(geometry, material);
          wall.position.set(posX, 0.5, posZ);
          wall.castShadow = true;
          wall.receiveShadow = true;
          scene.add(wall);
        } else {
          const geometry = new THREE.BoxGeometry(1, 0.1, 1);
          const material = new THREE.MeshStandardMaterial({
            color: 0x888888
          });
          const floor = new THREE.Mesh(geometry, material);
          floor.position.set(posX, 0, posZ);
          floor.receiveShadow = true;
          scene.add(floor);

          if (cell === 'target') {
            const targetGeometry = new THREE.CircleGeometry(0.35, 32);
            const targetMaterial = new THREE.MeshBasicMaterial({
              color: 0x4ade80,
              transparent: true,
              opacity: 0.6
            });
            const target = new THREE.Mesh(targetGeometry, targetMaterial);
            target.rotation.x = -Math.PI / 2;
            target.position.set(posX, 0.06, posZ);
            scene.add(target);
            targetMeshes.push(target);
          }
        }
      }
    }

    const playerGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
    playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    playerMesh.castShadow = true;
    scene.add(playerMesh);

    currentPlayerPos = { x: state.playerPos.x - centerX, y: state.playerPos.y - centerY };
    targetPlayerPos = { ...currentPlayerPos };
    playerMesh.position.set(currentPlayerPos.x, 0.4, currentPlayerPos.y);

    state.boxes.forEach(() => {
      const boxGeometry = new THREE.BoxGeometry(0.7, 0.7, 0.7);
      const boxMaterial = new THREE.MeshStandardMaterial({
        color: 0xc69c6d,
        roughness: 0.7
      });
      const box = new THREE.Mesh(boxGeometry, boxMaterial);
      box.castShadow = true;
      box.receiveShadow = true;
      scene.add(box);
      boxMeshes.push(box);
    });

    currentBoxPositions = state.boxes.map(b => ({
      x: b.x - centerX,
      y: b.y - centerY
    }));
    targetBoxPositions = [...currentBoxPositions];

    updateBoxPositions();

    camera.position.set(0, level.height * 1.2, level.height * 0.8);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function updateBoxPositions() {
    const state = $store;
    const centerX = state.level.width / 2;
    const centerY = state.level.height / 2;

    boxMeshes.forEach((mesh, i) => {
      const pos = currentBoxPositions[i];
      mesh.position.set(pos.x, 0.4, pos.y);

      const box = state.boxes[i];
      const isOnTarget = state.level.targets.some(t => t.x === box.x && t.y === box.y);
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(
        isOnTarget ? 0x4ade80 : 0xc69c6d
      );
    });
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    if (isAnimating) {
      const elapsed = Date.now() - animationStartTime;
      const t = Math.min(elapsed / ANIMATION_DURATION, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      currentPlayerPos.x += (targetPlayerPos.x - currentPlayerPos.x) * eased;
      currentPlayerPos.y += (targetPlayerPos.y - currentPlayerPos.y) * eased;
      playerMesh.position.set(currentPlayerPos.x, 0.4, currentPlayerPos.y);

      currentBoxPositions.forEach((pos, i) => {
        pos.x += (targetBoxPositions[i].x - pos.x) * eased;
        pos.y += (targetBoxPositions[i].y - pos.y) * eased;
      });
      updateBoxPositions();

      if (t >= 1) {
        isAnimating = false;
        currentPlayerPos = { ...targetPlayerPos };
        currentBoxPositions = targetBoxPositions.map(p => ({ ...p }));
        updateBoxPositions();
      }
    }

    targetMeshes.forEach((mesh, i) => {
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.5 + 0.2 * Math.sin(Date.now() * 0.003 + i);
    });

    controls.update();
    renderer.render(scene, camera);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (isAnimating) return;

    let dir: Dir | null = null;

    switch (e.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        dir = 'up';
        break;
      case 's':
      case 'arrowdown':
        dir = 'down';
        break;
      case 'a':
      case 'arrowleft':
        dir = 'left';
        break;
      case 'd':
      case 'arrowright':
        dir = 'right';
        break;
      case 'z':
        if (e.ctrlKey || e.metaKey) {
          store.undoMove();
          syncPositions();
        }
        break;
      case 'r':
        store.resetCurrentLevel();
        syncPositions();
        break;
    }

    if (dir) {
      e.preventDefault();
      store.movePlayer(dir);
      startAnimation();
    }
  }

  function startAnimation() {
    const state = $store;
    const centerX = state.level.width / 2;
    const centerY = state.level.height / 2;

    targetPlayerPos = {
      x: state.playerPos.x - centerX,
      y: state.playerPos.y - centerY
    };

    targetBoxPositions = state.boxes.map(b => ({
      x: b.x - centerX,
      y: b.y - centerY
    }));

    isAnimating = true;
    animationStartTime = Date.now();
  }

  function syncPositions() {
    const state = $store;
    const centerX = state.level.width / 2;
    const centerY = state.level.height / 2;

    currentPlayerPos = {
      x: state.playerPos.x - centerX,
      y: state.playerPos.y - centerY
    };
    targetPlayerPos = { ...currentPlayerPos };
    playerMesh.position.set(currentPlayerPos.x, 0.4, currentPlayerPos.y);

    currentBoxPositions = state.boxes.map(b => ({
      x: b.x - centerX,
      y: b.y - centerY
    }));
    targetBoxPositions = currentBoxPositions.map(p => ({ ...p }));
    updateBoxPositions();
  }

  function handleResize() {
    if (!camera || !renderer || !container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  onMount(() => {
    initScene();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    const unsubscribe = store.subscribe((state) => {
      if (state.currentLevelIndex !== $store?.currentLevelIndex) {
        buildLevel();
      }
    });

    return () => {
      unsubscribe();
    };
  });

  onDestroy(() => {
    cleanupTheme?.();
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('resize', handleResize);
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer) {
      container?.removeChild(renderer.domElement);
      renderer.dispose();
    }
  });
</script>

<div bind:this={container} class="viewport"></div>

<style>
  .viewport {
    width: 100%;
    height: 100%;
    border-radius: 0.5rem;
    overflow: hidden;
  }
</style>
