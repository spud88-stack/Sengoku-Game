import type { OfficerDef, Personality, WeaponKind } from '../sim/types';

export interface Clan {
  name: string;
  color: number;
  accent: number;
  mon: string;
}

export const CLANS: Record<string, Clan> = {
  oda: { name: 'Oda', color: 0x34343f, accent: 0xc9a227, mon: '織' },
  takeda: { name: 'Takeda', color: 0xb3261e, accent: 0xf2e6c9, mon: '武' },
  uesugi: { name: 'Uesugi', color: 0xd8d6cc, accent: 0x27406b, mon: '毘' },
  tokugawa: { name: 'Tokugawa', color: 0x2f7a52, accent: 0xc9a227, mon: '葵' },
  sanada: { name: 'Sanada', color: 0xa81c1c, accent: 0x2b2b2b, mon: '六' },
  date: { name: 'Date', color: 0x1d3a6e, accent: 0xd9b23a, mon: '竹' },
  toyotomi: { name: 'Toyotomi', color: 0xe0701a, accent: 0x7a1f1f, mon: '桐' },
  akechi: { name: 'Akechi', color: 0x4a7fb5, accent: 0xe8e8f0, mon: '桔' },
  imagawa: { name: 'Imagawa', color: 0x9a5fc0, accent: 0xe8d9a0, mon: '今' },
  shimazu: { name: 'Shimazu', color: 0x6f8296, accent: 0xe8e8e0, mon: '十' },
  mori: { name: 'Mori', color: 0x3f8f7f, accent: 0xf0f0e0, mon: '毛' },
  hojo: { name: 'Hojo', color: 0x9aa63a, accent: 0x20202a, mon: '鱗' },
  chosokabe: { name: 'Chosokabe', color: 0x6a3fb5, accent: 0xe0d0f0, mon: '長' },
  otomo: { name: 'Otomo', color: 0xc05a8a, accent: 0xf0f0f0, mon: '杏' },
  saika: { name: 'Saika', color: 0x5a5a2a, accent: 0xd03a2a, mon: '烏' },
  ishida: { name: 'Ishida', color: 0x8a3a2a, accent: 0xf0e0c0, mon: '吉' },
};

const o = (
  id: string,
  name: string,
  title: string,
  clan: string,
  weapon: WeaponKind,
  personality: Personality,
  stats: [hp: number, atk: number, def: number, speed: number],
  look: [primary: number, secondary: number, crest: OfficerDef['crest'], scale?: number],
  lines: NonNullable<OfficerDef['lines']>,
  bio: string,
): OfficerDef & { bio: string } => ({ id, name, title, clan, weapon, personality, hp: stats[0], atk: stats[1], def: stats[2], speed: stats[3], primary: look[0], secondary: look[1], crest: look[2], scale: look[3], lines, bio });

/** The playable roster. Historical figures, original designs. */
export const OFFICERS: Record<string, OfficerDef & { bio: string }> = Object.fromEntries(
  [
    o('yukimura', 'Sanada Yukimura', 'Crimson Demon of War', 'sanada', 'yari', 'honorable', [520, 1.0, 1.0, 1.05], [0xa81c1c, 0x2b2222, 'antlers'], { enter: 'Sanada Yukimura, here to carve a path!', win: 'The six coins are paid in full!', lose: 'Forgive me… my lord…', super: 'Behold the heart of Sanada!' }, 'A cross-bladed spear and a red-armoured charge. Balanced reach and speed; the best place to start.'),
    o('masamune', 'Date Masamune', 'One-Eyed Dragon', 'date', 'katana', 'reckless', [500, 1.05, 0.95, 1.08], [0x1d3a6e, 0x14161f, 'crescent'], { enter: 'The dragon descends! Out of my way!', win: 'Ha! Is that all the realm can offer?', lose: 'Tch… born too late…', super: 'Witness the dragon’s fang!' }, 'A fast, aggressive swordsman who lives in the enemy’s face. Quick strings, sharp launcher.'),
    o('nobunaga', 'Oda Nobunaga', 'Demon King of the Sixth Heaven', 'oda', 'katana', 'cunning', [560, 1.1, 1.0, 1.0], [0x23232e, 0x7a1f1f, 'sun'], { enter: 'Kneel, or burn.', win: 'The realm is mine to remake.', lose: 'Fifty years… a dream within a dream…', super: 'Tenka Fubu!' }, 'Ruthless and precise. Hits harder than any other sword and punishes every mistake.'),
    o('tadakatsu', 'Honda Tadakatsu', 'The Unscathed', 'tokugawa', 'yari', 'patient', [680, 1.15, 1.2, 0.95], [0x1c1c22, 0xc9a227, 'antlers', 1.12], { enter: 'Honda Tadakatsu stands before you. Turn back.', win: 'Not a scratch.', lose: 'So… this is what a wound feels like…', super: 'Tonbokiri, cut the sky!' }, 'Fifty-seven battles without a wound. Enormous health and defence behind the longest spear in the land.'),
    o('kenshin', 'Uesugi Kenshin', 'Dragon of Echigo', 'uesugi', 'naginata', 'honorable', [540, 1.1, 1.05, 1.0], [0xe6e4da, 0x27406b, 'sun'], { enter: 'Bishamonten rides with me.', win: 'Heaven has judged.', lose: 'The sake… was finer than the war…', super: 'By the god of war!' }, 'Great sweeping arcs that own the space around him. Unmatched against crowds.'),
    o('shingen', 'Takeda Shingen', 'Tiger of Kai', 'takeda', 'kanabo', 'patient', [700, 1.2, 1.15, 0.9], [0xb3261e, 0xf2e6c9, 'horns', 1.1], { enter: 'Swift as wind, silent as forest.', win: 'Fierce as fire. Immovable as the mountain.', lose: 'Hide my death… three years…', super: 'The mountain falls on you!' }, 'Three ponderous blows that cannot be interrupted and flatten whatever they touch.'),
    o('hideyoshi', 'Toyotomi Hideyoshi', 'The Monkey Regent', 'toyotomi', 'dual', 'cunning', [460, 0.95, 0.9, 1.15], [0xd98a14, 0x7a1f1f, 'fan'], { enter: 'From sandal-bearer to here. Watch closely!', win: 'Hah! Another rung up the ladder.', lose: 'Like dew I came… like dew I go…', super: 'Bet you didn’t see this coming!' }, 'Twin short blades and the fastest feet in the roster. Every cut lands twice.'),
    o('ieyasu', 'Tokugawa Ieyasu', 'The Patient Tanuki', 'tokugawa', 'yari', 'patient', [600, 1.0, 1.2, 0.95], [0x2f7a52, 0x3a2f14, 'fan'], { enter: 'There is no hurry. The bird will sing.', win: 'Patience wins the realm.', lose: 'I waited… too long…', super: 'Now. Now is the time!' }, 'Sturdy, steady, hard to kill. Wins by outlasting.'),
    o('mitsuhide', 'Akechi Mitsuhide', 'The Thirteen-Day Shogun', 'akechi', 'katana', 'cunning', [500, 1.05, 1.0, 1.05], [0x4a7fb5, 0xe8e8f0, 'plume'], { enter: 'The enemy… is at Honnoji.', win: 'It had to be done.', lose: 'Thirteen days… only thirteen…', super: 'Forgive me, my lord!' }, 'An elegant duelist with a fast guard-break and a long memory.'),
    o('magoichi', 'Saika Magoichi', 'Crow of Saika', 'saika', 'gun', 'reckless', [470, 1.0, 0.9, 1.05], [0x5a5a2a, 0x24241c, 'plume'], { enter: 'The Saika take any contract. Yours just came due.', win: 'One shot, one coin.', lose: 'Powder’s… wet…', super: 'Fire at will!' }, 'Bayonet jabs up close, gunfire on every charge attack. The only officer who kills from across the field.'),
    o('ginchiyo', 'Tachibana Ginchiyo', 'Thunder’s Daughter', 'otomo', 'naginata', 'honorable', [480, 1.05, 0.95, 1.1], [0xc05a8a, 0x2a1c2e, 'crescent', 0.96], { enter: 'The Tachibana do not yield a single step.', win: 'Lightning does not miss.', lose: 'Father… I held the gate…', super: 'Thunder, answer me!' }, 'Quick, long-reaching and proud. A naginata that moves like a sword.'),
    o('keiji', 'Maeda Keiji', 'The Wild Flower', 'oda', 'odachi', 'reckless', [620, 1.2, 1.0, 0.98], [0xd0a020, 0x8a2a5a, 'plume', 1.1], { enter: 'A fine day for a brawl! Who’s first?', win: 'Now that was a festival!', lose: 'Ha… good fight…', super: 'Let’s make it a party!' }, 'A man-sized sword swung like a toy. Slow to start, impossible to stop.'),
    o('yoshihiro', 'Shimazu Yoshihiro', 'Oni Shimazu', 'shimazu', 'kanabo', 'reckless', [660, 1.2, 1.1, 0.92], [0x55687c, 0x1a1a1a, 'cross', 1.08], { enter: 'A Shimazu retreats through the enemy’s centre!', win: 'Chesto!', lose: 'Back to Satsuma… at last…', super: 'Oni’s hammer!' }, 'The devil of Satsuma. A studded iron club and no concept of backing down.'),
    o('hanzo', 'Hattori Hanzo', 'Shadow of Iga', 'tokugawa', 'dual', 'cunning', [440, 1.0, 0.85, 1.2], [0x1a1a24, 0x3a3a55, 'none', 0.97], { enter: '…', win: 'The shadow passes.', lose: 'Darkness… returns…', super: 'Vanish.' }, 'The fastest and frailest. Twin blades, relentless pressure, no margin for error.'),
  ].map((d) => [d.id, d]),
);

export const ROSTER = Object.keys(OFFICERS);

/** Stand-in officers used to fill out armies. */
const GENERIC_NAMES = ['Kuroda', 'Yamagata', 'Baba', 'Naito', 'Kosaka', 'Sakai', 'Ii', 'Sakakibara', 'Shibata', 'Niwa', 'Takigawa', 'Katakura', 'Oniniwa', 'Rusu'];
const GENERIC_WEAPONS: WeaponKind[] = ['yari', 'katana', 'naginata', 'katana', 'yari', 'odachi'];

export function genericOfficer(i: number, clan: string): OfficerDef {
  const c = CLANS[clan] ?? CLANS.oda;
  return {
    id: `gen_${clan}_${i}`,
    name: GENERIC_NAMES[i % GENERIC_NAMES.length],
    title: 'Retainer',
    clan,
    weapon: GENERIC_WEAPONS[i % GENERIC_WEAPONS.length],
    personality: (['reckless', 'patient', 'cunning', 'honorable'] as const)[i % 4],
    hp: 320,
    atk: 0.8,
    def: 0.85,
    speed: 0.97,
    primary: c.color,
    secondary: 0x1c1c22,
    crest: 'none',
  };
}

/** A named minor officer: a generic body with a real name and a few overrides. */
export function retainer(name: string, clan: string, extra: Partial<OfficerDef> = {}): OfficerDef {
  let hsh = 0;
  for (const ch of name) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return { ...genericOfficer(hsh % 24, clan), name, id: name.toLowerCase().replace(/[^a-z]+/g, '_'), ...extra };
}

/** Returns a copy of an officer flying another clan's colours (for Empire Mode recruits and defectors). */
export function inColours(def: OfficerDef, clan: string): OfficerDef {
  return { ...def, clan };
}
