import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { watchSceneTheme } from './themeScene';
import { playPiecePlace } from './sounds';

type Piece = { type: string; color: 'w' | 'b' };

const files = 'abcdefghi';
const HALF_W = 4.5;
const HALF_H = 5;

const PIECE_CHARS: Record<string, Record<'w' | 'b', string>> = {
  king:     { w: '楚', b: '漢' },
  guard:    { w: '士', b: '士' },
  rook:     { w: '車', b: '車' },
  cannon:   { w: '砲', b: '包' },
  horse:    { w: '馬', b: '馬' },
  elephant: { w: '象', b: '象' },
  soldier:  { w: '卒', b: '兵' },
};

interface PieceShape {
  radius: number;
  height: number;
  fontSize: number;
  borderWidth: number;
}

const PIECE_SHAPES: Record<keyof typeof PIECE_CHARS, PieceShape> = {
  // Real janggi set proportions: 궁 > 차 > 포 > 상 > 마 > 사 > 졸
  soldier:  { radius: 0.27, height: 0.09, fontSize: 158, borderWidth: 2 },
  guard:    { radius: 0.29, height: 0.10, fontSize: 156, borderWidth: 2 },
  horse:    { radius: 0.33, height: 0.12, fontSize: 150, borderWidth: 3 },
  elephant: { radius: 0.35, height: 0.13, fontSize: 148, borderWidth: 3 },
  cannon:   { radius: 0.38, height: 0.14, fontSize: 146, borderWidth: 3 },
  rook:     { radius: 0.41, height: 0.16, fontSize: 144, borderWidth: 4 },
  king:     { radius: 0.45, height: 0.18, fontSize: 140, borderWidth: 4 },
};

function pieceShape(type: string): PieceShape {
  return PIECE_SHAPES[type as keyof typeof PIECE_SHAPES] ?? PIECE_SHAPES.soldier;
}

function sq2world(sq: string): THREE.Vector3 {
  const f = files.indexOf(sq[0]);
  const r = Number(sq.slice(1)) - 1;
  return new THREE.Vector3(f - HALF_W + 0.5, 0, -(r - HALF_H + 0.5));
}

function world2sq(x: number, z: number): string | null {
  const f = Math.floor(x + HALF_W);
  const r = Math.floor(-z + HALF_H) + 1;
  if (f < 0 || f > 8 || r < 1 || r > 10) return null;
  return `${files[f]}${r}`;
}

export class JanggiBoard3D {
  onSquareClick: ((sq: string) => void) | null = null;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private container: HTMLElement;
  private resizeObs: ResizeObserver;
  private animId = 0;
  private disposed = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private pieceMeshes = new Map<string, THREE.Group>();
  private highlightMeshes: THREE.Mesh[] = [];
  private activeMoveAnims = new Map<THREE.Group, { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number }>();
  private themeCleanup: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 700;
    const h = container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.themeCleanup = watchSceneTheme(this.scene);

    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 120);
    this.camera.position.set(0, 11.5, 10.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.createBoard();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 20;
    this.controls.minPolarAngle = Math.PI / 8;
    this.controls.maxPolarAngle = Math.PI / 2.1;

    this.renderer.domElement.addEventListener('click', this.onClick);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.animate();
  }

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.52));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(7, 13, 9);
    dir.castShadow = true;
    this.scene.add(dir);
  }

  private createBoard() {
    // Frame border
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 0.16, 10.6),
      new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.85 }),
    );
    frame.position.y = -0.1;
    frame.receiveShadow = true;
    this.scene.add(frame);

    // Main board surface (single wooden surface)
    const boardSurface = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.75 }),
    );
    boardSurface.position.y = 0;
    boardSurface.receiveShadow = true;
    this.scene.add(boardSurface);

    // Grid lines
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x2d1f1a, roughness: 0.8 });

    // Vertical lines (9 files)
    for (let f = 0; f < 9; f++) {
      const x = f - HALF_W + 0.5;
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.01, 10),
        lineMat,
      );
      line.position.set(x, 0.05, 0);
      this.scene.add(line);
    }

    // Horizontal lines (10 ranks)
    for (let r = 1; r <= 10; r++) {
      const z = -(r - HALF_H - 0.5);
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(9, 0.01, 0.02),
        lineMat,
      );
      line.position.set(0, 0.05, z);
      this.scene.add(line);
    }

    // Palace diagonals
    const createPalaceDiagonals = (files: number[], rows: number[]) => {
      const [f1, f2, f3] = files.map(f => f - HALF_W + 0.5);
      const [r1, r2, r3] = rows.map(r => -(r - HALF_H - 0.5));

      // Calculate diagonal length
      const diagLen = Math.sqrt(2 * 2 * 2); // 2 squares diagonally

      // Diagonal from top-left to bottom-right
      const diag1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.01, diagLen),
        lineMat,
      );
      diag1.position.set((f1 + f3) / 2, 0.05, (r1 + r3) / 2);
      diag1.rotation.y = Math.PI / 4;
      this.scene.add(diag1);

      // Diagonal from top-right to bottom-left
      const diag2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.01, diagLen),
        lineMat,
      );
      diag2.position.set((f1 + f3) / 2, 0.05, (r1 + r3) / 2);
      diag2.rotation.y = -Math.PI / 4;
      this.scene.add(diag2);
    };

    // Bottom palace (Han/w): files d-f (3-5), rows 1-3
    createPalaceDiagonals([3, 4, 5], [1, 2, 3]);

    // Top palace (Cho/b): files d-f (3-5), rows 8-10
    createPalaceDiagonals([3, 4, 5], [8, 9, 10]);
  }

  private makeCharTexture(char: string, color: 'w' | 'b', shape: PieceShape): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Ivory background with subtle warm gradient
    const grad = ctx.createRadialGradient(128, 118, 20, 128, 138, 140);
    grad.addColorStop(0, '#fdf6e8');   // warm ivory center highlight
    grad.addColorStop(0.6, '#f5edd6'); // ivory mid
    grad.addColorStop(1, '#e8dfc8');   // slightly darker edge
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Draw octagon border
    const centerX = 128;
    const centerY = 128;
    const radius = 115;
    const sides = 8;

    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color === 'w' ? '#a01515' : '#1a3f8f';
    ctx.lineWidth = shape.borderWidth;
    ctx.stroke();

    // Subtle inner shadow on border
    ctx.strokeStyle = color === 'w' ? 'rgba(160, 21, 21, 0.15)' : 'rgba(26, 63, 143, 0.15)';
    ctx.lineWidth = shape.borderWidth + 3;
    ctx.stroke();

    // Redraw crisp border on top
    ctx.strokeStyle = color === 'w' ? '#a01515' : '#1a3f8f';
    ctx.lineWidth = shape.borderWidth;
    ctx.stroke();

    // Draw character with slight shadow for depth
    ctx.font = `bold ${shape.fontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Text shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillText(char, centerX + 1, centerY + 2);
    // Main text
    ctx.fillStyle = color === 'w' ? '#8b1a1a' : '#1a3a7a';
    ctx.fillText(char, centerX, centerY);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private pieceMesh(type: string, color: 'w' | 'b') {
    const group = new THREE.Group();

    // Get the Korean character
    const char = PIECE_CHARS[type]?.[color] || '?';
    const shape = pieceShape(type);

    // Create octagonal piece (8 segments for octagon shape)
    const pieceGeom = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.height, 8);

    // Create materials array for different faces
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.35, metalness: 0.05 });
    const topTexture = this.makeCharTexture(char, color, shape);
    const topMat = new THREE.MeshStandardMaterial({ map: topTexture, roughness: 0.25, metalness: 0.05 });
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0xddd4bc, roughness: 0.4 });

    // Apply materials: side, top, bottom
    const materials = [sideMat, topMat, bottomMat];

    const piece = new THREE.Mesh(pieceGeom, materials);
    piece.position.y = shape.height * 0.5;
    piece.castShadow = true;
    piece.receiveShadow = true;
    group.add(piece);

    return group;
  }

  private animateMove(mesh: THREE.Group, toSquare: string) {
    const from = mesh.position.clone();
    const to = sq2world(toSquare);
    to.y = 0.02;
    this.activeMoveAnims.set(mesh, {
      from,
      to,
      start: performance.now(),
      duration: 240,
    });
  }

  private updateMoveAnimations(now: number) {
    for (const [mesh, anim] of this.activeMoveAnims) {
      const t = Math.min((now - anim.start) / anim.duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const lift = Math.sin(t * Math.PI) * 0.22;

      mesh.position.x = anim.from.x + (anim.to.x - anim.from.x) * eased;
      mesh.position.z = anim.from.z + (anim.to.z - anim.from.z) * eased;
      mesh.position.y = 0.02 + lift;

      if (t >= 1) {
        mesh.position.copy(anim.to);
        this.activeMoveAnims.delete(mesh);
        playPiecePlace();
      }
    }
  }

  syncPieces(board: Record<string, Piece>, moved?: { from?: string | null; to?: string | null }) {
    const movedFrom = moved?.from ?? null;
    const movedTo = moved?.to ?? null;

    if (movedFrom && movedTo) {
      const movingMesh = this.pieceMeshes.get(movedFrom) ?? null;
      const movedPiece = board[movedTo];

      if (
        movingMesh &&
        movedPiece &&
        movingMesh.userData.type === movedPiece.type &&
        movingMesh.userData.color === movedPiece.color
      ) {
        const capturedMesh = this.pieceMeshes.get(movedTo) ?? null;
        if (capturedMesh && capturedMesh !== movingMesh) {
          this.scene.remove(capturedMesh);
          this.pieceMeshes.delete(movedTo);
          this.activeMoveAnims.delete(capturedMesh);
        }

        this.pieceMeshes.delete(movedFrom);
        this.pieceMeshes.set(movedTo, movingMesh);
        this.animateMove(movingMesh, movedTo);
      }
    }

    for (const [k, mesh] of this.pieceMeshes) {
      const p = board[k];
      if (!p || mesh.userData.type !== p.type || mesh.userData.color !== p.color) {
        this.scene.remove(mesh);
        this.pieceMeshes.delete(k);
        this.activeMoveAnims.delete(mesh);
      }
    }
    for (const sq of Object.keys(board)) {
      if (this.pieceMeshes.has(sq)) continue;
      const p = board[sq];
      const m = this.pieceMesh(p.type, p.color);
      m.userData = { type: p.type, color: p.color };
      const pos = sq2world(sq);
      m.position.set(pos.x, 0.02, pos.z);
      this.scene.add(m);
      this.pieceMeshes.set(sq, m);
    }
  }

  setHighlights(opts: { selected?: string | null; legal?: string[]; lastFrom?: string | null; lastTo?: string | null }) {
    for (const h of this.highlightMeshes) this.scene.remove(h);
    this.highlightMeshes = [];
    const add = (sq: string, color: number, opacity: number) => {
      const pos = sq2world(sq);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(pos.x, 0.05, pos.z);
      this.scene.add(m);
      this.highlightMeshes.push(m);
    };
    if (opts.lastFrom) add(opts.lastFrom, 0xfbbf24, 0.3);
    if (opts.lastTo) add(opts.lastTo, 0xfbbf24, 0.3);
    if (opts.selected) add(opts.selected, 0x6366f1, 0.45);
    (opts.legal ?? []).forEach(s => add(s, 0x22c55e, 0.35));
  }

  private onClick = (event: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    if (!hits.length) return;
    const sq = world2sq(hits[0].point.x, hits[0].point.z);
    if (sq && this.onSquareClick) this.onSquareClick(sq);
  };

  private animate = (now = performance.now()) => {
    if (this.disposed) return;
    this.animId = requestAnimationFrame(this.animate);
    this.updateMoveAnimations(now);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.disposed = true;
    this.themeCleanup?.();
    cancelAnimationFrame(this.animId);
    this.resizeObs.disconnect();
    this.renderer.domElement.removeEventListener('click', this.onClick);
    this.controls.dispose();
    this.renderer.dispose();
    this.activeMoveAnims.clear();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => m.dispose());
      }
    });
    this.renderer.domElement.parentElement?.removeChild(this.renderer.domElement);
  }
}
