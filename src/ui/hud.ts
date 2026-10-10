import type { Fighter } from '../sim/fighter';
import type { World } from '../sim/world';
import { TUNE } from '../data/tuning';

const el = (cls: string, html = '', parent?: HTMLElement) => {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  parent?.appendChild(d);
  return d;
};
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class Hud {
  root: HTMLElement;
  private plate: HTMLElement;
  private hpFill: HTMLElement;
  private hpLag: HTMLElement;
  private spirit: HTMLElement;
  private rage: HTMLElement;
  private koN: HTMLElement;
  private combo: HTMLElement;
  private comboN: HTMLElement;
  private target: HTMLElement;
  private tName: HTMLElement;
  private tHp: HTMLElement;
  private tLag: HTMLElement;
  private tGuard: HTMLElement;
  private log: HTMLElement;
  private callout: HTMLElement;
  private speech: HTMLElement;
  private moraleFill: HTMLElement;
  private moraleL: HTMLElement;
  private moraleR: HTMLElement;
  private hurt: HTMLElement;
  private superFx: HTMLElement;
  private rageFx: HTMLElement;
  private flashEl: HTMLElement;
  private map: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  debug: HTMLElement;
  private hint: HTMLElement;
  private missionEl: HTMLElement;
  private lastKo = -1;
  private comboCount = 0;
  maxCombo = 0;
  private comboT = 0;
  private speechT = 0;
  private hurtA = 0;
  private flashA = 0;
  private lastHp = 0;
  private mapT = 0;

  constructor(parent: HTMLElement, private teamColors: number[], player: Fighter, sides: string[]) {
    const r = (this.root = el('hud', '', parent));
    this.hurt = el('vignette hurt', '', r);
    this.superFx = el('vignette superfx', '', r);
    this.rageFx = el('vignette ragefx', '', r);
    this.flashEl = el('flash', '', r);

    const plate = (this.plate = el('panel plate', `<div class="name"></div><div class="title"></div>`, r));
    const hp = el('bar hp', '<i class="lag"></i><i class="fill"></i>', plate);
    this.hpLag = hp.children[0] as HTMLElement;
    this.hpFill = hp.children[1] as HTMLElement;
    this.spirit = el('bar spirit', '<i></i>', plate);
    this.rage = el('bar rage', '<i></i>', plate);

    const mor = el('panel morale', `<div class="row"><span class="l"></span><span>MORALE</span><span class="r"></span></div><div class="track"><i></i></div>`, r);
    this.moraleFill = mor.querySelector('.track i') as HTMLElement;
    this.moraleL = mor.querySelector('.l') as HTMLElement;
    this.moraleR = mor.querySelector('.r') as HTMLElement;
    (mor.querySelector('.track') as HTMLElement).style.background = hex(teamColors[1]);
    this.moraleFill.style.background = hex(teamColors[0]);
    void sides;

    this.target = el('panel target', '<div class="name"></div><div class="bar hp"><i class="lag"></i><i class="fill"></i></div><div class="bar guard"><i></i></div>', r);
    this.tName = this.target.querySelector('.name') as HTMLElement;
    this.tLag = this.target.querySelector('.lag') as HTMLElement;
    this.tHp = this.target.querySelector('.fill') as HTMLElement;
    this.tGuard = this.target.querySelector('.guard i') as HTMLElement;

    const ko = el('panel ko', '<span class="k">斬</span><span class="n">0</span><div class="lbl">K.O. COUNT</div>', r);
    this.koN = ko.querySelector('.n') as HTMLElement;
    this.combo = el('panel combo', '<span class="n">0</span><span class="lbl">HITS</span>', r);
    this.comboN = this.combo.querySelector('.n') as HTMLElement;

    this.missionEl = el('panel mission', '<small>MISSION</small><b></b><i></i>', r);
    this.log = el('panel log', '', r);
    this.callout = el('panel callout', '', r);
    this.speech = el('panel speech-box', '<b></b><span></span>', r);
    const mm = el('panel minimap', '<canvas width="220" height="220"></canvas>', r);
    this.map = mm.querySelector('canvas')!;
    this.mctx = this.map.getContext('2d')!;
    this.debug = el('panel debug', '', r);
    this.hint = el('panel hint', 'WASD move · Mouse look · LMB/J light · RMB/K heavy · Space jump · Shift dodge · Q guard · F Ougi · R Shura · Tab lock-on', r);
    setTimeout(() => (this.hint.style.opacity = '0'), 14000);
    this.setPlayer(player);
  }

  /** Point the nameplate at a different officer, when command passes to someone else. */
  setPlayer(f: Fighter) {
    (this.plate.querySelector('.name') as HTMLElement).textContent = f.def.name;
    (this.plate.querySelector('.title') as HTMLElement).textContent = f.def.title;
    this.lastHp = f.hp;
  }

  dispose() {
    this.root.remove();
  }

  addLog(text: string, kind: string, who?: string) {
    const d = el(kind, who ? `<b>${who}</b>${text}` : text, this.log);
    while (this.log.children.length > 6) this.log.firstChild!.remove();
    setTimeout(() => d.classList.add('old'), 7000);
    setTimeout(() => d.remove(), 8200);
    if (kind === 'speech' && who) {
      (this.speech.children[0] as HTMLElement).textContent = who;
      (this.speech.children[1] as HTMLElement).textContent = text;
      this.speech.classList.add('on');
      this.speechT = 3.6;
    }
  }

  showCallout(big: string, small = '') {
    this.callout.innerHTML = `${big}<small>${small}</small>`;
    this.callout.classList.remove('show');
    void this.callout.offsetWidth;
    this.callout.classList.add('show');
  }

  hitLanded() {
    this.comboCount++;
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
    this.comboT = 2.2;
    this.comboN.textContent = String(this.comboCount);
    this.combo.classList.add('on');
  }

  flash(a: number) {
    this.flashA = Math.max(this.flashA, a);
  }

  update(w: World, p: Fighter, target: Fighter | null, dt: number) {
    const hp = Math.max(0, p.hp / p.maxHp);
    this.hpFill.style.transform = `scaleX(${hp})`;
    this.hpLag.style.transform = `scaleX(${hp})`;
    if (p.hp < this.lastHp - 0.5) this.hurtA = Math.min(1, this.hurtA + (this.lastHp - p.hp) / 40 + 0.2);
    this.lastHp = p.hp;
    this.hurtA = Math.max(hp < 0.25 ? 0.35 + Math.sin(w.time * 6) * 0.15 : 0, this.hurtA - dt * 1.6);
    this.hurt.style.opacity = String(this.hurtA);

    const sp = p.spirit / TUNE.spirit.max;
    (this.spirit.firstChild as HTMLElement).style.transform = `scaleX(${sp})`;
    this.spirit.classList.toggle('full', sp >= 1);
    const rg = p.raging ? p.rageT / TUNE.rage.duration : p.rage / TUNE.rage.max;
    (this.rage.firstChild as HTMLElement).style.transform = `scaleX(${rg})`;
    this.rage.classList.toggle('full', rg >= 1 || p.raging);
    this.rageFx.style.opacity = p.raging ? '0.8' : '0';
    this.superFx.style.opacity = p.move?.kind === 'super' ? '1' : '0';

    if (w.ko !== this.lastKo) {
      this.lastKo = w.ko;
      this.koN.textContent = String(w.ko);
      this.koN.classList.remove('bump');
      void this.koN.offsetWidth;
      this.koN.classList.add('bump');
    }
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) {
      this.comboCount = 0;
      this.combo.classList.remove('on');
    }
    if (this.speechT > 0 && (this.speechT -= dt) <= 0) this.speech.classList.remove('on');
    if (this.flashA > 0) {
      this.flashA = Math.max(0, this.flashA - dt * 4);
      this.flashEl.style.opacity = String(this.flashA);
    }

    if (target && !target.dead) {
      this.target.classList.add('on');
      this.tName.innerHTML = `${target.def.name}<small>${target.def.title}</small>`;
      const t = Math.max(0, target.hp / target.maxHp);
      this.tHp.style.transform = `scaleX(${t})`;
      this.tLag.style.transform = `scaleX(${t})`;
      this.tGuard.style.transform = `scaleX(${target.guardMeter / TUNE.fighter.guardMax})`;
    } else this.target.classList.remove('on');

    const m0 = w.morale[0],
      m1 = w.morale[1];
    this.moraleFill.style.width = `${(m0 / (m0 + m1 || 1)) * 100}%`;
    this.moraleL.textContent = `${w.def.sides[0]} ${w.alive[0] + w.reserves[0]}`;
    this.moraleR.textContent = `${w.alive[1] + w.reserves[1]} ${w.def.sides[1]}`;

    const ms = w.mission;
    this.missionEl.classList.toggle('on', !!ms);
    if (ms) {
      const left = Math.max(0, ms.until - w.time);
      (this.missionEl.children[1] as HTMLElement).textContent = ms.kind === 'kos' ? `${ms.text} (${Math.max(0, ms.goal - w.ko)} to go)` : ms.text;
      (this.missionEl.children[2] as HTMLElement).textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    }

    if ((this.mapT -= dt) <= 0) {
      this.mapT = 0.1;
      this.drawMap(w, p);
    }
  }

  /** Draw the battlefield. With `names` it is the large overview used on the pause screen. */
  drawMap(w: World, p: Fighter, g: CanvasRenderingContext2D = this.mctx, N = 220, names = false) {
    const k = N / (w.half * 2);
    // the player's own side is always at the bottom of the map
    const flip = w.playerTeam === 1 ? -1 : 1;
    const X = (x: number) => N / 2 - x * k * flip,
      Y = (z: number) => N / 2 - z * k * flip;
    g.clearRect(0, 0, N, N);
    g.fillStyle = '#2a3020';
    g.fillRect(0, 0, N, N);
    for (const b of w.bases) {
      g.fillStyle = b.team < 0 ? '#8a8578' : hex(this.teamColors[b.team]);
      g.globalAlpha = 0.45;
      g.beginPath();
      g.arc(X(b.x), Y(b.z), b.r * k, 0, 6.28);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = b.threat > 0 && Math.floor(w.time * 4) % 2 ? '#fff' : '#000';
      g.lineWidth = b.main ? 2.5 : 1.5;
      g.stroke();
      if (names) {
        g.fillStyle = '#efe6d2';
        g.font = '12px Georgia, serif';
        g.textAlign = 'center';
        g.fillText(b.name, X(b.x), Y(b.z) + b.r * k + 13);
      }
    }
    g.globalAlpha = 0.8;
    for (const s of w.soldiers) {
      if (!s.active || s.dead) continue;
      g.fillStyle = hex(this.teamColors[s.team]);
      g.fillRect(X(s.x) - 1, Y(s.z) - 1, 2, 2);
    }
    g.globalAlpha = 1;
    for (const f of w.fighters) {
      if (f.dead || f === p) continue;
      g.fillStyle = hex(this.teamColors[f.team]);
      g.strokeStyle = '#fff';
      g.lineWidth = 1.2;
      g.beginPath();
      if (f.isCommander) g.rect(X(f.x) - 4, Y(f.z) - 4, 8, 8);
      else g.arc(X(f.x), Y(f.z), 3.6, 0, 6.28);
      g.fill();
      g.stroke();
      if (names) {
        g.fillStyle = f.team === w.playerTeam ? '#bfe0ff' : '#ffb09a';
        g.font = '11px Georgia, serif';
        g.textAlign = 'left';
        g.fillText(f.def.name, X(f.x) + 7, Y(f.z) + 4);
      }
    }
    const ms = w.mission;
    if (ms && (ms.officer || ms.base) && Math.floor(w.time * 3) % 2) {
      const t = ms.officer ?? ms.base!;
      g.strokeStyle = '#fff3b0';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(X(t.x), Y(t.z), 9, 0, 6.28);
      g.stroke();
    }
    for (const it of w.items) {
      g.fillStyle = it.kind === 'heal' ? '#7be08a' : '#f6dc7a';
      g.fillRect(X(it.x) - 2, Y(it.z) - 2, 4, 4);
    }
    // player arrow
    g.save();
    g.translate(X(p.x), Y(p.z));
    g.rotate(-p.face + (flip < 0 ? Math.PI : 0));
    g.fillStyle = '#fff3b0';
    g.strokeStyle = '#000';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(0, 2);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
