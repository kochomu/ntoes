import { useState } from 'react';
import { DAILY_REWARD_LIMIT, expToNext } from '../game/config';
import { countChars, currentBuild, expForChars, rewardedCountOn, type DiaryResult } from '../game/engine';
import { powerRating } from '../game/stats';
import type { GameState } from '../game/types';
import { SLOTS } from '../game/types';
import { ItemIcon, LogList, RunSummary, SLOT_LABEL, Scene, todayStr } from './common';

interface Props {
  state: GameState;
  onSubmit: (text: string) => DiaryResult;
  goto: (tab: string) => void;
}

const DRAFT_KEY = 'diary-rpg:draft';

function loadDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function Home({ state, onSubmit, goto }: Props) {
  const [text, setText] = useState(loadDraft);
  const [result, setResult] = useState<DiaryResult | null>(null);
  const ch = state.character;
  const build = currentBuild(state);
  const chars = countChars(text);
  const today = todayStr();
  const remaining = Math.max(0, DAILY_REWARD_LIMIT - rewardedCountOn(state, today));
  const todayExp = state.diaries.filter((d) => d.date === today).reduce((s, d) => s + d.expGained, 0);
  const lastLog = result?.log ?? state.logs[state.logs.length - 1];
  const need = expToNext(ch.level);

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
    const r = onSubmit(text.trim());
    setResult(r);
    updateText('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="screen">
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
          <div><small>今日のEXP</small><b>+{todayExp}</b></div>
        </div>
      </section>

      <Scene log={lastLog} animate={!!result} />

      {result && (
        <section className="card result">
          <div className="card-title">
            今日の冒険
            <button className="close-btn" onClick={() => setResult(null)} aria-label="閉じる">×</button>
          </div>
          {result.log && <RunSummary log={result.log} />}
          <LogList events={result.events} animate />
        </section>
      )}

      <section className="card">
        <div className="card-title">日記を書く</div>
        <textarea
          className="diary-input"
          value={text}
          onChange={(e) => updateText(e.target.value)}
          placeholder="今日あったこと、やったこと、感じたこと…"
          rows={6}
        />
        <div className="diary-foot">
          <span>{chars}文字 ・ 予定EXP +{remaining > 0 ? expForChars(chars) : 0}</span>
          <span className={remaining ? '' : 'muted'}>今日の冒険 残り{remaining}回</span>
        </div>
        <button className="primary-btn" disabled={!text.trim()} onClick={submit}>
          保存して冒険へ
        </button>
      </section>

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

      <section className="card" onClick={() => goto('logs')}>
        <div className="card-title">最近の冒険 <span className="more">›</span></div>
        {state.logs.length === 0 && <p className="muted">まだ冒険の記録はありません。</p>}
        {state.logs.slice(-3).reverse().map((l) => (
          <RunSummary key={l.id} log={l} />
        ))}
      </section>
    </div>
  );
}
