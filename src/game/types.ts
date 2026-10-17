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

export const RARITIES = ['normal', 'magic', 'rare', 'legendary'] as const;
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
  | 'phoenix' | 'resonance' | 'doubleStrike' | 'giantSlayer';

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
  source: 'diary' | 'boss';
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
}

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

export interface GameState {
  version: 1;
  character: Character;
  items: Record<string, Item>;
  diaries: DiaryEntry[];
  logs: AdventureLog[];
  codex: Record<string, string>; // baseKey -> 初入手日時
  records: RecordUpdate[];
  idCounter: number;
}
