import { useState } from 'react';
import { DUNGEON_BY_ID, RARITY_INFO, TAG_INFO, THEME_PROFILES } from '../game/config';
import { describeAffix, describeSpecial } from '../game/items';
import type { AdventureLog, Item, LogEvent, Slot, Theme } from '../game/types';
import { PixelSprite } from './PixelSprite';

export const SLOT_LABEL: Record<Slot, string> = { weapon: '武器', armor: '防具', ring: '指輪', accessory: '装飾' };

export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${y}/${m}/${d}（${wd}）`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ThemeChips({ themes }: { themes: { type: Theme; weight: number }[] }) {
  if (!themes.length) return null;
  return (
    <div className="chips">
      {themes.map((t) => (
        <span key={t.type} className="chip" style={{ opacity: 0.5 + t.weight / 2 }}>
          {THEME_PROFILES[t.type].label}
        </span>
      ))}
    </div>
  );
}

export function ItemIcon({ item, scale = 3 }: { item: Item; scale?: number }) {
  return (
    <span className={`item-icon r-${item.rarity}`}>
      <PixelSprite name={`icon_${item.baseKey}`} scale={scale} />
    </span>
  );
}

export function ItemCard({ item, equipped, compact }: { item: Item; equipped?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  return (
    <div className={`item-card r-${item.rarity}`} onClick={() => compact && setOpen(!open)}>
      <div className="item-head">
        <ItemIcon item={item} />
        <div className="item-title">
          <div className="item-name">《{item.name}》</div>
          <div className="item-meta">
            <span className={`rar r-${item.rarity}`}>{RARITY_INFO[item.rarity].label}</span>
            <span>{SLOT_LABEL[item.slot]}</span>
            <span>iLv{item.ilvl}</span>
            {item.tags.map((t) => (
              <span key={t} className="tag" style={{ color: TAG_INFO[t].color, borderColor: TAG_INFO[t].color }}>
                {TAG_INFO[t].label}
              </span>
            ))}
            {equipped && <span className="eq-badge">装備中</span>}
          </div>
        </div>
      </div>
      {open && (
        <ul className="item-stats">
          {item.base.atk ? <li>攻撃力 {item.base.atk}</li> : null}
          {item.base.def ? <li>防御力 {item.base.def}</li> : null}
          {item.base.hp ? <li>最大HP {item.base.hp}</li> : null}
          {item.base.crit ? <li>会心率 +{Math.round(item.base.crit * 100)}%</li> : null}
          {item.affixes.map((a, i) => (
            <li key={i} className="affix">{describeAffix(a)}</li>
          ))}
          {item.special && <li className="special">★ {describeSpecial(item.special)}</li>}
        </ul>
      )}
    </div>
  );
}

export function LogLine({ e, delay }: { e: LogEvent; delay?: number }) {
  return (
    <li className={`log log-${e.level}`} style={delay !== undefined ? { animationDelay: `${delay}ms` } : undefined}>
      {e.text}
    </li>
  );
}

/** 重要ログのみ表示し、詳細は展開式 */
export function LogList({ events, animate }: { events: LogEvent[]; animate?: boolean }) {
  const [showDetail, setShowDetail] = useState(false);
  const visible = events.filter((e) => showDetail || e.level !== 'detail');
  const hidden = events.filter((e) => e.level === 'detail').length;
  return (
    <div>
      <ul className={`log-list ${animate ? 'animate' : ''}`}>
        {visible.map((e, i) => (
          <LogLine key={i} e={e} delay={animate ? i * 260 : undefined} />
        ))}
      </ul>
      {hidden > 0 && (
        <button className="link-btn" onClick={() => setShowDetail(!showDetail)}>
          {showDetail ? '詳細ログを閉じる' : `詳細ログを表示（${hidden}件）`}
        </button>
      )}
    </div>
  );
}

export function RunSummary({ log }: { log: AdventureLog }) {
  return (
    <div className="run-summary">
      <span className="run-dungeon">{log.dungeonName}</span>
      <span className="run-floor">{log.floorReached}階</span>
      {log.newRecord && <span className="badge-record">記録更新</span>}
      {log.bossesDefeated > 0 && <span className="badge">ボス×{log.bossesDefeated}</span>}
      {log.maxChain >= 2 && <span className="badge">{log.maxChain}連鎖</span>}
    </div>
  );
}

/** ダンジョンの一場面（主人公と最後に遭遇した敵） */
export function Scene({ log, animate }: { log?: AdventureLog; animate?: boolean }) {
  const d = log ? DUNGEON_BY_ID[log.dungeonId] : undefined;
  const enemy = log?.lastEnemy;
  return (
    <div
      className={`scene ${animate ? 'scene-fight' : ''}`}
      style={{ ['--bg' as string]: d?.color ?? '#1d2233', ['--floor' as string]: d?.floorColor ?? '#2a3149' }}
    >
      <div className="scene-title">{d ? `${d.name}　${log!.floorReached + 1}階` : 'はじまりの村'}</div>
      <div className="scene-stage">
        <div className="sprite-hero bob">
          <PixelSprite name="hero" scale={5} title="主人公" />
        </div>
        {enemy ? (
          <div className={`sprite-enemy bob2 ${enemy.boss ? 'boss' : ''}`}>
            <PixelSprite name={enemy.sprite} scale={enemy.boss ? 6 : 4} flip title={enemy.name} />
            <div className="enemy-name">{enemy.name}</div>
          </div>
        ) : (
          <div className="sprite-enemy bob2">
            <PixelSprite name="slime" scale={4} title="スライム" />
            <div className="enemy-name">{log ? '' : '日記を書くと冒険が始まる'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
