// ダンジョン探索のコア。1階層ずつ進める関数（playFloor）を中心に、
// 中断・再開できる探索状態（Expedition）を扱う。乱数以外の外部状態に依存しない。
import { COMBAT, FLOOR_EVENTS, type DungeonDef } from './config';
import { chance, int, pick, range, weighted, type Rng } from './rng';
import type { Build } from './stats';
import type { Expedition, FloorEvent, LogEvent } from './types';

export interface Enemy {
  name: string;
  sprite: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  boss: boolean;
  elite?: boolean;
}

export type DropSource = 'battle' | 'elite' | 'chest' | 'boss';

export interface FloorOutcome {
  floor: number;
  event: FloorEvent;
  cleared: boolean;
  /** この階層で得たドロップ抽選の権利 */
  drops: DropSource[];
  kills: number;
  maxChainThisFloor: number;
  events: LogEvent[];
}

const baseStats = (floor: number, d: DungeonDef) => {
  const g = Math.pow(COMBAT.enemyGrowth, floor - 1);
  const b = COMBAT.enemyBase;
  return { hp: b.hp * g * d.mods.hp, atk: b.atk * g * d.mods.atk, def: b.def * g * d.mods.def };
};

export function rollFloorEvent(floor: number, d: DungeonDef, rng: Rng): FloorEvent {
  if (floor % COMBAT.bossEvery === 0) return 'boss';
  if (floor === 1) return 'battle';
  const w = FLOOR_EVENTS.weights;
  const bias = d.eventBias ?? {};
  return weighted(rng, (Object.keys(w) as (keyof typeof w)[]).map((k) => [k, w[k] * (bias[k] ?? 1)] as const));
}

export function spawnEnemies(floor: number, event: FloorEvent, d: DungeonDef, rng: Rng): Enemy[] {
  const s = baseStats(floor, d);
  if (event === 'boss') {
    const t = pick(rng, d.boss);
    const hp = s.hp * COMBAT.boss.hp;
    return [{ name: t.name, sprite: t.sprite, hp, maxHp: hp, atk: s.atk * COMBAT.boss.atk, def: s.def * COMBAT.boss.def, boss: true }];
  }
  if (event === 'elite') {
    const t = pick(rng, d.enemies);
    const e = FLOOR_EVENTS.elite;
    const hp = s.hp * e.hp;
    return [{ name: `強敵・${t.name}`, sprite: t.sprite, hp, maxHp: hp, atk: s.atk * e.atk, def: s.def * e.def, boss: false, elite: true }];
  }
  const n = 2 + int(rng, 0, 2);
  return Array.from({ length: n }, () => {
    const t = pick(rng, d.enemies);
    const v = range(rng, 0.85, 1.15);
    const hp = s.hp * v * 0.6;
    return { name: t.name, sprite: t.sprite, hp, maxHp: hp, atk: s.atk * v * 0.45, def: s.def, boss: false };
  });
}

export function startExpedition(id: string, build: Build, dungeonId: string, prevBest: number, startedAt: string): Expedition {
  return {
    id, dungeonId, startedAt, floor: 1, hp: build.hp, killStacks: 0, streak: 0,
    phoenixReady: build.phoenix > 0, kills: 0, bossFloors: [], maxChain: 0, prevBest, events: [], itemIds: [],
  };
}

/**
 * 1階層分を進める（ex を直接更新する）。
 */
export function playFloor(ex: Expedition, build: Build, d: DungeonDef, rng: Rng, log = true): FloorOutcome {
  const floor = ex.floor;
  const events: LogEvent[] = [];
  const push = (level: LogEvent['level'], kind: string, text: string) => {
    if (log) events.push({ level, kind, text, floor });
  };
  const out: FloorOutcome = { floor, event: 'battle', cleared: false, drops: [], kills: 0, maxChainThisFloor: 0, events };
  if (ex.ended) return out;
  if (floor > COMBAT.maxFloor) {
    ex.ended = 'cap';
    return out;
  }
  ex.hp = Math.min(ex.hp, build.hp); // 装備変更で最大HPが減った場合

  const event = rollFloorEvent(floor, d, rng);
  out.event = event;
  ex.lastEvent = event;

  if (event === 'chest') {
    out.drops.push('chest');
    push('detail', 'chest', `第${floor}階層：宝箱を見つけた`);
  } else if (event === 'rest') {
    const before = ex.hp;
    ex.hp = Math.min(build.hp, ex.hp + build.hp * FLOOR_EVENTS.restHeal);
    push('detail', 'rest', `第${floor}階層：休息ポイントでひと休み（HP +${Math.round(ex.hp - before)}）`);
  } else {
    let enemies = spawnEnemies(floor, event, d, rng);
    const bossName = enemies[0].name;
    ex.lastEnemy = { name: enemies[0].name, sprite: enemies[0].sprite, boss: enemies[0].boss };

    const hit = (target: Enemy, kind: 'main' | 'extra' | 'chain', depth: number) => {
      const atkMul = 1 + build.onKillAtk * Math.min(ex.killStacks, COMBAT.onKillCap) + build.momentum * Math.min(ex.streak, COMBAT.momentumCap);
      const atk = build.atk * atkMul;
      const isCrit = chance(rng, build.crit);
      let dmg = ((atk * atk) / (atk + target.def)) * range(rng, 0.9, 1.1) * (isCrit ? build.critMul : 1);
      if (target.boss) dmg *= 1 + build.bossDmg;
      target.hp -= dmg;
      if (build.lifesteal > 0) ex.hp = Math.min(build.hp, ex.hp + dmg * build.lifesteal);
      if (target.hp > 0) return;

      enemies = enemies.filter((e) => e !== target);
      ex.kills++;
      out.kills++;
      const triggers = kind === 'main' || build.echo;
      if (!triggers) return;
      ex.killStacks++;
      ex.streak++;
      if (build.chainChance > 0 && depth < build.chainLimit && enemies.length && chance(rng, build.chainChance)) {
        const chainDepth = depth + 1;
        out.maxChainThisFloor = Math.max(out.maxChainThisFloor, chainDepth);
        if (chainDepth > ex.maxChain) {
          ex.maxChain = chainDepth;
          if (chainDepth >= 3) push('epic', 'chain', `第${floor}階層：特殊効果が連鎖！ ${chainDepth}連鎖！`);
        }
        hit(enemies[0], 'chain', chainDepth);
      }
    };

    let turns = 0;
    while (enemies.length) {
      if (++turns > COMBAT.turnLimitPerFloor) {
        ex.ended = 'stalemate';
        push('normal', 'end', `第${floor}階層：${enemies[0].name}と決着がつかず撤退`);
        return out;
      }
      hit(enemies[0], 'main', 0);
      if (enemies.length && chance(rng, build.extraAttack)) hit(enemies[0], 'extra', 0);
      for (const e of enemies) {
        if (chance(rng, build.dodge)) continue;
        ex.hp -= ((e.atk * e.atk) / (e.atk + build.def)) * range(rng, 0.9, 1.1);
        ex.streak = 0;
        if (ex.hp <= 0) {
          if (ex.phoenixReady) {
            ex.phoenixReady = false;
            ex.hp = build.hp * build.phoenix;
            push('epic', 'phoenix', `第${floor}階層：力尽きた…が、装備の力で蘇った！`);
          } else {
            ex.ended = 'defeat';
            ex.lastEnemy = { name: e.name, sprite: e.sprite, boss: e.boss };
            push('normal', 'end', `第${floor}階層：${e.name}に敗れ、帰還した`);
            return out;
          }
        }
      }
    }

    if (event === 'boss') {
      ex.bossFloors.push(floor);
      if (chance(rng, FLOOR_EVENTS.drop.boss)) out.drops.push('boss');
      if (floor > ex.prevBest) push('epic', 'boss', `第${floor}階層：これまで越えられなかった${bossName}を撃破！`);
      else push('important', 'boss', `第${floor}階層：${bossName}を撃破`);
    } else if (event === 'elite') {
      if (chance(rng, FLOOR_EVENTS.drop.elite)) out.drops.push('elite');
      push('normal', 'elite', `第${floor}階層：${bossName}を倒した`);
    } else if (chance(rng, FLOOR_EVENTS.drop.battle)) {
      out.drops.push('battle');
    }
  }

  // 階層突破
  out.cleared = true;
  ex.hp = Math.min(build.hp, ex.hp + build.hp * build.floorHeal);
  ex.floor++;
  return out;
}

// ---------- 一括シミュレーション（装備評価・テスト用） ----------
export interface DungeonResult {
  floorReached: number; // 突破した階層数
  kills: number;
  bossFloors: number[];
  maxChain: number;
  endReason: Expedition['ended'];
  events: LogEvent[];
}

export function simulateDungeon(build: Build, d: DungeonDef, rng: Rng, opts: { prevBest: number; log: boolean }): DungeonResult {
  const ex = startExpedition('sim', build, d.id, opts.prevBest, '');
  const events: LogEvent[] = [];
  while (!ex.ended) {
    const o = playFloor(ex, build, d, rng, opts.log);
    if (opts.log) events.push(...o.events);
  }
  return { floorReached: ex.floor - 1, kills: ex.kills, bossFloors: ex.bossFloors, maxChain: ex.maxChain, endReason: ex.ended, events };
}
