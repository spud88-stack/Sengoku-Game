import { clamp } from '../core/math';
import type { BattleDef } from './world';
import { isWalled, wallRadius } from './castle';

type P2 = [number, number];

/** How a battlefield's ground is shaped. All lengths in metres. */
interface LandSpec {
  /** height of the rolling hills */
  hills: number;
  /** size of a typical hill */
  scale: number;
  /** how high the edges of the field climb toward the surrounding mountains */
  rim: number;
  /** a river carved through the field; camps on it stay dry */
  river?: { pts: P2[]; width: number };
  /** long hills walling the flanks or running across the field */
  ridges?: { a: P2; b: P2; h: number; w: number }[];
  /** extra height for particular camps, by index, on top of what their names suggest */
  raise?: Record<number, number>;
}

const k125 = 125 / 120;
/** Each historical field gets the landform it was fought over. */
const LANDS: Record<string, LandSpec> = {
  // Ueda Castle on its hill, the Kangawa winding past the ford and the central crossing
  ueda: { hills: 3.2, scale: 36, rim: 12, river: { pts: [[135, -64], [56, -30], [0, 0], [-58, 30], [-135, 52]], width: 9 }, raise: { 0: 3 } },
  // a wooded gorge: high ground on both flanks, Yoshimoto resting on the hill at its end
  okehazama: { hills: 4.2, scale: 26, rim: 14, ridges: [{ a: [-92, -110], b: [-84, 110], h: 11, w: 26 }, { a: [92, -110], b: [86, 110], h: 11, w: 26 }], raise: { 4: 2, 6: 4 } },
  // a broad river plain under Saijoyama
  kawanakajima: { hills: 1.4, scale: 46, rim: 10, river: { pts: [[135, -58], [56, -34], [8, -6], [-58, 38], [-135, 72]], width: 12 }, raise: { 6: 10, 5: -6 } },
  // the Rengo stream across the middle, palisades on the low ground before it, forts on the hills beyond
  nagashino: { hills: 2.8, scale: 32, rim: 11, river: { pts: [[-135, 12], [-60, 4], [0, 9], [60, 2], [135, 10]], width: 8 }, raise: { 0: 4, 5: 3, 6: 3 } },
  // the streets of Kyoto: nearly flat, the river at the back of the Akechi camp
  honnoji: { hills: 0.5, scale: 40, rim: 6, river: { pts: [[-115, -96], [0, -93], [115, -97]], width: 8 }, raise: { 4: 1.5 } },
  // a basin ringed by mountains, the Western Army's camps up on their slopes
  sekigahara: { hills: 2.4, scale: 34, rim: 18, ridges: [{ a: [-125, 70], b: [-40, 130], h: 9, w: 34 }, { a: [125, 72], b: [40, 132], h: 8, w: 34 }], raise: { 0: 3, 4: 4, 5: 3, 6: 4 } },
  // the castle on its plateau, Chausuyama in the middle, the Kizu river to the west
  osaka: { hills: 2.6, scale: 34, rim: 12, river: { pts: [[-104, -135], [-76, -40], [-62 * k125, 46 * k125 + 14], [-88, 135]], width: 10 }, raise: { 0: 4, 1: 3, 3: -2, 5: 3 } },
  dojo: { hills: 0.6, scale: 20, rim: 3 },
};
const GENERIC: LandSpec = { hills: 3, scale: 34, rim: 12 };

/** Camps whose names say they are up high. */
function nameRaise(name: string): number {
  if (/castle/i.test(name)) return 8;
  if (/mount|yama|hill/i.test(name)) return 7;
  if (/ridge/i.test(name)) return 5;
  if (/fort|temple/i.test(name)) return 2.5;
  return 0;
}

// ---------------------------------------------------------------- noise
function hash(ix: number, iz: number, seed: number) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, z: number, seed: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx),
    uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed),
    b = hash(ix + 1, iz, seed),
    c = hash(ix, iz + 1, seed),
    d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}
function fbm(x: number, z: number, seed: number) {
  let s = 0,
    amp = 1,
    f = 1,
    norm = 0;
  for (let o = 0; o < 4; o++) {
    s += noise(x * f, z * f, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.48;
    f *= 2.03;
  }
  return s / norm;
}
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function segDist(x: number, z: number, a: P2, b: P2) {
  const vx = b[0] - a[0],
    vz = b[1] - a[1];
  const t = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1), 0, 1);
  return Math.hypot(x - (a[0] + vx * t), z - (a[1] + vz * t));
}
function lineDist(x: number, z: number, pts: P2[]) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, z, pts[i], pts[i + 1]));
  return d;
}

/**
 * The shape of the ground. The simulation stays in ground-relative heights (y = 0 is standing on the ground);
 * this is what lifts it onto the hills when drawn. Heights are baked into a grid once, so sampling is cheap.
 */
export class Terrain {
  /** the sampled area runs this far past the edge of the field */
  readonly margin = 110;
  readonly extent: number;
  /** water surface height, or null if the field has no river */
  readonly water: number | null;
  readonly spec: LandSpec;
  private readonly step = 1.5;
  private readonly n: number;
  private readonly h: Float32Array;

  constructor(def: Pick<BattleDef, 'id' | 'half' | 'bases'>) {
    this.spec = LANDS[def.id] ?? GENERIC;
    this.extent = def.half + this.margin;
    this.n = Math.ceil((this.extent * 2) / this.step) + 1;
    this.h = new Float32Array(this.n * this.n);
    this.water = this.spec.river ? -0.55 : null;
    let seed = 7;
    for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    // camps sit on level ground at the height the land had there, raised if they are hill forts
    const camps = def.bases.map((b, i) => ({ x: b.x, z: b.z, r: isWalled(b.name) ? wallRadius(!!b.main) + 4 : (b.main ? 14 : 11) + 3, lift: nameRaise(b.name) + (this.spec.raise?.[i] ?? 0), top: 0 }));
    for (const c of camps) c.top = Math.max(this.land(c.x, c.z, seed, def.half) + c.lift, this.water === null ? -Infinity : this.water + 0.4);
    for (let j = 0; j < this.n; j++)
      for (let i = 0; i < this.n; i++) {
        const x = -this.extent + i * this.step,
          z = -this.extent + j * this.step;
        let y = this.land(x, z, seed, def.half);
        const rv = this.spec.river;
        if (rv) {
          // the water is one sheet across the map, so dry land must stay above it away from the river
          y = Math.max(y, this.water! + 0.4);
          const d = lineDist(x, z, rv.pts);
          // banks slope down into a bed below the waterline
          y = y * smooth(rv.width * 0.6, rv.width * 2.6, d) + -1.6 * (1 - smooth(rv.width * 0.25, rv.width * 0.75, d));
        }
        for (const c of camps) {
          const d = Math.hypot(x - c.x, z - c.z);
          // a raised camp needs a longer slope up to it
          const k = smooth(c.r, c.r + 9 + c.lift * 2.4, d);
          y = c.top + (y - c.top) * k;
        }
        this.h[j * this.n + i] = y;
      }
  }

  /** Height of the land before rivers and camps are cut into it. */
  private land(x: number, z: number, seed: number, half: number) {
    const s = this.spec;
    let y = fbm(x / s.scale, z / s.scale, seed) * s.hills;
    // keep the open field gentler than the hills at its edges
    const edge = Math.max(Math.abs(x), Math.abs(z));
    y *= 0.75 + 0.5 * smooth(half * 0.5, half, edge);
    for (const r of s.ridges ?? []) {
      const d = segDist(x, z, r.a, r.b);
      y += r.h * Math.pow(1 - smooth(0, r.w, d), 1.4) * (0.75 + 0.25 * noise(x / 18, z / 18, seed + 99));
    }
    y += s.rim * smooth(half * 0.82, half + 40, edge) * (0.8 + 0.4 * noise(x / 30, z / 30, seed + 5));
    return y;
  }

  /** Ground height at (x, z), bilinear between grid samples. */
  height(x: number, z: number): number {
    const n = this.n;
    const gx = clamp((x + this.extent) / this.step, 0, n - 1.001),
      gz = clamp((z + this.extent) / this.step, 0, n - 1.001);
    const i = gx | 0,
      j = gz | 0;
    const fx = gx - i,
      fz = gz - j;
    const o = j * n + i;
    const a = this.h[o],
      b = this.h[o + 1],
      c = this.h[o + n],
      d = this.h[o + n + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  /** Unit surface normal at (x, z), written into `out` as [x, y, z]. */
  normal(x: number, z: number, out: { x: number; y: number; z: number }) {
    const e = 1;
    const dx = this.height(x + e, z) - this.height(x - e, z),
      dz = this.height(x, z + e) - this.height(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz);
    out.x = -dx / l;
    out.y = (2 * e) / l;
    out.z = -dz / l;
    return out;
  }
}
