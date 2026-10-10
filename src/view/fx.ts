import * as THREE from 'three';
import { TUNE } from '../data/tuning';

const G = 22;

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  stretch: number;
  grav: number;
  drag: number;
  r: number;
  g: number;
  b: number;
  blood: boolean;
  /** keep full size and brightness to the end (arrows in flight) */
  hold?: boolean;
}

/** A pooled set of stretched-quad particles rendered in one draw call. */
class ParticleLayer {
  mesh: THREE.InstancedMesh;
  ps: P[] = [];
  private cap: number;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private col = new THREE.Color();
  private static Z = new THREE.Vector3(0, 0, 1);

  constructor(cap: number, additive: boolean) {
    this.cap = cap;
    const g = new THREE.OctahedronGeometry(0.5, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !additive,
      fog: !additive,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  add(p: P) {
    if (this.ps.length >= this.cap) this.ps.shift();
    this.ps.push(p);
  }

  update(dt: number, ground: (x: number, z: number) => number, onGround?: (p: P) => void) {
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life -= dt;
      p.vy -= G * p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.grav > 0 && p.vy < 0 && p.y <= ground(p.x, p.z) + 0.02) {
        if (p.blood && onGround) onGround(p);
        p.life = 0;
      }
      if (p.life <= 0) {
        this.ps[i] = this.ps[this.ps.length - 1];
        this.ps.pop();
      }
    }
    for (const p of this.ps) {
      const k = p.life / p.max;
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      this.dir.set(p.vx, p.vy, p.vz);
      if (sp > 0.001) this.dir.multiplyScalar(1 / sp);
      else this.dir.set(0, 1, 0);
      this.q.setFromUnitVectors(ParticleLayer.Z, this.dir);
      const sz = p.size * (p.blood || p.hold ? 1 : Math.min(1, k * 2.5));
      this.s.set(sz, sz, sz * (1 + sp * p.stretch));
      this.p.set(p.x, p.y, p.z);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      const f = p.blood || p.hold ? 1 : k;
      this.mesh.setColorAt(n, this.col.setRGB(p.r * f, p.g * f, p.b * f));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const DSCALE = new THREE.Vector3();
const DPOS = new THREE.Vector3();

function splatTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
  g.fillStyle = '#fff';
  // a blot with thrown fingers, like ink flicked off a brush
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.28,
      r = rnd() * 16;
    g.beginPath();
    g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 12 + rnd() * 16, 0, 6.28);
    g.fill();
  }
  for (let i = 0; i < 14; i++) {
    const a = rnd() * 6.28,
      len = 28 + rnd() * 30;
    g.beginPath();
    g.ellipse(64 + Math.cos(a) * len * 0.7, 64 + Math.sin(a) * len * 0.7, 2 + rnd() * 5, 6 + rnd() * 12, a + Math.PI / 2, 0, 6.28);
    g.fill();
    g.beginPath();
    g.arc(64 + Math.cos(a) * (len + 6), 64 + Math.sin(a) * (len + 6), 1.5 + rnd() * 3, 0, 6.28);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function radialTexture(kind: 'glow' | 'ring' | 'star'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  if (kind === 'glow') {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  } else if (kind === 'ring') {
    const gr = g.createRadialGradient(64, 64, 34, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.85, 'rgba(255,255,255,0.4)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  } else {
    g.translate(64, 64);
    g.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 4);
      g.beginPath();
      g.ellipse(0, 0, 62, i % 2 ? 3 : 6, 0, 0, 6.28);
      g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(-64, -64, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

interface Flash {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  s0: number;
  s1: number;
  flat: boolean;
}

const TRAIL_N = 14;
const TRAIL_SUB = 3;

/** Additive ribbon that follows a weapon. Samples are smoothed so fast swings draw as arcs, not polygons. */
export class Trail {
  mesh: THREE.Mesh;
  private tips: THREE.Vector3[] = [];
  private bases: THREE.Vector3[] = [];
  private ages: number[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private geo: THREE.BufferGeometry;
  color = new THREE.Color(1, 1, 1);
  life = 0.16;

  constructor(color: number) {
    this.color.set(color);
    const verts = ((TRAIL_N - 1) * TRAIL_SUB + 1) * 2;
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < verts / 2 - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, transparent: true, fog: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** Call every frame; pass null points when the weapon isn't cutting. */
  update(dt: number, tip: THREE.Vector3 | null, base: THREE.Vector3 | null) {
    for (let i = 0; i < this.ages.length; i++) this.ages[i] += dt;
    while (this.ages.length && this.ages[this.ages.length - 1] > this.life) {
      this.ages.pop();
      this.tips.pop();
      this.bases.pop();
    }
    if (tip && base) {
      this.tips.unshift(tip.clone());
      this.bases.unshift(base.clone());
      this.ages.unshift(0);
      if (this.tips.length > TRAIL_N) {
        this.tips.pop();
        this.bases.pop();
        this.ages.pop();
      }
    }
    const n = this.tips.length;
    if (n < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    let v = 0;
    const put = (p: THREE.Vector3, k: number, edge: number) => {
      this.pos[v * 3] = p.x;
      this.pos[v * 3 + 1] = p.y;
      this.pos[v * 3 + 2] = p.z;
      const f = k * k * edge;
      this.col[v * 3] = this.color.r * f;
      this.col[v * 3 + 1] = this.color.g * f;
      this.col[v * 3 + 2] = this.color.b * f;
      v++;
    };
    const a = new THREE.Vector3(),
      b = new THREE.Vector3();
    for (let i = 0; i < n - 1; i++) {
      const i0 = Math.max(0, i - 1),
        i3 = Math.min(n - 1, i + 2);
      for (let s = 0; s < TRAIL_SUB; s++) {
        const t = s / TRAIL_SUB;
        catmull(a, this.tips[i0], this.tips[i], this.tips[i + 1], this.tips[i3], t);
        catmull(b, this.bases[i0], this.bases[i], this.bases[i + 1], this.bases[i3], t);
        const age = this.ages[i] + (this.ages[i + 1] - this.ages[i]) * t;
        const k = Math.max(0, 1 - age / this.life);
        put(a, k, 1);
        put(b, k, 0.15);
      }
    }
    put(this.tips[n - 1], 0, 1);
    put(this.bases[n - 1], 0, 0);
    this.geo.setDrawRange(0, (v / 2 - 1) * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

function catmull(out: THREE.Vector3, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number) {
  const t2 = t * t,
    t3 = t2 * t;
  out.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  out.z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
}

export class Fx {
  group = new THREE.Group();
  bloodLevel = 1;
  private solid: ParticleLayer;
  private glow: ParticleLayer;
  private decals: THREE.InstancedMesh[] = [];
  private decalNext: number[] = [];
  private decalCap: number;
  private flashes: Flash[] = [];
  private flashPool: THREE.Mesh[] = [];
  private tex = { glow: radialTexture('glow'), ring: radialTexture('ring'), star: radialTexture('star') };
  private quad = new THREE.PlaneGeometry(1, 1);
  private m = new THREE.Matrix4();
  private col = new THREE.Color();
  /**
   * Ground height under a point. Every effect takes heights relative to the ground (as the sim does)
   * and lifts itself onto the terrain with this.
   */
  ground: (x: number, z: number) => number = () => 0;
  /** surface normal, for laying flat things on slopes */
  groundNormal: (x: number, z: number, out: THREE.Vector3) => THREE.Vector3 = (_x, _z, out) => out.set(0, 1, 0);
  private nrm = new THREE.Vector3();
  private qa = new THREE.Quaternion();
  private qb = new THREE.Quaternion();
  private static UP = new THREE.Vector3(0, 1, 0);
  private static FWD = new THREE.Vector3(0, 0, 1);

  constructor() {
    this.solid = new ParticleLayer(TUNE.blood.max, false);
    this.glow = new ParticleLayer(900, true);
    this.group.add(this.solid.mesh, this.glow.mesh);
    this.decalCap = Math.floor(TUNE.blood.decals / 4);
    const flat = new THREE.PlaneGeometry(1, 1);
    flat.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: splatTexture(i + 3), color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      mat.alphaMap = mat.map;
      mat.map = null;
      const im = new THREE.InstancedMesh(flat, mat, this.decalCap);
      im.count = 0;
      im.frustumCulled = false;
      im.renderOrder = 1;
      this.decals.push(im);
      this.decalNext.push(0);
      this.group.add(im);
    }
  }

  private decal(x: number, z: number, size: number, shade?: THREE.Color) {
    const k = (Math.random() * 4) | 0;
    const im = this.decals[k];
    const i = this.decalNext[k] % this.decalCap;
    this.decalNext[k]++;
    // lie flat on the slope, turned at random
    this.groundNormal(x, z, this.nrm);
    this.qa.setFromUnitVectors(Fx.UP, this.nrm).multiply(this.qb.setFromAxisAngle(Fx.UP, Math.random() * 6.28));
    DSCALE.set(size, 1, size * (0.7 + Math.random() * 0.6));
    DPOS.set(x, this.ground(x, z) + 0.05 + Math.random() * 0.02, z);
    im.setMatrixAt(i, this.m.compose(DPOS, this.qa, DSCALE));
    const d = 0.3 + Math.random() * 0.25;
    im.setColorAt(i, shade ?? this.col.setRGB(d, 0.01, 0.015));
    im.count = Math.min(this.decalCap, Math.max(im.count, i + 1));
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  /** Flung-ink blood: a directed spray of streaks plus a little mist. */
  blood(x: number, y: number, z: number, dx: number, dz: number, weight: number) {
    if (this.bloodLevel <= 0) return;
    const n = Math.round((5 + weight * 16) * this.bloodLevel);
    const g0 = this.ground(x, z);
    for (let i = 0; i < n; i++) {
      const sp = 2.5 + Math.random() * (5 + weight * 6);
      const a = (Math.random() - 0.5) * 1.5;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      const shade = 0.42 + Math.random() * 0.3;
      this.solid.add({
        x: x + (Math.random() - 0.5) * 0.2,
        y: y + g0 + (Math.random() - 0.5) * 0.4,
        z: z + (Math.random() - 0.5) * 0.2,
        vx: (dx * ca - dz * sa) * sp,
        vy: 1.5 + Math.random() * (4 + weight * 3),
        vz: (dz * ca + dx * sa) * sp,
        life: 1.6,
        max: 1.6,
        size: 0.045 + Math.random() * 0.06 + weight * 0.02,
        stretch: 0.09,
        grav: 1,
        drag: 0.6,
        r: shade,
        g: 0.01,
        b: 0.02,
        blood: true,
      });
    }
    // an immediate splash underfoot so even glancing hits mark the ground
    if (Math.random() < 0.22 + weight * 0.5) this.decal(x + dx * (0.6 + Math.random()), z + dz * (0.6 + Math.random()), 0.5 + Math.random() * 0.7 + weight * 0.8);
  }

  sparks(x: number, y: number, z: number, n: number, color = 0xffd27a, speed = 9) {
    this.col.set(color);
    y += this.ground(x, z);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28,
        e = (Math.random() - 0.3) * 1.6,
        sp = speed * (0.4 + Math.random() * 0.8);
      this.glow.add({ x, y, z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 2, vz: Math.sin(a) * Math.cos(e) * sp, life: 0.28 + Math.random() * 0.2, max: 0.48, size: 0.045, stretch: 0.14, grav: 0.8, drag: 3, r: this.col.r, g: this.col.g, b: this.col.b, blood: false });
    }
  }

  dust(x: number, z: number, n: number, speed = 3, color = 0x9a8b70) {
    this.col.set(color);
    const g0 = this.ground(x, z);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28,
        sp = speed * (0.4 + Math.random());
      this.solid.add({ x, y: g0 + 0.15, z, vx: Math.cos(a) * sp, vy: 0.8 + Math.random() * 1.6, vz: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, max: 0.9, size: 0.16 + Math.random() * 0.18, stretch: 0, grav: -0.02, drag: 3.5, r: this.col.r, g: this.col.g, b: this.col.b, blood: false });
    }
  }

  /** Bullet streaks fanned across an arc. */
  tracers(x: number, y: number, z: number, face: number, arcDeg: number, range: number) {
    const n = arcDeg >= 360 ? 16 : Math.max(1, Math.round(arcDeg / 9));
    y += this.ground(x, z);
    for (let i = 0; i < n; i++) {
      const a = face + (arcDeg >= 360 ? (i / n) * 6.28 : ((i + 0.5) / n - 0.5) * arcDeg * 0.0174);
      const sp = 95;
      this.glow.add({ x, y, z, vx: Math.sin(a) * sp, vy: -1, vz: Math.cos(a) * sp, life: range / sp, max: range / sp, size: 0.05, stretch: 0.5, grav: 0, drag: 0, r: 1, g: 0.85, b: 0.5, blood: false });
    }
  }

  embers(x: number, y: number, z: number, n: number, color: number, radius = 1.2) {
    this.col.set(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28,
        r = Math.random() * radius;
      const ex = x + Math.cos(a) * r,
        ez = z + Math.sin(a) * r;
      this.glow.add({ x: ex, y: this.ground(ex, ez) + y + Math.random() * 1.6, z: ez, vx: -Math.sin(a) * 3, vy: 2 + Math.random() * 3, vz: Math.cos(a) * 3, life: 0.5 + Math.random() * 0.4, max: 0.9, size: 0.07, stretch: 0.1, grav: -0.1, drag: 1, r: this.col.r, g: this.col.g, b: this.col.b, blood: false });
    }
  }

  /** A volley of burning arrows loosed from behind `from`, arcing over and landing across a circle after `delay` seconds. */
  fireArrows(x: number, z: number, r: number, delay: number, fromX: number, fromZ: number) {
    const ax = fromX - x,
      az = fromZ - z,
      al = Math.hypot(ax, az) || 1;
    const grav = 1.6,
      g = G * grav;
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * 6.28,
        rr = Math.sqrt(Math.random()) * r;
      const tx = x + Math.cos(a) * rr,
        tz = z + Math.sin(a) * rr;
      const t = delay * (0.85 + Math.random() * 0.2);
      // the archers stand well behind whoever called the volley
      const back = al + 10 + Math.random() * 12,
        side = (Math.random() - 0.5) * 14;
      const sx = x + (ax / al) * back - (az / al) * side,
        sz = z + (az / al) * back + (ax / al) * side,
        sy = this.ground(sx, sz) + 1.6,
        ty = this.ground(tx, tz);
      this.glow.add({ x: sx, y: sy, z: sz, vx: (tx - sx) / t, vy: (ty + 0.5 * g * t * t - sy) / t, vz: (tz - sz) / t, life: t + 0.05, max: t + 0.05, size: 0.09, stretch: 0.22, grav, drag: 0, r: 1, g: 0.38, b: 0.06, blood: false, hold: true });
    }
  }

  /** Flames licking over a burning patch of ground; call each frame while it burns. */
  burn(x: number, z: number, r: number, intensity: number) {
    const n = Math.random() < intensity * 3 ? 1 + ((intensity * 2) | 0) : 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28,
        rr = Math.sqrt(Math.random()) * r;
      const px = x + Math.cos(a) * rr,
        pz = z + Math.sin(a) * rr;
      const hot = Math.random();
      this.glow.add({ x: px, y: this.ground(px, pz) + 0.1, z: pz, vx: (Math.random() - 0.5) * 0.8, vy: 2 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 0.8, life: 0.5 + Math.random() * 0.5, max: 1, size: 0.18 + Math.random() * 0.22, stretch: 0.15, grav: -0.05, drag: 1.2, r: 1, g: 0.35 + hot * 0.4, b: 0.08 + hot * 0.1, blood: false });
    }
  }

  /** Blackened ground where fire has been. */
  scorch(x: number, z: number, r: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28,
        rr = Math.sqrt(Math.random()) * r;
      const k = 0.04 + Math.random() * 0.05;
      this.decal(x + Math.cos(a) * rr, z + Math.sin(a) * rr, 1 + Math.random() * 1.8, this.col.setRGB(k, k * 0.8, k * 0.6));
    }
  }

  private flashMesh(tex: THREE.Texture, color: number): THREE.Mesh {
    let m = this.flashPool.pop();
    if (!m) {
      m = new THREE.Mesh(this.quad, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.renderOrder = 6;
    }
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.map = tex;
    mat.color.set(color);
    mat.opacity = 1;
    mat.needsUpdate = true;
    this.group.add(m);
    return m;
  }

  /** Camera-facing burst at a hit point. */
  flash(x: number, y: number, z: number, size: number, color = 0xffffff, life = 0.12, star = true) {
    const mesh = this.flashMesh(star ? this.tex.star : this.tex.glow, color);
    (mesh.material as THREE.MeshBasicMaterial).depthTest = true;
    mesh.position.set(x, y + this.ground(x, z), z);
    mesh.rotation.set(0, 0, Math.random() * 3.14);
    this.flashes.push({ mesh, life, max: life, s0: size * 0.5, s1: size, flat: false });
  }

  /** Expanding ring on the ground for slams, landings and supers. */
  ring(x: number, z: number, size: number, color = 0xfff0d0, life = 0.35) {
    const mesh = this.flashMesh(this.tex.ring, color);
    // a wide ring on a slope would sink into it, so it is drawn over the ground
    (mesh.material as THREE.MeshBasicMaterial).depthTest = false;
    mesh.position.set(x, this.ground(x, z) + 0.12, z);
    mesh.quaternion.setFromUnitVectors(Fx.FWD, this.groundNormal(x, z, this.nrm));
    this.flashes.push({ mesh, life, max: life, s0: size * 0.2, s1: size, flat: true });
  }

  update(dt: number, camera: THREE.Camera) {
    this.solid.update(dt, this.ground, (p) => {
      if (Math.random() < 0.25) this.decal(p.x, p.z, 0.2 + Math.random() * 0.5 + p.size * 3);
    });
    this.glow.update(dt, this.ground);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const k = 1 - Math.max(0, f.life) / f.max;
      const s = f.s0 + (f.s1 - f.s0) * (1 - (1 - k) * (1 - k));
      f.mesh.scale.setScalar(s);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k * k;
      if (!f.flat) f.mesh.quaternion.copy(camera.quaternion);
      if (f.life <= 0) {
        this.group.remove(f.mesh);
        this.flashPool.push(f.mesh);
        this.flashes.splice(i, 1);
      }
    }
  }
}
