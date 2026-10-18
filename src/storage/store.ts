// 端末内保存（localStorage）。投稿は外部に送信しない。
import { createInitialState } from '../game/engine';
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
  return {
    ...base,
    ...s,
    character: { ...base.character, ...s.character, equipped: { ...base.character.equipped, ...s.character.equipped } },
    // v0.2 で追加：放置進行。旧データは「今」から放置カウントを開始する（過去分を遡って付与しない）
    idle: { ...base.idle, ...(s.idle ?? {}) },
    reports: s.reports ?? [],
    colorLabels: { ...base.colorLabels, ...(s.colorLabels ?? {}) },
  };
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
