/** Every sound in the game is synthesised here with WebAudio; there are no audio files. */
export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  music!: GainNode;
  private noise!: AudioBuffer;
  private comp!: DynamicsCompressorNode;
  vol = { master: 0.8, sfx: 0.9, music: 0.55 };
  private lastPlay = new Map<string, number>();

  constructor() {
    try {
      Object.assign(this.vol, JSON.parse(localStorage.getItem('sw.vol') ?? '{}'));
    } catch {
      /* ignore */
    }
    const unlock = () => this.init();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 5;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.master.connect(this.comp).connect(ctx.destination);
    this.applyVolume();
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.music.gain.value = this.vol.music;
    localStorage.setItem('sw.vol', JSON.stringify(this.vol));
  }

  /** Rate-limit a named sound so 40 simultaneous hits don't become one clipped wall. */
  private gate(name: string, minGap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlay.get(name) ?? -1) < minGap) return false;
    this.lastPlay.set(name, now);
    return true;
  }

  private noiseBurst(dur: number, f0: number, f1: number, gain: number, q = 1, type: BiquadFilterType = 'bandpass', dest: AudioNode = this.sfx, at = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private tone(dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine', dest: AudioNode = this.sfx, at = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  swing(kind: string, vol = 1) {
    if (!this.gate('swing', 0.04)) return;
    const p = 0.85 + Math.random() * 0.3;
    switch (kind) {
      case 'heavy':
        this.noiseBurst(0.3, 500 * p, 2200 * p, 0.3 * vol, 1.2);
        this.noiseBurst(0.22, 180, 90, 0.2 * vol, 0.8, 'lowpass');
        break;
      case 'spin':
        this.noiseBurst(0.34, 700 * p, 2600 * p, 0.25 * vol, 1.6);
        this.noiseBurst(0.3, 2400 * p, 800 * p, 0.14 * vol, 2, 'bandpass', this.sfx, 0.08);
        break;
      case 'thrust':
        this.noiseBurst(0.16, 1500 * p, 4200 * p, 0.26 * vol, 2.5);
        break;
      case 'super':
        this.noiseBurst(0.6, 300, 3000, 0.3 * vol, 0.8);
        this.tone(0.7, 110, 440, 0.2 * vol, 'sawtooth');
        break;
      default:
        this.noiseBurst(0.17, 900 * p, 3200 * p, 0.22 * vol, 1.8);
    }
  }

  /** A cut: bright slice, wet body, low thump scaled by weight. */
  hit(weight: number, vol = 1) {
    if (!this.gate('hit', 0.028)) return;
    const p = 0.8 + Math.random() * 0.45;
    const w = Math.min(1.5, weight);
    this.noiseBurst(0.07 + w * 0.04, 5200 * p, 1400 * p, 0.3 * vol, 1.2, 'highpass');
    this.noiseBurst(0.12 + w * 0.08, 900 * p, 240, (0.26 + w * 0.2) * vol, 0.9, 'lowpass');
    this.tone(0.1 + w * 0.12, 150 * p + w * 20, 46, (0.3 + w * 0.3) * vol, 'sine');
  }

  bigHit() {
    if (!this.gate('big', 0.1)) return;
    this.tone(0.5, 120, 30, 0.8, 'sine');
    this.noiseBurst(0.4, 1200, 80, 0.6, 0.6, 'lowpass');
    this.noiseBurst(0.12, 6000, 2000, 0.35, 1, 'highpass');
  }

  block() {
    if (!this.gate('block', 0.05)) return;
    const p = 0.9 + Math.random() * 0.25;
    for (const f of [1870, 2930, 4410]) this.tone(0.22, f * p, f * p * 0.98, 0.09, 'square');
    this.noiseBurst(0.05, 6000, 3000, 0.25, 1, 'highpass');
  }

  parry() {
    for (const f of [2200, 3310, 4980, 6600]) this.tone(0.6, f, f * 0.995, 0.09, 'sine');
    this.noiseBurst(0.08, 7000, 3000, 0.4, 1, 'highpass');
    this.tone(0.25, 200, 60, 0.4);
  }

  guardBreak() {
    this.tone(0.35, 300, 50, 0.5, 'sawtooth');
    this.noiseBurst(0.3, 3000, 300, 0.4, 0.7);
  }

  step() {
    if (!this.gate('step', 0.09)) return;
    this.noiseBurst(0.06, 300 + Math.random() * 100, 120, 0.1, 1, 'lowpass');
  }

  land(heavy: boolean) {
    if (!this.gate('land', 0.06)) return;
    this.tone(heavy ? 0.3 : 0.14, heavy ? 110 : 140, 40, heavy ? 0.6 : 0.25);
    this.noiseBurst(heavy ? 0.3 : 0.12, 800, 100, heavy ? 0.4 : 0.18, 0.6, 'lowpass');
  }

  shot(vol = 1) {
    if (!this.gate('shot', 0.03)) return;
    this.noiseBurst(0.22, 3200, 300, 0.75 * vol, 0.5, 'lowpass');
    this.noiseBurst(0.05, 7000, 2500, 0.5 * vol, 1, 'highpass');
    this.tone(0.14, 190, 50, 0.55 * vol);
  }

  arrow(vol = 1) {
    if (vol <= 0 || !this.gate('arrow', 0.05)) return;
    this.noiseBurst(0.12, 2600, 5200, 0.18 * vol, 3);
    this.tone(0.08, 320, 180, 0.12 * vol, 'triangle');
  }

  dodge() {
    this.noiseBurst(0.2, 400, 1600, 0.16, 1.2);
  }

  superStart() {
    this.tone(0.9, 80, 640, 0.3, 'sawtooth');
    this.noiseBurst(0.9, 200, 6000, 0.3, 0.7);
    for (let i = 0; i < 4; i++) this.tone(0.5, 440 * (1 + i * 0.5), 440 * (1 + i * 0.5), 0.07, 'triangle', this.sfx, 0.1 * i);
  }

  taiko(vol = 0.7, at = 0, dest: AudioNode = this.sfx) {
    if (!this.ctx) return;
    this.tone(0.4, 130, 48, vol, 'sine', dest, at);
    this.noiseBurst(0.06, 1800, 400, vol * 0.35, 0.8, 'bandpass', dest, at);
  }

  // ------------------------------------------------------------ music
  /** 0 = quiet camp, 1 = full battle. The score follows this continuously. */
  intensity = 0.2;
  private musicOn = false;
  private nextStep = 0;
  private stepN = 0;
  private phrase: number[] = [];
  private seed = 7;
  private rnd() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /** Start the generative score: taiko, shamisen and flute over a miyako-bushi scale. */
  startMusic() {
    if (this.musicOn) return;
    this.musicOn = true;
    setInterval(() => this.schedule(), 90);
  }

  private flute(freq: number, dur: number, vol: number, at: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 0.97, t);
    o.frequency.linearRampToValueAtTime(freq, t + 0.12);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.6);
    vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.18);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.music);
    // a breath of noise makes it a flute rather than a test tone
    this.noiseBurst(dur * 0.8, freq * 2, freq * 2, vol * 0.25, 6, 'bandpass', this.music, at);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const I = this.intensity;
    const stepDur = 60 / (78 + I * 62) / 4;
    if (this.nextStep < ctx.currentTime) this.nextStep = ctx.currentTime + 0.05;
    // D miyako-bushi: D Eb G A Bb
    const scale = [146.83, 155.56, 196, 220, 233.08, 293.66, 311.13, 392, 440, 466.16, 587.33];
    while (this.nextStep < ctx.currentTime + 0.25) {
      const at = this.nextStep - ctx.currentTime;
      const s = this.stepN % 16,
        bar = Math.floor(this.stepN / 16);
      if (s === 0 && bar % 4 === 0) {
        // a new shamisen phrase: a wandering line that leans back toward the tonic
        let n = 5;
        this.phrase = Array.from({ length: 8 }, () => (n = Math.max(2, Math.min(10, n + Math.round((this.rnd() - 0.52) * 4)))));
      }
      // taiko: sparse at rest, driving in a fight
      const big = s === 0 || s === 8 || (I > 0.45 && (s === 6 || s === 11)) || (I > 0.8 && s === 14);
      if (big) this.taiko((s === 0 ? 0.75 : 0.5) * (0.35 + I * 0.65), at, this.music);
      if (I > 0.55 && s % 2 === 1) this.noiseBurst(0.03, 3200, 2400, 0.05 + I * 0.05, 4, 'bandpass', this.music, at);
      if (I > 0.3 && (s === 4 || s === 12)) this.tone(0.08, 880, 700, 0.035, 'square', this.music, at);
      // shamisen
      const density = I > 0.6 ? 2 : 4;
      if (s % density === 0 && (I > 0.25 || bar % 2 === 0) && this.rnd() < 0.5 + I * 0.4) this.pluck(scale[this.phrase[(s / density) % 8]], 0.07 + I * 0.07, at, this.music);
      // bass drone and flute carry the quiet stretches
      if (s === 0 && bar % 2 === 0) this.tone(stepDur * 30, 73.42, 73.42, 0.05, 'triangle', this.music, at);
      if (s === 0 && bar % 4 === 2 && I < 0.7) this.flute(scale[5 + Math.floor(this.rnd() * 5)], stepDur * 24, 0.05, at);
      this.nextStep += stepDur;
      this.stepN++;
    }
  }

  /** Milestone and UI stingers. */
  chime(n = 0) {
    if (!this.ctx) return;
    const scale = [293.66, 349.23, 392, 440, 523.25, 587.33];
    for (let i = 0; i < 3; i++) this.pluck(scale[(n + i * 2) % scale.length] * 2, 0.16, 0.07 * i);
  }

  pluck(freq: number, vol = 0.2, at = 0, dest: AudioNode = this.sfx) {
    if (!this.ctx) return;
    const ctx = this.ctx,
      t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq * 1.02, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 8, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.75);
  }

  ui(kind: 'move' | 'ok' | 'back' = 'move') {
    if (!this.ctx) return;
    if (kind === 'move') this.pluck(660, 0.08);
    else if (kind === 'ok') {
      this.pluck(440, 0.14);
      this.pluck(660, 0.14, 0.06);
      this.taiko(0.3);
    } else this.pluck(330, 0.1);
  }
}
