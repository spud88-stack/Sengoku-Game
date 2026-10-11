import type { Audio } from '../core/audio';
import type { Input } from '../core/input';
import { DIFF_XP, levelOf, levelled, MAX_LEVEL, profile, record, resetProfile, saveProfile } from '../core/save';
import { BATTLES, sideOf, type BattleSpec } from '../data/battles';
import { movesetFor } from '../data/moves';
import { CLANS, OFFICERS, ROSTER } from '../data/officers';
import { DIFFICULTY } from '../data/tuning';
import { WEAPON_NAMES } from '../data/weapons';
import { defaultQuality, QUALITY, type Quality } from '../view/gfx';
import { blankWarrior, CUSTOM_IDS, STAT_LABELS, STAT_MAX, STAT_POINTS, statsOf, toOfficer, type CustomWarrior, type Helm, type StatKey } from '../data/custom';
import { WEAPONS } from '../data/weapons';
import { WarriorPreview } from '../view/preview';
import type { OfficerDef, Personality } from '../sim/types';

export interface BattleResult {
  won: boolean;
  reason: string;
  kos: number;
  time: number;
  officers: number;
  bases: number;
  maxCombo: number;
  dmgTaken: number;
  survived: boolean;
}

export interface FreeChoice {
  officer: string;
  battle: string;
  side: number;
  difficulty: string;
}

export interface ShellHost {
  audio: Audio;
  input: Input;
  portraits: Record<string, string>;
  startFree(c: FreeChoice): void;
  startDojo(officer: string): void;
  openEmpire(): void;
  startTutorial(): void;
  applySettings(): void;
  /** the saved custom warriors changed: re-register them and redraw their portraits */
  customsChanged(): void;
}

type Child = Node | string | null | undefined | false;
export function h(tag: string, attrs: Record<string, any> = {}, ...kids: (Child | Child[])[]): HTMLElement {
  const [name, ...cls] = tag.split('.');
  const e = document.createElement(name || 'div');
  if (cls.length) e.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn as EventListener);
    else if (k === 'style') Object.assign(e.style, v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== false && v != null) e.setAttribute(k, String(v));
  }
  for (const k of kids.flat()) if (k) e.append(k);
  return e;
}
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const TEMPER: Record<string, string> = { reckless: 'Reckless', patient: 'Patient', cunning: 'Cunning', honorable: 'Honourable' };
/** Colours offered for armour and cloth. */
const PALETTE = [0xa81c1c, 0x7a2a2a, 0xe0701a, 0xd0a020, 0x9aa63a, 0x2f7a52, 0x3f8f7f, 0x4a7fb5, 0x1d3a6e, 0x6a3fb5, 0xc05a8a, 0xd8d6cc, 0x8a8578, 0x55687c, 0x34343f, 0x1e1c22];
const CRESTS: [OfficerDef['crest'], string][] = [['crescent', 'Crescent'], ['horns', 'Horns'], ['antlers', 'Antlers'], ['sun', 'Sun disc'], ['fan', 'Fan'], ['cross', 'Cross'], ['plume', 'Plume'], ['none', 'None']];

export function grade(r: BattleResult): string {
  if (!r.won) return r.kos >= 300 ? 'C' : 'D';
  const score = r.kos / 4 + r.officers * 40 + r.bases * 25 + r.maxCombo / 4 - r.dmgTaken / 12 - Math.max(0, r.time - 600) / 10;
  return score >= 400 ? 'S' : score >= 280 ? 'A' : score >= 170 ? 'B' : 'C';
}

/** Every menu in the game. One screen is mounted at a time; the 3D battle keeps rendering behind it. */
export class Shell {
  private cur: HTMLElement | null = null;
  private back: (() => void) | null = null;
  active = false;

  constructor(
    private root: HTMLElement,
    private host: ShellHost,
  ) {
    window.addEventListener('keydown', (e) => this.key(e));
    // a gamepad drives the menus by standing in for the arrow keys
    const held = new Set<number>();
    const map: Record<number, string> = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 1: 'Escape' };
    const poll = () => {
      requestAnimationFrame(poll);
      if (!this.active) return;
      const gp = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected);
      if (!gp) return;
      const stick = [gp.axes[1] < -0.6, gp.axes[1] > 0.6, gp.axes[0] < -0.6, gp.axes[0] > 0.6];
      for (const b of [0, 1, 12, 13, 14, 15]) {
        const on = !!gp.buttons[b]?.pressed || (b >= 12 && stick[b - 12]);
        if (on && !held.has(b)) {
          if (b === 0) (document.activeElement as HTMLElement | null)?.click();
          else this.key(new KeyboardEvent('keydown', { code: map[b] }));
        }
        if (on) held.add(b);
        else held.delete(b);
      }
    };
    poll();
  }

  // ------------------------------------------------------------ plumbing
  mount(el: HTMLElement, back: (() => void) | null = null) {
    this.cur?.remove();
    this.cur = el;
    this.back = back;
    this.active = true;
    el.classList.add('screen');
    this.root.append(el);
    requestAnimationFrame(() => (el.querySelector('.nav.sel') ?? el.querySelector('.nav'))?.dispatchEvent(new Event('focusme')));
    const first = (el.querySelector('.nav.sel') ?? el.querySelector('.nav')) as HTMLElement | null;
    first?.focus({ preventScroll: true });
  }
  close() {
    this.cur?.remove();
    this.cur = null;
    this.back = null;
    this.active = false;
  }

  btn(label: string, fn: () => void, cls = '', sub = ''): HTMLElement {
    return h(
      'button.nav.btn' + (cls ? '.' + cls : ''),
      {
        on: {
          click: () => {
            this.host.audio.ui('ok');
            fn();
          },
          mouseenter: (e: Event) => (e.currentTarget as HTMLElement).focus({ preventScroll: true }),
          focus: () => this.host.audio.ui('move'),
        },
      },
      h('span', {}, label),
      sub && h('small', {}, sub),
    );
  }

  private key(e: KeyboardEvent) {
    if (!this.active || !this.cur) return;
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
    if (e.code === 'Escape' || e.code === 'Backspace') {
      if (this.back) {
        e.preventDefault();
        this.host.audio.ui('back');
        this.back();
      }
      return;
    }
    const d = dirs[e.code];
    if (!d) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt?.tagName === 'INPUT' || tgt?.dataset?.grab) return;
    e.preventDefault();
    const navs = [...this.cur.querySelectorAll<HTMLElement>('.nav')].filter((n) => n.offsetParent !== null);
    const cur = document.activeElement as HTMLElement;
    if (!navs.includes(cur)) {
      navs[0]?.focus();
      return;
    }
    // move to the nearest focusable element in the pressed direction
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2,
      ay = a.top + a.height / 2;
    let best: HTMLElement | null = null,
      bs = Infinity;
    for (const n of navs) {
      if (n === cur) continue;
      const b = n.getBoundingClientRect();
      const dx = b.left + b.width / 2 - ax,
        dy = b.top + b.height / 2 - ay;
      const along = dx * d[0] + dy * d[1];
      if (along < 4) continue;
      const across = Math.abs(dx * d[1]) + Math.abs(dy * d[0]);
      const s = along + across * 2.5;
      if (s < bs) {
        bs = s;
        best = n;
      }
    }
    best?.focus();
    best?.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------------ title + main menu
  title() {
    const go = () => {
      this.host.audio.init();
      this.host.audio.ui('ok');
      this.menu();
    };
    const el = h('div.title', { on: { click: go } }, h('div.kanji', {}, '戦国'), h('h1', {}, 'SENGOKU', h('br'), 'WARRIORS'), h('div.rule'), h('p.press', {}, 'Press any key'), h('p.foot', {}, 'A one-against-a-thousand tale of the Warring States'));
    this.mount(el);
    const once = (e: KeyboardEvent) => {
      if (this.cur !== el) return window.removeEventListener('keydown', once);
      if (e.code.startsWith('Arrow')) return;
      window.removeEventListener('keydown', once);
      go();
    };
    window.addEventListener('keydown', once);
  }

  menu() {
    const el = h(
      'div.menu',
      {},
      h('div.brand', {}, h('span.kanji', {}, '戦国'), h('h2', {}, 'Sengoku Warriors')),
      h(
        'div.list',
        {},
        !profile.tutorialDone && this.btn('Tutorial', () => this.host.startTutorial(), 'big.go', 'New here? Learn to fight in five minutes'),
        this.btn('Free Mode', () => this.freeOfficer(), 'big', 'Any officer, any battle, either side'),
        this.btn('Empire Mode', () => this.host.openEmpire(), 'big', 'Unify the land province by province'),
        this.btn('Training Ground', () => this.dojoPick(), '', 'Practise against a single rival'),
        this.btn('Warriors', () => this.warriors(), '', 'Create and outfit warriors of your own'),
        profile.tutorialDone && this.btn('Tutorial', () => this.host.startTutorial(), '', 'Replay the basics'),
        this.btn('Gallery', () => this.gallery(), '', 'Officers, records and move lists'),
        this.btn('Settings', () => this.settings(() => this.menu()), '', 'Sound, camera, blood, controls'),
      ),
      h('div.stats', {}, `Total K.O. ${profile.totalKos.toLocaleString()} · Best battle ${profile.bestKos} · Battles won ${profile.battlesWon.length}/${BATTLES.length}`),
    );
    this.mount(el);
  }

  // ------------------------------------------------------------ officer select
  private officerPanel(id: string): HTMLElement {
    const base = OFFICERS[id];
    const lv = levelOf(record(id).xp);
    const d = levelled(base, lv.level);
    const clan = CLANS[d.clan];
    const ms = movesetFor(d.weapon);
    const bar = (label: string, v: number, max: number) => h('div.stat', {}, h('label', {}, label), h('div.meter', {}, h('i', { style: { width: `${Math.min(100, (v / max) * 100)}%` } })));
    return h(
      'div.detail',
      {},
      h('div.portrait', { style: { background: `linear-gradient(160deg, ${hex(clan.color)}cc, #0b0a09 75%)` } }, h('span.mon', {}, clan.mon), this.host.portraits[id] ? h('img', { src: this.host.portraits[id], alt: '' }) : null),
      h('h3', {}, d.name),
      h('div.sub', {}, d.title),
      h('div.tags', {}, h('span', {}, `${clan.name} clan`), h('span', {}, WEAPON_NAMES[d.weapon]), h('span', {}, TEMPER[d.personality]), h('span.lv', {}, lv.level >= MAX_LEVEL ? 'Lv MAX' : `Lv ${lv.level}`)),
      h('div.xp', {}, h('i', { style: { width: `${lv.level >= MAX_LEVEL ? 100 : (lv.into / lv.need) * 100}%` } })),
      bar('Vitality', d.hp, 900),
      bar('Attack', d.atk, 1.6),
      bar('Defence', d.def, 1.6),
      bar('Speed', d.speed - 0.8, 0.45),
      bar('Reach', ms.reach, 4.2),
      h('p.bio', {}, base.bio),
    );
  }

  private pickOfficer(title: string, onPick: (id: string) => void, back: () => void, initial = ROSTER[0]) {
    const detail = h('div.detailWrap');
    const show = (id: string) => detail.replaceChildren(this.officerPanel(id));
    const grid = h(
      'div.grid',
      {},
      [...ROSTER, ...CUSTOM_IDS].map((id) => {
        const o = OFFICERS[id];
        const c = CLANS[o.clan];
        return h(
          'button.nav.card' + (id === initial ? '.sel' : ''),
          {
            style: { '--clan': hex(c.color) } as any,
            on: {
              focus: () => {
                show(id);
                this.host.audio.ui('move');
              },
              mouseenter: (e: Event) => (e.currentTarget as HTMLElement).focus({ preventScroll: true }),
              click: () => {
                this.host.audio.ui('ok');
                onPick(id);
              },
            },
          },
          this.host.portraits[id] ? h('img', { src: this.host.portraits[id], alt: '' }) : h('span.mon', {}, c.mon),
          h('b', {}, o.name.split(' ').slice(-1)[0]),
          h('small', {}, `Lv ${levelOf(record(id).xp).level}`),
        );
      }),
    );
    show(initial);
    this.mount(h('div.select', {}, h('header', {}, h('h2', {}, title), h('span.hint', {}, 'Arrows to browse · Enter to choose · Esc to go back')), h('div.cols', {}, grid, detail)), back);
  }

  freeOfficer() {
    this.pickOfficer('Choose Your Officer', (id) => this.freeBattle(id), () => this.menu());
  }
  dojoPick() {
    this.pickOfficer('Training Ground', (id) => this.host.startDojo(id), () => this.menu());
  }

  // ------------------------------------------------------------ custom warriors
  warriors() {
    const list: CustomWarrior[] = profile.customs;
    const rows = list.map((cw) =>
      h(
        'div.wrow',
        {},
        this.host.portraits[cw.id] ? h('img', { src: this.host.portraits[cw.id], alt: '' }) : h('i', { style: { background: hex(cw.primary) } }),
        h('div', {}, h('b', {}, cw.name), h('small', {}, `${cw.title} · ${WEAPON_NAMES[cw.weapon]} · Lv ${levelOf(record(cw.id).xp).level}`)),
        this.btn('Edit', () => this.editWarrior({ ...cw, points: { ...cw.points } }, false), 'mini'),
        this.btn('Dismiss', () => {
          if (!confirm(`Dismiss ${cw.name}? Their levels are kept in case you make them again.`)) return;
          profile.customs = list.filter((x) => x.id !== cw.id);
          saveProfile();
          this.host.customsChanged();
          this.warriors();
        }, 'mini'),
      ),
    );
    this.mount(
      h(
        'div.pause.wide',
        {},
        h('h2', {}, 'Your Warriors'),
        h('div.slist', {}, rows.length ? rows : h('p.keys', {}, 'No warriors yet. Make one, then choose them in Free Mode or on the Training Ground.')),
        h('div.row2', {}, list.length < 12 && this.btn('Create a Warrior', () => this.editWarrior(blankWarrior(list.length), true), 'go'), this.btn('Back', () => this.menu())),
      ),
      () => this.menu(),
    );
  }

  private editWarrior(cw: CustomWarrior, isNew: boolean) {
    const preview = new WarriorPreview();
    const refresh = () => preview.set(toOfficer(cw));
    const leave = () => {
      preview.dispose();
      this.warriors();
    };
    const cycleBtn = <T>(label: string, get: () => T, opts: [T, string][], set: (v: T) => void, after?: () => void) => {
      const name = () => opts.find((o) => o[0] === get())?.[1] ?? '';
      const text = () => (label ? `${label}: ${name()}` : name());
      const b = this.btn(text(), () => {
        const i = opts.findIndex((o) => o[0] === get());
        set(opts[(i + 1) % opts.length][0]);
        b.querySelector('span')!.textContent = text();
        after?.();
        refresh();
      }, 'mini');
      return b;
    };
    const text = (label: string, get: () => string, set: (v: string) => void, max = 24) =>
      h('label.srow', {}, h('span', {}, label), h('input.nav', { type: 'text', value: get(), maxlength: max, on: { input: (e: Event) => set((e.target as HTMLInputElement).value) } }));
    const swatches = (label: string, get: () => number, set: (v: number) => void) => {
      const row = h('div.swatches');
      const draw = () =>
        row.replaceChildren(
          ...PALETTE.map((c) =>
            h('button.nav.swatch' + (c === get() ? '.on' : ''), {
              style: { background: hex(c) },
              title: hex(c),
              on: {
                click: () => {
                  set(c);
                  draw();
                  refresh();
                },
              },
            }),
          ),
        );
      draw();
      return h('div.srow', {}, h('span', {}, label), row);
    };
    // stats: ten points across four
    const statWrap = h('div.stats4');
    const drawStats = () => {
      const left = STAT_POINTS - Object.values(cw.points).reduce((a, b) => a + b, 0);
      const st = statsOf(cw);
      const shown: Record<StatKey, string> = { hp: String(st.hp), atk: st.atk.toFixed(2), def: st.def.toFixed(2), speed: st.speed.toFixed(2) };
      statWrap.replaceChildren(
        h('div.srow', {}, h('span', {}, `Points to spend: ${left}`)),
        ...(Object.keys(STAT_LABELS) as StatKey[]).map((k) =>
          h(
            'div.srow',
            {},
            h('span', {}, `${STAT_LABELS[k]} ${shown[k]}`),
            h('div.pips', {}, Array.from({ length: STAT_MAX }, (_, i) => h('i' + (i < cw.points[k] ? '.on' : '')))),
            this.btn('−', () => {
              if (cw.points[k] > 0) cw.points[k]--;
              drawStats();
            }, 'mini'),
            this.btn('+', () => {
              if (cw.points[k] < STAT_MAX && left > 0) cw.points[k]++;
              drawStats();
            }, 'mini'),
          ),
        ),
      );
    };
    drawStats();
    const weaponNote = h('p.keys', {}, WEAPONS.find((w) => w.id === cw.weapon)?.desc ?? '');
    const save = () => {
      cw.name = cw.name.trim() || 'Nameless Ronin';
      cw.title = cw.title.trim() || 'Wandering Blade';
      const list: CustomWarrior[] = profile.customs;
      const i = list.findIndex((x) => x.id === cw.id);
      if (i >= 0) list[i] = cw;
      else list.push(cw);
      saveProfile();
      this.host.customsChanged();
      leave();
    };
    // start from the look and weapon of any historical officer
    const template = (o: OfficerDef) => {
      Object.assign(cw, { weapon: o.weapon, personality: o.personality, primary: o.primary, secondary: o.secondary, crest: o.crest, clan: o.clan, scale: o.scale ?? 1, helm: 'kabuto', mask: true, banner: true });
      this.editWarrior(cw, isNew);
      preview.dispose();
    };
    this.mount(
      h(
        'div.pause.wide.editor',
        {},
        h('h2', {}, isNew ? 'Create a Warrior' : `Outfit ${cw.name}`),
        h(
          'div.ecols',
          {},
          h('div.pcol', {}, preview.canvas, h('div.row2', {}, this.btn('Save Warrior', save, 'go'), this.btn('Cancel', leave))),
          h(
            'div.slist.eform',
            {},
            text('Name', () => cw.name, (v) => (cw.name = v)),
            text('Title', () => cw.title, (v) => (cw.title = v), 32),
            h(
              'div.srow',
              {},
              h('span', {}, 'Weapon'),
              cycleBtn('', () => cw.weapon, WEAPONS.map((w) => [w.id, w.name] as [typeof w.id, string]), (v) => (cw.weapon = v), () => (weaponNote.textContent = WEAPONS.find((w) => w.id === cw.weapon)?.desc ?? '')),
            ),
            weaponNote,
            h(
              'div.srow.wrap',
              {},
              cycleBtn('Temper', () => cw.personality, Object.entries(TEMPER) as [Personality, string][], (v) => (cw.personality = v)),
              cycleBtn('Clan', () => cw.clan, Object.entries(CLANS).map(([k, c]) => [k, c.name] as [string, string]), (v) => (cw.clan = v)),
              cycleBtn('Build', () => cw.scale, [[0.94, 'Slight'], [1, 'Average'], [1.06, 'Broad'], [1.12, 'Towering']], (v) => (cw.scale = v)),
            ),
            swatches('Armour', () => cw.primary, (v) => (cw.primary = v)),
            swatches('Cloth', () => cw.secondary, (v) => (cw.secondary = v)),
            h(
              'div.srow.wrap',
              {},
              cycleBtn('Helmet', () => cw.helm, [['kabuto', 'Kabuto'], ['jingasa', 'War hat'], ['hachimaki', 'Headband'], ['zukin', 'Shinobi hood']] as [Helm, string][], (v) => (cw.helm = v)),
              cycleBtn('Crest', () => cw.crest, CRESTS, (v) => (cw.crest = v)),
              cycleBtn('Mask', () => cw.mask, [[true, 'On'], [false, 'Off']], (v) => (cw.mask = v)),
              cycleBtn('Banner', () => cw.banner, [[true, 'On'], [false, 'Off']], (v) => (cw.banner = v)),
            ),
            statWrap,
            text('Battle cry', () => cw.enter, (v) => (cw.enter = v), 60),
            text('Ougi cry', () => cw.super, (v) => (cw.super = v), 40),
            h('div.srow.wrap', {}, h('span', {}, 'Start from'), ...ROSTER.slice(0, 14).map((id) => this.btn(OFFICERS[id].name.split(' ').slice(-1)[0], () => template(OFFICERS[id]), 'mini'))),
          ),
        ),
      ),
      leave,
    );
    refresh();
  }

  // ------------------------------------------------------------ battle select + briefing
  private drawMap(cv: HTMLCanvasElement, spec: BattleSpec, side: number) {
    const g = cv.getContext('2d')!,
      N = cv.width,
      k = N / (spec.half * 2);
    // the player's side is always drawn at the bottom
    const flip = side === 1 ? -1 : 1;
    const X = (x: number) => N / 2 - x * k * flip,
      Y = (z: number) => N / 2 - z * k * flip;
    g.fillStyle = '#2b3122';
    g.fillRect(0, 0, N, N);
    g.strokeStyle = '#8a7a58';
    g.lineWidth = 3;
    g.globalAlpha = 0.5;
    const bs = spec.bases;
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++)
        if (Math.hypot(bs[i].x - bs[j].x, bs[i].z - bs[j].z) < spec.half * 0.95) {
          g.beginPath();
          g.moveTo(X(bs[i].x), Y(bs[i].z));
          g.lineTo(X(bs[j].x), Y(bs[j].z));
          g.stroke();
        }
    g.globalAlpha = 1;
    const col = (t: number) => (t < 0 ? '#8a8578' : hex(CLANS[spec.clans[t]].color));
    g.font = '11px Georgia, serif';
    g.textAlign = 'center';
    for (const b of bs) {
      g.fillStyle = col(b.team);
      g.strokeStyle = '#000';
      g.lineWidth = b.main ? 3 : 1.5;
      g.beginPath();
      g.arc(X(b.x), Y(b.z), (b.main ? 13 : 9) * (N / 360), 0, 6.28);
      g.fill();
      g.stroke();
      g.fillStyle = '#efe6d2';
      g.fillText(b.name, X(b.x), Y(b.z) + (b.main ? 26 : 22) * (N / 360));
    }
    for (let t = 0; t < 2; t++)
      for (const s of spec.armies[t]) {
        g.fillStyle = col(t);
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.beginPath();
        if (s.commander) g.rect(X(s.x) - 5, Y(s.z) - 5, 10, 10);
        else g.arc(X(s.x) + 8, Y(s.z) - 8, 4, 0, 6.28);
        g.fill();
        g.stroke();
      }
  }

  freeBattle(officer: string, start = 0) {
    let bi = start;
    let side = Math.max(0, sideOf(BATTLES[bi], officer));
    let diff = profile.settings.difficulty;
    const info = h('div.brief');
    const cv = h('canvas', { width: 360, height: 360 }) as HTMLCanvasElement;
    const render = () => {
      const b = BATTLES[bi];
      const army = (t: number) =>
        h(
          'div.army' + (t === side ? '.mine' : ''),
          {},
          h('h4', { style: { borderColor: hex(CLANS[b.clans[t]].color) } }, b.sides[t], h('small', {}, `${Math.round(b.reserves[t] * 1.4)} troops`)),
          b.armies[t].map((s) => h('div', {}, s.commander ? '◆ ' : '· ', s.def.id === officer && t !== side ? 'Kagemusha' : s.def.name)),
        );
      info.replaceChildren(
        h('h3', {}, b.name, h('small', {}, String(b.year)), profile.battlesWon.includes(b.id) ? h('em', {}, 'Won') : null),
        h('p', {}, b.blurb),
        h('p.twist', {}, b.twist),
        h('div.armies', {}, army(0), army(1)),
      );
      this.drawMap(cv, b, side);
    };
    const list = h(
      'div.blist',
      {},
      BATTLES.map((b, i) =>
        h(
          'button.nav.row' + (i === bi ? '.sel' : ''),
          {
            on: {
              focus: () => {
                bi = i;
                const s = sideOf(b, officer);
                if (s >= 0) side = s;
                sideBtn.querySelector('span')!.textContent = `Fight for: ${BATTLES[bi].sides[side]}`;
                render();
                this.host.audio.ui('move');
              },
              mouseenter: (e: Event) => (e.currentTarget as HTMLElement).focus({ preventScroll: true }),
              click: () => go(),
            },
          },
          h('b', {}, b.name),
          h('small', {}, `${b.year} · ${b.sides[0]} vs ${b.sides[1]}`),
        ),
      ),
    );
    const go = () => {
      this.host.audio.ui('ok');
      profile.settings.difficulty = diff;
      saveProfile();
      this.host.startFree({ officer, battle: BATTLES[bi].id, side, difficulty: diff });
    };
    const sideBtn = this.btn(`Fight for: ${BATTLES[bi].sides[side]}`, () => {
      side = 1 - side;
      sideBtn.querySelector('span')!.textContent = `Fight for: ${BATTLES[bi].sides[side]}`;
      render();
    });
    const diffs = Object.keys(DIFFICULTY);
    const diffBtn = this.btn(`Difficulty: ${DIFFICULTY[diff].name}`, () => {
      diff = diffs[(diffs.indexOf(diff) + 1) % diffs.length];
      diffBtn.querySelector('span')!.textContent = `Difficulty: ${DIFFICULTY[diff].name}`;
    });
    render();
    this.mount(
      h(
        'div.select',
        {},
        h('header', {}, h('h2', {}, 'Choose Your Battle'), h('span.hint', {}, `${OFFICERS[officer].name} · Enter to march · Esc to go back`)),
        h('div.cols.battle', {}, h('div.left', {}, list, h('div.opts', {}, sideBtn, diffBtn, this.btn('March to Battle', go, 'go'))), h('div.mid', {}, cv), info),
      ),
      () => this.freeOfficer(),
    );
  }

  // ------------------------------------------------------------ results
  results(r: BattleResult, choice: { officer: string; battle: string; difficulty: string }, onContinue: () => void, extra: HTMLElement | null = null) {
    const rec = record(choice.officer);
    const before = levelOf(rec.xp);
    const gained = Math.round((r.kos * 2 + r.officers * 120 + r.bases * 60 + (r.won ? 500 : 100)) * (DIFF_XP[choice.difficulty] ?? 1));
    rec.xp += gained;
    rec.kos += r.kos;
    rec.battles++;
    profile.totalKos += r.kos;
    profile.bestKos = Math.max(profile.bestKos, r.kos);
    if (r.won && !profile.battlesWon.includes(choice.battle) && BATTLES.some((b) => b.id === choice.battle)) profile.battlesWon.push(choice.battle);
    saveProfile();
    const after = levelOf(rec.xp);
    const g = grade(r);
    const mm = Math.floor(r.time / 60),
      ss = Math.floor(r.time % 60);
    const row = (k: string, v: string | number) => h('div.rrow', {}, h('span', {}, k), h('b', {}, String(v)));
    const o = OFFICERS[choice.officer];
    if (r.won) this.host.audio.chime(3);
    else this.host.audio.taiko(1);
    this.mount(
      h(
        'div.results' + (r.won ? '.won' : '.lost'),
        {},
        h('div.banner', {}, h('span.kanji', {}, r.won ? '勝' : '敗'), h('h2', {}, r.won ? 'Victory' : 'Defeat'), h('p', {}, r.reason)),
        h(
          'div.rcols',
          {},
          h('div.rstats', {}, row('Enemies cut down', r.kos), row('Officers defeated', r.officers), row('Bases captured', r.bases), row('Longest combo', r.maxCombo), row('Damage taken', Math.round(r.dmgTaken)), row('Time', `${mm}:${String(ss).padStart(2, '0')}`)),
          h(
            'div.rgrade',
            {},
            h('div.g', {}, g),
            h('div', {}, o ? `${o.name}` : ''),
            h('div.xpGain', {}, `+${gained} experience`),
            after.level > before.level ? h('div.lvup', {}, `Level ${before.level} → ${after.level}`) : h('div', {}, after.level >= MAX_LEVEL ? 'Level MAX' : `Level ${after.level}`),
            o?.lines ? h('p.quote', {}, `“${r.won ? o.lines.win : o.lines.lose}”`) : null,
          ),
        ),
        extra,
        this.btn('Continue', onContinue, 'go'),
      ),
    );
  }

  // ------------------------------------------------------------ pause
  pause(officerId: string, onResume: () => void, onQuit: () => void, quitLabel = 'Retreat from Battle', map: HTMLElement | null = null) {
    const again = () => this.pause(officerId, onResume, onQuit, quitLabel, map);
    this.mount(
      h(
        'div.pause',
        {},
        h('h2', {}, 'Paused'),
        h('div.pcols', {}, map, h('div.list', {}, this.btn('Resume', onResume, 'big'), this.btn('Move List', () => this.moves(officerId, again)), this.btn('Settings', () => this.settings(again)), this.btn(quitLabel, onQuit))),
      ),
      onResume,
    );
  }

  moves(officerId: string, back: () => void) {
    const o = OFFICERS[officerId] ?? OFFICERS.yukimura;
    const ms = movesetFor(o.weapon);
    const L = 'Light',
      H = 'Heavy';
    const describe = (i: number) => {
      const mv = ms.charges[i];
      const hit = mv.hits[mv.hits.length - 1];
      const what = mv.hits.some((x) => x.react === 'launch') && mv.hits.length === 1 ? 'Launcher: jump after it to chase' : hit.gb && i === 0 ? 'Guard break' : hit.react === 'stun' ? 'Flurry into a stun' : hit.arc >= 360 ? 'Clears everything around you' : hit.range > 6 ? 'Ranged shot' : 'Finisher';
      return what;
    };
    const rows = [
      h('div.mrow', {}, h('b', {}, Array(ms.lights.length).fill(L).join(' · ')), h('span', {}, `${ms.lights.length}-hit string`)),
      ...ms.charges.map((_, i) => h('div.mrow', {}, h('b', {}, [...Array(i).fill(L), H].join(' · ')), h('span', {}, describe(i)))),
      h('div.mrow', {}, h('b', {}, 'Run, then Light'), h('span', {}, 'Dash attack')),
      h('div.mrow', {}, h('b', {}, 'Jump · Light / Heavy'), h('span', {}, 'Air cuts / ground slam')),
      h('div.mrow', {}, h('b', {}, 'Guard just before a hit'), h('span', {}, 'Parry: stuns the attacker')),
      h('div.mrow', {}, h('b', {}, 'Dodge'), h('span', {}, 'Brief invulnerability; cancels most recoveries')),
      h('div.mrow', {}, h('b', {}, 'Ougi (gold gauge full)'), h('span', {}, 'Invulnerable screen-clearing super')),
      h('div.mrow', {}, h('b', {}, 'Shura (violet gauge full)'), h('span', {}, 'Faster, stronger, gold gauge refills')),
    ];
    this.mount(h('div.pause.wide', {}, h('h2', {}, `${o.name} · ${WEAPON_NAMES[o.weapon]}`), h('div.mlist', {}, rows), this.btn('Back', back)), back);
  }

  // ------------------------------------------------------------ settings
  settings(back: () => void) {
    const s = profile.settings;
    const slider = (label: string, key: 'master' | 'sfx' | 'music' | 'sens' | 'shake', min: number, max: number) =>
      h(
        'label.srow',
        {},
        h('span', {}, label),
        h('input.nav', {
          type: 'range',
          min,
          max,
          step: 0.05,
          value: s[key],
          on: {
            input: (e: Event) => {
              s[key] = Number((e.target as HTMLInputElement).value);
              this.host.applySettings();
            },
          },
        }),
      );
    const cycle = <T>(label: string, get: () => T, opts: [T, string][], set: (v: T) => void) => {
      const name = () => opts.find((o) => o[0] === get())?.[1] ?? '';
      const b = this.btn(`${label}: ${name()}`, () => {
        const i = opts.findIndex((o) => o[0] === get());
        set(opts[(i + 1) % opts.length][0]);
        b.querySelector('span')!.textContent = `${label}: ${name()}`;
        this.host.applySettings();
      });
      return b;
    };
    const done = () => {
      saveProfile();
      back();
    };
    this.mount(
      h(
        'div.pause.wide',
        {},
        h('h2', {}, 'Settings'),
        h(
          'div.slist',
          {},
          slider('Master volume', 'master', 0, 1),
          slider('Effects volume', 'sfx', 0, 1),
          slider('Music volume', 'music', 0, 1),
          slider('Camera sensitivity', 'sens', 0.3, 2.5),
          slider('Screen shake', 'shake', 0, 1.5),
          cycle('Blood', () => s.blood, [[1, 'Full'], [0.5, 'Reduced'], [0, 'Off']], (v) => (s.blood = v)),
          cycle('Invert camera Y', () => s.invertY, [[false, 'Off'], [true, 'On']], (v) => (s.invertY = v)),
          cycle('Graphics', () => (s.quality in QUALITY ? s.quality : defaultQuality()), (Object.keys(QUALITY) as Quality[]).map((k) => [k, QUALITY[k].name] as [string, string]), (v) => (s.quality = v)),
          cycle('When your officer falls', () => s.fightOn, [[true, 'Fight on as another'], [false, 'The battle is lost']], (v) => (s.fightOn = v)),
          cycle('Default difficulty', () => s.difficulty, Object.entries(DIFFICULTY).map(([k, v]) => [k, v.name] as [string, string]), (v) => (s.difficulty = v)),
        ),
        h('p.keys', { html: '<b>Keyboard</b> WASD move · Mouse or arrows look · LMB / J light · RMB / K heavy · Space jump · Shift dodge · Q guard · F Ougi · R Shura · Tab lock-on · E mount · 1–4 stratagems · M map · Esc pause<br><b>Gamepad</b> Stick move · X light · Y heavy · A jump · B Ougi · RB dodge · LB guard · Triggers Shura · R3 lock-on · D-pad stratagems' }),
        h(
          'div.row2',
          {},
          this.btn('Done', done, 'go'),
          this.btn('Rebind Controls', () => this.rebind(() => this.settings(back))),
          this.btn('Erase All Progress', () => {
            if (confirm('Erase all officer levels, records and your Empire campaign?')) {
              resetProfile();
              this.host.applySettings();
              back();
            }
          }),
        ),
      ),
      done,
    );
  }

  rebind(back: () => void) {
    const inp = this.host.input;
    const names: [string, string][] = [['light', 'Light attack'], ['heavy', 'Heavy attack'], ['jump', 'Jump'], ['dodge', 'Dodge'], ['guard', 'Guard'], ['super', 'Ougi'], ['rage', 'Shura'], ['lock', 'Lock-on'], ['mount', 'Mount horse'], ['map', 'Battlefield map'], ['strat1', 'Stratagem: Fire Arrows'], ['strat2', 'Stratagem: War Drums'], ['strat3', 'Stratagem: Reinforcements'], ['strat4', 'Stratagem: Sabotage'], ['pause', 'Pause']];
    const nice = (c: string) => c.replace('Key', '').replace('Mouse0', 'Left Mouse').replace('Mouse2', 'Right Mouse').replace('Mouse1', 'Middle Mouse').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Right Shift');
    const rows = names.map(([a, label]) => {
      const b = this.btn(`${label}: ${inp.keys[a as keyof typeof inp.keys].map(nice).join(' / ')}`, () => {
        b.querySelector('span')!.textContent = `${label}: press a key or mouse button…`;
        const done = (code: string) => {
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('mousedown', onMouse, true);
          if (code !== 'Escape') inp.rebind(a as keyof typeof inp.keys, [code]);
          this.rebind(back);
        };
        const onKey = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopPropagation();
          done(e.code);
        };
        const onMouse = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          done('Mouse' + e.button);
        };
        setTimeout(() => {
          window.addEventListener('keydown', onKey, true);
          window.addEventListener('mousedown', onMouse, true);
        }, 150);
      }, 'mini');
      return b;
    });
    this.mount(h('div.pause.wide', {}, h('h2', {}, 'Controls'), h('div.slist', {}, rows), h('p.keys', {}, 'Movement is always WASD or the left stick; the camera is the mouse, the arrow keys or the right stick.'), h('div.row2', {}, this.btn('Done', back, 'go'), this.btn('Restore Defaults', () => {
      inp.resetKeys();
      this.rebind(back);
    }))), back);
  }

  // ------------------------------------------------------------ gallery
  gallery() {
    this.pickOfficer(
      'Gallery',
      (id) => this.moves(id, () => this.gallery()),
      () => this.menu(),
    );
    const rec = h('div.galleryNote', {}, 'Enter on an officer shows their move list.');
    this.cur?.querySelector('header')?.append(rec);
  }
}
