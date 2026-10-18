import { memo } from 'react';
import { SPRITES, type SpriteDef } from './sprites';

interface Props {
  name: string;
  /** 動的に組み立てたドット絵（主人公の装備反映など） */
  sprite?: SpriteDef;
  /** 1ドットあたりのpx */
  scale?: number;
  className?: string;
  /** 未発見表示（影のみ） */
  silhouette?: boolean;
  flip?: boolean;
  title?: string;
}

/** 文字列グリッドのドット絵を SVG で描画（横方向の同色ランを1矩形にまとめる） */
export const PixelSprite = memo(function PixelSprite({ name, sprite, scale = 4, className, silhouette, flip, title }: Props) {
  const sp = sprite ?? SPRITES[name];
  if (!sp) return null;
  const h = sp.rows.length;
  const w = sp.rows[0].length;
  const rects: JSX.Element[] = [];
  sp.rows.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const ch = row[x];
      let len = 1;
      while (x + len < w && row[x + len] === ch) len++;
      if (ch !== '.') {
        rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={len} height={1} fill={silhouette ? '#000' : sp.palette[ch]} />);
      }
      x += len;
    }
  });
  return (
    <svg
      className={className}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{ transform: flip ? 'scaleX(-1)' : undefined, opacity: silhouette ? 0.35 : 1 }}
      role="img"
      aria-label={title ?? name}
    >
      {rects}
    </svg>
  );
});
