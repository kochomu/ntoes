import { useState } from 'react';
import { DUNGEON_BY_ID, RARITY_INFO, TAG_INFO, THEME_PROFILES } from '../game/config';
import { describeAffix, describeSpecial } from '../game/items';
import type { AdventureLog, Expedition, IdleReport, Item, LogEvent, Slot, Theme } from '../game/types';
import { PixelSprite } from './PixelSprite';
import { heroAura, heroSprite } from './heroSprite';
import { NPC_NAME } from '../game/npc';
import { fmtNum } from '../game/dungeon';

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
    <span className={`item-icon r-${item.rarity} ${item.dream ? 'dream' : ''}`}>
      <PixelSprite name={`icon_${item.baseKey}`} scale={scale} />
    </span>
  );
}

export function ItemCard({ item, equipped, compact }: { item: Item; equipped?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  return (
    <div className={`item-card r-${item.rarity} ${item.dream ? 'dream' : ''}`} onClick={() => compact && setOpen(!open)}>
      <div className="item-head">
        <ItemIcon item={item} />
        <div className="item-title">
          <div className="item-name">《{item.name}》</div>
          <div className="item-meta">
            {item.dream && <span className="dream-badge">夢</span>}
            <span className={`rar r-${item.rarity}`}>{RARITY_INFO[item.rarity].label}</span>
            <span>{SLOT_LABEL[item.slot]}</span>
            <span>iLv{item.ilvl}</span>
            {item.floor ? <span>{item.floor}階で入手</span> : null}
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
          {item.base.atk ? <li>攻撃力 {fmtNum(item.base.atk)}</li> : null}
          {item.base.def ? <li>防御力 {fmtNum(item.base.def)}</li> : null}
          {item.base.hp ? <li>最大HP {fmtNum(item.base.hp)}</li> : null}
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
          <LogLine key={i} e={e} delay={animate ? i * 100 : undefined} />
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

/** ダンジョンの一場面（主人公と、いま探索中の階層のイベント） */
export function Scene({ expedition, log, maxHp, inspiredUntil, animate, equipped = [], npc, pulse }: {
  expedition?: Expedition;
  log?: AdventureLog;
  maxHp: number;
  inspiredUntil?: string;
  animate?: boolean;
  /** 装備中のアイテム（主人公の見た目に反映） */
  equipped?: Item[];
  /** NPCのセリフ（あるときだけ吹き出しを出す） */
  npc?: string;
  /** 戦闘ログが流れるたびに変わる値（攻撃モーション用） */
  pulse?: number;
}) {
  const aura = heroAura(equipped);
  const dungeonId = expedition?.dungeonId ?? log?.dungeonId;
  const d = dungeonId ? DUNGEON_BY_ID[dungeonId] : undefined;
  // 画面に出ている敵・イベントは直前に計算した階層のもの
  const floor = expedition ? Math.max(1, expedition.floor - (expedition.lastEvent ? 1 : 0)) : log ? log.floorReached + 1 : 0;
  const ev = expedition?.lastEvent;
  const enemy = expedition?.lastEnemy ?? log?.lastEnemy;
  const hpPct = expedition ? Math.max(0, Math.min(100, (expedition.hp / maxHp) * 100)) : 100;
  const inspiredMin = inspiredUntil ? Math.round((new Date(inspiredUntil).getTime() - Date.now()) / 60000) : 0;
  return (
    <div
      className={`scene ${animate ? 'scene-fight' : ''}`}
      style={{ ['--bg' as string]: d?.color ?? '#1d2233', ['--floor' as string]: d?.floorColor ?? '#2a3149' }}
    >
      <div className="scene-title">{d ? `${d.name}　第${floor}階層` : 'はじまりの村'}</div>
      {inspiredMin > 0 && <div className="scene-buff">ひらめき 残り{inspiredMin >= 60 ? `${Math.floor(inspiredMin / 60)}時間${inspiredMin % 60}分` : `${inspiredMin}分`}</div>}
      {npc && (
        <div className="npc" key={npc}>
          <PixelSprite name="fairy" scale={3} title={NPC_NAME} />
          <div className="npc-bubble"><b>{NPC_NAME}</b>{npc}</div>
        </div>
      )}
      <div className="scene-stage">
        <div className={`sprite-hero bob ${aura ? `aura-${aura}` : ''}`}>
          <div key={pulse} className={pulse ? 'swing' : ''}>
            <PixelSprite name="hero" sprite={heroSprite(equipped)} scale={5} title="主人公" />
          </div>
          {expedition && (
            <div className="hp-bar" aria-label={`HP ${Math.round(hpPct)}%`}>
              <div style={{ width: `${hpPct}%` }} />
            </div>
          )}
        </div>
        {ev === 'chest' ? (
          <div className="sprite-enemy"><PixelSprite name="chest" scale={4} title="宝箱" /><div className="enemy-name">宝箱</div></div>
        ) : ev === 'rest' ? (
          <div className="sprite-enemy flicker"><PixelSprite name="campfire" scale={4} title="休息ポイント" /><div className="enemy-name">休息ポイント</div></div>
        ) : enemy ? (
          <div className={`sprite-enemy bob2 ${enemy.boss ? 'boss' : ''} ${enemy.name.startsWith('強敵') ? 'elite' : ''}`}>
            <PixelSprite name={enemy.sprite} scale={enemy.boss ? 6 : 4} flip title={enemy.name} />
            <div className="enemy-name">{enemy.name}</div>
          </div>
        ) : (
          <div className="sprite-enemy bob2">
            <PixelSprite name="slime" scale={4} title="スライム" />
            <div className="enemy-name">まもなく探索開始</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  return `${h}時間${m % 60 ? `${m % 60}分` : ''}`;
}

/** 放置中の戦果まとめ（起動時に表示） */
export function ReportView({ report, items, onClose }: { report: IdleReport; items: Record<string, Item>; onClose?: () => void }) {
  const got = report.itemIds.map((id) => items[id]).filter((x): x is Item => !!x);
  const rare = got.filter((i) => i.rarity === 'rare' || i.rarity === 'legendary' || i.rarity === 'mythic' || i.special);
  const capped = report.seconds > report.countedSeconds;
  return (
    <div className="report">
      <div className="report-head">
        <div className="report-title">{report.source === 'post' ? '探索の成果' : 'おかえりなさい'}</div>
        <div className="muted small">
          {formatDuration(report.seconds)}の間に探索が進みました{capped ? `（報酬対象は最大${formatDuration(report.countedSeconds)}）` : ''}
        </div>
      </div>
      {report.bestTo > report.bestFrom && (
        <div className="report-record">最高到達階層を更新！ {report.bestFrom}階 → <b>{report.bestTo}階</b></div>
      )}
      <div className="report-grid">
        <div><small>撃破数</small><b>{report.kills}</b></div>
        <div><small>突破階層</small><b>{report.floorsCleared}</b></div>
        <div><small>最深</small><b>{report.deepest ? `${report.deepest}階` : '-'}</b></div>
        <div><small>ボス撃破</small><b>{report.bosses}</b></div>
        <div><small>獲得装備</small><b>{got.length}</b></div>
        <div><small>経験値</small><b>+{report.exp}</b></div>
      </div>
      <div className="report-sub muted small">
        宝箱 {report.chests} ・ 強敵 {report.elites} ・ 休息 {report.rests} ・ 探索 {report.expeditions}回
        {report.levelTo > report.levelFrom && ` ・ Lv.${report.levelFrom}→${report.levelTo}`}
      </div>
      {rare.length > 0 && (
        <div className="report-items">
          {rare.slice(0, 6).map((it) => <ItemCard key={it.id} item={it} compact />)}
        </div>
      )}
      {report.highlights.length > 0 && (
        <ul className="log-list animate">
          {report.highlights.map((e, i) => <LogLine key={i} e={e} delay={i * 220} />)}
        </ul>
      )}
      {onClose && <button className="primary-btn" onClick={onClose}>冒険を続ける</button>}
    </div>
  );
}

/** 簡易戦闘ログ（数行だけ流れる） */
export function CombatFeed({ lines }: { lines: { id: number; text: string }[] }) {
  if (!lines.length) return null;
  return (
    <ul className="combat-feed" aria-live="off">
      {lines.map((l) => (
        <li key={l.id} className={l.text.includes('会心') ? 'crit' : l.text.includes('受けた') ? 'hurt' : l.text.includes('倒した') ? 'kill' : ''}>
          {l.text.split(/(\d[\d.]*[万億兆京垓]?(?=\s*ダメージ))/).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}
        </li>
      ))}
    </ul>
  );
}
