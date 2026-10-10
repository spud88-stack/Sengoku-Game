import { DIFFICULTY, TUNE, type Difficulty } from '../data/tuning';
import { clamp, Rng } from '../core/math';
import { Fighter, type Controller } from './fighter';
import type { HitDef, MoveDef, OfficerDef, SimEvent } from './types';

const S = TUNE.soldier;
const G = TUNE.fighter.gravity;

export const enum SS {
  Free,
  Windup,
  Strike,
  Recover,
  Stagger,
  Air,
  Down,
  Corpse,
}

export interface Soldier {
  active: boolean;
  uid: number;
  dead: boolean;
  team: number;
  kind: number;
  x: number;
  z: number;
  y: number;
  px: number;
  pz: number;
  py: number;
  vx: number;
  vz: number;
  vy: number;
  face: number;
  hp: number;
  st: SS;
  t: number;
  cd: number;
  rt: number;
  tf: Fighter | null;
  ts: Soldier | null;
  token: boolean;
  gx: number;
  gz: number;
  leader: Fighter | null;
  ox: number;
  oz: number;
  base: number;
  strafe: number;
  phase: number;
  spin: number;
  /** a squad captain is close enough to steady this soldier */
  buff: boolean;
}

/** Soldier kinds. Each asks something different of the player. */
export const enum SK {
  Spear = 0,
  Banner = 1,
  Archer = 2,
  Captain = 3,
  Shield = 4,
  Cavalry = 5,
  Gunner = 6,
}
const KIND_HP = [1, 1, 0.65, 3, 1.4, 1.5, 0.65];
const GUN_CLANS = ['oda', 'saika', 'tokugawa', 'otomo', 'toyotomi', 'akechi'];
const HORSE_CLANS = ['takeda', 'date', 'uesugi'];

export interface Item {
  x: number;
  z: number;
  kind: 'heal' | 'spirit';
  t: number;
}
export interface Mission {
  text: string;
  kind: 'kos' | 'officer' | 'base';
  goal: number;
  officer?: Fighter;
  base?: Base;
  until: number;
}

export interface Shot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  team: number;
  dmg: number;
  life: number;
  gun: boolean;
  /** visual only: the damage was already applied */
  fx: boolean;
}

export interface Base {
  id: number;
  name: string;
  x: number;
  z: number;
  team: number;
  main: boolean;
  garrison: number;
  maxGarrison: number;
  spawnT: number;
  defT: number;
  threat: number;
  r: number;
}

export type Trigger = { time: number } | { baseTaken: number; by: number } | { officerDown: string } | { morale: [team: number, below: number] } | { hp: [officer: string, below: number] };

/** A scripted turn in the battle: an ambush, reinforcements, a betrayal. */
export interface BattleEvent {
  when: Trigger;
  /** only fires if this also holds */
  unless?: Trigger;
  title?: string;
  msg?: string;
  /** which side the news is good for */
  team?: number;
  reinforce?: { team: number; x: number; z: number; officers?: { def: OfficerDef; squad?: number }[]; troops?: number };
  defect?: string;
  morale?: [team: number, delta: number];
  fired?: boolean;
}

export type Sky = 'day' | 'dusk' | 'night' | 'rain' | 'snow';

export interface BattleDef {
  clans: [string, string];
  year?: number;
  blurb?: string;
  sky?: Sky;
  events?: BattleEvent[];
  id: string;
  name: string;
  half: number;
  bases: { name: string; x: number; z: number; team: number; main?: boolean; /** garrison multiplier, e.g. from fortifications */ g?: number }[];
  /** overrides for sides that are not one of the stock clans */
  colors?: [number, number];
  mons?: [string, string];
  officers: { def: OfficerDef; team: number; x: number; z: number; commander?: boolean; squad?: number; player?: boolean }[];
  reserves: [number, number];
  cap: number;
  obstacles?: { x: number; z: number; r: number }[];
  sides: [string, string];
}

const MAX_SOLDIERS = 1000;
const CELL = 3;
const SHOT_HIT: HitDef = { t0: 0, t1: 0, range: 1, arc: 360, dmg: 1, react: 'stagger', kb: 1.5, stop: 0.03 };
const CAV_HIT: HitDef = { t0: 0, t1: 0, range: 2.4, arc: 120, dmg: 11, react: 'stagger', kb: 6, stop: 0.05 };
const SOLDIER_HIT: HitDef = { t0: 0, t1: 0, range: S.reach, arc: 90, dmg: S.dmgToFighter, react: 'stagger', kb: 2.2, stop: 0.03 };

export class World {
  time = 0;
  tick = 0;
  rng: Rng;
  events: SimEvent[] = [];
  fighters: Fighter[] = [];
  soldiers: Soldier[] = [];
  shots: Shot[] = [];
  items: Item[] = [];
  mission: Mission | null = null;
  private missionT = 35;
  bases: Base[] = [];
  obstacles: { x: number; z: number; r: number }[];
  half: number;
  def: BattleDef;
  diff: Difficulty;
  player: Fighter | null = null;
  playerTeam = 0;
  commanders: (Fighter | null)[] = [null, null];
  morale = [TUNE.morale.start, TUNE.morale.start];
  reserves: [number, number];
  alive = [0, 0];
  losses = [0, 0];
  ko = 0;
  /** what the player personally achieved, for the results screen */
  stats = { officers: 0, bases: 0, dmgTaken: 0, missions: 0 };
  hitstop = 0;
  slowmo = 0;
  ended: { winner: number; reason: string } | null = null;

  private uid = 1;
  private gridN: number;
  private head: Int32Array;
  private next = new Int32Array(MAX_SOLDIERS);
  private freeList: number[] = [];

  npc: Controller | null;
  private eventT = 0;

  constructor(def: BattleDef, difficulty = 'normal', seed = 1234, npc: Controller | null = null) {
    this.def = def;
    this.npc = npc;
    for (const e of def.events ?? []) e.fired = false;
    this.half = def.half;
    this.rng = new Rng(seed);
    this.diff = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
    this.reserves = [...def.reserves];
    this.obstacles = def.obstacles ?? [];
    this.gridN = Math.ceil((def.half * 2) / CELL) + 1;
    // start empty: the view can query the grid on a frame too short to have run the first step
    this.head = new Int32Array(this.gridN * this.gridN).fill(-1);

    def.bases.forEach((b, i) =>
      this.bases.push({
        id: i,
        name: b.name,
        x: b.x,
        z: b.z,
        team: b.team,
        main: !!b.main,
        garrison: TUNE.base.garrison * (b.main ? 3 : 1) * (b.g ?? 1),
        maxGarrison: TUNE.base.garrison * (b.main ? 3 : 1) * (b.g ?? 1),
        spawnT: this.rng.range(1, TUNE.base.spawnEvery),
        defT: 0,
        threat: 0,
        r: TUNE.base.radius * (b.main ? 1.25 : 1),
      }),
    );

    const pl = def.officers.find((o) => o.player);
    if (pl) this.playerTeam = pl.team;
    for (const o of def.officers) {
      const f = this.addOfficer(o.def, o.team, o.x, o.z, o.squad ?? 0, !!o.player);
      if (o.commander) {
        f.isCommander = true;
        this.commanders[o.team] = f;
        if (!f.isPlayer) f.maxHp = f.hp = f.hp * TUNE.commanderHp;
      }
    }
    // initial garrisons
    for (const b of this.bases) if (b.team >= 0) for (let i = 0; i < TUNE.base.defenders; i++) this.spawnDefender(b);
  }

  addOfficer(def: OfficerDef, team: number, x: number, z: number, squad: number, player = false): Fighter {
    const f = new Fighter(def, team, x, z, team === 0 ? 0 : Math.PI);
    if (team !== this.playerTeam) {
      f.maxHp = f.hp = f.hp * this.diff.enemyHp;
      f.dmgMul = this.diff.enemyDmg;
      f.parryChance = this.diff.guardSkill * 0.5;
    }
    if (player) {
      f.isPlayer = true;
      this.player = f;
    } else f.controller = this.npc;
    this.fighters.push(f);
    for (let i = 0; i < squad; i++) {
      const a = this.rng.range(0, Math.PI * 2),
        r = this.rng.range(2, 7);
      const s = this.spawn(team, x + Math.sin(a) * r, z + Math.cos(a) * r, this.squadKind(team, i), false);
      if (s) {
        s.leader = f;
        s.ox = Math.sin(a) * r;
        s.oz = Math.cos(a) * r;
      }
    }
    return f;
  }

  // ------------------------------------------------------------ scripted events
  private holds(t: Trigger): boolean {
    if ('time' in t) return this.time >= t.time;
    if ('baseTaken' in t) return this.bases[t.baseTaken]?.team === t.by;
    if ('officerDown' in t) return this.fighters.some((f) => f.def.id === t.officerDown && f.dead);
    if ('morale' in t) return this.morale[t.morale[0]] < t.morale[1];
    const f = this.fighters.find((x) => x.def.id === t.hp[0]);
    return !!f && !f.dead && f.hp / f.maxHp < t.hp[1];
  }

  private checkEvents() {
    for (const e of this.def.events ?? []) {
      if (e.fired || !this.holds(e.when)) continue;
      e.fired = true;
      if (e.unless && this.holds(e.unless)) continue;
      const good = e.team === undefined ? 'info' : e.team === this.playerTeam ? 'good' : 'bad';
      if (e.msg) this.log(e.msg, e.team ?? 0, good);
      if (e.title) this.events.push({ type: 'banner', title: e.title, sub: e.msg ?? '', good: good !== 'bad' });
      if (e.morale) this.addMorale(e.morale[0], e.morale[1]);
      if (e.reinforce) {
        const r = e.reinforce;
        for (const o of r.officers ?? []) {
          const f = this.addOfficer(o.def, r.team, r.x + this.rng.range(-4, 4), r.z + this.rng.range(-4, 4), o.squad ?? 12);
          this.events.push({ type: 'join', id: f.id });
          if (f.def.lines?.enter) this.say(f, f.def.lines.enter);
        }
        const tb = this.nearestBase(r.x, r.z, (b) => b.team !== r.team);
        for (let i = 0; i < (r.troops ?? 0); i++) {
          const s = this.spawn(r.team, r.x + this.rng.range(-8, 8), r.z + this.rng.range(-8, 8), i % 5 === 0 ? 1 : 0, false);
          if (s && tb) {
            s.gx = tb.x;
            s.gz = tb.z;
          }
        }
      }
      if (e.defect) {
        const f = this.fighters.find((x) => x.def.id === e.defect && !x.dead);
        if (f) this.defect(f);
      }
    }
  }

  /** An officer and everyone under their banner changes sides. */
  defect(f: Fighter) {
    const from = f.team,
      to = 1 - from;
    f.team = to;
    f.lock = null;
    f.ai = null;
    const enemyNow = to !== this.playerTeam;
    f.dmgMul = enemyNow ? this.diff.enemyDmg : 1;
    for (const s of this.soldiers) {
      if (!s.active || s.dead) continue;
      if (s.leader === f) {
        this.releaseToken(s);
        s.team = to;
        s.tf = null;
        s.ts = null;
        this.alive[from]--;
        this.alive[to]++;
      } else if (s.tf === f) {
        this.releaseToken(s);
        s.tf = null;
      }
    }
    for (const o of this.fighters) if (o.lock === f) o.lock = null;
    const home = this.nearestBase(f.x, f.z, (b) => b.team === from && !b.main);
    if (home && Math.hypot(home.x - f.x, home.z - f.z) < 40) this.captureBase(home, to, f);
    this.addMorale(to, 12);
    this.events.push({ type: 'defect', id: f.id });
  }

  // ------------------------------------------------------------ soldiers
  spawn(team: number, x: number, z: number, kind = 0, useReserve = true): Soldier | null {
    if (useReserve) {
      if (this.reserves[team] <= 0) return null;
      this.reserves[team]--;
    }
    let s: Soldier;
    if (this.freeList.length) s = this.soldiers[this.freeList.pop()!];
    else {
      if (this.soldiers.length >= MAX_SOLDIERS) return null;
      s = {} as Soldier;
      this.soldiers.push(s);
    }
    const lim = this.half - 2;
    x = clamp(x, -lim, lim);
    z = clamp(z, -lim, lim);
    Object.assign(s, {
      active: true,
      uid: this.uid++,
      dead: false,
      team,
      kind,
      x,
      z,
      y: 0,
      px: x,
      pz: z,
      py: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      face: team === 0 ? 0 : Math.PI,
      hp: S.hp * (KIND_HP[kind] ?? 1),
      st: SS.Free,
      t: 0,
      cd: this.rng.range(0.3, 2),
      rt: this.rng.range(0, 0.5),
      tf: null,
      ts: null,
      token: false,
      gx: x,
      gz: z,
      leader: null,
      ox: 0,
      oz: 0,
      base: -1,
      strafe: this.rng.chance(0.5) ? 1 : -1,
      phase: this.rng.range(0, 6.28),
      spin: 0,
      buff: false,
    } satisfies Soldier);
    this.alive[team]++;
    return s;
  }

  /** Archers, or matchlocks for the clans that took to them. */
  private ranged(team: number): number {
    return GUN_CLANS.includes(this.def.clans[team]) && this.rng.chance(0.6) ? SK.Gunner : SK.Archer;
  }
  private squadKind(team: number, i: number): number {
    return i === 0 ? SK.Captain : i === 1 ? SK.Banner : i <= 3 ? SK.Shield : i <= 5 ? this.ranged(team) : SK.Spear;
  }

  private spawnDefender(b: Base) {
    const a = this.rng.range(0, Math.PI * 2),
      r = this.rng.range(1, b.r * 0.6);
    const roll = this.rng.next();
    const kind = roll < 0.16 ? this.ranged(b.team) : roll < 0.28 ? SK.Shield : roll < 0.36 ? SK.Banner : roll < 0.42 ? SK.Captain : SK.Spear;
    const s = this.spawn(b.team, b.x + Math.sin(a) * r, b.z + Math.cos(a) * r, kind, false);
    if (s) {
      s.base = b.id;
      s.ox = Math.sin(a) * r;
      s.oz = Math.cos(a) * r;
    }
  }

  private rebuildGrid() {
    this.head.fill(-1);
    const n = this.gridN,
      h = this.half;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      if (!s.active || s.st === SS.Corpse) continue;
      const cx = clamp(((s.x + h) / CELL) | 0, 0, n - 1),
        cz = clamp(((s.z + h) / CELL) | 0, 0, n - 1);
      const c = cz * n + cx;
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  /** Visit every live soldier whose cell overlaps the circle. */
  forNear(x: number, z: number, r: number, cb: (s: Soldier) => void) {
    const n = this.gridN,
      h = this.half;
    const x0 = clamp(((x - r + h) / CELL) | 0, 0, n - 1),
      x1 = clamp(((x + r + h) / CELL) | 0, 0, n - 1);
    const z0 = clamp(((z - r + h) / CELL) | 0, 0, n - 1),
      z1 = clamp(((z + r + h) / CELL) | 0, 0, n - 1);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        let i = this.head[cz * n + cx];
        while (i >= 0) {
          cb(this.soldiers[i]);
          i = this.next[i];
        }
      }
  }

  // ------------------------------------------------------------ messaging
  log(text: string, team: number, kind: 'info' | 'good' | 'bad' = 'info') {
    this.events.push({ type: 'log', text, team, kind });
  }
  say(f: Fighter, text: string) {
    this.events.push({ type: 'log', text, team: f.team, kind: 'speech', who: f.def.name });
  }
  addMorale(team: number, amt: number) {
    this.morale[team] = clamp(this.morale[team] + amt, 0, 100);
    this.morale[1 - team] = clamp(this.morale[1 - team] - amt * 0.6, 0, 100);
  }
  moraleMul(team: number) {
    return 0.8 + this.morale[team] / 250;
  }

  // ------------------------------------------------------------ combat
  resolveHit(a: Fighter, mv: MoveDef, idx: number) {
    const hit = mv.hits[idx];
    const set = a.hitSets[idx];
    const range = hit.range * a.scale;
    const cosHalf = hit.arc >= 360 ? -2 : Math.cos((hit.arc * Math.PI) / 360);
    const fx = Math.sin(a.face),
      fz = Math.cos(a.face);
    const dmgMul = a.def.atk * a.dmgMul * (a.raging ? TUNE.rage.dmgMul : 1);
    const involved = a.isPlayer;
    let connected = 0;
    let stop = 0;

    this.forNear(a.x, a.z, range + 1, (s) => {
      if (s.team === a.team || s.dead || set.has(s.uid)) return;
      const dx = s.x - a.x,
        dz = s.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > range + S.radius) return;
      if (d > 0.7 && (dx * fx + dz * fz) / d < cosHalf) return;
      if (Math.abs(s.y - a.y) > 3.4) return;
      set.add(s.uid);
      const nx = d > 0.05 ? dx / d : fx,
        nz = d > 0.05 ? dz / d : fz;
      this.hitSoldier(s, a, hit, nx, nz, dmgMul);
      connected++;
    });

    for (const o of this.fighters) {
      if (o.team === a.team || o === a || set.has(-o.id)) continue;
      const dx = o.x - a.x,
        dz = o.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > range + TUNE.fighter.radius * o.scale) continue;
      if (d > 0.7 && (dx * fx + dz * fz) / d < cosHalf) continue;
      if (Math.abs(o.y - a.y) > 3.4) continue;
      const nx = d > 0.05 ? dx / d : fx,
        nz = d > 0.05 ? dz / d : fz;
      // Duels between AI officers are deliberately slow so the player's intervention decides them.
      const res = o.takeHit(this, a, hit, nx, nz, a.isPlayer || o.isPlayer ? dmgMul : dmgMul * TUNE.npcDuelScale);
      if (res === 'miss') continue;
      set.add(-o.id);
      if (res === 'parry') return;
      if (res === 'block') {
        a.moveBlocked = true;
        if (involved || o.isPlayer) stop = Math.max(stop, 0.05);
        continue;
      }
      connected++;
      a.rage = Math.min(TUNE.rage.max, a.rage + TUNE.rage.perOfficerHit);
      this.events.push({
        type: 'hit',
        x: o.x - nx * 0.3,
        y: o.y + 1.15 * o.scale,
        z: o.z - nz * 0.3,
        dx: nx,
        dz: nz,
        weight: hit.stop * 12 + (res === 'kill' ? 1 : 0.3),
        blood: true,
        officer: true,
        byPlayer: a.isPlayer,
      });
      if (involved || o.isPlayer) {
        stop = Math.max(stop, hit.stop * 1.5 + (res === 'kill' ? 0.22 : 0));
        if (hit.shake || res === 'kill') this.events.push({ type: 'shake', amt: (hit.shake ?? 0.2) + (res === 'kill' ? 0.6 : 0) });
      }
    }

    if (connected) {
      a.moveConnected = true;
      a.combatT = 4;
      a.spirit = Math.min(TUNE.spirit.max, a.spirit + (mv.kind === 'super' ? 0 : TUNE.spirit.perHit * Math.min(connected, 4)));
      if (involved) {
        stop = Math.max(stop, hit.stop * (1 + Math.min(connected, 6) * 0.06));
        if (hit.shake) this.events.push({ type: 'shake', amt: hit.shake });
      }
    }
    if (stop > 0) this.hitstop = Math.max(this.hitstop, stop * TUNE.hitstopScale);
  }

  private hitSoldier(s: Soldier, a: Fighter, hit: HitDef, nx: number, nz: number, dmgMul: number) {
    // A shield bearer facing you turns ordinary cuts; break the guard, knock them over, or get behind.
    if (s.kind === SK.Shield && (s.st === SS.Free || s.st === SS.Windup) && !hit.gb && hit.react === 'stagger' && -(Math.sin(s.face) * nx + Math.cos(s.face) * nz) > 0.3) {
      s.hp -= hit.dmg * dmgMul * 0.25;
      s.vx += nx * 2;
      s.vz += nz * 2;
      this.events.push({ type: 'block', x: s.x - nx * 0.5, y: 1.1, z: s.z - nz * 0.5, byPlayer: false });
      if (s.hp > 0) return;
    }
    s.hp -= hit.dmg * dmgMul * (1.15 - this.morale[s.team] / 400) * (a.isPlayer ? 1 : TUNE.npcTroopScale) * (s.buff ? 0.7 : 1);
    this.releaseToken(s);
    const killed = s.hp <= 0;
    const r = this.rng;
    if (hit.pull && !killed) {
      nx *= -0.4;
      nz *= -0.4;
    }
    if (killed) {
      this.killSoldier(s, a);
      const kb = Math.max(hit.kb, 5) + r.range(0, 4);
      const spread = r.range(-0.35, 0.35);
      s.vx = (nx * Math.cos(spread) - nz * Math.sin(spread)) * kb;
      s.vz = (nz * Math.cos(spread) + nx * Math.sin(spread)) * kb;
      s.vy = Math.max(hit.lift ?? 0, r.range(3.5, 6.5));
      s.st = SS.Air;
      s.spin = r.range(-9, 9);
    } else {
      switch (hit.react) {
        case 'stagger':
          if (s.st === SS.Air) {
            s.vy = Math.max(s.vy, hit.lift ?? 3.5);
            s.vx = nx * hit.kb * 0.5;
            s.vz = nz * hit.kb * 0.5;
          } else {
            s.st = SS.Stagger;
            s.t = S.staggerTime;
            s.vx = nx * hit.kb * 1.6;
            s.vz = nz * hit.kb * 1.6;
          }
          break;
        case 'stun':
          s.st = SS.Stagger;
          s.t = 1.3;
          s.vx = nx * hit.kb;
          s.vz = nz * hit.kb;
          break;
        default:
          s.st = SS.Air;
          s.vy = hit.lift ?? 4.5;
          s.vx = nx * hit.kb;
          s.vz = nz * hit.kb;
          s.spin = r.range(-6, 6);
      }
    }
    this.events.push({
      type: 'hit',
      x: s.x,
      y: s.y + 1.1,
      z: s.z,
      dx: nx,
      dz: nz,
      weight: hit.stop * 10 + (killed ? 0.4 : 0),
      blood: true,
      officer: false,
      byPlayer: a.isPlayer,
    });
  }

  private killSoldier(s: Soldier, by: Fighter | null) {
    if (s.dead) return;
    s.dead = true;
    s.hp = 0;
    this.alive[s.team]--;
    this.losses[s.team]++;
    this.releaseToken(s);
    if (s.base >= 0) {
      const b = this.bases[s.base];
      if (b.team === s.team) {
        b.garrison -= by ? (by.isPlayer ? 1 : TUNE.base.npcKillCredit) : TUNE.base.troopKillCredit;
        b.threat = 6;
        if (b.garrison <= 0) {
          // a camp cannot fall while one of its officers is still standing in it
          const held = this.fighters.some((f) => f.team === b.team && !f.dead && (f.x - b.x) ** 2 + (f.z - b.z) ** 2 < b.r * b.r);
          if (held) b.garrison = 1;
          else this.captureBase(b, 1 - s.team, by);
        }
      }
    }
    if (by) {
      by.kos++;
      by.spirit = Math.min(TUNE.spirit.max, by.spirit + TUNE.spirit.perKO * (s.kind === SK.Captain ? 6 : 1));
      by.rage = Math.min(TUNE.rage.max, by.rage + TUNE.rage.perKO);
      if (by.isPlayer) {
        if (s.kind === SK.Captain && this.rng.chance(0.4)) this.items.push({ x: s.x, z: s.z, kind: this.rng.chance(0.7) ? 'heal' : 'spirit', t: 40 });
        this.ko++;
        this.events.push({ type: 'ko', count: this.ko, x: s.x, z: s.z });
        if (this.ko % 100 === 0) this.addMorale(by.team, TUNE.morale.ko100);
      }
    }
  }

  private releaseToken(s: Soldier) {
    if (s.token) {
      s.token = false;
      if (s.tf) s.tf.attackers = Math.max(0, s.tf.attackers - 1);
    }
  }

  captureBase(b: Base, team: number, by: Fighter | null) {
    const old = b.team;
    b.team = team;
    b.garrison = b.maxGarrison * 0.7;
    b.threat = 0;
    for (const s of this.soldiers) if (s.active && s.base === b.id) s.base = -1;
    this.addMorale(team, TUNE.morale.baseCapture * (b.main ? 2 : 1));
    if (by?.isPlayer) this.stats.bases++;
    const who = by ? by.def.name : `${this.def.sides[team]} forces`;
    this.log(`${who} captured ${b.name}!`, team, team === this.playerTeam ? 'good' : 'bad');
    this.events.push({ type: 'baseCapture', base: b.id, team });
    if (old >= 0) for (let i = 0; i < 5; i++) this.spawnDefender(b);
    if (b.main && old >= 0) this.end(team, `${b.name} has fallen`);
  }

  onOfficerDown(f: Fighter, by: Fighter | null) {
    this.addMorale(1 - f.team, TUNE.morale.officerDown * (f.isCommander ? 2 : 1));
    if (f.def.lines?.lose) this.say(f, f.def.lines.lose);
    const good = f.team !== this.playerTeam;
    this.log(by ? `${by.def.name} has defeated ${f.def.name}!` : `${f.def.name} has fallen!`, 1 - f.team, good ? 'good' : 'bad');
    this.events.push({ type: 'officerDown', id: f.id, by: by?.id ?? 0, x: f.x, z: f.z });
    if (by) by.spirit = Math.min(TUNE.spirit.max, by.spirit + 25);
    if (by?.isPlayer) {
      this.stats.officers++;
      this.items.push({ x: f.x, z: f.z, kind: 'heal', t: 60 });
    }
    const near = this.player && Math.hypot(this.player.x - f.x, this.player.z - f.z) < 30;
    if (f.isPlayer || by?.isPlayer || near) this.slowmo = TUNE.officerKillSlowmo;
    for (const s of this.soldiers) if (s.active && s.leader === f) s.leader = null;
    for (const o of this.fighters) if (o.lock === f) o.lock = null;
    if (!this.ended) {
      if (f.isCommander) this.end(1 - f.team, `${f.def.name} has been defeated`);
      else if (f.isPlayer) this.end(1 - f.team, `${f.def.name} has fallen`);
    }
  }

  end(winner: number, reason: string) {
    if (this.ended) return;
    this.ended = { winner, reason };
    this.events.push({ type: 'end', winner, reason });
  }

  nearestBase(x: number, z: number, pred: (b: Base) => boolean): Base | null {
    let best: Base | null = null,
      bd = Infinity;
    for (const b of this.bases) {
      if (!pred(b)) continue;
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ step
  step(dt: number) {
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.time += dt;
    this.tick++;
    if (this.slowmo > 0) this.slowmo -= dt;
    this.rebuildGrid();

    for (const f of this.fighters) {
      if (f.controller && f.state !== 'dead') f.controller(f, this, dt);
      f.update(this, dt);
    }
    this.separateFighters();
    this.updateSoldiers(dt);
    this.updateShots(dt);
    this.updateItems(dt);
    this.updateBases(dt);
    if ((this.eventT -= dt) <= 0) {
      this.eventT = 0.5;
      this.checkEvents();
      this.updateMission();
      // an army with nobody left to send has lost
      if (!this.ended && this.bases.length)
        for (let t = 0; t < 2; t++) if (this.reserves[t] <= 0 && this.alive[t] < 12 && this.time > 30) this.end(1 - t, `${this.def.sides[t]} forces have been routed`);
    }
  }

  private updateItems(dt: number) {
    const p = this.player;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      let gone = (it.t -= dt) <= 0;
      if (!gone && p && !p.dead && (p.x - it.x) ** 2 + (p.z - it.z) ** 2 < 2.6) {
        if (it.kind === 'heal') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
        else p.spirit = Math.min(TUNE.spirit.max, p.spirit + 60);
        this.events.push({ type: 'pickup', x: it.x, z: it.z, kind: it.kind });
        gone = true;
      }
      if (gone) this.items.splice(i, 1);
    }
  }

  /** Optional objectives that pop up mid-battle and pay out in health, spirit and morale. */
  private updateMission() {
    const p = this.player;
    if (!p || p.dead || this.ended || !this.bases.length) return;
    const m = this.mission;
    if (!m) {
      if (this.time < this.missionT) return;
      const roll = this.rng.next();
      const foe = this.fighters.filter((f) => f.team !== p.team && !f.dead && !f.isCommander).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      const base = this.nearestBase(p.x, p.z, (b) => b.team !== p.team && !b.main);
      if (roll < 0.4 && foe) this.mission = { kind: 'officer', officer: foe, goal: 0, until: this.time + 100, text: `Defeat ${foe.def.name}` };
      else if (roll < 0.7 && base) this.mission = { kind: 'base', base, goal: 0, until: this.time + 130, text: `Capture ${base.name}` };
      else this.mission = { kind: 'kos', goal: this.ko + 70, until: this.time + 70, text: 'Cut down 70 enemies' };
      this.events.push({ type: 'mission', state: 'start', text: this.mission.text });
      return;
    }
    const done = m.kind === 'kos' ? this.ko >= m.goal : m.kind === 'officer' ? m.officer!.dead && m.officer!.lastHitBy === p : m.base!.team === p.team;
    const lost = !done && (this.time > m.until || (m.kind === 'officer' && m.officer!.dead));
    if (!done && !lost) return;
    this.mission = null;
    this.missionT = this.time + 40;
    if (done) {
      this.stats.missions++;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
      p.spirit = TUNE.spirit.max;
      this.addMorale(p.team, 6);
      this.events.push({ type: 'mission', state: 'done', text: m.text });
    } else this.events.push({ type: 'mission', state: 'fail', text: m.text });
  }

  private updateShots(dt: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      sh.x += sh.vx * dt;
      sh.z += sh.vz * dt;
      let gone = (sh.life -= dt) <= 0;
      if (!gone && !sh.fx)
        for (const f of this.fighters) {
          if (f.team === sh.team || f.dead || f.y > 2.2) continue;
          const dx = f.x - sh.x,
            dz = f.z - sh.z;
          if (dx * dx + dz * dz > 0.8) continue;
          const sp = Math.hypot(sh.vx, sh.vz);
          const res = f.takeHit(this, null, SHOT_HIT, sh.vx / sp, sh.vz / sp, sh.dmg);
          if (res === 'hit' || res === 'kill') this.events.push({ type: 'hit', x: f.x, y: f.y + 1.2, z: f.z, dx: sh.vx / sp, dz: sh.vz / sp, weight: sh.gun ? 0.5 : 0.25, blood: true, officer: true, byPlayer: false });
          if (res !== 'miss') gone = true;
          break;
        }
      if (gone) {
        this.shots[i] = this.shots[this.shots.length - 1];
        this.shots.pop();
      }
    }
  }

  private separateFighters() {
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) {
      const a = fs[i];
      if (a.dead || a.y > 1.2) continue;
      for (let j = i + 1; j < fs.length; j++) {
        const b = fs[j];
        if (b.dead || b.y > 1.2) continue;
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const min = TUNE.fighter.radius * (a.scale + b.scale);
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2),
          push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
      for (const o of this.obstacles) {
        const dx = a.x - o.x,
          dz = a.z - o.z,
          min = o.r + 0.5;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          a.x = o.x + (dx / d) * min;
          a.z = o.z + (dz / d) * min;
        }
      }
    }
  }

  private waveT = [2, 3.5];

  /** Each army feeds its front from reserves at a steady rate, however many camps it holds. */
  private reinforce(dt: number) {
    const B = TUNE.base;
    for (let t = 0; t < 2; t++) {
      if ((this.waveT[t] -= dt) > 0) continue;
      this.waveT[t] = B.spawnEvery * this.rng.range(0.8, 1.2) * (1.25 - this.morale[t] / 200);
      const room = this.def.cap - this.alive[t];
      if (room <= 0 || this.reserves[t] <= 0) continue;
      const own = this.bases.filter((b) => b.team === t);
      if (!own.length) continue;
      // the camp closest to the enemy is the front; most troops muster there
      let front = own[0],
        fd = Infinity,
        target: Base | null = null;
      for (const b of own) {
        const e = this.nearestBase(b.x, b.z, (o) => o.team !== t);
        if (!e) continue;
        const d = Math.hypot(e.x - b.x, e.z - b.z);
        if (d < fd) {
          fd = d;
          front = b;
          target = e;
        }
      }
      const from = this.rng.chance(0.7) ? front : this.rng.pick(own);
      const to = from === front ? target : this.nearestBase(from.x, from.z, (o) => o.team !== t);
      if (!to) continue;
      // the side that is being overrun sends bigger waves
      const n = Math.min(room, Math.round(B.squadSize * (this.alive[t] < this.alive[1 - t] * 0.7 ? 1.6 : 1)));
      // now and then the wave is a troop of horse instead of foot
      const horse = this.rng.chance(HORSE_CLANS.includes(this.def.clans[t]) ? 0.4 : 0.14);
      for (let i = 0; i < (horse ? Math.min(n, 5) : n); i++) {
        const kind = horse ? SK.Cavalry : i === 0 ? SK.Banner : i === 1 ? SK.Shield : i === 2 ? this.ranged(t) : i === 3 && this.rng.chance(0.4) ? SK.Captain : SK.Spear;
        const s = this.spawn(t, from.x + this.rng.range(-4, 4), from.z + this.rng.range(-4, 4), kind);
        if (s) {
          s.gx = to.x + this.rng.range(-5, 5);
          s.gz = to.z + this.rng.range(-5, 5);
        }
      }
    }
  }

  private updateBases(dt: number) {
    const B = TUNE.base;
    this.reinforce(dt);
    for (const b of this.bases) {
      b.threat = Math.max(0, b.threat - dt);
      if ((b.defT -= dt) <= 0) {
        b.defT = 0.6;
        // who is standing in the camp?
        const here = [0, 0];
        let defenders = 0;
        this.forNear(b.x, b.z, b.r, (s) => {
          if (s.dead || (s.x - b.x) ** 2 + (s.z - b.z) ** 2 > b.r * b.r) return;
          here[s.team]++;
        });
        for (const s of this.soldiers) if (s.active && !s.dead && s.base === b.id) defenders++;
        for (const f of this.fighters) if (!f.dead && (f.x - b.x) ** 2 + (f.z - b.z) ** 2 < b.r * b.r) here[f.team] += 4;
        if (b.team < 0) {
          // an empty camp belongs to whoever occupies it unopposed
          const t = here[0] >= 3 && here[1] === 0 ? 0 : here[1] >= 3 && here[0] === 0 ? 1 : -1;
          if (t >= 0 && (b.garrison -= 6) <= 0) this.captureBase(b, t, this.fighters.find((f) => f.team === t && !f.dead && Math.hypot(f.x - b.x, f.z - b.z) < b.r) ?? null);
          continue;
        }
        if (defenders < Math.min(B.defenders, b.garrison)) {
          // a garrison on its last legs has to draw on the army's reserves
          if (b.garrison > 1.5) this.spawnDefender(b);
          else if (this.reserves[b.team] > 0) {
            this.reserves[b.team]--;
            this.spawnDefender(b);
          }
        }
        // nobody left to hold it and the enemy inside: the banners come down
        const foe = 1 - b.team;
        if (here[b.team] === 0 && here[foe] >= 3) {
          b.threat = 6;
          if ((b.garrison -= 5) <= 0) this.captureBase(b, foe, this.fighters.find((f) => f.team === foe && !f.dead && Math.hypot(f.x - b.x, f.z - b.z) < b.r) ?? null);
        }
      }
      if (b.team < 0) continue;
      // resting inside a friendly base restores health
      for (const f of this.fighters)
        if (f.team === b.team && !f.dead && f.combatT <= 0 && f.hp < f.maxHp && (f.x - b.x) ** 2 + (f.z - b.z) ** 2 < b.r * b.r)
          f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.01 * B.healPerSec * dt);
    }
  }

  private retarget(s: Soldier) {
    this.releaseToken(s);
    s.tf = null;
    s.ts = null;
    const leash = s.base >= 0 ? this.bases[s.base] : null;
    const far = s.kind === SK.Archer || s.kind === SK.Gunner || s.kind === SK.Cavalry ? 1.7 : 1;
    s.buff = false;
    let bd = (S.engageFighter * far) ** 2;
    for (const f of this.fighters) {
      if (f.team === s.team || f.dead) continue;
      const d = (f.x - s.x) ** 2 + (f.z - s.z) ** 2;
      if (d < bd && (!leash || (f.x - leash.x) ** 2 + (f.z - leash.z) ** 2 < (leash.r * 1.4) ** 2)) {
        bd = d;
        s.tf = f;
      }
    }
    if (!s.tf) {
      let bs = (S.engageSoldier * far) ** 2;
      this.forNear(s.x, s.z, S.engageSoldier * far, (o) => {
        if (o.team === s.team) {
          if (o.kind === SK.Captain && !o.dead && (o.x - s.x) ** 2 + (o.z - s.z) ** 2 < 81) s.buff = true;
          return;
        }
        if (o.dead) return;
        const d = (o.x - s.x) ** 2 + (o.z - s.z) ** 2;
        if (d < bs) {
          bs = d;
          s.ts = o;
        }
      });
    }
    // where to drift when there is nobody to fight
    if (s.leader) {
      s.gx = s.leader.x + s.ox;
      s.gz = s.leader.z + s.oz;
    } else if (leash) {
      s.gx = leash.x + s.ox;
      s.gz = leash.z + s.oz;
    } else if (this.rng.chance(0.15) || (s.gx - s.x) ** 2 + (s.gz - s.z) ** 2 < 36) {
      const tb = this.nearestBase(s.x, s.z, (b) => b.team !== s.team);
      if (tb) {
        s.gx = tb.x + this.rng.range(-5, 5);
        s.gz = tb.z + this.rng.range(-5, 5);
      } else {
        const c = this.commanders[1 - s.team];
        if (c) {
          s.gx = c.x;
          s.gz = c.z;
        }
      }
    }
  }

  private updateSoldiers(dt: number) {
    const p = this.player;
    const maxAtk = this.diff.attackers;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      if (!s.active) continue;
      s.px = s.x;
      s.pz = s.z;
      s.py = s.y;

      if (s.st === SS.Corpse) {
        if ((s.t -= dt) <= 0) {
          s.active = false;
          this.freeList.push(i);
        }
        continue;
      }
      if (s.st === SS.Air) {
        s.vy -= G * dt;
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        s.y += s.vy * dt;
        if (s.y <= 0) {
          s.y = 0;
          s.vx = s.vz = s.vy = 0;
          if (s.dead) {
            s.st = SS.Corpse;
            s.t = S.corpseTime;
          } else {
            s.st = SS.Down;
            s.t = S.downTime;
          }
        }
        this.bound(s);
        continue;
      }
      if (s.st === SS.Down) {
        if ((s.t -= dt) <= 0) s.st = SS.Free;
        continue;
      }
      if (s.st === SS.Stagger) {
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        s.vx *= Math.max(0, 1 - 8 * dt);
        s.vz *= Math.max(0, 1 - 8 * dt);
        if ((s.t -= dt) <= 0) s.st = SS.Free;
        this.bound(s);
        continue;
      }

      // Distant skirmishes tick at a third of the rate.
      let edt = dt;
      if (p && (s.x - p.x) ** 2 + (s.z - p.z) ** 2 > 70 * 70) {
        if ((this.tick + i) % 3) continue;
        edt = dt * 3;
      }

      s.cd -= edt;
      if ((s.rt -= edt) <= 0) {
        s.rt = this.rng.range(0.35, 0.7);
        if (s.st === SS.Free) this.retarget(s);
      }
      if (s.tf && s.tf.dead) {
        this.releaseToken(s);
        s.tf = null;
      }
      if (s.ts && (s.ts.dead || !s.ts.active)) s.ts = null;

      const ranged = s.kind === SK.Archer || s.kind === SK.Gunner;
      const cav = s.kind === SK.Cavalry;
      let tx = s.gx,
        tz = s.gz,
        want = 1.2,
        hasTarget = false,
        tr = 0;
      if (s.tf) {
        tx = s.tf.x;
        tz = s.tf.z;
        hasTarget = true;
        tr = TUNE.fighter.radius * s.tf.scale;
        want = s.token || s.tf.attackers < maxAtk ? S.reach * 0.75 : S.ringRadius + (s.uid % 5) * 0.35;
      } else if (s.ts) {
        tx = s.ts.x;
        tz = s.ts.z;
        hasTarget = true;
        tr = S.radius;
        want = 1.5;
      }
      if (ranged && hasTarget) want = 13 + (s.uid % 5);
      if (cav && hasTarget) want = 0.5;
      const dx = tx - s.x,
        dz = tz - s.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const nx = dx / d,
        nz = dz / d;

      if (s.st === SS.Windup) {
        if (hasTarget) s.face = Math.atan2(nx, nz);
        if ((s.t -= edt) <= 0) {
          s.st = SS.Strike;
          s.t = S.strike;
          this.events.push({ type: 'soldierSwing', x: s.x, z: s.z });
          const mm0 = this.moraleMul(s.team) * (s.team !== this.playerTeam ? this.diff.enemyDmg : 1) * (s.buff ? 1.4 : 1);
          if (ranged) {
            // loose at where the target is now: anyone who keeps moving is missed
            if (hasTarget) {
              const gun = s.kind === SK.Gunner;
              const sp = gun ? 85 : 30;
              const fx = !s.tf;
              this.shots.push({ x: s.x + nx * 0.8, y: 1.4, z: s.z + nz * 0.8, vx: nx * sp, vz: nz * sp, team: s.team, dmg: (gun ? 13 : 7) * mm0 * (s.tf && !s.tf.isPlayer ? TUNE.troopVsNpc : 1), life: Math.min(1.1, (d + 6) / sp), gun, fx });
              this.events.push({ type: 'volley', x: s.x, z: s.z, face: s.face, gun });
              if (s.ts && this.rng.chance(gun ? 0.6 : 0.45)) {
                const o = s.ts;
                o.hp -= S.dmgToSoldier * (gun ? 1.6 : 0.9) * mm0;
                if (o.hp <= 0) {
                  this.killSoldier(o, null);
                  o.st = SS.Air;
                  o.vy = 3;
                  o.vx = nx * 2;
                  o.vz = nz * 2;
                  o.spin = this.rng.range(-4, 4);
                }
              }
            }
          } else if (hasTarget && d < S.reach + tr + 0.3) {
            const mm = mm0;
            if (s.tf) {
              const res = s.tf.takeHit(this, null, SOLDIER_HIT, nx, nz, mm * (s.kind === SK.Captain ? 2 : 1) * (s.tf.isPlayer ? 1 : TUNE.troopVsNpc));
              if (res === 'hit' || res === 'kill') {
                this.events.push({ type: 'hit', x: s.tf.x, y: s.tf.y + 1.1, z: s.tf.z, dx: nx, dz: nz, weight: 0.25, blood: true, officer: true, byPlayer: false });
                if (s.tf.isPlayer) this.hitstop = Math.max(this.hitstop, 0.03);
              }
            } else if (s.ts) {
              s.ts.hp -= S.dmgToSoldier * mm;
              if (s.ts.hp <= 0) {
                const o = s.ts;
                this.killSoldier(o, null);
                o.st = SS.Air;
                o.vy = 3.2;
                o.vx = nx * 2.5;
                o.vz = nz * 2.5;
                o.spin = this.rng.range(-4, 4);
                this.events.push({ type: 'hit', x: o.x, y: 1.1, z: o.z, dx: nx, dz: nz, weight: 0.3, blood: true, officer: false, byPlayer: false });
              } else {
                s.ts.st = SS.Stagger;
                s.ts.t = 0.25;
                s.ts.vx = nx * 1.5;
                s.ts.vz = nz * 1.5;
              }
            }
          }
        }
        continue;
      }
      if (s.st === SS.Strike) {
        if ((s.t -= edt) <= 0) {
          s.st = SS.Recover;
          s.t = S.recover;
        }
        continue;
      }
      if (s.st === SS.Recover) {
        if (cav) {
          // carry the charge on through and wheel about
          s.x += Math.sin(s.face) * 8.5 * edt;
          s.z += Math.cos(s.face) * 8.5 * edt;
          s.vx = Math.sin(s.face) * 8.5;
          s.vz = Math.cos(s.face) * 8.5;
          s.phase += 8.5 * edt * 2.6;
          this.bound(s);
        }
        if ((s.t -= edt) <= 0) {
          s.st = SS.Free;
          s.cd = this.rng.range(S.cooldown[0], S.cooldown[1]) * (ranged ? (s.kind === SK.Gunner ? 2.4 : 1.5) : 1);
          this.releaseToken(s);
        }
        continue;
      }

      // --- free: move and maybe start an attack
      let mvx = 0,
        mvz = 0;
      const gap = d - tr;
      if (hasTarget) {
        if (gap > want + 0.3) {
          mvx = nx;
          mvz = nz;
        } else if (gap < want - 0.5) {
          mvx = -nx * 0.6;
          mvz = -nz * 0.6;
        }
        if (s.tf && !s.token && gap < S.ringRadius + 2.5) {
          // circle while waiting for a turn
          mvx += -nz * s.strafe * 0.45;
          mvz += nx * s.strafe * 0.45;
          if (this.rng.chance(0.004)) s.strafe = -s.strafe;
        }
        s.face = Math.atan2(nx, nz);
        if (ranged) {
          if (s.cd <= 0 && gap < 21 && gap > 3.5) {
            s.st = SS.Windup;
            s.t = s.kind === SK.Gunner ? 1.0 : 0.75;
            s.cd = 99;
          }
        } else if (cav) {
          if (s.cd <= 0 && gap < 2.3) {
            // the charge itself is the telegraph: strike in passing
            const mm = this.moraleMul(s.team) * (s.team !== this.playerTeam ? this.diff.enemyDmg : 1);
            if (s.tf) {
              const res = s.tf.takeHit(this, null, CAV_HIT, nx, nz, mm * (s.tf.isPlayer ? 1 : TUNE.troopVsNpc));
              if (res === 'hit' || res === 'kill') this.events.push({ type: 'hit', x: s.tf.x, y: s.tf.y + 1.1, z: s.tf.z, dx: nx, dz: nz, weight: 0.5, blood: true, officer: true, byPlayer: false });
            } else if (s.ts) {
              s.ts.hp -= S.dmgToSoldier * 2 * mm;
              if (s.ts.hp <= 0) {
                const o = s.ts;
                this.killSoldier(o, null);
                o.st = SS.Air;
                o.vy = 4;
                o.vx = nx * 5;
                o.vz = nz * 5;
                o.spin = this.rng.range(-5, 5);
              }
            }
            s.st = SS.Recover;
            s.t = 1.3;
            s.cd = 2.5;
            continue;
          }
        } else if (s.cd <= 0 && gap < S.reach * 0.95) {
          if (s.tf) {
            if (s.token || s.tf.attackers < maxAtk) {
              if (!s.token) {
                s.token = true;
                s.tf.attackers++;
              }
              s.st = SS.Windup;
              s.t = S.windup;
            }
          } else {
            s.st = SS.Windup;
            s.t = S.windup * 1.3;
          }
        }
      } else if (d > 1.5) {
        mvx = nx;
        mvz = nz;
        s.face = Math.atan2(nx, nz);
      }

      // separation from neighbours and fighters
      let sx = 0,
        sz = 0;
      this.forNear(s.x, s.z, 1.1, (o) => {
        if (o === s || o.st === SS.Air) return;
        const ax = s.x - o.x,
          az = s.z - o.z;
        const d2 = ax * ax + az * az;
        if (d2 < 0.9 && d2 > 1e-5) {
          const dd = Math.sqrt(d2);
          sx += (ax / dd) * (0.95 - dd);
          sz += (az / dd) * (0.95 - dd);
        }
      });
      for (const f of this.fighters) {
        if (f.dead || f.y > 1.5) continue;
        const ax = s.x - f.x,
          az = s.z - f.z;
        const min = S.radius + TUNE.fighter.radius * f.scale;
        const d2 = ax * ax + az * az;
        if (d2 < min * min && d2 > 1e-5) {
          const dd = Math.sqrt(d2);
          s.x += (ax / dd) * (min - dd);
          s.z += (az / dd) * (min - dd);
        }
      }
      for (const o of this.obstacles) {
        const ax = s.x - o.x,
          az = s.z - o.z,
          min = o.r + 0.4;
        const d2 = ax * ax + az * az;
        if (d2 < min * min && d2 > 1e-5) {
          const dd = Math.sqrt(d2);
          s.x = o.x + (ax / dd) * min;
          s.z = o.z + (az / dd) * min;
        }
      }

      const sp = (cav ? 8.2 : s.kind === SK.Shield ? S.speed * 0.8 : S.speed) * (s.leader && !hasTarget && d > 8 && !cav ? 1.9 : 1) * (0.9 + this.morale[s.team] / 500);
      const tvx = mvx * sp + sx * 5,
        tvz = mvz * sp + sz * 5;
      s.vx += (tvx - s.vx) * Math.min(1, 10 * edt);
      s.vz += (tvz - s.vz) * Math.min(1, 10 * edt);
      s.x += s.vx * edt;
      s.z += s.vz * edt;
      s.phase += Math.hypot(s.vx, s.vz) * edt * 2.6;
      this.bound(s);
    }
  }

  private bound(s: Soldier) {
    const lim = this.half - 1;
    if (s.x < -lim) s.x = -lim;
    else if (s.x > lim) s.x = lim;
    if (s.z < -lim) s.z = -lim;
    else if (s.z > lim) s.z = lim;
  }
}
