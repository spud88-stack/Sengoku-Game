import { TUNE } from '../data/tuning';
import { officerAI } from '../sim/ai';
import type { Fighter } from '../sim/fighter';
import type { World } from '../sim/world';

interface Step {
  title: string;
  text: string;
  setup?: (w: World, p: Fighter) => void;
  done: (w: World, p: Fighter, seen: Set<string>, t: number) => boolean;
}

/** A guided training-ground session. Each step waits until the player has actually done the thing. */
export class Tutorial {
  private el: HTMLElement;
  private i = -1;
  private t = 0;
  private seen = new Set<string>();
  private start = { x: 0, z: 0 };
  private hold = 0;
  private steps: Step[];

  constructor(
    private w: World,
    parent: HTMLElement,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'tutorial';
    parent.append(this.el);
    const foe = w.fighters.find((f) => !f.isPlayer)!;
    foe.x = 0;
    foe.z = 26;
    const end = (id: string) => [...this.seen].some((m) => m.endsWith(id));
    this.steps = [
      { title: 'Move', text: 'WASD or the left stick to move. Move the mouse (click the game first) or use the arrow keys to look around.', done: (_w, p) => Math.hypot(p.x - this.start.x, p.z - this.start.z) > 7 },
      { title: 'Light attacks', text: 'Left Mouse or J is your light attack. Walk into the soldiers and press it repeatedly for a full string.', done: () => end('_l4') },
      { title: 'Charge finishers', text: 'Pressing Heavy (Right Mouse or K) during a string changes the ending. Try Light, Light, Light, Heavy to clear everyone around you.', done: () => end('_c4') },
      { title: 'Launch', text: 'Light then Heavy sends enemies skyward. Press Jump (Space) right after it connects to chase them and keep cutting in the air.', done: () => end('_c2') },
      { title: 'Dodge', text: 'Shift dodges. You cannot be hit for a moment, and it cancels the end of most attacks. Dodge now.', done: () => this.seen.has('dodge') },
      { title: 'Guard and parry', text: 'Hold Q to guard attacks from the front. Guarding just before a blow lands parries it and stuns an officer. Hold guard for a second.', done: () => this.hold > 1 },
      { title: 'Ougi', text: 'Your gold gauge fills as you fight. It is full now: press F to unleash your Ougi. You cannot be hurt while it lasts.', setup: (_w, p) => (p.spirit = TUNE.spirit.max), done: () => end('_super') },
      { title: 'Your horse', text: 'Press E to mount. Ride straight through the troops to trample them, attack from the saddle, then press E again to dismount.', done: (_w, p) => this.seen.has('mounted') && !p.mounted },
      {
        title: 'The duel',
        text: 'An enemy officer is coming. Tab locks on. Officers guard, so open them with a lone Heavy (guard break), or parry them. Defeat him.',
        setup: (ww) => {
          foe.controller = officerAI;
          ww.say(foe, foe.def.lines?.enter ?? 'Come, then!');
        },
        done: () => foe.dead,
      },
    ];
    this.next();
  }

  private next() {
    this.i++;
    this.t = 0;
    this.hold = 0;
    const p = this.w.player!;
    this.start = { x: p.x, z: p.z };
    const s = this.steps[this.i];
    if (!s) {
      this.el.innerHTML = '<small>TUTORIAL COMPLETE</small><b>You are ready.</b>';
      return;
    }
    s.setup?.(this.w, p);
    this.el.innerHTML = `<small>TUTORIAL ${this.i + 1} / ${this.steps.length}</small><b>${s.title}</b><p>${s.text}</p>`;
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
  }

  update(dt: number) {
    const w = this.w,
      p = w.player!;
    const s = this.steps[this.i];
    if (!s) return;
    this.t += dt;
    if (p.move) this.seen.add(p.move.id);
    if (p.state === 'dodge') this.seen.add('dodge');
    if (p.mounted) this.seen.add('mounted');
    this.hold = p.state === 'guard' ? this.hold + dt : 0;
    // keep the training ground stocked, and the pupil alive until the final duel
    if (w.alive[1] < 7) for (let k = 0; k < 8; k++) w.spawn(1, p.x + Math.sin(k) * 14, p.z + 12 + Math.cos(k) * 6, k === 0 ? 4 : 0, false);
    if (this.i < this.steps.length - 1) p.hp = Math.max(p.hp, p.maxHp * 0.6);
    if (this.t > 0.6 && s.done(w, p, this.seen, this.t)) {
      this.seen.clear();
      this.next();
    }
  }

  dispose() {
    this.el.remove();
  }
}
