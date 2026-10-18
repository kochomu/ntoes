// 装備に応じて主人公のドット絵を組み立てる。
import type { Item, Rarity } from '../game/types';
import { SPRITES, type SpriteDef } from './sprites';

/** 武器を持っていない素の主人公（右手の位置は x=13, y=10） */
const BASE_ROWS = [
  '................',
  '....kkkkkkk.....',
  '...khhhhhhhk....',
  '..khhhhhhhhhk...',
  '..khhsssssshk...',
  '..kssksssksk....',
  '..ksssssssk.....',
  '...kssmssk......',
  '..rrkkkkkrr.....',
  '.kbbrbbbbbbk....',
  'kbbbbbbbbbbbk...',
  '.kskbyyyyybk....',
  '...kbbbbbbbk....',
  '...kppk.kppk....',
  '...kppk.kppk....',
  '..kkkkk.kkkkk...',
];

type Overlay = [number, number, string][];

const WEAPONS: Record<string, Overlay> = {
  sword: [[15, 5, 'w'], [14, 6, 'k'], [15, 6, 'w'], [14, 7, 'w'], [15, 7, 'k'], [13, 8, 'k'], [14, 8, 'w'], [13, 9, 'w'], [14, 9, 'k'], [13, 10, 'y'], [14, 10, 'n']],
  dagger: [[14, 8, 'w'], [14, 9, 'w'], [13, 9, 'k'], [13, 10, 'y'], [14, 10, 'k']],
  axe: [[13, 4, 'w'], [14, 4, 'n'], [15, 4, 'w'], [13, 5, 'w'], [14, 5, 'n'], [15, 5, 'w'], [15, 6, 'w'], [14, 6, 'n'], [14, 7, 'n'], [14, 8, 'n'], [14, 9, 'n'], [13, 10, 'n']],
  staff: [[14, 1, 'g'], [13, 2, 'g'], [14, 2, 'l'], [15, 2, 'g'], [14, 3, 'g'], [14, 4, 'n'], [14, 5, 'n'], [14, 6, 'n'], [14, 7, 'n'], [14, 8, 'n'], [14, 9, 'n'], [13, 10, 'n'], [14, 10, 'n'], [14, 11, 'n']],
  tome: [[13, 9, 'k'], [14, 9, 'c'], [15, 9, 'c'], [13, 10, 'c'], [14, 10, 'l'], [15, 10, 'c'], [13, 11, 'k'], [14, 11, 'c'], [15, 11, 'c']],
};

const SHIELD: Overlay = [[0, 8, 'k'], [1, 8, 'k'], [0, 9, 'd'], [1, 9, 'y'], [0, 10, 'd'], [1, 10, 'd'], [0, 11, 'd'], [1, 11, 'd'], [1, 12, 'k']];
const AMULET: Overlay = [[6, 9, 'y']];

const RARITY_METAL: Record<Rarity, string> = { normal: '#dfe6ee', magic: '#9fd0ff', rare: '#ffe27a', legendary: '#ffb347', mythic: '#e4a5ff' };

const cache = new Map<string, SpriteDef>();

export function heroSprite(equipped: Item[]): SpriteDef {
  const key = equipped.map((i) => `${i.slot}:${i.baseKey}:${i.rarity}`).sort().join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const weapon = equipped.find((i) => i.slot === 'weapon');
  const armor = equipped.find((i) => i.slot === 'armor');
  const acc = equipped.find((i) => i.slot === 'accessory');
  const palette: Record<string, string> = { ...SPRITES.hero.palette, n: '#7a4a24', g: '#b78cff', l: '#ffffff', c: '#2f6fbf', d: '#3f6fd8' };

  // 防具：鎧なら銀の鎧と兜、外套なら緑のマント、盾なら左手に盾
  if (armor?.baseKey === 'armor') Object.assign(palette, { b: '#9aa3ad', h: '#c9d1da', r: '#6b7280' });
  if (armor?.baseKey === 'cloak') Object.assign(palette, { b: '#3e8f5a', r: '#2a6440' });
  if (armor?.baseKey === 'shield') Object.assign(palette, { b: '#5a4fb8' });
  // 装飾：靴なら茶色のブーツ、歯車なら金のベルト
  if (acc?.baseKey === 'boots') palette.p = '#8b5a2b';
  if (acc?.baseKey === 'gear') palette.y = '#d9a441';
  // 武器の金属色はレアリティで変わる
  if (weapon) palette.w = RARITY_METAL[weapon.rarity];

  const grid = BASE_ROWS.map((r) => r.split(''));
  const apply = (o: Overlay) => o.forEach(([x, y, ch]) => (grid[y][x] = ch));
  if (weapon && WEAPONS[weapon.baseKey]) apply(WEAPONS[weapon.baseKey]);
  if (armor?.baseKey === 'shield') apply(SHIELD);
  if (acc?.baseKey === 'amulet') apply(AMULET);

  const sprite: SpriteDef = { rows: grid.map((r) => r.join('')), palette };
  cache.set(key, sprite);
  return sprite;
}

/** レジェンダリー・夢装備を持っているとオーラが出る */
export function heroAura(equipped: Item[]): 'mythic' | 'legendary' | 'dream' | undefined {
  if (equipped.some((i) => i.rarity === 'mythic')) return 'mythic';
  if (equipped.some((i) => i.dream)) return 'dream';
  if (equipped.some((i) => i.rarity === 'legendary')) return 'legendary';
  return undefined;
}
