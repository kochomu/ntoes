import { useState } from 'react';
import type { DiaryEntry, GameState, PostColor } from '../game/types';
import { POST_COLORS } from '../game/types';
import { LogList, RunSummary, ThemeChips, formatDate } from './common';

interface Props {
  state: GameState;
  onEdit: (id: string, text: string) => void;
  onColor: (id: string, color: PostColor | undefined) => void;
  onColorLabel: (color: PostColor, label: string) => void;
}

const DEFAULT_COLOR_LABEL: Record<PostColor, string> = { red: '赤', yellow: '黄', green: '緑', blue: '青', purple: '紫' };
/** タップで 無色 → 赤 → 黄 → 緑 → 青 → 紫 → 無色 と切り替わる */
const nextColor = (c?: PostColor): PostColor | undefined => {
  if (!c) return POST_COLORS[0];
  const i = POST_COLORS.indexOf(c);
  return i === POST_COLORS.length - 1 ? undefined : POST_COLORS[i + 1];
};

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function History({ state, onEdit, onColor, onColorLabel }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PostColor | 'dream' | 'all'>('all');
  const list = [...state.diaries]
    .filter((d) => !query || d.text.toLowerCase().includes(query.toLowerCase()))
    .filter((d) => filter === 'all' || (filter === 'dream' ? d.kind === 'dream' : d.color === filter))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = new Map<string, DiaryEntry[]>();
  for (const d of list) groups.set(d.date, [...(groups.get(d.date) ?? []), d]);

  return (
    <div className="screen">
      <input className="search" placeholder="投稿を検索" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="color-filter" role="group" aria-label="色で絞り込み">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>すべて</button>
        {POST_COLORS.map((c) => (
          <button key={c} className={`dot c-${c} ${filter === c ? 'on' : ''}`} onClick={() => setFilter(filter === c ? 'all' : c)} onContextMenu={(e) => { e.preventDefault(); const label = window.prompt('色タブの名前', state.colorLabels?.[c] ?? DEFAULT_COLOR_LABEL[c]); if (label?.trim()) onColorLabel(c, label); }} aria-label={`${state.colorLabels?.[c] ?? DEFAULT_COLOR_LABEL[c]}のメモ（右クリックで名前変更）`} title="右クリックで名前変更">
            {state.colorLabels?.[c] ?? DEFAULT_COLOR_LABEL[c]} {state.diaries.filter((d) => d.color === c).length || ''}
          </button>
        ))}
        <button onClick={() => { const color = window.prompt(`変更する色を選ぶ番号：\n${POST_COLORS.map((c, i) => `${i + 1}: ${state.colorLabels?.[c] ?? DEFAULT_COLOR_LABEL[c]}`).join('\n')}`); const c = POST_COLORS[Number(color) - 1]; if (c) { const label = window.prompt('新しい名前', state.colorLabels?.[c] ?? DEFAULT_COLOR_LABEL[c]); if (label?.trim()) onColorLabel(c, label); } }}>名前変更</button>
        <button className={filter === 'dream' ? 'on' : ''} onClick={() => setFilter(filter === 'dream' ? 'all' : 'dream')}>夢</button>
      </div>
      <p className="muted small hint">左の丸をタップすると色が変わります。色ごとにメモを振り分けられます。</p>
      {list.length === 0 && <p className="muted center">投稿はまだありません。</p>}
      {[...groups.entries()].map(([date, entries]) => (
        <section key={date}>
          <h3 className="date-head">{formatDate(date)} ・ {entries.length}件</h3>
          <div className="card post-group">
            {entries.map((d) => (
              <PostItem key={d.id} d={d} state={state} open={openId === d.id} toggle={() => setOpenId(openId === d.id ? null : d.id)} onEdit={onEdit} onColor={onColor} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PostItem({ d, state, open, toggle, onEdit, onColor }: { d: DiaryEntry; state: GameState; open: boolean; toggle: () => void; onEdit: Props['onEdit']; onColor: Props['onColor'] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.text);
  const logs = d.logIds.map((id) => state.logs.find((l) => l.id === id)).filter((l) => !!l);
  return (
    <div className={`post-item ${d.color ? `c-${d.color}` : ''} ${d.kind === 'dream' ? 'is-dream' : ''}`}>
      <button
        className={`color-dot ${d.color ? `c-${d.color}` : ''}`}
        onClick={() => onColor(d.id, nextColor(d.color))}
        aria-label={d.color ? `色：${state.colorLabels?.[d.color] ?? DEFAULT_COLOR_LABEL[d.color]}（タップで変更）` : '色をつける'}
      />
      <div className="post-body">
      <div onClick={toggle}>
        <div className="post-meta">
          {d.kind === 'dream' && <span className="dream-badge">夢</span>}
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
    </div>
  );
}
