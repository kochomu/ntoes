// 差し替え可能な乱数生成器。テストではシード固定・固定値列を注入できる。
export interface Rng {
  /** [0, 1) の一様乱数 */
  next(): number;
}

export interface SerialRng extends Rng {
  /** 現在の内部状態（保存して createRng に渡せば続きから再開できる） */
  state(): number;
}

/** mulberry32: 軽量で再現性のあるシード付き乱数 */
export function createRng(seed: number): SerialRng {
  let a = seed >>> 0;
  return {
    state: () => a,
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** 固定値を順番に返す（テスト用） */
export function sequenceRng(values: number[]): Rng {
  let i = 0;
  return { next: () => values[i++ % values.length] };
}

export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

export const chance = (rng: Rng, p: number) => rng.next() < p;
export const range = (rng: Rng, min: number, max: number) => min + (max - min) * rng.next();
export const int = (rng: Rng, min: number, max: number) => Math.floor(range(rng, min, max + 1));
export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng.next() * arr.length)];

export function weighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return entries[0][0];
  let r = rng.next() * total;
  for (const [v, w] of entries) {
    r -= Math.max(0, w);
    if (r < 0) return v;
  }
  return entries[entries.length - 1][0];
}
