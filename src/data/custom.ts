import type { OfficerDef, Personality, WeaponKind } from '../sim/types';
import { OFFICERS } from './officers';

export type Helm = NonNullable<OfficerDef['helm']>;
export type StatKey = 'hp' | 'atk' | 'def' | 'speed';

/** A warrior designed by the player, as saved in the profile. */
export interface CustomWarrior {
  id: string;
  name: string;
  title: string;
  clan: string;
  weapon: WeaponKind;
  personality: Personality;
  primary: number;
  secondary: number;
  crest: OfficerDef['crest'];
  helm: Helm;
  mask: boolean;
  banner: boolean;
  scale: number;
  /** stat points spent */
  points: Record<StatKey, number>;
  enter: string;
  super: string;
}

export const STAT_POINTS = 10;
export const STAT_MAX = 6;
export const STAT_LABELS: Record<StatKey, string> = { hp: 'Vitality', atk: 'Attack', def: 'Defence', speed: 'Speed' };

/** What a design's points come to. Ten points makes a peer of the historical officers. */
export function statsOf(cw: CustomWarrior) {
  const p = cw.points;
  return { hp: Math.round(420 * (1 + 0.075 * p.hp)), atk: 0.94 * (1 + 0.06 * p.atk), def: 0.94 * (1 + 0.065 * p.def), speed: 0.96 * (1 + 0.024 * p.speed) };
}

export function toOfficer(cw: CustomWarrior): OfficerDef & { bio: string; custom: true } {
  return {
    id: cw.id,
    name: cw.name,
    title: cw.title,
    clan: cw.clan,
    weapon: cw.weapon,
    personality: cw.personality,
    ...statsOf(cw),
    primary: cw.primary,
    secondary: cw.secondary,
    crest: cw.crest,
    helm: cw.helm,
    mask: cw.mask,
    banner: cw.banner,
    scale: cw.scale,
    lines: { enter: cw.enter || undefined, super: cw.super || undefined, win: 'Remember my name.', lose: 'Not… yet…' },
    bio: 'A warrior of your own making.',
    custom: true,
  };
}

/** Ids of the custom warriors currently registered, in the order they were made. */
export const CUSTOM_IDS: string[] = [];

/** Make the saved designs playable: they join the officer table beside the historical roster. */
export function registerCustoms(list: CustomWarrior[]) {
  for (const id of CUSTOM_IDS) delete OFFICERS[id];
  CUSTOM_IDS.length = 0;
  for (const cw of list) {
    OFFICERS[cw.id] = toOfficer(cw);
    CUSTOM_IDS.push(cw.id);
  }
}

export function blankWarrior(n: number): CustomWarrior {
  return {
    id: `cw_${Date.now().toString(36)}_${n}`,
    name: 'Nameless Ronin',
    title: 'Wandering Blade',
    clan: 'ronin',
    weapon: 'katana',
    personality: 'honorable',
    primary: 0x7a2a2a,
    secondary: 0x1e1c22,
    crest: 'crescent',
    helm: 'kabuto',
    mask: true,
    banner: true,
    scale: 1,
    points: { hp: 3, atk: 3, def: 2, speed: 2 },
    enter: '',
    super: '',
  };
}
