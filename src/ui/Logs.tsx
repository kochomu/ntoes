import { useRef, useState } from 'react';
import type { GameState } from '../game/types';
import { exportJson, importJson } from '../storage/store';
import { ItemCard, LogList, RunSummary, formatTime } from './common';

interface Props {
  state: GameState;
  onReplace: (s: GameState) => void;
  onReset: () => void;
}

export function Logs({ state, onReplace, onReset }: Props) {
  const [tab, setTab] = useState<'runs' | 'records' | 'data'>('runs');
  const [openId, setOpenId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rare = Object.values(state.items)
    .filter((i) => i.rarity === 'rare' || i.rarity === 'legendary' || i.special)
    .sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt));
  const totalBosses = state.logs.reduce((s, l) => s + l.bossesDefeated, 0);

  const doExport = async () => {
    const json = exportJson(state);
    const name = `diary-rpg-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    // iPhone では共有シート（ファイルに保存 / AirDrop など）が使える
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch {
        /* キャンセル時はダウンロードにフォールバック */
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doImport = async (f: File) => {
    try {
      const s = importJson(await f.text());
      if (confirm(`日記${s.diaries.length}件のデータで上書きします。よろしいですか？`)) onReplace(s);
    } catch {
      alert('読み込みに失敗しました。バックアップファイルを確認してください。');
    }
  };

  return (
    <div className="screen">
      <div className="seg">
        <button className={tab === 'runs' ? 'on' : ''} onClick={() => setTab('runs')}>攻略記録</button>
        <button className={tab === 'records' ? 'on' : ''} onClick={() => setTab('records')}>実績</button>
        <button className={tab === 'data' ? 'on' : ''} onClick={() => setTab('data')}>データ</button>
      </div>

      {tab === 'runs' && (
        <>
          {state.logs.length === 0 && <p className="muted center">まだ冒険の記録はありません。</p>}
          {[...state.logs].reverse().slice(0, 100).map((l) => (
            <div key={l.id} className="card">
              <div onClick={() => setOpenId(openId === l.id ? null : l.id)}>
                <div className="muted small">{formatTime(l.at)}</div>
                <RunSummary log={l} />
              </div>
              {openId === l.id && <LogList events={l.events} />}
            </div>
          ))}
        </>
      )}

      {tab === 'records' && (
        <>
          <section className="card">
            <div className="status-grid">
              <div><small>最高到達</small><b>{state.character.bestFloor}階</b></div>
              <div><small>冒険回数</small><b>{state.logs.length}</b></div>
              <div><small>ボス撃破</small><b>{totalBosses}</b></div>
            </div>
          </section>
          <section className="card">
            <div className="card-title">最高記録の更新履歴</div>
            {state.records.length === 0 && <p className="muted small">まだ記録はありません。</p>}
            <ul className="record-list">
              {[...state.records].reverse().map((r) => (
                <li key={r.logId}>
                  <span className="muted small">{formatTime(r.at)}</span>
                  <span>{r.from}階 → <b>{r.to}階</b></span>
                  {r.to - r.from >= 10 && <span className="badge-record">大躍進</span>}
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <div className="card-title">レアアイテム獲得履歴</div>
            {rare.length === 0 && <p className="muted small">まだありません。</p>}
            {rare.slice(0, 50).map((it) => (
              <div key={it.id}>
                <div className="muted small">{formatTime(it.acquiredAt)}{it.source === 'boss' ? '（ボスドロップ）' : ''}</div>
                <ItemCard item={it} compact />
              </div>
            ))}
          </section>
        </>
      )}

      {tab === 'data' && (
        <section className="card">
          <div className="card-title">データ管理</div>
          <p className="small">
            日記とゲームデータはこの端末のブラウザ内だけに保存され、外部には送信されません。
            Safariのデータ消去や機種変更に備えて、定期的にバックアップを取ってください。
          </p>
          <button className="primary-btn" onClick={doExport}>バックアップを書き出す</button>
          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>バックアップから復元</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          <hr />
          <button
            className="danger-btn"
            onClick={() => {
              if (confirm('すべての日記とゲームデータを削除します。元に戻せません。本当によろしいですか？')) onReset();
            }}
          >
            データを全て削除
          </button>
          <p className="muted small">日記 {state.diaries.length}件 / アイテム {Object.keys(state.items).length}個 / 冒険 {state.logs.length}回</p>
        </section>
      )}
    </div>
  );
}
