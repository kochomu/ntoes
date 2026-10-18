import { COMBAT, LEVEL_STATS, TAG_INFO } from './config';
import type { Item, SynergyTag, Theme } from './types';

export interface Build {
  atk: number;
  def: number;
  hp: number;
  crit: number;
  critMul: number;
  extraAttack: number;
  chainChance: number;
  chainLimit: number;
  echo: boolean;
  onKillAtk: number;
  momentum: number;
  floorHeal: number;
  lifesteal: number;
  expPct: number;
  dodge: number;
  bossDmg: number;
  phoenix: number; // 復活時HP割合。0なら無し
  lucid: number; // 会心後の追撃率（夢）
  dejavu: number; // 探索ドロップ率ボーナス（夢）
  dreamWalk: number; // 探索開始地点の深さボーナス（夢）
  dreamEater: number; // ボス撃破時の攻撃力上昇（夢）
  themeLuck: Partial<Record<Theme, number>>;
  synergies: { tag: SynergyTag; count: number; desc: string[] }[];
}

/** レベル・装備・再挑戦スタックから最終ステータスを算出する（UIとは独立） */
export function computeBuild(level: number, items: Item[], retryStacks = 0): Build {
  let atk = LEVEL_STATS.atk(level);
  let def = LEVEL_STATS.def(level);
  let hp = LEVEL_STATS.hp(level);
  let crit = LEVEL_STATS.crit;
  let critMul = LEVEL_STATS.critMul;
  let atkPct = 0, hpPct = 0, extraAttack = 0, chainChance = 0, chainLimit = COMBAT.chainLimit;
  let onKillAtk = 0, momentum = 0, floorHeal = COMBAT.floorHealBase, lifesteal = 0, expPct = 0;
  let dodge = 0, bossDmg = 0, phoenix = 0, retryBoost = 0, echo = false;
  let lucid = 0, dejavu = 0, dreamWalk = 0, dreamEater = 0;
  const themeLuck: Partial<Record<Theme, number>> = {};
  const tagCount: Partial<Record<SynergyTag, number>> = {};
  const resonances: { tag: SynergyTag; value: number }[] = [];

  for (const it of items) {
    atk += it.base.atk ?? 0;
    def += it.base.def ?? 0;
    hp += it.base.hp ?? 0;
    crit += it.base.crit ?? 0;
    for (const t of it.tags) tagCount[t] = (tagCount[t] ?? 0) + 1;
    for (const a of it.affixes) {
      switch (a.kind) {
        case 'atk': atk += a.value; break;
        case 'def': def += a.value; break;
        case 'hp': hp += a.value; break;
        case 'atkPct': atkPct += a.value; break;
        case 'hpPct': hpPct += a.value; break;
        case 'crit': crit += a.value; break;
        case 'extraAttack': extraAttack += a.value; break;
        case 'onKillAtk': onKillAtk += a.value; break;
        case 'floorHeal': floorHeal += a.value; break;
        case 'lifesteal': lifesteal += a.value; break;
        case 'expPct': expPct += a.value; break;
        case 'retryBoost': retryBoost += a.value; break;
        case 'dodge': dodge += a.value; break;
        case 'bossDmg': bossDmg += a.value; break;
        case 'themeLuck': for (const th of it.themes) themeLuck[th] = (themeLuck[th] ?? 0) + a.value; break;
      }
    }
    const s = it.special;
    if (s) {
      switch (s.kind) {
        case 'chainStrike': chainChance += s.value; break;
        case 'echo': echo = true; break;
        case 'momentum': momentum += s.value; break;
        case 'floorRegen': floorHeal += s.value; break;
        case 'expAmp': expPct += s.value; break;
        case 'phoenix': phoenix = Math.max(phoenix, s.value); break;
        case 'doubleStrike': extraAttack += s.value; break;
        case 'giantSlayer': bossDmg += s.value; break;
        case 'lucid': lucid += s.value; break;
        case 'dejavu': dejavu += s.value; break;
        case 'dreamWalk': dreamWalk += s.value; break;
        case 'dreamEater': dreamEater += s.value; break;
        case 'resonance':
          if (s.tag) {
            tagCount[s.tag] = (tagCount[s.tag] ?? 0) + 1;
            resonances.push({ tag: s.tag, value: s.value });
          }
          break;
      }
    }
  }

  for (const r of resonances) {
    const n = items.filter((i) => i.tags.includes(r.tag)).length;
    atkPct += r.value * n;
  }

  const synergies: Build['synergies'] = [];
  for (const [tag, count] of Object.entries(tagCount) as [SynergyTag, number][]) {
    const desc: string[] = [];
    for (const [need, b, text] of TAG_INFO[tag].tiers) {
      if (count < need) continue;
      desc.push(text);
      extraAttack += b.extraAttack ?? 0;
      crit += b.crit ?? 0;
      critMul += b.critMul ?? 0;
      chainLimit += b.chainLimit ?? 0;
      chainChance += b.chainChance ?? 0;
      expPct += b.expPct ?? 0;
      atkPct += b.atkPct ?? 0;
      hpPct += b.hpPct ?? 0;
      dodge += b.dodge ?? 0;
      lifesteal += b.lifesteal ?? 0;
      momentum += b.momentum ?? 0;
      floorHeal += b.floorHeal ?? 0;
      if (b.phoenix) phoenix = Math.max(phoenix, b.phoenix);
      onKillAtk += b.onKillAtk ?? 0;
      bossDmg += b.bossDmg ?? 0;
    }
    if (desc.length) synergies.push({ tag, count, desc });
  }

  const retryMul = 1 + retryBoost * Math.min(retryStacks, COMBAT.retryStackMax);
  return {
    atk: atk * (1 + atkPct) * retryMul,
    def: def * retryMul,
    hp: Math.round(hp * (1 + hpPct) * retryMul),
    crit: Math.min(crit, 0.75),
    critMul,
    extraAttack: Math.min(extraAttack, 0.9),
    chainChance: Math.min(chainChance, 0.9),
    chainLimit,
    echo,
    onKillAtk,
    momentum,
    floorHeal: Math.min(floorHeal, 1),
    lifesteal: Math.min(lifesteal, 0.5),
    expPct,
    dodge: Math.min(dodge, 0.5),
    bossDmg,
    phoenix,
    lucid: Math.min(lucid, 1),
    dejavu,
    dreamWalk: Math.min(dreamWalk, 0.6),
    dreamEater,
    themeLuck,
    synergies,
  };
}

/** 表示用の簡易戦闘力（評価には使わず、目安表示のみ） */
export function powerRating(b: Build): number {
  const offense = b.atk * (1 + b.crit * (b.critMul - 1)) * (1 + b.extraAttack) * (1 + b.chainChance * 0.5) * (1 + b.momentum * 5 + b.onKillAtk * 20);
  const defense = (b.hp + b.def * 8) * (1 / (1 - b.dodge)) * (1 + b.lifesteal * 2 + b.floorHeal * 2) * (1 + b.phoenix * 0.5);
  return Math.round(Math.sqrt(offense * defense));
}
