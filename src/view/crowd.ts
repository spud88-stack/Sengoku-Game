import * as THREE from 'three';
import { TUNE } from '../data/tuning';
import { SK, SS, type Soldier, type World } from '../sim/world';

const MAX = 1000;
const S = TUNE.soldier;

/** Rank-and-file troops drawn as a handful of instanced meshes: one draw call per body part for the whole army. */
export class Crowd {
  group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private hat: THREE.InstancedMesh;
  private armL: THREE.InstancedMesh;
  private armR: THREE.InstancedMesh;
  private legL: THREE.InstancedMesh;
  private legR: THREE.InstancedMesh;
  private spear: THREE.InstancedMesh;
  private flag: THREE.InstancedMesh;
  private shield: THREE.InstancedMesh;
  private bow: THREE.InstancedMesh;
  private gun: THREE.InstancedMesh;
  private horse: THREE.InstancedMesh;
  private arrows: THREE.InstancedMesh;
  private everyone: THREE.InstancedMesh[];
  private tumble = new Float32Array(MAX);
  private lastUid = new Int32Array(MAX);
  private teamColors: THREE.Color[];
  private white = new THREE.Color(0xffffff);
  private col = new THREE.Color();

  constructor(teamColors: number[]) {
    this.teamColors = teamColors.map((c) => new THREE.Color(c));
    const lam = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true, cap = MAX) => {
      const im = new THREE.InstancedMesh(g, m, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = shadow;
      im.frustumCulled = false;
      im.count = 0;
      this.group.add(im);
      return im;
    };
    // geometry is authored with its pivot at the origin
    const bodyG = new THREE.CylinderGeometry(0.2, 0.26, 0.62, 5);
    bodyG.translate(0, 0.31, 0);
    this.body = mk(bodyG, lam(0xffffff));
    const headG = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    headG.translate(0, 0.74, 0);
    this.head = mk(headG, lam(0xd9a47a), false);
    const hatG = new THREE.ConeGeometry(0.3, 0.16, 7);
    hatG.translate(0, 0.9, 0);
    this.hat = mk(hatG, lam(0xffffff));
    const armG = new THREE.BoxGeometry(0.09, 0.5, 0.09);
    armG.translate(0, -0.22, 0);
    this.armL = mk(armG, lam(0x2a2a30), false);
    this.armR = mk(armG, lam(0x2a2a30), false);
    const legG = new THREE.BoxGeometry(0.13, 0.8, 0.14);
    legG.translate(0, -0.4, 0);
    this.legL = mk(legG, lam(0x23232a));
    this.legR = mk(legG, lam(0x23232a));
    const shaft = new THREE.CylinderGeometry(0.02, 0.02, 2.3, 4);
    shaft.translate(0, -0.6, 0);
    const tipG = new THREE.ConeGeometry(0.045, 0.3, 4);
    tipG.rotateX(Math.PI);
    tipG.translate(0, -1.9, 0);
    this.spear = mk(mergeSimple([shaft, tipG]), lam(0xb9b4a8), false);
    const flagG = new THREE.PlaneGeometry(0.26, 0.6);
    flagG.translate(0.13, 1.75, -0.16);
    const pole = new THREE.CylinderGeometry(0.01, 0.01, 1.2, 3);
    pole.translate(0, 1.5, -0.16);
    this.flag = mk(mergeSimple([flagG, pole]), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), false, 300);
    // a tall wooden pavise carried on the left arm
    const shG = new THREE.BoxGeometry(0.62, 1.05, 0.06);
    shG.translate(0.08, 0.25, 0.34);
    this.shield = mk(shG, lam(0xffffff), true, 300);
    const bowG = new THREE.TorusGeometry(0.5, 0.018, 3, 8, Math.PI);
    bowG.rotateZ(-Math.PI / 2);
    bowG.rotateY(Math.PI / 2);
    bowG.translate(0.26, 0.45, 0.3);
    this.bow = mk(bowG, lam(0x3a2a1a), false, 300);
    const gunG = new THREE.BoxGeometry(0.05, 0.07, 1.15);
    gunG.translate(-0.18, 0.5, 0.45);
    this.gun = mk(gunG, lam(0x2a2422), false, 300);
    this.horse = mk(horseGeometry(), lam(0xffffff), true, 200);
    const arrowG = new THREE.BoxGeometry(0.03, 0.03, 0.9);
    this.arrows = mk(arrowG, new THREE.MeshBasicMaterial({ color: 0xffffff }), false, 400);
    this.everyone = [this.body, this.head, this.hat, this.armL, this.armR, this.legL, this.legR];
  }

  private M = new THREE.Matrix4();
  private L = new THREE.Matrix4();
  private R = new THREE.Matrix4();
  private O = new THREE.Matrix4();
  private horseBrown = [new THREE.Color(0x4a3222), new THREE.Color(0x2a221c), new THREE.Color(0x6a5238), new THREE.Color(0x8a7a66)];

  private part(mesh: THREE.InstancedMesh, n: number, x: number, y: number, z: number, rx: number) {
    this.L.makeRotationX(rx);
    this.L.elements[12] = x;
    this.L.elements[13] = y;
    this.L.elements[14] = z;
    this.O.multiplyMatrices(this.M, this.L);
    mesh.setMatrixAt(n, this.O);
  }

  update(w: World, alpha: number, dt: number) {
    let n = 0,
      flags = 0,
      spears = 0,
      shields = 0,
      bows = 0,
      guns = 0,
      horses = 0;
    const sol = w.soldiers;
    const T = w.terrain;
    for (let i = 0; i < sol.length; i++) {
      const s: Soldier = sol[i];
      if (!s.active) continue;
      if (this.lastUid[i] !== s.uid) {
        this.lastUid[i] = s.uid;
        this.tumble[i] = 0;
      }
      const x = s.px + (s.x - s.px) * alpha,
        z = s.pz + (s.z - s.pz) * alpha;
      const g = T.height(x, z);
      let y = g + s.py + (s.y - s.py) * alpha;
      const kind = s.kind;
      const ranged = kind === SK.Archer || kind === SK.Gunner;

      let pitch = 0,
        lean = 0,
        legA = 0,
        armR = -0.5,
        armL = 0,
        spearRx = -2.65;
      const st = s.st;
      const upright = st !== SS.Air && st !== SS.Down && st !== SS.Corpse;
      const mounted = kind === SK.Cavalry && upright;
      if (st === SS.Air) {
        this.tumble[i] += s.spin * dt;
        pitch = this.tumble[i];
        y += 0.5;
        legA = 0.5;
        armL = -2;
        armR = -2.4;
      } else if (st === SS.Down || st === SS.Corpse) {
        pitch = -Math.PI / 2;
        y += 0.22;
        if (st === SS.Corpse && s.t < 1) y -= (1 - s.t) * 0.6;
        armL = -1.4;
        armR = -1.9;
        legA = 0.2;
      } else if (st === SS.Stagger) {
        lean = -0.45;
        armL = -1.2;
        armR = -0.9;
        legA = 0.3;
      } else if (st === SS.Windup) {
        const k = 1 - s.t / S.windup;
        if (ranged) {
          // draw or shoulder the weapon
          armL = -1.5;
          armR = -1.2;
        } else {
          lean = -0.22 * k;
          armR = 0.7 * k - 0.5;
          spearRx = -1.95 + 0.2 * k;
          legA = -0.3 * k;
        }
      } else if (st === SS.Strike || st === SS.Recover) {
        if (ranged) {
          armL = -1.5;
          armR = -0.9;
          lean = -0.1;
        } else {
          lean = 0.3;
          armR = -1.7;
          spearRx = -1.5;
          legA = mounted ? 0 : 0.5;
        }
      } else {
        const sw = Math.sin(s.phase);
        const moving = Math.min(1, (s.vx * s.vx + s.vz * s.vz) * 0.3);
        legA = sw * 0.75 * moving;
        armL = -sw * 0.6 * moving;
        y += Math.abs(Math.cos(s.phase)) * 0.04 * moving;
        if (s.tf || s.ts) {
          armR = -1.1;
          spearRx = -1.8;
          if (kind === SK.Shield) armL = -1.2;
        }
      }
      if (mounted) {
        y += 0.78 + Math.abs(Math.sin(s.phase * 0.5)) * 0.1;
        legA = 0;
        lean = 0.15;
      }

      const scale = kind === SK.Captain ? 1.18 : 1;
      // root: translate, yaw, then pitch about the hips
      this.M.makeRotationY(s.face);
      if (pitch !== 0 || lean !== 0) {
        this.R.makeRotationX(pitch + lean);
        this.M.multiply(this.R);
      }
      if (scale !== 1) this.M.scale(VSCALE.set(scale, scale, scale));
      const e = this.M.elements;
      const hipY = pitch !== 0 ? 0 : 0.82 * scale;
      e[12] = x;
      e[13] = y + hipY;
      e[14] = z;
      const off = pitch !== 0 ? -0.2 : 0;

      this.part(this.body, n, 0, off, 0, 0);
      this.part(this.head, n, 0, off, 0, 0);
      this.part(this.hat, n, 0, off, 0, 0);
      this.part(this.armL, n, 0.26, off + 0.56, 0, armL);
      this.part(this.armR, n, -0.26, off + 0.56, 0, armR);
      this.part(this.legL, n, mounted ? 0.3 : 0.1, off, 0, mounted ? -0.5 : -legA);
      this.part(this.legR, n, mounted ? -0.3 : -0.1, off, 0, mounted ? -0.5 : legA);

      const flash = st === SS.Stagger && s.t > S.staggerTime - 0.07;
      const c = flash ? this.white : this.teamColors[s.team];
      this.body.setColorAt(n, c);
      this.hat.setColorAt(n, kind === SK.Captain ? this.white : this.col.copy(c).multiplyScalar(ranged ? 0.3 : 0.55));

      if (!ranged) {
        // spear rides in the right hand
        const hy = off + 0.56 - Math.cos(armR) * 0.44,
          hz = -Math.sin(armR) * 0.44;
        this.part(this.spear, spears++, -0.26, hy, hz, spearRx);
      } else if (upright) {
        if (kind === SK.Gunner && guns < 300) this.part(this.gun, guns++, 0, 0, 0, st === SS.Windup || st === SS.Strike ? 0 : 0.5);
        else if (bows < 300) this.part(this.bow, bows++, 0, 0, 0, 0);
      }
      if (kind === SK.Shield && upright && shields < 300) {
        this.part(this.shield, shields, 0, 0, 0, 0);
        this.shield.setColorAt(shields++, this.col.set(0x7a5a36).lerp(this.teamColors[s.team], 0.3));
      }
      if ((kind === SK.Banner || kind === SK.Captain) && pitch === 0 && flags < 300) {
        this.flag.setMatrixAt(flags, this.M);
        this.flag.setColorAt(flags++, this.teamColors[s.team]);
      }
      if (mounted && horses < 200) {
        this.M.makeRotationY(s.face);
        e[12] = x;
        e[13] = g + s.y + Math.abs(Math.sin(s.phase * 0.5)) * 0.1;
        e[14] = z;
        this.horse.setMatrixAt(horses, this.M);
        this.horse.setColorAt(horses++, this.horseBrown[s.uid % 4]);
      }
      n++;
    }
    for (const m of this.everyone) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
    const set = (m: THREE.InstancedMesh, c: number) => {
      m.count = c;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    set(this.spear, spears);
    set(this.flag, flags);
    set(this.shield, shields);
    set(this.bow, bows);
    set(this.gun, guns);
    set(this.horse, horses);
    for (const m of [this.body, this.hat]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

    // arrows and shot in flight
    let a = 0;
    for (const sh of w.shots) {
      if (a >= 400) break;
      this.M.makeRotationY(Math.atan2(sh.vx, sh.vz));
      const el = this.M.elements;
      el[12] = sh.x;
      el[13] = sh.y + T.height(sh.x, sh.z);
      el[14] = sh.z;
      if (sh.gun) this.M.scale(VSCALE.set(1.6, 1.6, 2.6));
      this.arrows.setMatrixAt(a, this.M);
      this.arrows.setColorAt(a++, sh.gun ? GUNCOL : ARROWCOL);
    }
    set(this.arrows, a);
  }
}
const VSCALE = new THREE.Vector3();
const GUNCOL = new THREE.Color(0xffd890);
const ARROWCOL = new THREE.Color(0x3a2e22);

/** One horse, shared by cavalry instances and officers' mounts. */
export function horseGeometry(): THREE.BufferGeometry {
  const hb = new THREE.BoxGeometry(0.5, 0.55, 1.5);
  hb.translate(0, 1.0, 0);
  const neck = new THREE.BoxGeometry(0.24, 0.7, 0.3);
  neck.rotateX(0.6);
  neck.translate(0, 1.45, 0.8);
  const hh = new THREE.BoxGeometry(0.22, 0.26, 0.5);
  hh.translate(0, 1.72, 1.12);
  const legs = [
    [-0.18, 0.55],
    [0.18, 0.55],
    [-0.18, -0.55],
    [0.18, -0.55],
  ].map(([x, z]) => {
    const l = new THREE.BoxGeometry(0.12, 0.8, 0.12);
    l.translate(x, 0.4, z);
    return l;
  });
  const tail = new THREE.BoxGeometry(0.08, 0.5, 0.08);
  tail.rotateX(-0.5);
  tail.translate(0, 0.95, -0.85);
  return mergeSimple([hb, neck, hh, tail, ...legs]);
}

/** Minimal non-indexed merge so we don't pull in BufferGeometryUtils for a few shapes. */
function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [],
    nor: number[] = [];
  for (const g0 of geos) {
    const g = g0.toNonIndexed();
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
