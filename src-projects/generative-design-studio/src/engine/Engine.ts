import type { Effect, EffectContext } from './types';

/**
 * 共通エンジン。
 * - 1つの <canvas> を保持し、エフェクト切替時に作り直す
 *   （2d と webgl はコンテキスト種別が固定されるため、切替時に新しい canvas を使う）
 * - リサイズ（devicePixelRatio 対応）
 * - ポインタ入力を UV 座標へ変換してエフェクトへ転送
 * - requestAnimationFrame ループと dt 計算
 */
export class Engine {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private effect: Effect | null = null;
  private ctxInfo: EffectContext = {
    canvas: null as unknown as HTMLCanvasElement,
    width: 0,
    height: 0,
    dpr: 1,
  };
  private raf = 0;
  private last = performance.now();
  private running = true;

  constructor(container: HTMLElement) {
    this.container = container;
    window.addEventListener('resize', () => this.handleResize());
  }

  setEffect(effect: Effect): void {
    if (this.effect?.dispose) this.effect.dispose();

    if (this.canvas) this.canvas.remove();
    const canvas = document.createElement('canvas');
    canvas.className = 'gds-canvas';
    this.container.appendChild(canvas);
    this.canvas = canvas;
    this.attachPointer(canvas);

    this.effect = effect;
    this.ctxInfo.canvas = canvas;
    this.resizeCanvas();
    effect.init(this.ctxInfo);
    effect.resize(this.ctxInfo);
  }

  private attachPointer(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointermove', (e) => this.forwardPointer(e, 'move'));
    canvas.addEventListener('pointerdown', (e) => this.forwardPointer(e, 'down'));
    canvas.addEventListener('pointerup', (e) => this.forwardPointer(e, 'up'));
    canvas.addEventListener('pointerleave', (e) => this.forwardPointer(e, 'up'));
  }

  private forwardPointer(e: PointerEvent, phase: 'down' | 'move' | 'up'): void {
    if (!this.effect?.pointer || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    // down は「押下の瞬間」のみ true（既存エフェクトの挙動を維持）
    this.effect.pointer({ x, y, down: phase === 'down', phase });
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctxInfo.width = w;
    this.ctxInfo.height = h;
    this.ctxInfo.dpr = dpr;
  }

  private handleResize(): void {
    if (!this.effect) return;
    this.resizeCanvas();
    this.effect.resize(this.ctxInfo);
  }

  start(): void {
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.running && this.effect) this.effect.frame(now, dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setRunning(v: boolean): void {
    this.running = v;
    this.last = performance.now();
  }

  reset(): void {
    this.effect?.reset?.();
  }
}
