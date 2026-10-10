import * as THREE from 'three';
import type { Audio } from '../core/audio';
import type { Action, Input } from '../core/input';
import { angDiff, clamp, damp } from '../core/math';
import { CLANS } from '../data/officers';
import { TUNE } from '../data/tuning';
import { STRATS } from '../data/stratagems';
import type { Fighter } from '../sim/fighter';
import type { World } from '../sim/world';
import { Hud } from '../ui/hud';
import { airPose, clipFor, dodgePose, ridePose, downPose, getupPose, guardPose, hitPose, idlePose, launchedPose, runPose, stunPose, warmClips } from './anims';
import { Crowd, horseGeometry } from './crowd';
import { Fx, Trail } from './fx';
import { Grass } from './grass';
import { CastleView } from './castleView';
import { Pose } from './pose';
import { Rig } from './rig';
import { buildStage, recolorBase, type Stage } from './scene';

interface RigView {
  f: Fighter;
  rig: Rig;
  trail: Trail;
  target: Pose;
  phase: number;
  lastStep: number;
  fade: number;
  plate: THREE.Sprite | null;
  serial: number;
  horse: THREE.Mesh | null;
}

const KO_MILESTONES = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000];
const UP = new THREE.Vector3(0, 1, 0);

function namePlate(text: string, color: number): THREE.Sprite {
  color = new THREE.Color(color).getHex();
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '700 44px "Hiragino Mincho ProN","Yu Mincho",Georgia,serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#000';
  g.strokeText(text, 256, 48);
  g.fillStyle = '#' + new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35).getHexString();
  g.fillText(text, 256, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  s.scale.set(3.4, 0.64, 1);
  s.renderOrder = 10;
  return s;
}

export class BattleView {
  stage: Stage;
  camera: THREE.PerspectiveCamera;
  crowd: Crowd;
  fx = new Fx();
  hud: Hud;
  rigs: RigView[] = [];
  private grass: Grass | null = null;
  private castleView: CastleView | null = null;
  teamColors: number[];
  camYaw = 0;
  camPitch = 0.3;
  camDist = 8;
  private camTarget = new THREE.Vector3();
  trauma = 0;
  private acc = 0;
  private slowT = 0;
  private superZoom = 0;
  private idleLook = 0;
  time = 0;
  paused = false;
  debugOn = false;
  /** fixed camera distance for pose inspection */
  debugDist: number | null = null;
  private fps = 60;
  private selfRing: THREE.Mesh;
  private lockRing: THREE.Mesh;
  private player: Fighter;
  onEnd: ((winner: number, reason: string) => void) | null = null;
  /** draws the finished frame; the host can route it through post-processing */
  present: ((scene: THREE.Scene, camera: THREE.Camera) => void) | null = null;
  /** called when command passes to another officer, so the host can swap in its own controller */
  onTakeover: ((f: Fighter) => void) | null = null;
  private pendingTakeover: { f: Fighter; t: number } | null = null;
  /** ground markers where fire arrows are about to land */
  private warnings: { mesh: THREE.Mesh; t: number; max: number }[] = [];
  /** patches of burning ground */
  private burns: { x: number; z: number; r: number; t: number; max: number }[] = [];
  private warnTex: THREE.Texture | null = null;
  simMs = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    public world: World,
    private input: Input,
    private audio: Audio,
    ui: HTMLElement,
    public opts: { attract?: boolean; shake?: number; sens?: number; invertY?: boolean; blood?: number; shadowSize?: number; grass?: number } = {},
  ) {
    warmClips();
    const w = world;
    this.player = w.player ?? w.fighters[0];
    this.fx.bloodLevel = opts.blood ?? 1;
    const clans = w.def.clans.map((c, i) => ({ ...(CLANS[c] ?? CLANS.oda), ...(w.def.colors ? { color: w.def.colors[i] } : {}), ...(w.def.mons ? { mon: w.def.mons[i] } : {}) }));
    this.teamColors = clans.map((c) => c.color);
    // two armies in the same colours would be unplayable
    if (new THREE.Color(this.teamColors[0]).getHexString() === new THREE.Color(this.teamColors[1]).getHexString()) this.teamColors[1] = 0x8a8578;
    this.stage = buildStage(w.def, this.teamColors, clans.map((c) => c.mon), w.terrain, opts.shadowSize ?? 2048);
    this.fx.ground = (x, z) => w.terrain.height(x, z);
    this.fx.groundNormal = (x, z, out) => {
      w.terrain.normal(x, z, out);
      return out;
    };
    const scene = this.stage.scene;
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, 1200);
    renderer.toneMappingExposure = scene.userData.exposure ?? 1.05;
    this.crowd = new Crowd(this.teamColors);
    scene.add(this.crowd.group, this.fx.group);
    if (w.castles.length) {
      this.castleView = new CastleView(w.castles, (x, z) => w.terrain.height(x, z));
      scene.add(this.castleView.group);
    }
    if (opts.grass) {
      this.grass = new Grass(w.def, w.terrain, opts.grass, this.stage.groundTint);
      scene.add(this.grass.mesh);
    }

    for (const f of w.fighters) this.addRig(f);

    const ringTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      g.strokeStyle = '#fff';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(64, 64, 52, 0, 6.28);
      g.stroke();
      g.lineWidth = 2;
      g.beginPath();
      g.arc(64, 64, 40, 0, 6.28);
      g.stroke();
      return new THREE.CanvasTexture(c);
    })();
    const ringGeo = new THREE.PlaneGeometry(1, 1);
    ringGeo.rotateX(-Math.PI / 2);
    const mkRing = (color: number, size: number) => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, color, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.scale.setScalar(size);
      m.renderOrder = 2;
      scene.add(m);
      return m;
    };
    this.selfRing = mkRing(0xffe9a8, 2.1);
    this.lockRing = mkRing(0xff4433, 2.6);
    this.lockRing.visible = false;

    this.hud = new Hud(ui, this.teamColors, this.player, w.def.sides);
    this.camYaw = this.player.face;
    this.camTarget.set(this.player.x, 1.6, this.player.z);
    this.resize();
    if (opts.attract) {
      this.hud.root.style.display = 'none';
      this.selfRing.visible = false;
      this.camPitch = 0.32;
      return;
    }
    this.player.controller = (f) => this.playerControl(f);
    setTimeout(() => {
      this.hud.showCallout(w.def.name, `${w.def.sides[0]} vs ${w.def.sides[1]}`);
      if (this.player.def.lines?.enter) this.hud.addLog(this.player.def.lines.enter, 'speech', this.player.def.name);
    }, 400);
  }

  private addRig(f: Fighter) {
    const scene = this.stage.scene;
    const rig = new Rig(f.def);
    const trail = new Trail(this.trailColor(f));
    scene.add(rig.root, trail.mesh);
    let plate: THREE.Sprite | null = null;
    if (!f.isPlayer) {
      plate = namePlate(f.def.name, f.team === this.world.playerTeam ? 0x7fb8ff : 0xff6a55);
      scene.add(plate);
    }
    const rv: RigView = { f, rig, trail, target: new Pose(), phase: 0, lastStep: 0, fade: 1, plate, serial: -1, horse: null };
    idlePose(f.def.weapon, 0, rig.pose);
    this.rigs.push(rv);
  }
  private trailColor(f: Fighter) {
    return f.isPlayer ? 0xfff2c4 : f.team === this.world.playerTeam ? 0xbfe0ff : 0xffb09a;
  }

  resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.hud.dispose();
    this.stage.dispose();
    this.renderer.renderLists.dispose();
  }

  // ------------------------------------------------------------ player input → intent
  private playerControl(f: Fighter) {
    const it = f.intent;
    const inp = this.input;
    const [ax, ay] = inp.moveAxis();
    const sy = Math.sin(this.camYaw),
      cy = Math.cos(this.camYaw);
    it.mx = sy * ay - cy * ax;
    it.mz = cy * ay + sy * ax;
    it.light = inp.take('light');
    it.heavy = inp.take('heavy');
    it.jump = inp.take('jump');
    it.dodge = inp.take('dodge');
    it.super = inp.take('super');
    it.rage = inp.take('rage');
    it.guard = inp.down('guard');
    it.mount = inp.take('mount');
    for (let i = 0; i < STRATS.length; i++) if (inp.take(`strat${i + 1}` as Action) && !this.world.useStratagem(f.team, STRATS[i].id, f)) this.hud.denied(i);
    if (inp.take('lock')) {
      if (f.lock) f.lock = null;
      else {
        let best: Fighter | null = null,
          bs = Infinity;
        for (const o of this.world.fighters) {
          if (o.team === f.team || o.dead) continue;
          const d = Math.hypot(o.x - f.x, o.z - f.z);
          if (d > 40) continue;
          const a = Math.abs(angDiff(this.camYaw, Math.atan2(o.x - f.x, o.z - f.z)));
          const s = d + a * 12;
          if (s < bs) {
            bs = s;
            best = o;
          }
        }
        f.lock = best;
      }
    }
  }

  // ------------------------------------------------------------ frame
  frame(rawDt: number) {
    const w = this.world;
    this.fps = damp(this.fps, 1 / Math.max(rawDt, 1e-4), 2, rawDt);
    this.input.poll();
    if (this.input.take('debug')) {
      this.debugOn = !this.debugOn;
      this.hud.debug.classList.toggle('on', this.debugOn);
    }
    let dt = Math.min(rawDt, 0.05);
    if (this.paused) dt = 0;

    // slow motion after an officer falls, easing back to full speed
    let scale = 1;
    if (this.slowT > 0) {
      this.slowT -= rawDt;
      scale = 0.18 + 0.82 * Math.pow(1 - clamp(this.slowT / TUNE.officerKillSlowmo, 0, 1), 3);
    }
    const sdt = dt * scale;

    const t0 = performance.now();
    this.acc += sdt;
    let steps = 0;
    while (this.acc >= TUNE.tick && steps < 5) {
      w.step(TUNE.tick);
      this.acc -= TUNE.tick;
      steps++;
    }
    if (steps === 5) this.acc = 0;
    this.simMs = damp(this.simMs, performance.now() - t0, 3, rawDt);
    const frozen = w.hitstop > 0;
    const alpha = frozen ? 1 : this.acc / TUNE.tick;
    this.time += sdt;

    this.handleEvents();
    if (this.pendingTakeover && !this.paused && (this.pendingTakeover.t -= rawDt) <= 0) {
      const nf = this.pendingTakeover.f;
      this.pendingTakeover = null;
      this.takeOver(nf);
    }
    const vdt = frozen ? 0 : sdt;
    this.updateRigs(alpha, vdt);
    this.crowd.update(w, alpha, vdt);
    this.updateCamera(alpha, dt, rawDt);
    this.updateStrikes(vdt);
    this.fx.update(vdt, this.camera);
    this.stage.weather(dt, this.camera.position);
    this.grass?.update(dt, this.camTarget.x, this.camTarget.z);
    this.castleView?.update(dt);
    this.animateFlags();

    const p = this.player;
    this.hud.update(w, p, p.lock ?? this.nearestThreat(), dt);
    if (this.debugOn && !this.opts.attract) this.drawDebug();
    if (this.present) this.present(this.stage.scene, this.camera);
    else this.renderer.render(this.stage.scene, this.camera);
  }

  private gy(x: number, z: number) {
    return this.world.terrain.height(x, z);
  }

  private nrm = new THREE.Vector3();
  private qb = new THREE.Quaternion();
  /** Lay a ground ring on the slope at (x, z), turned by `spin`. */
  private layFlat(m: THREE.Object3D, x: number, z: number, spin: number) {
    m.position.set(x, this.gy(x, z) + 0.08, z);
    this.world.terrain.normal(x, z, this.nrm);
    m.quaternion.setFromUnitVectors(UP, this.nrm).multiply(this.qb.setFromAxisAngle(UP, spin));
  }

  private addWarning(x: number, z: number, r: number, t: number, color: number) {
    if (!this.warnTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(128, 128, 60, 128, 128, 126);
      grad.addColorStop(0, 'rgba(255,255,255,0.05)');
      grad.addColorStop(0.85, 'rgba(255,255,255,0.3)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#fff';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(128, 128, 118, 0, 6.28);
      g.stroke();
      this.warnTex = new THREE.CanvasTexture(c);
    }
    const geo = new THREE.PlaneGeometry(2 * r, 2 * r, 16, 16);
    geo.rotateX(-Math.PI / 2);
    // drape it over the ground so the whole circle shows on a slope
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.gy(x + pos.getX(i), z + pos.getZ(i)) + 0.15);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.warnTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    mesh.position.set(x, 0, z);
    mesh.renderOrder = 3;
    this.stage.scene.add(mesh);
    this.warnings.push({ mesh, t: t, max: t });
  }

  private updateStrikes(dt: number) {
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const wv = this.warnings[i];
      wv.t -= dt;
      const k = 1 - Math.max(0, wv.t) / wv.max;
      (wv.mesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.65 * Math.abs(Math.sin(this.time * (6 + k * 14)));
      const sc = 1.08 - k * 0.08;
      wv.mesh.scale.set(sc, 1, sc);
      if (wv.t <= 0) {
        this.stage.scene.remove(wv.mesh);
        wv.mesh.geometry.dispose();
        (wv.mesh.material as THREE.Material).dispose();
        this.warnings.splice(i, 1);
      }
    }
    if (dt <= 0) return;
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      if ((b.t -= dt) <= 0) {
        this.burns.splice(i, 1);
        continue;
      }
      this.fx.burn(b.x, b.z, b.r, b.t / b.max);
    }
  }

  /** The player now controls `nf`. */
  private takeOver(nf: Fighter) {
    this.player = nf;
    if (!this.opts.attract) nf.controller = (f) => this.playerControl(f);
    this.onTakeover?.(nf);
    const rv = this.rigs.find((x) => x.f === nf);
    if (rv?.plate) {
      this.stage.scene.remove(rv.plate);
      rv.plate.material.map?.dispose();
      rv.plate.material.dispose();
      rv.plate = null;
    }
    for (const x of this.rigs) x.trail.color.set(this.trailColor(x.f));
    this.hud.setPlayer(nf);
    this.hud.showCallout('Command Passes', `${nf.def.name} fights on`);
    this.hud.flash(0.5);
    this.audio.taiko(1);
    this.camYaw = nf.face;
    this.camTarget.set(nf.x, 1.6 + nf.y, nf.z);
    this.input.clear();
  }

  private nearestThreat(): Fighter | null {
    const p = this.player;
    let best: Fighter | null = null,
      bd = 16;
    for (const o of this.world.fighters) {
      if (o.team === p.team || o.dead) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private animateFlags() {
    const t = this.time;
    for (const flags of this.stage.baseFlags) for (const f of flags) f.rotation.z = Math.sin(t * 1.7 + f.userData.phase) * 0.06;
  }

  // ------------------------------------------------------------ sim events → juice
  private handleEvents() {
    const w = this.world,
      p = this.player,
      fx = this.fx,
      au = this.audio;
    const near = (x: number, z: number) => Math.hypot(x - p.x, z - p.z);
    for (const e of w.events) {
      switch (e.type) {
        case 'hit': {
          const d = near(e.x, e.z);
          if (d > 80) break;
          if (e.blood) fx.blood(e.x, e.y, e.z, e.dx, e.dz, Math.min(1.6, e.weight));
          if (d < 40) {
            fx.flash(e.x, e.y, e.z, 0.9 + e.weight * 1.6, e.officer ? 0xffe2b0 : 0xfff6e0, 0.1);
            fx.sparks(e.x, e.y, e.z, 2 + Math.round(e.weight * 4), 0xffd9a0, 7);
            au.hit(e.weight, clamp(1.15 - d / 34, 0, 1) * (e.byPlayer ? 1 : 0.55));
          }
          if (e.byPlayer) this.hud.hitLanded();
          break;
        }
        case 'swing': {
          const d = near(e.x, e.z);
          if (d < 30) au.swing(e.sfx, clamp(1 - d / 30, 0, 1) * (e.id === p.id ? 1 : 0.5));
          break;
        }
        case 'soldierSwing':
          break;
        case 'volley': {
          const d = near(e.x, e.z);
          if (d > 60) break;
          if (e.gun) {
            const mx = e.x + Math.sin(e.face) * 1.1,
              mz = e.z + Math.cos(e.face) * 1.1;
            fx.flash(mx, 1.35, mz, 1.5, 0xffc070, 0.08);
            fx.dust(mx, mz, 2, 1.5, 0xb8b8b8);
            au.shot(clamp(0.7 - d / 70, 0.05, 0.6));
          } else au.arrow(clamp(0.8 - d / 50, 0, 0.6));
          break;
        }
        case 'block':
          if (near(e.x, e.z) < 40) {
            fx.sparks(e.x, e.y, e.z, 14, 0xfff0c0, 11);
            fx.flash(e.x, e.y, e.z, 1.3, 0xdfeaff, 0.1);
            au.block();
            if (e.byPlayer) this.trauma = Math.min(1, this.trauma + 0.15);
          }
          break;
        case 'parry':
          fx.sparks(e.x, e.y, e.z, 34, 0xcfe4ff, 16);
          fx.flash(e.x, e.y, e.z, 4.5, 0xcfe4ff, 0.25);
          au.parry();
          this.hud.flash(0.35);
          this.trauma = Math.min(1, this.trauma + 0.3);
          break;
        case 'guardbreak':
          if (near(e.x, e.z) < 40) {
            fx.sparks(e.x, e.y, e.z, 26, 0xff9a5a, 13);
            fx.flash(e.x, e.y, e.z, 3, 0xff8040, 0.2);
            au.guardBreak();
          }
          break;
        case 'ko':
          if (KO_MILESTONES.includes(e.count)) {
            this.hud.showCallout(`${e.count} 斬!`, e.count >= 1000 ? 'TRUE WARRIOR OF THE SENGOKU' : 'ENEMIES CUT DOWN');
            au.chime(KO_MILESTONES.indexOf(e.count));
            au.taiko(0.9);
          }
          break;
        case 'officerDown': {
          const f = w.fighters.find((o) => o.id === e.id)!;
          if (near(e.x, e.z) < 45 || f.isPlayer) {
            this.slowT = TUNE.officerKillSlowmo;
            this.trauma = 1;
            fx.ring(e.x, e.z, 14, 0xffe0b0, 0.6);
            fx.flash(e.x, 1.3, e.z, 8, 0xffffff, 0.3);
            fx.blood(e.x, 1.3, e.z, 0, 1, 1.6);
            fx.blood(e.x, 1.3, e.z, 1, 0, 1.6);
            fx.blood(e.x, 1.3, e.z, -1, -0.5, 1.6);
            au.bigHit();
            this.hud.flash(0.6);
          }
          if (f.team !== p.team) this.hud.showCallout(f.isCommander ? 'Enemy Commander Defeated' : 'Enemy Officer Defeated', f.def.name);
          else if (!f.isPlayer) this.hud.showCallout('Ally Officer Lost', f.def.name);
          au.taiko(1);
          break;
        }
        case 'log':
          this.hud.addLog(e.text, e.kind, e.who);
          break;
        case 'shake':
          this.trauma = Math.min(1, this.trauma + e.amt);
          break;
        case 'super': {
          const f = w.fighters.find((o) => o.id === e.id)!;
          if (near(f.x, f.z) > 60) break;
          if (e.phase === 'start') {
            au.superStart();
            fx.ring(f.x, f.z, 9, 0xffe7a0, 0.5);
            fx.flash(f.x, f.y + 1.2, f.z, 7, 0xfff0c0, 0.35, false);
            if (f.isPlayer) {
              this.hud.flash(0.5);
              this.superZoom = 1;
            }
          } else {
            fx.ring(f.x, f.z, 18, 0xffd080, 0.6);
            fx.dust(f.x, f.z, 30, 9);
          }
          break;
        }
        case 'rage': {
          const f = w.fighters.find((o) => o.id === e.id)!;
          fx.ring(f.x, f.z, 12, 0xa070ff, 0.6);
          fx.embers(f.x, f.y, f.z, 50, 0xa070ff, 2);
          au.superStart();
          if (f.isPlayer) this.hud.showCallout('修羅', 'SHURA AWAKENED');
          break;
        }
        case 'land':
          if (near(e.x, e.z) < 40) {
            fx.dust(e.x, e.z, e.heavy ? 14 : 5, e.heavy ? 5 : 2.5);
            if (e.heavy) fx.ring(e.x, e.z, 6, 0xe8dcc0, 0.3);
            au.land(e.heavy);
          }
          break;
        case 'dodge': {
          const f = w.fighters.find((o) => o.id === e.id)!;
          if (near(f.x, f.z) < 30) {
            fx.dust(f.x, f.z, 6, 3);
            if (f.isPlayer) au.dodge();
          }
          break;
        }
        case 'baseCapture': {
          recolorBase(this.stage, e.base, e.team);
          const b = w.bases[e.base];
          fx.ring(b.x, b.z, b.r * 2.4, this.teamColors[e.team], 1.2);
          if (e.team === p.team) {
            this.hud.showCallout('Base Captured', b.name);
            au.chime(2);
          } else {
            this.hud.showCallout('Base Lost', b.name);
            au.taiko(0.8);
          }
          break;
        }
        case 'mount': {
          const f = w.fighters.find((o) => o.id === e.id)!;
          fx.dust(f.x, f.z, 8, 3);
          if (near(f.x, f.z) < 30) au.land(false);
          break;
        }
        case 'pickup':
          fx.ring(e.x, e.z, 5, e.kind === 'heal' ? 0x7be08a : 0xf6dc7a, 0.4);
          fx.embers(e.x, 0.3, e.z, 24, e.kind === 'heal' ? 0x7be08a : 0xf6dc7a, 0.8);
          au.chime(e.kind === 'heal' ? 1 : 4);
          this.hud.addLog(e.kind === 'heal' ? 'Provisions recovered: health restored.' : 'A war charm: spirit surges.', 'good');
          break;
        case 'mission':
          if (e.state === 'start') {
            this.hud.addLog(`Mission: ${e.text}.`, 'speech', 'Orders');
            au.pluck(587, 0.2);
          } else if (e.state === 'done') {
            this.hud.showCallout('Mission Complete', e.text);
            au.chime(3);
          } else this.hud.addLog(`Mission failed: ${e.text}.`, 'bad');
          break;
        case 'banner':
          this.hud.showCallout(e.title, e.sub);
          if (e.good) au.chime(1);
          else au.taiko(0.9);
          break;
        case 'join':
          this.addRig(w.fighters.find((o) => o.id === e.id)!);
          break;
        case 'defect': {
          const rv = this.rigs.find((x) => x.f.id === e.id);
          if (rv) {
            rv.trail.color.set(this.trailColor(rv.f));
            if (rv.plate) {
              this.stage.scene.remove(rv.plate);
              rv.plate = namePlate(rv.f.def.name, rv.f.team === w.playerTeam ? 0x7fb8ff : 0xff6a55);
              this.stage.scene.add(rv.plate);
            }
          }
          break;
        }
        case 'shot': {
          const rv = this.rigs.find((x) => x.f.id === e.id);
          if (!rv || near(rv.f.x, rv.f.z) > 70) break;
          const f = rv.f;
          rv.rig.root.updateMatrixWorld(true);
          rv.rig.tip.getWorldPosition(this.tipV);
          const ty = this.tipV.y - this.gy(this.tipV.x, this.tipV.z);
          fx.flash(this.tipV.x, ty, this.tipV.z, 2.6, 0xffc070, 0.09);
          fx.sparks(this.tipV.x, ty, this.tipV.z, 10, 0xffb060, 14);
          fx.tracers(this.tipV.x, ty, this.tipV.z, f.face, e.arc, e.range);
          fx.dust(f.x, f.z, 3, 2, 0xb0b0b0);
          au.shot(clamp(1.2 - near(f.x, f.z) / 50, 0.15, 1));
          if (f.isPlayer) this.trauma = Math.min(1, this.trauma + 0.22);
          break;
        }
        case 'stratagem': {
          const def = STRATS.find((d) => d.id === e.id);
          if (!def) break;
          const mine = e.team === p.team;
          this.hud.showCallout(`${def.kanji}`, mine ? def.name : `Enemy stratagem: ${def.name}`);
          if (e.id === 'drums') {
            for (let i = 0; i < 4; i++) au.taiko(i === 3 ? 1 : 0.75, i * 0.22);
            for (const f of w.fighters) if (f.team === e.team && !f.dead && near(f.x, f.z) < 60) fx.ring(f.x, f.z, 8, this.teamColors[e.team], 0.6);
          } else if (e.id === 'reinforce') {
            au.chime(2);
            au.taiko(0.8);
            const camp = w.nearestBase(e.x, e.z, (b) => b.team === e.team);
            if (camp) fx.dust(camp.x, camp.z, 30, 6);
          } else if (e.id === 'fire') au.taiko(0.6);
          break;
        }
        case 'strike': {
          const mine = e.team === p.team;
          if (e.phase === 'warn') {
            this.addWarning(e.x, e.z, e.r, e.t, mine ? 0xffb347 : 0xff3a2a);
            // the volley comes in over the caller's shoulder
            const from = w.fighters.find((f) => f.team === e.team && !f.dead && Math.hypot(f.x - e.x, f.z - e.z) < 40);
            fx.fireArrows(e.x, e.z, e.r, e.t, from?.x ?? e.x, from?.z ?? e.z - 20);
            const d = near(e.x, e.z);
            if (d < 70) for (let i = 0; i < 5; i++) au.arrow(clamp(0.9 - d / 80, 0.1, 0.8));
          } else {
            const blaze = e.phase === 'blaze';
            fx.flash(e.x, 1.5, e.z, blaze ? 14 : 11, 0xffa040, 0.35, false);
            fx.ring(e.x, e.z, e.r * 2.2, 0xff8a3a, 0.5);
            fx.sparks(e.x, 1, e.z, 40, 0xffa040, 12);
            fx.embers(e.x, 0.2, e.z, 60, 0xff7a2a, e.r);
            fx.scorch(e.x, e.z, e.r * 0.9, blaze ? 16 : 10);
            this.burns.push({ x: e.x, z: e.z, r: e.r * 0.85, t: blaze ? 9 : 4.5, max: blaze ? 9 : 4.5 });
            const d = near(e.x, e.z);
            if (d < 80) {
              au.bigHit();
              au.shot(clamp(1 - d / 80, 0.1, 0.9));
            }
          }
          break;
        }
        case 'gate': {
          const d = near(e.x, e.z);
          if (d > 70) break;
          if (e.phase === 'hit') {
            if (d < 40 && Math.random() < 0.5) {
              fx.sparks(e.x, 2.2, e.z, 5, 0x8a6a48, 6);
              au.block();
            }
          } else {
            fx.flash(e.x, 2.5, e.z, 8, 0xffd9a0, 0.3, false);
            fx.dust(e.x, e.z, 40, 7);
            fx.sparks(e.x, 2, e.z, 30, 0x8a6a48, 10);
            au.bigHit();
            au.taiko(1);
            if (d < 40) this.trauma = Math.min(1, this.trauma + 0.5);
          }
          break;
        }
        case 'takeover': {
          // linger on the fallen officer through the slow motion, then cut to whoever fights on
          const nf = w.fighters.find((o) => o.id === e.to);
          if (nf) this.pendingTakeover = { f: nf, t: 2.2 };
          break;
        }
        case 'end':
          setTimeout(() => this.onEnd?.(e.winner, e.reason), 2600);
          break;
      }
    }
    w.events.length = 0;
  }

  // ------------------------------------------------------------ officers
  static horseGeo: THREE.BufferGeometry | null = null;
  private itemMeshes: THREE.Mesh[] = [];
  private tipV = new THREE.Vector3();
  private baseV = new THREE.Vector3();

  private updateRigs(alpha: number, dt: number) {
    const p = this.player;
    for (const rv of this.rigs) {
      const f = rv.f,
        rig = rv.rig;
      if (f.state === 'dead') {
        rv.fade -= dt * 0.6;
        if (rv.fade <= 0) {
          rig.root.visible = false;
          rv.trail.update(dt, null, null);
          if (rv.plate) rv.plate.visible = false;
          continue;
        }
        rig.setOpacity(Math.min(1, rv.fade * 1.5));
      }
      const x = f.px + (f.x - f.px) * alpha,
        y = f.py + (f.y - f.py) * alpha,
        z = f.pz + (f.z - f.pz) * alpha;
      const g = this.gy(x, z);
      if (f.mounted && !rv.horse) {
        rv.horse = new THREE.Mesh(BattleView.horseGeo ?? (BattleView.horseGeo = horseGeometry()), new THREE.MeshLambertMaterial({ color: 0x3a2a20, flatShading: true }));
        rv.horse.castShadow = true;
        rv.horse.scale.setScalar(1.15);
        this.stage.scene.add(rv.horse);
      }
      const riding = f.mounted && f.state !== 'dead';
      if (rv.horse) {
        rv.horse.visible = riding;
        if (riding) {
          const gallop = Math.min(1, Math.hypot(f.vx, f.vz) / 8);
          rv.phase += Math.hypot(f.vx, f.vz) * dt * 0.9;
          rv.horse.position.set(x, g + y + Math.abs(Math.sin(rv.phase)) * 0.14 * gallop, z);
          rv.horse.rotation.set(Math.sin(rv.phase * 2) * 0.05 * gallop, f.face, 0, 'YXZ');
        }
      }
      rig.root.position.set(x, g + y + (riding ? 0.86 + Math.abs(Math.sin(rv.phase)) * 0.14 * Math.min(1, Math.hypot(f.vx, f.vz) / 8) : 0), z);
      rig.root.rotation.y = f.face;

      const wk = f.def.weapon;
      const speed = Math.hypot(f.vx, f.vz);
      let rate = 18;
      const T = rv.target;
      switch (f.state) {
        case 'attack': {
          const mv = f.move!;
          clipFor(mv, wk).sample(f.moveT, T);
          rate = 34;
          break;
        }
        case 'free':
          if (f.mounted) {
            ridePose(wk, rv.phase, clamp(speed / 10, 0, 1), T);
            rate = 14;
          } else if (speed > 0.6) {
            rv.phase += speed * dt * 1.25;
            runPose(wk, rv.phase, clamp(speed / 6, 0.3, 1), T);
            const stepN = Math.floor(rv.phase / Math.PI);
            if (stepN !== rv.lastStep) {
              rv.lastStep = stepN;
              if (f === p) this.audio.step();
              if (speed > 5 && Math.hypot(x - p.x, z - p.z) < 25) this.fx.dust(x, z, 1, 0.8);
            }
            rate = 16;
          } else {
            idlePose(wk, this.time + f.id, T);
            rate = 10;
          }
          break;
        case 'guard':
          guardPose(wk, T);
          rate = 26;
          break;
        case 'dodge':
          dodgePose(f.t / TUNE.fighter.dodgeDur, T);
          rate = 30;
          break;
        case 'air':
          airPose(wk, f.vy, T);
          rate = 16;
          break;
        case 'hitstun':
          hitPose(1 - f.t / TUNE.fighter.hitstun, T);
          rate = 40;
          break;
        case 'stunned':
          stunPose(this.time, T);
          rate = 14;
          break;
        case 'launched':
          launchedPose(this.time, T);
          rate = 20;
          break;
        case 'down':
        case 'dead':
          downPose(T);
          rate = 22;
          break;
        case 'getup':
          getupPose(1 - f.t / TUNE.fighter.getupTime, T);
          rate = 22;
          break;
      }
      // spins must not be smoothed away
      const k = 1 - Math.exp(-rate * dt);
      rig.pose.blend(T, dt > 0 ? k : 0);
      if (f.state === 'attack') rig.pose.spin = T.spin;
      else if (Math.abs(rig.pose.spin) > 1) rig.pose.spin = 0;
      rig.apply(rig.pose);
      if (riding) rig.saddle();

      if (f.raging) rig.setFlash(true, 0x7a48ff, 0.5);
      else if (f.hitFlash > 0) rig.setFlash(true, 0xffffff, 0.9);
      else if (f.state === 'guard' && f.guardT < TUNE.fighter.parryWindow) rig.setFlash(true, 0x9fc4ff, 0.35);
      else rig.setFlash(false);

      // weapon trail while a hit window is open
      let cutting = false;
      if (f.state === 'attack' && f.move) {
        const mv = f.move;
        if (mv.kind === 'super') cutting = f.moveT > 0.25;
        else for (const h of mv.hits) if (f.moveT >= h.t0 - 0.05 && f.moveT <= Math.min(h.t1, mv.dur) + 0.05) cutting = true;
        if (mv.plunge && f.y > 0) cutting = true;
      }
      if (dt > 0 || cutting) {
        if (cutting) {
          rig.root.updateMatrixWorld(true);
          rig.tip.getWorldPosition(this.tipV);
          rig.baseMark.getWorldPosition(this.baseV);
          rv.trail.update(dt, this.tipV, this.baseV);
        } else rv.trail.update(dt, null, null);
      }
      if (f.state === 'attack' && f.move?.kind === 'super' && dt > 0) {
        this.fx.embers(x, y, z, 2, f.raging ? 0xb080ff : 0xffc860, 1.4);
      } else if (f.raging && dt > 0 && Math.random() < 0.4) this.fx.embers(x, y, z, 1, 0xa070ff, 0.6);

      if (rv.plate) {
        const d = Math.hypot(x - p.x, z - p.z);
        rv.plate.visible = d < 70 && f.state !== 'dead';
        rv.plate.position.set(x, g + y + 2.75 * f.scale, z);
        const s = clamp(d / 14, 0.8, 3.2);
        rv.plate.scale.set(3.4 * s * 0.5, 0.64 * s * 0.5, 1);
      }
    }
    // pickups: bobbing lights on the ground
    const items = this.world.items;
    while (this.itemMeshes.length < items.length) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
      this.stage.scene.add(m);
      this.itemMeshes.push(m);
    }
    this.itemMeshes.forEach((m, i) => {
      const it = items[i];
      m.visible = !!it;
      if (!it) return;
      m.position.set(it.x, this.gy(it.x, it.z) + 0.7 + Math.sin(this.time * 3 + i) * 0.15, it.z);
      m.rotation.y = this.time * 2;
      (m.material as THREE.MeshBasicMaterial).color.set(it.kind === 'heal' ? 0x7be08a : 0xf6dc7a);
      if (dt > 0 && Math.random() < 0.15) this.fx.embers(it.x, 0.2, it.z, 1, it.kind === 'heal' ? 0x7be08a : 0xf6dc7a, 0.3);
    });
    this.layFlat(this.selfRing, p.px + (p.x - p.px) * alpha, p.pz + (p.z - p.pz) * alpha, this.time * 0.8);
    const lk = p.lock;
    this.lockRing.visible = !!lk && !lk.dead;
    if (lk) {
      this.layFlat(this.lockRing, lk.x, lk.z, -this.time * 2);
      this.lockRing.scale.setScalar(2.6 + Math.sin(this.time * 6) * 0.2);
    }
  }

  // ------------------------------------------------------------ camera
  private camPos = new THREE.Vector3();

  private focusT = 0;

  private updateCamera(alpha: number, dt: number, rawDt: number) {
    if (this.opts.attract) {
      // drift around whichever officer is in the thick of it
      if ((this.focusT -= rawDt) <= 0 || this.player.dead) {
        this.focusT = 14;
        const live = this.world.fighters.filter((f) => !f.dead);
        const busy = live.filter((f) => f.combatT > 0);
        const pick = busy.length ? busy : live;
        if (pick.length) this.player = pick[Math.floor(Math.random() * pick.length)];
      }
      this.camYaw += rawDt * 0.14;
      this.debugDist = 12;
    }
    const p = this.player;
    let [lx, ly] = this.opts.attract ? [0, 0] : this.input.lookDelta(rawDt);
    lx *= this.opts.sens ?? 1;
    ly *= (this.opts.sens ?? 1) * (this.opts.invertY ? -1 : 1);
    if (!this.paused) {
      this.camYaw -= lx;
      this.camPitch = clamp(this.camPitch + ly, -0.12, 1.15);
    }
    this.idleLook = lx || ly ? 0 : this.idleLook + rawDt;

    const px = p.px + (p.x - p.px) * alpha,
      py = p.py + (p.y - p.py) * alpha,
      pz = p.pz + (p.z - p.pz) * alpha;

    let want = p.mounted ? 10.5 : 8.2;
    const lk = p.lock && !p.lock.dead ? p.lock : null;
    if (lk) {
      // keep both duelists framed
      const a = Math.atan2(lk.x - px, lk.z - pz);
      this.camYaw += angDiff(this.camYaw, a) * Math.min(1, 4 * rawDt);
      const d = Math.hypot(lk.x - px, lk.z - pz);
      want = clamp(6.2 + d * 0.35, 6.5, 12);
    } else {
      // pull back when surrounded
      let n = 0;
      this.world.forNear(px, pz, 9, (s) => {
        if (s.team !== p.team && !s.dead) n++;
      });
      want += Math.min(3.2, n * 0.14);
      // without mouse-look, drift behind the player while they run
      const moving = Math.hypot(p.vx, p.vz) > 3;
      if (!this.input.locked && this.idleLook > 1.2 && moving && p.state === 'free') {
        const d = angDiff(this.camYaw, p.face);
        if (Math.abs(d) < 2.4) this.camYaw += d * Math.min(1, 1.2 * rawDt);
      }
    }
    if (this.superZoom > 0) {
      this.superZoom = Math.max(0, this.superZoom - rawDt * 0.55);
      want = want - 3.2 * Math.sin(this.superZoom * Math.PI);
    }
    this.camDist = this.debugDist ?? damp(this.camDist, want, 3.5, rawDt);

    const tx = lk ? px + (lk.x - px) * 0.3 : px,
      tz = lk ? pz + (lk.z - pz) * 0.3 : pz;
    const follow = 1 - Math.exp(-14 * rawDt);
    this.camTarget.x += (tx - this.camTarget.x) * follow;
    this.camTarget.z += (tz - this.camTarget.z) * follow;
    this.camTarget.y += (this.gy(px, pz) + 1.55 + py * 0.7 - this.camTarget.y) * (1 - Math.exp(-8 * rawDt));

    const cp = Math.cos(this.camPitch),
      sp = Math.sin(this.camPitch);
    const cx = this.camTarget.x - Math.sin(this.camYaw) * cp * this.camDist,
      cz = this.camTarget.z - Math.cos(this.camYaw) * cp * this.camDist;
    // never let a hillside come between the camera and the player
    this.camPos.set(cx, Math.max(this.gy(cx, cz) + 0.8, this.gy((cx + px) / 2, (cz + pz) / 2) + 1.2, this.camTarget.y + sp * this.camDist), cz);

    // trauma-squared shake reads as impact rather than wobble
    this.trauma = Math.max(0, this.trauma - rawDt * 1.9);
    const sh = this.trauma * this.trauma * (this.opts.shake ?? 1);
    const t = performance.now() * 0.001;
    const ox = (Math.sin(t * 91) + Math.sin(t * 53.3)) * 0.22 * sh,
      oy = (Math.sin(t * 77) + Math.sin(t * 41.7)) * 0.2 * sh;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 0.3, this.camTarget.z);
    this.camera.position.x += ox;
    this.camera.position.y += oy;
    this.camera.rotateZ((Math.sin(t * 67) * 0.02 + Math.sin(t * 29) * 0.012) * sh);
    const fov = 58 + sh * 4 + (p.state === 'dodge' ? 3 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, fov, 10, rawDt);
      this.camera.updateProjectionMatrix();
    }

    const sun = this.stage.sun;
    const sg = this.gy(px, pz),
      sd = this.stage.sunDir;
    sun.position.set(px + sd.x * 85, sg + sd.y * 85, pz + sd.z * 85);
    sun.target.position.set(px, sg, pz);
    void dt;
  }

  private drawDebug() {
    const w = this.world,
      p = this.player;
    const info = this.renderer.info;
    let s = `fps ${this.fps.toFixed(0)}  sim ${this.simMs.toFixed(2)}ms  calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n`;
    s += `soldiers ${w.alive[0]} / ${w.alive[1]}  reserves ${w.reserves[0]} / ${w.reserves[1]}  morale ${w.morale[0].toFixed(0)} / ${w.morale[1].toFixed(0)}\n`;
    s += `player ${p.state} ${p.move?.id ?? ''} combo ${p.combo} hp ${p.hp.toFixed(0)} spirit ${p.spirit.toFixed(0)} rage ${p.rage.toFixed(0)}\n`;
    for (const f of w.fighters) {
      if (f.isPlayer) continue;
      s += `${f.team ? '▲' : '●'} ${f.def.name.padEnd(18)} ${String(Math.round(f.hp)).padStart(4)}hp ${f.state.padEnd(8)} ${f.ai?.status ?? ''}\n`;
    }
    this.hud.debug.textContent = s;
  }
}
