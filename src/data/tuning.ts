/** All balance numbers live here (and in moves.ts / officers.ts), away from logic. */
export const TUNE = {
  tick: 1 / 60,

  fighter: {
    radius: 0.55,
    runSpeed: 7.2,
    accel: 60,
    turnRate: 14,
    jumpVel: 9.5,
    gravity: 26,
    airControl: 0.55,
    dodgeDur: 0.42,
    dodgeSpeed: 15,
    dodgeInvuln: [0.03, 0.28] as const,
    dodgeCancel: 0.26,
    guardMoveMul: 0.35,
    parryWindow: 0.16,
    guardMax: 100,
    guardRegen: 22,
    hitstun: 0.36,
    hitstunDecay: 0.1,
    hitstunFloor: 0.35,
    downTime: 0.55,
    getupTime: 0.35,
    stunTime: 1.0,
    parriedTime: 0.85,
    inputBuffer: 0.22,
    comboResetTime: 0.7,
    dashAfterRun: 0.9,
    aimRange: 6.5,
    aimCone: 100,
  },

  spirit: {
    max: 100,
    perHit: 1.6,
    perKO: 1.2,
    perDamageTaken: 0.35,
    lowHpRegen: 4,
  },

  horse: { speed: 1.75, turn: 4.2, accel: 20, trampleSpeed: 8.5 },

  rage: {
    max: 100,
    perKO: 0.9,
    perOfficerHit: 1.2,
    duration: 14,
    speedMul: 1.18,
    dmgMul: 1.35,
  },

  soldier: {
    radius: 0.42,
    speed: 3.6,
    hp: 30,
    dmgToFighter: 5,
    dmgToSoldier: 6.5,
    windup: 0.5,
    strike: 0.16,
    recover: 0.45,
    reach: 2.0,
    cooldown: [1.4, 3.0] as const,
    staggerTime: 0.42,
    downTime: 0.9,
    corpseTime: 3.2,
    engageFighter: 13,
    engageSoldier: 9,
    maxAttackers: 3,
    ringRadius: 3.1,
  },

  morale: {
    start: 50,
    baseCapture: 6,
    officerDown: 10,
    ko100: 3,
  },

  base: {
    radius: 11,
    garrison: 46,
    defenders: 10,
    /** seconds between reinforcement waves per army */
    spawnEvery: 5,
    squadSize: 9,
    /** how much of a kill by rank-and-file counts against a garrison (officers count in full) */
    troopKillCredit: 0.25,
    npcKillCredit: 0.3,
    healPerSec: 1.4,
  },

  hitstopScale: 1,
  npcDuelScale: 0.16,
  /** AI officers also cut through troops more slowly than the player does */
  npcTroopScale: 0.45,
  /** AI officers march at this fraction of run speed when nobody is in front of them, so fronts take time to move */
  npcMarch: 0.5,
  commanderHp: 1.8,
  /** rank-and-file hits on AI officers are scaled by this */
  troopVsNpc: 0.45,
  officerKillSlowmo: 0.9,
  blood: { max: 1400, decals: 700 },
};

export interface Difficulty {
  name: string;
  /** seconds before an officer reacts to what it sees */
  react: number;
  aggression: number;
  guardSkill: number;
  enemyDmg: number;
  enemyHp: number;
  attackers: number;
}

export const DIFFICULTY: Record<string, Difficulty> = {
  easy: { name: 'Novice', react: 0.42, aggression: 0.45, guardSkill: 0.25, enemyDmg: 0.7, enemyHp: 0.8, attackers: 2 },
  normal: { name: 'Warrior', react: 0.28, aggression: 0.65, guardSkill: 0.5, enemyDmg: 1, enemyHp: 1, attackers: 3 },
  hard: { name: 'Warlord', react: 0.18, aggression: 0.82, guardSkill: 0.72, enemyDmg: 1.35, enemyHp: 1.25, attackers: 4 },
  chaos: { name: 'Demon King', react: 0.1, aggression: 0.95, guardSkill: 0.9, enemyDmg: 1.8, enemyHp: 1.6, attackers: 5 },
};
