import { ZenSandEffect } from './ZenSandEffect.js';
import { EyeEffect } from './EyeEffect.js';
import { SpriteLightningEffect } from './SpriteLightningEffect.js';
import { LightningEffect } from './LightningEffect.js';
import { IllustrationTrailEffect } from './IllustrationTrailEffect.js';
import { StarFieldEffect } from './StarFieldEffect.js';
import { StarTrailEffect } from './StarTrailEffect.js';
import { RippleEffect } from './RippleEffect.js';
// 新しいエフェクトはここに1行追加するだけで切替メニューに載る
export const effects = [
    { id: 'zensand', title: '禅の砂紋', create: () => new ZenSandEffect() },
    { id: 'eye', title: 'マウス追従の眼', create: () => new EyeEffect() },
    { id: 'redsprite', title: '高層雷（スプライト）', create: () => new SpriteLightningEffect() },
    { id: 'lightning', title: '雷（落雷）', create: () => new LightningEffect() },
    { id: 'illustration', title: 'イラスト回転トレイル', create: () => new IllustrationTrailEffect() },
    { id: 'starfield', title: '星景（3D / Bloom）', create: () => new StarFieldEffect() },
    { id: 'startrail', title: '星の軌跡（2D）', create: () => new StarTrailEffect() },
    { id: 'ripple', title: '水面リップル', create: () => new RippleEffect() },
];
