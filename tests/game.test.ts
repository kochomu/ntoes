import { describe, expect, it } from 'vitest';
import { analyzeDiary } from '../src/game/analyzer';
import { ITEM_BASES } from '../src/game/config';
import { playFloor, simulateDungeon, startExpedition } from '../src/game/dungeon';
import { checkpointFloor, createInitialState, editDiary, expForChars, setPostColor, settleIdle, submitPost, tryAutoEquip } from '../src/game/engine';
import { npcLine } from '../src/game/npc';
import { heroSprite } from '../src/ui/heroSprite';
import { IDLE, POST } from '../src/game/config';
import { migrate } from '../src/storage/store';
import { generateItem } from '../src/game/items';
import { createRng, sequenceRng } from '../src/game/rng';
import { computeBuild } from '../src/game/stats';
import { DUNGEONS } from '../src/game/config';
import type { Item } from '../src/game/types';
import { SPRITES } from '../src/ui/sprites';

describe('analyzer', () => {
  it('detects multiple themes', () => {
    const a = analyzeDiary('今日はアプリの開発をした。新しい技術を勉強して発見があった。');
    const types = a.themes.map((t) => t.type);
    expect(types).toContain('development');
    expect(types).toContain('learning');
    expect(types).toContain('discovery');
  });
  it('treats planned activity as a weak tendency and negated as failure', () => {
    const done = analyzeDiary('今日は本を読んだ。');
    const planned = analyzeDiary('明日は本を読む予定。');
    const negated = analyzeDiary('今日は本を読めなかった。');
    const w = (a: typeof done) => a.themes.find((t) => t.type === 'learning')?.weight ?? 0;
    expect(w(planned)).toBeLessThan(w(done));
    expect(planned.planned).toContain('learning');
    expect(w(negated)).toBe(0);
    expect(negated.themes.map((t) => t.type)).toContain('failure');
  });
  it('classifies short memo posts', () => {
    const t = (s: string) => analyzeDiary(s).themes.map((x) => x.type);
    expect(t('AIを使った個人開発が面白い。')).toContain('development');
    expect(t('FXの戦略をもう少し検証したい。')).toContain('learning');
    expect(t('新しいアプリのアイデアを思いついた。')).toContain('discovery');
    expect(t('今日は何もしたくない。')).toContain('rest');
  });
  it('returns empty themes for plain text', () => {
    expect(analyzeDiary('あいうえお').themes).toEqual([]);
  });
});

describe('exp', () => {
  it('rewards short posts well and caps long ones', () => {
    expect(expForChars(0)).toBe(0);
    expect(expForChars(5)).toBeGreaterThanOrEqual(15);
    expect(expForChars(100000)).toBeLessThanOrEqual(expForChars(5) * 2);
  });
});

describe('items', () => {
  it('is reproducible with the same seed', () => {
    const ctx = { ilvl: 5, themes: [{ type: 'development' as const, weight: 1 }] };
    const a = generateItem(createRng(42), ctx, 'x', 't');
    const b = generateItem(createRng(42), ctx, 'x', 't');
    expect(a).toEqual(b);
  });
  it('legendary always has a special effect and 4 affixes', () => {
    // 2つ目の乱数（レアリティ）を最大付近に固定 → legendary
    const rng = sequenceRng([0.99, 0.999, 0.5, 0.1, 0.3, 0.7, 0.2, 0.9, 0.4, 0.6, 0.05, 0.8]);
    const it = generateItem(rng, { ilvl: 3, themes: [] }, 'x', 't');
    expect(it.rarity).toBe('legendary');
    expect(it.special).toBeDefined();
    expect(it.affixes).toHaveLength(4);
  });
  it('generates many items without errors and with valid names', () => {
    const rng = createRng(1);
    for (let i = 0; i < 2000; i++) {
      const it = generateItem(rng, { ilvl: 1 + (i % 50), themes: [{ type: 'learning', weight: 0.5 }] }, `i${i}`, 't');
      expect(it.name.length).toBeGreaterThan(1);
      expect(new Set(it.affixes.map((a) => a.kind)).size).toBe(it.affixes.length);
    }
  });
});

const mk = (p: Partial<Item>): Item => ({
  id: 'i', name: 'n', slot: 'weapon', baseKey: 'sword', rarity: 'normal', ilvl: 1, base: {}, affixes: [],
  themes: [], tags: [], acquiredAt: '', source: 'diary', ...p,
});

describe('build & synergy', () => {
  it('activates tag synergy at 2', () => {
    const items = [mk({ id: 'a', tags: ['gear'] }), mk({ id: 'b', slot: 'accessory', tags: ['gear'] })];
    const b = computeBuild(1, items);
    expect(b.synergies.find((s) => s.tag === 'gear')).toBeDefined();
    expect(b.extraAttack).toBeCloseTo(0.1);
  });
});

describe('dungeon', () => {
  it('is deterministic and terminates', () => {
    const b = computeBuild(10, []);
    // 探索イベント（戦闘・強敵・宝箱・休息・ボス）が一通り出る
    const evs = new Set<string>();
    const strong = computeBuild(60, [mk({ base: { atk: 999, hp: 99999 } })]);
    const ex = startExpedition('x', strong, DUNGEONS[0].id, 0, '');
    const rng = createRng(1);
    for (let i = 0; i < 300 && !ex.ended; i++) evs.add(playFloor(ex, strong, DUNGEONS[0], rng).event);
    expect([...evs].sort()).toEqual(['battle', 'boss', 'chest', 'elite', 'rest']);
    const r1 = simulateDungeon(b, DUNGEONS[0], createRng(5), { prevBest: 0, log: true });
    const r2 = simulateDungeon(b, DUNGEONS[0], createRng(5), { prevBest: 0, log: true });
    expect(r1).toEqual(r2);
    expect(r1.floorReached).toBeGreaterThan(1);
  });
  it('special effect combos (echo + extra attack + on-kill) go deeper', () => {
    const base = [mk({ base: { atk: 30 }, affixes: [{ kind: 'onKillAtk', value: 0.01 }, { kind: 'extraAttack', value: 0.3 }] })];
    const plain = computeBuild(15, [...base, mk({ id: 'p', slot: 'accessory', base: { hp: 20 } })]);
    const god = computeBuild(15, [...base, mk({ id: 'g', slot: 'accessory', special: { kind: 'echo', value: 1 } }), mk({ id: 'c', slot: 'ring', special: { kind: 'chainStrike', value: 0.5 } })]);
    let p = 0, g = 0;
    for (let i = 0; i < 10; i++) {
      p += simulateDungeon(plain, DUNGEONS[0], createRng(i), { prevBest: 0, log: false }).floorReached;
      g += simulateDungeon(god, DUNGEONS[0], createRng(i), { prevBest: 0, log: false }).floorReached;
    }
    expect(g).toBeGreaterThan(p);
  });
});

const T0 = new Date('2026-10-18T00:00:00Z');
const at = (h: number) => new Date(T0.getTime() + h * 3600_000);

describe('engine: posts', () => {
  it('post gives exp, inspiration, and instant exploration', () => {
    const s0 = settleIdle(createInitialState(), T0).state;
    const r = submitPost(s0, { text: '個人開発が面白い', date: '2026-10-18', now: T0 }, createRng(3));
    expect(s0.diaries).toHaveLength(0); // 元の state は不変
    expect(r.state.diaries).toHaveLength(1);
    expect(r.entry.expGained).toBeGreaterThan(0);
    expect(r.state.idle.inspirationUntil).toBeDefined();
    expect(r.report!.floorsCleared).toBeGreaterThan(0);
    expect(r.state.character.bestFloor).toBeGreaterThan(0);
  });
  it('works even when classification fails (analysis = null)', () => {
    const r = submitPost(createInitialState(), { text: '？？？', date: '2026-10-18', now: T0 }, createRng(1), null);
    expect(r.entry.rewarded).toBe(true);
    expect(r.entry.expGained).toBeGreaterThan(0);
  });
  it('reward strength does not depend on content', () => {
    const a = submitPost(createInitialState(), { text: '勉強した', date: '2026-10-18', now: T0 }, createRng(5));
    const b = submitPost(createInitialState(), { text: 'ねむい', date: '2026-10-18', now: T0 }, createRng(5));
    expect(a.entry.expGained === b.entry.expGained || Math.abs(a.entry.expGained - b.entry.expGained) < 30).toBe(true);
    expect(expForChars(4)).toBe(expForChars(3));
  });
  it('has no daily reward limit and always drops items', () => {
    let s = createInitialState();
    const rng = createRng(9);
    for (let i = 0; i < 15; i++) s = submitPost(s, { text: 'テスト', date: '2026-10-18', now: T0 }, rng).state;
    expect(s.diaries.filter((d) => d.rewarded)).toHaveLength(15);
    expect(Object.values(s.items).filter((i) => i.source === 'diary').length).toBeGreaterThanOrEqual(15);
  });
  it('dream: once per day, gives a dream-only item', () => {
    let s = createInitialState();
    const rng = createRng(4);
    const r1 = submitPost(s, { text: '空を飛ぶ夢を見た', date: '2026-10-18', now: T0, kind: 'dream' }, rng);
    s = r1.state;
    expect(r1.entry.kind).toBe('dream');
    const dreams = Object.values(s.items).filter((i) => i.dream);
    expect(dreams).toHaveLength(1);
    expect(['rare', 'legendary']).toContain(dreams[0].rarity);
    expect(['dreamWalk', 'lucid', 'dejavu', 'dreamEater']).toContain(dreams[0].special!.kind);
    // 2回目は通常投稿として扱う
    const r2 = submitPost(s, { text: 'また夢', date: '2026-10-18', now: T0, kind: 'dream' }, rng);
    expect(r2.entry.kind).toBeUndefined();
    expect(Object.values(r2.state.items).filter((i) => i.dream)).toHaveLength(1);
    // 翌日はまた記録できる
    const r3 = submitPost(r2.state, { text: '翌日の夢', date: '2026-10-19', now: at(24), kind: 'dream' }, rng);
    expect(r3.entry.kind).toBe('dream');
  });
  it('color labels can be set and cleared', () => {
    const r = submitPost(createInitialState(), { text: 'メモ', date: '2026-10-18', now: T0 }, createRng(1));
    const s1 = setPostColor(r.state, r.entry.id, 'blue');
    expect(s1.diaries[0].color).toBe('blue');
    expect(setPostColor(s1, r.entry.id, undefined).diaries[0].color).toBeUndefined();
  });
  it('editing does not grant rewards again', () => {
    const r = submitPost(createInitialState(), { text: '短い', date: '2026-10-18', now: T0 }, createRng(1));
    const s2 = editDiary(r.state, r.entry.id, 'とても長い投稿に書き直した。'.repeat(50));
    expect(s2.character.totalExp).toBe(r.state.character.totalExp);
  });
});

describe('engine: idle', () => {
  it('first settle only starts the clock', () => {
    const r = settleIdle(createInitialState(), T0);
    expect(r.report).toBeNull();
    expect(r.state.idle.lastTick).toBe(T0.toISOString());
  });
  it('progresses while away and reports results', () => {
    const s0 = settleIdle(createInitialState(), T0).state;
    const r = settleIdle(s0, at(3), createRng(2));
    expect(r.report!.kills).toBeGreaterThan(0);
    expect(r.report!.floorsCleared).toBeGreaterThan(0);
    expect(r.state.character.bestFloor).toBeGreaterThan(0);
    expect(r.state.reports).toHaveLength(1);
  });
  it('long absences are fully rewarded (no cap) and stay fast', () => {
    const s0 = settleIdle(createInitialState(), T0).state;
    const t = performance.now();
    const r = settleIdle(s0, at(72), createRng(2));
    expect(performance.now() - t).toBeLessThan(3000);
    expect(r.report!.countedSeconds).toBe(72 * 3600);
    const day = settleIdle(s0, at(24), createRng(2)).report!;
    expect(r.report!.kills).toBeGreaterThan(day.kills * 2);
    expect(IDLE.maxSeconds).toBe(Infinity);
  });
  it('captures a simple combat log with damage numbers', () => {
    const s0 = settleIdle(createInitialState(), T0).state;
    const combat: string[] = [];
    settleIdle(s0, new Date(T0.getTime() + 5 * 60_000), createRng(2), { combat });
    expect(combat.length).toBeGreaterThan(5);
    expect(combat.some((l) => /\d+ ダメージ/.test(l))).toBe(true);
  });
  it('rest points do not stop the climb', () => {
    expect(IDLE.floorSeconds.rest).toBeLessThan(IDLE.floorSeconds.battle / 5);
  });
  it('settling in many small steps is roughly equal to one big step', () => {
    const s0 = settleIdle(createInitialState(), T0).state;
    let small = s0;
    const rng = createRng(4);
    for (let m = 1; m <= 24; m++) small = settleIdle(small, new Date(T0.getTime() + m * 5 * 60_000), rng).state;
    const big = settleIdle(s0, at(2), createRng(4)).state;
    expect(Math.abs(small.character.bestFloor - big.character.bestFloor)).toBeLessThan(25);
    expect(small.character.bestFloor).toBeGreaterThan(0);
  });
  it('inspiration boosts exploration exp', () => {
    const s0 = settleIdle(createInitialState(), T0).state;
    const insp = structuredClone(s0);
    insp.idle.inspirationUntil = at(10).toISOString();
    const a = settleIdle(s0, at(4), createRng(8)).report!;
    const b = settleIdle(insp, at(4), createRng(8)).report!;
    expect(b.exp).toBeGreaterThanOrEqual(a.exp);
    expect(POST.inspirationExpMul).toBeGreaterThan(1);
  });
  it('expeditions resume from a checkpoint', () => {
    expect(checkpointFloor(0)).toBe(1);
    expect(checkpointFloor(45)).toBe(21);
  });
  it('auto equip only when better', () => {
    const s = createInitialState();
    const strong = mk({ id: 's', base: { atk: 200 } });
    const weak = mk({ id: 'w', base: { atk: 1 } });
    s.items.s = strong;
    s.items.w = weak;
    expect(tryAutoEquip(s, strong).equipped).toBe(true);
    expect(tryAutoEquip(s, weak).equipped).toBe(false);
    expect(s.character.equipped.weapon).toBe('s');
  });
  it('long-term simulation stays stable and grows', () => {
    let s = settleIdle(createInitialState(), T0).state;
    const rng = createRng(77);
    for (let d = 0; d < 6; d++) {
      for (const h of [0, 6, 12]) {
        const now = at(d * 24 + h);
        s = settleIdle(s, now, rng).state;
        s = submitPost(s, { text: '仕事と勉強をした', date: now.toISOString().slice(0, 10), now }, rng).state;
      }
    }
        expect(s.character.bestFloor).toBeGreaterThan(30);
    expect(s.character.level).toBeGreaterThan(5);
    expect(Object.keys(s.items).length).toBeLessThanOrEqual(410);
    expect(JSON.stringify(s).length).toBeLessThan(2_000_000);
  });
  it('migrates old save data without idle fields', () => {
    const old = createInitialState() as unknown as Record<string, unknown>;
    delete old.idle;
    delete old.reports;
    const m = migrate(old);
    expect(m.idle.carrySeconds).toBe(0);
    expect(m.reports).toEqual([]);
  });
});

describe('sprites', () => {
  it('all sprite rows have consistent width and palette', () => {
    for (const [key, sp] of Object.entries(SPRITES)) {
      for (const row of sp.rows) {
        expect(row.length, `${key} row width`).toBe(sp.rows[0].length);
        for (const ch of row) if (ch !== '.') expect(sp.palette[ch], `${key} palette '${ch}'`).toBeDefined();
      }
    }
  });
  it('hero sprite changes with equipment and stays valid', () => {
    const plain = heroSprite([]);
    for (const base of ITEM_BASES) {
      const sp = heroSprite([mk({ id: base.key, slot: base.slot, baseKey: base.key, rarity: 'legendary' })]);
      for (const row of sp.rows) {
        expect(row.length).toBe(16);
        for (const ch of row) if (ch !== '.') expect(sp.palette[ch], `${base.key} '${ch}'`).toBeDefined();
      }
      if (base.slot === 'weapon') expect(sp.rows.join('')).not.toBe(plain.rows.join(''));
    }
  });
  it('NPC always has something to say', () => {
    const rng = createRng(1);
    for (const t of ['welcome', 'report', 'post', 'dream', 'record', 'legendary', 'chatter'] as const) expect(npcLine(t, rng, { theme: 'rest', hour: 8 }).length).toBeGreaterThan(3);
  });
  it('every item base has an icon', () => {
    for (const b of ITEM_BASES) expect(SPRITES[`icon_${b.key}`], b.key).toBeDefined();
  });
});
