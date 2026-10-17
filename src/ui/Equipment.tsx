import { useState } from 'react';
import { ITEM_BASES, RARITY_INFO, TAG_INFO } from '../game/config';
import { currentBuild } from '../game/engine';
import { powerRating } from '../game/stats';
import type { GameState, Rarity, Slot } from '../game/types';
import { RARITIES, SLOTS } from '../game/types';
import { PixelSprite } from './PixelSprite';
import { ItemCard, SLOT_LABEL } from './common';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

export function Equipment({ state }: { state: GameState }) {
  const [tab, setTab] = useState<'equip' | 'bag' | 'codex'>('equip');
  const [slot, setSlot] = useState<Slot | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const ch = state.character;
  const b = currentBuild(state);
  const equippedIds = new Set(Object.values(ch.equipped));
  const items = Object.values(state.items)
    .filter((i) => (slot === 'all' || i.slot === slot) && (rarity === 'all' || i.rarity === rarity))
    .sort((a, b2) => b2.acquiredAt.localeCompare(a.acquiredAt) || b2.id.localeCompare(a.id));

  return (
    <div className="screen">
      <div className="seg">
        <button className={tab === 'equip' ? 'on' : ''} onClick={() => setTab('equip')}>装備</button>
        <button className={tab === 'bag' ? 'on' : ''} onClick={() => setTab('bag')}>所持品 {Object.keys(state.items).length}</button>
        <button className={tab === 'codex' ? 'on' : ''} onClick={() => setTab('codex')}>図鑑</button>
      </div>

      {tab === 'equip' && (
        <>
          <section className="card hero-card">
            <PixelSprite name="hero" scale={6} />
            <div className="stat-table">
              <div><small>戦闘力</small><b>{powerRating(b).toLocaleString()}</b></div>
              <div><small>攻撃力</small><b>{Math.round(b.atk)}</b></div>
              <div><small>防御力</small><b>{Math.round(b.def)}</b></div>
              <div><small>最大HP</small><b>{b.hp}</b></div>
              <div><small>会心</small><b>{pct(b.crit)} ×{b.critMul.toFixed(1)}</b></div>
              <div><small>追加攻撃</small><b>{pct(b.extraAttack)}</b></div>
              {b.chainChance > 0 && <div><small>連鎖</small><b>{pct(b.chainChance)} 上限{b.chainLimit}</b></div>}
              {b.dodge > 0 && <div><small>回避</small><b>{pct(b.dodge)}</b></div>}
              {b.lifesteal > 0 && <div><small>吸収</small><b>{pct(b.lifesteal)}</b></div>}
              <div><small>階層回復</small><b>{pct(b.floorHeal)}</b></div>
              {b.expPct > 0 && <div><small>経験値</small><b>+{pct(b.expPct)}</b></div>}
              {b.bossDmg > 0 && <div><small>対ボス</small><b>+{pct(b.bossDmg)}</b></div>}
              {b.phoenix > 0 && <div><small>復活</small><b>HP{pct(b.phoenix)}</b></div>}
              {ch.retryStacks > 0 && <div><small>再挑戦</small><b>×{ch.retryStacks}</b></div>}
            </div>
          </section>
          {b.synergies.length > 0 && (
            <section className="card">
              <div className="card-title">発動中のシナジー</div>
              {b.synergies.map((s) => (
                <div key={s.tag} className="syn-row">
                  <span className="tag" style={{ color: TAG_INFO[s.tag].color, borderColor: TAG_INFO[s.tag].color }}>
                    {TAG_INFO[s.tag].label}×{s.count}
                  </span>
                  {s.desc.join(' / ')}
                </div>
              ))}
            </section>
          )}
          {SLOTS.map((s) => {
            const id = ch.equipped[s];
            const it = id ? state.items[id] : null;
            return it ? <ItemCard key={s} item={it} equipped /> : <div key={s} className="card muted">{SLOT_LABEL[s]}：なし</div>;
          })}
          <p className="muted small center">装備は新しいアイテムを入手したとき自動で最適化されます</p>
        </>
      )}

      {tab === 'bag' && (
        <>
          <div className="filters">
            <select value={slot} onChange={(e) => setSlot(e.target.value as Slot | 'all')}>
              <option value="all">全部位</option>
              {SLOTS.map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}
            </select>
            <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | 'all')}>
              <option value="all">全レアリティ</option>
              {RARITIES.map((r) => <option key={r} value={r}>{RARITY_INFO[r].label}</option>)}
            </select>
          </div>
          {items.length === 0 && <p className="muted center">アイテムはまだありません。</p>}
          {items.slice(0, 150).map((it) => <ItemCard key={it.id} item={it} equipped={equippedIds.has(it.id)} compact />)}
        </>
      )}

      {tab === 'codex' && (
        <section className="card">
          <div className="card-title">装備図鑑 {Object.keys(state.codex).length} / {ITEM_BASES.length}</div>
          <div className="codex">
            {ITEM_BASES.map((base) => {
              const found = !!state.codex[base.key];
              const count = Object.values(state.items).filter((i) => i.baseKey === base.key).length;
              return (
                <div key={base.key} className="codex-cell">
                  <PixelSprite name={`icon_${base.key}`} scale={4} silhouette={!found} />
                  <small>{found ? base.name : '？？？'}</small>
                  {found && <small className="muted">×{count}</small>}
                </div>
              );
            })}
          </div>
          <div className="card-title" style={{ marginTop: 16 }}>レジェンダリー</div>
          {Object.values(state.items).filter((i) => i.rarity === 'legendary').length === 0 && <p className="muted small">まだ見ぬ伝説が眠っている…</p>}
          {Object.values(state.items)
            .filter((i) => i.rarity === 'legendary')
            .map((it) => <ItemCard key={it.id} item={it} equipped={equippedIds.has(it.id)} compact />)}
        </section>
      )}
    </div>
  );
}
