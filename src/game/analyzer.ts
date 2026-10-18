// 投稿のローカル簡易分類（キーワード＋簡易文脈判定）。外部送信なし。
// 分類結果は装備・ダンジョンの「傾向」にしか使わないので、精度が低くてもゲームは成立する。
// 将来 AI 分析に差し替える場合も Analysis 型を返せばゲーム側は変更不要。
import type { Analysis, Mood, Theme } from './types';
import { THEMES } from './types';

export const THEME_KEYWORDS: Record<Theme, string[]> = {
  learning: ['勉強', '読書', '本を読', '本読', '学習', '学ん', '学び', '覚え', '講義', '授業', '資格', '試験', '復習', '予習', '英語', '論文', '読ん', '読み終', '検証', '研究', '調べ', 'fx', '投資', 'トレード', '相場', 'チャート', '株', '戦略', 'インプット'],
  development: ['開発', 'プログラ', 'コード', 'コーディング', '実装', 'バグ', 'デバッグ', 'アプリ', 'github', 'git', 'リリース', 'デプロイ', '設計', '技術', '作った', '創作', '制作', 'ゲーム作', 'ai', '個人開発', 'ai開発', 'chatgpt', 'claude', 'プロンプト', '自動化', 'ツール', 'サービス'],
  work: ['仕事', '業務', '会議', 'ミーティング', '打ち合わせ', '出社', '残業', '資料', '作業', 'タスク', '上司', '取引先', '会社', '報告', 'メール'],
  challenge: ['挑戦', '初めて', 'はじめて', '頑張', 'がんば', '努力', '目標', 'チャレンジ', '粘', 'やり遂げ', '達成', '踏み出', 'やってみ', '始め', 'スタート', '決めた', '継続'],
  failure: ['失敗', '反省', 'ミス', '後悔', '挫折', 'やらかし', '怒られ', '落ち込', 'うまくいかな', '上手くいかな', 'ダメだった', '悔し'],
  discovery: ['発見', '気づ', '気付', 'わかった', '分かった', '新しい', '知った', '驚', 'なるほど', 'ひらめ', '面白い発見', 'アイデア', 'アイディア', '思いつ', '閃', 'ふと', '面白い'],
  exercise: ['運動', 'ジム', '筋トレ', 'ランニング', '走っ', '散歩', 'ウォーキング', 'ヨガ', '泳', 'ストレッチ', '自転車', '歩い', 'サッカー', 'テニス'],
  social: ['友達', '友人', '家族', '会った', '話した', '飲み会', 'ランチ', '電話', '彼女', '彼氏', '同僚', '一緒に', '遊んだ', '相談'],
  travel: ['旅行', '外出', '出かけ', '出掛け', '観光', '遠出', 'ドライブ', '散策', '電車で', 'カフェ', '旅', '温泉', '山に', '海に'],
  hobby: ['趣味', 'ゲーム', '映画', 'アニメ', '漫画', 'マンガ', '音楽', 'ライブ', '料理', '絵を', 'イラスト', 'カメラ', '写真', '釣り', '読みたい', '観た', '見た', 'youtube', '推し'],
  rest: ['休み', '休息', '休憩', '寝た', '昼寝', 'のんびり', 'ゆっくり', 'リラックス', 'ごろごろ', 'ダラダラ', 'だらだら', '癒', 'お風呂', '休日', '何もしたくない', 'やる気が出ない', 'だるい', '眠い', 'ねむい', '疲れた', 'まったり'],
};

const NEGATED = /(なかった|れなかった|できず|出来ず|しなかった|せず|ませんでした|ず終い|そびれ|サボ)/;
const PLANNED = /(明日|あした|来週|今度|そのうち|いつか|予定|つもり|したい|やりたい|たい[。！!]?$|しよう|やろう|するぞ|頑張りたい)/;
const PAST = /(た[。！!]?$|だ[。！!]?$|ました|できた|でした)/;

const POSITIVE = ['楽しい', '楽しかった', '嬉しい', 'うれしい', '良かった', 'よかった', '最高', '満足', '幸せ', 'できた', '面白', 'ワクワク', 'すっきり'];
const NEGATIVE = ['辛い', 'つらい', '悲しい', '最悪', '嫌', 'イライラ', '不安', '落ち込', 'しんどい', 'ダメ'];
const TIRED = ['疲れ', 'ねむい', '眠い', 'だるい', 'へとへと', 'クタクタ'];
const MOTIVATED = ['やる気', '頑張', 'がんば', '燃え', 'やるぞ', '目標', '挑戦'];

function countHits(text: string, words: string[]) {
  return words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SentenceStatus = 'done' | 'negated' | 'planned';
export function sentenceStatus(s: string): SentenceStatus {
  if (NEGATED.test(s)) return 'negated';
  if (PLANNED.test(s) && !(PAST.test(s) && !/(明日|あした|来週|今度|予定|つもり)/.test(s))) return 'planned';
  return 'done';
}

export function analyzeDiary(text: string): Analysis {
  const lower = text.toLowerCase();
  const scores: Record<Theme, number> = Object.fromEntries(THEMES.map((t) => [t, 0])) as Record<Theme, number>;
  const planned = new Set<Theme>();

  for (const sentence of splitSentences(lower)) {
    const status = sentenceStatus(sentence);
    for (const theme of THEMES) {
      const hits = countHits(sentence, THEME_KEYWORDS[theme]);
      if (!hits) continue;
      if (status === 'done') scores[theme] += hits;
      else if (status === 'planned') {
        // 予定・願望は「実施した」とは数えないが、興味の傾向として弱めに反映する
        planned.add(theme);
        scores[theme] += hits * 0.4;
        scores.challenge += 0.2;
      } else {
        // やれなかったことは「反省」として扱う
        scores.failure += 0.5;
      }
    }
  }

  const themes = THEMES.filter((t) => scores[t] > 0)
    .map((t) => ({ type: t, weight: Math.round((1 - Math.exp(-scores[t] * 0.8)) * 100) / 100 }))
    .filter((t) => t.weight >= 0.2)
    .sort((a, b) => b.weight - a.weight);

  const pos = countHits(lower, POSITIVE);
  const neg = countHits(lower, NEGATIVE);
  const tired = countHits(lower, TIRED);
  const mot = countHits(lower, MOTIVATED);
  let mood: Mood = 'neutral';
  const max = Math.max(pos, neg, tired, mot);
  if (max > 0) {
    if (mot === max) mood = 'motivated';
    else if (pos === max) mood = 'positive';
    else if (tired === max) mood = 'tired';
    else mood = 'negative';
  }

  const w = (t: Theme) => themes.find((x) => x.type === t)?.weight ?? 0;
  return {
    themes,
    planned: [...planned],
    mood,
    challenge: w('challenge') >= 0.3,
    discovery: w('discovery') >= 0.3,
    method: 'local',
  };
}

export const MOOD_LABEL: Record<Mood, string> = {
  motivated: 'やる気',
  positive: '上機嫌',
  neutral: 'ふつう',
  tired: 'おつかれ',
  negative: 'もやもや',
};
