import { useCallback, useEffect, useRef, useState } from 'react';
import { IDLE } from './game/config';
import { createInitialState, editDiary, fuseInventory, setColorLabel, setPostColor, settleIdle, submitPost } from './game/engine';
import { NPC_CHATTER_CHANCE, npcLine, type NpcTrigger } from './game/npc';
import { createRng, randomSeed } from './game/rng';
import type { GameState, IdleReport, LogEvent } from './game/types';
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

const FEED_MAX = 7;
const SAVE_INTERVAL_MS = 5000;
const uiRng = createRng(randomSeed());

export default function App() {
  const [state, setState] = useState<GameState>(loadState);
  const [tab, setTab] = useState<Tab>('home');
  const [saveError, setSaveError] = useState(false);
  const [report, setReport] = useState<IdleReport | null>(null);
  const [feed, setFeed] = useState<{ id: number; text: string }[]>([]);
  const [npc, setNpc] = useState<string | undefined>();
  const stateRef = useRef(state);
  stateRef.current = state;
  const queue = useRef<string[]>([]);
  const lineId = useRef(0);
  const npcTimer = useRef<number>();

  const say = useCallback((trigger: NpcTrigger, ctx: Parameters<typeof npcLine>[2] = {}) => {
    setNpc(npcLine(trigger, uiRng, ctx));
    window.clearTimeout(npcTimer.current);
    npcTimer.current = window.setTimeout(() => setNpc(undefined), 6500);
  }, []);

  /** 珍しい出来事にNPCが反応する */
  const react = useCallback(
    (events: LogEvent[]) => {
      if (events.some((e) => e.kind === 'item' && e.level === 'epic')) say('legendary');
      else if (events.some((e) => e.kind === 'record')) say('record');
    },
    [say],
  );

  // 経過時間ぶん探索を精算する（起動時・復帰時・定期）
  const settle = useCallback(
    (live: boolean) => {
      const combat: string[] = [];
      const r = settleIdle(stateRef.current, new Date(), undefined, { combat, eager: true });
      if (r.state === stateRef.current) return false;
      // 起動直後もログが流れるよう、放置分の最後の数行だけ見せる
      if (!live) queue.current.push(...combat.slice(-12));
      stateRef.current = r.state;
      setState(r.state);
      if (live) {
        queue.current.push(...combat);
        if (queue.current.length > 60) queue.current.splice(0, queue.current.length - 60);
        if (r.report) react(r.report.highlights);
        if (uiRng.next() < NPC_CHATTER_CHANCE) say('chatter');
      } else if (worthShowing(r.report)) {
        setReport(r.report);
        say('report');
        return true;
      }
      return false;
    },
    [react, say],
  );

  useEffect(() => {
    const shown = settle(false);
    requestPersistence();
    if (!shown) say('welcome', { hour: new Date().getHours() });
    const save = () => setSaveError(!saveState(stateRef.current));
    const onVisible = () => {
      if (document.visibilityState === 'visible') settle(false);
      else save();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', save);
    const tick = setInterval(() => document.visibilityState === 'visible' && settle(true), IDLE.liveTickMs);
    // 戦闘ログをテンポよく流す
    const feedTimer = setInterval(() => {
      const q = queue.current;
      if (!q.length) return;
      const n = q.length > 30 ? 3 : q.length > 18 ? 2 : 1;
      const lines = q.splice(0, n).map((text) => ({ id: ++lineId.current, text }));
      setFeed((f) => [...f, ...lines].slice(-FEED_MAX));
    }, IDLE.combatLineMs);
    const saver = setInterval(save, SAVE_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', save);
      clearInterval(tick);
      clearInterval(feedTimer);
      clearInterval(saver);
    };
  }, [settle, say]);

  const update = (s: GameState) => {
    stateRef.current = s;
    setState(s);
    setSaveError(!saveState(s));
  };

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
            npc={npc}
            combat={feed}
            onPost={(text, kind) => {
              const now = new Date();
              // 投稿前にそれまでの放置分を精算してから投稿を処理する
              const settled = settleIdle(stateRef.current, now).state;
              const r = submitPost(settled, { text, date: todayStr(now), now, kind }, createRng(randomSeed()));
              update(r.state);
              if (r.events.some((e) => e.kind === 'item' && e.level === 'epic' && !e.text.includes('夢'))) say('legendary');
              else say(r.entry.kind === 'dream' ? 'dream' : 'post', { theme: r.entry.analysis?.themes[0]?.type });
              return r;
            }}
          />
        )}
        {tab === 'history' && (
          <History
            state={state}
            onEdit={(id, text) => update(editDiary(state, id, text))}
            onColor={(id, color) => update(setPostColor(stateRef.current, id, color))}
            onColorLabel={(color, label) => update(setColorLabel(stateRef.current, color, label))}
          />
        )}
        {tab === 'equip' && <Equipment state={state} onFuse={() => { const result = fuseInventory(stateRef.current); if (result.items.length) { update(result.state); window.alert(`${result.consumed}個を一括合成して、装備を${result.items.length}個再抽選したぞ！\n${result.items.map((item) => `・${item.name}`).join('\n')}`); } }} />}
        {tab === 'logs' && (
          <Logs
            state={state}
            onReplace={(s) => update(s)}
            onReset={() => update(settleIdle(createInitialState(), new Date()).state)}
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
