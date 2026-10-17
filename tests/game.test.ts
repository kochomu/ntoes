import { describe, expect, it } from 'vitest';
import { analyzeDiary } from '../src/game/analyzer';
import { DAILY_REWARD_LIMIT, ITEM_BASES } from '../src/game/config';
import { simulateDungeon } from '../src/game/dungeon';
import { createInitialState, editDiary, expForChars, submitDiary, tryAutoEquip } from '../src/game/engine';
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
  it('does not treat negated / planned reading as done', () => {
    const a = analyzeDiary('今日は本を読めなかった。明日は本を読む予定。');
    expect(a.themes.map((t) => t.type)).not.toContain('learning');
    expect(a.planned).toContain('learning');
    expect(a.themes.map((t) => t.type)).toContain('failure');
  });
  it('returns empty themes for plain text', () => {
    expect(analyzeDiary('あいうえお').themes).toEqual([]);
  });
});

describe('exp', () => {
  it('follows the table with a cap', () => {
    expect(expForChars(0)).toBe(0);
    expect(expForChars(10)).toBe(10);
    expect(expForChars(149)).toBe(20);
    expect(expForChars(500)).toBe(60);
    expect(expForChars(100000)).toBe(60);
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
    const r1 = simulateDungeon(b, DUNGEONS[0], createRng(5), { prevBest: 0, log: true });
    const r2 = simulateDungeon(b, DUNGEONS[0], createRng(5), { prevBest: 0, log: true });
    expect(r1).toEqual(r2);
    expect(r1.floorReached).toBeGreaterThan(1);
  });
  it('chain + echo builds go deeper than plain builds', () => {
    const plain = computeBuild(15, [mk({ base: { atk: 30 } })]);
    const god = computeBuild(15, [mk({ base: { atk: 30 }, special: { kind: 'chainStrike', value: 0.5 } }), mk({ slot: 'accessory', special: { kind: 'echo', value: 1 } })]);
    let p = 0, g = 0;
    for (let i = 0; i < 10; i++) {
      p += simulateDungeon(plain, DUNGEONS[0], createRng(i), { prevBest: 0, log: false }).floorReached;
      g += simulateDungeon(god, DUNGEONS[0], createRng(i), { prevBest: 0, log: false }).floorReached;
    }
    expect(g).toBeGreaterThan(p);
  });
});

describe('engine', () => {
  it('runs the full loop: exp, item, equip, dungeon, record', () => {
    const s0 = createInitialState();
    const r = submitDiary(s0, { text: '今日は開発を頑張った。新しい発見があった！', date: '2026-10-17' }, createRng(3));
    expect(s0.diaries).toHaveLength(0); // 元の state は不変
    expect(r.state.diaries).toHaveLength(1);
    expect(r.entry.expGained).toBeGreaterThan(0);
    expect(Object.keys(r.state.items).length).toBeGreaterThanOrEqual(1);
    expect(r.state.character.equipped).not.toEqual(s0.character.equipped);
    expect(r.log).toBeDefined();
    expect(r.state.character.bestFloor).toBe(r.log!.floorReached);
    expect(r.events.some((e) => e.kind === 'record')).toBe(true);
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
  it('limits rewards per day', () => {
    let s = createInitialState();
    const rng = createRng(9);
    for (let i = 0; i < DAILY_REWARD_LIMIT + 1; i++) s = submitDiary(s, { text: 'テスト', date: '2026-10-17' }, rng).state;
    expect(s.diaries.filter((d) => d.rewarded)).toHaveLength(DAILY_REWARD_LIMIT);
    expect(s.diaries).toHaveLength(DAILY_REWARD_LIMIT + 1);
  });
  it('editing does not grant rewards again', () => {
    const r = submitDiary(createInitialState(), { text: '短い', date: '2026-10-17' }, createRng(1));
    const s2 = editDiary(r.state, r.entry.id, 'とても長い日記に書き直した。'.repeat(50));
    expect(s2.character.totalExp).toBe(r.state.character.totalExp);
    expect(s2.diaries[0].chars).toBeGreaterThan(300);
  });
  it('long-term simulation stays stable', () => {
    let s = createInitialState();
    const rng = createRng(77);
    for (let d = 1; d <= 60; d++) s = submitDiary(s, { text: '仕事と勉強と運動をした。'.repeat(d % 5 + 1), date: `2026-${String(Math.ceil(d / 28)).padStart(2, '0')}-${String(((d - 1) % 28) + 1).padStart(2, '0')}` }, rng).state;
    expect(s.character.level).toBeGreaterThan(10);
    expect(s.character.bestFloor).toBeGreaterThan(20);
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
  it('every item base has an icon', () => {
    for (const b of ITEM_BASES) expect(SPRITES[`icon_${b.key}`], b.key).toBeDefined();
  });
});
