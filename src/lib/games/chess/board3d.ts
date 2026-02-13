/**
 * Chess Board 3D - Three.js scene manager
 * Handles all rendering: board, pieces, highlights, interaction.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ============================================================================
// Types
// ============================================================================

type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type PieceColor = 'w' | 'b';

export interface HighlightOptions {
  selected?: string | null;
  legal?: string[];
  lastFrom?: string | null;
  lastTo?: string | null;
  checkSquare?: string | null;
}

type BoardCell = { type: string; color: string; square: string } | null;

// ============================================================================
// Constants
// ============================================================================

const HALF = 4;

const COL = {
  whitePiece: 0xfaf0e6,
  blackPiece: 0x1a1a2e,
  lightSq: 0xf0d9b5,
  darkSq: 0xb58863,
  edge: 0x3d2b1f,
  selected: 0x6366f1,
  legal: 0x22c55e,
  lastMove: 0xfbbf24,
  check: 0xef4444,
  bg: 0x0f0f1a,
  ground: 0x080812,
};

// ============================================================================
// Helpers
// ============================================================================

function sq2world(sq: string): THREE.Vector3 {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1]) - 1;
  return new THREE.Vector3(file - HALF + 0.5, 0, -(rank - HALF + 0.5));
}

function world2sq(x: number, z: number): string | null {
  const file = Math.floor(x + HALF);
  const rank = Math.floor(-z + HALF);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return String.fromCharCode(97 + file) + (rank + 1);
}

// ============================================================================
// ChessBoard3D Class
// ============================================================================

export class ChessBoard3D {
  /** Callback when a square is clicked */
  onSquareClick: ((sq: string) => void) | null = null;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private container: HTMLElement;
  private resizeObs: ResizeObserver;
  private animId = 0;
  private disposed = false;

  private pieceMeshes = new Map<string, THREE.Group>();
  private highlightMeshes: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  // Shared materials
  private whiteMat: THREE.MeshStandardMaterial;
  private blackMat: THREE.MeshStandardMaterial;
  private hlSelected: THREE.MeshBasicMaterial;
  private hlLegal: THREE.MeshBasicMaterial;
  private hlLast: THREE.MeshBasicMaterial;
  private hlCheck: THREE.MeshBasicMaterial;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 600;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COL.bg);

    // Camera
    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    this.camera.position.set(0, 9, 9);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // Materials
    this.whiteMat = new THREE.MeshStandardMaterial({
      color: COL.whitePiece, roughness: 0.25, metalness: 0.05,
    });
    this.blackMat = new THREE.MeshStandardMaterial({
      color: COL.blackPiece, roughness: 0.35, metalness: 0.1,
    });
    this.hlSelected = new THREE.MeshBasicMaterial({ color: COL.selected, transparent: true, opacity: 0.50, depthWrite: false });
    this.hlLegal = new THREE.MeshBasicMaterial({ color: COL.legal, transparent: true, opacity: 0.40, depthWrite: false });
    this.hlLast = new THREE.MeshBasicMaterial({ color: COL.lastMove, transparent: true, opacity: 0.30, depthWrite: false });
    this.hlCheck = new THREE.MeshBasicMaterial({ color: COL.check, transparent: true, opacity: 0.50, depthWrite: false });

    this.setupLights();
    this.createBoard();

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = Math.PI / 8;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 18;
    this.controls.target.set(0, 0, 0);
    this.controls.enablePan = false;

    // Events
    this.renderer.domElement.addEventListener('click', this.onClick);

    // Resize
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);

    // Start render loop
    this.animate();
  }

  // ========== Lights ==========

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 12, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.setScalar(2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 30;
    dir.shadow.camera.left = dir.shadow.camera.bottom = -6;
    dir.shadow.camera.right = dir.shadow.camera.top = 6;
    dir.shadow.bias = -0.001;
    this.scene.add(dir);

    const fill = new THREE.DirectionalLight(0xa0b8d0, 0.3);
    fill.position.set(-4, 6, -4);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0x6366f1, 0.5, 20);
    rim.position.set(0, 3, -6);
    this.scene.add(rim);
  }

  // ========== Board Geometry ==========

  private createBoard() {
    // Frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.15, 8.6),
      new THREE.MeshStandardMaterial({ color: COL.edge, roughness: 0.8 }),
    );
    frame.position.y = -0.1;
    frame.receiveShadow = true;
    this.scene.add(frame);

    // Squares
    const lightMat = new THREE.MeshStandardMaterial({ color: COL.lightSq, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: COL.darkSq, roughness: 0.7 });

    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const isLight = (f + r) % 2 === 1;
        const sqName = String.fromCharCode(97 + f) + (r + 1);
        const pos = sq2world(sqName);
        const sq = new THREE.Mesh(
          new THREE.BoxGeometry(1, 0.08, 1),
          isLight ? lightMat : darkMat,
        );
        sq.position.set(pos.x, 0, pos.z);
        sq.receiveShadow = true;
        this.scene.add(sq);
      }
    }

    // File / rank labels as small text would require font loading — skip for now.
    // The 3D board is self-evident with the piece positions.

    // Ground plane for shadows
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: COL.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // ========== Piece Geometry ==========

  private createPieceMesh(type: PieceType, color: PieceColor): THREE.Group {
    const group = new THREE.Group();
    const mat = color === 'w' ? this.whiteMat : this.blackMat;

    const mesh = (geo: THREE.BufferGeometry, y: number, extra?: Partial<{ rx: number; rz: number; x: number; z: number }>) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(extra?.x ?? 0, y, extra?.z ?? 0);
      if (extra?.rx) m.rotation.x = extra.rx;
      if (extra?.rz) m.rotation.z = extra.rz;
      m.castShadow = true;
      group.add(m);
    };

    // Base (shared)
    mesh(new THREE.CylinderGeometry(0.30, 0.35, 0.08, 32), 0.04);

    switch (type) {
      case 'p':
        mesh(new THREE.CylinderGeometry(0.10, 0.22, 0.30, 24), 0.23);
        mesh(new THREE.SphereGeometry(0.13, 24, 24), 0.46);
        break;

      case 'r':
        mesh(new THREE.CylinderGeometry(0.15, 0.20, 0.40, 24), 0.28);
        mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.10, 24), 0.53);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), 0.62, { x: Math.cos(a) * 0.13, z: Math.sin(a) * 0.13 });
        }
        break;

      case 'n':
        mesh(new THREE.CylinderGeometry(0.13, 0.20, 0.34, 24), 0.25);
        mesh(new THREE.BoxGeometry(0.14, 0.22, 0.18), 0.48, { z: -0.04, rx: -0.3 });
        mesh(new THREE.BoxGeometry(0.06, 0.10, 0.06), 0.58, { z: -0.08 });
        break;

      case 'b':
        mesh(new THREE.CylinderGeometry(0.08, 0.20, 0.42, 24), 0.29);
        mesh(new THREE.SphereGeometry(0.12, 24, 24), 0.54);
        mesh(new THREE.ConeGeometry(0.04, 0.12, 12), 0.68);
        break;

      case 'q':
        mesh(new THREE.CylinderGeometry(0.10, 0.22, 0.48, 24), 0.32);
        {
          const crown = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.025, 12, 24), mat);
          crown.position.y = 0.60;
          crown.rotation.x = Math.PI / 2;
          crown.castShadow = true;
          group.add(crown);
        }
        mesh(new THREE.SphereGeometry(0.07, 24, 24), 0.68);
        break;

      case 'k':
        mesh(new THREE.CylinderGeometry(0.11, 0.24, 0.52, 24), 0.34);
        mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), 0.69);
        mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), 0.72);
        break;
    }

    group.userData = { pieceType: type, pieceColor: color };
    return group;
  }

  // ========== Sync ==========

  syncPieces(board: BoardCell[][]) {
    // Build new state map
    const wanted = new Map<string, { type: PieceType; color: PieceColor }>();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (!p) continue;
        const sq = String.fromCharCode(97 + f) + (8 - r);
        wanted.set(sq, { type: p.type as PieceType, color: p.color as PieceColor });
      }
    }

    // Remove meshes that no longer match
    for (const [sq, mesh] of this.pieceMeshes) {
      const w = wanted.get(sq);
      if (!w || w.type !== mesh.userData.pieceType || w.color !== mesh.userData.pieceColor) {
        this.scene.remove(mesh);
        this.pieceMeshes.delete(sq);
      }
    }

    // Add meshes for new/changed pieces
    for (const [sq, p] of wanted) {
      if (this.pieceMeshes.has(sq)) continue; // already correct
      const mesh = this.createPieceMesh(p.type, p.color);
      const pos = sq2world(sq);
      mesh.position.set(pos.x, 0.04, pos.z);
      this.scene.add(mesh);
      this.pieceMeshes.set(sq, mesh);
    }
  }

  // ========== Highlights ==========

  setHighlights(opts: HighlightOptions) {
    for (const h of this.highlightMeshes) this.scene.remove(h);
    this.highlightMeshes = [];

    const add = (sq: string, mat: THREE.Material) => {
      const pos = sq2world(sq);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(pos.x, 0.05, pos.z);
      this.scene.add(m);
      this.highlightMeshes.push(m);
    };

    if (opts.lastFrom) add(opts.lastFrom, this.hlLast);
    if (opts.lastTo) add(opts.lastTo, this.hlLast);
    if (opts.selected) add(opts.selected, this.hlSelected);
    for (const sq of opts.legal ?? []) add(sq, this.hlLegal);
    if (opts.checkSquare) add(opts.checkSquare, this.hlCheck);
  }

  // ========== Interaction ==========

  private onClick = (event: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    if (hits.length === 0) return;

    // Use hit point to determine square
    const pt = hits[0].point;
    const sq = world2sq(pt.x, pt.z);
    if (sq && this.onSquareClick) {
      this.onSquareClick(sq);
    }
  };

  // ========== Render Loop ==========

  private animate = () => {
    if (this.disposed) return;
    this.animId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ========== Cleanup ==========

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animId);
    this.resizeObs.disconnect();
    this.renderer.domElement.removeEventListener('click', this.onClick);
    this.controls.dispose();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
