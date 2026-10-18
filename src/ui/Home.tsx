import { useState } from 'react';
import { DAILY_REWARD_LIMIT, expToNext } from '../game/config';
import { countChars, currentBuild, expForChars, rewardedCountOn, type PostResult } from '../game/engine';
import { powerRating } from '../game/stats';
import type { GameState } from '../game/types';
import { SLOTS } from '../game/types';
import { ItemIcon, LogList, SLOT_LABEL, Scene, ThemeChips, formatTime, todayStr } from './common';

interface Props {
  state: GameState;
  onPost: (text: string) => PostResult;
  goto: (tab: string) => void;
}

const DRAFT_KEY = 'diary-rpg:draft';
const PLACEHOLDERS = ['いま何してる？', '思いついたことをひとこと', '今日の学び・気づき', 'アイデアのメモ', 'つぶやき'];

function loadDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function Home({ state, onPost, goto }: Props) {
  const [text, setText] = useState(loadDraft);
  const [result, setResult] = useState<PostResult | null>(null);
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  const ch = state.character;
  const build = currentBuild(state);
  const chars = countChars(text);
  const today = todayStr();
  const remaining = Math.max(0, DAILY_REWARD_LIMIT - rewardedCountOn(state, today));
  const need = expToNext(ch.level);
  const lastLog = state.logs[state.logs.length - 1];
  const recentPosts = [...state.diaries].slice(-5).reverse();
  const liveEvents = (state.expedition?.events ?? []).filter((e) => e.level !== 'detail').slice(-6);

  const updateText = (v: string) => {
    setText(v);
    try {
      localStorage.setItem(DRAFT_KEY, v);
    } catch {
      /* noop */
    }
  };

  const submit = () => {
    if (!text.trim()) return;
    setResult(onPost(text.trim()));
    updateText('');
  };

  return (
    <div className="screen">
      <section className="card composer">
        <textarea
          className="post-input"
          value={text}
          onChange={(e) => updateText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={placeholder}
          rows={2}
          maxLength={2000}
        />
        <div className="composer-foot">
          <span className="muted small">{remaining > 0 ? `+${expForChars(chars) || expForChars(1)} EXP ・ 残り${remaining}回` : '今日の報酬は上限（投稿は保存されます）'}</span>
          <button className="post-btn" disabled={!text.trim()} onClick={submit}>投稿</button>
        </div>
      </section>

      {result && (
        <section className="card result">
          <div className="card-title">
            投稿の成果
            <button className="close-btn" onClick={() => setResult(null)} aria-label="閉じる">×</button>
          </div>
          <LogList events={result.events} animate />
        </section>
      )}

      <section className="status card">
        <div className="status-row">
          <div className="lv">Lv.{ch.level}</div>
          <div className="exp-bar">
            <div className="exp-fill" style={{ width: `${Math.min(100, (ch.exp / need) * 100)}%` }} />
            <span>{ch.exp} / {need} EXP</span>
          </div>
        </div>
        <div className="status-grid">
          <div><small>最高到達</small><b>{ch.bestFloor}階</b></div>
          <div><small>戦闘力</small><b>{powerRating(build).toLocaleString()}</b></div>
          <div><small>装備</small><b>{Object.keys(state.items).length}</b></div>
        </div>
      </section>

      <Scene expedition={state.expedition} log={lastLog} maxHp={build.hp} inspiredUntil={state.idle.inspirationUntil} animate={!!result} />

      {liveEvents.length > 0 && (
        <section className="card">
          <div className="card-title">探索中</div>
          <ul className="log-list">
            {liveEvents.map((e, i) => <li key={i} className={`log log-${e.level}`}>{e.text}</li>)}
          </ul>
        </section>
      )}

      <section className="card" onClick={() => goto('equip')}>
        <div className="card-title">装備 <span className="more">›</span></div>
        <div className="equip-mini">
          {SLOTS.map((s) => {
            const id = ch.equipped[s];
            const it = id ? state.items[id] : null;
            return (
              <div key={s} className="equip-slot">
                {it ? <ItemIcon item={it} /> : <span className="item-icon empty" />}
                <small>{it ? it.name : SLOT_LABEL[s]}</small>
              </div>
            );
          })}
        </div>
        {build.synergies.length > 0 && (
          <div className="syn-mini">シナジー：{build.synergies.map((s) => s.desc.join('・')).join(' / ')}</div>
        )}
      </section>

      <section className="card" onClick={() => goto('history')}>
        <div className="card-title">最近の投稿 <span className="more">›</span></div>
        {recentPosts.length === 0 && <p className="muted small">まだ投稿はありません。ひとことでOK。</p>}
        <ul className="timeline">
          {recentPosts.map((d) => (
            <li key={d.id}>
              <span className="muted small">{formatTime(d.createdAt)}</span>
              <p>{d.text}</p>
              {d.analysis && <ThemeChips themes={d.analysis.themes.slice(0, 3)} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
