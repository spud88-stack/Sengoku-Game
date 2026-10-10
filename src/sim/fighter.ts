import { TUNE } from '../data/tuning';
import { MOUNTED, movesetFor, TRAMPLE } from '../data/moves';
import { angDiff, angToward, clamp, DEG } from '../core/math';
import type { FState, HitDef, Intent, MoveDef, Moveset, OfficerDef } from './types';
import { emptyIntent } from './types';
import type { World } from './world';

export type Controller = (f: Fighter, w: World, dt: number) => void;
export type HitResult = 'miss' | 'block' | 'parry' | 'hit' | 'kill';

const F = TUNE.fighter;

/** An officer on the field. The player and AI officers share every rule here; only the controller differs. */
export class Fighter {
  static nextId = 1;
  id = Fighter.nextId++;
  def: OfficerDef;
  team: number;
  isPlayer = false;
  isCommander = false;
  moveset: Moveset;
  scale: number;

  x = 0;
  z = 0;
  y = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  face = 0;
  px = 0;
  pz = 0;
  py = 0;

  hp: number;
  maxHp: number;
  spirit = 0;
  rage = 0;
  rageT = 0;
  guardMeter = F.guardMax;

  state: FState = 'free';
  t = 0;
  move: MoveDef | null = null;
  moveT = 0;
  moveSerial = 0;
  hitSets: Set<number>[] = [];
  moveConnected = false;
  moveBlocked = false;
  combo = 0;
  airCount = 0;
  dying = false;

  buf: '' | 'L' | 'H' | 'J' | 'D' | 'S' = '';
  bufT = 0;
  guardT = 0;
  invuln = 0;
  taken = 0;
  takenT = 0;
  runT = 0;
  attackers = 0;
  lock: Fighter | null = null;
  lastHitBy: Fighter | null = null;
  combatT = 0;
  hitFlash = 0;
  kos = 0;
  mounted = false;
  private trampleT = 0;
  private trampleSets = [new Set<number>()];
  dmgMul = 1;
  /** chance that an AI's well-timed guard counts as a parry; the player always earns theirs */
  parryChance = 0.15;
  private dodgeX = 0;
  private dodgeZ = 0;

  intent: Intent = emptyIntent();
  controller: Controller | null = null;
  /** scratch space for the AI controller */
  ai: any = null;

  constructor(def: OfficerDef, team: number, x: number, z: number, face = 0) {
    this.def = def;
    this.team = team;
    this.moveset = movesetFor(def.weapon);
    this.scale = def.scale ?? 1;
    this.maxHp = this.hp = def.hp;
    this.x = this.px = x;
    this.z = this.pz = z;
    this.face = face;
  }

  get dead() {
    return this.state === 'dead' || this.dying;
  }
  get reach() {
    return this.moveset.reach * this.scale;
  }
  get raging() {
    return this.rageT > 0;
  }
  /** true while an attack's hit windows are still ahead or active */
  get threatening() {
    if (this.state !== 'attack' || !this.move) return false;
    const hits = this.move.hits;
    return hits.length > 0 && this.moveT <= hits[hits.length - 1].t1;
  }
  /** true during the tail of an attack after its last hit */
  get recovering() {
    if (this.state !== 'attack' || !this.move) return false;
    const hits = this.move.hits;
    return hits.length > 0 && this.moveT > hits[hits.length - 1].t1 && !this.move.invuln;
  }

  startMove(w: World, mv: MoveDef) {
    this.state = 'attack';
    this.move = mv;
    this.moveT = 0;
    this.moveSerial++;
    this.moveConnected = false;
    this.moveBlocked = false;
    this.hitSets = mv.hits.map(() => new Set<number>());
    this.buf = '';
    if (mv.invuln) this.invuln = Math.max(this.invuln, mv.dur);
    w.events.push({ type: 'swing', id: this.id, sfx: mv.sfx ?? 'light', x: this.x, z: this.z });
    if (mv.kind === 'super') {
      this.spirit = 0;
      w.events.push({ type: 'super', id: this.id, phase: 'start' });
      if (this.def.lines?.super) w.say(this, this.def.lines.super);
      if (this.isPlayer) w.hitstop = Math.max(w.hitstop, 0.3);
    }
  }

  private startDodge(w: World) {
    const it = this.intent;
    const mag = Math.hypot(it.mx, it.mz);
    if (mag > 0.2) {
      this.dodgeX = it.mx / mag;
      this.dodgeZ = it.mz / mag;
      this.face = Math.atan2(this.dodgeX, this.dodgeZ);
    } else {
      this.dodgeX = -Math.sin(this.face);
      this.dodgeZ = -Math.cos(this.face);
    }
    this.state = 'dodge';
    this.t = 0;
    this.move = null;
    this.combo = 0;
    this.buf = '';
    this.invuln = Math.max(this.invuln, F.dodgeInvuln[1]);
    w.events.push({ type: 'dodge', id: this.id });
  }

  setMounted(w: World, on: boolean) {
    if (this.mounted === on) return;
    this.mounted = on;
    this.combo = 0;
    w.events.push({ type: 'mount', id: this.id, on });
  }

  private tryRage(w: World) {
    if (this.intent.rage && this.rage >= TUNE.rage.max && this.rageT <= 0) {
      this.rage = 0;
      this.rageT = TUNE.rage.duration;
      w.events.push({ type: 'rage', id: this.id });
    }
  }

  /** Grounded action selection shared by free / guard / post-dodge. */
  private groundAction(w: World, afterDodge = false): boolean {
    const ms = this.moveset;
    if (this.mounted) {
      switch (this.buf) {
        case 'L':
          this.startMove(w, MOUNTED[this.combo++ % 2]);
          return true;
        case 'H':
          this.startMove(w, MOUNTED[2]);
          return true;
        case 'J':
          // vault out of the saddle
          this.setMounted(w, false);
          break;
        case 'S':
          if (this.spirit >= TUNE.spirit.max) this.setMounted(w, false);
          break;
        default:
          this.buf = '';
          return false;
      }
    }
    switch (this.buf) {
      case 'S':
        if (this.spirit >= TUNE.spirit.max) {
          this.startMove(w, ms.super);
          return true;
        }
        this.buf = '';
        return false;
      case 'D':
        this.startDodge(w);
        return true;
      case 'J':
        this.buf = '';
        this.vy = F.jumpVel;
        this.y = 0.01;
        this.state = 'air';
        this.airCount = 0;
        this.move = null;
        return true;
      case 'H':
        this.combo = 0;
        this.startMove(w, ms.charges[0]);
        return true;
      case 'L':
        if (afterDodge || this.runT > F.dashAfterRun) {
          this.combo = 0;
          this.startMove(w, ms.dash);
        } else {
          this.combo = 1;
          this.startMove(w, ms.lights[0]);
        }
        this.runT = 0;
        return true;
    }
    return false;
  }

  /** Soft targeting: nudge facing toward the most sensible enemy without stealing control. */
  private aim(w: World, dt: number) {
    const it = this.intent;
    const hasDir = Math.hypot(it.mx, it.mz) > 0.3;
    const dir = hasDir ? Math.atan2(it.mx, it.mz) : this.face;
    let bx = 0,
      bz = 0,
      best = Infinity;
    const lk = this.lock;
    if (lk && !lk.dead && Math.hypot(lk.x - this.x, lk.z - this.z) < 10) {
      bx = lk.x;
      bz = lk.z;
      best = -1;
    } else {
      const half = (F.aimCone * DEG) / 2;
      const consider = (ex: number, ez: number, bonus: number) => {
        const dx = ex - this.x,
          dz = ez - this.z;
        const d = Math.hypot(dx, dz);
        if (d > F.aimRange || d < 0.05) return;
        const a = Math.abs(angDiff(dir, Math.atan2(dx, dz)));
        if (a > half && d > 1.6) return;
        const score = a / half + (d / F.aimRange) * 0.7 - bonus;
        if (score < best) {
          best = score;
          bx = ex;
          bz = ez;
        }
      };
      for (const o of w.fighters) if (o.team !== this.team && !o.dead) consider(o.x, o.z, 0.35);
      w.forNear(this.x, this.z, F.aimRange, (s) => {
        if (s.team !== this.team && !s.dead) consider(s.x, s.z, 0);
      });
    }
    if (best < Infinity) this.face = angToward(this.face, Math.atan2(bx - this.x, bz - this.z), 22 * dt);
    else if (hasDir) this.face = angToward(this.face, dir, 18 * dt);
    return best < Infinity ? Math.hypot(bx - this.x, bz - this.z) : Infinity;
  }

  update(w: World, dt: number) {
    this.px = this.x;
    this.pz = this.z;
    this.py = this.y;
    const it = this.intent;
    if (it.super) this.buf = 'S';
    else if (it.dodge) this.buf = 'D';
    else if (it.jump) this.buf = 'J';
    else if (it.heavy) this.buf = 'H';
    else if (it.light) this.buf = 'L';
    if (it.super || it.dodge || it.jump || it.heavy || it.light) this.bufT = F.inputBuffer;
    else if ((this.bufT -= dt) <= 0) this.buf = '';

    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.combatT = Math.max(0, this.combatT - dt);
    if ((this.takenT -= dt) <= 0) this.taken = 0;
    if (this.rageT > 0) {
      this.rageT -= dt;
      this.spirit = Math.min(TUNE.spirit.max, this.spirit + 6 * dt);
    }
    if (this.state !== 'guard' && this.state !== 'stunned') this.guardMeter = Math.min(F.guardMax, this.guardMeter + F.guardRegen * dt);
    if (this.hp < this.maxHp * 0.25 && !this.dead) this.spirit = Math.min(TUNE.spirit.max, this.spirit + TUNE.spirit.lowHpRegen * dt);
    if (this.state !== 'dead') this.tryRage(w);

    const spd = F.runSpeed * this.def.speed * (this.raging ? 1.12 : 1);
    const mag = Math.hypot(it.mx, it.mz);

    switch (this.state) {
      case 'free': {
        if (it.mount) this.setMounted(w, !this.mounted);
        if (this.mounted) {
          this.ride(spd, mag, dt);
          this.groundAction(w);
          break;
        }
        let tx = 0,
          tz = 0;
        if (mag > 0.1) {
          const k = Math.min(1, mag) / mag;
          tx = it.mx * k * spd;
          tz = it.mz * k * spd;
          this.face = angToward(this.face, Math.atan2(it.mx, it.mz), F.turnRate * dt);
          this.runT += dt;
        } else this.runT = 0;
        this.approachVel(tx, tz, F.accel * dt);
        if (this.groundAction(w)) break;
        if (it.guard) {
          this.state = 'guard';
          this.guardT = 0;
          this.runT = 0;
        }
        break;
      }

      case 'guard': {
        this.guardT += dt;
        const k = mag > 0.1 ? (Math.min(1, mag) / mag) * spd * F.guardMoveMul : 0;
        this.approachVel(it.mx * k, it.mz * k, F.accel * dt);
        const lk = this.lock;
        if (lk && !lk.dead) this.face = angToward(this.face, Math.atan2(lk.x - this.x, lk.z - this.z), 10 * dt);
        if (this.groundAction(w)) break;
        if (!it.guard) this.state = 'free';
        break;
      }

      case 'attack': {
        const mv = this.move!;
        const prev = this.moveT;
        this.moveT += dt * (this.raging ? TUNE.rage.speedMul : 1);
        const T = this.moveT;
        let tgtDist = Infinity;
        if (mv.mounted) {
          this.ride(spd, mag, dt);
          for (let i = 0; i < mv.hits.length; i++) if (T >= mv.hits[i].t0 && prev <= mv.hits[i].t1) w.resolveHit(this, mv, i);
          if (T >= mv.cancel && this.buf === 'L' && mv.kind === 'light') this.startMove(w, MOUNTED[this.combo++ % 2]);
          else if (T >= mv.cancel && this.buf === 'H') this.startMove(w, MOUNTED[2]);
          else if (this.moveT >= mv.dur) {
            this.move = null;
            this.state = 'free';
          }
          break;
        }
        if (T < (mv.turn ?? 0.1)) tgtDist = this.aim(w, dt);

        if (mv.air && this.y > 0) {
          if (mv.plunge && T > 0.1) {
            this.vy = -mv.plunge;
            this.vx *= 0.8;
            this.vz *= 0.8;
          } else this.vy -= F.gravity * dt * (mv.plunge ? 0.2 : 0.55);
          this.y += this.vy * dt;
          if (this.y <= 0) {
            this.y = 0;
            this.vy = 0;
            w.events.push({ type: 'land', x: this.x, z: this.z, heavy: !!mv.plunge });
            if (mv.plunge) {
              mv.hits.forEach((h, i) => h.onLand && w.resolveHit(this, mv, i));
              this.moveT = Math.max(this.moveT, mv.dur - 0.34);
              this.vx = this.vz = 0;
            } else {
              this.endMove();
              break;
            }
          }
        } else {
          let lv = 0;
          if (mv.lunge) for (const l of mv.lunge) if (T >= l[0] && T <= l[1]) lv = l[2];
          // don't shove through the thing we're hitting
          if (tgtDist < this.reach * 0.55) lv *= 0.15;
          this.vx = Math.sin(this.face) * lv;
          this.vz = Math.cos(this.face) * lv;
        }

        for (let i = 0; i < mv.hits.length; i++) {
          const h = mv.hits[i];
          if (h.onLand) continue;
          if (mv.sfx === 'shot' && prev < h.t0 && T >= h.t0 && h.range > 5) w.events.push({ type: 'shot', id: this.id, range: h.range * this.scale, arc: h.arc });
          if (T >= h.t0 && prev <= h.t1) w.resolveHit(this, mv, i);
        }
        if (mv.kind === 'super' && prev < mv.dur - 0.5 && T >= mv.dur - 0.5) w.events.push({ type: 'super', id: this.id, phase: 'finish' });

        if (T >= mv.cancel && this.buf) {
          const ms = this.moveset;
          const grounded = this.y <= 0;
          if (this.buf === 'S' && this.spirit >= TUNE.spirit.max && grounded) {
            this.startMove(w, ms.super);
            break;
          }
          if (this.buf === 'D' && grounded) {
            this.startDodge(w);
            break;
          }
          if (mv.kind === 'light') {
            if (this.buf === 'L' && this.combo < ms.lights.length) {
              this.startMove(w, ms.lights[this.combo++]);
              break;
            }
            if (this.buf === 'H' && this.combo < ms.charges.length) {
              this.startMove(w, ms.charges[this.combo]);
              break;
            }
          }
          if (mv.kind === 'air' && !mv.plunge && this.y > 0) {
            if (this.buf === 'L' && this.airCount < 3) {
              this.airCount++;
              this.vy = Math.max(this.vy, 2.5);
              this.startMove(w, ms.airLight);
              break;
            }
            if (this.buf === 'H') {
              this.startMove(w, ms.airHeavy);
              break;
            }
          }
          // chase a launched enemy into the air
          if (this.buf === 'J' && grounded && this.moveConnected && mv.hits.some((h) => h.react === 'launch')) {
            this.groundAction(w);
            this.vx = Math.sin(this.face) * 3;
            this.vz = Math.cos(this.face) * 3;
            break;
          }
        }
        if (this.moveT >= mv.dur) this.endMove();
        break;
      }

      case 'dodge': {
        this.t += dt;
        const k = Math.pow(Math.max(0, 1 - this.t / F.dodgeDur), 0.7) * F.dodgeSpeed;
        this.vx = this.dodgeX * k;
        this.vz = this.dodgeZ * k;
        if (this.t >= F.dodgeCancel && this.buf && this.groundAction(w, true)) break;
        if (this.t >= F.dodgeDur) this.state = 'free';
        break;
      }

      case 'air': {
        this.vy -= F.gravity * dt;
        this.y += this.vy * dt;
        if (mag > 0.1) {
          this.vx += (it.mx / mag) * F.accel * F.airControl * dt;
          this.vz += (it.mz / mag) * F.accel * F.airControl * dt;
          const s = Math.hypot(this.vx, this.vz);
          if (s > spd) {
            this.vx *= spd / s;
            this.vz *= spd / s;
          }
          this.face = angToward(this.face, Math.atan2(it.mx, it.mz), 8 * dt);
        }
        if (this.buf === 'L' && this.airCount < 3) {
          this.airCount++;
          this.vy = Math.max(this.vy, 2.5);
          this.startMove(w, this.moveset.airLight);
        } else if (this.buf === 'H') this.startMove(w, this.moveset.airHeavy);
        else if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
          this.state = 'free';
          w.events.push({ type: 'land', x: this.x, z: this.z, heavy: false });
        }
        break;
      }

      case 'hitstun':
      case 'stunned':
        this.vx *= Math.max(0, 1 - 9 * dt);
        this.vz *= Math.max(0, 1 - 9 * dt);
        if ((this.t -= dt) <= 0) this.state = 'free';
        break;

      case 'launched':
        this.vy -= F.gravity * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
          this.vx *= 0.3;
          this.vz *= 0.3;
          w.events.push({ type: 'land', x: this.x, z: this.z, heavy: true });
          if (this.dying) {
            this.state = 'dead';
            this.dying = false;
            this.t = 0;
          } else {
            this.state = 'down';
            this.t = F.downTime;
          }
        }
        break;

      case 'down':
        this.vx *= Math.max(0, 1 - 10 * dt);
        this.vz *= Math.max(0, 1 - 10 * dt);
        if ((this.t -= dt) <= 0) {
          this.state = 'getup';
          this.t = F.getupTime;
          this.invuln = F.getupTime + 0.25;
        }
        break;

      case 'getup':
        this.vx = this.vz = 0;
        if ((this.t -= dt) <= 0) this.state = 'free';
        break;

      case 'dead':
        this.t += dt;
        this.vx = this.vz = 0;
        break;
    }

    if (this.mounted && (this.state === 'free' || this.state === 'attack') && Math.hypot(this.vx, this.vz) > TUNE.horse.trampleSpeed) {
      if ((this.trampleT -= dt) <= 0) {
        this.trampleT = 0.35;
        this.trampleSets[0].clear();
      }
      const keep = this.hitSets;
      this.hitSets = this.trampleSets;
      w.resolveHit(this, TRAMPLE, 0);
      this.hitSets = keep;
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const lim = w.half - 1;
    this.x = clamp(this.x, -lim, lim);
    this.z = clamp(this.z, -lim, lim);
  }

  /** Horses are fast, slow to turn, and flatten whoever is in front of them. */
  private ride(spd: number, mag: number, dt: number) {
    const it = this.intent;
    const top = spd * TUNE.horse.speed;
    let tx = 0,
      tz = 0;
    if (mag > 0.1) {
      this.face = angToward(this.face, Math.atan2(it.mx, it.mz), TUNE.horse.turn * dt);
      const k = Math.min(1, mag);
      tx = Math.sin(this.face) * top * k;
      tz = Math.cos(this.face) * top * k;
    }
    this.approachVel(tx, tz, TUNE.horse.accel * dt);
    this.runT = 0;
  }

  private endMove() {
    this.move = null;
    this.combo = 0;
    if (this.y > 0) this.state = 'air';
    else this.state = 'free';
  }

  private approachVel(tx: number, tz: number, maxStep: number) {
    const dx = tx - this.vx,
      dz = tz - this.vz;
    const d = Math.hypot(dx, dz);
    if (d <= maxStep || d === 0) {
      this.vx = tx;
      this.vz = tz;
    } else {
      this.vx += (dx / d) * maxStep;
      this.vz += (dz / d) * maxStep;
    }
  }

  /**
   * Apply a hit. (nx, nz) is the unit direction from the attacker toward this fighter.
   * `attacker` is null for rank-and-file soldiers.
   */
  takeHit(w: World, attacker: Fighter | null, hit: HitDef, nx: number, nz: number, dmgMul: number): HitResult {
    if (this.state === 'dead' || this.dying || this.invuln > 0 || this.state === 'down') return 'miss';
    this.combatT = 4;
    const cy = this.y + 1.1 * this.scale;

    if (this.state === 'guard') {
      const facingAttacker = -(Math.sin(this.face) * nx + Math.cos(this.face) * nz) > Math.cos(80 * DEG);
      if (facingAttacker) {
        if (!hit.gb) {
          if (this.guardT <= F.parryWindow && attacker && (this.isPlayer || w.rng.chance(this.parryChance))) {
            attacker.state = 'stunned';
            attacker.t = F.parriedTime;
            attacker.move = null;
            attacker.combo = 0;
            attacker.vx = nx * -3;
            attacker.vz = nz * -3;
            this.spirit = Math.min(TUNE.spirit.max, this.spirit + 10);
            w.events.push({ type: 'parry', x: this.x - nx * 0.6, y: cy, z: this.z - nz * 0.6 });
            if (this.isPlayer || attacker.isPlayer) w.hitstop = Math.max(w.hitstop, 0.14);
            return 'parry';
          }
          this.guardMeter -= hit.dmg * dmgMul * (attacker ? 0.9 : 0.4);
          this.vx = nx * hit.kb * 0.45;
          this.vz = nz * hit.kb * 0.45;
          w.events.push({ type: 'block', x: this.x - nx * 0.6, y: cy, z: this.z - nz * 0.6, byPlayer: this.isPlayer });
          if (this.guardMeter <= 0) {
            this.guardMeter = F.guardMax * 0.5;
            this.state = 'stunned';
            this.t = F.stunTime;
            w.events.push({ type: 'guardbreak', x: this.x, y: cy, z: this.z });
          }
          return 'block';
        }
        w.events.push({ type: 'guardbreak', x: this.x, y: cy, z: this.z });
      }
    }

    const dmg = (hit.dmg * dmgMul) / this.def.def / (this.raging ? 1.25 : 1);
    this.hp -= dmg;
    if (this.isPlayer) w.stats.dmgTaken += dmg;
    this.spirit = Math.min(TUNE.spirit.max, this.spirit + dmg * TUNE.spirit.perDamageTaken);
    this.lastHitBy = attacker ?? this.lastHitBy;
    this.hitFlash = 0.14;

    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = true;
      this.state = 'launched';
      this.move = null;
      this.y = Math.max(this.y, 0.01);
      this.vy = 7.5;
      this.vx = nx * 8;
      this.vz = nz * 8;
      w.onOfficerDown(this, attacker ?? this.lastHitBy);
      return 'kill';
    }

    // Soldiers chip at you but can't interrupt a committed swing; armored moves shrug off anything.
    const armored = this.state === 'attack' && (this.move?.armor || !attacker);
    if (armored) return 'hit';

    // a solid blow throws the rider
    if (this.mounted && (hit.react !== 'stagger' || !attacker)) {
      if (attacker || this.hp < this.maxHp * 0.5) this.setMounted(w, false);
      else return 'hit';
    }
    this.taken++;
    this.takenT = 1.3;
    const decay = Math.max(F.hitstunFloor, 1 - F.hitstunDecay * (this.taken - 1));
    const airborne = this.y > 0 || this.state === 'launched';
    this.move = null;
    this.combo = 0;

    switch (hit.react) {
      case 'stagger':
        if (airborne) {
          this.state = 'launched';
          this.vy = Math.max(this.vy, (hit.lift ?? 4) * decay);
          this.vx = nx * hit.kb * 0.4;
          this.vz = nz * hit.kb * 0.4;
        } else {
          this.state = 'hitstun';
          this.t = F.hitstun * decay * (attacker ? 1 : 0.55);
          this.vx = nx * hit.kb;
          this.vz = nz * hit.kb;
        }
        break;
      case 'stun':
        if (airborne) {
          this.state = 'launched';
          this.vy = Math.max(this.vy, 3 * decay);
        } else {
          this.state = 'stunned';
          this.t = F.stunTime * decay;
        }
        this.vx = nx * hit.kb;
        this.vz = nz * hit.kb;
        break;
      default:
        this.state = 'launched';
        this.y = Math.max(this.y, 0.01);
        this.vy = (hit.lift ?? 5) * (airborne ? decay : 1);
        this.vx = nx * hit.kb * (hit.pull ? -0.3 : 1);
        this.vz = nz * hit.kb * (hit.pull ? -0.3 : 1);
    }
    return 'hit';
  }
}
