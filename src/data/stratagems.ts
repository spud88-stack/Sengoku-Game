/** Battlefield stratagems: called in mid-battle by spending command points. */
export type StratId = 'fire' | 'drums' | 'reinforce' | 'sabotage';

export interface StratDef {
  id: StratId;
  name: string;
  kanji: string;
  cost: number;
  desc: string;
}

/** In slot order: keys 1-4, gamepad D-pad up, right, down, left. */
export const STRATS: StratDef[] = [
  { id: 'fire', name: 'Fire Arrows', kanji: '火矢', cost: 1, desc: 'Your archers rain burning arrows on the ground just ahead of you.' },
  { id: 'drums', name: 'War Drums', kanji: '陣太鼓', cost: 1, desc: 'Your whole army hits harder and holds firmer for 25 seconds, and its morale rises.' },
  { id: 'reinforce', name: 'Reinforcements', kanji: '援軍', cost: 2, desc: 'A fresh company runs from your nearest camp to fight at your side.' },
  { id: 'sabotage', name: 'Sabotage', kanji: '破壊工作', cost: 2, desc: 'Shinobi set the nearest enemy camp alight: its garrison is halved and its defenders scatter.' },
];
