<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { watchSceneTheme } from '../themeScene';
	import { lightsOutStore } from '../store/lightsoutStore';
	import type { LightsOutState } from '../core/types';

	let container: HTMLDivElement;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let renderer: THREE.WebGLRenderer;
	let controls: OrbitControls;
	let raycaster: THREE.Raycaster;
	let pointer: THREE.Vector2;

	let tiles: THREE.Mesh[][] = [];
	let tileTargetColors: THREE.Color[][] = [];
	let animatingTiles = new Set<string>();
	let cleanupTheme: (() => void) | null = null;

	const TILE_SIZE = 0.9;
	const TILE_GAP = 0.1;
	const COLOR_ON = new THREE.Color(0xfbbf24);
	const COLOR_OFF = new THREE.Color(0x374151);
	const EMISSIVE_ON = new THREE.Color(0xfbbf24);
	const EMISSIVE_OFF = new THREE.Color(0x000000);

	let currentState: LightsOutState;
	lightsOutStore.subscribe((state) => {
		currentState = state;
		if (tiles.length > 0) {
			updateTiles();
		}
	});

	onMount(() => {
		initScene();
		createGrid();
		animate();

		window.addEventListener('resize', handleResize);
		container.addEventListener('click', handleClick);
		container.addEventListener('pointermove', handlePointerMove);

		return () => {
			cleanupTheme?.();
			window.removeEventListener('resize', handleResize);
			container.removeEventListener('click', handleClick);
			container.removeEventListener('pointermove', handlePointerMove);
			renderer.dispose();
			controls.dispose();
		};
	});

	function initScene() {
		scene = new THREE.Scene();
		cleanupTheme = watchSceneTheme(scene);

		camera = new THREE.PerspectiveCamera(
			50,
			container.clientWidth / container.clientHeight,
			0.1,
			1000
		);
		camera.position.set(0, 8, 8);
		camera.lookAt(0, 0, 0);

		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		container.appendChild(renderer.domElement);

		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.maxPolarAngle = Math.PI / 2.2;
		controls.minDistance = 5;
		controls.maxDistance = 20;

		const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
		scene.add(ambientLight);

		const pointLight = new THREE.PointLight(0xffffff, 1, 50);
		pointLight.position.set(0, 10, 0);
		pointLight.castShadow = true;
		pointLight.shadow.mapSize.width = 2048;
		pointLight.shadow.mapSize.height = 2048;
		scene.add(pointLight);

		raycaster = new THREE.Raycaster();
		pointer = new THREE.Vector2();
	}

	function createGrid() {
		// Clear existing tiles
		tiles.forEach((row) => row.forEach((tile) => scene.remove(tile)));
		tiles = [];
		tileTargetColors = [];

		const size = currentState.size;
		const offset = ((size - 1) * (TILE_SIZE + TILE_GAP)) / 2;

		for (let x = 0; x < size; x++) {
			tiles[x] = [];
			tileTargetColors[x] = [];
			for (let y = 0; y < size; y++) {
				const geometry = new THREE.BoxGeometry(TILE_SIZE, 0.2, TILE_SIZE);
				const material = new THREE.MeshStandardMaterial({
					color: COLOR_OFF,
					emissive: EMISSIVE_OFF,
					emissiveIntensity: 0,
					roughness: 0.7,
					metalness: 0.3
				});

				const tile = new THREE.Mesh(geometry, material);
				tile.position.x = x * (TILE_SIZE + TILE_GAP) - offset;
				tile.position.z = y * (TILE_SIZE + TILE_GAP) - offset;
				tile.position.y = 0;
				tile.castShadow = true;
				tile.receiveShadow = true;
				tile.userData = { x, y };

				scene.add(tile);
				tiles[x][y] = tile;
				tileTargetColors[x][y] = COLOR_OFF.clone();
			}
		}

		updateTiles();
	}

	function updateTiles() {
		if (!currentState || tiles.length === 0) return;

		// Recreate grid if size changed
		if (tiles.length !== currentState.size) {
			createGrid();
			return;
		}

		for (let x = 0; x < currentState.size; x++) {
			for (let y = 0; y < currentState.size; y++) {
				const isOn = currentState.grid[x][y];
				tileTargetColors[x][y] = isOn ? COLOR_ON.clone() : COLOR_OFF.clone();
			}
		}
	}

	function handleClick(event: MouseEvent) {
		const rect = container.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		raycaster.setFromCamera(pointer, camera);
		const intersects = raycaster.intersectObjects(tiles.flat());

		if (intersects.length > 0) {
			const tile = intersects[0].object as THREE.Mesh;
			const { x, y } = tile.userData;

			// Scale pulse animation
			animateTileClick(tile);

			// Toggle with neighbor animations
			const neighbors = getAffectedNeighbors(x, y);
			neighbors.forEach(({ nx, ny }, index) => {
				setTimeout(() => {
					if (tiles[nx] && tiles[nx][ny]) {
						animateTileToggle(tiles[nx][ny]);
					}
				}, index * 50);
			});

			lightsOutStore.toggleLight(x, y);
		}
	}

	function getAffectedNeighbors(x: number, y: number) {
		const neighbors = [
			{ nx: x, ny: y },
			{ nx: x - 1, ny: y },
			{ nx: x + 1, ny: y },
			{ nx: x, ny: y - 1 },
			{ nx: x, ny: y + 1 }
		];

		return neighbors.filter(
			({ nx, ny }) => nx >= 0 && nx < currentState.size && ny >= 0 && ny < currentState.size
		);
	}

	function animateTileClick(tile: THREE.Mesh) {
		const key = `${tile.userData.x},${tile.userData.y}`;
		if (animatingTiles.has(key)) return;
		animatingTiles.add(key);

		const startScale = tile.scale.clone();
		const targetScale = new THREE.Vector3(1.1, 1.3, 1.1);
		const duration = 150;
		const startTime = Date.now();

		const animate = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

			if (progress < 0.5) {
				tile.scale.lerpVectors(startScale, targetScale, eased * 2);
			} else {
				tile.scale.lerpVectors(targetScale, startScale, (eased - 0.5) * 2);
			}

			if (progress < 1) {
				requestAnimationFrame(animate);
			} else {
				tile.scale.copy(startScale);
				animatingTiles.delete(key);
			}
		};

		animate();
	}

	function animateTileToggle(tile: THREE.Mesh) {
		// Handled by color lerping in animate loop
	}

	function handlePointerMove(event: MouseEvent) {
		const rect = container.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		raycaster.setFromCamera(pointer, camera);
		const intersects = raycaster.intersectObjects(tiles.flat());

		container.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
	}

	function handleResize() {
		camera.aspect = container.clientWidth / container.clientHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(container.clientWidth, container.clientHeight);
	}

	function animate() {
		requestAnimationFrame(animate);

		// Smooth color transitions
		for (let x = 0; x < tiles.length; x++) {
			for (let y = 0; y < tiles[x].length; y++) {
				const tile = tiles[x][y];
				const material = tile.material as THREE.MeshStandardMaterial;
				const targetColor = tileTargetColors[x][y];

				material.color.lerp(targetColor, 0.15);

				const targetEmissive = targetColor.equals(COLOR_ON) ? EMISSIVE_ON : EMISSIVE_OFF;
				const targetIntensity = targetColor.equals(COLOR_ON) ? 0.5 : 0;

				material.emissive.lerp(targetEmissive, 0.15);
				material.emissiveIntensity += (targetIntensity - material.emissiveIntensity) * 0.15;
			}
		}

		controls.update();
		renderer.render(scene, camera);
	}
</script>

<div bind:this={container} class="viewport"></div>

<style>
	.viewport {
		width: 100%;
		height: 100%;
		position: relative;
	}
</style>
