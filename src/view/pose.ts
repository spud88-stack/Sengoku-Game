import { Euler, Quaternion, Vector3 } from 'three';
import { DEG, lerp } from '../core/math';

type V3 = [number, number, number];

/**
 * Authoring format for a pose. All angles in degrees.
 * Arms are given as the direction the upper arm points: [yaw, pitch, elbowBend].
 *   yaw 0 = forward, positive = toward the character's LEFT; pitch -90 = hanging, 0 = level, 90 = overhead.
 * Legs are [forwardSwing, outwardSpread, kneeBend].
 */
export interface PoseSpec {
  y?: number;
  spin?: number;
  hips?: V3; // yaw, pitch(lean fwd +), roll
  spine?: V3;
  head?: [number, number];
  aR?: V3;
  aL?: V3;
  lR?: V3;
  lL?: V3;
  wp?: V3;
}

export const J = { hips: 0, spine: 1, head: 2, armL: 3, foreL: 4, armR: 5, foreR: 6, legL: 7, shinL: 8, legR: 9, shinR: 10, weapon: 11, COUNT: 12 } as const;

export class Pose {
  q: Quaternion[] = [];
  y = 0;
  spin = 0;
  constructor() {
    for (let i = 0; i < J.COUNT; i++) this.q.push(new Quaternion());
  }
  copy(o: Pose) {
    for (let i = 0; i < J.COUNT; i++) this.q[i].copy(o.q[i]);
    this.y = o.y;
    this.spin = o.spin;
    return this;
  }
  /** Move this pose toward `o` by fraction t. */
  blend(o: Pose, t: number) {
    for (let i = 0; i < J.COUNT; i++) this.q[i].slerp(o.q[i], t);
    this.y = lerp(this.y, o.y, t);
    this.spin = lerp(this.spin, o.spin, t);
    return this;
  }
  setLerp(a: Pose, b: Pose, t: number) {
    for (let i = 0; i < J.COUNT; i++) this.q[i].slerpQuaternions(a.q[i], b.q[i], t);
    this.y = lerp(a.y, b.y, t);
    this.spin = lerp(a.spin, b.spin, t);
    return this;
  }
}

const e = new Euler();
const DOWN = new Vector3(0, -1, 0);
const v = new Vector3();

function armQ(out: Quaternion, yaw: number, pitch: number) {
  const cy = Math.cos(yaw * DEG),
    sy = Math.sin(yaw * DEG),
    cp = Math.cos(pitch * DEG),
    sp = Math.sin(pitch * DEG);
  v.set(sy * cp, sp, cy * cp);
  out.setFromUnitVectors(DOWN, v);
}

export function specToPose(s: PoseSpec, out: Pose): Pose {
  out.y = s.y ?? 0;
  out.spin = s.spin ?? 0;
  const h = s.hips ?? [0, 0, 0];
  out.q[J.hips].setFromEuler(e.set(h[1] * DEG, h[0] * DEG, h[2] * DEG, 'YXZ'));
  const sp = s.spine ?? [0, 0, 0];
  out.q[J.spine].setFromEuler(e.set(sp[1] * DEG, sp[0] * DEG, sp[2] * DEG, 'YXZ'));
  const hd = s.head ?? [0, 0];
  out.q[J.head].setFromEuler(e.set(hd[1] * DEG, hd[0] * DEG, 0, 'YXZ'));
  const aR = s.aR ?? [0, -90, 0];
  armQ(out.q[J.armR], aR[0], aR[1]);
  out.q[J.foreR].setFromEuler(e.set(-aR[2] * DEG, 0, 0, 'XYZ'));
  const aL = s.aL ?? [0, -90, 0];
  armQ(out.q[J.armL], aL[0], aL[1]);
  out.q[J.foreL].setFromEuler(e.set(-aL[2] * DEG, 0, 0, 'XYZ'));
  const lR = s.lR ?? [0, 0, 0];
  out.q[J.legR].setFromEuler(e.set(-lR[0] * DEG, 0, -lR[1] * DEG, 'XYZ'));
  out.q[J.shinR].setFromEuler(e.set(lR[2] * DEG, 0, 0, 'XYZ'));
  const lL = s.lL ?? [0, 0, 0];
  out.q[J.legL].setFromEuler(e.set(-lL[0] * DEG, 0, lL[1] * DEG, 'XYZ'));
  out.q[J.shinL].setFromEuler(e.set(lL[2] * DEG, 0, 0, 'XYZ'));
  const wp = s.wp ?? [0, 0, 0];
  out.q[J.weapon].setFromEuler(e.set(wp[0] * DEG, wp[1] * DEG, wp[2] * DEG, 'XYZ'));
  return out;
}

export type Ease = 'lin' | 'in' | 'out' | 'io';
export interface Key {
  t: number;
  p: PoseSpec;
  e?: Ease;
}

export class Clip {
  times: number[] = [];
  poses: Pose[] = [];
  eases: Ease[] = [];
  constructor(keys: Key[], base: PoseSpec) {
    keys.sort((a, b) => a.t - b.t);
    for (const k of keys) {
      this.times.push(k.t);
      this.poses.push(specToPose({ ...base, ...k.p }, new Pose()));
      this.eases.push(k.e ?? 'io');
    }
  }
  sample(t: number, out: Pose) {
    const n = this.times.length;
    if (t <= this.times[0]) return out.copy(this.poses[0]);
    if (t >= this.times[n - 1]) return out.copy(this.poses[n - 1]);
    let i = 1;
    while (this.times[i] < t) i++;
    let k = (t - this.times[i - 1]) / (this.times[i] - this.times[i - 1]);
    switch (this.eases[i]) {
      case 'in':
        k = k * k;
        break;
      case 'out':
        k = 1 - (1 - k) * (1 - k);
        break;
      case 'io':
        k = k * k * (3 - 2 * k);
        break;
    }
    return out.setLerp(this.poses[i - 1], this.poses[i], k);
  }
}
