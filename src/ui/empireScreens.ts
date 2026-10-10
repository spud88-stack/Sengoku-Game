import type { Audio } from '../core/audio';
import { levelOf, profile, saveProfile } from '../core/save';
import { PROVINCES, SCENARIOS, STRATAGEMS } from '../data/empire';
import { WEAPONS as WEAPON_LIST } from '../data/weapons';
import { CLANS } from '../data/officers';
import { DIFFICULTY } from '../data/tuning';
import * as E from '../sim/empire';
import type { EmpireState, Engagement, EOfficer } from '../sim/empire';
import type { Personality, WeaponKind } from '../sim/types';
import type { BattleDef, World } from '../sim/world';
import { h, type BattleResult, type Shell } from './screens';

export interface EmpireCtx {
  shell: Shell;
  ui: HTMLElement;
  audio: Audio;
  portraits: Record<string, string>;
  runBattle(def: BattleDef, difficulty: string, officerId: string, done: (r: BattleResult, w: World) => void): void;
  transition(fn: () => void): void;
  attract(): void;
  pauseView(): void;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
// the map canvas shows only the part of the 1000 x 620 layout that has land in it
const MW = 810,
  MH = 450,
  OX = 55,
  OY = 130;
const WEAPONS: [WeaponKind, string][] = WEAPON_LIST.map((w) => [w.id, w.name]);
const TEMPERS: [Personality, string][] = [
  ['honorable', 'Honourable'],
  ['reckless', 'Reckless'],
  ['patient', 'Patient'],
  ['cunning', 'Cunning'],
];
const COLORS = [0x8a1f5a, 0x1f6a8a, 0x8a6a1f, 0x3a8a3a, 0x5a3a8a, 0x8a3a1f, 0x2a2a2a, 0xb8b8c8];

export function openEmpire(ctx: EmpireCtx) {
  new EmpireUI(ctx).entry();
}

class EmpireUI {
  s!: EmpireState;
  sel = 0;
  private cv!: HTMLCanvasElement;
  private panel!: HTMLElement;
  private top!: HTMLElement;
  private logEl!: HTMLElement;
  private flashMsg = '';

  constructor(private ctx: EmpireCtx) {}
  private get sh() {
    return this.ctx.shell;
  }
  private btn(label: string, fn: () => void, cls = '', sub = '') {
    return this.sh.btn(label, fn, cls, sub);
  }
  private save() {
    profile.empire = this.s;
    saveProfile();
  }

  // ------------------------------------------------------------ entry and setup
  entry() {
    const has = !!profile.empire;
    this.sh.mount(
      h(
        'div.menu',
        {},
        h('div.brand', {}, h('span.kanji', {}, '天下'), h('h2', {}, 'Empire Mode')),
        h(
          'div.list',
          {},
          has &&
            this.btn(
              'Continue Campaign',
              () => {
                this.s = profile.empire as EmpireState;
                this.map();
              },
              'big',
              (() => {
                const s = profile.empire as EmpireState;
                return `${E.clanInfo(s, s.player).name} · ${E.SEASONS[s.season]} ${s.year} · ${E.owned(s, s.player).length} provinces`;
              })(),
            ),
          this.btn('New Campaign', () => this.pickScenario(), 'big', has ? 'Replaces your current campaign' : 'Choose an era and a clan'),
          this.btn('Back', () => this.sh.menu()),
        ),
        h('div.stats', {}, profile.empireWins.length ? `Realms unified: ${profile.empireWins.join(', ')}` : 'Unify all thirty-one provinces, by the sword or by sworn alliance.'),
      ),
      () => this.sh.menu(),
    );
  }

  private pickScenario() {
    this.sh.mount(
      h(
        'div.menu',
        {},
        h('div.brand', {}, h('span.kanji', {}, '乱世'), h('h2', {}, 'Choose an Era')),
        h('div.list.wide', {}, SCENARIOS.map((sc) => this.btn(`${sc.year} · ${sc.name}`, () => this.pickClan(sc.id), 'big', sc.blurb)), this.btn('Back', () => this.entry())),
      ),
      () => this.entry(),
    );
  }

  private pickClan(scId: string) {
    const sc = SCENARIOS.find((x) => x.id === scId)!;
    const preview = E.newCampaign(scId, Object.keys(sc.holdings)[0], 'normal', 1);
    const cv = h('canvas.emap', { width: MW, height: MH }) as HTMLCanvasElement;
    const info = h('div.claninfo');
    let diff = profile.settings.difficulty;
    const diffs = Object.keys(DIFFICULTY);
    const show = (clan: string) => {
      const c = E.clanInfo(preview, clan);
      const house = E.officersOf(preview, clan).sort((a, b) => (b.id === preview.clans[clan].ruler ? 1 : 0) - (a.id === preview.clans[clan].ruler ? 1 : 0));
      info.replaceChildren(
        h('h3', { style: { borderColor: hex(c.color) } }, h('span.mon', { style: { background: hex(c.color) } }, c.mon), `${c.name} clan`),
        h('p', {}, `${sc.holdings[clan].join(', ')} · ${Math.round(E.strength(preview, clan))} strength`),
        h('div.house', {}, house.map((o) => h('div', {}, this.ctx.portraits[o.id] ? h('img', { src: this.ctx.portraits[o.id] }) : h('i', {}), h('span', {}, o.def.name)))),
      );
      this.drawMap(cv, preview, -1, clan);
    };
    const start = (clan: string) => {
      this.s = E.newCampaign(scId, clan, diff, (Math.random() * 1e9) | 0);
      this.sel = E.owned(this.s, this.s.player)[0];
      this.save();
      this.ctx.audio.taiko(0.9);
      this.map();
    };
    const diffBtn = this.btn(`Difficulty: ${DIFFICULTY[diff].name}`, () => {
      diff = diffs[(diffs.indexOf(diff) + 1) % diffs.length];
      diffBtn.querySelector('span')!.textContent = `Difficulty: ${DIFFICULTY[diff].name}`;
    });
    const rows = Object.keys(sc.holdings).map((clan) => {
      const c = CLANS[clan];
      const b = h(
        'button.nav.row',
        {
          on: {
            focus: () => show(clan),
            mouseenter: (e: Event) => (e.currentTarget as HTMLElement).focus({ preventScroll: true }),
            click: () => start(clan),
          },
        },
        h('b', {}, h('span.dot', { style: { background: hex(c.color) } }), c.name),
        h('small', {}, `${preview.officers[preview.clans[clan].ruler].def.name} · ${sc.holdings[clan].length} province${sc.holdings[clan].length > 1 ? 's' : ''}`),
      );
      return b;
    });
    show(Object.keys(sc.holdings)[0]);
    this.sh.mount(
      h(
        'div.select',
        {},
        h('header', {}, h('h2', {}, `${sc.year} · ${sc.name}`), h('span.hint', {}, 'Choose the clan you will lead')),
        h('div.cols', {}, h('div.blist.scroll', {}, rows, h('div.opts', {}, diffBtn, this.btn('Raise Your Own Banner', () => this.custom(scId, diff), '', 'Start as an upstart lord with one province'))), h('div.mapcol', {}, cv, info)),
      ),
      () => this.pickScenario(),
    );
  }

  private custom(scId: string, diff: string) {
    const preview = E.newCampaign(scId, Object.keys(SCENARIOS.find((x) => x.id === scId)!.holdings)[0], 'normal', 1);
    const free = PROVINCES.filter((_, i) => !preview.provinces[i].owner).map((p) => p.name);
    const st = { name: 'Kurogane Ren', clanName: 'Kurogane', weapon: 0, temper: 0, color: 0, prov: 0 };
    const cyc = (label: () => string, next: () => void) => {
      const b = this.btn(label(), () => {
        next();
        b.querySelector('span')!.textContent = label();
        b.style.borderColor = hex(COLORS[st.color]);
      });
      return b;
    };
    const field = (label: string, key: 'name' | 'clanName') => h('label.srow', {}, h('span', {}, label), h('input.nav.text', { type: 'text', maxlength: 22, value: st[key], on: { input: (e: Event) => (st[key] = (e.target as HTMLInputElement).value) } }));
    this.sh.mount(
      h(
        'div.pause.wide',
        {},
        h('h2', {}, 'Raise Your Own Banner'),
        h(
          'div.slist',
          {},
          field('Your name', 'name'),
          field('Clan name', 'clanName'),
          cyc(() => `Weapon: ${WEAPONS[st.weapon][1]}`, () => (st.weapon = (st.weapon + 1) % WEAPONS.length)),
          cyc(() => `Temperament: ${TEMPERS[st.temper][1]}`, () => (st.temper = (st.temper + 1) % TEMPERS.length)),
          cyc(() => `Banner colour: ${st.color + 1} of ${COLORS.length}`, () => (st.color = (st.color + 1) % COLORS.length)),
          cyc(() => `Home province: ${free[st.prov]}`, () => (st.prov = (st.prov + 1) % free.length)),
        ),
        h('p.keys', {}, 'You begin with one province, seven hundred men and a single wandering swordsman who believes in you.'),
        h(
          'div.row2',
          {},
          this.btn(
            'Begin',
            () => {
              this.s = E.newCampaign(scId, 'custom', diff, (Math.random() * 1e9) | 0, { name: st.name.trim() || 'Nameless', clanName: st.clanName.trim() || 'Upstart', weapon: WEAPONS[st.weapon][0], personality: TEMPERS[st.temper][0], color: COLORS[st.color], province: free[st.prov] });
              this.sel = E.owned(this.s, this.s.player)[0];
              this.save();
              this.map();
            },
            'go',
          ),
          this.btn('Back', () => this.pickClan(scId)),
        ),
      ),
      () => this.pickClan(scId),
    );
  }

  // ------------------------------------------------------------ the map
  private drawMap(cv: HTMLCanvasElement, s: EmpireState, sel: number, highlightClan: string | null = null) {
    const g = cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, -OX, -OY);
    g.clearRect(0, 0, 1000, 620);
    g.fillStyle = '#141a26';
    g.fillRect(0, 0, 1000, 620);
    // sea texture
    g.strokeStyle = '#ffffff0a';
    g.lineWidth = 1;
    for (let y = 20; y < 620; y += 22) {
      g.beginPath();
      for (let x = 0; x <= 1000; x += 20) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 4);
      g.stroke();
    }
    // landmass: overlapping discs read as a coastline
    g.fillStyle = '#3a3a30';
    for (const p of PROVINCES) {
      g.beginPath();
      g.arc(p.x, p.y, 50, 0, 6.28);
      g.fill();
    }
    g.fillStyle = '#4a4a3c';
    for (const p of PROVINCES) {
      g.beginPath();
      g.arc(p.x, p.y, 44, 0, 6.28);
      g.fill();
    }
    PROVINCES.forEach((p, i) => {
      const c = E.clanInfo(s, s.provinces[i].owner);
      g.globalAlpha = s.provinces[i].owner ? (highlightClan && s.provinces[i].owner !== highlightClan ? 0.35 : 0.85) : 0.25;
      g.fillStyle = hex(c.color);
      g.beginPath();
      g.arc(p.x, p.y, 36, 0, 6.28);
      g.fill();
    });
    g.globalAlpha = 1;
    // roads
    g.strokeStyle = '#d9c9a855';
    g.lineWidth = 2;
    g.setLineDash([5, 5]);
    E.ADJ.forEach((list, i) =>
      list.forEach((j) => {
        if (j < i) return;
        g.beginPath();
        g.moveTo(PROVINCES[i].x, PROVINCES[i].y);
        g.lineTo(PROVINCES[j].x, PROVINCES[j].y);
        g.stroke();
      }),
    );
    g.setLineDash([]);
    g.textAlign = 'center';
    PROVINCES.forEach((p, i) => {
      const pr = s.provinces[i];
      const c = E.clanInfo(s, pr.owner);
      const canHit = sel >= 0 && pr.owner !== s.player && E.canAttack(s, s.player, i);
      g.fillStyle = hex(c.color);
      g.strokeStyle = i === sel ? '#fff3b0' : canHit ? '#ff6a55' : '#000';
      g.lineWidth = i === sel ? 4 : canHit ? 2.5 : 1.5;
      g.beginPath();
      g.arc(p.x, p.y, 17, 0, 6.28);
      g.fill();
      g.stroke();
      g.fillStyle = '#fff';
      g.font = '700 15px "Hiragino Mincho ProN", serif';
      g.fillText(c.mon, p.x, p.y + 5);
      g.font = '12px Georgia, serif';
      g.lineWidth = 3;
      g.strokeStyle = '#000c';
      g.strokeText(p.name, p.x, p.y + 33);
      g.fillStyle = '#efe6d2';
      g.fillText(p.name, p.x, p.y + 33);
      if (sel >= 0) {
        g.font = '11px ui-monospace, monospace';
        g.strokeText(String(pr.troops), p.x, p.y - 23);
        g.fillStyle = pr.owner === s.player ? '#fff3b0' : '#cfc4aa';
        g.fillText(String(pr.troops), p.x, p.y - 23);
        // officers present
        const n = E.officersAt(s, i, pr.owner).length;
        for (let k = 0; k < Math.min(n, 6); k++) {
          g.fillStyle = '#fff';
          g.fillRect(p.x - n * 3 + k * 6, p.y - 21, 4, 4);
        }
      }
    });
  }

  private note(msg: string) {
    this.flashMsg = msg;
    this.refresh();
  }
  private act(c: E.Cmd) {
    this.ctx.audio.ui(c.ok ? 'ok' : 'back');
    this.save();
    this.note(c.msg);
  }

  map() {
    const s = this.s;
    if (s.over) return this.ending();
    this.cv = h('canvas.emap.nav', { width: MW, height: MH, tabindex: 0, 'data-grab': 1 }) as HTMLCanvasElement;
    this.panel = h('div.epanel');
    this.top = h('div.etop');
    this.logEl = h('div.elog');
    const pick = (e: MouseEvent) => {
      const r = this.cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * MW + OX,
        y = ((e.clientY - r.top) / r.height) * MH + OY;
      let best = -1,
        bd = 40 * 40;
      PROVINCES.forEach((p, i) => {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0) {
        this.sel = best;
        this.flashMsg = '';
        this.ctx.audio.ui('move');
        this.refresh();
      }
    };
    this.cv.addEventListener('click', pick);
    this.cv.addEventListener('keydown', (e) => {
      const d: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const v = d[e.code];
      if (v) {
        e.preventDefault();
        const a = PROVINCES[this.sel];
        let best = -1,
          bs = Infinity;
        PROVINCES.forEach((p, i) => {
          const dx = p.x - a.x,
            dy = p.y - a.y;
          const along = dx * v[0] + dy * v[1];
          if (i === this.sel || along < 8) return;
          const sc = along + Math.abs(dx * v[1] + dy * v[0]) * 2;
          if (sc < bs) {
            bs = sc;
            best = i;
          }
        });
        if (best >= 0) {
          this.sel = best;
          this.flashMsg = '';
          this.refresh();
        }
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        (this.panel.querySelector('.nav') as HTMLElement | null)?.focus();
      }
    });
    this.sh.mount(h('div.empire', {}, this.top, h('div.ebody', {}, h('div.emapwrap', {}, this.cv, this.logEl), this.panel)), () => this.leave());
    this.refresh();
    this.cv.focus({ preventScroll: true });
    // anything left over from a previous sitting
    this.afterSeason();
  }

  private leave() {
    this.save();
    this.sh.menu();
  }

  private refresh() {
    const s = this.s;
    const me = s.clans[s.player];
    const ci = E.clanInfo(s, s.player);
    const inc = E.income(s, s.player);
    this.drawMap(this.cv, s, this.sel);
    this.top.replaceChildren(
      h('div.who', {}, h('span.mon', { style: { background: hex(ci.color) } }, ci.mon), h('b', {}, `${ci.name}`), h('small', {}, `${E.SEASONS[s.season]} ${s.year}`)),
      h('div.res', {}, h('span', {}, `Gold ${me.gold}`, h('small', {}, ` +${inc.gold}`)), h('span', {}, `Rice ${me.rice}`, h('small', {}, ` −${inc.upkeep}/season · harvest ${inc.harvest}`)), h('span', {}, `Fame ${Math.round(me.fame)}`), h('span.acts', {}, `Commands ${'●'.repeat(s.actions)}${'○'.repeat(Math.max(0, E.maxActions(s) - s.actions))}`)),
      h('div.tbtns', {}, this.btn('Officers', () => this.officers(), 'mini'), this.btn('Diplomacy', () => this.diplomacy(), 'mini'), this.btn('End Season', () => this.endSeason(), 'mini.go'), this.btn('Save & Exit', () => this.leave(), 'mini')),
    );
    this.logEl.replaceChildren(...s.log.slice(-5).map((l) => h('div.' + l.kind, {}, l.text)));
    this.panel.replaceChildren(...this.provincePanel(this.sel));
  }

  private pips(n: number) {
    return '◆'.repeat(n) + '◇'.repeat(5 - n);
  }

  private provincePanel(i: number): HTMLElement[] {
    const s = this.s,
      p = s.provinces[i],
      def = PROVINCES[i];
    const ci = E.clanInfo(s, p.owner);
    const mine = p.owner === s.player;
    const here = E.officersAt(s, i, p.owner);
    const out: HTMLElement[] = [
      h('h3', { style: { borderColor: hex(ci.color) } }, def.name, h('small', {}, p.owner ? `${ci.name} clan` : 'Independent lords')),
      h('div.pstats', {}, h('div', {}, `Troops `, h('b', {}, String(p.troops))), h('div', {}, `Markets ${this.pips(p.dev)}`), h('div', {}, `Farms ${this.pips(p.farm)}`), h('div', {}, `Walls ${this.pips(p.fort)}`), h('div', {}, `Yields ${Math.round(def.gold * (1 + 0.3 * p.dev))} gold · ${Math.round(def.rice * (1 + 0.3 * p.farm) * 4)} rice`)),
      h('div.here', {}, here.length ? here.map((o) => h('span', { title: `Loyalty ${Math.round(o.loyalty)}` }, `${o.def.name} · Lv ${levelOf(o.xp).level}`)) : h('em', {}, p.owner ? 'No officers stationed here' : 'Held by local captains')),
    ];
    if (this.flashMsg) out.push(h('p.flash-msg', {}, this.flashMsg));
    const cmds = h('div.cmds');
    if (mine) {
      cmds.append(
        this.btn(`Expand markets`, () => this.act(E.improve(s, i, 'dev')), 'mini', `${E.COST.develop(p)} gold`),
        this.btn(`Cut new paddies`, () => this.act(E.improve(s, i, 'farm')), 'mini', `${E.COST.cultivate(p)} gold`),
        this.btn(`Raise the walls`, () => this.act(E.improve(s, i, 'fort')), 'mini', `${E.COST.fortify(p)} gold`),
        this.btn(`Levy 300 men`, () => this.act(E.recruit(s, i, 3)), 'mini', `${E.COST.recruitGold * 3} gold · ${E.COST.recruitRice * 3} rice`),
        this.btn(`Search for talent`, () => this.act(E.search(s, i)), 'mini', `${E.COST.search} gold`),
      );
      if (E.ADJ[i].some((j) => s.provinces[j].owner === s.player)) cmds.append(this.btn('March…', () => this.marchDialog(i), 'mini', 'Move men and officers to a neighbouring province'));
    } else if (E.canAttack(s, s.player, i)) {
      cmds.append(this.btn('Invade…', () => this.invadeDialog(i), 'mini.go', 'Plan the attack'));
    } else if (p.owner && E.rel(s, s.player, p.owner).status !== 'neutral') {
      cmds.append(h('p.note', {}, `You have ${E.rel(s, s.player, p.owner).status === 'ally' ? 'an alliance' : 'a truce'} with the ${ci.name}.`));
    } else if (!mine) cmds.append(h('p.note', {}, 'Not adjacent to your lands.'));
    if (p.owner && !mine) {
      for (const o of here) if (o.id !== s.clans[p.owner].ruler) cmds.append(this.btn(`Suborn ${o.def.name}`, () => this.act(E.plot(s, o.id)), 'mini', `${E.COST.plot} gold · loyalty ${o.loyalty < 40 ? 'wavering' : o.loyalty < 65 ? 'uncertain' : 'firm'}`));
    }
    out.push(cmds);
    return out;
  }

  // ------------------------------------------------------------ dialogs
  private modal(title: string, body: (HTMLElement | string | null | false)[], buttons: HTMLElement[], back: (() => void) | null = null) {
    this.sh.mount(h('div.pause.wide', {}, h('h2', {}, title), h('div.mbody', {}, body), h('div.row2', {}, buttons)), back);
  }

  private marchDialog(from: number) {
    const s = this.s;
    const dests = E.ADJ[from].filter((j) => s.provinces[j].owner === s.player);
    let to = dests[0];
    let troops = Math.floor(s.provinces[from].troops / 200) * 100;
    const chosen = new Set<string>();
    const here = E.officersAt(s, from, s.player);
    const troopLbl = h('b', {}, String(troops));
    this.modal(
      `March from ${PROVINCES[from].name}`,
      [
        h('div.cmds.row', {}, dests.map((j) => this.btn(PROVINCES[j].name, () => (to = j), 'mini'))),
        h('label.srow', {}, h('span', {}, 'Men to send ', troopLbl), h('input.nav', { type: 'range', min: 0, max: s.provinces[from].troops, step: 50, value: troops, on: { input: (e: Event) => (troopLbl.textContent = String((troops = Number((e.target as HTMLInputElement).value)))) } })),
        h('div.checks', {}, here.map((o) => this.check(o.def.name, false, (on) => (on ? chosen.add(o.id) : chosen.delete(o.id))))),
      ],
      [
        this.btn(
          'March',
          () => {
            const r = E.march(s, from, to, troops, [...chosen]);
            this.map();
            this.act(r);
          },
          'go',
        ),
        this.btn('Cancel', () => this.map()),
      ],
      () => this.map(),
    );
  }

  private check(label: string, on: boolean, fn: (on: boolean) => void) {
    const b = h('button.nav.check' + (on ? '.on' : ''), { on: { click: () => fn(b.classList.toggle('on')) } }, label);
    return b;
  }

  private invadeDialog(target: number) {
    const s = this.s;
    const sources = E.ADJ[target].filter((j) => s.provinces[j].owner === s.player);
    let from = sources.sort((a, b) => s.provinces[b].troops - s.provinces[a].troops)[0];
    let strat = 'none';
    const render = () => {
      const here = E.officersAt(s, from, s.player).sort((a, b) => E.power(b) - E.power(a));
      const chosen = new Set(here.slice(0, 5).map((o) => o.id));
      let troops = Math.floor((s.provinces[from].troops * 0.8) / 50) * 50;
      const lbl = h('b', {}, String(troops));
      const tp = s.provinces[target];
      const defs = E.officersAt(s, target, tp.owner);
      const eng = () => E.plan(s, s.player, from, target, [...chosen], troops, strat);
      const go = (fight: boolean) => {
        if (troops < 100) return this.note('You need at least a hundred men.');
        const e = eng();
        const r = E.launch(s, e);
        if (!r.ok) {
          this.map();
          return this.act(r);
        }
        this.save();
        if (fight) this.fight(e);
        else this.resolve(e, E.autoResolve(s, e), null);
      };
      this.modal(
        `Invade ${PROVINCES[target].name}`,
        [
          h('p', {}, `${E.clanInfo(s, tp.owner).name}: ${tp.troops} men behind level-${tp.fort} walls${defs.length ? ', led by ' + defs.map((o) => o.def.name).join(', ') : ''}.`),
          sources.length > 1 &&
            h(
              'div.cmds.row',
              {},
              sources.map((j) =>
                this.btn(
                  `From ${PROVINCES[j].name} (${s.provinces[j].troops})`,
                  () => {
                    from = j;
                    render();
                  },
                  j === from ? 'mini.go' : 'mini',
                ),
              ),
            ),
          h('label.srow', {}, h('span', {}, 'Men to commit ', lbl), h('input.nav', { type: 'range', min: 100, max: s.provinces[from].troops, step: 50, value: troops, on: { input: (e: Event) => (lbl.textContent = String((troops = Number((e.target as HTMLInputElement).value)))) } })),
          h('div.checks', {}, here.length ? here.map((o) => this.check(`${o.def.name} · Lv ${levelOf(o.xp).level}`, chosen.has(o.id), (on) => (on ? chosen.add(o.id) : chosen.delete(o.id)))) : h('em', {}, 'No officers here: a vanguard captain will lead.')),
          h(
            'div.cmds',
            {},
            Object.entries(STRATAGEMS).map(([k, v]) =>
              this.btn(
                v.name,
                () => {
                  strat = k;
                  render();
                },
                k === strat ? 'mini.go' : 'mini',
                `${v.cost ? v.cost + ' gold · ' : ''}${v.desc}`,
              ),
            ),
          ),
        ],
        [this.btn('Lead the Attack', () => go(true), 'go'), this.btn('Delegate to Your Generals', () => go(false)), this.btn('Cancel', () => this.map())],
        () => this.map(),
      );
    };
    render();
  }

  /** Play an engagement as a real battle. */
  private fight(e: Engagement) {
    const s = this.s;
    const myIds = e.attacker === s.player ? e.atkOfficers : e.defOfficers;
    const ruler = s.clans[s.player].ruler;
    const choose = (id: string) => {
      const def = E.engagementBattle(s, e, id);
      const pTeam = e.attacker === s.player ? 0 : 1;
      const played = def.officers.find((o) => o.player)!.def.id;
      this.ctx.transition(() =>
        this.ctx.runBattle(def, s.difficulty, played, (r, w) => {
          this.ctx.pauseView();
          const quit = r.reason.startsWith('You withdrew');
          this.resolve(e, E.outcomeOf(e, w, quit, pTeam), r, played);
        }),
      );
    };
    if (myIds.length <= 1) return choose(myIds[0] ?? '');
    this.modal(
      'Who Will You Fight As?',
      [h('div.cmds', {}, myIds.map((id) => this.btn(`${s.officers[id].def.name}${id === ruler ? ' (your lord)' : ''}`, () => choose(id), 'mini', `Level ${levelOf(s.officers[id].xp).level} · ${s.officers[id].def.weapon}`)))],
      [],
    );
  }

  private resolve(e: Engagement, out: E.Outcome, r: BattleResult | null, played = '') {
    const s = this.s;
    const lines = E.applyOutcome(s, e, out);
    E.checkVictory(s);
    this.save();
    const won = (out.attackerWon ? e.attacker : e.defender) === s.player;
    const summary = h('div.mbody', {}, lines.map((l) => h('p', {}, l)), h('p', {}, `Your army: ${e.attacker === s.player ? out.atkLeft : out.defLeft} of ${e.attacker === s.player ? e.atkTroops : e.defTroops} men remain.`));
    const next = () => this.ctx.transition(() => {
        this.ctx.attract();
        this.judgeNext();
      });
    if (r) {
      this.sh.results({ ...r, won }, { officer: played, battle: 'empire', difficulty: s.difficulty }, next, summary);
    } else {
      this.ctx.audio[won ? 'chime' : 'taiko'](won ? 2 : 0.9);
      this.modal(won ? 'Victory' : 'Defeat', [summary], [this.btn('Continue', () => this.judgeNext(), 'go')]);
    }
  }

  private judgeNext(): void {
    const s = this.s;
    const id = s.captives[0];
    if (!id) return this.afterSeason(true);
    const o = s.officers[id];
    const asked = new Set<string>((this as any)._asked ?? []);
    const verdict = (v: 'recruit' | 'release' | 'execute') => {
      const msg = E.judge(s, id, v);
      if (v === 'recruit') asked.add(id);
      (this as any)._asked = [...asked];
      this.save();
      this.modal('Judgement', [h('p', {}, msg)], [this.btn('Continue', () => this.judgeNext(), 'go')]);
    };
    this.modal(
      'A Prisoner Is Brought Before You',
      [
        h('div.captive', {}, this.ctx.portraits[id] ? h('img', { src: this.ctx.portraits[id] }) : null, h('div', {}, h('h3', {}, o.def.name), h('p', {}, `${o.def.title} · formerly of the ${E.clanInfo(s, o.clan).name} · Level ${levelOf(o.xp).level}`), h('p', {}, o.def.lines?.lose ? `“${o.def.lines.lose}”` : 'They kneel in silence.'))),
      ],
      [!asked.has(id) ? this.btn('Offer a Place', () => verdict('recruit'), 'go', 'They may refuse') : null, this.btn('Release', () => verdict('release'), '', 'Fame rises'), this.btn('Execute', () => verdict('execute'), '', 'Fame falls; retainers remember')].filter(Boolean) as HTMLElement[],
    );
  }

  // ------------------------------------------------------------ season turnover
  private endSeason() {
    E.endSeason(this.s);
    this.ctx.audio.taiko(0.7);
    this.save();
    this.afterSeason(true);
  }

  /** Work through whatever the turn left on the table: offers, attacks on us, captives, the ending. */
  private afterSeason(remount = false): void {
    const s = this.s;
    if (s.captives.length) return this.judgeNext();
    const offer = s.offers[0];
    if (offer) {
      const c = E.clanInfo(s, offer.from);
      const ans = (yes: boolean) => {
        E.answerOffer(s, offer, yes);
        this.save();
        this.afterSeason(true);
      };
      return this.modal(`An Envoy from the ${c.name}`, [h('p', {}, offer.kind === 'ally' ? `“Our houses share enemies. Let us share a banner.” The ${c.name} propose an alliance.` : `“There is no profit in this quarrel.” The ${c.name} propose a two-year truce.`)], [this.btn('Accept', () => ans(true), 'go'), this.btn('Refuse', () => ans(false))]);
    }
    const e = s.pending.shift();
    if (e) {
      this.save();
      // the province may already have changed hands this season
      if (s.provinces[e.province].owner !== s.player) {
        s.provinces[e.from].troops += e.atkTroops;
        return this.afterSeason(true);
      }
      e.defOfficers = E.officersAt(s, e.province, s.player)
        .sort((a, b) => E.power(b) - E.power(a))
        .slice(0, 5)
        .map((o) => o.id);
      e.defTroops = s.provinces[e.province].troops;
      const A = E.clanInfo(s, e.attacker);
      return this.modal(
        `${PROVINCES[e.province].name} Is Under Attack`,
        [
          h('p', {}, `${A.name} have crossed the border with ${e.atkTroops} men${e.atkOfficers.length ? ', led by ' + e.atkOfficers.map((id) => s.officers[id].def.name).join(', ') : ''}.`),
          h('p', {}, `Your garrison: ${e.defTroops} men${e.defOfficers.length ? ' under ' + e.defOfficers.map((id) => s.officers[id].def.name).join(', ') : ' and no officers'}.`),
          e.atkStratagem !== 'none' && h('p.twist', {}, `Scouts warn of a stratagem: ${STRATAGEMS[e.atkStratagem].name}.`),
        ],
        [this.btn('Take the Field', () => this.fight(e), 'go'), this.btn('Trust the Garrison', () => this.resolve(e, E.autoResolve(s, e), null))],
      );
    }
    if (s.over) return this.ending();
    if (remount) this.map();
  }

  private ending() {
    const s = this.s;
    const o = s.over!;
    const name = E.clanInfo(s, s.player).name;
    if (o.won && !profile.empireWins.includes(`${name} ${s.year}`)) profile.empireWins.push(`${name} ${s.year}`);
    profile.empire = null;
    saveProfile();
    this.ctx.audio[o.won ? 'chime' : 'taiko'](o.won ? 4 : 1);
    const st = s.stats;
    this.sh.mount(
      h(
        'div.results' + (o.won ? '.won' : '.lost'),
        {},
        h('div.banner', {}, h('span.kanji', {}, o.won ? '天下統一' : '滅亡'), h('h2', {}, o.title), h('p.endtext', {}, o.text)),
        h('div.rstats', {}, h('div.rrow', {}, h('span', {}, 'Battles won / lost'), h('b', {}, `${st.battlesWon} / ${st.battlesLost}`)), h('div.rrow', {}, h('span', {}, 'Left to your generals'), h('b', {}, String(st.auto))), h('div.rrow', {}, h('span', {}, 'Pacts sworn / broken'), h('b', {}, `${st.pacts} / ${st.betrayals}`)), h('div.rrow', {}, h('span', {}, 'Recruited / released / executed'), h('b', {}, `${st.recruited} / ${st.released} / ${st.executed}`))),
        this.btn('Return to the Main Menu', () => this.sh.menu(), 'go'),
      ),
    );
  }

  // ------------------------------------------------------------ officers and diplomacy
  private officers() {
    const s = this.s;
    const mine = E.officersOf(s, s.player).sort((a, b) => E.power(b) - E.power(a));
    const free = Object.values(s.officers).filter((o) => !o.clan && o.known && !o.dead && !o.captive);
    const row = (o: EOfficer, action: HTMLElement | null) =>
      h('div.orow', {}, this.ctx.portraits[o.id] ? h('img', { src: this.ctx.portraits[o.id] }) : h('i', { style: { background: hex(o.def.primary) } }), h('div', {}, h('b', {}, o.def.name), h('small', {}, `${o.def.weapon} · ${o.def.personality} · Lv ${levelOf(o.xp).level} · ${PROVINCES[o.loc].name}`)), o.clan ? h('div.loy', {}, h('i', { style: { width: `${o.loyalty}%`, background: o.loyalty < 35 ? '#b3261e' : o.loyalty < 60 ? '#d9b23a' : '#6fbf73' } })) : h('div'), action ?? h('div'));
    const again = () => this.officers();
    this.sh.mount(
      h(
        'div.select',
        {},
        h('header', {}, h('h2', {}, 'Officers'), h('span.hint', {}, `Gold ${s.clans[s.player].gold} · Commands left ${s.actions}`)),
        h(
          'div.olist',
          {},
          h('h4', {}, 'In your service'),
          mine.map((o) =>
            row(
              o,
              o.id === s.clans[s.player].ruler
                ? h('em', {}, 'Your lord')
                : this.btn(
                    'Reward',
                    () => {
                      const r = E.reward(s, o.id);
                      this.ctx.audio.ui(r.ok ? 'ok' : 'back');
                      this.save();
                      again();
                    },
                    'mini',
                    `${E.COST.reward} gold`,
                  ),
            ),
          ),
          h('h4', {}, 'Masterless officers you know of'),
          free.length
            ? free.map((o) =>
                row(
                  o,
                  this.btn(
                    'Hire',
                    () => {
                      const r = E.hire(s, o.id);
                      this.save();
                      this.map();
                      this.act(r);
                    },
                    'mini',
                    `${Math.round(150 + E.power(o) * 150)} gold`,
                  ),
                ),
              )
            : h('p.note', {}, 'None. Search your provinces for talent.'),
        ),
        this.btn('Back to the Map', () => this.map(), 'go'),
      ),
      () => this.map(),
    );
  }

  private diplomacy() {
    const s = this.s;
    const others = Object.values(s.clans).filter((c) => c.alive && c.id !== s.player);
    const again = (r: E.Cmd) => {
      this.ctx.audio.ui(r.ok ? 'ok' : 'back');
      this.save();
      this.diplomacy();
      const n = this.ctx.ui.querySelector('.select header .hint');
      if (n) n.textContent = r.msg;
    };
    this.sh.mount(
      h(
        'div.select',
        {},
        h('header', {}, h('h2', {}, 'Diplomacy'), h('span.hint', {}, `Gold ${s.clans[s.player].gold} · Commands left ${s.actions}`)),
        h(
          'div.olist',
          {},
          others.map((c) => {
            const ci = E.clanInfo(s, c.id);
            const r = E.rel(s, s.player, c.id);
            return h(
              'div.orow.dip',
              {},
              h('span.mon', { style: { background: hex(ci.color) } }, ci.mon),
              h('div', {}, h('b', {}, `${ci.name}`), h('small', {}, `${s.officers[c.ruler].def.name} · ${E.owned(s, c.id).length} provinces · strength ${Math.round(E.strength(s, c.id))}`)),
              h('div', {}, h('b', {}, r.status === 'ally' ? 'Allied' : r.status === 'truce' ? `Truce (${Math.max(0, r.until - s.turn)} seasons)` : 'No pact'), h('div.loy', {}, h('i', { style: { width: `${r.trust}%`, background: '#8fb7e6' } }))),
              h(
                'div.cmds.row',
                {},
                r.status === 'neutral' && this.btn('Truce', () => again(E.envoy(s, c.id, 'truce')), 'mini', `${E.COST.envoy}g`),
                r.status !== 'ally' && this.btn('Alliance', () => again(E.envoy(s, c.id, 'ally')), 'mini', `${E.COST.envoy}g`),
                this.btn('Gift', () => again(E.gift(s, c.id)), 'mini', '200g'),
                r.status !== 'neutral' && this.btn('Break pact', () => again(E.breakPact(s, c.id)), 'mini', 'Dishonour'),
              ),
            );
          }),
        ),
        this.btn('Back to the Map', () => this.map(), 'go'),
      ),
      () => this.map(),
    );
  }
}
