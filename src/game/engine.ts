// ゲーム進行のオーケストレーション。純粋関数（state を受け取り新しい state を返す）。
// 投稿・経験値・装備・探索（放置進行）をそれぞれ独立した関数として組み合わせる。
import { analyzeDiary } from './analyzer';
import {
  COMBAT, DAILY_REWARD_LIMIT, DROPS, DUNGEONS, DUNGEON_BY_ID, DUNGEON_RANDOM_CHANCE, EXP_TABLE,
  DREAM, FLOOR_EVENTS, IDLE, POST, RARITY_INFO, TAG_INFO, THEME_PROFILES, expToNext, itemLevelFor, itemScaleFor,
} from './config';
import { playFloor, simulateDungeon, startExpedition, type DropSource } from './dungeon';
import { generateDreamItem, generateItem } from './items';
import { chance, createRng, pick, randomSeed, weighted, type Rng } from './rng';
import { computeBuild, powerRating, type Build } from './stats';
import type {
  AdventureLog, Analysis, DiaryEntry, GameState, IdleReport, Item, LogEvent, PostColor, Slot, Theme,
} from './types';
import { RARITIES, SLOTS, THEMES } from './types';

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
    idle: { carrySeconds: 0, expCarry: 0 },
    reports: [],
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

// ---------- 装備評価・自動装備 ----------
const EVAL_DUNGEON = { ...DUNGEONS[0], mods: { hp: 1, atk: 1, def: 1 }, eventBias: {} };
const evalCache = new Map<string, number>();

/**
 * 装備評価：戦闘ロジックそのものを固定シードで複数回シミュレートし、平均到達階層で比較する。
 * 攻撃力だけでなく特殊効果・シナジーの実際の効き目がそのまま反映される。同値なら戦闘力の目安で比較。
 */
export function evaluateLoadout(level: number, items: Item[]): number {
  const key = `${level}|${items.map((i) => i.id).sort().join(',')}`;
  const hit = evalCache.get(key);
  if (hit !== undefined) return hit;
  const build = computeBuild(level, items, 0);
  let total = 0;
  for (let i = 0; i < COMBAT.evalRuns; i++) {
    total += simulateDungeon(build, EVAL_DUNGEON, createRng(1000 + i), { prevBest: 0, log: false }).floorReached;
  }
  const score = total / COMBAT.evalRuns + powerRating(build) * 1e-6;
  if (evalCache.size > 500) evalCache.clear();
  evalCache.set(key, score);
  return score;
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
  // 同等以上のアイテムレベルなら、上位レアリティをシナジーより優先する。
  // 同一レアリティや低IL品は従来どおり実戦シミュレーションで比較する。
  const rarityUpgrade = !!current
    && RARITIES.indexOf(item.rarity) > RARITIES.indexOf(current.rarity)
    && item.ilvl >= current.ilvl;
  // 明らかに弱い装備はシミュレーションせずに見送る（端末の負荷対策）
  if (current && !rarityUpgrade && !item.special && powerRating(computeBuild(ch.level, afterItems)) < powerRating(computeBuild(ch.level, beforeItems)) * 0.9) {
    return { equipped: false, before: 0, after: 0, newSynergies: [] };
  }
  const before = evaluateLoadout(ch.level, beforeItems);
  const after = evaluateLoadout(ch.level, afterItems);
  if (after <= before && !rarityUpgrade) return { equipped: false, before, after, newSynergies: [] };
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
    events.push({ level: 'normal', kind: 'levelup', text: `レベルアップ！ Lv.${ch.level} になった` });
  }
}

const SOURCE_TEXT: Record<Item['source'], string> = {
  diary: 'ひらめきから', boss: 'ボスが落とした', chest: '宝箱から', elite: '強敵が落とした', battle: '', dream: '夢から',
};

function acquireItem(state: GameState, item: Item, events: LogEvent[], at: string) {
  state.items[item.id] = item;
  if (!state.codex[item.baseKey]) state.codex[item.baseKey] = at;
  const level: LogEvent['level'] = item.rarity === 'legendary' || item.rarity === 'mythic' ? 'epic' : item.rarity === 'rare' || item.special ? 'important' : 'detail';
  const tag = item.rarity === 'normal' ? '' : `[${RARITY_INFO[item.rarity].label}] `;
  const where = item.floor ? `第${item.floor}階層：` : '';
  events.push({
    level,
    kind: 'item',
    itemId: item.id,
    floor: item.floor,
    text: `${where}${SOURCE_TEXT[item.source]}${tag}《${item.name}》を入手！${item.special && item.rarity !== 'legendary' && item.rarity !== 'mythic' ? '（特殊効果つき！）' : ''}`,
  });
  const d = tryAutoEquip(state, item);
  if (d.equipped) {
    const gain = Math.floor(d.after) - Math.floor(d.before);
    events.push({
      level: gain >= 10 ? 'epic' : 'important',
      kind: 'equip',
      itemId: item.id,
      text: `装備を自動更新：《${item.name}》${d.replaced ? `（《${d.replaced.name}》と交換）` : ''}${gain > 0 ? ` 予想到達 ${Math.floor(d.before)}階 → ${Math.floor(d.after)}階` : ''}`,
    });
    for (const s of d.newSynergies) events.push({ level: 'epic', kind: 'synergy', text: `シナジー発生！ ${s}` });
  }
  pruneInventory(state);
}

function pruneInventory(state: GameState) {
  const equippedIds = new Set(Object.values(state.character.equipped));
  const spare = Object.values(state.items).filter((i) => !equippedIds.has(i.id));
  if (spare.length <= DROPS.inventoryCap) return;
  // 価値 = レアリティ＋特殊効果＋アイテムレベル。夢アイテムは残す
  const rank: Record<Item['rarity'], number> = { normal: 0, magic: 4, rare: 8, legendary: 16, mythic: 32 };
  const value = (i: Item) => rank[i.rarity] + (i.special ? 4 : 0) + i.ilvl * 0.5;
  const removable = spare.filter((i) => !i.dream).sort((a, b) => value(a) - value(b) || a.acquiredAt.localeCompare(b.acquiredAt));
  for (const it of removable.slice(0, spare.length - DROPS.inventoryCap)) delete state.items[it.id];
}

// ---------- 投稿テーマ → 傾向 ----------
/** 直近の投稿の分類結果を時間で減衰させて合算する（分類が無くても空配列を返すだけ） */
export function recentThemeWeights(state: GameState, now: Date): { type: Theme; weight: number }[] {
  const acc: Partial<Record<Theme, number>> = {};
  const windowMs = POST.themeWindowHours * 3600_000;
  for (let i = state.diaries.length - 1; i >= 0; i--) {
    const d = state.diaries[i];
    const age = now.getTime() - new Date(d.createdAt).getTime();
    if (age > windowMs) break;
    const decay = Math.pow(0.5, Math.max(0, age) / (POST.themeHalfLifeHours * 3600_000));
    for (const t of d.analysis?.themes ?? []) acc[t.type] = (acc[t.type] ?? 0) + t.weight * decay;
  }
  return THEMES.filter((t) => (acc[t] ?? 0) > 0.05).map((t) => ({ type: t, weight: acc[t]! }));
}

export function chooseDungeon(rng: Rng, themes: { type: Theme; weight: number }[]) {
  if (!themes.length || chance(rng, DUNGEON_RANDOM_CHANCE)) return pick(rng, DUNGEONS);
  const theme = weighted(rng, themes.map((t) => [t.type, t.weight] as const));
  return DUNGEON_BY_ID[pick(rng, THEME_PROFILES[theme].dungeons)];
}

// ---------- 探索（放置進行） ----------
interface AdvanceStats {
  kills: number; floors: number; bosses: number; chests: number; rests: number; elites: number;
  expeditions: number; deepest: number; maxChain: number; itemIds: string[]; expFloat: number; events: LogEvent[];
  bestStart: number;
}

function inspired(state: GameState, t: number) {
  return !!state.idle.inspirationUntil && t < new Date(state.idle.inspirationUntil).getTime();
}

function finishExpedition(state: GameState, at: string, st: AdvanceStats) {
  const ex = state.expedition!;
  const d = DUNGEON_BY_ID[ex.dungeonId];
  const reached = ex.floor - 1;
  const newRecord = reached > ex.prevBest;
  const logId = ex.id;
  if (newRecord) {
    const big = reached - ex.prevBest >= 10 || (ex.prevBest > 0 && reached >= ex.prevBest * 1.5);
    const e: LogEvent = { level: big ? 'epic' : 'important', kind: 'record', text: `最高到達階層を更新！ ${ex.prevBest}階 → ${reached}階${big ? ' 大躍進！' : ''}` };
    ex.events.push(e);
    // 前回の精算中にすでに見せた更新は、今回のまとめでは目立たせない
    st.events.push(reached > st.bestStart ? e : { ...e, level: 'detail' });
    state.records.push({ at, from: ex.prevBest, to: reached, logId });
    state.character.retryStacks = 0;
  } else {
    state.character.retryStacks = Math.min(COMBAT.retryStackMax, state.character.retryStacks + 1);
  }
  const log: AdventureLog = {
    id: logId, at, dungeonId: d.id, dungeonName: d.name, floorReached: reached, prevBest: ex.prevBest, newRecord,
    bossesDefeated: ex.bossFloors.length, maxChain: ex.maxChain, lastEnemy: ex.lastEnemy, events: ex.events, itemIds: ex.itemIds, seed: 0,
  };
  state.logs.push(log);
  // 古い記録は詳細ログを捨てて容量を抑える
  if (state.logs.length > IDLE.maxLogs) state.logs.splice(0, state.logs.length - IDLE.maxLogs);
  for (let i = 0; i < state.logs.length - 50; i++) state.logs[i].events = state.logs[i].events.filter((e) => e.level === 'epic' || e.kind === 'record');
  state.expedition = undefined;
}

/**
 * 指定秒数ぶん探索を進める。startMs は探索開始時刻（ひらめき判定とタイムスタンプに使う）。
 * 戻り値の carry は次回へ繰り越す秒数。
 */
function advanceExploration(state: GameState, seconds: number, startMs: number, rng: Rng, now: Date, st: AdvanceStats, itemCap: { left: number }, combat?: string[], eager = false): number {
  let budget = seconds;
  let processed = 0;
  let t = startMs;
  const themes = recentThemeWeights(state, now);
  while (budget > 0) {
    if (!state.expedition) {
      const d = chooseDungeon(rng, themes);
      const best = state.character.bestFloor;
      state.expedition = startExpedition(nextId(state, 'l'), currentBuild(state), d.id, best, new Date(t).toISOString());
      const startFloor = checkpointFloor(best, currentBuild(state).dreamWalk);
      state.expedition.floor = startFloor;
      state.expedition.events.push({ level: 'normal', kind: 'start', text: `${d.name}へ出発${startFloor > 1 ? `（第${startFloor}階層から）` : ''}` });
      st.expeditions++;
    }
    const ex = state.expedition;
    const d = DUNGEON_BY_ID[ex.dungeonId];
    // 次の階層のイベント種別で所要時間が変わるため、通常戦闘の時間を最低コストとして判定
    // eager（画面を開いている間）は時間を前借りして次の階層を先に計算し、戦闘ログを流しながら待つ
    if (budget < IDLE.floorSeconds.battle && !(eager && processed === 0 && budget >= 0)) break;
    processed++;
    const build = currentBuild(state);
    const isInspired = inspired(state, t);
    const o = playFloor(ex, build, isInspired ? { ...d, eventBias: { ...d.eventBias, chest: (d.eventBias?.chest ?? 1) * POST.inspirationChestMul } } : d, rng, true, combat);
    if (combat && combat.length > 120) combat.splice(0, combat.length - 60);
    const cost = IDLE.floorSeconds[o.event] ?? IDLE.floorSeconds.battle;
    budget -= cost;
    t += cost * 1000;
    const atIso = new Date(t).toISOString();

    st.kills += o.kills;
    st.maxChain = Math.max(st.maxChain, o.maxChainThisFloor);
    if (o.event === 'chest') st.chests++;
    if (o.event === 'rest') st.rests++;
    if (o.event === 'elite' && o.cleared) st.elites++;
    if (o.event === 'boss' && o.cleared) st.bosses++;
    if (o.cleared) {
      st.floors++;
      st.deepest = Math.max(st.deepest, o.floor);
      st.expFloat += (IDLE.expPerFloor + (o.event === 'boss' ? IDLE.expPerBoss : 0)) * (1 + build.expPct) * (isInspired ? POST.inspirationExpMul : 1);
      if (o.floor > state.character.bestFloor) state.character.bestFloor = o.floor;
    }
    const floorEvents = [...o.events];
    for (const src of o.drops) {
      if (itemCap.left <= 0) {
        if (src === 'chest') st.expFloat += IDLE.chestOverflowExp;
        continue;
      }
      itemCap.left--;
      const item = rollDungeonItem(state, rng, src, o.floor, d.dropThemes, themes, atIso);
      acquireItem(state, item, floorEvents, atIso);
      ex.itemIds.push(item.id);
      st.itemIds.push(item.id);
    }
    ex.events.push(...floorEvents.filter((e) => e.level !== 'detail' || e.kind === 'item'));
    st.events.push(...floorEvents);
    if (ex.ended) {
      finishExpedition(state, atIso, st);
      budget -= IDLE.returnSeconds;
      t += IDLE.returnSeconds * 1000;
    }
  }
  // 進行中の探索ログは肥大化しないよう重要なものを優先して残す
  if (state.expedition && state.expedition.events.length > 80) {
    const evs = state.expedition.events;
    state.expedition.events = [...evs.filter((e) => e.level === 'epic' || e.level === 'important').slice(-50), ...evs.slice(-20)].slice(-80);
  }
  return eager ? Math.max(-IDLE.floorSeconds.boss, budget) : Math.max(0, budget);
}

/** 探索の開始階層：最高到達階層の一定割合までのボス階層を突破済みとして、その次から始める */
export function checkpointFloor(best: number, bonus = 0): number {
  const ratio = Math.min(0.95, IDLE.checkpointRatio + bonus);
  return Math.floor((best * ratio) / COMBAT.bossEvery) * COMBAT.bossEvery + 1;
}

function rollDungeonItem(state: GameState, rng: Rng, src: DropSource, floor: number, dropThemes: Theme[], postThemes: { type: Theme; weight: number }[], at: string): Item {
  // ダンジョンのテーマ＋投稿の傾向を混ぜてドロップの傾向にする
  const themes = [...dropThemes.map((t) => ({ type: t, weight: 0.6 })), ...postThemes];
  const item = generateItem(
    rng,
    { ilvl: itemLevelFor(state.character.level, floor), scale: itemScaleFor(floor), themes, rarityBoost: FLOOR_EVENTS.rarityBoost[src], themeLuck: currentBuild(state).themeLuck },
    nextId(state, 'i'),
    at,
    src,
  );
  item.floor = floor;
  return item;
}

/**
 * 長時間の放置：細かく計算した分（detailSeconds）のペースで残りの時間の成果を算出する。
 * 経験値・撃破数・突破階層は比例、装備は上限つきで実際に生成して自動装備にかける。
 */
function extrapolate(state: GameState, st: AdvanceStats, ratio: number, rng: Rng, at: string) {
  if (ratio <= 0) return;
  st.expFloat += st.expFloat * ratio;
  st.kills += Math.round(st.kills * ratio);
  st.floors += Math.round(st.floors * ratio);
  st.bosses += Math.round(st.bosses * ratio);
  st.chests += Math.round(st.chests * ratio);
  st.elites += Math.round(st.elites * ratio);
  st.rests += Math.round(st.rests * ratio);
  st.expeditions += Math.round(st.expeditions * ratio);
  const n = Math.min(IDLE.extrapolatedItemCap, Math.round(st.itemIds.length * ratio));
  const best = state.character.bestFloor;
  const lo = checkpointFloor(best);
  const themes = recentThemeWeights(state, new Date(at));
  for (let i = 0; i < n; i++) {
    const floor = lo + Math.floor(rng.next() * Math.max(1, best - lo + 1));
    const d = pick(rng, DUNGEONS);
    const item = rollDungeonItem(state, rng, 'chest', floor, d.dropThemes, themes, at);
    acquireItem(state, item, st.events, at);
    st.itemIds.push(item.id);
  }
  st.events.push({ level: 'normal', kind: 'extrapolate', text: `長い放置のため、${formatHours(IDLE.detailSeconds)}を超えた分は探索ペースから成果を算出しました` });
}

function formatHours(sec: number) {
  return `${Math.round(sec / 3600)}時間`;
}

function emptyStats(bestStart: number): AdvanceStats {
  return { bestStart, kills: 0, floors: 0, bosses: 0, chests: 0, rests: 0, elites: 0, expeditions: 0, deepest: 0, maxChain: 0, itemIds: [], expFloat: 0, events: [] };
}

/** 重要な出来事だけを選び、同じ種類の重要ログは間引く（レアほど目立たせ、過剰にしない） */
export function pickHighlights(events: LogEvent[], max = 30): LogEvent[] {
  const out: LogEvent[] = [];
  const seenImportant = new Map<string, number>();
  for (const e of events) {
    if (e.level === 'epic') out.push(e);
    else if (e.level === 'important') {
      const n = seenImportant.get(e.kind) ?? 0;
      // ボス撃破・装備更新は数件まで、その他は種類ごとに2件まで
      const limit = e.kind === 'equip' || e.kind === 'item' ? 6 : e.kind === 'boss' ? 3 : 2;
      if (n < limit) out.push(e);
      seenImportant.set(e.kind, n + 1);
    }
  }
  const epics = out.filter((e) => e.level === 'epic');
  if (out.length <= max) return out;
  return [...epics.slice(-max), ...out.filter((e) => e.level !== 'epic')].slice(0, max);
}

function makeReport(state: GameState, st: AdvanceStats, from: string, to: string, seconds: number, counted: number, levelFrom: number, bestFrom: number, exp: number, source: IdleReport['source']): IdleReport {
  return {
    id: nextId(state, 'r'), from, to, seconds, countedSeconds: counted, kills: st.kills, floorsCleared: st.floors, deepest: st.deepest,
    bosses: st.bosses, chests: st.chests, rests: st.rests, elites: st.elites, expeditions: st.expeditions, exp, levelFrom,
    levelTo: state.character.level, itemIds: st.itemIds, bestFrom, bestTo: state.character.bestFloor, maxChain: st.maxChain,
    highlights: pickHighlights(st.events), source,
  };
}

function applyExp(state: GameState, st: AdvanceStats): number {
  const total = st.expFloat + state.idle.expCarry;
  const exp = Math.floor(total);
  state.idle.expCarry = total - exp;
  if (exp > 0) addExp(state, exp, st.events);
  return exp;
}

/**
 * 前回の精算から現在までの経過時間ぶん探索をシミュレートする（最大 IDLE.maxSeconds）。
 * アプリ起動時・復帰時・定期的に呼ぶ。
 */
export function settleIdle(prev: GameState, now: Date = new Date(), rng?: Rng, opts: { combat?: string[]; eager?: boolean } = {}): { state: GameState; report: IdleReport | null } {
  const state: GameState = structuredClone(prev);
  const nowIso = now.toISOString();
  if (!state.idle.lastTick) {
    state.idle.lastTick = nowIso;
    return { state, report: null };
  }
  const last = new Date(state.idle.lastTick).getTime();
  const seconds = Math.max(0, (now.getTime() - last) / 1000);
  if (seconds < 1) return { state: prev, report: null };
  const counted = Math.min(seconds, IDLE.maxSeconds);
  const capped = seconds > IDLE.maxSeconds;
  const r = rng ?? createRng(state.idle.rngState ?? randomSeed());
  const st = emptyStats(state.character.bestFloor);
  const levelFrom = state.character.level;
  const bestFrom = state.character.bestFloor;
  const startMs = capped ? now.getTime() - counted * 1000 : last;
  const detail = Math.min(counted, IDLE.detailSeconds);
  const carry = advanceExploration(state, detail + (capped ? 0 : state.idle.carrySeconds), startMs, r, now, st, { left: IDLE.itemCapPerSettle }, opts.combat, opts.eager);
  state.idle.carrySeconds = counted > detail ? 0 : carry;
  if (counted > detail) extrapolate(state, st, (counted - detail) / detail, r, nowIso);
  state.idle.lastTick = nowIso;
  if (!rng && 'state' in r) state.idle.rngState = (r as ReturnType<typeof createRng>).state();
  const exp = applyExp(state, st);
  const report = makeReport(state, st, new Date(last).toISOString(), nowIso, seconds, counted, levelFrom, bestFrom, exp, 'idle');
  if (seconds >= IDLE.reportMinSeconds) {
    state.reports.push(report);
    if (state.reports.length > IDLE.maxReports) state.reports.splice(0, state.reports.length - IDLE.maxReports);
  }
  return { state, report };
}

// ---------- 投稿 ----------
export interface PostResult {
  state: GameState;
  entry: DiaryEntry;
  events: LogEvent[];
  report?: IdleReport;
}

/** 当日すでに報酬を受け取った投稿の数 */
export function rewardedCountOn(state: GameState, date: string) {
  return state.diaries.filter((d) => d.date === date && d.rewarded).length;
}

function safeAnalyze(text: string): Analysis | null {
  try {
    return analyzeDiary(text);
  } catch {
    return null; // 分類に失敗しても投稿・ゲーム進行は続ける
  }
}

/** その日にまだ夢を記録できるか */
export function canRecordDream(state: GameState, date: string): boolean {
  return state.diaries.filter((d) => d.kind === 'dream' && d.date === date).length < DREAM.perDay;
}

/**
 * 短文投稿を保存し、経験値・装備ドロップ・ひらめき（探索ボーナス）・即時探索を処理する。
 * 報酬の強さは投稿内容に依存せず、分類結果は装備とダンジョンの「傾向」にだけ使う。
 * kind = 'dream' のときは夢の記録（1日1回・夢限定アイテムを確定で獲得）。
 */
export function submitPost(
  prev: GameState,
  input: { text: string; date: string; now?: Date; kind?: 'post' | 'dream' },
  rng: Rng,
  analysis: Analysis | null = safeAnalyze(input.text),
): PostResult {
  const state: GameState = structuredClone(prev);
  const nowDate = input.now ?? new Date();
  const now = nowDate.toISOString();
  const chars = countChars(input.text);
  const isDream = input.kind === 'dream' && canRecordDream(state, input.date);
  const events: LogEvent[] = [];
  const entry: DiaryEntry = {
    id: nextId(state, 'd'), date: input.date, createdAt: now, updatedAt: now, text: input.text, chars, analysis,
    expGained: 0, rewarded: false, logIds: [], ...(isDream ? { kind: 'dream' as const } : {}),
  };

  if (!isDream && rewardedCountOn(state, input.date) >= DAILY_REWARD_LIMIT) {
    events.push({ level: 'normal', kind: 'post', text: `投稿を保存しました（今日の報酬は上限${DAILY_REWARD_LIMIT}回に達しています）` });
    entry.events = events;
    state.diaries.push(entry);
    return { state, entry, events };
  }
  entry.rewarded = true;

  // 1. 経験値
  const exp = Math.round((expForChars(chars) + (isDream ? DREAM.expBonus : 0)) * (1 + currentBuild(state).expPct));
  entry.expGained = exp;
  events.push({ level: 'normal', kind: 'exp', text: `${isDream ? '夢を記録' : '投稿を保存'} ・ 経験値 +${exp}` });
  addExp(state, exp, events);

  const ctx = () => ({ ilvl: itemLevelFor(state.character.level, state.character.bestFloor), scale: itemScaleFor(state.character.bestFloor), themes: analysis?.themes ?? [], themeLuck: currentBuild(state).themeLuck });
  const showAll = (evs: LogEvent[]) => evs.map((e) => (e.kind === 'item' && e.level === 'detail' ? { ...e, level: 'normal' as const } : e));

  // 2. 夢限定アイテム
  if (isDream) {
    const item = generateDreamItem(rng, ctx(), nextId(state, 'i'), now);
    item.diaryId = entry.id;
    const evs: LogEvent[] = [{ level: 'epic', kind: 'dream', text: `夢の中から《${item.name}》を持ち帰った！` }];
    acquireItem(state, item, evs, now);
    events.push(...evs.filter((e) => e.kind !== 'item'));
  }

  // 3. 装備ドロップ（短文でも同じ確率・同じレアリティ抽選）
  let drops = POST.dropBase;
  for (let k = 0; k < POST.dropBonusMax && chance(rng, POST.dropBonusChance); k++) drops++;
  for (let k = 0; k < drops; k++) {
    const item = generateItem(rng, ctx(), nextId(state, 'i'), now, 'diary');
    item.diaryId = entry.id;
    const evs: LogEvent[] = [];
    acquireItem(state, item, evs, now);
    events.push(...showAll(evs));
  }

  // 4. ひらめき：一定時間、探索の経験値と宝箱が増える
  const nowMs = nowDate.getTime();
  const curUntil = state.idle.inspirationUntil ? new Date(state.idle.inspirationUntil).getTime() : 0;
  const until = Math.min(Math.max(curUntil, nowMs) + POST.inspirationSeconds * 1000, nowMs + POST.inspirationMaxSeconds * 1000);
  state.idle.inspirationUntil = new Date(until).toISOString();
  const left = Math.round((until - nowMs) / 60000);
  events.push({ level: 'normal', kind: 'inspiration', text: `ひらめき！ 探索ボーナス 残り${left >= 60 ? `${Math.floor(left / 60)}時間${left % 60}分` : `${left}分`}` });

  // 5. 即時探索（投稿した内容の傾向が反映される）
  state.diaries.push(entry);
  const seconds = isDream ? DREAM.instantExploreSeconds : POST.instantExploreSeconds;
  const st = emptyStats(state.character.bestFloor);
  const levelFrom = state.character.level;
  const bestFrom = state.character.bestFloor;
  advanceExploration(state, seconds, nowMs, rng, nowDate, st, { left: Infinity });
  const exploreExp = applyExp(state, st);
  const report = makeReport(state, st, now, now, seconds, seconds, levelFrom, bestFrom, exploreExp, 'post');
  const summary = `探索が進んだ：${st.floors}階層突破・${st.kills}体撃破${st.itemIds.length ? `・装備${st.itemIds.length}個` : ''}`;
  events.push({ level: 'normal', kind: 'explore', text: summary });
  events.push(...pickHighlights(st.events.filter((e) => e.kind !== 'start'), 12));
  if (state.character.bestFloor > bestFrom && !st.events.some((e) => e.kind === 'record')) {
    events.push({ level: 'important', kind: 'record', text: `到達階層を更新中！ ${bestFrom}階 → ${state.character.bestFloor}階` });
  }
  entry.expGained += exploreExp;
  entry.events = events.slice(0, 40);
  return { state, entry, events, report };
}

/** 投稿の色ラベルを設定（undefined で解除） */
export function setPostColor(prev: GameState, id: string, color: PostColor | undefined): GameState {
  const state: GameState = { ...prev, diaries: prev.diaries.map((d) => (d.id === id ? { ...d, color } : d)) };
  return state;
}

/** 投稿本文の編集（報酬は再付与しない。分類のみ更新） */
export function editDiary(prev: GameState, id: string, text: string, now = new Date()): GameState {
  const state: GameState = structuredClone(prev);
  const d = state.diaries.find((x) => x.id === id);
  if (!d) return prev;
  d.text = text;
  d.chars = countChars(text);
  d.analysis = safeAnalyze(text);
  d.updatedAt = now.toISOString();
  return state;
}
