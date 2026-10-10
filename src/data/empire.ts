import type { OfficerDef, Personality, WeaponKind } from '../sim/types';
import { OFFICERS, retainer } from './officers';

export interface ProvinceDef {
  name: string;
  x: number;
  y: number;
  adj: string[];
  /** base gold per season and rice per harvest */
  gold: number;
  rice: number;
}

/** A simplified Japan: thirty-one provinces on a 1000 x 620 map, south-west to north-east. */
export const PROVINCES: ProvinceDef[] = [
  { name: 'Satsuma', x: 95, y: 545, adj: ['Higo'], gold: 70, rice: 70 },
  { name: 'Higo', x: 122, y: 470, adj: ['Satsuma', 'Bungo', 'Chikuzen'], gold: 70, rice: 90 },
  { name: 'Bungo', x: 188, y: 452, adj: ['Higo', 'Chikuzen', 'Iyo'], gold: 80, rice: 70 },
  { name: 'Chikuzen', x: 130, y: 398, adj: ['Higo', 'Bungo', 'Nagato'], gold: 100, rice: 70 },
  { name: 'Iyo', x: 268, y: 472, adj: ['Bungo', 'Tosa', 'Aki'], gold: 60, rice: 60 },
  { name: 'Tosa', x: 315, y: 515, adj: ['Iyo', 'Settsu'], gold: 55, rice: 65 },
  { name: 'Nagato', x: 205, y: 385, adj: ['Chikuzen', 'Aki', 'Izumo'], gold: 70, rice: 60 },
  { name: 'Aki', x: 278, y: 398, adj: ['Nagato', 'Izumo', 'Bizen', 'Iyo'], gold: 85, rice: 70 },
  { name: 'Izumo', x: 292, y: 330, adj: ['Nagato', 'Aki', 'Bizen'], gold: 90, rice: 55 },
  { name: 'Bizen', x: 360, y: 398, adj: ['Aki', 'Izumo', 'Harima'], gold: 80, rice: 75 },
  { name: 'Harima', x: 412, y: 392, adj: ['Bizen', 'Settsu', 'Yamashiro'], gold: 90, rice: 85 },
  { name: 'Settsu', x: 455, y: 425, adj: ['Harima', 'Yamashiro', 'Kii', 'Tosa'], gold: 130, rice: 70 },
  { name: 'Yamashiro', x: 482, y: 372, adj: ['Harima', 'Settsu', 'Omi', 'Echizen', 'Ise'], gold: 140, rice: 60 },
  { name: 'Kii', x: 470, y: 488, adj: ['Settsu', 'Ise'], gold: 70, rice: 60 },
  { name: 'Omi', x: 522, y: 352, adj: ['Yamashiro', 'Echizen', 'Mino', 'Ise'], gold: 100, rice: 100 },
  { name: 'Ise', x: 532, y: 432, adj: ['Yamashiro', 'Kii', 'Omi', 'Owari'], gold: 90, rice: 80 },
  { name: 'Echizen', x: 520, y: 292, adj: ['Yamashiro', 'Omi', 'Kaga', 'Mino'], gold: 85, rice: 90 },
  { name: 'Kaga', x: 548, y: 242, adj: ['Echizen', 'Echigo'], gold: 75, rice: 95 },
  { name: 'Mino', x: 572, y: 352, adj: ['Omi', 'Echizen', 'Owari', 'Shinano'], gold: 90, rice: 100 },
  { name: 'Owari', x: 588, y: 406, adj: ['Ise', 'Mino', 'Mikawa'], gold: 110, rice: 100 },
  { name: 'Mikawa', x: 632, y: 422, adj: ['Owari', 'Suruga', 'Shinano'], gold: 75, rice: 80 },
  { name: 'Suruga', x: 692, y: 428, adj: ['Mikawa', 'Kai', 'Sagami'], gold: 95, rice: 75 },
  { name: 'Kai', x: 702, y: 376, adj: ['Suruga', 'Shinano', 'Sagami', 'Musashi'], gold: 95, rice: 55 },
  { name: 'Shinano', x: 652, y: 328, adj: ['Mino', 'Mikawa', 'Kai', 'Echigo', 'Kozuke'], gold: 75, rice: 85 },
  { name: 'Echigo', x: 702, y: 240, adj: ['Kaga', 'Shinano', 'Kozuke', 'Dewa'], gold: 90, rice: 110 },
  { name: 'Sagami', x: 748, y: 418, adj: ['Suruga', 'Kai', 'Musashi'], gold: 90, rice: 75 },
  { name: 'Musashi', x: 784, y: 376, adj: ['Sagami', 'Kai', 'Kozuke', 'Hitachi'], gold: 110, rice: 110 },
  { name: 'Kozuke', x: 748, y: 318, adj: ['Shinano', 'Echigo', 'Musashi', 'Hitachi'], gold: 70, rice: 80 },
  { name: 'Hitachi', x: 834, y: 334, adj: ['Musashi', 'Kozuke', 'Mutsu'], gold: 80, rice: 95 },
  { name: 'Dewa', x: 772, y: 208, adj: ['Echigo', 'Mutsu'], gold: 65, rice: 95 },
  { name: 'Mutsu', x: 838, y: 168, adj: ['Dewa', 'Hitachi'], gold: 75, rice: 100 },
];

const m = (name: string, clan: string, weapon: WeaponKind, personality: Personality, hp = 380, extra: Partial<OfficerDef> = {}) => retainer(name, clan, { weapon, personality, hp, ...extra });

/** Named retainers beyond the playable roster. They fill out clans and wander as free officers. */
export const MINOR: OfficerDef[] = [
  m('Shibata Katsuie', 'oda', 'odachi', 'reckless', 440, { atk: 0.95 }),
  m('Niwa Nagahide', 'oda', 'yari', 'patient'),
  m('Maeda Toshiie', 'oda', 'yari', 'honorable', 400),
  m('Mori Ranmaru', 'oda', 'dual', 'honorable', 380, { speed: 1.1 }),
  m('Sakai Tadatsugu', 'tokugawa', 'yari', 'cunning', 400),
  m('Ii Naomasa', 'tokugawa', 'yari', 'reckless', 440, { primary: 0xb3261e, atk: 0.95 }),
  m('Sakakibara Yasumasa', 'tokugawa', 'katana', 'patient', 400),
  m('Yamagata Masakage', 'takeda', 'yari', 'reckless', 440, { atk: 0.95 }),
  m('Baba Nobuharu', 'takeda', 'naginata', 'patient', 420),
  m('Yamamoto Kansuke', 'takeda', 'katana', 'cunning', 360),
  m('Kosaka Masanobu', 'takeda', 'yari', 'cunning', 400),
  m('Kakizaki Kageie', 'uesugi', 'odachi', 'reckless', 440, { atk: 0.95 }),
  m('Naoe Kanetsugu', 'uesugi', 'katana', 'honorable', 420),
  m('Usami Sadamitsu', 'uesugi', 'katana', 'patient'),
  m('Imagawa Yoshimoto', 'imagawa', 'katana', 'patient', 480, { crest: 'fan', title: 'First Archer of the Tokaido' }),
  m('Asahina Yasutomo', 'imagawa', 'naginata', 'honorable'),
  m('Okabe Motonobu', 'imagawa', 'yari', 'patient'),
  m('Hojo Ujiyasu', 'hojo', 'yari', 'patient', 500, { crest: 'horns', title: 'Lion of Sagami' }),
  m('Hojo Tsunashige', 'hojo', 'odachi', 'reckless', 420),
  m('Fuma Kotaro', 'hojo', 'dual', 'cunning', 400, { speed: 1.12 }),
  m('Mori Motonari', 'mori', 'katana', 'cunning', 480, { crest: 'sun', title: 'The Three Arrows' }),
  m('Kikkawa Motoharu', 'mori', 'odachi', 'reckless', 440),
  m('Kobayakawa Takakage', 'mori', 'yari', 'patient', 420),
  m('Chosokabe Motochika', 'chosokabe', 'naginata', 'honorable', 480, { crest: 'crescent', title: 'Bat of Tosa' }),
  m('Kosokabe Chikayasu', 'chosokabe', 'yari', 'patient'),
  m('Otomo Sorin', 'otomo', 'gun', 'cunning', 460, { crest: 'cross', title: 'The Christian Lord' }),
  m('Tachibana Dosetsu', 'otomo', 'odachi', 'patient', 460, { title: 'Thunder God' }),
  m('Shimazu Yoshihisa', 'shimazu', 'katana', 'patient', 440),
  m('Shimazu Iehisa', 'shimazu', 'yari', 'cunning', 420),
  m('Katakura Kojuro', 'date', 'katana', 'patient', 440, { title: 'The Dragon’s Right Eye' }),
  m('Date Shigezane', 'date', 'yari', 'reckless', 420),
  m('Suzuki Shigehide', 'saika', 'gun', 'cunning', 400),
  m('Sanada Masayuki', 'sanada', 'katana', 'cunning', 440, { title: 'Lord of Ueda' }),
  m('Sanada Nobuyuki', 'sanada', 'yari', 'patient', 400),
  m('Akechi Hidemitsu', 'akechi', 'yari', 'honorable', 420),
  m('Saito Toshimitsu', 'akechi', 'odachi', 'reckless', 420),
  m('Kuroda Kanbei', 'toyotomi', 'katana', 'cunning', 400, { title: 'The Strategist' }),
  m('Kato Kiyomasa', 'toyotomi', 'yari', 'reckless', 460, { atk: 0.95 }),
  m('Ishida Mitsunari', 'toyotomi', 'katana', 'cunning', 400),
  // masterless
  m('Miyamoto Musashi', 'ronin', 'dual', 'reckless', 520, { atk: 1.05, title: 'The Sword Saint', primary: 0x5a5a66 }),
  m('Sasaki Kojiro', 'ronin', 'odachi', 'patient', 500, { atk: 1.05, title: 'Swallow Cut', primary: 0x8a6a9a }),
  m('Goto Matabei', 'ronin', 'odachi', 'reckless', 460, { primary: 0x6a5a3a }),
  m('Yagyu Munenori', 'ronin', 'katana', 'patient', 480, { atk: 1.0, primary: 0x3a4a5a }),
  m('Kaihime', 'ronin', 'naginata', 'honorable', 420, { speed: 1.08, primary: 0xb85a7a }),
  m('Hozoin Inei', 'ronin', 'yari', 'patient', 460, { primary: 0x7a6a4a }),
];

export const ALL_OFFICERS: Record<string, OfficerDef> = Object.fromEntries([...Object.values(OFFICERS), ...MINOR].map((d) => [d.id, d]));
const id = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '_');

export interface Scenario {
  id: string;
  name: string;
  year: number;
  blurb: string;
  /** clan → provinces */
  holdings: Record<string, string[]>;
  /** clan → [ruler, ...retainers] by officer id */
  houses: Record<string, string[]>;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 's1560',
    name: 'The Fool of Owari',
    year: 1560,
    blurb: 'The shogunate is a husk and every valley has its own lord. Imagawa is about to march on the capital; a small clan in Owari stands in the road.',
    holdings: {
      shimazu: ['Satsuma'],
      otomo: ['Bungo', 'Chikuzen'],
      chosokabe: ['Tosa'],
      mori: ['Aki', 'Nagato'],
      saika: ['Kii'],
      oda: ['Owari'],
      tokugawa: ['Mikawa'],
      imagawa: ['Suruga'],
      takeda: ['Kai', 'Shinano'],
      uesugi: ['Echigo'],
      hojo: ['Sagami', 'Musashi'],
      date: ['Mutsu'],
    },
    houses: {
      shimazu: ['yoshihiro', id('Shimazu Yoshihisa'), id('Shimazu Iehisa')],
      otomo: [id('Otomo Sorin'), 'ginchiyo', id('Tachibana Dosetsu')],
      chosokabe: [id('Chosokabe Motochika'), id('Kosokabe Chikayasu')],
      mori: [id('Mori Motonari'), id('Kikkawa Motoharu'), id('Kobayakawa Takakage')],
      saika: ['magoichi', id('Suzuki Shigehide')],
      oda: ['nobunaga', 'hideyoshi', 'keiji', 'mitsuhide', id('Shibata Katsuie'), id('Niwa Nagahide')],
      tokugawa: ['ieyasu', 'tadakatsu', 'hanzo', id('Sakai Tadatsugu')],
      imagawa: [id('Imagawa Yoshimoto'), id('Asahina Yasutomo'), id('Okabe Motonobu')],
      takeda: ['shingen', 'yukimura', id('Yamagata Masakage'), id('Baba Nobuharu'), id('Yamamoto Kansuke')],
      uesugi: ['kenshin', id('Kakizaki Kageie'), id('Naoe Kanetsugu'), id('Usami Sadamitsu')],
      hojo: [id('Hojo Ujiyasu'), id('Hojo Tsunashige'), id('Fuma Kotaro')],
      date: ['masamune', id('Katakura Kojuro'), id('Date Shigezane')],
    },
  },
  {
    id: 's1570',
    name: 'The Encirclement',
    year: 1570,
    blurb: 'Oda holds the capital and has made an enemy of everyone who does not. Takeda, Uesugi, Mori and the warrior monks close in from every side.',
    holdings: {
      shimazu: ['Satsuma'],
      otomo: ['Bungo', 'Chikuzen', 'Higo'],
      chosokabe: ['Tosa'],
      mori: ['Aki', 'Nagato', 'Izumo', 'Bizen'],
      saika: ['Kii', 'Settsu'],
      oda: ['Owari', 'Mino', 'Ise', 'Yamashiro'],
      tokugawa: ['Mikawa'],
      takeda: ['Kai', 'Shinano', 'Suruga'],
      uesugi: ['Echigo', 'Kozuke'],
      hojo: ['Sagami', 'Musashi'],
      date: ['Mutsu'],
    },
    houses: {
      shimazu: ['yoshihiro', id('Shimazu Yoshihisa'), id('Shimazu Iehisa')],
      otomo: [id('Otomo Sorin'), 'ginchiyo', id('Tachibana Dosetsu')],
      chosokabe: [id('Chosokabe Motochika'), id('Kosokabe Chikayasu')],
      mori: [id('Mori Motonari'), id('Kikkawa Motoharu'), id('Kobayakawa Takakage')],
      saika: ['magoichi', id('Suzuki Shigehide')],
      oda: ['nobunaga', 'hideyoshi', 'keiji', 'mitsuhide', id('Shibata Katsuie'), id('Niwa Nagahide'), id('Maeda Toshiie')],
      tokugawa: ['ieyasu', 'tadakatsu', 'hanzo', id('Sakai Tadatsugu'), id('Sakakibara Yasumasa')],
      takeda: ['shingen', 'yukimura', id('Yamagata Masakage'), id('Baba Nobuharu'), id('Kosaka Masanobu'), id('Sanada Masayuki')],
      uesugi: ['kenshin', id('Kakizaki Kageie'), id('Naoe Kanetsugu'), id('Usami Sadamitsu')],
      hojo: [id('Hojo Ujiyasu'), id('Hojo Tsunashige'), id('Fuma Kotaro')],
      date: ['masamune', id('Katakura Kojuro'), id('Date Shigezane')],
    },
  },
  {
    id: 's1582',
    name: 'After Honnoji',
    year: 1582,
    blurb: 'Nobunaga is ash. His generals are already fighting over the corpse of his realm, and every old enemy he held down is stirring.',
    holdings: {
      shimazu: ['Satsuma', 'Higo'],
      otomo: ['Bungo', 'Chikuzen'],
      chosokabe: ['Tosa', 'Iyo'],
      mori: ['Aki', 'Nagato', 'Izumo'],
      saika: ['Kii'],
      toyotomi: ['Harima', 'Bizen', 'Settsu'],
      akechi: ['Yamashiro', 'Omi'],
      oda: ['Echizen', 'Kaga', 'Owari', 'Mino'],
      tokugawa: ['Mikawa', 'Suruga', 'Kai'],
      sanada: ['Shinano'],
      uesugi: ['Echigo'],
      hojo: ['Sagami', 'Musashi', 'Kozuke'],
      date: ['Mutsu', 'Dewa'],
    },
    houses: {
      shimazu: ['yoshihiro', id('Shimazu Yoshihisa'), id('Shimazu Iehisa')],
      otomo: [id('Otomo Sorin'), 'ginchiyo', id('Tachibana Dosetsu')],
      chosokabe: [id('Chosokabe Motochika'), id('Kosokabe Chikayasu')],
      mori: [id('Kobayakawa Takakage'), id('Kikkawa Motoharu')],
      saika: ['magoichi', id('Suzuki Shigehide')],
      toyotomi: ['hideyoshi', id('Kuroda Kanbei'), id('Kato Kiyomasa'), id('Ishida Mitsunari')],
      akechi: ['mitsuhide', id('Akechi Hidemitsu'), id('Saito Toshimitsu')],
      oda: [id('Shibata Katsuie'), 'keiji', id('Maeda Toshiie'), id('Niwa Nagahide')],
      tokugawa: ['ieyasu', 'tadakatsu', 'hanzo', id('Ii Naomasa'), id('Sakakibara Yasumasa')],
      sanada: ['yukimura', id('Sanada Masayuki'), id('Sanada Nobuyuki')],
      uesugi: ['kenshin', id('Naoe Kanetsugu'), id('Kakizaki Kageie')],
      hojo: [id('Hojo Tsunashige'), id('Fuma Kotaro')],
      date: ['masamune', id('Katakura Kojuro'), id('Date Shigezane')],
    },
  },
];

/** Pre-battle stratagems. Each costs gold and shows up as an event on the field. */
export const STRATAGEMS: Record<string, { name: string; cost: number; desc: string; attackerOnly?: boolean }> = {
  none: { name: 'No stratagem', cost: 0, desc: 'A straight fight.' },
  ambush: { name: 'Hidden Detachment', cost: 200, desc: 'A column circles behind the enemy and strikes their rear ninety seconds in.' },
  night: { name: 'Night Raid', cost: 250, desc: 'Attack in darkness. The enemy starts shaken and short of men at their posts.', attackerOnly: true },
  fire: { name: 'Fire Attack', cost: 300, desc: 'Set their stores alight. A tenth of their reserves burn and their morale drops a minute in.' },
  bribe: { name: 'Bought Loyalty', cost: 450, desc: 'One enemy officer has taken your gold and will turn on his own side mid-battle.' },
  rally: { name: 'War Drums', cost: 150, desc: 'Your army starts with soaring morale.' },
};
