// 端末内保存（localStorage）。投稿は外部に送信しない。
import { createInitialState } from '../game/engine';
import { RARITY_INFO, SLOT_BASE, itemScaleFor } from '../game/config';
import type { GameState } from '../game/types';

const KEY = 'diary-rpg:state:v1';
const BACKUP_KEY = 'diary-rpg:state:v1:prev';

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createInitialState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('load failed', e);
    // 壊れていた場合は直前のバックアップを試す
    try {
      const prev = localStorage.getItem(BACKUP_KEY);
      if (prev) return migrate(JSON.parse(prev));
    } catch {
      /* noop */
    }
    return createInitialState();
  }
}

export function saveState(state: GameState): boolean {
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) localStorage.setItem(BACKUP_KEY, cur);
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('save failed', e);
    return false;
  }
}

/** 将来スキーマを変えたときはここで変換する */
export function migrate(data: unknown): GameState {
  const s = data as GameState;
  if (!s || s.version !== 1 || !s.character || !Array.isArray(s.diaries)) throw new Error('invalid save data');
  const base = createInitialState();
  const items = structuredClone(s.items ?? {});
  if (s.balanceVersion !== 2) {
    const bestFloor = Number.isFinite(s.character.bestFloor) ? s.character.bestFloor : 0;
    migrateLegacyItemBalance(items, bestFloor);
  }
  return {
    ...base,
    ...s,
    balanceVersion: 2,
    items,
    character: { ...base.character, ...s.character, equipped: { ...base.character.equipped, ...s.character.equipped } },
    // v0.2 で追加：放置進行。旧データは「今」から放置カウントを開始する（過去分を遡って付与しない）
    idle: { ...base.idle, ...(s.idle ?? {}) },
    reports: s.reports ?? [],
    colorLabels: { ...base.colorLabels, ...(s.colorLabels ?? {}) },
  };
}

/** 旧1.06^floor装備を新しい線形成長へ一度だけ縮尺変換する */
function migrateLegacyItemBalance(items: GameState['items'], bestFloor: number) {
  const oldRarityMul = { normal: 1, magic: 1.35, rare: 1.8, legendary: 2.5, mythic: 3.4 };
  const flatAffixes = new Set(['atk', 'def', 'hp']);
  for (const item of Object.values(items)) {
    // 投稿・夢由来の装備は階層倍率がないため、旧バランス移行の対象外。
    if (item.floor === undefined && (item.source === 'diary' || item.source === 'dream')) continue;
    const oldMul = oldRarityMul[item.rarity];
    const nominalBase = SLOT_BASE[item.slot](item.ilvl);
    const observedScale = Object.entries(nominalBase)
      .filter(([stat]) => stat !== 'crit')
      .map(([stat, nominal]) => {
        const observed = item.base[stat as keyof typeof item.base];
        return typeof observed === 'number' && nominal ? observed / (nominal * oldMul) : 0;
      })
      .find((scale) => Number.isFinite(scale) && scale > 0);
    const floorFromScale = observedScale && observedScale > 1.1
      ? 40 + Math.round(Math.log(observedScale) / Math.log(1.06))
      : 0;
    const fallbackFloor = Math.max(0, Math.min(bestFloor, (item.ilvl - 1) * 3));
    const floor = item.floor ?? Math.max(0, Math.min(bestFloor, floorFromScale || fallbackFloor));
    const oldScale = Math.pow(1.06, Math.max(0, floor - 40));
    const scaleRatio = itemScaleFor(floor) / oldScale;
    const rarityRatio = RARITY_INFO[item.rarity].mul / oldMul;
    for (const [stat, value] of Object.entries(item.base)) {
      if (stat !== 'crit' && typeof value === 'number') item.base[stat as keyof typeof item.base] = Math.round(value * scaleRatio * rarityRatio);
    }
    for (const affix of item.affixes) {
      const ratio = flatAffixes.has(affix.kind) ? scaleRatio * rarityRatio : rarityRatio;
      affix.value = Math.round(affix.value * ratio * 1000) / 1000;
    }
  }
}

export function exportJson(state: GameState): string {
  return JSON.stringify({ app: 'diary-rpg', exportedAt: new Date().toISOString(), state }, null, 1);
}

export function importJson(text: string): GameState {
  const obj = JSON.parse(text);
  return migrate(obj.state ?? obj);
}

/** iOS でストレージが勝手に消されにくくする（ホーム画面追加時に有効） */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* noop */
  }
}
