import * as THREE from 'three';
import { Audio } from './core/audio';
import { Input } from './core/input';
import { levelled, loadProfile, profile, saveProfile } from './core/save';
import { BATTLES, buildBattle, dojoBattle } from './data/battles';
import { OFFICERS, ROSTER } from './data/officers';
import { officerAI } from './sim/ai';
import type { BattleDef } from './sim/world';
import { World } from './sim/world';
import { Shell, type BattleResult } from './ui/screens';
import { Tutorial } from './ui/tutorial';
import { BattleView } from './view/battleView';
import { renderPortraits } from './view/portrait';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

loadProfile();
const input = new Input(canvas);
const audio = new Audio();
window.addEventListener('pointerdown', () => audio.startMusic(), { once: true });
window.addEventListener('keydown', () => audio.startMusic(), { once: true });
const fade = document.createElement('div');
fade.className = 'fade';
document.body.append(fade);

let view: BattleView | null = null;
let inBattle = false;
let battleOfficer = 'yukimura';
let onQuit: (() => void) | null = null;

const viewOpts = () => ({ shake: profile.settings.shake, sens: profile.settings.sens, invertY: profile.settings.invertY, blood: profile.settings.blood });

function applySettings() {
  const s = profile.settings;
  Object.assign(audio.vol, { master: s.master, sfx: s.sfx, music: s.music });
  audio.applyVolume();
  if (view) {
    Object.assign(view.opts, viewOpts());
    view.fx.bloodLevel = view.opts.attract ? 1 : s.blood;
  }
}

/** Cut to black, swap what is on screen, fade back in. */
function transition(fn: () => void) {
  fade.classList.add('on');
  setTimeout(() => {
    fn();
    setTimeout(() => fade.classList.remove('on'), 120);
  }, 360);
}

function setView(v: BattleView) {
  view?.dispose();
  view = v;
  (window as any).__game = { world: v.world, view: v, input, audio, advance, shell, setManual: (m: boolean) => (manual = m) };
}

/** A battle nobody is playing, for the menus to sit on top of. */
function attract() {
  const spec = BATTLES[Math.floor(Math.random() * BATTLES.length)];
  const def = buildBattle(spec.id, OFFICERS[ROSTER[Math.floor(Math.random() * ROSTER.length)]], 0);
  const world = new World(def, 'normal', (Math.random() * 1e9) | 0, officerAI);
  if (world.player) {
    world.player.controller = officerAI;
    world.player.isPlayer = false;
    world.player = null;
  }
  inBattle = false;
  input.enabled = false;
  document.exitPointerLock?.();
  setView(new BattleView(renderer, world, input, audio, ui, { attract: true }));
}

/** Play a battle and report how it went. */
function runBattle(def: BattleDef, difficulty: string, officerId: string, done: (r: BattleResult, w: World) => void, ai = true) {
  shell.close();
  const world = new World(def, difficulty, (Math.random() * 1e9) | 0, ai ? officerAI : null);
  const v = new BattleView(renderer, world, input, audio, ui, viewOpts());
  setView(v);
  inBattle = true;
  battleOfficer = officerId;
  input.enabled = true;
  input.clear();
  if (params.get('auto') === '1' && world.player) world.player.controller = officerAI;
  const finish = (won: boolean, reason: string) => {
    if (!inBattle || view !== v) return;
    inBattle = false;
    document.exitPointerLock?.();
    const p = world.player;
    v.hud.root.style.display = 'none';
    done({ won, reason, kos: world.ko, time: world.time, officers: world.stats.officers, bases: world.stats.bases, maxCombo: v.hud.maxCombo, dmgTaken: world.stats.dmgTaken, survived: !!p && !p.dead }, world);
  };
  v.onEnd = (winner, reason) => finish(winner === world.playerTeam, reason[0].toUpperCase() + reason.slice(1));
  onQuit = () => finish(false, 'You withdrew from the field');
}

function togglePause() {
  if (!view || !inBattle || view.world.ended) return;
  if (view.paused) {
    view.paused = false;
    shell.close();
    input.clear();
    return;
  }
  view.paused = true;
  document.exitPointerLock?.();
  // the pause screen doubles as the full battlefield map
  const cv = document.createElement('canvas');
  cv.width = cv.height = 440;
  cv.className = 'bigmap';
  if (view.world.player) view.hud.drawMap(view.world, view.world.player, cv.getContext('2d')!, 440, true);
  shell.pause(
    battleOfficer,
    togglePause,
    () => {
      view!.paused = false;
      onQuit?.();
    },
    'Retreat from Battle',
    view.world.bases.length ? cv : null,
  );
}

const portraits = renderPortraits(Object.values(OFFICERS));
const shell: Shell = new Shell(ui, {
  audio,
  input,
  portraits,
  applySettings,
  startFree(c) {
    transition(() =>
      runBattle(buildBattle(c.battle, levelled(OFFICERS[c.officer]), c.side), c.difficulty, c.officer, (r) => {
        view!.paused = true;
        shell.results(r, c, () =>
          transition(() => {
            attract();
            shell.freeBattle(c.officer, Math.max(0, BATTLES.findIndex((b) => b.id === c.battle)));
          }),
        );
      }),
    );
  },
  startDojo(officer) {
    const foe = ROSTER.filter((id) => id !== officer)[Math.floor(Math.random() * (ROSTER.length - 1))];
    transition(() =>
      runBattle(dojoBattle(officer, foe, 14), profile.settings.difficulty, officer, () =>
        transition(() => {
          attract();
          shell.menu();
        }),
      ),
    );
  },
  startTutorial() {
    transition(() => {
      runBattle(
        dojoBattle('yukimura', 'masamune', 12),
        'easy',
        'yukimura',
        (r) => {
          tutorial?.dispose();
          tutorial = null;
          if (r.won) {
            profile.tutorialDone = true;
            saveProfile();
          }
          transition(() => {
            attract();
            shell.menu();
          });
        },
        false,
      );
      tutorial = new Tutorial(view!.world, ui);
    });
  },
  openEmpire() {
    import('./ui/empireScreens').then((m) => m.openEmpire({ shell, ui, audio, portraits, runBattle, transition, attract, pauseView: () => void (view && (view.paused = true)) }));
  },
});

/** Test hook: drive frames by hand so scripted checks don't depend on requestAnimationFrame timing. */
let manual = false;
function advance(seconds: number, until?: () => boolean, dt = 1 / 60): number {
  manual = true;
  let t = 0;
  while (t < seconds) {
    frame(dt);
    t += dt;
    if (until?.()) break;
  }
  return t;
}

let tutorial: Tutorial | null = null;

function frame(dt: number) {
  if (!view) return;
  if (inBattle && (input.take('pause') || (input.take('map') && !view.paused))) togglePause();
  view.frame(dt);
  if (tutorial && inBattle && !view.paused) tutorial.update(dt);
  // the score swells when the player is in the thick of it
  const p = view.world.player;
  const target = !inBattle ? 0.22 : view.paused ? 0.15 : p && p.combatT > 0 ? (p.lock || p.raging || p.move?.kind === 'super' ? 1 : 0.8) : 0.45;
  audio.intensity += (target - audio.intensity) * Math.min(1, dt * 0.8);
}

window.addEventListener('resize', () => view?.resize());
// losing pointer lock mid-fight (Esc, alt-tab) should pause rather than leave the player spinning
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && inBattle && view && !view.paused && !view.world.ended && !manual) togglePause();
});

let last = performance.now();
function loop(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  if (!manual) frame(dt);
  requestAnimationFrame(loop);
}

applySettings();
if (params.has('dojo')) {
  const id = params.get('officer') ?? 'yukimura';
  runBattle(dojoBattle(id, params.get('foe') ?? 'masamune', Number(params.get('n') ?? 0)), params.get('diff') ?? 'normal', id, () => {}, params.get('ai') === '1');
} else if (params.has('battle') || params.has('officer')) {
  const id = params.get('officer') ?? 'yukimura';
  runBattle(buildBattle(params.get('battle') ?? 'ueda', levelled(OFFICERS[id] ?? OFFICERS.yukimura), Number(params.get('side') ?? 0)), params.get('diff') ?? profile.settings.difficulty, id, () => {});
} else {
  attract();
  shell.title();
}
requestAnimationFrame(loop);
