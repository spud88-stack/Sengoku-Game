import { Rng } from '../core/math';
import { levelOf, levelled } from '../core/save';
import { ALL_OFFICERS, PROVINCES, SCENARIOS, STRATAGEMS } from '../data/empire';
import { CLANS, retainer } from '../data/officers';
import type { OfficerDef, Personality } from './types';
import type { BattleDef, BattleEvent } from './world';

export type RelStatus = 'neutral' | 'truce' | 'ally';
export interface Rel {
  status: RelStatus;
  until: number;
  trust: number;
}
export interface EOfficer {
  id: string;
  def: OfficerDef;
  clan: string | null;
  loc: number;
  loyalty: number;
  xp: number;
  /** clan holding them prisoner */
  captive: string | null;
  /** free officers have to be found before they can be hired */
  known: boolean;
  dead: boolean;
}
export interface EProvince {
  owner: string | null;
  troops: number;
  dev: number;
  farm: number;
  fort: number;
}
export interface EClan {
  id: string;
  ruler: string;
  gold: number;
  rice: number;
  alive: boolean;
  fame: number;
  temper: Personality;
  rel: Record<string, Rel>;
  custom?: { name: string; color: number; mon: string };
}
export interface LogLine {
  turn: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'war';
}
export interface Engagement {
  attacker: string;
  defender: string | null;
  from: number;
  province: number;
  atkOfficers: string[];
  defOfficers: string[];
  atkTroops: number;
  defTroops: number;
  atkStratagem: string;
  defStratagem: string;
}
export interface Outcome {
  attackerWon: boolean;
  atkLeft: number;
  defLeft: number;
  /** officer ids beaten on the field */
  fallen: string[];
  fought: boolean;
}
export interface Offer {
  from: string;
  kind: 'ally' | 'truce';
}
export interface EmpireState {
  v: 1;
  scenario: string;
  year: number;
  season: number;
  turn: number;
  player: string;
  difficulty: string;
  provinces: EProvince[];
  clans: Record<string, EClan>;
  officers: Record<string, EOfficer>;
  actions: number;
  log: LogLine[];
  over: { won: boolean; title: string; text: string } | null;
  stats: { battlesWon: number; battlesLost: number; auto: number; executed: number; released: number; recruited: number; pacts: number; betrayals: number };
  /** attacks on the player waiting to be resolved, and captives waiting for judgement */
  pending: Engagement[];
  captives: string[];
  offers: Offer[];
  seed: number;
}

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const pIdx = (name: string) => PROVINCES.findIndex((p) => p.name === name);
export const ADJ: number[][] = PROVINCES.map((p) => p.adj.map(pIdx));
// make adjacency symmetric in case the table is missing a back-link
ADJ.forEach((list, i) => list.forEach((j) => !ADJ[j].includes(i) && ADJ[j].push(i)));

const rngOf = (s: EmpireState) => new Rng((s.seed = (s.seed * 1664525 + 1013904223) >>> 0));

export function clanInfo(s: EmpireState, id: string | null): { name: string; color: number; mon: string } {
  if (!id) return { name: 'Independent', color: 0x8a8578, mon: '' };
  const c = s.clans[id];
  if (c?.custom) return c.custom;
  const k = CLANS[id] ?? CLANS.oda;
  return { name: k.name, color: k.color, mon: k.mon };
}
export const say = (s: EmpireState, text: string, kind: LogLine['kind'] = 'info') => {
  s.log.push({ turn: s.turn, text, kind });
  if (s.log.length > 120) s.log.shift();
};
export const owned = (s: EmpireState, clan: string) => s.provinces.map((p, i) => (p.owner === clan ? i : -1)).filter((i) => i >= 0);
export const officersOf = (s: EmpireState, clan: string) => Object.values(s.officers).filter((o) => o.clan === clan && !o.dead && !o.captive);
export const officersAt = (s: EmpireState, prov: number, clan: string | null) => Object.values(s.officers).filter((o) => o.loc === prov && o.clan === clan && !o.dead && !o.captive);
export const rel = (s: EmpireState, a: string, b: string): Rel => (s.clans[a].rel[b] ??= { status: 'neutral', until: 0, trust: 50 });
const setRel = (s: EmpireState, a: string, b: string, status: RelStatus, until = 0) => {
  rel(s, a, b).status = rel(s, b, a).status = status;
  rel(s, a, b).until = rel(s, b, a).until = until;
};
export const power = (o: EOfficer) => {
  const d = levelled(o.def, levelOf(o.xp).level);
  return (d.hp / 500) * d.atk * d.def;
};
export const strength = (s: EmpireState, clan: string) => owned(s, clan).reduce((a, i) => a + s.provinces[i].troops, 0) + officersOf(s, clan).reduce((a, o) => a + power(o) * 120, 0);

// ---------------------------------------------------------------- setup
export interface CustomRuler {
  name: string;
  clanName: string;
  weapon: OfficerDef['weapon'];
  personality: Personality;
  color: number;
  province: string;
}

export function newCampaign(scenarioId: string, player: string, difficulty: string, seed: number, custom?: CustomRuler): EmpireState {
  const sc = SCENARIOS.find((x) => x.id === scenarioId) ?? SCENARIOS[0];
  const rng = new Rng(seed);
  const s: EmpireState = {
    v: 1,
    scenario: sc.id,
    year: sc.year,
    season: 0,
    turn: 0,
    player,
    difficulty,
    provinces: PROVINCES.map(() => ({ owner: null, troops: Math.round(rng.range(260, 520) / 10) * 10, dev: rng.int(0, 1), farm: rng.int(0, 1), fort: rng.int(0, 2) })),
    clans: {},
    officers: {},
    actions: 0,
    log: [],
    over: null,
    stats: { battlesWon: 0, battlesLost: 0, auto: 0, executed: 0, released: 0, recruited: 0, pacts: 0, betrayals: 0 },
    pending: [],
    captives: [],
    offers: [],
    seed: seed >>> 0 || 7,
  };
  for (const [id, def] of Object.entries(ALL_OFFICERS)) s.officers[id] = { id, def, clan: null, loc: rng.int(0, PROVINCES.length - 1), loyalty: 70, xp: 0, captive: null, known: false, dead: false };
  for (const [clan, provs] of Object.entries(sc.holdings)) {
    const house = sc.houses[clan] ?? [];
    const ruler = s.officers[house[0]];
    s.clans[clan] = { id: clan, ruler: house[0], gold: 500, rice: 600, alive: true, fame: 50, temper: ruler?.def.personality ?? 'patient', rel: {} };
    provs.forEach((name, k) => {
      const p = s.provinces[pIdx(name)];
      p.owner = clan;
      p.troops = k === 0 ? 800 : 520;
      p.fort = k === 0 ? 2 : 1;
      p.dev = 1;
      p.farm = 1;
    });
    house.forEach((oid, k) => {
      const o = s.officers[oid];
      if (!o) return;
      o.clan = clan;
      o.known = true;
      o.loyalty = k === 0 ? 100 : rng.int(65, 92);
      o.loc = pIdx(provs[k % provs.length]);
      o.def = { ...o.def, clan };
    });
  }
  if (custom) {
    // an upstart lord with one province and one retainer
    const id = 'custom_ruler';
    const pi = pIdx(custom.province);
    const def: OfficerDef = { ...retainer(custom.name, 'oda', { weapon: custom.weapon, personality: custom.personality, hp: 500, atk: 1, def: 1, speed: 1.02, title: 'The Upstart', crest: 'plume' }), id, primary: custom.color, clan: 'custom' };
    s.officers[id] = { id, def, clan: 'custom', loc: pi, loyalty: 100, xp: 0, captive: null, known: true, dead: false };
    s.clans.custom = { id: 'custom', ruler: id, gold: 600, rice: 700, alive: true, fame: 40, temper: custom.personality, rel: {}, custom: { name: custom.clanName, color: custom.color, mon: custom.clanName[0] ?? '新' } };
    const p = s.provinces[pi];
    p.owner = 'custom';
    p.troops = 700;
    p.fort = 2;
    p.dev = p.farm = 1;
    const free = Object.values(s.officers).filter((o) => !o.clan && o.def.clan === 'ronin');
    const pal = free[rng.int(0, free.length - 1)];
    if (pal) Object.assign(pal, { clan: 'custom', loc: pi, known: true, loyalty: 85 });
    s.player = 'custom';
  }
  // a couple of wanderers are common knowledge from the start
  for (const o of Object.values(s.officers)) if (!o.clan && rng.chance(0.25)) o.known = true;
  s.actions = maxActions(s);
  say(s, `${SEASONS[0]} ${s.year}. ${sc.blurb}`);
  return s;
}

export const maxActions = (s: EmpireState) => Math.min(8, 3 + Math.floor(owned(s, s.player).length / 3));

// ---------------------------------------------------------------- economy
export function income(s: EmpireState, clan: string) {
  let gold = 0,
    rice = 0,
    upkeep = 0;
  for (const i of owned(s, clan)) {
    const p = s.provinces[i];
    gold += PROVINCES[i].gold * (1 + 0.3 * p.dev);
    rice += PROVINCES[i].rice * (1 + 0.3 * p.farm) * 4;
    upkeep += p.troops / 28;
  }
  return { gold: Math.round(gold), harvest: Math.round(rice), upkeep: Math.round(upkeep) };
}

export const COST = {
  develop: (p: EProvince) => 120 * (p.dev + 1),
  cultivate: (p: EProvince) => 100 * (p.farm + 1),
  fortify: (p: EProvince) => 160 * (p.fort + 1),
  recruitGold: 70,
  recruitRice: 25,
  reward: 120,
  search: 60,
  envoy: 150,
  plot: 250,
};

export type Cmd = { ok: true; msg: string } | { ok: false; msg: string };
const fail = (msg: string): Cmd => ({ ok: false, msg });

function spend(s: EmpireState, gold: number, rice = 0): Cmd | null {
  const c = s.clans[s.player];
  if (s.actions <= 0) return fail('No commands left this season.');
  if (c.gold < gold) return fail(`Not enough gold (${gold} needed).`);
  if (c.rice < rice) return fail(`Not enough rice (${rice} needed).`);
  c.gold -= gold;
  c.rice -= rice;
  s.actions--;
  return null;
}

export function improve(s: EmpireState, prov: number, what: 'dev' | 'farm' | 'fort'): Cmd {
  const p = s.provinces[prov];
  if (p[what] >= 5) return fail('Already fully developed.');
  const cost = what === 'dev' ? COST.develop(p) : what === 'farm' ? COST.cultivate(p) : COST.fortify(p);
  const e = spend(s, cost);
  if (e) return e;
  p[what]++;
  const label = { dev: 'Markets expanded', farm: 'New paddies cut', fort: 'Walls raised' }[what];
  return { ok: true, msg: `${label} in ${PROVINCES[prov].name}.` };
}

export function recruit(s: EmpireState, prov: number, hundreds = 3): Cmd {
  const e = spend(s, COST.recruitGold * hundreds, COST.recruitRice * hundreds);
  if (e) return e;
  s.provinces[prov].troops += hundreds * 100;
  return { ok: true, msg: `${hundreds * 100} men levied in ${PROVINCES[prov].name}.` };
}

export function search(s: EmpireState, prov: number): Cmd {
  const e = spend(s, COST.search);
  if (e) return e;
  const rng = rngOf(s);
  const here = Object.values(s.officers).filter((o) => !o.clan && !o.dead && !o.captive && (o.loc === prov || ADJ[prov].includes(o.loc)));
  const hidden = here.filter((o) => !o.known);
  if (hidden.length && rng.chance(0.75)) {
    const o = rng.pick(hidden);
    o.known = true;
    o.loc = prov;
    return { ok: true, msg: `Your agents found ${o.def.name}, a masterless ${o.def.weapon === 'gun' ? 'marksman' : 'warrior'}, in ${PROVINCES[prov].name}.` };
  }
  if (rng.chance(0.35)) {
    const g = rng.int(80, 220);
    s.clans[s.player].gold += g;
    return { ok: true, msg: `No one of note, but a merchant guild offers ${g} gold for your protection.` };
  }
  return { ok: true, msg: 'The search turned up no one worth hiring.' };
}

export function hire(s: EmpireState, id: string): Cmd {
  const o = s.officers[id];
  const cost = Math.round(150 + power(o) * 150);
  const c = s.clans[s.player];
  const e = spend(s, cost);
  if (e) return e;
  const rng = rngOf(s);
  if (rng.chance(0.55 + c.fame / 250)) {
    o.clan = s.player;
    o.loyalty = rng.int(60, 80);
    o.loc = s.officers[c.ruler].loc;
    s.stats.recruited++;
    return { ok: true, msg: `${o.def.name} has sworn service to you.` };
  }
  c.gold += Math.round(cost / 2);
  return { ok: true, msg: `${o.def.name} declined your offer and returned half the gold.` };
}

export function reward(s: EmpireState, id: string): Cmd {
  const e = spend(s, COST.reward);
  if (e) return e;
  const o = s.officers[id];
  o.loyalty = Math.min(100, o.loyalty + 18);
  return { ok: true, msg: `${o.def.name} is honoured by your gift.` };
}

/** Move troops and officers between adjacent provinces you own. */
export function march(s: EmpireState, from: number, to: number, troops: number, officers: string[]): Cmd {
  if (s.provinces[to].owner !== s.player || !ADJ[from].includes(to)) return fail('You can only march between adjacent provinces you hold.');
  const e = spend(s, 0);
  if (e) return e;
  troops = Math.min(troops, s.provinces[from].troops);
  s.provinces[from].troops -= troops;
  s.provinces[to].troops += troops;
  for (const id of officers) s.officers[id].loc = to;
  return { ok: true, msg: `${troops} men marched from ${PROVINCES[from].name} to ${PROVINCES[to].name}.` };
}

export function envoy(s: EmpireState, clan: string, kind: 'ally' | 'truce'): Cmd {
  const r = rel(s, s.player, clan);
  if (r.status === 'ally' || (r.status === 'truce' && kind === 'truce')) return fail('You already have such a pact.');
  const e = spend(s, COST.envoy);
  if (e) return e;
  const me = s.clans[s.player];
  const rng = rngOf(s);
  const ratio = strength(s, s.player) / Math.max(1, strength(s, clan));
  let chance = (r.trust - 30) / 100 + me.fame / 300 + (kind === 'truce' ? 0.25 : 0) + (ratio > 1.3 ? 0.2 : ratio < 0.5 ? -0.15 : 0);
  if (s.clans[clan].temper === 'reckless') chance -= 0.1;
  if (rng.chance(chance)) {
    setRel(s, s.player, clan, kind, s.turn + (kind === 'truce' ? 8 : 9999));
    r.trust = Math.min(100, r.trust + 10);
    s.stats.pacts++;
    say(s, `${clanInfo(s, clan).name} ${kind === 'ally' ? 'have sworn an alliance with you' : 'agree to a two-year truce'}.`, 'good');
    return { ok: true, msg: kind === 'ally' ? 'The alliance is sealed.' : 'A truce is agreed.' };
  }
  r.trust = Math.max(0, r.trust - 3);
  return { ok: true, msg: `${clanInfo(s, clan).name} sent your envoy home with polite regrets.` };
}

export function gift(s: EmpireState, clan: string): Cmd {
  const e = spend(s, 200);
  if (e) return e;
  rel(s, s.player, clan).trust = Math.min(100, rel(s, s.player, clan).trust + 14);
  rel(s, clan, s.player).trust = rel(s, s.player, clan).trust;
  return { ok: true, msg: `${clanInfo(s, clan).name} accept your gift. Their regard for you rises.` };
}

/** Tearing up a pact is free, immediate, and remembered by everyone. */
export function breakPact(s: EmpireState, clan: string): Cmd {
  const r = rel(s, s.player, clan);
  if (r.status === 'neutral') return fail('There is no pact to break.');
  setRel(s, s.player, clan, 'neutral');
  r.trust = rel(s, clan, s.player).trust = 5;
  s.clans[s.player].fame = Math.max(0, s.clans[s.player].fame - 12);
  for (const c of Object.values(s.clans)) if (c.id !== s.player) rel(s, s.player, c.id).trust = Math.max(0, rel(s, s.player, c.id).trust - 10);
  for (const o of officersOf(s, s.player)) if (o.def.personality === 'honorable') o.loyalty = Math.max(0, o.loyalty - 10);
  s.stats.betrayals++;
  say(s, `You have torn up your pact with ${clanInfo(s, clan).name}. The realm takes note.`, 'bad');
  return { ok: true, msg: 'The pact is broken.' };
}

/** Work on an enemy officer's loyalty; if it drops far enough they come over. */
export function plot(s: EmpireState, id: string): Cmd {
  const o = s.officers[id];
  if (!o.clan || o.clan === s.player || s.clans[o.clan].ruler === id) return fail('That officer cannot be suborned.');
  const e = spend(s, COST.plot);
  if (e) return e;
  const rng = rngOf(s);
  const resist = o.def.personality === 'honorable' ? 0.5 : o.def.personality === 'cunning' ? 1.3 : 1;
  o.loyalty -= rng.range(12, 28) * resist;
  if (o.loyalty < 30 && rng.chance(0.6)) {
    const old = o.clan;
    o.clan = s.player;
    o.loyalty = 55;
    o.loc = s.officers[s.clans[s.player].ruler].loc;
    o.def = { ...o.def, clan: s.player };
    s.stats.recruited++;
    say(s, `${o.def.name} has abandoned ${clanInfo(s, old).name} and joined you.`, 'good');
    return { ok: true, msg: `${o.def.name} slips away in the night and arrives at your gates.` };
  }
  return { ok: true, msg: `Your agents report ${o.def.name}'s faith in their lord is ${o.loyalty < 45 ? 'crumbling' : 'shaken'}.` };
}

// ---------------------------------------------------------------- war
export function canAttack(s: EmpireState, clan: string, prov: number): boolean {
  const p = s.provinces[prov];
  if (p.owner === clan) return false;
  if (p.owner && rel(s, clan, p.owner).status !== 'neutral') return false;
  return ADJ[prov].some((j) => s.provinces[j].owner === clan);
}

export function plan(s: EmpireState, attacker: string, from: number, to: number, officers: string[], troops: number, stratagem = 'none'): Engagement {
  const def = s.provinces[to].owner;
  return {
    attacker,
    defender: def,
    from,
    province: to,
    atkOfficers: officers.slice(0, 5),
    defOfficers: officersAt(s, to, def)
      .sort((a, b) => power(b) - power(a))
      .slice(0, 5)
      .map((o) => o.id),
    atkTroops: Math.max(100, Math.min(troops, s.provinces[from].troops)),
    defTroops: s.provinces[to].troops,
    atkStratagem: stratagem,
    defStratagem: 'none',
  };
}

/** The player commits to an invasion: pays for it and takes the troops out of the province. */
export function launch(s: EmpireState, e: Engagement): Cmd {
  const err = spend(s, STRATAGEMS[e.atkStratagem]?.cost ?? 0);
  if (err) return err;
  s.provinces[e.from].troops -= e.atkTroops;
  return { ok: true, msg: 'The army marches.' };
}

export function autoResolve(s: EmpireState, e: Engagement): Outcome {
  const rng = rngOf(s);
  const lead = (ids: string[]) => 1 + ids.reduce((a, id) => a + power(s.officers[id]), 0) * 0.16;
  const strat = (k: string) => (k === 'none' ? 1 : 1.15);
  const fort = 1 + 0.14 * s.provinces[e.province].fort;
  const a = e.atkTroops * lead(e.atkOfficers) * strat(e.atkStratagem) * rng.range(0.8, 1.2);
  const d = Math.max(60, e.defTroops) * lead(e.defOfficers) * strat(e.defStratagem) * fort * rng.range(0.8, 1.2);
  const attackerWon = a > d;
  const ratio = attackerWon ? d / a : a / d;
  const winLoss = 0.25 + ratio * 0.45,
    loseLoss = 0.6 + rng.range(0, 0.25);
  const fallen: string[] = [];
  for (const id of attackerWon ? e.defOfficers : e.atkOfficers) if (rng.chance(0.6)) fallen.push(id);
  for (const id of attackerWon ? e.atkOfficers : e.defOfficers) if (rng.chance(0.12 + ratio * 0.15)) fallen.push(id);
  return { attackerWon, atkLeft: Math.round(e.atkTroops * (1 - (attackerWon ? winLoss : loseLoss))), defLeft: Math.round(e.defTroops * (1 - (attackerWon ? loseLoss : winLoss))), fallen, fought: false };
}

/** Write a battle's result back into the campaign. Returns a summary for the UI. */
export function applyOutcome(s: EmpireState, e: Engagement, out: Outcome): string[] {
  const rng = rngOf(s);
  const lines: string[] = [];
  const prov = s.provinces[e.province];
  const pn = PROVINCES[e.province].name;
  const A = clanInfo(s, e.attacker).name,
    D = clanInfo(s, e.defender).name;
  const winner = out.attackerWon ? e.attacker : e.defender,
    loser = out.attackerWon ? e.defender : e.attacker;
  const loserIds = out.attackerWon ? e.defOfficers : e.atkOfficers;
  const winnerIds = out.attackerWon ? e.atkOfficers : e.defOfficers;

  for (const id of [...e.atkOfficers, ...e.defOfficers]) s.officers[id].xp += out.fought ? 320 : 160;
  for (const id of winnerIds) s.officers[id].loyalty = Math.min(100, s.officers[id].loyalty + 4);

  // beaten officers on the losing side may be taken; on the winning side they are only wounded
  const taken: string[] = [];
  for (const id of loserIds) {
    const o = s.officers[id];
    if (out.fallen.includes(id) && winner && rng.chance(0.65)) {
      o.captive = winner;
      taken.push(id);
    }
  }

  if (out.attackerWon) {
    prov.owner = e.attacker;
    prov.troops = Math.max(60, out.atkLeft);
    prov.fort = Math.max(0, prov.fort - 1);
    for (const id of e.atkOfficers) s.officers[id].loc = e.province;
    if (loser) {
      // survivors fall back to the nearest province their clan still holds
      const homes = owned(s, loser);
      for (const o of officersAt(s, e.province, loser)) {
        if (homes.length) o.loc = homes.sort((x, y) => dist(x, e.province) - dist(y, e.province))[0];
      }
      const back = homes.find((h) => ADJ[e.province].includes(h));
      if (back !== undefined) s.provinces[back].troops += Math.round(out.defLeft * 0.5);
    }
    lines.push(`${A} have taken ${pn}${e.defender ? ` from ${D}` : ''}.`);
    say(s, `${A} conquered ${pn}${e.defender ? ` from ${D}` : ''}.`, e.attacker === s.player ? 'good' : e.defender === s.player ? 'bad' : 'war');
    s.clans[e.attacker].fame = Math.min(100, s.clans[e.attacker].fame + 3);
  } else {
    prov.troops = Math.max(60, out.defLeft);
    s.provinces[e.from].troops += out.atkLeft;
    lines.push(`${D} held ${pn} against ${A}.`);
    say(s, `${D} threw back ${A} at ${pn}.`, e.defender === s.player ? 'good' : e.attacker === s.player ? 'bad' : 'war');
    if (e.defender) s.clans[e.defender].fame = Math.min(100, s.clans[e.defender].fame + 2);
  }

  if (winner === s.player) s.stats.battlesWon++;
  else if (loser === s.player) s.stats.battlesLost++;
  if (!out.fought && (e.attacker === s.player || e.defender === s.player)) s.stats.auto++;
  if (e.defender && e.attacker) {
    rel(s, e.attacker, e.defender).trust = Math.max(0, rel(s, e.attacker, e.defender).trust - 15);
    rel(s, e.defender, e.attacker).trust = rel(s, e.attacker, e.defender).trust;
  }

  // captives
  for (const id of taken) {
    const o = s.officers[id];
    if (winner === s.player) {
      s.captives.push(id);
      lines.push(`${o.def.name} was captured.`);
    } else if (winner) aiJudge(s, winner, o, rng);
  }
  if (loser) checkFall(s, loser, winner);
  return lines;
}

const dist = (a: number, b: number) => Math.hypot(PROVINCES[a].x - PROVINCES[b].x, PROVINCES[a].y - PROVINCES[b].y);

function aiJudge(s: EmpireState, clan: string, o: EOfficer, rng: Rng) {
  const wasRuler = o.clan && s.clans[o.clan]?.ruler === o.id;
  if (!wasRuler && rng.chance(0.45)) {
    say(s, `${o.def.name} now serves ${clanInfo(s, clan).name}.`, o.clan === s.player ? 'bad' : 'info');
    Object.assign(o, { clan, captive: null, loyalty: 55, loc: s.officers[s.clans[clan].ruler].loc, def: { ...o.def, clan } });
  } else if (s.clans[clan].temper === 'reckless' && rng.chance(0.25) && !wasRuler) {
    o.dead = true;
    o.captive = null;
    say(s, `${clanInfo(s, clan).name} executed ${o.def.name}.`, 'bad');
  } else {
    o.captive = null;
    if (o.clan && owned(s, o.clan).length) o.loc = owned(s, o.clan)[0];
  }
}

/** A clan with no land is finished; its people scatter. */
function checkFall(s: EmpireState, clan: string, to: string | null) {
  if (!s.clans[clan] || owned(s, clan).length) return;
  s.clans[clan].alive = false;
  say(s, `The ${clanInfo(s, clan).name} clan has been destroyed.`, clan === s.player ? 'bad' : 'war');
  for (const o of Object.values(s.officers)) {
    if (o.clan !== clan) continue;
    if (o.captive) continue; // judged separately
    o.clan = null;
    o.known = true;
    o.loyalty = 50;
    if (to && to !== s.player && rngOf(s).chance(0.4)) Object.assign(o, { clan: to, def: { ...o.def, clan: to } });
  }
  if (clan === s.player) s.over = { won: false, title: 'Your Line Is Ended', text: `In ${SEASONS[s.season].toLowerCase()} of ${s.year} the last castle fell. The ${clanInfo(s, clan).name} name passes into the chronicles of others.` };
}

/** What the player does with a prisoner. */
export function judge(s: EmpireState, id: string, verdict: 'recruit' | 'release' | 'execute'): string {
  const o = s.officers[id];
  const rng = rngOf(s);
  const me = s.clans[s.player];
  s.captives = s.captives.filter((x) => x !== id);
  const homeless = !o.clan || !s.clans[o.clan]?.alive;
  if (verdict === 'recruit') {
    const wasRuler = o.clan && s.clans[o.clan]?.ruler === id && !homeless;
    let chance = 0.3 + me.fame / 220 + (homeless ? 0.4 : 0) - (o.def.personality === 'honorable' ? 0.15 : 0) + (100 - o.loyalty) / 250 - (wasRuler ? 0.5 : 0);
    if (rng.chance(chance)) {
      Object.assign(o, { clan: s.player, captive: null, loyalty: 50, loc: s.officers[me.ruler].loc, def: { ...o.def, clan: s.player } });
      s.stats.recruited++;
      return `${o.def.name} bows. “My spear is yours.”`;
    }
    s.captives.push(id);
    o.loyalty += 15; // asked and refused: they won't be asked twice
    return `${o.def.name} refuses to serve you. Release or execute?`;
  }
  if (verdict === 'release') {
    o.captive = null;
    if (homeless) {
      o.clan = null;
      o.known = true;
    } else {
      o.loc = owned(s, o.clan!)[0] ?? o.loc;
      rel(s, s.player, o.clan!).trust = Math.min(100, rel(s, s.player, o.clan!).trust + 8);
    }
    me.fame = Math.min(100, me.fame + 3);
    s.stats.released++;
    return `${o.def.name} is escorted to the border. Word of your mercy spreads.`;
  }
  o.dead = true;
  o.captive = null;
  me.fame = Math.max(0, me.fame - 5);
  for (const x of officersOf(s, s.player)) x.loyalty = Math.max(0, x.loyalty - (x.def.personality === 'honorable' ? 6 : 2));
  if (o.clan && s.clans[o.clan]?.alive) rel(s, s.player, o.clan).trust = rel(s, o.clan, s.player).trust = Math.max(0, rel(s, s.player, o.clan).trust - 20);
  s.stats.executed++;
  if (o.clan && s.clans[o.clan]?.ruler === id && s.clans[o.clan].alive) succession(s, o.clan);
  return `${o.def.name} is put to death. Your retainers watch in silence.`;
}

function succession(s: EmpireState, clan: string) {
  const heir = officersOf(s, clan).sort((a, b) => power(b) - power(a))[0];
  if (heir) {
    s.clans[clan].ruler = heir.id;
    heir.loyalty = 100;
    say(s, `${heir.def.name} takes command of the ${clanInfo(s, clan).name}.`);
  }
}

// ---------------------------------------------------------------- season turnover
/** Run every other clan's turn and roll the calendar. Attacks on the player are queued in s.pending. */
export function endSeason(s: EmpireState) {
  const rng = rngOf(s);
  for (const c of Object.values(s.clans)) if (c.alive && c.id !== s.player) aiTurn(s, c, rng);

  s.season = (s.season + 1) % 4;
  if (s.season === 0) s.year++;
  s.turn++;

  for (const c of Object.values(s.clans)) {
    if (!c.alive) continue;
    const inc = income(s, c.id);
    c.gold += inc.gold;
    if (s.season === 3) c.rice += inc.harvest; // the autumn harvest is counted as winter begins
    c.rice -= inc.upkeep;
    if (c.rice < 0) {
      c.rice = 0;
      for (const i of owned(s, c.id)) s.provinces[i].troops = Math.round(s.provinces[i].troops * 0.88);
      if (c.id === s.player) say(s, 'Your granaries are empty. Men are deserting.', 'bad');
    }
    for (const r of Object.values(c.rel)) if (r.status === 'truce' && s.turn >= r.until) r.status = 'neutral';
    // retainers judge their lord by fame and by how the war is going
    for (const o of officersOf(s, c.id)) {
      if (o.id === c.ruler) continue;
      const target = 45 + c.fame * 0.4 + (o.def.personality === 'honorable' ? 12 : o.def.personality === 'cunning' ? -8 : 0);
      o.loyalty += Math.sign(target - o.loyalty) * rng.range(0, 3);
      if (o.loyalty < 22 && rng.chance(0.3)) desert(s, o, rng);
    }
  }
  // independents slowly rebuild
  for (const p of s.provinces) if (!p.owner) p.troops = Math.min(700, p.troops + 20);

  if (s.season === 3 && s.clans[s.player].alive) say(s, `The harvest is in. Your storehouses hold ${s.clans[s.player].rice} rice.`);
  randomEvent(s, rng);

  // rival lords may come to you
  if (s.clans[s.player].alive)
    for (const c of Object.values(s.clans)) {
      if (!c.alive || c.id === s.player) continue;
      const r = rel(s, c.id, s.player);
      const borders = owned(s, c.id).some((i) => ADJ[i].some((j) => s.provinces[j].owner === s.player));
      if (borders && r.status === 'neutral' && r.trust > 45 && rng.chance(0.07) && !s.offers.some((o) => o.from === c.id)) s.offers.push({ from: c.id, kind: strength(s, s.player) > strength(s, c.id) ? 'ally' : 'truce' });
    }

  s.actions = maxActions(s);
  checkVictory(s);
}

function desert(s: EmpireState, o: EOfficer, rng: Rng) {
  const from = o.clan!;
  const rivals = [...new Set(ADJ[o.loc].map((j) => s.provinces[j].owner).filter((c): c is string => !!c && c !== from))];
  const to = rivals.length ? rng.pick(rivals) : null;
  if (to) {
    Object.assign(o, { clan: to, loyalty: 60, loc: owned(s, to)[0], def: { ...o.def, clan: to } });
    say(s, `${o.def.name} has deserted ${clanInfo(s, from).name} for ${clanInfo(s, to).name}.`, from === s.player ? 'bad' : to === s.player ? 'good' : 'info');
  } else {
    Object.assign(o, { clan: null, loyalty: 50, known: true });
    say(s, `${o.def.name} has left ${clanInfo(s, from).name} to wander.`, from === s.player ? 'bad' : 'info');
  }
}

function randomEvent(s: EmpireState, rng: Rng) {
  if (!rng.chance(0.22)) return;
  const mine = owned(s, s.player);
  if (!mine.length) return;
  const i = rng.pick(mine),
    p = s.provinces[i],
    n = PROVINCES[i].name,
    c = s.clans[s.player];
  switch (rng.int(0, 4)) {
    case 0:
      c.rice += 250;
      say(s, `A bumper crop in ${n}: 250 extra rice.`, 'good');
      break;
    case 1:
      p.troops = Math.round(p.troops * 0.85);
      say(s, `Fever sweeps the barracks in ${n}.`, 'bad');
      break;
    case 2:
      c.gold += 200;
      say(s, `Foreign traders put in at ${n} and pay handsomely for the privilege.`, 'good');
      break;
    case 3:
      if (p.farm > 0) p.farm--;
      say(s, `A typhoon tears through ${n}; the paddies are ruined.`, 'bad');
      break;
    case 4:
      c.fame = Math.min(100, c.fame + 4);
      say(s, `A poet at court praises your rule. Your fame grows.`, 'good');
      break;
  }
}

function aiTurn(s: EmpireState, c: EClan, rng: Rng) {
  const mine = owned(s, c.id);
  if (!mine.length) return;
  const hard = s.difficulty === 'hard' || s.difficulty === 'chaos';
  // build and levy
  for (const i of mine) {
    const p = s.provinces[i];
    const border = ADJ[i].some((j) => s.provinces[j].owner !== c.id);
    if (c.gold > 400 && rng.chance(0.5)) {
      const what = rng.pick(['dev', 'farm', border ? 'fort' : 'dev'] as const);
      const cost = what === 'dev' ? COST.develop(p) : what === 'farm' ? COST.cultivate(p) : COST.fortify(p);
      if (p[what] < 5 && c.gold >= cost) {
        c.gold -= cost;
        p[what]++;
      }
    }
    if (border && c.gold > 250 && c.rice > 300 && p.troops < 1400 + mine.length * 60) {
      const n = rng.int(1, hard ? 4 : 3);
      c.gold -= COST.recruitGold * n;
      c.rice -= COST.recruitRice * n;
      p.troops += n * 100;
    }
  }
  // interior garrisons feed the frontier
  for (const i of mine) {
    const p = s.provinces[i];
    if (ADJ[i].every((j) => s.provinces[j].owner === c.id) && p.troops > 300) {
      const to = ADJ[i].find((j) => ADJ[j].some((k) => s.provinces[k].owner !== c.id)) ?? ADJ[i][0];
      const move = p.troops - 250;
      p.troops -= move;
      s.provinces[to].troops += move;
      for (const o of officersAt(s, i, c.id)) if (o.id !== c.ruler || rng.chance(0.3)) o.loc = to;
    }
  }
  // look for a fight worth having
  const boldness = { reckless: 1.15, cunning: 1.35, honorable: 1.45, patient: 1.7 }[c.temper] * (hard ? 0.9 : 1);
  // every province bordering a target can send men, so big clans can mass against a strong point
  let best: { from: number; to: number; ratio: number; srcs: number[] } | null = null;
  const targets = new Set<number>();
  for (const i of mine) for (const j of ADJ[i]) if (s.provinces[j].owner !== c.id) targets.add(j);
  for (const j of targets) {
    const t = s.provinces[j];
    if (t.owner && rel(s, c.id, t.owner).status !== 'neutral') continue;
    const srcs = ADJ[j].filter((i) => s.provinces[i].owner === c.id && s.provinces[i].troops >= 350).sort((a, b) => s.provinces[b].troops - s.provinces[a].troops);
    if (!srcs.length) continue;
    const men = srcs.reduce((a, i) => a + s.provinces[i].troops * 0.7, 0);
    if (men < 320) continue;
    const lead = 1 + srcs.flatMap((i) => officersAt(s, i, c.id)).reduce((a, o) => a + power(o), 0) * 0.16;
    const dlead = 1 + officersAt(s, j, t.owner).reduce((a, o) => a + power(o), 0) * 0.16;
    let ratio = (men * lead) / (Math.max(80, t.troops) * dlead * (1 + 0.14 * t.fort));
    // low trust makes a neighbour a more tempting target
    if (t.owner) ratio *= 1.15 - rel(s, c.id, t.owner).trust / 400;
    if (t.owner === s.player && s.turn < 4) ratio *= 0.6; // a little grace at the start
    if (ratio > boldness && (!best || ratio > best.ratio)) best = { from: srcs[0], to: j, ratio, srcs };
  }
  if (best && rng.chance(0.7)) {
    const here = best.srcs.flatMap((i) => officersAt(s, i, c.id)).sort((a, b) => power(b) - power(a));
    let men = 0;
    for (const i of best.srcs) {
      const n = Math.round(s.provinces[i].troops * 0.7);
      s.provinces[i].troops -= n;
      men += n;
    }
    s.provinces[best.from].troops += men; // gathered at the staging province; plan() takes them from there
    const e = plan(s, c.id, best.from, best.to, here.slice(0, 4).map((o) => o.id), men);
    if (c.gold > 500 && rng.chance(hard ? 0.5 : 0.25)) {
      e.atkStratagem = rng.pick(['ambush', 'fire', 'rally']);
      c.gold -= STRATAGEMS[e.atkStratagem].cost;
    }
    s.provinces[best.from].troops -= e.atkTroops;
    if (e.defender === s.player) {
      s.pending.push(e);
      say(s, `${clanInfo(s, c.id).name} are marching on ${PROVINCES[best.to].name}!`, 'bad');
    } else applyOutcome(s, e, autoResolve(s, e));
  }
  // pacts between rivals: the weak huddle together, the cunning turn on friends
  for (const o of Object.values(s.clans)) {
    if (!o.alive || o.id === c.id || o.id === s.player) continue;
    const r = rel(s, c.id, o.id);
    if (r.status === 'neutral' && r.trust > 50 && rng.chance(0.03)) setRel(s, c.id, o.id, 'truce', s.turn + 8);
  }
  const pr = rel(s, c.id, s.player);
  if (pr.status === 'ally' && c.temper === 'cunning' && pr.trust < 40 && strength(s, c.id) > strength(s, s.player) * 1.5 && rng.chance(0.15)) {
    setRel(s, c.id, s.player, 'neutral');
    say(s, `${clanInfo(s, c.id).name} have renounced their alliance with you!`, 'bad');
  }
}

export function answerOffer(s: EmpireState, o: Offer, accept: boolean) {
  s.offers = s.offers.filter((x) => x !== o);
  if (accept) {
    setRel(s, s.player, o.from, o.kind, s.turn + (o.kind === 'truce' ? 8 : 9999));
    s.stats.pacts++;
    say(s, `You ${o.kind === 'ally' ? 'are now allied with' : 'have a truce with'} ${clanInfo(s, o.from).name}.`, 'good');
  } else rel(s, o.from, s.player).trust = rel(s, s.player, o.from).trust = Math.max(0, rel(s, s.player, o.from).trust - 8);
}

export function checkVictory(s: EmpireState) {
  if (s.over) return;
  const me = s.player;
  if (!owned(s, me).length) return;
  // the realm is unified when every province is yours or a sworn ally's
  const done = s.provinces.every((p) => p.owner === me || (p.owner && rel(s, me, p.owner).status === 'ally'));
  if (!done) return;
  const st = s.stats;
  const name = s.officers[s.clans[me].ruler].def.name;
  const years = s.year - (SCENARIOS.find((x) => x.id === s.scenario)?.year ?? s.year);
  let title: string, text: string;
  if (st.executed >= 5 || st.betrayals >= 2) {
    title = 'The Demon’s Peace';
    text = `${name} unified the land in ${years} years by fire, betrayal and the executioner’s block. The roads are quiet now. Nobody dares be otherwise.`;
  } else if (st.pacts >= 3 && st.released >= st.executed) {
    title = 'The Realm at Ease';
    text = `${name} bound the provinces together with oaths as much as with spears. After ${years} years of war the lords of Japan bow to one house, and most of them do so gladly.`;
  } else if (st.auto > st.battlesWon * 0.6) {
    title = 'The Strategist’s Realm';
    text = `${name} rarely drew a blade. Maps, granaries and patient generals did the work, and in ${years} years the whole of Japan answered to one seal.`;
  } else {
    title = 'Tenka Fubu';
    text = `${name} rode at the front of every charge for ${years} years, and at the end of the last one there was nobody left to fight. The land is one, under the sword.`;
  }
  s.over = { won: true, title, text };
}

// ---------------------------------------------------------------- battles from engagements
const POSTS: [number, number][] = [
  [0, 95],
  [-57, 43],
  [56, 42],
  [0, 26],
  [22, 62],
];

/** Build the action battle for an engagement. Team 0 attacks from the south; team 1 defends the north. */
export function engagementBattle(s: EmpireState, e: Engagement, playerOfficer: string): BattleDef {
  const pn = PROVINCES[e.province].name;
  const prov = s.provinces[e.province];
  const A = clanInfo(s, e.attacker),
    D = clanInfo(s, e.defender);
  const fort = prov.fort;
  const g = 1 + fort * 0.22;
  const mk = (id: string) => {
    const o = s.officers[id];
    return levelled(o.def, levelOf(o.xp).level);
  };
  const side = (ids: string[], team: number, clan: string | null) => {
    let defs = ids.map(mk);
    if (!defs.length) defs = [retainer(team ? `${pn} Castellan` : 'Vanguard Captain', clan ?? 'oda', { hp: 380 }), retainer(team ? 'Garrison Captain' : 'Rear Captain', clan ?? 'oda', { hp: 320 })];
    // the clan's ruler commands if present, otherwise the strongest officer
    const ruler = clan ? s.clans[clan]?.ruler : null;
    defs.sort((a, b) => (b.id === ruler ? 1 : 0) - (a.id === ruler ? 1 : 0) || b.hp * b.atk - a.hp * a.atk);
    const z = team === 0 ? -1 : 1;
    return defs.map((def, i) => ({ def, team, x: POSTS[i][0], z: POSTS[i][1] * z, commander: i === 0, squad: i === 0 ? 16 : 14, player: def.id === playerOfficer }));
  };
  const officers = [...side(e.atkOfficers, 0, e.attacker), ...side(e.defOfficers, 1, e.defender)];
  // whoever the player asked for, somebody on their side has to be under their control
  const mine = e.attacker === s.player ? 0 : e.defender === s.player ? 1 : -1;
  if (mine >= 0 && !officers.some((o) => o.player)) officers.find((o) => o.team === mine)!.player = true;
  const scale = (n: number) => Math.round(Math.max(220, Math.min(1700, n)));
  const reserves: [number, number] = [scale(e.atkTroops), scale(e.defTroops)];
  const events: BattleEvent[] = [];
  let sky: BattleDef['sky'] = (['day', 'day', 'dusk', 'snow'] as const)[s.season];
  const strat = (k: string, me: number) => {
    const foe = 1 - me;
    const rear = foe === 1 ? 80 : -80;
    switch (k) {
      case 'ambush':
        events.push({ when: { time: 90 }, title: 'Hidden Detachment', msg: `${me === 0 ? A.name : D.name} troops burst from cover behind the enemy lines!`, team: me, morale: [me, 10], reinforce: { team: me, x: 55, z: rear, troops: 34 } });
        break;
      case 'night':
        sky = 'night';
        events.push({ when: { time: 2 }, title: 'Night Raid', msg: 'The defenders stumble from their bedrolls.', team: me, morale: [foe, -16] });
        break;
      case 'fire':
        reserves[foe] = Math.round(reserves[foe] * 0.88);
        events.push({ when: { time: 60 }, title: 'Fire Attack', msg: 'Flames race through the enemy stores!', team: me, morale: [foe, -14] });
        break;
      case 'rally':
        events.push({ when: { time: 2 }, title: 'War Drums', msg: 'The drums roll and the whole line surges forward.', team: me, morale: [me, 18] });
        break;
      case 'bribe': {
        const turncoat = officers.find((o) => o.team === foe && !o.commander && !o.player);
        if (turncoat) events.push({ when: { time: 110 }, title: 'Bought Loyalty', msg: `${turncoat.def.name} turns on their own side!`, team: me, defect: turncoat.def.id });
        break;
      }
    }
  };
  strat(e.atkStratagem, 0);
  strat(e.defStratagem, 1);
  // a sworn ally next door rides to the player's aid
  const pTeam = e.attacker === s.player ? 0 : 1;
  const ally = Object.values(s.clans).find((c) => c.alive && c.id !== s.player && rel(s, s.player, c.id).status === 'ally' && c.id !== e.attacker && c.id !== e.defender && owned(s, c.id).some((i) => ADJ[e.province].includes(i)));
  if (ally) {
    const lead = officersOf(s, ally.id).sort((a, b) => power(b) - power(a))[0];
    if (lead) events.push({ when: { time: 150 }, title: 'Allies Arrive', msg: `${clanInfo(s, ally.id).name} banners crest the ridge. Your ally has come!`, team: pTeam, morale: [pTeam, 12], reinforce: { team: pTeam, x: -70, z: 0, troops: 30, officers: [{ def: mk(lead.id), squad: 14 }] } });
  }
  return {
    colors: [A.color, D.color],
    mons: [A.mon, D.mon || '城'],
    id: `empire_${e.province}`,
    name: `${e.defender ? 'Battle' : 'Subjugation'} of ${pn}`,
    year: s.year,
    blurb: `${A.name} march on ${pn}.`,
    half: 120,
    sides: [A.name, e.defender ? D.name : `${pn} Lords`],
    clans: [e.attacker, e.defender ?? 'independent'],
    sky,
    reserves,
    cap: 190,
    bases: [
      { name: `${A.name} Main Camp`, x: 0, z: -95, team: 0, main: true },
      { name: 'West Siege Camp', x: -58, z: -44, team: 0 },
      { name: 'East Siege Camp', x: 56, z: -42, team: 0 },
      { name: `${pn} Crossroads`, x: 0, z: 0, team: fort >= 2 ? 1 : -1, g },
      { name: 'West Fort', x: -58, z: 44, team: 1, g },
      { name: 'East Fort', x: 58, z: 46, team: 1, g },
      { name: `${pn} Castle`, x: 0, z: 96, team: 1, main: true, g },
    ],
    officers,
    obstacles: [],
    events,
  };
}

/** Read a finished battle back as an Outcome. */
export function outcomeOf(e: Engagement, w: { ended: { winner: number } | null; alive: number[]; reserves: number[]; fighters: { def: OfficerDef; dead: boolean }[]; def: BattleDef }, quit: boolean, playerTeam: number): Outcome {
  const winner = quit || !w.ended ? 1 - playerTeam : w.ended.winner;
  // field numbers are clamped for the battle; scale survivors back to the real army size
  const frac = (t: number) => Math.min(1, (w.alive[t] + w.reserves[t]) / Math.max(1, w.def.reserves[t] + 60));
  const fallen = w.fighters.filter((f) => f.dead).map((f) => f.def.id);
  const all = new Set([...e.atkOfficers, ...e.defOfficers]);
  return { attackerWon: winner === 0, atkLeft: Math.round(e.atkTroops * frac(0) * (winner === 0 ? 1 : 0.6)), defLeft: Math.round(e.defTroops * frac(1) * (winner === 1 ? 1 : 0.5)), fallen: fallen.filter((id) => all.has(id)), fought: true };
}
