export const THEMES = [
  'learning', 'development', 'work', 'challenge', 'failure', 'discovery',
  'exercise', 'social', 'travel', 'hobby', 'rest',
] as const;
export type Theme = (typeof THEMES)[number];

export type Mood = 'motivated' | 'positive' | 'neutral' | 'tired' | 'negative';

export interface Analysis {
  themes: { type: Theme; weight: number }[];
  /** 「明日やりたい」など未実施・予定として書かれたテーマ */
  planned: Theme[];
  mood: Mood;
  challenge: boolean;
  discovery: boolean;
  method: 'local' | 'ai';
}

export const SLOTS = ['weapon', 'armor', 'ring', 'accessory'] as const;
export type Slot = (typeof SLOTS)[number];

export const RARITIES = ['normal', 'magic', 'rare', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

export type SynergyTag = 'blade' | 'gear' | 'arcane' | 'shadow' | 'wind' | 'holy' | 'blood' | 'ember';

export type AffixKind =
  | 'atk' | 'def' | 'hp' | 'atkPct' | 'hpPct' | 'crit' | 'extraAttack'
  | 'onKillAtk' | 'floorHeal' | 'lifesteal' | 'expPct' | 'themeLuck'
  | 'retryBoost' | 'dodge' | 'bossDmg';

export interface Affix {
  kind: AffixKind;
  value: number;
}

export type SpecialKind =
  | 'chainStrike' | 'echo' | 'momentum' | 'floorRegen' | 'expAmp'
  | 'phoenix' | 'resonance' | 'doubleStrike' | 'giantSlayer'
  // 夢限定
  | 'dreamWalk' | 'lucid' | 'dejavu' | 'dreamEater';

export interface Special {
  kind: SpecialKind;
  value: number;
  /** resonance 用 */
  tag?: SynergyTag;
}

export interface BaseStats {
  atk: number;
  def: number;
  hp: number;
  crit: number;
}

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  baseKey: string; // 図鑑・アイコン用のベース種別
  rarity: Rarity;
  ilvl: number;
  base: Partial<BaseStats>;
  affixes: Affix[];
  special?: Special;
  themes: Theme[];
  tags: SynergyTag[];
  acquiredAt: string;
  diaryId?: string;
  source: 'diary' | 'boss' | 'chest' | 'elite' | 'battle' | 'dream';
  /** 入手した階層（探索ドロップのみ） */
  floor?: number;
  /** 夢の記録から生まれた限定アイテム */
  dream?: boolean;
}

export type LogLevel = 'detail' | 'normal' | 'important' | 'epic';

export interface LogEvent {
  level: LogLevel;
  text: string;
  kind: string;
  floor?: number;
  itemId?: string;
}

export interface AdventureLog {
  id: string;
  at: string;
  diaryId?: string;
  dungeonId: string;
  dungeonName: string;
  floorReached: number;
  prevBest: number;
  newRecord: boolean;
  bossesDefeated: number;
  maxChain: number;
  lastEnemy?: { name: string; sprite: string; boss: boolean };
  events: LogEvent[];
  itemIds: string[];
  seed: number;
}

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  text: string;
  chars: number;
  analysis: Analysis | null;
  expGained: number;
  rewarded: boolean;
  logIds: string[];
  /** 投稿時の結果ログ（v2以降の投稿） */
  events?: LogEvent[];
  /** 'dream' は夢の記録 */
  kind?: 'post' | 'dream';
  /** 振り分け用の色ラベル */
  color?: PostColor;
}

export const POST_COLORS = ['red', 'yellow', 'green', 'blue', 'purple'] as const;
export type PostColor = (typeof POST_COLORS)[number];

export interface Character {
  level: number;
  exp: number; // 現レベル内の経験値
  totalExp: number;
  bestFloor: number;
  retryStacks: number;
  equipped: Record<Slot, string | null>;
}

export interface RecordUpdate {
  at: string;
  from: number;
  to: number;
  logId: string;
}

export type FloorEvent = 'battle' | 'elite' | 'chest' | 'rest' | 'boss';

/** 進行中の探索（中断・再開できるよう全状態を保持） */
export interface Expedition {
  id: string;
  dungeonId: string;
  startedAt: string;
  floor: number; // 次に挑む階層
  hp: number;
  killStacks: number;
  streak: number;
  phoenixReady: boolean;
  kills: number;
  bossFloors: number[];
  maxChain: number;
  prevBest: number;
  lastEnemy?: { name: string; sprite: string; boss: boolean };
  lastEvent?: FloorEvent;
  ended?: 'defeat' | 'stalemate' | 'cap';
  /** 夢アイテム「悪夢を喰らう」で積み上がった攻撃力倍率 */
  dreamAtk?: number;
  events: LogEvent[];
  itemIds: string[];
}

export interface IdleState {
  /** 最後に探索を精算した時刻 */
  lastTick?: string;
  /** 1階層分に満たず繰り越した秒数 */
  carrySeconds: number;
  /** 端数の経験値 */
  expCarry: number;
  /** 投稿で得た「ひらめき」の効果終了時刻 */
  inspirationUntil?: string;
  rngState?: number;
}

/** 放置中の戦果まとめ */
export interface IdleReport {
  id: string;
  from: string;
  to: string;
  seconds: number; // 実際の経過秒
  countedSeconds: number; // 報酬対象（上限適用後）
  kills: number;
  floorsCleared: number;
  deepest: number;
  bosses: number;
  chests: number;
  rests: number;
  elites: number;
  expeditions: number;
  exp: number;
  levelFrom: number;
  levelTo: number;
  itemIds: string[];
  bestFrom: number;
  bestTo: number;
  maxChain: number;
  highlights: LogEvent[];
  source: 'idle' | 'post';
}

export interface GameState {
  version: 1;
  character: Character;
  items: Record<string, Item>;
  diaries: DiaryEntry[];
  logs: AdventureLog[];
  codex: Record<string, string>; // baseKey -> 初入手日時
  records: RecordUpdate[];
  idCounter: number;
  expedition?: Expedition;
  idle: IdleState;
  reports: IdleReport[];
}
