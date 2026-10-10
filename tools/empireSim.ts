/**
 * Headless Empire Mode runner: every clan including the player's is left to the AI
 * (the player's clan takes no commands, so this also checks that attacks on the player resolve).
 *   npx tsx tools/empireSim.ts [scenario=s1560] [clan=oda] [seasons=160] [seed=1]
 */
import { PROVINCES } from '../src/data/empire';
import { applyOutcome, autoResolve, clanInfo, endSeason, newCampaign, owned, SEASONS, strength } from '../src/sim/empire';

const [scenario = 's1560', clan = 'oda', seasons = '160', seed = '1'] = process.argv.slice(2);
const s = newCampaign(scenario, clan, 'normal', Number(seed));
// hand the player's clan to the same AI by pretending nobody is the player
const me = s.player;
s.player = '__nobody__';
s.clans.__nobody__ = { id: '__nobody__', ruler: s.clans[me].ruler, gold: 0, rice: 0, alive: false, fame: 0, temper: 'patient', rel: {} };

for (let t = 0; t < Number(seasons); t++) {
  endSeason(s);
  for (const e of s.pending.splice(0)) applyOutcome(s, e, autoResolve(s, e));
  const alive = Object.values(s.clans).filter((c) => c.alive);
  if (t % 20 === 19 || alive.length <= 1) {
    console.log(`${SEASONS[s.season]} ${s.year}: ` + alive.map((c) => `${clanInfo(s, c.id).name} ${owned(s, c.id).length}p/${Math.round(strength(s, c.id))}`).join(', '));
  }
  if (alive.length <= 1) break;
}
const indep = s.provinces.filter((p) => !p.owner).length;
console.log(`independent provinces left: ${indep} of ${PROVINCES.length}`);
console.log(s.log.slice(-8).map((l) => '  ' + l.text).join('\n'));
