// エフェクト共通の型定義

export interface EffectContext {
  canvas: HTMLCanvasElement;
  width: number;   // 実ピクセル幅 (dpr適用後)
  height: number;  // 実ピクセル高さ (dpr適用後)
  dpr: number;
}

export interface Pointer {
  x: number;     // UV 0..1 (左→右)
  y: number;     // UV 0..1 (下→上)
  down: boolean; // pointerdown の瞬間か（既存エフェクト互換）
  phase?: 'down' | 'move' | 'up'; // 押下/移動/解放（ドラッグ判定用）
}

// Tweakpane の FolderApi は型を厳密に取り込まず any で受ける（依存を緩く保つ）
export type ControlPane = any;

export interface Effect {
  readonly id: string;
  readonly title: string;
  readonly contextType: '2d' | 'webgl';

  init(ctx: EffectContext): void;
  resize(ctx: EffectContext): void;
  frame(timeMs: number, dt: number): void;

  pointer?(p: Pointer): void;
  reset?(): void;
  dispose?(): void;
  buildControls?(pane: ControlPane): void;
}

export interface EffectEntry {
  id: string;
  title: string;
  create: () => Effect;
}
