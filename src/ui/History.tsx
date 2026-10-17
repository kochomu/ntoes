import { useState } from 'react';
import { MOOD_LABEL } from '../game/analyzer';
import type { DiaryEntry, GameState } from '../game/types';
import { LogList, RunSummary, ThemeChips, formatDate } from './common';

interface Props {
  state: GameState;
  onEdit: (id: string, text: string) => void;
}

export function History({ state, onEdit }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const list = [...state.diaries]
    .filter((d) => !query || d.text.includes(query))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = new Map<string, DiaryEntry[]>();
  for (const d of list) groups.set(d.date, [...(groups.get(d.date) ?? []), d]);

  return (
    <div className="screen">
      <input className="search" placeholder="日記を検索" value={query} onChange={(e) => setQuery(e.target.value)} />
      {list.length === 0 && <p className="muted center">日記はまだありません。</p>}
      {[...groups.entries()].map(([date, entries]) => (
        <section key={date}>
          <h3 className="date-head">{formatDate(date)}</h3>
          {entries.map((d) => (
            <DiaryCard key={d.id} d={d} state={state} open={openId === d.id} toggle={() => setOpenId(openId === d.id ? null : d.id)} onEdit={onEdit} />
          ))}
        </section>
      ))}
    </div>
  );
}

function DiaryCard({ d, state, open, toggle, onEdit }: { d: DiaryEntry; state: GameState; open: boolean; toggle: () => void; onEdit: Props['onEdit'] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.text);
  const logs = d.logIds.map((id) => state.logs.find((l) => l.id === id)).filter((l) => !!l);
  return (
    <div className="card diary-card">
      <div onClick={toggle}>
        <div className="diary-meta">
          <span>{d.chars}文字</span>
          <span>+{d.expGained} EXP</span>
          {d.analysis && <span>{MOOD_LABEL[d.analysis.mood]}</span>}
          {logs[0] && <span>{logs[0].floorReached}階{logs[0].newRecord ? '★' : ''}</span>}
        </div>
        {d.analysis && <ThemeChips themes={d.analysis.themes} />}
        {!open && <p className="diary-preview">{d.text}</p>}
      </div>
      {open && (
        <>
          {editing ? (
            <>
              <textarea className="diary-input" value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} />
              <p className="muted small">※編集しても報酬は再付与されません（テーマ分析のみ更新）</p>
              <div className="row-btns">
                <button className="ghost-btn" onClick={() => { setDraft(d.text); setEditing(false); }}>キャンセル</button>
                <button className="primary-btn" onClick={() => { onEdit(d.id, draft); setEditing(false); }}>保存</button>
              </div>
            </>
          ) : (
            <>
              <p className="diary-text">{d.text}</p>
              <button className="link-btn" onClick={() => setEditing(true)}>編集する</button>
            </>
          )}
          {logs.map((l) => (
            <div key={l.id} className="sub-card">
              <RunSummary log={l} />
              <LogList events={l.events} />
            </div>
          ))}
          {!d.rewarded && <p className="muted small">この日記は報酬上限を超えたため冒険なし</p>}
        </>
      )}
    </div>
  );
}
