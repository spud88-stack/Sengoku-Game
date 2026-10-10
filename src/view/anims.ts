import { MOVESETS } from '../data/moves';
import type { MoveDef, WeaponKind } from '../sim/types';
import { Clip, Pose, specToPose, type Key, type PoseSpec } from './pose';

/** Ready stances per weapon; every clip key is merged over these. */
export const STANCE: Record<string, PoseSpec> = {
  katana: {
    y: -0.06,
    hips: [22, 4, 0],
    spine: [-12, 6, 0],
    head: [-10, 0],
    aR: [-12, -52, 62],
    wp: [-78, 0, 0],
    aL: [28, -62, 55],
    lR: [26, 8, 26],
    lL: [-22, 10, 30],
  },
  great: {
    y: -0.1,
    hips: [26, 5, 0],
    spine: [-16, 8, 0],
    head: [-10, 0],
    aR: [-30, -20, 100],
    wp: [-60, 0, -20],
    aL: [20, -40, 90],
    lR: [28, 10, 30],
    lL: [-24, 12, 32],
  },
  yari: {
    y: -0.08,
    hips: [38, 5, 0],
    spine: [-14, 8, 0],
    head: [-24, 0],
    aR: [-40, -62, 55],
    wp: [-62, -18, 0],
    aL: [18, -38, 40],
    lR: [-24, 10, 30],
    lL: [30, 10, 26],
  },
};
const stanceOf = (w: WeaponKind): PoseSpec => (w === 'naginata' || w === 'gun' || w === 'bo' ? STANCE.yari : w === 'odachi' || w === 'kanabo' || w === 'masakari' ? STANCE.great : (STANCE[w] ?? STANCE.katana));
const twoHanded = (w: WeaponKind) => w === 'yari' || w === 'naginata' || w === 'odachi' || w === 'kanabo' || w === 'gun' || w === 'masakari' || w === 'bo';
const thrusty = (w: WeaponKind) => w === 'yari' || w === 'gun';

/** Second hand follows the weapon arm so polearms look gripped. */
function follow(p: PoseSpec, w: WeaponKind): PoseSpec {
  // paired blades mirror each other into an X
  if (w === 'dual' && !p.aL && p.aR) return { ...p, aL: [-p.aR[0] * 0.8, p.aR[1], p.aR[2]] };
  if (!twoHanded(w) || p.aL || !p.aR) return p;
  const [yaw, pitch] = p.aR;
  return { ...p, aL: [yaw * 0.55 + 22, pitch * 0.6 - 18, 42] };
}

interface Swing {
  /** [armYaw, armPitch, elbowBend, spineYaw] at windup and at the end of the cut */
  a: [number, number, number, number];
  b: [number, number, number, number];
  y?: [number, number];
  lean?: [number, number];
  spin?: number;
  /** which foot leads: 1 = right */
  lead?: 1 | -1;
  wp?: [number, number];
  hipsYaw?: [number, number];
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Build the keys for one cut between t0 (windup done) and t1 (cut finished). */
function swingKeys(tStart: number, t0: number, t1: number, tEnd: number, s: Swing, w: WeaponKind, spin0 = 0): Key[] {
  const lead = s.lead ?? 1;
  const legs = (k: number): Pick<PoseSpec, 'lR' | 'lL'> =>
    lead === 1 ? { lR: [mix(10, 42, k), 8, mix(20, 34, k)], lL: [mix(-5, -32, k), 10, mix(20, 18, k)] } : { lL: [mix(10, 42, k), 8, mix(20, 34, k)], lR: [mix(-5, -32, k), 10, mix(20, 18, k)] };
  const at = (k: number, over = 0): PoseSpec => {
    const kk = k + over;
    const yaw = mix(s.a[0], s.b[0], kk),
      pitch = mix(s.a[1], s.b[1], kk);
    // the arm straightens through the middle of the arc
    const bend = mix(s.a[2], s.b[2], k) * (1 - Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * 0.75);
    const sy = mix(s.a[3], s.b[3], kk);
    const hy = s.hipsYaw ? mix(s.hipsYaw[0], s.hipsYaw[1], kk) : sy * 0.45;
    return follow(
      {
        y: s.y ? mix(s.y[0], s.y[1], k) : -0.1,
        spin: spin0 + (s.spin ?? 0) * Math.min(1, Math.max(0, k)),
        hips: [hy, s.lean ? mix(s.lean[0], s.lean[1], k) : 8, 0],
        spine: [sy * 0.55, s.lean ? mix(s.lean[0], s.lean[1], k) * 0.8 : 6, 0],
        head: [-sy * 0.8, 0],
        aR: [yaw, pitch, bend],
        wp: [s.wp ? mix(s.wp[0], s.wp[1], k) : mix(-35, -8, Math.sin(Math.min(1, k) * Math.PI * 0.5)), 0, 0],
        aL: twoHanded(w) || w === 'dual' ? undefined : [mix(40, -10, k), -55, 70],
        ...legs(Math.min(1, Math.max(0, k))),
      },
      w,
    );
  };
  const tw = mix(tStart, t0, 0.72);
  return [
    { t: tw, p: at(0), e: 'out' },
    { t: t0, p: at(0.12), e: 'lin' },
    { t: mix(t0, t1, 0.5), p: at(0.55), e: 'lin' },
    { t: t1, p: at(1), e: 'out' },
    { t: mix(t1, tEnd, 0.6), p: at(1, 0.07), e: 'out' },
  ];
}

// Arm arcs, shared by sword and spear. Yaw positive = character's left.
const R2L: Swing = { a: [-85, 12, 70, -55], b: [70, -12, 30, 55], lead: 1 };
const L2R: Swing = { a: [75, 18, 85, 55], b: [-90, -8, 25, -55], lead: -1 };
const RISE: Swing = { a: [35, -75, 40, 35], b: [-45, 78, 20, -35], lead: 1, y: [-0.2, 0.02], lean: [22, -6] };
const OVERHEAD: Swing = { a: [-12, 115, 60, -10], b: [5, -48, 15, 10], lead: 1, y: [0.02, -0.26], lean: [-12, 34], wp: [-50, -5] };
const THRUST: Swing = { a: [-35, -25, 120, -45], b: [0, -4, 0, 30], lead: 1, y: [-0.12, -0.2], lean: [4, 26], wp: [-88, -86] };
const SPIN: Swing = { a: [-95, 5, 30, -30], b: [-95, -5, 10, 0], lead: 1, spin: -360, y: [-0.14, -0.14], wp: [-12, -6] };
const LAUNCH: Swing = { a: [-20, -80, 30, -25], b: [-5, 105, 10, 15], lead: -1, y: [-0.3, 0.1], lean: [28, -16], wp: [-30, -10] };

function buildClip(mv: MoveDef, w: WeaponKind): Clip {
  const base = stanceOf(w);
  const h = mv.hits;
  const key = mv.id.slice(2);
  const one = (s: Swing) => swingKeys(0, h[0].t0, h[0].t1, mv.dur, s, w);
  let keys: Key[];
  if (w === 'gun' && mv.sfx === 'shot') return new Clip(aimKeys(mv), base);
  if (w === 'gun' && key === 'super') {
    keys = aimKeys(mv).map((k, i, a) => ({ ...k, p: { ...k.p, spin: -1080 * Math.min(1, k.t / a[a.length - 2].t) } }));
    return new Clip(keys, base);
  }
  switch (key) {
    case 'l1':
      keys = one(R2L);
      break;
    case 'l2':
      keys = one(L2R);
      break;
    case 'l3':
      keys = one(thrusty(w) ? THRUST : RISE);
      break;
    case 'l4':
      keys = one(SPIN);
      break;
    case 'l5':
      keys = one(thrusty(w) ? { ...THRUST, y: [-0.1, -0.3], lean: [0, 36] } : OVERHEAD);
      break;
    case 'c1': {
      // shoulder check with the off hand leading
      keys = [
        { t: h[0].t0 * 0.6, p: { y: -0.2, hips: [-30, 10, 0], spine: [-30, 12, 0], aL: [30, -30, 110], aR: [-50, -70, 40], lL: [-10, 8, 30], lR: [20, 8, 30] }, e: 'out' },
        { t: h[0].t0, p: { y: -0.16, hips: [10, 16, 0], spine: [20, 18, 0], aL: [10, -10, 60], aR: [-40, -60, 60] }, e: 'in' },
        { t: h[0].t1, p: { y: -0.14, hips: [40, 20, 0], spine: [45, 20, 0], head: [-50, 0], aL: [0, 0, 0], aR: [-60, -50, 70], lL: [45, 8, 30], lR: [-35, 8, 15] }, e: 'out' },
        { t: mv.dur * 0.85, p: { y: -0.12, hips: [44, 18, 0], spine: [48, 18, 0], head: [-50, 0], aL: [0, -6, 10], aR: [-60, -50, 70], lL: [45, 8, 30], lR: [-35, 8, 15] } },
      ];
      break;
    }
    case 'c2':
      keys = one(LAUNCH);
      break;
    case 'c3': {
      keys = [];
      if (thrusty(w)) {
        for (let i = 0; i < h.length; i++) {
          const prev = i ? h[i - 1].t1 : 0;
          const last = i === h.length - 1;
          keys.push(...swingKeys(prev, h[i].t0, h[i].t1, last ? mv.dur : h[i].t1 + 0.02, { ...THRUST, a: last ? THRUST.a : [-30, -18, 95, -25], b: [((i % 3) - 1) * 14, -4 + (i % 2) * 8, 0, 25] }, w));
        }
      } else {
        const seq = [R2L, L2R, R2L, OVERHEAD];
        for (let i = 0; i < h.length; i++) keys.push(...swingKeys(i ? h[i - 1].t1 : 0, h[i].t0, h[i].t1, i === h.length - 1 ? mv.dur : h[i].t1 + 0.02, seq[i % seq.length], w));
      }
      break;
    }
    case 'c4':
      keys = one({ ...SPIN, spin: -720, y: [-0.24, -0.2], lean: [14, 14] });
      break;
    case 'c5':
      keys = [...swingKeys(0, h[0].t0, h[0].t1, h[0].t1 + 0.1, { ...LAUNCH, y: [-0.25, 0.25] }, w), ...swingKeys(h[0].t1 + 0.1, h[1].t0, h[1].t1, mv.dur, { ...OVERHEAD, y: [0.3, -0.42], lean: [-20, 44] }, w)];
      break;
    case 'al':
      keys = one({ ...R2L, y: [0, 0], lean: [10, 10] }).map((k) => ({ ...k, p: { ...k.p, lR: [30, 10, 70], lL: [-10, 10, 80] } as PoseSpec }));
      break;
    case 'ah':
      keys = [
        { t: 0.08, p: follow({ y: 0.05, hips: [0, -10, 0], spine: [0, -15, 0], aR: [0, 120, 30], wp: [-40, 0, 0], lR: [40, 10, 90], lL: [20, 10, 100] }, w), e: 'out' },
        { t: 0.2, p: follow({ y: 0, hips: [0, 30, 0], spine: [0, 25, 0], aR: [0, -60, 10], wp: [-10, 0, 0], lR: [20, 10, 60], lL: [-30, 10, 70] }, w), e: 'in' },
        { t: mv.dur - 0.3, p: follow({ y: -0.42, hips: [0, 40, 0], spine: [0, 30, 0], aR: [0, -70, 5], wp: [0, 0, 0], lR: [70, 14, 100], lL: [-30, 14, 95] }, w) },
        { t: mv.dur, p: follow({ y: -0.3, hips: [0, 30, 0], spine: [0, 20, 0], aR: [0, -70, 20], wp: [-20, 0, 0], lR: [60, 14, 90], lL: [-20, 14, 80] }, w) },
      ];
      break;
    case 'dash':
      keys = one(thrusty(w) ? { ...THRUST, y: [-0.2, -0.34], lean: [20, 42] } : { ...R2L, y: [-0.24, -0.3], lean: [26, 34] });
      break;
    case 'super': {
      // a whirl of cuts, then one enormous finishing blow
      const fin = h[h.length - 1];
      const t0 = h[0].t0,
        tEnd = h[h.length - 2].t1;
      keys = [{ t: t0 * 0.7, p: follow({ y: -0.3, hips: [0, 14, 0], spine: [-30, 10, 0], aR: [-100, 30, 50], wp: [-30, 0, 0], lR: [40, 16, 50], lL: [-30, 16, 40] }, w), e: 'out' }];
      const turns = 5;
      const n = turns * 4;
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        keys.push({
          t: mix(t0, tEnd, k),
          p: follow({ y: -0.2 + Math.sin(k * Math.PI * turns) * 0.06, spin: -360 * turns * k, hips: [0, 12, 0], spine: [0, 10, Math.sin(k * 20) * 8], aR: [-95, Math.sin(k * Math.PI * turns * 2) * 30, 8], wp: [-8, 0, 0], lR: [30, 16, 40], lL: [-25, 16, 35] }, w),
          e: 'lin',
        });
      }
      keys.push(...swingKeys(tEnd, fin.t0, fin.t1, mv.dur, { ...OVERHEAD, a: [-12, 125, 50, -10], y: [0.35, -0.45], lean: [-25, 46] }, w, -360 * turns));
      break;
    }
    default:
      keys = h.length ? one(R2L) : [{ t: 0, p: {} }];
  }
  return new Clip(keys, base);
}

/** Shouldered matchlock with a recoil kick on every shot. */
function aimKeys(mv: MoveDef): Key[] {
  const aim = (kick: number, spin = 0): PoseSpec => ({ y: -0.16, spin, hips: [34, 6 - kick * 8, 0], spine: [-10, 6 - kick * 14, 0], head: [-22, 0], aR: [-14, -6 + kick * 22, 70], wp: [-18 + kick * 16, 0, 0], aL: [10, -8 + kick * 14, 20], lR: [-26, 10, 24], lL: [34, 10, 30] });
  const keys: Key[] = [{ t: Math.max(0.02, mv.hits[0].t0 * 0.6), p: aim(0), e: 'out' }];
  const full = mv.hits.some((x) => x.arc >= 360) && mv.kind !== 'super';
  mv.hits.forEach((x, i) => {
    const sp = full ? -360 * ((i + 1) / mv.hits.length) : 0;
    keys.push({ t: x.t0, p: aim(0, full ? -360 * (i / mv.hits.length) : 0), e: 'lin' }, { t: x.t0 + 0.035, p: aim(1, sp), e: 'out' }, { t: Math.max(x.t1, x.t0 + 0.09), p: aim(0.3, sp), e: 'out' });
  });
  keys.push({ t: mv.dur, p: aim(0, full ? -360 : 0) });
  return keys;
}

const clipCache = new Map<string, Clip>();
export function clipFor(mv: MoveDef, w: WeaponKind): Clip {
  let c = clipCache.get(mv.id);
  if (!c) clipCache.set(mv.id, (c = buildClip(mv, w)));
  return c;
}
export function warmClips() {
  for (const ms of Object.values(MOVESETS)) if (ms) for (const mv of [...ms.lights, ...ms.charges, ms.airLight, ms.airHeavy, ms.dash, ms.super]) clipFor(mv, ms.weapon);
}

// ---------------------------------------------------------------- procedural states
const tmp: PoseSpec = {};
const sin = Math.sin,
  cos = Math.cos;

export function idlePose(w: WeaponKind, t: number, out: Pose) {
  const s = stanceOf(w);
  const br = sin(t * 2.2);
  return specToPose({ ...s, y: (s.y ?? 0) + br * 0.008, spine: [s.spine![0], s.spine![1] + br * 1.5, 0], aR: [s.aR![0], s.aR![1] + br * 1.5, s.aR![2]] }, out);
}

export function runPose(w: WeaponKind, ph: number, speed01: number, out: Pose) {
  const a = sin(ph),
    c = cos(ph);
  const amp = 52 * speed01;
  const spec: PoseSpec = {
    y: -0.08 + Math.abs(c) * 0.06 * speed01,
    hips: [a * 8, 16 * speed01 + 4, 0],
    spine: [-a * 12, 10 * speed01, 0],
    head: [0, -10 * speed01],
    lR: [a * amp + 8, 4, 22 + Math.max(0, -c) * 70 * speed01],
    lL: [-a * amp + 8, 4, 22 + Math.max(0, c) * 70 * speed01],
    aL: [10, -78 + a * 34, 62],
  };
  if (twoHanded(w)) {
    spec.aR = [-38, -64 - a * 6, 50];
    spec.wp = [-58, -22, 0];
    spec.aL = [16, -46 - a * 6, 44];
  } else {
    spec.aR = [-34, -80 - a * 14, 34];
    spec.wp = [58, 0, 14];
  }
  return specToPose(spec, out);
}

export function guardPose(w: WeaponKind, out: Pose) {
  const s = stanceOf(w);
  return specToPose(
    twoHanded(w)
      ? { ...s, y: -0.16, spine: [-10, 10, 0], aR: [-48, -30, 70], wp: [-96, -60, 0], aL: [30, -10, 60] }
      : { ...s, y: -0.16, spine: [0, 10, 0], aR: [-30, -14, 96], wp: [-20, 0, 72], aL: [26, -18, 100] },
    out,
  );
}

export function dodgePose(k: number, out: Pose) {
  // a low, tucked dash
  const tuck = sin(Math.min(1, k * 1.2) * Math.PI);
  return specToPose({ y: -0.2 - tuck * 0.28, hips: [0, 30 + tuck * 30, 0], spine: [0, 20 + tuck * 10, 0], head: [0, -30], aR: [-30, -90 + tuck * 30, 40], wp: [40, 0, 0], aL: [30, -90 + tuck * 30, 50], lR: [50 - tuck * 20, 8, 60 + tuck * 50], lL: [-30 + tuck * 60, 8, 40 + tuck * 70] }, out);
}

export function airPose(w: WeaponKind, vy: number, out: Pose) {
  const up = Math.max(-1, Math.min(1, vy / 8));
  return specToPose(follow({ y: 0, hips: [0, 6 - up * 8, 0], spine: [0, 4, 0], aR: [-50, -20 + up * 40, 40], wp: [-50, 0, 0], aL: [50, -20 + up * 40, 50], lR: [40 + up * 20, 8, 70], lL: [-10 - up * 10, 8, 50 + up * 30] }, w), out);
}

export function hitPose(k: number, out: Pose) {
  const r = sin(Math.min(1, k) * Math.PI * 0.5);
  return specToPose({ y: -0.1, hips: [14, -22 * r, 6 * r], spine: [20 * r, -26 * r, 0], head: [0, -24 * r], aR: [-60, -50, 50], wp: [-30, 0, 30], aL: [60, -30 + 20 * r, 50], lR: [-20, 10, 30], lL: [16, 10, 16] }, out);
}

export function stunPose(t: number, out: Pose) {
  const s = sin(t * 7);
  return specToPose({ y: -0.2, hips: [s * 8, 22, s * 6], spine: [s * 10, 24, 0], head: [s * 20, 30], aR: [-30, -86, 20], wp: [20, 0, 20], aL: [30, -84, 20], lR: [10, 14, 40], lL: [-10, 14, 40] }, out);
}

export function launchedPose(t: number, out: Pose) {
  tmp.y = 0;
  return specToPose({ y: 0, hips: [0, -70 + sin(t * 5) * 20, 0], spine: [0, -20, 0], head: [0, -20], aR: [-70, 20 + sin(t * 9) * 30, 20], wp: [-30, 0, 0], aL: [70, 30 + cos(t * 8) * 30, 20], lR: [40 + sin(t * 7) * 20, 16, 40], lL: [10 + cos(t * 7) * 20, 16, 60] }, out);
}

export function downPose(out: Pose) {
  return specToPose({ y: -0.78, hips: [0, -88, 0], spine: [0, -4, 0], head: [20, 0], aR: [-80, -30, 30], wp: [-60, 0, 0], aL: [80, -20, 20], lR: [10, 14, 20], lL: [-6, 18, 40] }, out);
}

export function getupPose(k: number, out: Pose) {
  return specToPose({ y: -0.78 + k * 0.6, hips: [0, -88 + k * 100, 0], spine: [0, 10, 0], aR: [-30, -70, 60], wp: [-50, 0, 0], aL: [30, -80, 60], lR: [60 - k * 40, 10, 110 - k * 80], lL: [-20, 10, 100 - k * 70] }, out);
}

export function ridePose(w: WeaponKind, ph: number, gallop: number, out: Pose) {
  const b = Math.sin(ph * 2) * gallop;
  return specToPose(follow({ y: -0.06, hips: [0, 10 + b * 5, 0], spine: [0, 8 + b * 4, 0], head: [0, -8], aR: [-40, -55, 50], wp: [-60, -20, 0], aL: [12, -50, 70], lR: [35, 38, 60], lL: [35, 38, 60] }, w), out);
}
