import type { HitDef, MoveDef, Moveset, React, WeaponKind } from '../sim/types';

const h = (
  t0: number,
  t1: number,
  range: number,
  arc: number,
  dmg: number,
  react: React,
  kb: number,
  stop: number,
  extra: Partial<HitDef> = {},
): HitDef => ({ t0, t1, range, arc, dmg, react, kb, stop, ...extra });

const m = (id: string, dur: number, cancel: number, hits: HitDef[], extra: Partial<MoveDef> = {}): MoveDef => ({
  id,
  anim: id,
  dur,
  cancel,
  hits,
  turn: hits.length ? hits[0].t0 : 0.1,
  ...extra,
});

/** A rapid flurry of n hits between t0 and t1, used by supers. */
function flurry(t0: number, t1: number, n: number, range: number, dmg: number, extra: Partial<HitDef> = {}): HitDef[] {
  const out: HitDef[] = [];
  const step = (t1 - t0) / n;
  for (let i = 0; i < n; i++) out.push(h(t0 + i * step, t0 + i * step + 0.07, range, 360, dmg, 'stagger', 1.5, 0.02, extra));
  return out;
}

// ---------------------------------------------------------------- katana
const katana: Moveset = {
  weapon: 'katana',
  reach: 2.6,
  lights: [
    m('k_l1', 0.4, 0.21, [h(0.09, 0.19, 2.7, 150, 13, 'stagger', 3, 0.035)], { lunge: [[0.03, 0.15, 6.5]], sfx: 'light', kind: 'light' }),
    m('k_l2', 0.4, 0.21, [h(0.09, 0.19, 2.7, 150, 13, 'stagger', 3, 0.035)], { lunge: [[0.03, 0.15, 6]], sfx: 'light', kind: 'light' }),
    m('k_l3', 0.42, 0.23, [h(0.1, 0.2, 2.8, 140, 15, 'stagger', 3.5, 0.04)], { lunge: [[0.03, 0.16, 6.5]], sfx: 'light', kind: 'light' }),
    m('k_l4', 0.46, 0.26, [h(0.12, 0.24, 3.1, 240, 17, 'stagger', 4, 0.045)], { lunge: [[0.04, 0.18, 5.5]], sfx: 'spin', kind: 'light' }),
    m('k_l5', 0.62, 0.42, [h(0.16, 0.28, 3.3, 120, 24, 'knock', 11, 0.08, { lift: 4.5, shake: 0.25 })], {
      lunge: [[0.06, 0.24, 11]],
      sfx: 'heavy',
      kind: 'light',
    }),
  ],
  charges: [
    // C1: guard-breaking pommel bash
    m('k_c1', 0.62, 0.4, [h(0.2, 0.3, 2.3, 100, 16, 'stun', 2, 0.07, { gb: true, shake: 0.2 })], { lunge: [[0.08, 0.24, 8]], sfx: 'heavy', kind: 'charge' }),
    // C2: launcher
    m('k_c2', 0.6, 0.3, [h(0.14, 0.26, 2.9, 130, 20, 'launch', 1.5, 0.075, { lift: 11.5, shake: 0.2 })], { lunge: [[0.04, 0.18, 6]], sfx: 'heavy', kind: 'charge' }),
    // C3: three cuts into a stun
    m(
      'k_c3',
      0.95,
      0.72,
      [
        h(0.1, 0.17, 2.8, 150, 9, 'stagger', 1.5, 0.03),
        h(0.26, 0.33, 2.8, 150, 9, 'stagger', 1.5, 0.03),
        h(0.42, 0.49, 2.8, 150, 9, 'stagger', 1.5, 0.03),
        h(0.6, 0.7, 3.0, 150, 18, 'stun', 3, 0.08, { gb: true, shake: 0.2 }),
      ],
      { lunge: [[0.04, 0.6, 3]], sfx: 'spin', kind: 'charge' },
    ),
    // C4: crowd clear
    m('k_c4', 0.8, 0.56, [h(0.2, 0.36, 3.9, 360, 30, 'knock', 13, 0.1, { lift: 5.5, shake: 0.4 })], { lunge: [[0.06, 0.2, 7]], sfx: 'spin', kind: 'charge', armor: true }),
    // C5: rising cut then ground slam
    m(
      'k_c5',
      1.05,
      0.86,
      [
        h(0.14, 0.24, 3.0, 160, 16, 'launch', 1, 0.06, { lift: 9 }),
        h(0.56, 0.68, 4.6, 360, 38, 'knock', 14, 0.13, { lift: 7, shake: 0.6, gb: true }),
      ],
      { lunge: [[0.04, 0.16, 6]], sfx: 'heavy', kind: 'charge', armor: true },
    ),
  ],
  airLight: m('k_al', 0.36, 0.2, [h(0.07, 0.18, 2.9, 200, 13, 'stagger', 2, 0.035, { lift: 4.5 })], { air: true, sfx: 'light', kind: 'air' }),
  airHeavy: m('k_ah', 0.7, 0.55, [h(0, 9, 3.8, 360, 28, 'knock', 11, 0.1, { lift: 6, shake: 0.45, onLand: true })], {
    air: true,
    plunge: 26,
    sfx: 'heavy',
    kind: 'air',
  }),
  dash: m('k_dash', 0.56, 0.38, [h(0.1, 0.26, 3.0, 170, 22, 'knock', 10, 0.07, { lift: 4, shake: 0.2 })], { lunge: [[0, 0.26, 15]], sfx: 'heavy', kind: 'dash' }),
  super: m(
    'k_super',
    2.5,
    2.5,
    [...flurry(0.32, 1.85, 9, 4.3, 9, { pull: true }), h(2.02, 2.16, 6.0, 360, 55, 'knock', 17, 0.18, { lift: 8, shake: 1, gb: true })],
    { armor: true, invuln: true, sfx: 'super', kind: 'super', lunge: [[0.3, 1.85, 2.2]], turn: 1.8 },
  ),
};

// ---------------------------------------------------------------- yari (spear)
const yari: Moveset = {
  weapon: 'yari',
  reach: 3.4,
  lights: [
    m('y_l1', 0.42, 0.23, [h(0.1, 0.2, 3.5, 130, 13, 'stagger', 3, 0.035)], { lunge: [[0.03, 0.16, 6]], sfx: 'light', kind: 'light' }),
    m('y_l2', 0.42, 0.23, [h(0.1, 0.2, 3.5, 130, 13, 'stagger', 3, 0.035)], { lunge: [[0.03, 0.16, 6]], sfx: 'light', kind: 'light' }),
    m('y_l3', 0.4, 0.22, [h(0.09, 0.18, 4.0, 50, 15, 'stagger', 4.5, 0.045)], { lunge: [[0.02, 0.15, 8]], sfx: 'thrust', kind: 'light' }),
    m('y_l4', 0.5, 0.28, [h(0.12, 0.26, 3.8, 300, 17, 'stagger', 4, 0.045)], { lunge: [[0.04, 0.18, 5]], sfx: 'spin', kind: 'light' }),
    m('y_l5', 0.66, 0.45, [h(0.18, 0.3, 4.2, 70, 25, 'knock', 12, 0.085, { lift: 4, shake: 0.25 })], { lunge: [[0.06, 0.26, 12]], sfx: 'thrust', kind: 'light' }),
  ],
  charges: [
    m('y_c1', 0.64, 0.42, [h(0.2, 0.32, 3.4, 110, 16, 'stun', 2.5, 0.07, { gb: true, shake: 0.2 })], { lunge: [[0.08, 0.24, 7]], sfx: 'heavy', kind: 'charge' }),
    m('y_c2', 0.6, 0.3, [h(0.14, 0.27, 3.5, 120, 20, 'launch', 1.5, 0.075, { lift: 11.5, shake: 0.2 })], { lunge: [[0.04, 0.18, 6]], sfx: 'heavy', kind: 'charge' }),
    // C3: rapid thrusts
    m(
      'y_c3',
      1.0,
      0.78,
      [
        h(0.1, 0.16, 4.1, 50, 7, 'stagger', 1, 0.025),
        h(0.21, 0.27, 4.1, 50, 7, 'stagger', 1, 0.025),
        h(0.32, 0.38, 4.1, 50, 7, 'stagger', 1, 0.025),
        h(0.43, 0.49, 4.1, 50, 7, 'stagger', 1, 0.025),
        h(0.64, 0.75, 4.4, 60, 20, 'stun', 5, 0.09, { gb: true, shake: 0.25 }),
      ],
      { lunge: [[0.04, 0.64, 2.5]], sfx: 'thrust', kind: 'charge' },
    ),
    m('y_c4', 0.86, 0.6, [h(0.2, 0.42, 4.6, 360, 30, 'knock', 13, 0.1, { lift: 5.5, shake: 0.4 })], { lunge: [[0.06, 0.2, 6]], sfx: 'spin', kind: 'charge', armor: true }),
    m(
      'y_c5',
      1.1,
      0.9,
      [
        h(0.14, 0.26, 3.8, 200, 16, 'launch', 1, 0.06, { lift: 9 }),
        h(0.6, 0.72, 5.0, 360, 38, 'knock', 14, 0.13, { lift: 7, shake: 0.6, gb: true }),
      ],
      { lunge: [[0.04, 0.16, 6]], sfx: 'heavy', kind: 'charge', armor: true },
    ),
  ],
  airLight: m('y_al', 0.38, 0.22, [h(0.07, 0.2, 3.5, 220, 13, 'stagger', 2, 0.035, { lift: 4.5 })], { air: true, sfx: 'spin', kind: 'air' }),
  airHeavy: m('y_ah', 0.7, 0.55, [h(0, 9, 4.0, 360, 28, 'knock', 11, 0.1, { lift: 6, shake: 0.45, onLand: true })], { air: true, plunge: 26, sfx: 'heavy', kind: 'air' }),
  dash: m('y_dash', 0.58, 0.4, [h(0.08, 0.28, 4.2, 60, 22, 'knock', 11, 0.07, { lift: 4, shake: 0.2 })], { lunge: [[0, 0.28, 16]], sfx: 'thrust', kind: 'dash' }),
  super: m(
    'y_super',
    2.6,
    2.6,
    [...flurry(0.32, 1.95, 10, 5.0, 8, { pull: true }), h(2.12, 2.26, 6.5, 360, 55, 'knock', 17, 0.18, { lift: 8, shake: 1, gb: true })],
    { armor: true, invuln: true, sfx: 'super', kind: 'super', lunge: [[0.3, 1.9, 2.5]], turn: 1.9 },
  ),
};

// ---------------------------------------------------------------- derived weapons
interface Scale {
  speed: number;
  range: number;
  dmg: number;
  stop: number;
  kb?: number;
}
function scaleMove(mv: MoveDef, prefix: string, k: Scale): MoveDef {
  const t = (v: number) => v * k.speed;
  return {
    ...mv,
    id: prefix + mv.id.slice(1),
    anim: prefix + mv.id.slice(1),
    dur: t(mv.dur),
    cancel: t(mv.cancel),
    turn: mv.turn !== undefined ? t(mv.turn) : undefined,
    lunge: mv.lunge?.map(([a, b, v]) => [t(a), t(b), v / Math.sqrt(k.speed)] as [number, number, number]),
    hits: mv.hits.map((x) => ({ ...x, t0: x.onLand ? x.t0 : t(x.t0), t1: x.onLand ? x.t1 : t(x.t1), range: x.range * k.range, dmg: Math.round(x.dmg * k.dmg), stop: x.stop * k.stop, kb: x.kb * (k.kb ?? 1) })),
  };
}
function derive(base: Moveset, weapon: WeaponKind, prefix: string, k: Scale, lights = base.lights.length): Moveset {
  const f = (mv: MoveDef) => scaleMove(mv, prefix, k);
  return {
    weapon,
    reach: base.reach * k.range,
    lights: base.lights.slice(0, lights).map(f),
    charges: base.charges.slice(0, lights + 1).map(f),
    airLight: f(base.airLight),
    airHeavy: f(base.airHeavy),
    dash: f(base.dash),
    super: f(base.super),
  };
}
/** Adds an echo hit to a move: the second blade of a pair. */
const echo = (mv: MoveDef, delay: number, dmgMul = 0.8): MoveDef => ({
  ...mv,
  hits: [...mv.hits, ...mv.hits.filter((x) => !x.onLand).map((x) => ({ ...x, t0: x.t0 + delay, t1: x.t1 + delay, dmg: Math.round(x.dmg * dmgMul), stop: x.stop * 0.7 }))].sort((a, b) => a.t0 - b.t0),
  dur: mv.dur + delay * 0.6,
  cancel: mv.cancel + delay * 0.8,
});

// Twin blades: short reach, fast, every cut lands twice.
const dual = derive(katana, 'dual', 'd', { speed: 0.84, range: 0.86, dmg: 0.62, stop: 0.7 });
dual.lights = dual.lights.map((mv, i) => (i < 4 ? echo(mv, 0.07) : mv));
dual.charges[3] = echo(dual.charges[3], 0.12);
dual.airLight = echo(dual.airLight, 0.07);
dual.super = { ...dual.super, hits: [...flurry(0.28, 1.56, 16, 4.0, 6, { pull: true }), ...dual.super.hits.slice(-1)] };

// Great sword: slow, long, heavy; later swings cannot be interrupted.
const odachi = derive(katana, 'odachi', 'o', { speed: 1.24, range: 1.3, dmg: 1.5, stop: 1.45, kb: 1.25 });
odachi.lights.forEach((mv, i) => {
  if (i >= 2) mv.armor = true;
  mv.hits.forEach((x) => (x.arc = Math.min(360, x.arc + 40)));
});

// Naginata: sweeping arcs that own the space around you, four-step string.
const naginata = derive(yari, 'naginata', 'n', { speed: 1.06, range: 1.08, dmg: 1.05, stop: 1.1 }, 4);
naginata.lights.forEach((mv) => mv.hits.forEach((x) => (x.arc = Math.max(x.arc, 210))));
naginata.lights[3] = { ...naginata.lights[3], hits: naginata.lights[3].hits.map((x) => ({ ...x, react: 'knock' as const, kb: 10, lift: 4, stop: 0.08, shake: 0.25 })) };

// Kanabo: three ponderous blows that flatten everything and shake the ground.
const kanabo = derive(katana, 'kanabo', 'b', { speed: 1.42, range: 1.18, dmg: 1.9, stop: 1.7, kb: 1.5 }, 3);
for (const mv of [...kanabo.lights, ...kanabo.charges, kanabo.dash]) {
  mv.armor = true;
  mv.hits.forEach((x) => {
    if (x.react === 'stagger') {
      x.react = 'knock';
      x.kb = Math.max(x.kb, 8);
      x.lift = x.lift ?? 3.5;
    }
    x.shake = Math.max(x.shake ?? 0, 0.3);
  });
}

// Matchlock: bayonet jabs for lights, gunfire for every charge.
const gun = derive(yari, 'gun', 'g', { speed: 0.95, range: 0.7, dmg: 0.8, stop: 0.9 });
const shot = (id: string, dur: number, hits: HitDef[], extra: Partial<MoveDef> = {}): MoveDef => m(id, dur, dur * 0.72, hits, { sfx: 'shot', kind: 'charge', ...extra });
gun.charges = [
  shot('g_c1', 0.66, [h(0.24, 0.3, 18, 9, 30, 'knock', 9, 0.09, { lift: 3, shake: 0.3, gb: true })]),
  shot('g_c2', 0.62, [h(0.12, 0.2, 2.6, 120, 10, 'launch', 1, 0.05, { lift: 10 }), h(0.4, 0.46, 9, 30, 18, 'stagger', 2, 0.06, { lift: 7 })]),
  shot('g_c3', 0.95, [h(0.2, 0.25, 15, 34, 14, 'stagger', 3, 0.05), h(0.38, 0.43, 15, 34, 14, 'stagger', 3, 0.05), h(0.56, 0.62, 15, 34, 20, 'knock', 9, 0.08, { lift: 3.5, shake: 0.3 })]),
  shot('g_c4', 0.9, [h(0.22, 0.5, 8.5, 360, 26, 'knock', 11, 0.09, { lift: 5, shake: 0.4 })], { armor: true }),
  shot('g_c5', 1.1, [h(0.16, 0.26, 2.8, 160, 12, 'launch', 1, 0.05, { lift: 9 }), h(0.62, 0.7, 11, 70, 42, 'knock', 15, 0.14, { lift: 7, shake: 0.7, gb: true })], { armor: true }),
];
gun.airHeavy = shot('g_ah', 0.6, [h(0.14, 0.2, 9, 360, 24, 'knock', 9, 0.08, { lift: 5, shake: 0.3 })], { air: true, kind: 'air' });
gun.super = m('g_super', 2.4, 2.4, [...flurry(0.3, 1.8, 12, 11, 8), h(2.0, 2.12, 13, 360, 55, 'knock', 17, 0.18, { lift: 8, shake: 1, gb: true })], { armor: true, invuln: true, sfx: 'super', kind: 'super', turn: 1.8 });

// Kusarigama: a sickle on a long weighted chain. The longest reach of any blade; its cuts drag the enemy in.
const kusarigama = derive(katana, 'kusarigama', 'q', { speed: 0.96, range: 1.5, dmg: 0.78, stop: 0.8 });
kusarigama.lights.forEach((mv, i) =>
  mv.hits.forEach((x) => {
    x.arc = Math.min(360, x.arc + 50);
    if (i === 2 || i === 3) x.pull = true;
  }),
);
kusarigama.charges[2] = { ...kusarigama.charges[2], hits: kusarigama.charges[2].hits.map((x, i, a) => (i < a.length - 1 ? { ...x, pull: true, arc: 220 } : x)) };
kusarigama.dash.hits.forEach((x) => (x.pull = true));
kusarigama.super = { ...kusarigama.super, hits: [...flurry(0.3, 1.8, 11, 6.2, 8, { pull: true }), ...kusarigama.super.hits.slice(-1).map((x) => ({ ...x, range: 7.5 }))] };

// Tessen: an iron war fan. Quick, light cuts that throw up gusts: everything bowls over and out of the way.
const tessen = derive(katana, 'tessen', 'f', { speed: 0.88, range: 1.12, dmg: 0.76, stop: 0.85, kb: 1.6 });
tessen.lights.forEach((mv) => mv.hits.forEach((x) => (x.arc = Math.min(360, x.arc + 80))));
for (const mv of [...tessen.charges, tessen.airHeavy])
  mv.hits.forEach((x) => {
    x.range *= 1.2;
    x.arc = Math.max(x.arc, 200);
  });
tessen.charges[0] = { ...tessen.charges[0], hits: tessen.charges[0].hits.map((x) => ({ ...x, range: 5.5, arc: 70, react: 'knock' as const, kb: 14, lift: 3 })) };

// Masakari: a great axe. Four slow, crushing blows, none of which can be interrupted, and every charge breaks guard.
const masakari = derive(katana, 'masakari', 'a', { speed: 1.3, range: 1.2, dmg: 1.62, stop: 1.6, kb: 1.35 }, 4);
masakari.lights.forEach((mv, i) => {
  if (i >= 1) mv.armor = true;
  mv.hits.forEach((x) => (x.shake = Math.max(x.shake ?? 0, 0.15)));
});
masakari.charges.forEach((mv) => mv.hits.forEach((x) => (x.gb = true)));

// Bo: a fighting staff. Both ends strike, so every cut of the string lands twice and spins clear a full circle.
const bo = derive(yari, 'bo', 's', { speed: 0.88, range: 0.95, dmg: 0.62, stop: 0.75, kb: 1.25 });
bo.lights = bo.lights.map((mv, i) => {
  const wide = { ...mv, hits: mv.hits.map((x) => ({ ...x, arc: Math.max(x.arc, i === 3 ? 360 : 220) })) };
  return i < 4 ? echo(wide, 0.09, 0.75) : wide;
});
bo.charges[2] = echo(bo.charges[2], 0.05, 0.6);

/** Saddle attacks, shared by every officer. The horse keeps moving while they play. */
export const MOUNTED: MoveDef[] = [
  m('m_l1', 0.46, 0.26, [h(0.1, 0.24, 3.4, 200, 15, 'stagger', 5, 0.035)], { sfx: 'light', kind: 'light', mounted: true }),
  m('m_l2', 0.46, 0.26, [h(0.1, 0.24, 3.4, 200, 15, 'stagger', 5, 0.035)], { sfx: 'light', kind: 'light', mounted: true }),
  m('m_c4', 0.8, 0.6, [h(0.18, 0.4, 4.2, 360, 26, 'knock', 12, 0.08, { lift: 5, shake: 0.35 })], { sfx: 'spin', kind: 'charge', mounted: true, armor: true }),
];
/** What a galloping horse does to anyone in its way. */
export const TRAMPLE: MoveDef = m('m_tr', 1, 1, [h(0, 9, 1.9, 130, 9, 'knock', 8, 0, { lift: 3.5 })], { kind: 'dash', mounted: true });

export const MOVESETS: Partial<Record<WeaponKind, Moveset>> = { katana, yari, dual, odachi, naginata, kanabo, gun, kusarigama, tessen, masakari, bo };

export function movesetFor(w: WeaponKind): Moveset {
  return MOVESETS[w] ?? katana;
}
