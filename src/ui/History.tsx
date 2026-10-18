import { useState } from 'react';
import type { DiaryEntry, GameState } from '../game/types';
import { LogList, RunSummary, ThemeChips, formatDate } from './common';

interface Props {
  state: GameState;
  onEdit: (id: string, text: string) => void;
}

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function History({ state, onEdit }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const list = [...state.diaries]
    .filter((d) => !query || d.text.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = new Map<string, DiaryEntry[]>();
  for (const d of list) groups.set(d.date, [...(groups.get(d.date) ?? []), d]);

  return (
    <div className="screen">
      <input className="search" placeholder="投稿を検索" value={query} onChange={(e) => setQuery(e.target.value)} />
      {list.length === 0 && <p className="muted center">投稿はまだありません。</p>}
      {[...groups.entries()].map(([date, entries]) => (
        <section key={date}>
          <h3 className="date-head">{formatDate(date)} ・ {entries.length}件</h3>
          <div className="card post-group">
            {entries.map((d) => (
              <PostItem key={d.id} d={d} state={state} open={openId === d.id} toggle={() => setOpenId(openId === d.id ? null : d.id)} onEdit={onEdit} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PostItem({ d, state, open, toggle, onEdit }: { d: DiaryEntry; state: GameState; open: boolean; toggle: () => void; onEdit: Props['onEdit'] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.text);
  const logs = d.logIds.map((id) => state.logs.find((l) => l.id === id)).filter((l) => !!l);
  return (
    <div className="post-item">
      <div onClick={toggle}>
        <div className="post-meta">
          <span>{hhmm(d.createdAt)}</span>
          {d.expGained > 0 && <span>+{d.expGained} EXP</span>}
          {d.updatedAt !== d.createdAt && <span>編集済み</span>}
        </div>
        {!editing && <p className={open ? 'post-text' : 'post-text clamp'}>{d.text}</p>}
        {d.analysis && <ThemeChips themes={d.analysis.themes} />}
      </div>
      {open && (
        <>
          {editing ? (
            <>
              <textarea className="post-input" value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
              <p className="muted small">編集しても報酬は再付与されません（分類のみ更新）</p>
              <div className="row-btns">
                <button className="ghost-btn" onClick={() => { setDraft(d.text); setEditing(false); }}>キャンセル</button>
                <button className="primary-btn" onClick={() => { onEdit(d.id, draft); setEditing(false); }}>保存</button>
              </div>
            </>
          ) : (
            <button className="link-btn" onClick={() => setEditing(true)}>編集する</button>
          )}
          {d.events && d.events.length > 0 && (
            <div className="sub-card"><LogList events={d.events} /></div>
          )}
          {logs.map((l) => (
            <div key={l.id} className="sub-card">
              <RunSummary log={l} />
              <LogList events={l.events} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
