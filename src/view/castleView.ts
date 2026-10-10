import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Castle, Gate } from '../sim/castle';

const STONE = 0x77726a,
  PLASTER = 0xebe6da,
  WOOD = 0x2e2520,
  TILE = 0x353840,
  DOOR = 0x4a3424,
  IRON = 0x24242a,
  GOLD = 0xc9a227;

interface GateView {
  g: Gate;
  doors: THREE.Object3D[];
  open: number;
  wrecked: boolean;
  root: THREE.Group;
}

/** Builds castle walls, gatehouses, turrets and keeps; keeps gates in step with the sim. */
export class CastleView {
  group = new THREE.Group();
  private gates: GateView[] = [];
  /** pieces by material, merged into one mesh each */
  private parts = new Map<number, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private static UP = new THREE.Vector3(0, 1, 0);

  constructor(
    castles: Castle[],
    private gy: (x: number, z: number) => number,
  ) {
    for (const c of castles) this.castle(c);
    for (const [color, geos] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color, flatShading: true }));
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.parts.clear();
  }

  /** A box of size (w, h, d) centred at (x, y, z), turned `yaw` about the vertical, added to the merged pieces. */
  private piece(color: number, w: number, h: number, d: number, x: number, y: number, z: number, yaw: number, geo?: THREE.BufferGeometry) {
    const g = (geo ?? new THREE.BoxGeometry(1, 1, 1)).toNonIndexed();
    g.deleteAttribute('uv');
    this.q.setFromAxisAngle(CastleView.UP, yaw);
    g.applyMatrix4(this.m.compose(this.v.set(x, y, z), this.q, this.s.set(w, h, d)));
    let list = this.parts.get(color);
    if (!list) this.parts.set(color, (list = []));
    list.push(g);
  }

  /** A four-sided hipped roof. */
  private roof(w: number, h: number, d: number, x: number, y: number, z: number, yaw: number) {
    const cone = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    cone.rotateY(Math.PI / 4);
    this.piece(TILE, w, h, d, x, y + h / 2, z, yaw, cone);
  }

  private castle(c: Castle) {
    const base = this.gy(c.x, c.z);
    for (const w of c.walls) {
      if (w.gate) continue;
      const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
      const yaw = Math.atan2(-(w.bz - w.az), w.bx - w.ax);
      const mx = (w.ax + w.bx) / 2,
        mz = (w.az + w.bz) / 2;
      // sloped stone footing, a white plastered wall on a dark board skirt, and a tiled cap
      this.piece(STONE, len + 0.6, 1.5, 2.3, mx, base + 0.65, mz, yaw);
      this.piece(STONE, len + 0.3, 0.5, 1.8, mx, base + 1.6, mz, yaw);
      this.piece(WOOD, len, 0.7, 1.05, mx, base + 2.2, mz, yaw);
      this.piece(PLASTER, len, 1.7, 0.95, mx, base + 3.35, mz, yaw);
      this.piece(TILE, len + 0.35, 0.22, 1.75, mx, base + 4.3, mz, yaw);
      this.piece(TILE, len + 0.35, 0.18, 0.5, mx, base + 4.48, mz, yaw);
    }
    // corner turrets at the vertices between the gates
    const verts = c.walls.filter((w) => !w.gate).map((w) => [w.ax, w.az] as const);
    verts.forEach(([x, z], i) => {
      if (i % 4 !== 2) return;
      const yaw = Math.atan2(x - c.x, z - c.z);
      this.piece(STONE, 4.4, 2.2, 4.4, x, base + 1.1, z, yaw);
      this.piece(PLASTER, 3.8, 3.2, 3.8, x, base + 3.8, z, yaw);
      this.piece(WOOD, 3.85, 0.4, 3.85, x, base + 2.4, z, yaw);
      this.roof(5.6, 2.2, 5.6, x, base + 5.4, z, yaw);
    });
    for (const g of c.gates) this.gate(g, base);
    if (c.keep) {
      if (/temple/i.test(c.name)) this.hall(c.keep.x, c.keep.z, base, Math.atan2(c.x - c.keep.x, c.z - c.keep.z));
      else this.keep(c.keep.x, c.keep.z, base, Math.atan2(c.x - c.keep.x, c.z - c.keep.z));
    }
  }

  /** A gatehouse over the opening: posts, a beam and a roof, with two doors hung on the posts. */
  private gate(g: Gate, base: number) {
    // the wall runs across the normal
    const yaw = Math.atan2(g.nx, g.nz);
    const ux = Math.cos(yaw),
      uz = -Math.sin(yaw);
    const hw = 2.6;
    for (const sd of [-1, 1]) {
      const px = g.x + ux * sd * (hw + 0.35),
        pz = g.z + uz * sd * (hw + 0.35);
      this.piece(STONE, 1.6, 1.6, 2.6, px, base + 0.8, pz, yaw);
      this.piece(WOOD, 0.6, 4.6, 0.9, px, base + 3.2, pz, yaw);
    }
    this.piece(WOOD, hw * 2 + 1.6, 0.6, 1.1, g.x, base + 5.2, g.z, yaw);
    this.piece(PLASTER, hw * 2 + 1.2, 1.0, 0.9, g.x, base + 5.95, g.z, yaw);
    this.roof(hw * 2 + 3.4, 1.8, 4.2, g.x, base + 6.4, g.z, yaw);
    // doors: each hinged on its post, swinging inward
    const root = new THREE.Group();
    root.position.set(g.x, base, g.z);
    root.rotation.y = yaw;
    const doorMat = new THREE.MeshLambertMaterial({ color: DOOR, flatShading: true });
    const ironMat = new THREE.MeshLambertMaterial({ color: IRON, flatShading: true });
    const doors: THREE.Object3D[] = [];
    for (const sd of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(sd * hw, 0, 0);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(hw, 4.4, 0.32), doorMat);
      leaf.position.set(-sd * hw * 0.5, 2.3, 0);
      leaf.castShadow = true;
      hinge.add(leaf);
      for (const y of [1.0, 2.3, 3.6]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.96, 0.16, 0.36), ironMat);
        band.position.set(-sd * hw * 0.5, y, 0);
        hinge.add(band);
      }
      root.add(hinge);
      doors.push(hinge);
    }
    this.group.add(root);
    this.gates.push({ g, doors, open: 0, wrecked: false, root });
  }

  /** A three-storey keep on a stone base. */
  private keep(x: number, z: number, base: number, yaw: number) {
    this.piece(STONE, 11, 3, 11, x, base + 1.5, z, yaw);
    let y = base + 3;
    const tiers: [number, number][] = [
      [8.6, 3.4],
      [6.6, 3],
      [4.8, 2.8],
    ];
    tiers.forEach(([w, h], i) => {
      this.piece(PLASTER, w, h, w * 0.85, x, y + h / 2, z, yaw);
      this.piece(WOOD, w + 0.05, 0.5, w * 0.85 + 0.05, x, y + 0.25, z, yaw);
      y += h;
      this.roof(w + 2.6, i === tiers.length - 1 ? 2.6 : 1.4, w * 0.85 + 2.6, x, y - 0.3, z, yaw);
      y += i === tiers.length - 1 ? 0 : 0.6;
    });
    // golden finials on the ridge
    for (const sd of [-1, 1]) this.piece(GOLD, 0.35, 0.7, 0.35, x + Math.cos(yaw) * sd * 1.2, y + 2.1, z - Math.sin(yaw) * sd * 1.2, yaw);
  }

  /** A temple's main hall under one great roof. */
  private hall(x: number, z: number, base: number, yaw: number) {
    this.piece(STONE, 13, 1, 10, x, base + 0.5, z, yaw);
    this.piece(WOOD, 10.5, 4.2, 7.6, x, base + 3.1, z, yaw);
    this.piece(PLASTER, 10.6, 1.6, 7.7, x, base + 4.2, z, yaw);
    this.roof(15.5, 5.2, 12, x, base + 5, z, yaw);
  }

  /** Doors swing open for their own side; a broken gate leaves splintered timber in the gateway. */
  update(dt: number) {
    for (const gv of this.gates) {
      const g = gv.g;
      if (g.broken && !gv.wrecked) {
        gv.wrecked = true;
        for (const d of gv.doors) d.visible = false;
        const mat = (gv.doors[0].children[0] as THREE.Mesh).material as THREE.Material;
        for (let i = 0; i < 7; i++) {
          const plank = new THREE.Mesh(new THREE.BoxGeometry(0.5 + Math.random() * 1.6, 0.18, 0.5 + Math.random() * 0.4), mat);
          plank.position.set((Math.random() - 0.5) * 4.5, 0.15 + Math.random() * 0.2, (Math.random() - 0.3) * 3);
          plank.rotation.set(Math.random() * 0.4, Math.random() * 6.28, Math.random() * 0.4);
          plank.castShadow = true;
          gv.root.add(plank);
        }
      }
      if (gv.wrecked) continue;
      const want = g.open ? 1 : 0;
      gv.open += (want - gv.open) * Math.min(1, dt * 3);
      // a struck gate shudders on its hinges
      const shake = g.hitT > 0 ? Math.sin(g.hitT * 80) * 0.03 * (g.hitT / 0.25) : 0;
      // both leaves swing inward, away from the attackers
      gv.doors[0].rotation.y = gv.open * 1.75 + shake;
      gv.doors[1].rotation.y = -gv.open * 1.75 - shake;
    }
  }
}
