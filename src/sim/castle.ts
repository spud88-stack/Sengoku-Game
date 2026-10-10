import type { BattleDef } from './world';

/** A stretch of wall, or a gate in it, as a segment on the ground. */
export interface Wall {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  gate: Gate | null;
}

export interface Gate {
  id: number;
  castle: number;
  /** who holds it: they come and go freely */
  team: number;
  x: number;
  z: number;
  /** unit normal pointing out of the castle */
  nx: number;
  nz: number;
  hp: number;
  maxHp: number;
  broken: boolean;
  /** drawn open: its own side is passing and no enemy is close */
  open: boolean;
  /** recently struck, for the view */
  hitT: number;
}

export interface Castle {
  id: number;
  /** the camp the walls enclose */
  base: number;
  name: string;
  x: number;
  z: number;
  /** wall radius */
  r: number;
  main: boolean;
  walls: Wall[];
  gates: Gate[];
  /** where the keep stands, for main castles */
  keep: { x: number; z: number } | null;
}

/** Half the thickness of a wall, metres. */
export const WALL_HALF = 0.75;
const SIDES = 12;
const GATE_W = 5.2;

/** Which camps are walled: castles, temples and barbicans. */
export function isWalled(name: string) {
  return /castle|temple|barbican/i.test(name);
}

/** Wall radius for a walled camp. */
export function wallRadius(main: boolean) {
  return main ? 23 : 19;
}

/**
 * Lay out the walls of every walled camp: a twelve-sided ring with three gates,
 * one facing the middle of the field and one on each flank.
 */
export function buildCastles(def: Pick<BattleDef, 'bases' | 'half'>): Castle[] {
  const out: Castle[] = [];
  let gateId = 0;
  def.bases.forEach((b, bi) => {
    if (!isWalled(b.name)) return;
    const main = !!b.main;
    const r = wallRadius(main);
    // the front gate faces the centre of the field
    const front = Math.atan2(-b.x, -b.z || 0.001);
    const step = (Math.PI * 2) / SIDES;
    // turn the ring so a side is centred on the front
    const a0 = front - step / 2;
    const gateSides = new Set([0, 4, 8]);
    const c: Castle = { id: out.length, base: bi, name: b.name, x: b.x, z: b.z, r, main, walls: [], gates: [], keep: null };
    for (let i = 0; i < SIDES; i++) {
      const ta = a0 + i * step,
        tb = a0 + (i + 1) * step;
      const ax = b.x + Math.sin(ta) * r,
        az = b.z + Math.cos(ta) * r,
        bx = b.x + Math.sin(tb) * r,
        bz = b.z + Math.cos(tb) * r;
      if (!gateSides.has(i)) {
        c.walls.push({ ax, az, bx, bz, gate: null });
        continue;
      }
      // a gate in the middle of the side, short walls either side of it
      const mx = (ax + bx) / 2,
        mz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len,
        uz = (bz - az) / len;
      const hw = GATE_W / 2;
      const ma = (ta + tb) / 2;
      const hp = main ? 1100 : 750;
      const g: Gate = { id: gateId++, castle: c.id, team: b.team, x: mx, z: mz, nx: Math.sin(ma), nz: Math.cos(ma), hp, maxHp: hp, broken: false, open: false, hitT: 0 };
      c.gates.push(g);
      c.walls.push({ ax, az, bx: mx - ux * hw, bz: mz - uz * hw, gate: null });
      c.walls.push({ ax: mx - ux * hw, az: mz - uz * hw, bx: mx + ux * hw, bz: mz + uz * hw, gate: g });
      c.walls.push({ ax: mx + ux * hw, az: mz + uz * hw, bx, bz, gate: null });
    }
    // a keep stands toward the back of a main castle
    if (main) c.keep = { x: b.x - Math.sin(front) * r * 0.5, z: b.z - Math.cos(front) * r * 0.5 };
    out.push(c);
  });
  return out;
}

/** Does this wall stop someone on `team`? */
export function blocks(w: Wall, team: number) {
  return !w.gate || (!w.gate.broken && w.gate.team !== team);
}

/** Do segments p→q and a→b cross? */
export function crosses(px: number, pz: number, qx: number, qz: number, ax: number, az: number, bx: number, bz: number) {
  const d1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax),
    d2 = (bx - ax) * (qz - az) - (bz - az) * (qx - ax),
    d3 = (qx - px) * (az - pz) - (qz - pz) * (ax - px),
    d4 = (qx - px) * (bz - pz) - (qz - pz) * (bx - px);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
