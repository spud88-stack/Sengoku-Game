import { Rng } from '../core/math';
import type { OfficerDef } from '../sim/types';
import type { BattleDef, BattleEvent, Sky } from '../sim/world';
import { OFFICERS, retainer } from './officers';

interface Slot {
  def: OfficerDef;
  x: number;
  z: number;
  commander?: boolean;
  squad?: number;
}

export interface BattleSpec {
  id: string;
  name: string;
  year: number;
  blurb: string;
  /** what makes this field different, shown at the briefing */
  twist: string;
  half: number;
  sides: [string, string];
  clans: [string, string];
  sky: Sky;
  reserves: [number, number];
  cap: number;
  bases: BattleDef['bases'];
  armies: [Slot[], Slot[]];
  events?: BattleEvent[];
  trees?: number;
}

const O = OFFICERS;
const r = retainer;

/** The standard seven-camp layout: a main camp and two forward camps each, with one contested point in the middle. */
function camps(names: [string, string, string, string, string, string, string], mid: number, half = 120): BattleDef['bases'] {
  const k = half / 120;
  return [
    { name: names[0], x: 0, z: -95 * k, team: 0, main: true },
    { name: names[1], x: -58 * k, z: -44 * k, team: 0 },
    { name: names[2], x: 56 * k, z: -42 * k, team: 0 },
    { name: names[3], x: 0, z: 0, team: mid },
    { name: names[4], x: -58 * k, z: 44 * k, team: 1 },
    { name: names[5], x: 58 * k, z: 46 * k, team: 1 },
    { name: names[6], x: 0, z: 96 * k, team: 1, main: true },
  ];
}
/** Officer posts matching camps(): commander at the main camp, others at the forward camps and behind the middle. */
function army(team: number, list: [OfficerDef, number?][], half = 120): Slot[] {
  const s = team === 0 ? -1 : 1,
    k = half / 120;
  const posts: [number, number][] = [
    [0, 95],
    [-57, 43],
    [56, 42],
    [0, 26],
    [22, 62],
    [-24, 64],
  ];
  return list.map(([def, squad], i) => ({ def, x: posts[i][0] * k, z: posts[i][1] * k * s, commander: i === 0, squad: squad ?? (i === 0 ? 16 : 14) }));
}

export const BATTLES: BattleSpec[] = [
  {
    id: 'ueda',
    name: 'Siege of Ueda',
    year: 1585,
    blurb: 'Seven thousand Tokugawa march on a small mountain castle. The Sanada have twelve hundred men and every trick in the book.',
    twist: 'Open ground and an even fight. Take the Central Crossing and Masayuki opens the river dam on the Tokugawa rear.',
    half: 120,
    sides: ['Sanada', 'Tokugawa'],
    clans: ['sanada', 'tokugawa'],
    sky: 'day',
    reserves: [700, 900],
    cap: 190,
    bases: camps(['Ueda Castle', 'West Hill Camp', 'River Ford', 'Central Crossing', 'Kangawa Camp', 'East Ridge Camp', 'Tokugawa Main Camp'], 1),
    armies: [
      army(0, [[r('Sanada Masayuki', 'sanada', { personality: 'cunning', title: 'Lord of Ueda', hp: 440, weapon: 'katana' }), 12], [O.yukimura], [r('Sanada Nobuyuki', 'sanada', { personality: 'patient', hp: 400, weapon: 'yari' })], [r('Yazawa Yoritsuna', 'sanada', { personality: 'reckless', hp: 360, weapon: 'naginata' })]]),
      army(1, [
        [r('Torii Mototada', 'tokugawa', { personality: 'honorable', hp: 480, weapon: 'yari', title: 'Tokugawa Vanguard' })],
        [r('Okubo Tadayo', 'tokugawa', { personality: 'reckless', hp: 360, weapon: 'odachi' })],
        [r('Hiraiwa Chikayoshi', 'tokugawa', { personality: 'patient', hp: 360, weapon: 'katana' })],
        [O.tadakatsu, 16],
        [r('Ii Naomasa', 'tokugawa', { personality: 'reckless', hp: 420, primary: 0xb3261e, atk: 0.95, weapon: 'yari' })],
      ]),
    ],
    events: [{ when: { baseTaken: 3, by: 0 }, title: 'The Dam Breaks', msg: 'Masayuki springs his trap: the river is loosed on the Tokugawa rear!', team: 0, morale: [1, -14] }],
  },
  {
    id: 'okehazama',
    name: 'Battle of Okehazama',
    year: 1560,
    blurb: 'Imagawa Yoshimoto marches on Kyoto with twenty-five thousand men. Oda Nobunaga has three thousand and a thunderstorm.',
    twist: 'The Imagawa host is huge but complacent. Take Dengaku Gorge and the storm becomes an ambush.',
    half: 115,
    sides: ['Oda', 'Imagawa'],
    clans: ['oda', 'imagawa'],
    sky: 'rain',
    reserves: [520, 1150],
    cap: 190,
    bases: camps(['Zenshoji Fort', 'Nakajima Fort', 'Washizu Fort', 'Narumi Road', 'Dengaku Gorge', 'Marune Fort', 'Okehazama Hill'], 1, 115),
    armies: [
      army(0, [[O.nobunaga, 14], [O.hideyoshi, 12], [O.keiji, 12], [r('Shibata Katsuie', 'oda', { personality: 'reckless', weapon: 'odachi', hp: 420, atk: 0.95 })]], 115),
      army(
        1,
        [
          [r('Imagawa Yoshimoto', 'imagawa', { title: 'First Archer of the Tokaido', personality: 'patient', weapon: 'katana', hp: 540, crest: 'fan' }), 18],
          [r('Okabe Motonobu', 'imagawa', { personality: 'patient', hp: 380, weapon: 'yari' })],
          [O.ieyasu],
          [r('Asahina Yasutomo', 'imagawa', { personality: 'honorable', weapon: 'naginata' })],
          [O.tadakatsu],
        ],
        115,
      ),
    ],
    events: [
      { when: { time: 100 }, title: 'The Storm Breaks', msg: 'Rain hammers the Imagawa camp. Their sentries take shelter.', team: 0, morale: [1, -8] },
      { when: { baseTaken: 4, by: 0 }, title: 'Surprise Attack!', msg: 'The Oda pour out of Dengaku Gorge into the Imagawa rear!', team: 0, morale: [0, 22] },
      { when: { time: 260 }, unless: { baseTaken: 4, by: 0 }, title: 'Imagawa Advance', msg: 'Fresh Imagawa columns march down the Narumi Road.', team: 1, reinforce: { team: 1, x: 0, z: 60, troops: 40 } },
    ],
  },
  {
    id: 'kawanakajima',
    name: 'Fourth Battle of Kawanakajima',
    year: 1561,
    blurb: 'The Tiger of Kai and the Dragon of Echigo meet on the river plain for the fourth time. Neither intends a fifth.',
    twist: 'Takeda’s woodpecker detachment is circling behind the Uesugi. Hold until it arrives, or break them before it does.',
    half: 120,
    sides: ['Takeda', 'Uesugi'],
    clans: ['takeda', 'uesugi'],
    sky: 'dusk',
    reserves: [820, 780],
    cap: 195,
    bases: camps(['Hachimanbara Camp', 'Kaizu Road', 'Chikuma Ford', 'River Plain', 'Amenomiya Crossing', 'Saijoyama Foot', 'Saijoyama'], -1),
    armies: [
      army(0, [
        [O.shingen],
        [r('Yamagata Masakage', 'takeda', { personality: 'reckless', weapon: 'yari', hp: 440, atk: 0.95, title: 'Red Fire Unit' })],
        [r('Baba Nobuharu', 'takeda', { personality: 'patient', weapon: 'naginata', hp: 420 })],
        [r('Yamamoto Kansuke', 'takeda', { personality: 'cunning', weapon: 'katana', hp: 360, title: 'One-Eyed Strategist' }), 12],
      ]),
      army(1, [
        [O.kenshin],
        [r('Naoe Kagetsuna', 'uesugi', { personality: 'cunning', weapon: 'yari', hp: 380 })],
        [r('Usami Sadamitsu', 'uesugi', { personality: 'patient', weapon: 'katana', hp: 380 })],
        [r('Kakizaki Kageie', 'uesugi', { personality: 'reckless', weapon: 'odachi', hp: 440, atk: 0.95 })],
      ]),
    ],
    events: [
      { when: { time: 45 }, title: 'Wheel Formation', msg: 'Kenshin’s army rolls forward in waves through the fog.', team: 1, reinforce: { team: 1, x: 0, z: 40, troops: 26 } },
      {
        when: { time: 190 },
        title: 'The Woodpecker Arrives',
        msg: 'Kosaka Masanobu’s detachment falls on the Uesugi rear!',
        team: 0,
        morale: [0, 14],
        reinforce: { team: 0, x: 70, z: 92, troops: 24, officers: [{ def: r('Kosaka Masanobu', 'takeda', { personality: 'cunning', weapon: 'yari', hp: 420 }), squad: 16 }] },
      },
      { when: { hp: ['shingen', 0.5] }, title: 'The Tiger Bleeds', msg: 'Shingen has been wounded in his own camp!', team: 1, morale: [1, 10] },
    ],
  },
  {
    id: 'nagashino',
    name: 'Battle of Nagashino',
    year: 1575,
    blurb: 'Takeda Katsuyori throws the finest cavalry in Japan at a line of wooden stakes and three thousand matchlocks.',
    twist: 'Takeda charges come in waves. Oda’s forts hold the line; Takeda must break it before the raid on Tobigasu lands.',
    half: 120,
    sides: ['Oda-Tokugawa', 'Takeda'],
    clans: ['oda', 'takeda'],
    sky: 'day',
    reserves: [900, 760],
    cap: 195,
    bases: camps(['Gokurakuji', 'West Palisade', 'East Palisade', 'Rengo River', 'Shitaragahara', 'Tobigasu Fort', 'Iojiyama'], 0),
    armies: [
      army(0, [[O.nobunaga], [O.hideyoshi], [O.ieyasu], [O.magoichi], [O.tadakatsu, 12]]),
      army(1, [
        [r('Takeda Katsuyori', 'takeda', { title: 'Heir of the Tiger', personality: 'reckless', weapon: 'yari', hp: 520, atk: 1.0, crest: 'horns' })],
        [r('Yamagata Masakage', 'takeda', { personality: 'reckless', weapon: 'yari', hp: 460, atk: 1.0, title: 'Red Fire Unit' }), 16],
        [r('Baba Nobuharu', 'takeda', { personality: 'patient', weapon: 'naginata', hp: 440 })],
        [r('Naito Masatoyo', 'takeda', { personality: 'honorable', weapon: 'katana', hp: 420 }), 16],
        [r('Sanada Nobutsuna', 'takeda', { personality: 'reckless', weapon: 'odachi', hp: 420 })],
      ]),
    ],
    events: [
      { when: { time: 40 }, title: 'First Charge', msg: 'Takeda cavalry thunders toward the palisades!', team: 1, reinforce: { team: 1, x: -20, z: 25, troops: 30 } },
      { when: { time: 130 }, title: 'Second Charge', msg: 'Another Takeda wave crashes into the line!', team: 1, reinforce: { team: 1, x: 20, z: 25, troops: 34 } },
      { when: { time: 210 }, unless: { baseTaken: 3, by: 1 }, title: 'Raid on Tobigasu', msg: 'Sakai Tadatsugu’s night raid strikes the Takeda rear!', team: 0, morale: [0, 16], reinforce: { team: 0, x: 84, z: 60, troops: 22, officers: [{ def: r('Sakai Tadatsugu', 'tokugawa', { personality: 'cunning', weapon: 'yari', hp: 400 }), squad: 14 }] } },
      { when: { time: 250 }, title: 'Final Charge', msg: 'Katsuyori commits everything!', team: 1, reinforce: { team: 1, x: 0, z: 40, troops: 36 } },
    ],
  },
  {
    id: 'honnoji',
    name: 'Incident at Honnoji',
    year: 1582,
    blurb: 'Before dawn, Akechi Mitsuhide turns thirteen thousand men toward the temple where his lord is sleeping.',
    twist: 'Nobunaga has almost no army, but help is coming. Akechi must finish it before Hideyoshi’s vanguard arrives.',
    half: 100,
    sides: ['Akechi', 'Oda'],
    clans: ['akechi', 'oda'],
    sky: 'night',
    reserves: [900, 260],
    cap: 180,
    bases: [
      { name: 'Katsura River Camp', x: 0, z: -78, team: 0, main: true },
      { name: 'South Gate', x: 0, z: -22, team: 1 },
      { name: 'West Quarter', x: -46, z: 8, team: 1 },
      { name: 'East Quarter', x: 46, z: 8, team: 1 },
      { name: 'Honnoji Temple', x: 0, z: 60, team: 1, main: true },
    ],
    armies: [
      [
        { def: O.mitsuhide, x: 0, z: -78, commander: true, squad: 16 },
        { def: r('Akechi Hidemitsu', 'akechi', { personality: 'honorable', weapon: 'yari', hp: 420 }), x: -30, z: -60, squad: 16 },
        { def: r('Saito Toshimitsu', 'akechi', { personality: 'reckless', weapon: 'odachi', hp: 420 }), x: 30, z: -60, squad: 16 },
        { def: r('Mizoo Shigetomo', 'akechi', { personality: 'cunning', weapon: 'katana', hp: 360 }), x: 0, z: -55, squad: 14 },
      ],
      [
        { def: O.nobunaga, x: 0, z: 60, commander: true, squad: 12 },
        { def: r('Mori Ranmaru', 'oda', { title: 'The Page', personality: 'honorable', weapon: 'dual', hp: 400, atk: 0.95, speed: 1.1 }), x: 0, z: -20, squad: 12 },
        { def: O.keiji, x: 44, z: 8, squad: 10 },
      ],
    ],
    events: [
      { when: { baseTaken: 1, by: 0 }, title: 'The Gate Falls', msg: 'Akechi troops flood into the temple grounds. Fire takes the outer halls.', team: 0, morale: [0, 10] },
      { when: { time: 200 }, title: 'Hideyoshi Returns', msg: 'Hideyoshi’s vanguard has force-marched from the west!', team: 1, morale: [1, 18], reinforce: { team: 1, x: -86, z: 20, troops: 50, officers: [{ def: O.hideyoshi, squad: 16 }] } },
    ],
  },
  {
    id: 'sekigahara',
    name: 'Battle of Sekigahara',
    year: 1600,
    blurb: 'One hundred and sixty thousand men in a fog-bound valley, and half of them have not decided whose side they are on.',
    twist: 'Kobayakawa Hideaki watches from Mount Matsuo. He will join whoever looks like winning.',
    half: 125,
    sides: ['Eastern Army', 'Western Army'],
    clans: ['tokugawa', 'ishida'],
    sky: 'day',
    reserves: [950, 950],
    cap: 200,
    bases: camps(['Momokubari', 'Eastern Vanguard', 'Nakasendo Road', 'Valley Floor', 'Mount Matsuo', 'Mount Tengu', 'Sasaoyama'], -1, 125),
    armies: [
      army(0, [[O.ieyasu], [r('Ii Naomasa', 'tokugawa', { title: 'The Red Devil', personality: 'reckless', weapon: 'yari', hp: 440, atk: 0.95, primary: 0xb3261e })], [O.masamune], [O.tadakatsu], [O.hanzo, 10]], 125),
      army(
        1,
        [
          [r('Ishida Mitsunari', 'ishida', { title: 'The Loyal Magistrate', personality: 'cunning', weapon: 'katana', hp: 500, crest: 'fan' })],
          [r('Kobayakawa Hideaki', 'ishida', { id: 'kobayakawa', personality: 'cunning', weapon: 'yari', hp: 420 }), 18],
          [O.ginchiyo],
          [r('Otani Yoshitsugu', 'ishida', { personality: 'patient', weapon: 'naginata', hp: 440 })],
          [O.yoshihiro],
        ],
        125,
      ),
    ],
    events: [
      { when: { time: 90 }, msg: 'Ieyasu fires on Mount Matsuo: “Choose, Kobayakawa!”', team: 0 },
      { when: { time: 200 }, unless: { morale: [0, 36] }, title: 'Betrayal at Mount Matsuo', msg: 'Kobayakawa Hideaki turns his banners against the Western Army!', team: 0, defect: 'kobayakawa' },
      { when: { morale: [0, 30] }, title: 'Kobayakawa Commits', msg: 'Seeing the East falter, Kobayakawa charges down the mountain for the West!', team: 1, morale: [1, 10] },
    ],
  },
  {
    id: 'osaka',
    name: 'Summer Siege of Osaka',
    year: 1615,
    blurb: 'The moats are filled, the walls are down, and the last of the Toyotomi ride out to meet the entire realm.',
    twist: 'The Tokugawa outnumber you three to one and more keep coming. The only way out is through Ieyasu.',
    half: 125,
    sides: ['Toyotomi', 'Tokugawa'],
    clans: ['toyotomi', 'tokugawa'],
    sky: 'dusk',
    reserves: [560, 1300],
    cap: 200,
    bases: camps(['Osaka Castle', 'Sanada Barbican', 'Tennoji Gate', 'Chausuyama', 'Kizu River', 'Okayama', 'Tokugawa Headquarters'], 1, 125),
    armies: [
      army(
        0,
        [
          [r('Toyotomi Hideyori', 'toyotomi', { title: 'Heir of the Taiko', personality: 'patient', weapon: 'katana', hp: 440, crest: 'fan' }), 14],
          [O.yukimura, 16],
          [r('Goto Matabei', 'toyotomi', { title: 'The Spear Ronin', personality: 'reckless', weapon: 'odachi', hp: 460, atk: 1.0 })],
          [r('Chosokabe Morichika', 'chosokabe', { personality: 'honorable', weapon: 'naginata', hp: 420 })],
        ],
        125,
      ),
      army(
        1,
        [
          [O.ieyasu, 18],
          [O.masamune],
          [r('Ii Naotaka', 'tokugawa', { personality: 'honorable', weapon: 'yari', hp: 420, primary: 0xb3261e })],
          [r('Matsudaira Tadanao', 'tokugawa', { personality: 'reckless', weapon: 'yari', hp: 440 }), 16],
          [O.hanzo, 12],
          [r('Honda Tadatomo', 'tokugawa', { personality: 'reckless', weapon: 'yari', hp: 420 })],
        ],
        125,
      ),
    ],
    events: [
      { when: { time: 120 }, title: 'The Realm Arrives', msg: 'More Tokugawa columns pour onto the field.', team: 1, reinforce: { team: 1, x: 40, z: 70, troops: 40 } },
      { when: { baseTaken: 3, by: 0 }, title: 'Chausuyama Taken', msg: 'The road to Ieyasu’s headquarters is open!', team: 0, morale: [0, 18] },
      { when: { hp: ['ieyasu', 0.5] }, title: 'Ieyasu Wavers', msg: 'The Shogun’s standard has fallen! His guard is in disarray.', team: 0, morale: [1, -18] },
      { when: { time: 300 }, title: 'Encirclement', msg: 'Tokugawa reserves close in on Osaka Castle.', team: 1, reinforce: { team: 1, x: -60, z: -20, troops: 40 } },
    ],
  },
];

export const battleSpec = (id: string) => BATTLES.find((b) => b.id === id) ?? BATTLES[0];

/** Which side an officer historically fought on in a battle, or -1. */
export function sideOf(spec: BattleSpec, officerId: string): number {
  for (let t = 0; t < 2; t++) if (spec.armies[t].some((s) => s.def.id === officerId)) return t;
  return -1;
}

function scatterTrees(spec: { half: number; bases: BattleDef['bases'] }, seed: number, n: number) {
  const rng = new Rng(seed);
  const out: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const x = rng.range(-spec.half + 10, spec.half - 10),
      z = rng.range(-spec.half + 10, spec.half - 10);
    if (spec.bases.every((b) => Math.hypot(b.x - x, b.z - z) > 22)) out.push({ x, z, r: rng.range(1.3, 1.9) });
  }
  return out;
}

/**
 * Turn a spec into a playable battle with the player's officer on `side`.
 * If that officer is already in the army they keep their post; otherwise they replace the first non-commander.
 */
export function buildBattle(id: string, player: OfficerDef, side = 0): BattleDef {
  const spec = battleSpec(id);
  const officers: BattleDef['officers'] = [];
  for (let t = 0; t < 2; t++) {
    const list = spec.armies[t].map((s) => ({ ...s }));
    if (t === side) {
      let i = list.findIndex((s) => s.def.id === player.id);
      if (i < 0) i = list.findIndex((s) => !s.commander);
      list[i] = { ...list[i], def: player };
      list.forEach((s, k) => officers.push({ ...s, team: t, player: k === i, squad: k === i ? Math.min(s.squad ?? 10, 10) : s.squad }));
    } else {
      // the same person can't be on both sides
      list.forEach((s) => officers.push({ ...s, team: t, def: s.def.id === player.id ? retainer('Kagemusha', spec.clans[t], { hp: s.def.hp * 0.8, weapon: s.def.weapon, title: 'Body Double' }) : s.def }));
    }
  }
  return {
    id: spec.id,
    name: spec.name,
    year: spec.year,
    blurb: spec.blurb,
    half: spec.half,
    sides: spec.sides,
    clans: spec.clans,
    sky: spec.sky,
    reserves: [Math.round(spec.reserves[0] * 1.4), Math.round(spec.reserves[1] * 1.4)],
    cap: spec.cap,
    bases: spec.bases,
    officers,
    obstacles: scatterTrees(spec, spec.year, spec.trees ?? 18),
    events: (spec.events ?? []).map((e) => ({ ...e })),
  };
}

/** Training ground: one opponent, optional troops. Used for animation and AI checks (?dojo=1&foe=tadakatsu&n=20&ai=1). */
export function dojoBattle(playerId = 'yukimura', foeId = 'masamune', troops = 0): BattleDef {
  const p = OFFICERS[playerId] ?? OFFICERS.yukimura,
    f = OFFICERS[foeId] ?? OFFICERS.masamune;
  return {
    id: 'dojo',
    name: 'Training Ground',
    half: 45,
    sides: ['You', 'Rival'],
    clans: [p.clan, f.clan === p.clan ? 'oda' : f.clan],
    reserves: [0, 0],
    cap: 0,
    bases: [],
    officers: [
      { def: p, team: 0, x: 0, z: -5, player: true },
      { def: f, team: 1, x: 0, z: 5, squad: troops },
    ],
  };
}
