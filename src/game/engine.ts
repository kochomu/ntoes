// ゲーム進行のオーケストレーション。純粋関数（state を受け取り新しい state を返す）。
import { analyzeDiary } from './analyzer';
import {
  COMBAT, DAILY_REWARD_LIMIT, DROPS, DUNGEONS, DUNGEON_BY_ID, DUNGEON_RANDOM_CHANCE, EXP_TABLE,
  RARITY_INFO, TAG_INFO, THEME_PROFILES, expToNext,
} from './config';
import { simulateDungeon, type DungeonResult } from './dungeon';
import { generateItem } from './items';
import { chance, createRng, pick, weighted, type Rng } from './rng';
import { computeBuild, powerRating, type Build } from './stats';
import type { AdventureLog, Analysis, DiaryEntry, GameState, Item, LogEvent, Slot, Theme } from './types';
import { SLOTS } from './types';

export function createInitialState(): GameState {
  return {
    version: 1,
    character: {
      level: 1, exp: 0, totalExp: 0, bestFloor: 0, retryStacks: 0,
      equipped: { weapon: null, armor: null, ring: null, accessory: null },
    },
    items: {},
    diaries: [],
    logs: [],
    codex: {},
    records: [],
    idCounter: 0,
  };
}

export function countChars(text: string): number {
  return [...text.replace(/\s/g, '')].length;
}

export function expForChars(chars: number): number {
  for (const [min, exp] of EXP_TABLE) if (chars >= min) return exp;
  return 0;
}

export function equippedItems(state: GameState, override?: Partial<Record<Slot, Item | null>>): Item[] {
  return SLOTS.map((s) => (override && s in override ? override[s] : state.character.equipped[s] ? state.items[state.character.equipped[s]!] : null)).filter(
    (x): x is Item => !!x,
  );
}

export function currentBuild(state: GameState): Build {
  return computeBuild(state.character.level, equippedItems(state), state.character.retryStacks);
}

const EVAL_DUNGEON = { ...DUNGEONS[0], mods: { hp: 1, atk: 1, def: 1 } };

/**
 * 装備評価：戦闘ロジックそのものを固定シードで複数回シミュレートし、平均到達階層で比較する。
 * これにより「評価式と実際の戦闘の食い違い」が起きない。同値の場合は戦闘力の目安で比較。
 */
export function evaluateLoadout(level: number, items: Item[]): number {
  const build = computeBuild(level, items, 0);
  let total = 0;
  for (let i = 0; i < COMBAT.evalRuns; i++) {
    total += simulateDungeon(build, EVAL_DUNGEON, createRng(1000 + i), { prevBest: 0, log: false }).floorReached;
  }
  return total / COMBAT.evalRuns + powerRating(build) * 1e-6;
}

export interface EquipDecision {
  equipped: boolean;
  before: number;
  after: number;
  replaced?: Item;
  newSynergies: string[];
}

export function tryAutoEquip(state: GameState, item: Item): EquipDecision {
  const ch = state.character;
  const curId = ch.equipped[item.slot];
  const current = curId ? state.items[curId] : null;
  const beforeItems = equippedItems(state);
  const afterItems = equippedItems(state, { [item.slot]: item });
  const before = evaluateLoadout(ch.level, beforeItems);
  const after = evaluateLoadout(ch.level, afterItems);
  if (after <= before) return { equipped: false, before, after, newSynergies: [] };
  const beforeSyn = new Set(computeBuild(ch.level, beforeItems).synergies.flatMap((s) => s.desc.map((d) => `${s.tag}:${d}`)));
  const newSynergies = computeBuild(ch.level, afterItems)
    .synergies.flatMap((s) => s.desc.map((d) => ({ key: `${s.tag}:${d}`, text: `【${TAG_INFO[s.tag].label}×${s.count}】${d}` })))
    .filter((x) => !beforeSyn.has(x.key))
    .map((x) => x.text);
  ch.equipped[item.slot] = item.id;
  return { equipped: true, before, after, replaced: current ?? undefined, newSynergies };
}

function nextId(state: GameState, prefix: string): string {
  state.idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${state.idCounter.toString(36)}`;
}

function addExp(state: GameState, amount: number, events: LogEvent[]) {
  const ch = state.character;
  ch.exp += amount;
  ch.totalExp += amount;
  while (ch.exp >= expToNext(ch.level)) {
    ch.exp -= expToNext(ch.level);
    ch.level += 1;
    events.push({ level: 'important', kind: 'levelup', text: `レベルアップ！ Lv.${ch.level} になった` });
  }
}

function itemLevel(state: GameState): number {
  return state.character.level + Math.floor(state.character.bestFloor / 10);
}

function rarityText(item: Item) {
  return item.rarity === 'normal' ? '' : `[${RARITY_INFO[item.rarity].label}] `;
}

function acquireItem(state: GameState, item: Item, events: LogEvent[], at: string) {
  state.items[item.id] = item;
  const isNew = !state.codex[item.baseKey];
  if (isNew) state.codex[item.baseKey] = at;
  const level: LogEvent['level'] = item.rarity === 'legendary' ? 'epic' : item.rarity === 'rare' || item.special ? 'important' : 'normal';
  const prefix = item.source === 'boss' ? 'ボスが' : '';
  events.push({
    level,
    kind: 'item',
    itemId: item.id,
    text: `${prefix}${rarityText(item)}《${item.name}》を${item.source === 'boss' ? '落とした' : '入手'}！${item.special && item.rarity !== 'legendary' ? '（特殊効果つき！）' : ''}`,
  });
  const d = tryAutoEquip(state, item);
  if (d.equipped) {
    const gain = d.before > 0 ? ` 予想到達 ${Math.floor(d.before)}階 → ${Math.floor(d.after)}階` : '';
    events.push({
      level: d.after - d.before >= 5 ? 'epic' : 'important',
      kind: 'equip',
      itemId: item.id,
      text: `装備を自動更新：《${item.name}》${d.replaced ? `（《${d.replaced.name}》と交換）` : ''}${gain}`,
    });
    for (const s of d.newSynergies) events.push({ level: 'epic', kind: 'synergy', text: `シナジー発生！ ${s}` });
  }
  pruneInventory(state);
}

function pruneInventory(state: GameState) {
  const equippedIds = new Set(Object.values(state.character.equipped));
  const spare = Object.values(state.items).filter((i) => !equippedIds.has(i.id));
  if (spare.length <= DROPS.inventoryCap) return;
  const removable = spare.filter((i) => i.rarity === 'normal' && !i.special).sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt));
  for (const it of removable.slice(0, spare.length - DROPS.inventoryCap)) delete state.items[it.id];
}

export function chooseDungeon(rng: Rng, analysis: Analysis | null) {
  const themes = analysis?.themes ?? [];
  if (!themes.length || chance(rng, DUNGEON_RANDOM_CHANCE)) return pick(rng, DUNGEONS);
  const theme = weighted(rng, themes.map((t) => [t.type, t.weight] as const));
  return DUNGEON_BY_ID[pick(rng, THEME_PROFILES[theme].dungeons)];
}

export interface DiaryResult {
  state: GameState;
  entry: DiaryEntry;
  log?: AdventureLog;
  /** 日記保存〜攻略まで、表示順に並んだイベント */
  events: LogEvent[];
  dungeon?: DungeonResult;
}

/** 当日すでに報酬を受け取った日記の数 */
export function rewardedCountOn(state: GameState, date: string) {
  return state.diaries.filter((d) => d.date === date && d.rewarded).length;
}

/**
 * 日記を保存し、報酬→ドロップ→自動装備→ダンジョン攻略→記録更新までを一括で処理する。
 * state は複製してから変更するので、呼び出し元の state は変わらない。
 */
export function submitDiary(
  prev: GameState,
  input: { text: string; date: string; now?: Date },
  rng: Rng,
  analysis: Analysis | null = analyzeDiary(input.text),
  seed = 0,
): DiaryResult {
  const state: GameState = structuredClone(prev);
  const now = (input.now ?? new Date()).toISOString();
  const chars = countChars(input.text);
  const events: LogEvent[] = [];
  const entry: DiaryEntry = {
    id: nextId(state, 'd'),
    date: input.date,
    createdAt: now,
    updatedAt: now,
    text: input.text,
    chars,
    analysis,
    expGained: 0,
    rewarded: false,
    logIds: [],
  };

  events.push({ level: 'normal', kind: 'diary', text: `日記を保存しました（${chars}文字）` });
  if (rewardedCountOn(state, input.date) >= DAILY_REWARD_LIMIT) {
    events.push({ level: 'normal', kind: 'diary', text: `今日の冒険はもう十分。続きは明日（1日${DAILY_REWARD_LIMIT}回まで）` });
    state.diaries.push(entry);
    return { state, entry, events };
  }
  entry.rewarded = true;

  // 1. 経験値
  const build0 = currentBuild(state);
  const exp = Math.round(expForChars(chars) * (1 + build0.expPct));
  entry.expGained = exp;
  events.push({ level: 'normal', kind: 'exp', text: `経験値 +${exp}` });
  addExp(state, exp, events);

  // 2. ドロップ
  const themes = analysis?.themes ?? [];
  let drops = DROPS.base + (chars >= DROPS.bonusChars && chance(rng, DROPS.bonusChance) ? 1 : 0);
  const newItemIds: string[] = [];
  while (drops-- > 0) {
    const item = generateItem(rng, { ilvl: itemLevel(state), themes, themeLuck: currentBuild(state).themeLuck }, nextId(state, 'i'), now);
    item.diaryId = entry.id;
    acquireItem(state, item, events, now);
    newItemIds.push(item.id);
  }

  // 3. ダンジョン攻略
  const dungeon = chooseDungeon(rng, analysis);
  const build = currentBuild(state);
  const prevBest = state.character.bestFloor;
  const result = simulateDungeon(build, dungeon, rng, { prevBest, log: true });
  events.push(...result.events);

  // ボスドロップ（ダンジョンのテーマに寄る）
  const bossDrops = Math.min(DROPS.bossDropMax, result.bossFloors.filter(() => chance(rng, DROPS.bossDropChance)).length);
  const dungeonThemes: { type: Theme; weight: number }[] = dungeon.dropThemes.map((t) => ({ type: t, weight: 1 }));
  for (let i = 0; i < bossDrops; i++) {
    const item = generateItem(rng, { ilvl: itemLevel(state), themes: dungeonThemes, rarityBoost: 1, themeLuck: currentBuild(state).themeLuck }, nextId(state, 'i'), now, 'boss');
    item.diaryId = entry.id;
    acquireItem(state, item, events, now);
    newItemIds.push(item.id);
  }

  if (result.exp > 0) {
    events.push({ level: 'normal', kind: 'exp', text: `攻略経験値 +${result.exp}` });
    entry.expGained += result.exp;
    addExp(state, result.exp, events);
  }

  // 4. 記録更新
  const reached = result.floorsCleared;
  const newRecord = reached > prevBest;
  const logId = nextId(state, 'l');
  if (newRecord) {
    const big = reached - prevBest >= 10 || (prevBest > 0 && reached >= prevBest * 1.5);
    events.push({
      level: big ? 'epic' : 'important',
      kind: 'record',
      text: `最高到達階層を更新！ ${prevBest}階 → ${reached}階${big ? ' 大躍進！' : ''}`,
    });
    state.records.push({ at: now, from: prevBest, to: reached, logId });
    state.character.bestFloor = reached;
    state.character.retryStacks = 0;
  } else {
    state.character.retryStacks = Math.min(COMBAT.retryStackMax, state.character.retryStacks + 1);
    events.push({ level: 'normal', kind: 'record', text: `到達 ${reached}階（最高 ${prevBest}階）` });
  }

  const log: AdventureLog = {
    id: logId,
    at: now,
    diaryId: entry.id,
    dungeonId: dungeon.id,
    dungeonName: dungeon.name,
    floorReached: reached,
    prevBest,
    newRecord,
    bossesDefeated: result.bossFloors.length,
    maxChain: result.maxChain,
    lastEnemy: result.lastEnemy,
    events,
    itemIds: newItemIds,
    seed,
  };
  entry.logIds.push(logId);
  state.logs.push(log);
  state.diaries.push(entry);
  return { state, entry, log, events, dungeon: result };
}

/** 日記本文の編集（報酬は再付与しない。分析のみ更新） */
export function editDiary(prev: GameState, id: string, text: string, now = new Date()): GameState {
  const state: GameState = structuredClone(prev);
  const d = state.diaries.find((x) => x.id === id);
  if (!d) return prev;
  d.text = text;
  d.chars = countChars(text);
  d.analysis = analyzeDiary(text);
  d.updatedAt = now.toISOString();
  return state;
}
