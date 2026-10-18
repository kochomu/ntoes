import { useState } from 'react';
import { ITEM_BASES, RARITY_INFO, TAG_INFO } from '../game/config';
import { currentBuild, equippedItems } from '../game/engine';
import { fmtNum } from '../game/dungeon';
import { heroAura, heroSprite } from './heroSprite';
import { powerRating } from '../game/stats';
import type { GameState, Rarity, Slot } from '../game/types';
import { RARITIES, SLOTS } from '../game/types';
import { PixelSprite } from './PixelSprite';
import { ItemCard, SLOT_LABEL } from './common';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

export function Equipment({ state, onFuse }: { state: GameState; onFuse: () => void }) {
  const [tab, setTab] = useState<'equip' | 'bag' | 'codex'>('equip');
  const [slot, setSlot] = useState<Slot | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const ch = state.character;
  const b = currentBuild(state);
  const equippedIds = new Set(Object.values(ch.equipped));
  const equippedList = equippedItems(state);
  const aura = heroAura(equippedList);
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
            <div className={aura ? `aura-${aura}` : ''}><PixelSprite name="hero" sprite={heroSprite(equippedList)} scale={6} /></div>
            <div className="stat-table">
              <div><small>戦闘力</small><b>{fmtNum(powerRating(b))}</b></div>
              <div><small>攻撃力</small><b>{fmtNum(b.atk)}</b></div>
              <div><small>防御力</small><b>{fmtNum(b.def)}</b></div>
              <div><small>最大HP</small><b>{fmtNum(b.hp)}</b></div>
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
          <section className="card">
            <div className="card-title">装備の凝縮</div>
            <p className="muted small">未装備の装備10個を消費し、魔法級以上の装備1個に再抽選します。装備中・夢・神話級は素材から保護されます。</p>
            <button className="ghost-btn" disabled={Object.values(state.items).filter((i) => !equippedIds.has(i.id) && !i.dream && i.rarity !== 'mythic').length < 10} onClick={onFuse}>10個を凝縮して再抽選</button>
          </section>
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
          <div className="card-title" style={{ marginTop: 16 }}>夢のアイテム</div>
          {Object.values(state.items).filter((i) => i.dream).length === 0 && <p className="muted small">夢を記録すると、夢でしか手に入らない装備が見つかる…</p>}
          {Object.values(state.items)
            .filter((i) => i.dream)
            .map((it) => <ItemCard key={it.id} item={it} equipped={equippedIds.has(it.id)} compact />)}
          <div className="card-title" style={{ marginTop: 16 }}>高レア装備</div>
          {Object.values(state.items).filter((i) => i.rarity === 'legendary' || i.rarity === 'mythic').length === 0 && <p className="muted small">まだ見ぬ伝説が眠っている…</p>}
          {Object.values(state.items)
            .filter((i) => i.rarity === 'legendary' || i.rarity === 'mythic')
            .map((it) => <ItemCard key={it.id} item={it} equipped={equippedIds.has(it.id)} compact />)}
        </section>
      )}
    </div>
  );
}
