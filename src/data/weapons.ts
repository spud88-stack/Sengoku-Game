import type { WeaponKind } from '../sim/types';

/** Every weapon an officer can carry, in the order menus offer them. */
export const WEAPONS: { id: WeaponKind; name: string; desc: string }[] = [
  { id: 'katana', name: 'Katana', desc: 'Balanced in every way: quick cuts, a five-hit string and a reliable launcher.' },
  { id: 'yari', name: 'Cross Spear', desc: 'Long thrusts that keep enemies at a distance.' },
  { id: 'naginata', name: 'Naginata', desc: 'Sweeping arcs that own the space around you.' },
  { id: 'dual', name: 'Twin Blades', desc: 'Short reach and blinding speed: every cut lands twice.' },
  { id: 'odachi', name: 'Great Sword', desc: 'Slow, long and heavy; later swings cannot be interrupted.' },
  { id: 'kanabo', name: 'Iron Club', desc: 'Three ponderous blows that flatten everything and shake the ground.' },
  { id: 'gun', name: 'Matchlock', desc: 'Bayonet jabs, and gunfire for every charge attack.' },
  { id: 'kusarigama', name: 'Kusarigama', desc: 'A sickle on a weighted chain. The longest reach of any blade, and it drags enemies in.' },
  { id: 'tessen', name: 'War Fan', desc: 'An iron fan: quick, light cuts whose gusts bowl crowds over.' },
  { id: 'masakari', name: 'Great Axe', desc: 'Four crushing blows that cannot be interrupted; every charge breaks guard.' },
  { id: 'bo', name: 'Fighting Staff', desc: 'Both ends strike: fast, wide, and every cut of the string lands twice.' },
];

export const WEAPON_NAMES: Record<string, string> = Object.fromEntries([...WEAPONS.map((w) => [w.id, w.name]), ['bow', 'Bow']]);
