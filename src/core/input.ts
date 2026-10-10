export type Action = 'light' | 'heavy' | 'jump' | 'dodge' | 'guard' | 'super' | 'rage' | 'lock' | 'mount' | 'pause' | 'map' | 'debug';

export const DEFAULT_KEYS: Record<Action, string[]> = {
  light: ['KeyJ', 'Mouse0'],
  heavy: ['KeyK', 'Mouse2'],
  jump: ['Space'],
  dodge: ['ShiftLeft', 'ShiftRight'],
  guard: ['KeyQ', 'KeyL'],
  super: ['KeyF', 'KeyI'],
  rage: ['KeyR'],
  lock: ['Tab', 'Mouse1'],
  mount: ['KeyE'],
  pause: ['Escape', 'KeyP'],
  map: ['KeyM'],
  debug: ['Backquote'],
};

// Standard-mapping gamepad buttons.
const PAD: Partial<Record<Action, number[]>> = {
  light: [2],
  heavy: [3],
  jump: [0],
  super: [1],
  dodge: [5],
  guard: [4],
  rage: [6, 7],
  lock: [11],
  mount: [10],
  pause: [9],
  map: [8],
};

/**
 * Keyboard, mouse and gamepad folded into one action map.
 * Presses are queued so a fixed-step sim never misses one that lands between ticks or during hitstop.
 */
export class Input {
  keys: Record<Action, string[]>;
  private held = new Set<string>();
  private queued = new Set<Action>();
  private padHeld = new Set<Action>();
  lookX = 0;
  lookY = 0;
  locked = false;
  enabled = true;
  /** last device used, for prompts */
  device: 'kb' | 'pad' = 'kb';
  private byCode = new Map<string, Action[]>();

  constructor(private el: HTMLElement) {
    let saved: Partial<Record<Action, string[]>> = {};
    try {
      saved = JSON.parse(localStorage.getItem('sw.keys') ?? '{}');
    } catch {
      /* ignore */
    }
    this.keys = { ...DEFAULT_KEYS, ...saved };
    this.rebuild();

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.device = 'kb';
      this.press(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    el.addEventListener('mousedown', (e) => {
      this.device = 'kb';
      if (!this.locked && this.enabled) el.requestPointerLock?.();
      this.press('Mouse' + e.button);
    });
    window.addEventListener('mouseup', (e) => this.held.delete('Mouse' + e.button));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => (this.locked = document.pointerLockElement === el));
    window.addEventListener('blur', () => this.held.clear());
  }

  rebuild() {
    this.byCode.clear();
    for (const a of Object.keys(this.keys) as Action[]) for (const c of this.keys[a]) this.byCode.set(c, [...(this.byCode.get(c) ?? []), a]);
  }
  rebind(a: Action, codes: string[]) {
    this.keys[a] = codes;
    localStorage.setItem('sw.keys', JSON.stringify(this.keys));
    this.rebuild();
  }

  resetKeys() {
    this.keys = { ...DEFAULT_KEYS };
    localStorage.removeItem('sw.keys');
    this.rebuild();
  }

  private press(code: string) {
    this.held.add(code);
    for (const a of this.byCode.get(code) ?? []) this.queued.add(a);
  }
  /** For tests and the debug console. */
  inject(a: Action) {
    this.queued.add(a);
  }
  hold(code: string, on: boolean) {
    if (on) this.held.add(code);
    else this.held.delete(code);
  }

  down(a: Action): boolean {
    if (this.padHeld.has(a)) return true;
    for (const c of this.keys[a]) if (this.held.has(c)) return true;
    return false;
  }
  /** True once per press. */
  take(a: Action): boolean {
    return this.queued.delete(a);
  }
  clear() {
    this.queued.clear();
  }

  private padX = 0;
  private padY = 0;
  private padLX = 0;
  private padLY = 0;

  /** Poll once per frame. */
  poll() {
    const pads = navigator.getGamepads?.() ?? [];
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') gp = p;
    this.padX = this.padY = this.padLX = this.padLY = 0;
    if (!gp) {
      this.padHeld.clear();
      return;
    }
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    this.padX = dz(gp.axes[0]);
    this.padY = dz(gp.axes[1]);
    this.padLX = dz(gp.axes[2]);
    this.padLY = dz(gp.axes[3]);
    if (this.padX || this.padY || this.padLX) this.device = 'pad';
    for (const a of Object.keys(PAD) as Action[]) {
      const on = PAD[a]!.some((b) => gp!.buttons[b]?.pressed);
      if (on && !this.padHeld.has(a)) {
        this.queued.add(a);
        this.device = 'pad';
      }
      if (on) this.padHeld.add(a);
      else this.padHeld.delete(a);
    }
  }

  /** Movement stick: x right, y forward, each in [-1, 1]. */
  moveAxis(): [number, number] {
    let x = this.padX,
      y = -this.padY;
    if (this.held.has('KeyD')) x += 1;
    if (this.held.has('KeyA')) x -= 1;
    if (this.held.has('KeyW')) y += 1;
    if (this.held.has('KeyS')) y -= 1;
    const m = Math.hypot(x, y);
    return m > 1 ? [x / m, y / m] : [x, y];
  }

  /** Camera look delta for this frame, in radians-ish units. Consumes mouse motion. */
  lookDelta(dt: number): [number, number] {
    let x = this.lookX * 0.0024,
      y = this.lookY * 0.0024;
    this.lookX = this.lookY = 0;
    x += this.padLX * 3.2 * dt;
    y += this.padLY * 2 * dt;
    if (this.held.has('ArrowLeft')) x -= 2.6 * dt;
    if (this.held.has('ArrowRight')) x += 2.6 * dt;
    if (this.held.has('ArrowUp')) y -= 1.6 * dt;
    if (this.held.has('ArrowDown')) y += 1.6 * dt;
    return [x, y];
  }
}
