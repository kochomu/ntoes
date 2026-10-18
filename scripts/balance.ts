// バランス確認用：1日3回アプリを開き、数回投稿する生活を N 日シミュレートする
import { createInitialState, currentBuild, settleIdle, submitPost } from '../src/game/engine';
import { createRng } from '../src/game/rng';
import { powerRating } from '../src/game/stats';
const posts = ['AIを使った個人開発が面白い。', 'FXの戦略をもう少し検証したい。', '新しいアプリのアイデアを思いついた。', '今日は何もしたくない。', 'ジムで筋トレした'];
const days = Number(process.argv[3] ?? 60);
for (let s = 0; s < Number(process.argv[2] ?? 3); s++) {
  let st = createInitialState();
  const rng = createRng(s + 11);
  const t0 = Date.UTC(2026, 0, 1, 22, 0); // 7時JST
  st = settleIdle(st, new Date(t0), rng).state;
  const row: string[] = [];
  let maxMs = 0;
  for (let day = 0; day < days; day++) {
    // 7時, 12時, 19時, 23時 に開く（夜23→翌7時は8時間放置）
    for (const h of [0, 5, 12, 16]) {
      const now = new Date(t0 + day * 86400_000 + h * 3600_000);
      const a = performance.now();
      st = settleIdle(st, now, rng).state;
      maxMs = Math.max(maxMs, performance.now() - a);
      if (h !== 16 && rng.next() < 0.8) {
        st = submitPost(st, { text: posts[Math.floor(rng.next() * posts.length)], date: now.toISOString().slice(0, 10), now }, rng).state;
      }
    }
    if ([0, 2, 6, 13, 29, 59, 89].includes(day)) row.push(`d${day + 1}:Lv${st.character.level}/best${st.character.bestFloor}/P${powerRating(currentBuild(st))}`);
  }
  const items = Object.values(st.items);

  console.log(row.join('  '));
  console.log(`  items=${items.length} rare=${items.filter((i) => i.rarity === 'rare').length} leg=${items.filter((i) => i.rarity === 'legendary').length} logs=${st.logs.length} size=${(JSON.stringify(st).length / 1024).toFixed(0)}KB maxSettle=${maxMs.toFixed(0)}ms syn=${currentBuild(st).synergies.map((x) => x.tag + x.count).join(',')}`);
}
