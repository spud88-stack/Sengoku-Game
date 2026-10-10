/**
 * Headless battle runner. Every officer, including the "player" slot, is driven by AI.
 *   npm run sim -- [seconds=300] [difficulty=normal] [seed=1] [--log] [--battle=sekigahara] [--officer=ieyasu] [--side=0]
 *   npm run sim -- duel <officerA> <officerB> [difficulty] [rounds]
 */
import { buildBattle, dojoBattle } from '../src/data/battles';
import { OFFICERS } from '../src/data/officers';
import { TUNE } from '../src/data/tuning';
import { officerAI } from '../src/sim/ai';
import { World } from '../src/sim/world';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seconds = Number(args[0] ?? 300);
const diff = args[1] ?? 'normal';
const seed = Number(args[2] ?? 1);
const showLog = process.argv.includes('--log');

// npm run sim -- duel <a> <b> [difficulty] [rounds]: AI-vs-AI duels to check officer balance and behaviour
if (args[0] === 'duel') {
  const [, a = 'yukimura', b = 'masamune', d = 'normal', rounds = '20'] = args;
  let wins = 0,
    total = 0;
  const tally: Record<string, number> = {};
  for (let r = 0; r < Number(rounds); r++) {
    const dw = new World(dojoBattle(a, b), d, 100 + r, officerAI);
    for (const f of dw.fighters) f.controller = officerAI;
    while (dw.time < 180 && !dw.fighters.some((f) => f.dead)) {
      dw.step(TUNE.tick);
      for (const e of dw.events) tally[e.type] = (tally[e.type] ?? 0) + 1;
      dw.events.length = 0;
    }
    if (dw.fighters[1].dead) wins++;
    total += dw.time;
  }
  console.log(`${a} (ally AI, normal) vs ${b} (${d}): ${a} won ${wins}/${rounds}, mean duel ${(total / Number(rounds)).toFixed(1)}s`);
  console.log('per-duel events:', Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, +(v / Number(rounds)).toFixed(1)])));
  process.exit(0);
}

const battle = process.argv.find((a) => a.startsWith('--battle='))?.slice(9) ?? 'ueda';
const hero = process.argv.find((a) => a.startsWith('--officer='))?.slice(10) ?? 'yukimura';
const side = Number(process.argv.find((a) => a.startsWith('--side='))?.slice(7) ?? 0);
const w = new World(buildBattle(battle, OFFICERS[hero], side), diff, seed, officerAI);
for (const f of w.fighters) f.controller = officerAI;
// By default nobody is special: this measures how the battle goes if the player does nothing remarkable.
if (!process.argv.includes('--hero') && w.player) {
  w.player.isPlayer = false;
  w.player = null;
}

const t0 = performance.now();
let ticks = 0;
const counts: Record<string, number> = {};
while (w.time < seconds && !w.ended) {
  w.step(TUNE.tick);
  ticks++;
  for (const e of w.events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (showLog && e.type === 'log') console.log(`[${w.time.toFixed(1).padStart(6)}] ${e.who ? e.who + ': ' : ''}${e.text}`);
  }
  w.events.length = 0;
}
const ms = performance.now() - t0;

console.log(`\n${w.def.name} · ${diff} · seed ${seed}`);
console.log(`simulated ${w.time.toFixed(1)}s in ${ms.toFixed(0)}ms (${(ms / ticks).toFixed(3)} ms/tick)`);
console.log(w.ended ? `RESULT: ${w.def.sides[w.ended.winner]} win — ${w.ended.reason}` : 'RESULT: undecided');
console.log(`morale ${w.morale.map((m) => m.toFixed(0)).join(' / ')}  alive ${w.alive.join(' / ')}  losses ${w.losses.join(' / ')}  reserves ${w.reserves.join(' / ')}`);
console.log(`bases: ${w.bases.map((b) => `${b.name}=${w.def.sides[b.team] ?? '-'}`).join(', ')}`);
for (const f of w.fighters)
  console.log(`  ${f.team ? 'T' : 'S'} ${f.def.name.padEnd(18)} ${f.dead ? 'DEFEATED' : `${Math.round(f.hp)}/${Math.round(f.maxHp)}`.padEnd(8)} KOs ${String(f.kos).padStart(4)}  ${f.ai?.status ?? ''}`);
console.log('events:', counts);
