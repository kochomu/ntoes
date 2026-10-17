import { useEffect, useState } from 'react';
import { editDiary, createInitialState, submitDiary } from './game/engine';
import { createRng, randomSeed } from './game/rng';
import type { GameState } from './game/types';
import { loadState, requestPersistence, saveState } from './storage/store';
import { Equipment } from './ui/Equipment';
import { History } from './ui/History';
import { Home } from './ui/Home';
import { Logs } from './ui/Logs';
import { PixelSprite } from './ui/PixelSprite';
import { todayStr } from './ui/common';

const TABS = [
  { id: 'home', label: 'ホーム', icon: 'hero' },
  { id: 'history', label: '日記', icon: 'icon_tome' },
  { id: 'equip', label: '装備', icon: 'icon_sword' },
  { id: 'logs', label: '記録', icon: 'icon_hourglass' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function App() {
  const [state, setState] = useState<GameState>(loadState);
  const [tab, setTab] = useState<Tab>('home');
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    setSaveError(!saveState(state));
  }, [state]);
  useEffect(() => {
    requestPersistence();
  }, []);

  const goto = (t: string) => {
    setTab(t as Tab);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">日記ダンジョン</span>
      </header>
      {saveError && <div className="warn">保存に失敗しました。容量不足の可能性があります。バックアップを書き出してください。</div>}
      <main>
        {tab === 'home' && (
          <Home
            state={state}
            goto={goto}
            onSubmit={(text) => {
              const seed = randomSeed();
              const r = submitDiary(state, { text, date: todayStr() }, createRng(seed), undefined, seed);
              setState(r.state);
              return r;
            }}
          />
        )}
        {tab === 'history' && <History state={state} onEdit={(id, text) => setState(editDiary(state, id, text))} />}
        {tab === 'equip' && <Equipment state={state} />}
        {tab === 'logs' && <Logs state={state} onReplace={setState} onReset={() => setState(createInitialState())} />}
      </main>
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
