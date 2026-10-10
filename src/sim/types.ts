export type React = 'stagger' | 'knock' | 'launch' | 'stun' | 'slam';

export interface HitDef {
  /** active window in seconds from move start */
  t0: number;
  t1: number;
  range: number;
  /** total arc in degrees centred on facing; 360 = all around */
  arc: number;
  dmg: number;
  react: React;
  /** horizontal knockback speed */
  kb: number;
  /** vertical launch speed */
  lift?: number;
  /** hitstop seconds */
  stop: number;
  shake?: number;
  /** breaks guard */
  gb?: boolean;
  /** only fires when an airborne move touches the ground */
  onLand?: boolean;
  /** pulls targets toward attacker instead of pushing */
  pull?: boolean;
}

export interface MoveDef {
  id: string;
  /** animation clip name (view side) */
  anim: string;
  dur: number;
  hits: HitDef[];
  /** forward lunges: [t0, t1, speed] */
  lunge?: [number, number, number][];
  /** when the next combo input may start */
  cancel: number;
  /** aim can be corrected until this time */
  turn?: number;
  armor?: boolean;
  invuln?: boolean;
  air?: boolean;
  /** performed from the saddle: the rider keeps steering */
  mounted?: boolean;
  /** fast-fall speed for plunges */
  plunge?: number;
  sfx?: 'light' | 'heavy' | 'spin' | 'thrust' | 'super' | 'shot';
  /** trail windows [t0,t1] default = hit windows */
  kind?: 'light' | 'charge' | 'air' | 'dash' | 'super';
}

export interface Moveset {
  weapon: WeaponKind;
  reach: number;
  lights: MoveDef[];
  /** index = number of lights already thrown (0 = heavy alone) */
  charges: MoveDef[];
  airLight: MoveDef;
  airHeavy: MoveDef;
  dash: MoveDef;
  super: MoveDef;
}

export type WeaponKind = 'katana' | 'yari' | 'naginata' | 'dual' | 'odachi' | 'kanabo' | 'gun' | 'bow' | 'kusarigama' | 'tessen' | 'masakari' | 'bo';

export type Personality = 'reckless' | 'patient' | 'cunning' | 'honorable';

export interface OfficerDef {
  id: string;
  name: string;
  title: string;
  clan: string;
  weapon: WeaponKind;
  personality: Personality;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  /** look */
  primary: number;
  secondary: number;
  crest: 'horns' | 'crescent' | 'antlers' | 'fan' | 'sun' | 'cross' | 'plume' | 'none';
  scale?: number;
  lines?: { enter?: string; win?: string; lose?: string; super?: string };
}

export type FState =
  | 'free'
  | 'attack'
  | 'dodge'
  | 'air'
  | 'guard'
  | 'hitstun'
  | 'launched'
  | 'down'
  | 'getup'
  | 'stunned'
  | 'dead';

export interface Intent {
  mx: number;
  mz: number;
  light: boolean;
  heavy: boolean;
  jump: boolean;
  dodge: boolean;
  super: boolean;
  rage: boolean;
  guard: boolean;
  mount?: boolean;
}

export const emptyIntent = (): Intent => ({
  mx: 0,
  mz: 0,
  light: false,
  heavy: false,
  jump: false,
  dodge: false,
  super: false,
  rage: false,
  guard: false,
});

/** Things the view (or a test) may care about. The sim never depends on them being read. */
export type SimEvent =
  | { type: 'hit'; x: number; y: number; z: number; dx: number; dz: number; weight: number; blood: boolean; officer: boolean; byPlayer: boolean }
  | { type: 'swing'; id: number; sfx: string; x: number; z: number }
  | { type: 'block'; x: number; y: number; z: number; byPlayer: boolean }
  | { type: 'parry'; x: number; y: number; z: number }
  | { type: 'guardbreak'; x: number; y: number; z: number }
  | { type: 'ko'; count: number; x: number; z: number }
  | { type: 'officerDown'; id: number; by: number; x: number; z: number }
  | { type: 'log'; text: string; team: number; kind: 'info' | 'good' | 'bad' | 'speech'; who?: string }
  | { type: 'shake'; amt: number }
  | { type: 'super'; id: number; phase: 'start' | 'finish' }
  | { type: 'rage'; id: number }
  | { type: 'land'; x: number; z: number; heavy: boolean }
  | { type: 'dodge'; id: number }
  | { type: 'mount'; id: number; on: boolean }
  | { type: 'pickup'; x: number; z: number; kind: string }
  | { type: 'mission'; state: 'start' | 'done' | 'fail'; text: string }
  | { type: 'baseCapture'; base: number; team: number }
  | { type: 'soldierSwing'; x: number; z: number }
  | { type: 'volley'; x: number; z: number; face: number; gun: boolean }
  | { type: 'banner'; title: string; sub: string; good: boolean }
  | { type: 'join'; id: number }
  | { type: 'defect'; id: number }
  | { type: 'takeover'; from: number; to: number }
  | { type: 'stratagem'; id: string; team: number; x: number; z: number; who: string }
  | { type: 'strike'; phase: 'warn' | 'hit' | 'blaze'; x: number; z: number; r: number; t: number; team: number }
  | { type: 'shot'; id: number; range: number; arc: number }
  | { type: 'end'; winner: number; reason: string };
