import { COMBAT, type DungeonDef } from './config';
import { chance, int, pick, range, type Rng } from './rng';
import type { Build } from './stats';
import type { LogEvent } from './types';

export interface Enemy {
  name: string;
  sprite: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  boss: boolean;
}

export interface DungeonResult {
  floorReached: number; // 力尽きた（終了した）階層
  floorsCleared: number;
  kills: number;
  bossFloors: number[];
  maxChain: number;
  triggers: { extra: number; chain: number; echo: number; crit: number; phoenix: number; dodge: number };
  endReason: 'defeat' | 'stalemate' | 'cap';
  lastEnemy?: { name: string; sprite: string; boss: boolean };
  events: LogEvent[];
  exp: number;
}

export function spawnFloor(floor: number, d: DungeonDef, rng: Rng): Enemy[] {
  const g = Math.pow(COMBAT.enemyGrowth, floor - 1);
  const b = COMBAT.enemyBase;
  if (floor % COMBAT.bossEvery === 0) {
    const t = pick(rng, d.boss);
    const hp = b.hp * g * d.mods.hp * COMBAT.boss.hp;
    return [{ name: t.name, sprite: t.sprite, hp, maxHp: hp, atk: b.atk * g * d.mods.atk * COMBAT.boss.atk, def: b.def * g * d.mods.def * COMBAT.boss.def, boss: true }];
  }
  const n = 2 + int(rng, 0, 2);
  return Array.from({ length: n }, () => {
    const t = pick(rng, d.enemies);
    const v = range(rng, 0.85, 1.15);
    const hp = b.hp * g * d.mods.hp * v * 0.6;
    return { name: t.name, sprite: t.sprite, hp, maxHp: hp, atk: b.atk * g * d.mods.atk * v * 0.45, def: b.def * g * d.mods.def, boss: false };
  });
}

export interface SimOptions {
  prevBest: number;
  /** false ならログを作らない（装備評価用の高速モード） */
  log: boolean;
}

/** ダンジョンを自動攻略する。乱数以外の外部状態に依存しないので再現可能 */
export function simulateDungeon(build: Build, d: DungeonDef, rng: Rng, opts: SimOptions): DungeonResult {
  const events: LogEvent[] = [];
  const push = (level: LogEvent['level'], kind: string, text: string, floor?: number) => {
    if (opts.log) events.push({ level, kind, text, floor });
  };
  const trig = { extra: 0, chain: 0, echo: 0, crit: 0, phoenix: 0, dodge: 0 };
  const firstSeen = new Set<string>();
  let hp = build.hp;
  let killStacks = 0;
  let streak = 0;
  let kills = 0;
  let maxChain = 0;
  let phoenixReady = build.phoenix > 0;
  const bossFloors: number[] = [];
  let floor = 1;
  let endReason: DungeonResult['endReason'] = 'cap';
  let enemies: Enemy[] = [];
  let lastEnemy: DungeonResult['lastEnemy'];

  push('normal', 'start', `${d.name}に足を踏み入れた`);

  const first = (key: string, level: LogEvent['level'], text: string) => {
    if (firstSeen.has(key)) return;
    firstSeen.add(key);
    push(level, key, text, floor);
  };

  const hit = (target: Enemy, kind: 'main' | 'extra' | 'chain', depth: number) => {
    const atkMul = 1 + build.onKillAtk * Math.min(killStacks, COMBAT.onKillCap) + build.momentum * Math.min(streak, COMBAT.momentumCap);
    const atk = build.atk * atkMul;
    const isCrit = chance(rng, build.crit);
    if (isCrit) trig.crit++;
    let dmg = ((atk * atk) / (atk + target.def)) * range(rng, 0.9, 1.1) * (isCrit ? build.critMul : 1);
    if (target.boss) dmg *= 1 + build.bossDmg;
    target.hp -= dmg;
    if (build.lifesteal > 0) hp = Math.min(build.hp, hp + dmg * build.lifesteal);
    if (target.hp > 0) return;

    enemies = enemies.filter((e) => e !== target);
    kills++;
    const triggers = kind === 'main' || build.echo;
    if (!triggers) return;
    if (kind !== 'main') {
      trig.echo++;
      first('echo', 'important', `第${floor}階層：残響！ ${kind === 'chain' ? '連鎖' : '追加'}攻撃の撃破で撃破時効果が発動`);
    }
    killStacks++;
    streak++;
    if (build.chainChance > 0 && depth < build.chainLimit && enemies.length && chance(rng, build.chainChance)) {
      trig.chain++;
      const next = enemies[0];
      if (depth + 1 > maxChain) {
        maxChain = depth + 1;
        if (maxChain === 1) first('chain', 'important', `第${floor}階層：${next.name}へ連鎖攻撃！`);
        else if (maxChain >= 3) push('epic', 'chain', `第${floor}階層：連鎖が止まらない！ ${maxChain}連鎖！`, floor);
      }
      hit(next, 'chain', depth + 1);
    }
  };

  outer: while (floor <= COMBAT.maxFloor) {
    enemies = spawnFloor(floor, d, rng);
    const bossFloor = enemies[0].boss;
    const bossName = enemies[0].name;
    let turns = 0;
    while (enemies.length) {
      if (++turns > COMBAT.turnLimitPerFloor) {
        endReason = 'stalemate';
        lastEnemy = { name: enemies[0].name, sprite: enemies[0].sprite, boss: enemies[0].boss };
        push('normal', 'end', `第${floor}階層：決着がつかず撤退した`, floor);
        break outer;
      }
      hit(enemies[0], 'main', 0);
      if (enemies.length && chance(rng, build.extraAttack)) {
        trig.extra++;
        first('extra', 'important', `第${floor}階層：追加攻撃が発動！`);
        hit(enemies[0], 'extra', 0);
      }
      for (const e of enemies) {
        if (chance(rng, build.dodge)) {
          trig.dodge++;
          continue;
        }
        const dmg = ((e.atk * e.atk) / (e.atk + build.def)) * range(rng, 0.9, 1.1);
        hp -= dmg;
        streak = 0;
        if (hp <= 0) {
          if (phoenixReady) {
            phoenixReady = false;
            trig.phoenix++;
            hp = build.hp * build.phoenix;
            push('epic', 'phoenix', `第${floor}階層：力尽きた…が、装備の力で蘇った！`, floor);
          } else {
            endReason = 'defeat';
            lastEnemy = { name: e.name, sprite: e.sprite, boss: e.boss };
            push('normal', 'end', `第${floor}階層：${e.name}に敗れ、攻略終了`, floor);
            break outer;
          }
        }
      }
    }
    // 階層突破
    if (bossFloor) {
      bossFloors.push(floor);
      if (floor > opts.prevBest) push('epic', 'boss', `第${floor}階層：これまで越えられなかった${bossName}を撃破！`, floor);
      else push('detail', 'boss', `第${floor}階層：${bossName}を撃破`, floor);
    } else if (floor % 5 === 0) {
      push('detail', 'floor', `第${floor}階層を突破（HP ${Math.max(0, Math.round((hp / build.hp) * 100))}%）`, floor);
    }
    hp = Math.min(build.hp, hp + build.hp * build.floorHeal);
    floor++;
  }

  const floorsCleared = floor - 1;
  if (opts.log) {
    const parts: string[] = [];
    if (trig.extra) parts.push(`追加攻撃 ${trig.extra}回`);
    if (trig.chain) parts.push(`連鎖 ${trig.chain}回`);
    if (trig.echo) parts.push(`残響 ${trig.echo}回`);
    if (trig.crit) parts.push(`会心 ${trig.crit}回`);
    if (trig.dodge) parts.push(`回避 ${trig.dodge}回`);
    if (parts.length) push('detail', 'summary', `発動回数：${parts.join(' / ')}`);
  }
  return {
    floorReached: Math.min(floor, COMBAT.maxFloor),
    floorsCleared,
    kills,
    bossFloors,
    maxChain,
    triggers: trig,
    endReason,
    lastEnemy,
    events,
    exp: Math.round((floorsCleared + bossFloors.length * 5) * (1 + build.expPct)),
  };
}
