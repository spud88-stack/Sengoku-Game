import { TUNE, DIFFICULTY, type Difficulty } from '../data/tuning';
import { angDiff } from '../core/math';
import type { Fighter } from './fighter';
import type { Personality } from './types';
import type { Base, World } from './world';

/** How each temperament bends the shared decision rules. */
const PERS: Record<Personality, { aggr: number; guard: number; dodge: number; retreatAt: number; hunt: number; defend: number; label: string }> = {
  reckless: { aggr: 0.25, guard: -0.25, dodge: 0.2, retreatAt: 0.15, hunt: 0.25, defend: -0.15, label: 'reckless' },
  patient: { aggr: -0.2, guard: 0.25, dodge: 0.25, retreatAt: 0.3, hunt: -0.1, defend: 0.2, label: 'patient' },
  cunning: { aggr: 0, guard: 0.1, dodge: 0.6, retreatAt: 0.42, hunt: 0.1, defend: 0, label: 'cunning' },
  honorable: { aggr: 0.1, guard: 0.1, dodge: 0.3, retreatAt: 0.22, hunt: 0.2, defend: 0.1, label: 'honorable' },
};

type GoalKind = 'attack' | 'defend' | 'support' | 'hunt' | 'retreat' | 'hold';
interface Goal {
  kind: GoalKind;
  base?: Base;
  target?: Fighter;
  score: number;
}

interface Brain {
  goal: Goal;
  goalT: number;
  sayT: number;
  // duel
  seenSerial: number;
  seenAt: number;
  decided: number;
  defend: '' | 'guard' | 'dodge';
  defendUntil: number;
  attackT: number;
  plan: number;
  finisher: boolean;
  strafe: number;
  strafeT: number;
  memory: Map<string, number>;
  blockedCount: number;
  lastHp: number;
  status: string;
  lastAttackSeen: number;
  stanceUntil: number;
  stanceRoll: number;
  wasBusy: boolean;
  prevD: number;
}

function brain(f: Fighter): Brain {
  return (f.ai ??= {
    goal: { kind: 'hold', score: 0 },
    goalT: 0,
    sayT: 0,
    seenSerial: -1,
    seenAt: 0,
    decided: -1,
    defend: '',
    defendUntil: 0,
    attackT: 1,
    plan: 0,
    finisher: false,
    strafe: 1,
    strafeT: 0,
    memory: new Map(),
    blockedCount: 0,
    lastHp: f.hp,
    status: '',
    lastAttackSeen: -9,
    stanceUntil: 0,
    stanceRoll: 0,
    wasBusy: false,
    prevD: 99,
  } satisfies Brain);
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// ------------------------------------------------------------------ strategy
function chooseGoal(f: Fighter, w: World, b: Brain): Goal {
  const p = PERS[f.def.personality];
  const morale = w.morale[f.team] / 100;
  const opts: Goal[] = [];
  const hpFrac = f.hp / f.maxHp;

  if (hpFrac < p.retreatAt || (b.goal.kind === 'retreat' && hpFrac < 0.7)) {
    const home = w.nearestBase(f.x, f.z, (x) => x.team === f.team);
    if (home) opts.push({ kind: 'retreat', base: home, score: 1.3 });
  }

  for (const base of w.bases) {
    const d = dist(f, base);
    if (base.team !== f.team) {
      let s = 0.5 + p.aggr * 0.4 + (morale - 0.5) * 0.4 - d / 320;
      if (base.garrison < base.maxGarrison * 0.4) s += 0.2;
      if (base.main) s += morale > 0.65 ? 0.15 : -0.25;
      if (f.isCommander) s -= morale > 0.75 ? 0.2 : 0.7;
      opts.push({ kind: 'attack', base, score: s });
    } else {
      const enemyNear = w.fighters.some((o) => o.team !== f.team && !o.dead && dist(o, base) < base.r * 1.3);
      if (base.threat > 0 || enemyNear) {
        let s = 0.62 + p.defend - d / 260 + (base.main ? 0.45 : 0) + (enemyNear ? 0.15 : 0);
        if (f.isCommander) s += base.main ? 0.4 : -0.6;
        opts.push({ kind: 'defend', base, score: s });
      }
    }
  }

  for (const o of w.fighters) {
    if (o === f || o.dead) continue;
    const d = dist(f, o);
    if (o.team === f.team) {
      if (o.combatT > 0 && o.hp / o.maxHp < 0.5) {
        let s = 0.6 - d / 200 + (f.def.personality === 'honorable' ? 0.2 : 0) + (o.isCommander ? 0.35 : 0);
        if (f.isCommander) s -= 0.7;
        opts.push({ kind: 'support', target: o, score: s });
      }
    } else {
      let s = 0.32 + p.hunt + p.aggr * 0.2 - d / 150;
      if (o.isPlayer && w.ko > 120) s += Math.min(0.35, w.ko / 1000);
      if (o.hp / o.maxHp < 0.4) s += f.def.personality === 'cunning' ? 0.35 : 0.15;
      if (f.def.personality === 'honorable') s += (o.maxHp / 700) * 0.15;
      if (f.isCommander) s -= d > 22 ? 0.9 : 0;
      opts.push({ kind: 'hunt', target: o, score: s });
    }
  }

  const main = w.bases.find((x) => x.main && x.team === f.team);
  if (f.isCommander && main) opts.push({ kind: 'hold', base: main, score: 0.8 });
  if (!opts.length) opts.push({ kind: 'hold', score: 0 });

  let best = opts[0];
  for (const o of opts) {
    const same = o.kind === b.goal.kind && o.base === b.goal.base && o.target === b.goal.target;
    const s = o.score + (same ? 0.15 : 0);
    if (s > best.score + (best.kind === b.goal.kind && best.base === b.goal.base && best.target === b.goal.target ? 0.15 : 0)) best = o;
  }
  return best;
}

function announce(f: Fighter, w: World, g: Goal) {
  const n = f.def.name;
  const enemyOfPlayer = f.team !== w.playerTeam;
  const kind = enemyOfPlayer ? 'bad' : 'info';
  switch (g.kind) {
    case 'attack':
      w.log(`${n} is advancing on ${g.base!.name}.`, f.team, kind);
      break;
    case 'defend':
      w.log(`${n} is falling back to defend ${g.base!.name}.`, f.team, kind);
      break;
    case 'support':
      w.log(`${n} is moving to reinforce ${g.target!.def.name}.`, f.team, kind);
      break;
    case 'hunt':
      if (g.target!.isPlayer) w.say(f, f.def.personality === 'honorable' ? `${g.target!.def.name}! Face me!` : `That one has done enough damage. ${g.target!.def.name} is mine!`);
      else w.log(`${n} is hunting ${g.target!.def.name}.`, f.team, kind);
      break;
    case 'retreat':
      w.log(`${n} is withdrawing to ${g.base!.name} to recover.`, f.team, enemyOfPlayer ? 'good' : 'bad');
      break;
  }
}

// ------------------------------------------------------------------ controller
export function officerAI(f: Fighter, w: World, dt: number) {
  const b = brain(f);
  const it = f.intent;
  it.mx = it.mz = 0;
  it.light = it.heavy = it.jump = it.dodge = it.super = it.rage = it.guard = false;
  const diff: Difficulty = f.team === w.playerTeam ? DIFFICULTY.normal : w.diff;
  const p = PERS[f.def.personality];

  // --- strategic layer
  b.sayT -= dt;
  if ((b.goalT -= dt) <= 0) {
    b.goalT = 2.5 + (f.id % 5) * 0.2;
    const g = chooseGoal(f, w, b);
    const changed = g.kind !== b.goal.kind || g.base !== b.goal.base || g.target !== b.goal.target;
    b.goal = g;
    if (changed && b.sayT <= 0 && w.time > 3) {
      announce(f, w, g);
      b.sayT = 9;
    }
    if (f.hp < b.lastHp - f.maxHp * 0.25 && f.team === w.playerTeam && !f.isPlayer && f.hp / f.maxHp < 0.45 && b.sayT <= 0) {
      w.say(f, 'I am hard pressed here! Send aid!');
      b.sayT = 12;
    }
    b.lastHp = f.hp;
  }
  if (f.rage >= TUNE.rage.max && f.combatT > 0 && f.hp < f.maxHp * 0.7) it.rage = true;

  const g = b.goal;
  let gx = f.x,
    gz = f.z,
    arrive = 3;
  if (g.kind === 'hunt' || g.kind === 'support') {
    gx = g.target!.x;
    gz = g.target!.z;
    arrive = g.kind === 'support' ? 6 : 2;
  } else if (g.base) {
    gx = g.base.x;
    gz = g.base.z;
    arrive = g.kind === 'attack' ? 4 : g.base.r * 0.4;
  }
  b.status = g.kind + (g.base ? ':' + g.base.name : g.target ? ':' + g.target.def.name : '');

  // --- pick someone to fight
  let foe: Fighter | null = null;
  let fd = g.kind === 'retreat' ? 5 : 11;
  for (const o of w.fighters) {
    if (o.team === f.team || o.dead) continue;
    const d = dist(f, o);
    const bonus = o === g.target ? 6 : 0;
    if (d - bonus < fd) {
      fd = d - bonus;
      foe = o;
    }
  }
  f.lock = foe;

  if (foe) {
    duel(f, foe, w, b, diff, p, dt);
    return;
  }

  // --- travel, cutting down whatever is in the way
  const dx = gx - f.x,
    dz = gz - f.z;
  const d = Math.hypot(dx, dz);
  let near = 0,
    ex = 0,
    ez = 0;
  w.forNear(f.x, f.z, f.reach + 0.5, (s) => {
    if (s.team !== f.team && !s.dead && (s.x - f.x) ** 2 + (s.z - f.z) ** 2 < (f.reach + 0.5) ** 2) {
      near++;
      ex += s.x - f.x;
      ez += s.z - f.z;
    }
  });
  if (g.kind !== 'retreat' && near >= (d > arrive ? 2 : 1)) {
    b.status += ' (clearing)';
    if (f.state === 'free') {
      // turn toward the cluster before swinging
      it.mx = ex * 0.01;
      it.mz = ez * 0.01;
      if (f.spirit >= TUNE.spirit.max && near >= 5) it.super = true;
      else it.light = true;
      b.plan = w.rng.int(2, 5);
      b.finisher = true;
    } else if (f.state === 'attack' && f.move && f.moveT >= f.move.cancel - 0.04 && f.move.kind === 'light') {
      if (f.combo >= b.plan) it.heavy = b.finisher;
      else it.light = true;
    }
    return;
  }
  if (d > arrive) {
    // march with the troops; only a retreat or a rescue is worth a sprint
    const pace = g.kind === 'retreat' || g.kind === 'support' || f.combatT > 0 ? 1 : TUNE.npcMarch;
    it.mx = dx / d;
    it.mz = dz / d;
    avoidObstacles(f, w, it);
    const m = Math.hypot(it.mx, it.mz) || 1;
    it.mx = (it.mx / m) * pace;
    it.mz = (it.mz / m) * pace;
  }
}

function avoidObstacles(f: Fighter, w: World, it: { mx: number; mz: number }) {
  for (const o of w.obstacles) {
    const ox = o.x - f.x,
      oz = o.z - f.z;
    const ahead = ox * it.mx + oz * it.mz;
    if (ahead < 0 || ahead > o.r + 5) continue;
    const side = ox * it.mz - oz * it.mx;
    if (Math.abs(side) < o.r + 1) {
      const k = side > 0 ? -1 : 1;
      it.mx += it.mz * k * 0.9;
      it.mz += -it.mx * k * 0.9;
    }
  }
}

// ------------------------------------------------------------------ duel
function duel(f: Fighter, e: Fighter, w: World, b: Brain, diff: Difficulty, p: (typeof PERS)[Personality], dt: number) {
  const it = f.intent;
  const dx = e.x - f.x,
    dz = e.z - f.z;
  const d = Math.hypot(dx, dz) || 0.001;
  const nx = dx / d,
    nz = dz / d;
  const reach = f.reach * 0.85 + TUNE.fighter.radius;
  const aggr = Math.min(1, Math.max(0.1, diff.aggression + p.aggr * 0.5 + (w.morale[f.team] - 50) / 250));
  b.status += ` vs ${e.def.name}`;

  if (f.state === 'hitstun' || f.state === 'launched' || f.state === 'down' || f.state === 'stunned' || f.state === 'getup') {
    b.defend = '';
    b.plan = 0;
    b.wasBusy = true;
    return;
  }
  // Coming out of a beating, or seeing someone step into range, is when a trained fighter covers up.
  const threatRange = e.reach + 1.4;
  if (b.wasBusy && d < threatRange + 0.6 && w.rng.chance(diff.guardSkill + p.guard)) b.stanceUntil = w.time + w.rng.range(0.4, 0.8);
  else if (b.prevD > threatRange && d <= threatRange && e.state === 'free' && w.rng.chance(diff.guardSkill * 0.8 + p.guard)) b.stanceUntil = w.time + w.rng.range(0.5, 1.0);
  b.wasBusy = false;
  b.prevD = d;

  // Perceive the opponent's attack only after a reaction delay.
  if (e.state === 'attack' && e.moveSerial !== b.seenSerial) {
    b.seenSerial = e.moveSerial;
    // The opener has to be reacted to; the rest of a string can be anticipated.
    const chained = w.time - b.lastAttackSeen < 0.5;
    b.seenAt = w.time + diff.react * (chained ? 0.25 : w.rng.range(0.8, 1.3));
    if (e.move) b.memory.set(e.move.id, (b.memory.get(e.move.id) ?? 0) + 1);
  }
  if (e.state === 'attack') b.lastAttackSeen = w.time;
  if (w.rng.chance(dt * 0.25)) for (const [k, v] of b.memory) b.memory.set(k, v * 0.8);
  const sees = e.state === 'attack' && w.time >= b.seenAt;

  // Their super is unblockable trouble: get out.
  if (sees && e.move?.kind === 'super' && d < 8) {
    it.mx = -nx;
    it.mz = -nz;
    if (d < 5 && f.state === 'free' && w.rng.chance(dt * 4)) it.dodge = true;
    b.plan = 0;
    return;
  }

  // Decide once per enemy move how to answer it.
  const facingMe = Math.abs(angDiff(e.face, Math.atan2(-nx, -nz))) < 1.2;
  if (sees && e.threatening && facingMe && d < e.reach + 2 && b.decided !== e.moveSerial && f.state !== 'attack') {
    b.decided = e.moveSerial;
    const familiarity = Math.min(0.4, ((b.memory.get(e.move!.id) ?? 0) - 2) * 0.14);
    const chance = diff.guardSkill + p.guard + Math.max(0, familiarity);
    if (w.rng.chance(chance)) {
      const gb = e.move!.hits.some((h) => h.gb);
      if (gb || w.rng.chance(p.dodge * 0.6)) b.defend = 'dodge';
      else b.defend = 'guard';
      b.defendUntil = w.time + Math.max(0.25, e.move!.dur - e.moveT) + 0.05;
      b.plan = 0;
    }
  }
  if (b.defend && w.time > b.defendUntil) {
    // A read on a familiar move earns an immediate counter.
    if (b.defend === 'guard' && d < reach + 1 && (e.recovering || w.rng.chance(diff.guardSkill))) startCombo(f, b, w, aggr, true);
    b.defend = '';
  }
  if (b.defend === 'guard') {
    it.guard = true;
    return;
  }
  if (b.defend === 'dodge') {
    if (f.state === 'free' || f.state === 'guard') {
      const side = b.strafe;
      const back = d < 3 ? -0.6 : 0;
      it.mx = -nz * side + nx * back;
      it.mz = nx * side + nz * back;
      it.dodge = true;
    }
    b.defend = '';
    return;
  }

  // Mid-combo: keep pressing unless it's being blocked.
  if (f.state === 'attack' && f.move) {
    const mv = f.move;
    if (f.moveBlocked) b.blockedCount++;
    if (mv.kind === 'light' && f.moveT >= mv.cancel - 0.04 && b.plan > 0) {
      const confirm = f.moveConnected || f.def.personality === 'reckless';
      if (f.moveBlocked && f.def.personality === 'cunning') {
        // stop feeding the guard and crack it instead
        b.plan = 0;
        b.attackT = 0.15;
        b.finisher = false;
        b.blockedCount = 99;
      } else if (confirm || f.combo < 2) {
        if (f.combo >= b.plan) {
          if (b.finisher) it.heavy = true;
          b.plan = 0;
        } else it.light = true;
      } else b.plan = 0;
    }
    // chase a launch
    if (f.moveConnected && mv.hits.some((h) => h.react === 'launch') && f.moveT >= mv.cancel && aggr > 0.6 && e.y > 1) it.jump = true;
    return;
  }
  if (f.state === 'air') {
    if (e.y > 0.5 && d < reach + 1) it.light = true;
    else if (d < 3.5 && f.vy < 0 && w.rng.chance(0.2)) it.heavy = true;
    it.mx = nx;
    it.mz = nz;
    return;
  }
  if (f.state !== 'free' && f.state !== 'guard') return;

  // Super when it will land.
  if (f.spirit >= TUNE.spirit.max && d < 4.2 && e.invuln <= 0 && e.state !== 'guard' && (e.state === 'stunned' || e.state === 'hitstun' || w.rng.chance(dt * (0.6 + aggr)))) {
    it.super = true;
    return;
  }

  // Openings.
  const inReach = d < reach + 0.4;
  const opening = e.recovering || e.state === 'stunned' || e.state === 'hitstun';
  if (opening && d < reach + 2.2) {
    if (!inReach) {
      it.mx = nx;
      it.mz = nz;
    } else startCombo(f, b, w, aggr, true);
    if (inReach) pressFirst(f, b, it);
    return;
  }
  const turtling = e.state === 'guard' && e.guardT > 0.7;
  if ((turtling || b.blockedCount >= 99) && inReach) {
    it.heavy = true; // C1 breaks guard
    b.blockedCount = 0;
    b.attackT = 0.6;
    return;
  }

  // Neutral: close in, circle, pick a moment.
  if (w.time < b.stanceUntil && !opening) {
    it.guard = true;
    it.mx = -nz * b.strafe * 0.6;
    it.mz = nx * b.strafe * 0.6;
    b.attackT -= dt * 0.5;
    return;
  }
  b.attackT -= dt;
  if ((b.strafeT -= dt) <= 0) {
    b.strafeT = w.rng.range(0.8, 2.4);
    if (w.rng.chance(0.45)) b.strafe = -b.strafe;
  }
  const hold = reach + (f.def.personality === 'patient' ? 1.6 : 0.6);
  if (d > hold + 0.6) {
    it.mx = nx;
    it.mz = nz;
  } else if (b.attackT <= 0 && (e.state !== 'down' || f.def.personality !== 'honorable')) {
    if (!inReach) {
      it.mx = nx;
      it.mz = nz;
    } else {
      startCombo(f, b, w, aggr, false);
      pressFirst(f, b, it);
    }
  } else {
    const inOut = d < hold - 0.8 ? -0.7 : 0;
    it.mx = -nz * b.strafe * 0.75 + nx * inOut;
    it.mz = nx * b.strafe * 0.75 + nz * inOut;
    // Raise the guard pre-emptively when an opponent squares up in range; skilled and patient fighters do it more.
    if (w.time > b.stanceRoll) {
      b.stanceRoll = w.time + 0.45;
      const squaredUp = d < e.reach + 1.4 && facingMe && (e.state === 'free' || e.state === 'dodge');
      if (squaredUp && w.rng.chance(diff.guardSkill * 0.4 + p.guard * 0.5)) b.stanceUntil = w.time + w.rng.range(0.45, 1.0);
    }
  }
}

function startCombo(f: Fighter, b: Brain, w: World, aggr: number, punish: boolean) {
  const max = f.moveset.lights.length;
  b.plan = punish ? w.rng.int(3, max) : w.rng.int(1, Math.max(2, Math.round(max * (0.4 + aggr * 0.6))));
  b.finisher = w.rng.chance(0.75);
  b.attackT = (1.7 - aggr * 1.35) * w.rng.range(0.6, 1.5);
}

function pressFirst(f: Fighter, b: Brain, it: Fighter['intent']) {
  if (b.plan > 0 && (f.state === 'free' || f.state === 'guard')) it.light = true;
}
