// ゲームバランス・テーブル類。数値調整はこのファイルだけで完結するようにしている。
import type { AffixKind, Rarity, Slot, SpecialKind, SynergyTag, Theme } from './types';

// ---------- 投稿・経験値 ----------
/** [最小文字数, 獲得EXP] 降順で評価。短文でも十分もらえ、長文の優位は小さい */
export const EXP_TABLE: [number, number][] = [
  [140, 30],
  [60, 26],
  [20, 22],
  [1, 18],
];
/** 1日に報酬を得られる投稿の数（Infinity = 無制限。たくさん投稿するほど強くなる） */
export const DAILY_REWARD_LIMIT = Infinity;

export const expToNext = (level: number) => Math.round(40 * Math.pow(1.1, level - 1));

/** レベルは基礎的な成長のみ担当（装備の方が伸び幅が大きい） */
export const LEVEL_STATS = {
  atk: (lv: number) => 10 + 2 * (lv - 1),
  def: (lv: number) => 4 + 1 * (lv - 1),
  hp: (lv: number) => 60 + 8 * (lv - 1),
  crit: 0.05,
  critMul: 1.6,
};

/** アイテムレベル：深い階層ほど強い装備が出る */
export const itemLevelFor = (level: number, floor: number) => 1 + Math.floor(floor / 3) + Math.floor(level / 4);
/** 敵は階層の二乗、装備は階層倍率×アイテムレベルで伸ばして桁の暴走を抑える */
export const FLOOR_SCALING = { enemyDivisor: 100, itemStart: 40, itemDivisor: 100 };
export const enemyScaleFor = (floor: number) => Math.pow(1 + Math.max(0, floor - 1) / FLOOR_SCALING.enemyDivisor, 2);
export const itemScaleFor = (floor: number) => Math.max(1, (floor + FLOOR_SCALING.itemDivisor) / (FLOOR_SCALING.itemStart + FLOOR_SCALING.itemDivisor));

// ---------- 投稿の報酬 ----------
export const POST = {
  /** 投稿で拾う装備：最低個数＋追加抽選（レアリティ抽選は通常どおり。短文でもレジェンダリーの可能性あり） */
  dropBase: 1,
  dropBonusChance: 0.5,
  dropBonusMax: 2,
  /** 投稿時に一気に進める階層数（敗北したらその挑戦の到達点で止める） */
  instantExploreMaxFloors: 5_000,
  /** 「ひらめき」効果：投稿ごとに延長する時間と上限 */
  inspirationSeconds: 30 * 60,
  inspirationMaxSeconds: 2 * 3600,
  /** ひらめき中の探索ボーナス */
  inspirationExpMul: 1.5,
  inspirationChestMul: 1.6,
  /** ダンジョン傾向に反映する投稿の期間と減衰 */
  themeWindowHours: 72,
  themeHalfLifeHours: 24,
};

// ---------- 放置・探索 ----------
export const IDLE = {
  /** 報酬計算の対象となる最大放置時間（Infinity = 無制限） */
  maxSeconds: Infinity,
  /** 1戦ずつ細かく計算する時間の上限。超えた分は直近のペースから成果を算出（端末の負荷対策） */
  detailSeconds: 24 * 3600,
  /** 算出分で生成する装備の上限 */
  extrapolatedItemCap: 200,
  /** 各イベントにかかる探索時間（秒）。休息ポイントは立ち止まらず回復だけして先へ進む */
  floorSeconds: { battle: 24, elite: 36, chest: 8, rest: 2, boss: 48 } as Record<string, number>,
  /** 敗北後、次の探索に出るまでの時間 */
  returnSeconds: 60,
  /** 次の探索は「最高到達階層×この割合」付近のボス階層の次から始める（序盤の周回を省略） */
  checkpointRatio: 0.5,
  /** 階層突破ごとの経験値 */
  expPerFloor: 0.05,
  expPerBoss: 0.8,
  /** 1回の精算で手に入る装備の上限（Infinity = 無制限） */
  itemCapPerSettle: Infinity,
  chestOverflowExp: 3,
  /** 起動時に結果画面を出す最小放置時間（秒） */
  reportMinSeconds: 10 * 60,
  /** アプリを開いている間の自動精算間隔（ミリ秒） */
  liveTickMs: 3 * 1000,
  /** 画面に流す簡易戦闘ログの1行あたりの表示間隔（ミリ秒） */
  combatLineMs: 300,
  /** 保存する探索記録・レポートの上限 */
  maxLogs: 300,
  maxReports: 60,
};

// ---------- 探索イベント ----------
export const FLOOR_EVENTS = {
  weights: { battle: 72, elite: 14, chest: 4, rest: 10 } as Record<'battle' | 'elite' | 'chest' | 'rest', number>,
  elite: { hp: 2.4, atk: 1.25, def: 1.2 },
  restHeal: 0.35,
  /** ドロップ率。宝箱は chestItems の範囲で複数個、ボスは必ず落とす */
  drop: { battle: 0.01, elite: 0.2, boss: 0.3 },
  chestItems: [1, 2] as [number, number],
  bossBonusChance: 0.1,
  rarityBoost: { chest: 0.2, elite: 0.2, boss: 0.4, battle: 0 },
};

// ---------- ドロップ ----------
export const DROPS = {
  /** テーマに沿った装備になる確率（残りは完全ランダム） */
  themeInfluence: 0.65,
  /** 未装備アイテムの保持上限（超えたら価値の低いものから削除。レジェンダリー・夢アイテムは削除しない） */
  inventoryCap: 400,
};

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  normal: 70,
  magic: 22,
  rare: 7,
  legendary: 1,
  mythic: 0.1,
};
export const RARITY_INFO: Record<Rarity, { label: string; affixes: number; mul: number; specialChance: number }> = {
  normal: { label: 'Normal', affixes: 1, mul: 1.0, specialChance: 0.02 },
  magic: { label: 'Magic', affixes: 2, mul: 1.25, specialChance: 0.05 },
  rare: { label: 'Rare', affixes: 3, mul: 1.6, specialChance: 0.15 },
  legendary: { label: 'Legendary', affixes: 4, mul: 2.1, specialChance: 1 },
  mythic: { label: 'Mythic', affixes: 5, mul: 2.8, specialChance: 1 },
};

// ---------- アイテムベース ----------
export interface ItemBaseDef {
  key: string;
  name: string;
  slot: Slot;
  tags: SynergyTag[];
  themes: Theme[];
}
export const ITEM_BASES: ItemBaseDef[] = [
  { key: 'sword', name: '剣', slot: 'weapon', tags: ['blade'], themes: ['challenge', 'work', 'exercise'] },
  { key: 'dagger', name: '短剣', slot: 'weapon', tags: ['shadow', 'blade'], themes: ['failure', 'travel'] },
  { key: 'axe', name: '戦斧', slot: 'weapon', tags: ['blood', 'ember'], themes: ['challenge', 'exercise'] },
  { key: 'staff', name: '杖', slot: 'weapon', tags: ['arcane', 'holy'], themes: ['learning', 'social', 'rest'] },
  { key: 'tome', name: '魔導書', slot: 'weapon', tags: ['arcane'], themes: ['learning', 'discovery'] },
  { key: 'armor', name: '鎧', slot: 'armor', tags: ['blade', 'ember'], themes: ['challenge', 'work'] },
  { key: 'cloak', name: '外套', slot: 'armor', tags: ['shadow', 'wind'], themes: ['failure', 'travel', 'rest'] },
  { key: 'shield', name: '盾', slot: 'armor', tags: ['holy'], themes: ['failure', 'social', 'work'] },
  { key: 'ring', name: '指輪', slot: 'ring', tags: ['arcane', 'blood'], themes: ['learning', 'hobby', 'social'] },
  { key: 'gear', name: '歯車', slot: 'accessory', tags: ['gear'], themes: ['development', 'work'] },
  { key: 'amulet', name: '護符', slot: 'accessory', tags: ['holy', 'arcane'], themes: ['social', 'rest', 'failure'] },
  { key: 'boots', name: '靴', slot: 'accessory', tags: ['wind'], themes: ['exercise', 'travel', 'discovery'] },
  { key: 'hourglass', name: '砂時計', slot: 'accessory', tags: ['gear', 'arcane'], themes: ['development', 'hobby', 'discovery'] },
];

/** スロット別の基礎能力（ilvl に応じて伸びる） */
export const SLOT_BASE: Record<Slot, (ilvl: number) => { atk?: number; def?: number; hp?: number; crit?: number }> = {
  weapon: (l) => ({ atk: 4 + l * 2.6 }),
  armor: (l) => ({ def: 2 + l * 1.4, hp: 10 + l * 10 }),
  ring: (l) => ({ atk: 1 + l * 0.8, crit: 0.03 }),
  accessory: (l) => ({ hp: 8 + l * 6, def: 1 + l * 0.5 }),
};

// ---------- 追加効果 ----------
export interface AffixDef {
  kind: AffixKind;
  weight: number;
  roll: (ilvl: number) => [number, number];
  /** 値の表示 */
  fmt: (v: number) => string;
  /** 名前生成に使う接頭語 */
  words: string[];
}
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
/** 大きな数を万・億などで短く */
const short = (v: number) => {
  const a = Math.abs(v);
  if (a < 10000) return String(Math.round(v));
  if (a >= 1e24) return v.toExponential(2).replace('e+', 'e');
  for (const [d, u] of [[1e20, '垓'], [1e16, '京'], [1e12, '兆'], [1e8, '億'], [1e4, '万']] as [number, string][]) if (a >= d) return `${(v / d).toFixed(1)}${u}`;
  return String(Math.round(v));
};
export const AFFIXES: AffixDef[] = [
  { kind: 'atk', weight: 10, roll: (l) => [l * 0.6 + 1, l * 1.3 + 3], fmt: (v) => `攻撃力 +${short(v)}`, words: ['鋭き', '猛き', '刃こぼれした'] },
  { kind: 'def', weight: 9, roll: (l) => [l * 0.4 + 1, l * 0.9 + 2], fmt: (v) => `防御力 +${short(v)}`, words: ['堅牢なる', '古びた', '重き'] },
  { kind: 'hp', weight: 9, roll: (l) => [l * 3 + 5, l * 7 + 10], fmt: (v) => `最大HP +${short(v)}`, words: ['逞しき', '温かな', '生命の'] },
  { kind: 'atkPct', weight: 6, roll: () => [0.05, 0.15], fmt: (v) => `攻撃力 +${pct(v)}`, words: ['猛り狂う', '覇気纏う'] },
  { kind: 'hpPct', weight: 6, roll: () => [0.05, 0.15], fmt: (v) => `最大HP +${pct(v)}`, words: ['不屈の', '揺るがぬ'] },
  { kind: 'crit', weight: 6, roll: () => [0.03, 0.08], fmt: (v) => `会心率 +${pct(v)}`, words: ['研ぎ澄まされた', '狙い澄ます'] },
  { kind: 'extraAttack', weight: 4, roll: () => [0.04, 0.1], fmt: (v) => `追加攻撃 ${pct(v)}`, words: ['疾き', '二度打つ'] },
  { kind: 'onKillAtk', weight: 3, roll: () => [0.004, 0.012], fmt: (v) => `撃破ごとに攻撃力 +${pct(v)}`, words: ['血に飢えた', '虐殺者の'] },
  { kind: 'floorHeal', weight: 4, roll: () => [0.02, 0.06], fmt: (v) => `階層突破時 HP${pct(v)}回復`, words: ['癒しの', '泉湧く'] },
  { kind: 'lifesteal', weight: 3, roll: () => [0.03, 0.08], fmt: (v) => `与ダメージの${pct(v)}を吸収`, words: ['吸血の', '渇いた'] },
  { kind: 'expPct', weight: 4, roll: () => [0.05, 0.2], fmt: (v) => `経験値 +${pct(v)}`, words: ['賢き', '学びの'] },
  { kind: 'themeLuck', weight: 3, roll: () => [0.3, 0.8], fmt: (v) => `同テーマ装備の出現率 +${Math.round(v * 100)}%`, words: ['導きの', '縁結ぶ'] },
  { kind: 'retryBoost', weight: 3, roll: () => [0.02, 0.05], fmt: (v) => `記録未更新ごとに全能力 +${pct(v)}（最大5回）`, words: ['幾度でも立つ', '諦めぬ'] },
  { kind: 'dodge', weight: 4, roll: () => [0.02, 0.06], fmt: (v) => `回避率 +${pct(v)}`, words: ['風を読む', '影走る'] },
  { kind: 'bossDmg', weight: 3, roll: () => [0.1, 0.3], fmt: (v) => `ボスへのダメージ +${pct(v)}`, words: ['巨人殺しの', '王を討つ'] },
];
export const AFFIX_BY_KIND = Object.fromEntries(AFFIXES.map((a) => [a.kind, a])) as Record<AffixKind, AffixDef>;

// ---------- 特殊効果（神引き枠） ----------
export interface SpecialDef {
  kind: SpecialKind;
  weight: number;
  roll: () => [number, number];
  desc: (v: number, tag?: SynergyTag) => string;
  /** 特殊効果つきアイテムの二つ名 */
  epithets: string[];
}
export const SPECIALS: SpecialDef[] = [
  { kind: 'chainStrike', weight: 10, roll: () => [0.3, 0.5], desc: (v) => `撃破時 ${pct(v)} で次の敵へ連鎖攻撃`, epithets: ['屍を越えて進む', '止まらぬ刃の'] },
  { kind: 'echo', weight: 6, roll: () => [1, 1], desc: () => '追加攻撃・連鎖攻撃での撃破でも撃破時効果が発動', epithets: ['木霊する', '残響の'] },
  { kind: 'momentum', weight: 8, roll: () => [0.03, 0.06], desc: (v) => `連続撃破ごとに攻撃力 +${pct(v)}（被弾でリセット）`, epithets: ['加速する', '勢い止まぬ'] },
  { kind: 'floorRegen', weight: 8, roll: () => [0.15, 0.25], desc: (v) => `階層突破時 HP${pct(v)}回復`, epithets: ['永遠を刻む', '蘇りの泉の'] },
  { kind: 'expAmp', weight: 6, roll: () => [0.4, 0.8], desc: (v) => `獲得経験値 +${pct(v)}`, epithets: ['未完成の天才が遺した', '万巻を読む'] },
  { kind: 'phoenix', weight: 5, roll: () => [0.4, 0.6], desc: (v) => `攻略中1度だけ HP${pct(v)}で復活`, epithets: ['幾度倒れても折れぬ', '灰より還る'] },
  { kind: 'resonance', weight: 7, roll: () => [0.08, 0.15], desc: (v, t) => `${TAG_INFO[t ?? 'gear'].label}の数+1・${TAG_INFO[t ?? 'gear'].label}装備1つにつき攻撃力 +${pct(v)}`, epithets: ['共鳴する', '呼び合う'] },
  { kind: 'doubleStrike', weight: 6, roll: () => [0.2, 0.3], desc: (v) => `追加攻撃 +${pct(v)}`, epithets: ['深淵を覗く', '双影の'] },
  { kind: 'giantSlayer', weight: 6, roll: () => [0.8, 1.2], desc: (v) => `ボスへのダメージ +${pct(v)}`, epithets: ['竜を屠った', '玉座を砕く'] },
];
/** 夢の記録でしか手に入らない特殊効果 */
export const DREAM_SPECIALS: SpecialDef[] = [
  { kind: 'dreamWalk', weight: 10, roll: () => [0.1, 0.25], desc: (v) => `探索開始地点が最高到達階層の +${pct(v)} 深くなる`, epithets: ['夢路を渡る', '眠りの底を歩く'] },
  { kind: 'lucid', weight: 10, roll: () => [0.4, 0.7], desc: (v) => `会心の一撃のあと ${pct(v)} でもう一撃`, epithets: ['明晰夢の', '醒めながら見る'] },
  { kind: 'dejavu', weight: 10, roll: () => [0.3, 0.6], desc: (v) => `探索中の装備ドロップ率 +${pct(v)}`, epithets: ['既視感の', 'いつか見た'] },
  { kind: 'dreamEater', weight: 8, roll: () => [0.05, 0.1], desc: (v) => `ボス撃破でHP全回復・攻撃力 +${pct(v)}（探索中ずっと）`, epithets: ['悪夢を喰らう', '獏の'] },
];
export const DREAM = {
  /** 夢を記録できる回数（1日あたり） */
  perDay: 1,
  /** 夢アイテムのレアリティ（Rare以上確定） */
  rarityWeights: { rare: 70, legendary: 30 } as Record<'rare' | 'legendary', number>,
  expBonus: 20,
};

export const SPECIAL_BY_KIND = Object.fromEntries([...SPECIALS, ...DREAM_SPECIALS].map((s) => [s.kind, s])) as Record<SpecialKind, SpecialDef>;

export const COMBAT = {
  chainLimit: 3,
  floorHealBase: 0.03,
  bossEvery: 10,
  enemyBase: { hp: 26, atk: 7, def: 2 },
  boss: { hp: 3.5, atk: 1.35, def: 1.2 },
  maxFloor: 1_000_000,
  turnLimitPerFloor: 300,
  momentumCap: 30,
  onKillCap: 400,
  retryStackMax: 5,
  /** 装備評価に使うシミュレーション回数 */
  evalRuns: 3,
};

// ---------- シナジー ----------
export interface SynergyBonus {
  extraAttack?: number; crit?: number; critMul?: number; chainLimit?: number; chainChance?: number;
  expPct?: number; atkPct?: number; dodge?: number; lifesteal?: number; momentum?: number;
  floorHeal?: number; phoenix?: number; onKillAtk?: number; bossDmg?: number; hpPct?: number;
}
export const TAG_INFO: Record<SynergyTag, { label: string; color: string; tiers: [number, SynergyBonus, string][] }> = {
  blade: { label: '刃', color: '#c9d4e0', tiers: [[2, { crit: 0.1 }, '会心率+10%'], [3, { critMul: 0.8 }, '会心ダメージ+80%']] },
  gear: { label: '歯車', color: '#d9a441', tiers: [[2, { extraAttack: 0.1 }, '追加攻撃+10%'], [3, { chainLimit: 3, chainChance: 0.15 }, '連鎖上限+3・連鎖率+15%']] },
  arcane: { label: '秘術', color: '#9b7bff', tiers: [[2, { expPct: 0.2 }, '経験値+20%'], [3, { atkPct: 0.25 }, '攻撃力+25%']] },
  shadow: { label: '影', color: '#7d6b91', tiers: [[2, { dodge: 0.1 }, '回避+10%'], [3, { lifesteal: 0.1 }, '吸収+10%']] },
  wind: { label: '風', color: '#6fd3b5', tiers: [[2, { extraAttack: 0.08, dodge: 0.05 }, '追加攻撃+8%・回避+5%'], [3, { momentum: 0.02 }, '連続撃破ボーナス+2%']] },
  holy: { label: '聖', color: '#ffe08a', tiers: [[2, { floorHeal: 0.05 }, '階層回復+5%'], [3, { phoenix: 0.3 }, '1度だけHP30%で復活']] },
  blood: { label: '血', color: '#e0565b', tiers: [[2, { lifesteal: 0.08 }, '吸収+8%'], [3, { onKillAtk: 0.01 }, '撃破ごと攻撃力+1%']] },
  ember: { label: '炎', color: '#ff8a3d', tiers: [[2, { atkPct: 0.15 }, '攻撃力+15%'], [3, { bossDmg: 0.5 }, 'ボスダメージ+50%']] },
};

// ---------- テーマ ----------
export interface ThemeProfile {
  label: string;
  tags: SynergyTag[];
  affixes: AffixKind[];
  specials: SpecialKind[];
  /** 名前の中間語（「〇〇の」） */
  words: string[];
  dungeons: string[];
}
export const THEME_PROFILES: Record<Theme, ThemeProfile> = {
  learning: { label: '学び', tags: ['arcane'], affixes: ['expPct', 'atkPct'], specials: ['expAmp', 'resonance'], words: ['賢者の', '書を愛する者の', '忘れられた学者の'], dungeons: ['library'] },
  development: { label: '開発', tags: ['gear'], affixes: ['extraAttack', 'crit'], specials: ['chainStrike', 'echo', 'resonance'], words: ['機巧師の', '設計者の', '夜明けまで打つ者の'], dungeons: ['gearworks'] },
  work: { label: '仕事', tags: ['gear', 'blade'], affixes: ['def', 'atk'], specials: ['momentum'], words: ['勤勉なる者の', '職人の', '番人の'], dungeons: ['gearworks'] },
  challenge: { label: '挑戦', tags: ['ember', 'blade'], affixes: ['atk', 'atkPct', 'onKillAtk'], specials: ['momentum', 'giantSlayer'], words: ['挑む者の', '頂を目指す者の', '炎を抱く者の'], dungeons: ['volcano'] },
  failure: { label: '反省', tags: ['shadow', 'holy'], affixes: ['def', 'hpPct', 'retryBoost'], specials: ['phoenix'], words: ['敗れし者の', '影を知る者の', '悔恨の'], dungeons: ['shadow'] },
  discovery: { label: '発見', tags: ['wind', 'arcane'], affixes: ['themeLuck', 'crit'], specials: ['doubleStrike', 'resonance'], words: ['発見者の', '星を見上げる者の', '深淵を覗く者の'], dungeons: ['ruins'] },
  exercise: { label: '運動', tags: ['wind', 'blade'], affixes: ['dodge', 'hp', 'extraAttack'], specials: ['momentum', 'doubleStrike'], words: ['駆ける者の', '鍛えし者の', '風と走る者の'], dungeons: ['volcano', 'ruins'] },
  social: { label: '交流', tags: ['holy'], affixes: ['floorHeal', 'hp', 'lifesteal'], specials: ['floorRegen', 'phoenix'], words: ['友の', '語らう者の', '絆を結ぶ者の'], dungeons: ['garden'] },
  travel: { label: '外出', tags: ['wind'], affixes: ['dodge', 'themeLuck'], specials: ['doubleStrike', 'chainStrike'], words: ['旅人の', '地図を描く者の', '霧を往く者の'], dungeons: ['ruins'] },
  hobby: { label: '趣味', tags: ['arcane', 'gear', 'blood'], affixes: ['themeLuck', 'crit', 'expPct'], specials: ['resonance', 'echo', 'giantSlayer'], words: ['好事家の', '蒐集家の', '遊び人の'], dungeons: ['garden', 'ruins'] },
  rest: { label: '休息', tags: ['holy', 'shadow'], affixes: ['floorHeal', 'hpPct'], specials: ['floorRegen'], words: ['微睡む者の', '安らぎの', '月夜の'], dungeons: ['garden', 'shadow'] },
};

// ---------- ダンジョン ----------
export interface DungeonDef {
  id: string;
  name: string;
  color: string; // 背景色
  floorColor: string;
  mods: { hp: number; atk: number; def: number };
  enemies: { name: string; sprite: string }[];
  boss: { name: string; sprite: string }[];
  dropThemes: Theme[];
  /** 探索イベントの出やすさ補正 */
  eventBias?: Partial<Record<'battle' | 'elite' | 'chest' | 'rest', number>>;
}
export const DUNGEONS: DungeonDef[] = [
  { id: 'library', name: '忘却された図書館', color: '#2a2440', floorColor: '#3b3157', mods: { hp: 1.2, atk: 0.9, def: 1 }, enemies: [{ name: '彷徨う頁', sprite: 'book' }, { name: 'インクスライム', sprite: 'slime' }, { name: '骸骨書記', sprite: 'skeleton' }], boss: [{ name: '禁書の番人', sprite: 'book' }, { name: '骸骨司書', sprite: 'skeleton' }], dropThemes: ['learning', 'discovery'], eventBias: { chest: 1.4 } },
  { id: 'gearworks', name: '歯車仕掛けの迷宮', color: '#2b2a24', floorColor: '#4a4232', mods: { hp: 1, atk: 1, def: 1.25 }, enemies: [{ name: 'ゼンマイ兵', sprite: 'golem' }, { name: '油まみれスライム', sprite: 'slime' }, { name: 'クロックワーカー', sprite: 'clockwork' }], boss: [{ name: '大時計の機神', sprite: 'golem' }, { name: '機巧の守衛', sprite: 'clockwork' }], dropThemes: ['development', 'work'], eventBias: { elite: 1.3 } },
  { id: 'volcano', name: '試練の火山', color: '#3a1d17', floorColor: '#5c2a1c', mods: { hp: 0.9, atk: 1.2, def: 0.9 }, enemies: [{ name: '火の小鬼', sprite: 'imp' }, { name: '溶岩スライム', sprite: 'slime' }, { name: '火山竜', sprite: 'dragon' }], boss: [{ name: '紅蓮の試練王', sprite: 'imp' }, { name: '熔岩竜王', sprite: 'dragon' }], dropThemes: ['challenge', 'exercise'], eventBias: { elite: 1.6, rest: 0.7 } },
  { id: 'shadow', name: '影の回廊', color: '#16151f', floorColor: '#25233a', mods: { hp: 1, atk: 1.1, def: 1 }, enemies: [{ name: '後悔の影', sprite: 'wraith' }, { name: '影スライム', sprite: 'slime' }, { name: '夜蝙蝠', sprite: 'bat' }], boss: [{ name: 'もう一人の自分', sprite: 'wraith' }, { name: '闇夜の大蝙蝠', sprite: 'bat' }], dropThemes: ['failure', 'rest'], eventBias: { elite: 1.2, chest: 1.2 } },
  { id: 'ruins', name: '霧深き古代遺跡', color: '#1f2b2a', floorColor: '#33463f', mods: { hp: 1.1, atk: 1, def: 1.1 }, enemies: [{ name: '石の守護者', sprite: 'golem' }, { name: '苔むしたキノコ', sprite: 'mushroom' }, { name: '古代甲虫', sprite: 'scarab' }], boss: [{ name: '霧の古代王', sprite: 'wraith' }, { name: '遺跡の巨甲虫', sprite: 'scarab' }], dropThemes: ['discovery', 'travel'], eventBias: { chest: 1.7 } },
  { id: 'garden', name: '陽だまりの庭園', color: '#1f3322', floorColor: '#2f4d30', mods: { hp: 1.05, atk: 0.95, def: 1 }, enemies: [{ name: 'おしゃべりキノコ', sprite: 'mushroom' }, { name: '花スライム', sprite: 'slime' }, { name: 'マンドレイク', sprite: 'mandrake' }], boss: [{ name: '大樹の精', sprite: 'mushroom' }, { name: '庭園のマンドレイク', sprite: 'mandrake' }], dropThemes: ['social', 'hobby', 'rest'], eventBias: { rest: 1.8, elite: 0.7 } },
];
export const DUNGEON_BY_ID = Object.fromEntries(DUNGEONS.map((d) => [d.id, d])) as Record<string, DungeonDef>;
/** テーマに関わらず選ばれる確率 */
export const DUNGEON_RANDOM_CHANCE = 0.3;
