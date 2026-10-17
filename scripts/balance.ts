// バランス確認用：N日分の日記を自動投稿して成長曲線を出力する
import { createInitialState, submitDiary, currentBuild } from '../src/game/engine';
import { createRng } from '../src/game/rng';
import { powerRating } from '../src/game/stats';
const texts = ['今日は勉強した。', '仕事でミスした。反省。明日は頑張りたい。'.repeat(3), '開発でアプリを作った。新しい発見があった。'.repeat(6), '散歩した', '友達とランチ。楽しかった。'.repeat(15)];
const seeds = Number(process.argv[2] ?? 3);
for (let s = 0; s < seeds; s++) {
  let st = createInitialState();
  const rng = createRng(s + 7);
  const row: string[] = [];
  for (let day = 1; day <= 120; day++) {
    const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
    const r = submitDiary(st, { text: texts[Math.floor(rng.next() * texts.length)], date }, rng);
    st = r.state;
    if ([1, 3, 7, 14, 30, 60, 90, 120].includes(day)) row.push(`d${day}:Lv${st.character.level}/F${r.log!.floorReached}/best${st.character.bestFloor}/P${powerRating(currentBuild(st))}`);
  }
  console.log(row.join('  '));
  console.log('  items', Object.keys(st.items).length, 'leg', Object.values(st.items).filter(i=>i.rarity==='legendary').length, 'syn', currentBuild(st).synergies.map(x=>x.tag+x.count).join(','));
}
