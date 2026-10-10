import * as THREE from 'three';
import type { OfficerDef, WeaponKind } from '../sim/types';
import { J, Pose } from './pose';

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, opts: { metal?: number; rough?: number; emissive?: number } = {}) {
  const key = `${color}|${opts.metal ?? 0}|${opts.rough ?? 0.8}|${opts.emissive ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, metalness: opts.metal ?? 0, roughness: opts.rough ?? 0.8, emissive: opts.emissive ?? 0 });
    matCache.set(key, m);
  }
  return m;
}

const SKIN = 0xd9a47a;
const STEEL = 0xdfe6ee;
const WOOD = 0x4a3020;

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}
/** A four-sided tapered block: reads as armour plate rather than a toy brick. */
function taper(top: number, bot: number, h: number, depth: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(top * 0.707, bot * 0.707, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(1, 1, depth);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export interface WeaponInfo {
  group: THREE.Group;
  /** distance from grip to tip along local -Y */
  tip: number;
  base: number;
  twoHanded: boolean;
}

export function buildWeapon(kind: WeaponKind, accent: number): WeaponInfo {
  const g = new THREE.Group();
  const steel = mat(STEEL, { metal: 0.7, rough: 0.25, emissive: 0x30363c });
  const wood = mat(WOOD);
  const gold = mat(accent, { metal: 0.5, rough: 0.4 });
  switch (kind) {
    case 'yari': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 2.5, 6), wood);
      shaft.position.y = -0.45;
      shaft.castShadow = true;
      g.add(shaft);
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 4), steel);
      blade.rotation.x = Math.PI;
      blade.scale.z = 0.35;
      blade.position.y = -1.95;
      g.add(blade);
      const cross = box(0.5, 0.05, 0.02, steel, 0, -1.72, 0);
      g.add(cross);
      for (const s of [-1, 1]) {
        const hook = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 4), steel);
        hook.rotation.x = Math.PI;
        hook.position.set(s * 0.24, -1.8, 0);
        hook.scale.z = 0.4;
        g.add(hook);
      }
      g.add(box(0.07, 0.12, 0.07, gold, 0, -1.66, 0));
      const tassel = box(0.09, 0.16, 0.09, mat(0xb3261e), 0, -1.55, 0);
      g.add(tassel);
      return { group: g, tip: 2.2, base: 1.2, twoHanded: true };
    }
    case 'naginata': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 2.1, 6), mat(0x2a1612));
      shaft.position.y = -0.45;
      shaft.castShadow = true;
      g.add(shaft);
      // a long curved blade built from three canted segments
      for (let i = 0; i < 3; i++) {
        const seg = box(0.014, 0.3, 0.085 - i * 0.018, steel, 0, -1.62 - i * 0.27, 0.02 + i * i * 0.022);
        seg.rotation.x = -i * 0.16;
        g.add(seg);
      }
      g.add(box(0.07, 0.1, 0.07, gold, 0, -1.47, 0));
      g.add(box(0.05, 0.1, 0.05, gold, 0, 0.6, 0));
      return { group: g, tip: 2.35, base: 1.35, twoHanded: true };
    }
    case 'odachi': {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.6, 6), mat(0x1a1a22));
      handle.position.y = 0.06;
      g.add(handle);
      const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.022, 8), gold);
      tsuba.position.y = -0.25;
      g.add(tsuba);
      g.add(box(0.016, 1.75, 0.085, steel, 0, -1.14, 0));
      return { group: g, tip: 2.05, base: 0.4, twoHanded: true };
    }
    case 'kanabo': {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.7, 6), wood);
      handle.position.y = 0.05;
      g.add(handle);
      const club = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.07, 1.35, 6), mat(0x23232a, { metal: 0.6, rough: 0.5 }));
      club.rotation.x = Math.PI;
      club.position.y = -0.98;
      club.castShadow = true;
      g.add(club);
      for (let i = 0; i < 4; i++)
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * 6.28 + i * 0.5;
          const stud = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), gold);
          const r = 0.09 + i * 0.012;
          stud.position.set(Math.cos(a) * r, -0.7 - i * 0.28, Math.sin(a) * r);
          stud.rotation.z = -Math.PI / 2;
          stud.rotation.y = -a;
          g.add(stud);
        }
      return { group: g, tip: 1.7, base: 0.4, twoHanded: true };
    }
    case 'gun': {
      const stock = box(0.05, 0.5, 0.09, wood, 0, 0.12, -0.02);
      stock.rotation.x = 0.25;
      g.add(stock);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 1.25, 6), mat(0x2a2a30, { metal: 0.8, rough: 0.35 }));
      barrel.position.y = -0.62;
      barrel.castShadow = true;
      g.add(barrel);
      g.add(box(0.045, 1.0, 0.05, wood, 0, -0.5, -0.035));
      for (const y of [-0.3, -0.7, -1.1]) g.add(box(0.07, 0.03, 0.08, gold, 0, y, -0.01));
      const bayonet = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.28, 4), steel);
      bayonet.rotation.x = Math.PI;
      bayonet.position.set(0, -1.38, -0.04);
      g.add(bayonet);
      return { group: g, tip: 1.5, base: 0.5, twoHanded: true };
    }
    case 'kusarigama': {
      // the sickle in hand, its chain run out taut to the weight
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.42, 6), wood);
      handle.position.y = -0.02;
      g.add(handle);
      const blade = box(0.012, 0.36, 0.06, steel, 0, -0.26, 0.17);
      blade.rotation.x = Math.PI / 2;
      g.add(blade);
      const tipM = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), steel);
      tipM.rotation.x = -Math.PI / 2;
      tipM.scale.x = 0.3;
      tipM.position.set(0, -0.26, 0.4);
      g.add(tipM);
      const chainMat = mat(0x6a6e74, { metal: 0.8, rough: 0.4 });
      for (let i = 0; i < 16; i++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 3, 6), chainMat);
        link.position.y = -0.2 - i * 0.14;
        link.rotation.y = (i % 2) * (Math.PI / 2);
        g.add(link);
      }
      const weight = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(0x2a2a30, { metal: 0.7, rough: 0.4 }));
      weight.position.y = -2.5;
      weight.castShadow = true;
      g.add(weight);
      return { group: g, tip: 2.55, base: 1.4, twoHanded: false };
    }
    case 'tessen': {
      // an open iron fan: ribs fanned out above the grip, a painted leaf over them
      g.add(box(0.03, 0.2, 0.03, mat(0x1a1a22), 0, 0.02, 0));
      const leaf = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.012, 14, 1, false, Math.PI * 0.62, Math.PI * 0.76), mat(accent, { metal: 0.3, rough: 0.5 }));
      leaf.rotation.x = Math.PI / 2;
      leaf.position.set(0, -0.08, 0);
      leaf.rotation.z = Math.PI;
      leaf.castShadow = true;
      g.add(leaf);
      for (let i = 0; i < 7; i++) {
        const a = -0.95 + (i / 6) * 1.9;
        const rib = box(0.018, 0.5, 0.016, steel, Math.sin(a) * 0.25, -0.08 - Math.cos(a) * 0.25, 0.012);
        rib.rotation.z = -a;
        g.add(rib);
      }
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.016, 10), mat(0xb3261e));
      dot.rotation.x = Math.PI / 2;
      dot.position.set(0, -0.38, 0.01);
      g.add(dot);
      return { group: g, tip: 0.62, base: 0.15, twoHanded: false };
    }
    case 'masakari': {
      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 1.75, 6), wood);
      haft.position.y = -0.55;
      haft.castShadow = true;
      g.add(haft);
      // a broad crescent head, its spike behind
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 10, 1, false, -Math.PI * 0.32, Math.PI * 0.64), steel);
      head.rotation.z = Math.PI / 2;
      head.position.set(0, -1.25, 0.06);
      head.castShadow = true;
      g.add(head);
      g.add(box(0.06, 0.26, 0.16, mat(0x2a2a30, { metal: 0.7, rough: 0.4 }), 0, -1.3, 0));
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), steel);
      spike.rotation.x = -Math.PI / 2;
      spike.position.set(0, -1.3, -0.17);
      g.add(spike);
      g.add(box(0.05, 0.08, 0.05, gold, 0, -1.48, 0), box(0.05, 0.08, 0.05, gold, 0, 0.3, 0));
      return { group: g, tip: 1.62, base: 0.95, twoHanded: true };
    }
    case 'bo': {
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), mat(0x5a3a22));
      staff.position.y = -0.55;
      staff.castShadow = true;
      g.add(staff);
      for (const y of [0.6, -1.7]) g.add(box(0.075, 0.16, 0.075, mat(0x2a2a30, { metal: 0.7, rough: 0.4 }), 0, y, 0));
      for (const y of [0.2, -1.3]) g.add(box(0.068, 0.04, 0.068, gold, 0, y, 0));
      return { group: g, tip: 1.75, base: 0.4, twoHanded: true };
    }
    default: {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.34, 6), mat(0x1a1a22));
      handle.position.y = 0.02;
      g.add(handle);
      const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 8), gold);
      tsuba.position.y = -0.16;
      g.add(tsuba);
      const blade = box(0.012, 1.08, 0.05, steel, 0, -0.72, 0);
      g.add(blade);
      const tipM = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), steel);
      tipM.rotation.x = Math.PI;
      tipM.scale.x = 0.25;
      tipM.position.y = -1.3;
      g.add(tipM);
      return { group: g, tip: 1.35, base: 0.3, twoHanded: false };
    }
  }
}

function buildCrest(kind: OfficerDef['crest'], accent: number): THREE.Object3D {
  const g = new THREE.Group();
  const gold = mat(accent, { metal: 0.6, rough: 0.35, emissive: 0x221a05 });
  const horn = (side: number, len: number, lean: number, r = 0.035) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, len, 5), gold);
    c.position.set(side * 0.11, 0.2 + len * 0.4, 0.05);
    c.rotation.z = -side * lean;
    c.castShadow = true;
    g.add(c);
  };
  switch (kind) {
    case 'horns':
      horn(1, 0.34, 0.55);
      horn(-1, 0.34, 0.55);
      break;
    case 'antlers':
      for (const s of [1, -1]) {
        horn(s, 0.5, 0.45, 0.03);
        const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.2, 4), gold);
        t1.position.set(s * 0.24, 0.42, 0.05);
        t1.rotation.z = -s * 1.2;
        g.add(t1);
        const t2 = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.18, 4), gold);
        t2.position.set(s * 0.16, 0.52, 0.05);
        t2.rotation.z = s * 0.3;
        g.add(t2);
      }
      break;
    case 'crescent': {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.022, 4, 14, Math.PI * 0.95), gold);
      t.position.set(0.03, 0.38, 0.1);
      t.rotation.z = Math.PI * 0.1;
      t.scale.z = 0.5;
      g.add(t);
      break;
    }
    case 'sun': {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.015, 12), gold);
      d.rotation.x = Math.PI / 2;
      d.position.set(0, 0.34, 0.12);
      g.add(d);
      break;
    }
    case 'fan': {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.012, 10, 1, false, -Math.PI / 2.6, Math.PI / 1.3), gold);
      d.rotation.x = Math.PI / 2;
      d.position.set(0, 0.2, 0.12);
      g.add(d);
      break;
    }
    case 'cross':
      g.add(box(0.05, 0.36, 0.02, gold, 0, 0.36, 0.12), box(0.26, 0.05, 0.02, gold, 0, 0.4, 0.12));
      break;
    case 'plume': {
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), mat(0xf2efe6));
      p.position.set(0, 0.42, -0.04);
      p.rotation.x = -0.4;
      g.add(p);
      break;
    }
  }
  return g;
}

/** A jointed low-poly samurai. Feet at local origin, facing +Z. */
export class Rig {
  root = new THREE.Group();
  body = new THREE.Group();
  joints: THREE.Object3D[] = [];
  pose = new Pose();
  weapon: WeaponInfo;
  tip = new THREE.Object3D();
  baseMark = new THREE.Object3D();
  hipHeight = 0.95;
  private flashMats: THREE.MeshStandardMaterial[] = [];
  private offhand: THREE.Object3D | null = null;

  constructor(def: OfficerDef) {
    const prim = mat(def.primary, { rough: 0.55, metal: 0.25 });
    const sec = mat(def.secondary, { rough: 0.9 });
    const dark = mat(0x16161c, { rough: 0.6, metal: 0.3 });
    const skin = mat(SKIN);
    const trim = mat(0xc9a227, { metal: 0.6, rough: 0.35 });

    const j = (parent: THREE.Object3D, x: number, y: number, z: number) => {
      const o = new THREE.Group();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    this.root.add(this.body);
    const hips = j(this.body, 0, this.hipHeight, 0);
    const spine = j(hips, 0, 0.08, 0);
    const head = j(spine, 0, 0.56, 0);
    const armL = j(spine, 0.27, 0.45, 0);
    const foreL = j(armL, 0, -0.3, 0);
    const armR = j(spine, -0.27, 0.45, 0);
    const foreR = j(armR, 0, -0.3, 0);
    const legL = j(hips, 0.115, -0.04, 0);
    const shinL = j(legL, 0, -0.44, 0);
    const legR = j(hips, -0.115, -0.04, 0);
    const shinR = j(legR, 0, -0.44, 0);
    const weaponJ = j(foreR, 0, -0.3, 0);
    this.joints = [hips, spine, head, armL, foreL, armR, foreR, legL, shinL, legR, shinR, weaponJ];

    // pelvis + skirt plates
    hips.add(box(0.36, 0.18, 0.24, dark, 0, 0.02, 0));
    for (const [x, z, ry] of [
      [0, 0.14, 0],
      [0, -0.14, 0],
      [0.19, 0, Math.PI / 2],
      [-0.19, 0, Math.PI / 2],
    ] as const) {
      const p = taper(0.2, 0.26, 0.3, 0.22, prim, x, -0.17, z);
      p.rotation.y = ry;
      hips.add(p);
      const t = box(0.26, 0.03, 0.062, trim, x, -0.31, z);
      t.rotation.y = ry;
      hips.add(t);
    }
    // cuirass
    spine.add(taper(0.5, 0.36, 0.52, 0.56, prim, 0, 0.27, 0));
    spine.add(box(0.3, 0.1, 0.02, trim, 0, 0.4, 0.14));
    spine.add(box(0.37, 0.07, 0.3, dark, 0, 0.02, 0));
    spine.add(box(0.14, 0.1, 0.14, skin, 0, 0.53, 0)); // neck
    // back banner
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.25, 4), dark);
    pole.position.set(0, 0.75, -0.17);
    spine.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.72), new THREE.MeshStandardMaterial({ color: def.primary, side: THREE.DoubleSide, roughness: 1, emissive: def.primary, emissiveIntensity: 0.25 }));
    flag.position.set(0.18, 1.0, -0.17);
    flag.castShadow = true;
    spine.add(flag);
    spine.add(box(0.34, 0.06, 0.012, trim, 0.18, 1.3, -0.17));

    // head + kabuto
    head.add(box(0.19, 0.2, 0.2, skin, 0, 0.1, 0));
    head.add(box(0.2, 0.08, 0.1, dark, 0, 0.03, 0.065)); // mask
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    bowl.position.y = 0.15;
    bowl.scale.set(1, 0.95, 1.08);
    bowl.castShadow = true;
    head.add(bowl);
    const neckGuard = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.25, 0.14, 8, 1, true, Math.PI * 0.55, Math.PI * 0.9 * 2), mat(def.primary, { rough: 0.55, metal: 0.25 }));
    (neckGuard.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    neckGuard.position.set(0, 0.1, -0.02);
    head.add(neckGuard);
    head.add(box(0.26, 0.02, 0.12, dark, 0, 0.16, 0.13)); // visor
    head.add(buildCrest(def.crest, 0xd9b23a));

    // arms
    for (const [arm, fore, s] of [
      [armL, foreL, 1],
      [armR, foreR, -1],
    ] as const) {
      arm.add(box(0.11, 0.3, 0.11, sec, 0, -0.15, 0));
      const sode = taper(0.16, 0.2, 0.26, 1.1, prim, s * 0.045, -0.1, 0);
      arm.add(sode);
      arm.add(box(0.21, 0.03, 0.23, trim, s * 0.045, -0.235, 0));
      fore.add(box(0.1, 0.27, 0.1, dark, 0, -0.14, 0));
      fore.add(box(0.105, 0.14, 0.06, prim, 0, -0.14, 0.03));
      fore.add(box(0.09, 0.09, 0.09, skin, 0, -0.31, 0));
    }
    // legs
    for (const [leg, shin] of [
      [legL, shinL],
      [legR, shinR],
    ] as const) {
      leg.add(taper(0.17, 0.2, 0.44, 1, sec, 0, -0.22, 0));
      shin.add(box(0.12, 0.42, 0.13, dark, 0, -0.21, 0));
      shin.add(box(0.13, 0.26, 0.06, prim, 0, -0.2, 0.045));
      shin.add(box(0.11, 0.07, 0.25, dark, 0, -0.455, 0.05));
    }

    this.weapon = buildWeapon(def.weapon, 0xd9b23a);
    weaponJ.add(this.weapon.group);
    if (def.weapon === 'dual') {
      this.offhand = j(foreL, 0, -0.3, 0);
      this.offhand.add(buildWeapon('katana', 0xd9b23a).group);
    }
    this.tip.position.y = -this.weapon.tip;
    this.baseMark.position.y = -this.weapon.base;
    weaponJ.add(this.tip, this.baseMark);

    this.root.scale.setScalar((def.scale ?? 1) * 1.06);
    // Each rig owns its materials so it can flash white on hit without lighting up everyone else.
    const clones = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      let c = clones.get(src);
      if (!c) {
        c = src.clone();
        c.userData.em = src.emissive.getHex();
        c.userData.ei = src.emissiveIntensity;
        clones.set(src, c);
        this.flashMats.push(c);
      }
      mesh.material = c;
    });
  }

  /** Seat the legs astride whatever the upper body is doing. */
  saddle() {
    SADDLE.forEach(([j, x, z]) => this.joints[j].rotation.set(x, 0, z));
  }

  private flashing = false;
  setFlash(on: boolean, color = 0xffffff, intensity = 0.8) {
    if (on === this.flashing && !on) return;
    this.flashing = on;
    for (const m of this.flashMats) {
      if (on) {
        m.emissive.setHex(color);
        m.emissiveIntensity = intensity;
      } else {
        m.emissive.setHex(m.userData.em);
        m.emissiveIntensity = m.userData.ei;
      }
    }
  }

  setOpacity(a: number) {
    for (const m of this.flashMats) {
      m.transparent = a < 1;
      m.opacity = a;
    }
  }

  apply(p: Pose) {
    for (let i = 0; i < J.COUNT; i++) this.joints[i].quaternion.copy(p.q[i]);
    this.joints[J.hips].position.y = this.hipHeight + p.y;
    this.offhand?.quaternion.copy(p.q[J.weapon]);
    this.body.rotation.y = (p.spin * Math.PI) / 180;
  }
}


const SADDLE: [number, number, number][] = [
  [J.legL, -0.7, 0.62],
  [J.legR, -0.7, -0.62],
  [J.shinL, 1.1, 0],
  [J.shinR, 1.1, 0],
];
