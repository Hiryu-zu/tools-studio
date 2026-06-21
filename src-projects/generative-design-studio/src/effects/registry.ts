import type { EffectEntry } from '../engine/types';
import { ZenSandEffect } from './ZenSandEffect';
import { EyeEffect } from './EyeEffect';
import { SpriteLightningEffect } from './SpriteLightningEffect';
import { LightningEffect } from './LightningEffect';
import { IllustrationTrailEffect } from './IllustrationTrailEffect';
import { StarFieldEffect } from './StarFieldEffect';
import { StarTrailEffect } from './StarTrailEffect';
import { RippleEffect } from './RippleEffect';

// 新しいエフェクトはここに1行追加するだけで切替メニューに載る
export const effects: EffectEntry[] = [
  { id: 'zensand', title: '禅の砂紋', create: () => new ZenSandEffect() },
  { id: 'eye', title: 'マウス追従の眼', create: () => new EyeEffect() },
  { id: 'redsprite', title: '高層雷（スプライト）', create: () => new SpriteLightningEffect() },
  { id: 'lightning', title: '雷（落雷）', create: () => new LightningEffect() },
  { id: 'illustration', title: 'イラスト回転トレイル', create: () => new IllustrationTrailEffect() },
  { id: 'starfield', title: '星景（3D / Bloom）', create: () => new StarFieldEffect() },
  { id: 'startrail', title: '星の軌跡（2D）', create: () => new StarTrailEffect() },
  { id: 'ripple', title: '水面リップル', create: () => new RippleEffect() },
];
