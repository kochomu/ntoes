import {
  AFFIXES, AFFIX_BY_KIND, ITEM_BASES, RARITY_INFO, RARITY_WEIGHTS, SLOT_BASE, SPECIALS,
  SPECIAL_BY_KIND, TAG_INFO, THEME_PROFILES, DROPS, type ItemBaseDef,
} from './config';
import { chance, pick, range, weighted, type Rng } from './rng';
import type { Affix, AffixKind, Item, Rarity, Special, SynergyTag, Theme } from './types';
import { RARITIES } from './types';

export interface ItemContext {
  ilvl: number;
  /** テーマと重み（日記分析＋ダンジョンなど） */
  themes: { type: Theme; weight: number }[];
  /** 装備中の themeLuck 合計（テーマごと） */
  themeLuck?: Partial<Record<Theme, number>>;
  /** レアリティ抽選の補正（ボスドロップなど） */
  rarityBoost?: number;
}

export function rollRarity(rng: Rng, boost = 0): Rarity {
  const entries = RARITIES.map((r, i) => [r, RARITY_WEIGHTS[r] * (i === 0 ? 1 : 1 + boost)] as const);
  return weighted(rng, entries);
}

/** テーマ重み（themeLuck込み）から1つ選ぶ。テーマが無ければ undefined */
function rollTheme(rng: Rng, ctx: ItemContext): Theme | undefined {
  if (!ctx.themes.length) return undefined;
  const entries = ctx.themes.map((t) => [t.type, t.weight * (1 + (ctx.themeLuck?.[t.type] ?? 0))] as const);
  return weighted(rng, entries);
}

function rollAffix(rng: Rng, ilvl: number, kind: AffixKind, mul: number): Affix {
  const def = AFFIX_BY_KIND[kind];
  const [lo, hi] = def.roll(ilvl);
  const raw = range(rng, lo, hi) * mul;
  const value = def.kind === 'atk' || def.kind === 'def' || def.kind === 'hp' ? Math.round(raw) : Math.round(raw * 1000) / 1000;
  return { kind, value };
}

export function generateItem(rng: Rng, ctx: ItemContext, id: string, acquiredAt: string, source: Item['source'] = 'diary'): Item {
  const theme = chance(rng, DROPS.themeInfluence) ? rollTheme(rng, ctx) : undefined;
  const profile = theme ? THEME_PROFILES[theme] : undefined;
  const rarity = rollRarity(rng, ctx.rarityBoost);
  const info = RARITY_INFO[rarity];

  // ベース選択：テーマ一致を優遇
  const base: ItemBaseDef = weighted(
    rng,
    ITEM_BASES.map((b) => [b, theme && b.themes.includes(theme) ? 5 : 1] as const),
  );

  // 基礎能力
  const variance = range(rng, 0.85, 1.15);
  const baseStats = Object.fromEntries(
    Object.entries(SLOT_BASE[base.slot](ctx.ilvl)).map(([k, v]) => [k, k === 'crit' ? v : Math.round((v as number) * info.mul * variance)]),
  );

  // 追加効果：テーマ指定の効果を優遇、重複不可
  const affixes: Affix[] = [];
  const used = new Set<AffixKind>();
  for (let i = 0; i < info.affixes; i++) {
    const kind = weighted(
      rng,
      AFFIXES.filter((a) => !used.has(a.kind)).map((a) => [a.kind, a.weight * (profile?.affixes.includes(a.kind) ? 4 : 1)] as const),
    );
    used.add(kind);
    affixes.push(rollAffix(rng, ctx.ilvl, kind, info.mul));
  }

  // シナジータグ：ベース由来＋テーマ由来（低確率で完全ランダム）
  const tags = new Set<SynergyTag>(base.tags.slice(0, 1));
  if (profile && chance(rng, 0.6)) tags.add(pick(rng, profile.tags));
  else if (chance(rng, 0.25)) tags.add(pick(rng, Object.keys(TAG_INFO) as SynergyTag[]));

  // 特殊効果（神引き）
  let special: Special | undefined;
  if (chance(rng, info.specialChance)) {
    const kind = weighted(rng, SPECIALS.map((s) => [s.kind, s.weight * (profile?.specials.includes(s.kind) ? 3 : 1)] as const));
    const [lo, hi] = SPECIAL_BY_KIND[kind].roll();
    special = { kind, value: Math.round(range(rng, lo, hi) * 1000) / 1000 };
    if (kind === 'resonance') special.tag = pick(rng, [...tags]);
  }

  const themes: Theme[] = theme ? [theme] : [];
  const name = generateName(rng, base, affixes, special, theme);

  return {
    id, name, slot: base.slot, baseKey: base.key, rarity, ilvl: ctx.ilvl,
    base: baseStats, affixes, special, themes, tags: [...tags], acquiredAt, source,
  };
}

/** 名前は能力・テーマと部分的に連動させつつ、ランダムな語も混ぜる */
export function generateName(rng: Rng, base: ItemBaseDef, affixes: Affix[], special: Special | undefined, theme?: Theme): string {
  if (special) {
    const ep = pick(rng, SPECIAL_BY_KIND[special.kind].epithets);
    return `${ep}${base.name}`;
  }
  const lead = affixes.length && chance(rng, 0.8) ? pick(rng, AFFIX_BY_KIND[affixes[0].kind].words) : pick(rng, AFFIXES).words[0];
  const mid = theme && chance(rng, 0.75) ? pick(rng, THEME_PROFILES[theme].words) : chance(rng, 0.4) ? pick(rng, THEME_PROFILES[pick(rng, Object.keys(THEME_PROFILES) as Theme[])].words) : '';
  return `${lead}${mid}${base.name}`;
}

export function describeAffix(a: Affix): string {
  return AFFIX_BY_KIND[a.kind].fmt(a.value);
}
export function describeSpecial(s: Special): string {
  return SPECIAL_BY_KIND[s.kind].desc(s.value, s.tag);
}
