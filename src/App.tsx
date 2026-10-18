import { useCallback, useEffect, useRef, useState } from 'react';
import { IDLE } from './game/config';
import { createInitialState, editDiary, settleIdle, submitPost } from './game/engine';
import { createRng, randomSeed } from './game/rng';
import type { GameState, IdleReport } from './game/types';
import { loadState, requestPersistence, saveState } from './storage/store';
import { Equipment } from './ui/Equipment';
import { History } from './ui/History';
import { Home } from './ui/Home';
import { Logs } from './ui/Logs';
import { PixelSprite } from './ui/PixelSprite';
import { ReportView, todayStr } from './ui/common';

const TABS = [
  { id: 'home', label: 'ホーム', icon: 'hero' },
  { id: 'history', label: '投稿', icon: 'icon_tome' },
  { id: 'equip', label: '装備', icon: 'icon_sword' },
  { id: 'logs', label: '記録', icon: 'icon_hourglass' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** 結果画面に出すほどの出来事があったか */
const worthShowing = (r: IdleReport | null): r is IdleReport =>
  !!r && r.seconds >= IDLE.reportMinSeconds && (r.floorsCleared > 0 || r.itemIds.length > 0);

export default function App() {
  const [state, setState] = useState<GameState>(loadState);
  const [tab, setTab] = useState<Tab>('home');
  const [saveError, setSaveError] = useState(false);
  const [report, setReport] = useState<IdleReport | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 経過時間ぶん探索を精算する（起動時・復帰時・定期）
  const settle = useCallback((showReport: boolean) => {
    const r = settleIdle(stateRef.current, new Date());
    if (r.state === stateRef.current) return;
    stateRef.current = r.state;
    setState(r.state);
    if (showReport && worthShowing(r.report)) setReport(r.report);
  }, []);

  useEffect(() => {
    settle(true);
    requestPersistence();
    const onVisible = () => document.visibilityState === 'visible' && settle(true);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => document.visibilityState === 'visible' && settle(false), IDLE.liveTickMs);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [settle]);

  useEffect(() => {
    setSaveError(!saveState(state));
  }, [state]);

  const goto = (t: string) => {
    setTab(t as Tab);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">LIFE DUNGEON</span>
      </header>
      {saveError && <div className="warn">保存に失敗しました。容量不足の可能性があります。バックアップを書き出してください。</div>}
      <main>
        {tab === 'home' && (
          <Home
            state={state}
            goto={goto}
            onPost={(text) => {
              const now = new Date();
              // 投稿前にそれまでの放置分を精算してから投稿を処理する
              const settled = settleIdle(stateRef.current, now).state;
              const r = submitPost(settled, { text, date: todayStr(now), now }, createRng(randomSeed()));
              stateRef.current = r.state;
              setState(r.state);
              return r;
            }}
          />
        )}
        {tab === 'history' && <History state={state} onEdit={(id, text) => setState(editDiary(state, id, text))} />}
        {tab === 'equip' && <Equipment state={state} />}
        {tab === 'logs' && (
          <Logs
            state={state}
            onReplace={(s) => setState(s)}
            onReset={() => {
              const s = settleIdle(createInitialState(), new Date()).state;
              setState(s);
            }}
          />
        )}
      </main>
      {report && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setReport(null)}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <ReportView report={report} items={state.items} onClose={() => setReport(null)} />
          </div>
        </div>
      )}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => goto(t.id)}>
            <PixelSprite name={t.icon} scale={t.icon === 'hero' ? 1.6 : 2} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
