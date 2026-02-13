import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Piece = { type: string; color: 'w' | 'b' };

const files = 'abcdefghi';
const HALF_W = 4.5;
const HALF_H = 5;

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

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 700;
    const h = container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f0f1a);

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
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 0.16, 10.6),
      new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.85 }),
    );
    frame.position.y = -0.1;
    frame.receiveShadow = true;
    this.scene.add(frame);

    for (let f = 0; f < 9; f++) {
      for (let r = 1; r <= 10; r++) {
        const pos = sq2world(`${files[f]}${r}`);
        const sq = new THREE.Mesh(
          new THREE.BoxGeometry(1, 0.07, 1),
          new THREE.MeshStandardMaterial({ color: (f + r) % 2 ? 0xd3ab7d : 0xbc8b5a, roughness: 0.72 }),
        );
        sq.position.set(pos.x, 0, pos.z);
        sq.receiveShadow = true;
        this.scene.add(sq);
      }
    }
  }

  private pieceMesh(type: string, color: 'w' | 'b') {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: color === 'w' ? 0xb91c1c : 0x1d4ed8, roughness: 0.34 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.12, 30), mat);
    base.position.y = 0.06;
    base.castShadow = true;
    group.add(base);

    const h = ({ king: 0.28, guard: 0.22, rook: 0.26, cannon: 0.30, horse: 0.25, elephant: 0.27, soldier: 0.2 } as Record<string, number>)[type] ?? 0.22;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, h, 20), mat);
    top.position.y = 0.15 + h / 2;
    top.castShadow = true;
    group.add(top);
    return group;
  }

  syncPieces(board: Record<string, Piece>) {
    for (const [k, mesh] of this.pieceMeshes) {
      const p = board[k];
      if (!p || mesh.userData.type !== p.type || mesh.userData.color !== p.color) {
        this.scene.remove(mesh);
        this.pieceMeshes.delete(k);
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

  private animate = () => {
    if (this.disposed) return;
    this.animId = requestAnimationFrame(this.animate);
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
    cancelAnimationFrame(this.animId);
    this.resizeObs.disconnect();
    this.renderer.domElement.removeEventListener('click', this.onClick);
    this.controls.dispose();
    this.renderer.dispose();
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
