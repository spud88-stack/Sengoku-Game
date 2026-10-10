import type { OfficerDef } from '../sim/types';

export interface Settings {
  difficulty: string;
  blood: number; // 0 off, 0.5 reduced, 1 full
  shake: number;
  sens: number;
  invertY: boolean;
  master: number;
  sfx: number;
  music: number;
  /** when your officer falls in a field battle, carry on as another */
  fightOn: boolean;
  /** 'low' | 'medium' | 'high', or '' to pick for this device */
  quality: string;
}

export interface OfficerRecord {
  xp: number;
  kos: number;
  battles: number;
}

export interface Profile {
  version: 1;
  settings: Settings;
  officers: Record<string, OfficerRecord>;
  battlesWon: string[];
  totalKos: number;
  bestKos: number;
  tutorialDone: boolean;
  empire: unknown | null;
  empireWins: string[];
  /** warriors the player has designed (see data/custom.ts) */
  customs: any[];
}

const KEY = 'sengoku-warriors.profile';

const fresh = (): Profile => ({
  version: 1,
  settings: { difficulty: 'normal', blood: 1, shake: 1, sens: 1, invertY: false, master: 0.8, sfx: 0.9, music: 0.55, fightOn: true, quality: '' },
  officers: {},
  battlesWon: [],
  totalKos: 0,
  bestKos: 0,
  tutorialDone: false,
  empire: null,
  empireWins: [],
  customs: [],
});

export let profile: Profile = fresh();

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      profile = { ...fresh(), ...p, settings: { ...fresh().settings, ...(p.settings ?? {}) } };
    }
  } catch {
    profile = fresh();
  }
  return profile;
}

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage full or blocked: play on without saving */
  }
}

export function resetProfile() {
  profile = fresh();
  saveProfile();
}

// ---------------------------------------------------------------- levelling
export const MAX_LEVEL = 30;
const xpFor = (level: number) => 250 * level + 40 * level * level;

export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpFor(level)) {
    xp -= xpFor(level);
    level++;
  }
  return { level, into: xp, need: xpFor(level) };
}

export function record(id: string): OfficerRecord {
  return (profile.officers[id] ??= { xp: 0, kos: 0, battles: 0 });
}

/** An officer's stats at their current level. */
export function levelled(def: OfficerDef, level = levelOf(record(def.id).xp).level): OfficerDef {
  const k = level - 1;
  return { ...def, hp: Math.round(def.hp * (1 + 0.035 * k)), atk: def.atk * (1 + 0.022 * k), def: def.def * (1 + 0.012 * k) };
}

export const DIFF_XP: Record<string, number> = { easy: 0.7, normal: 1, hard: 1.5, chaos: 2.2 };
