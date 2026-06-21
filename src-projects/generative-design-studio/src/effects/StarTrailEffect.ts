import type { Effect, EffectContext, Pointer, ControlPane } from '../engine/types';

interface Star {
  r: number;
  theta: number;
  px: number;  // 前フレームの画面X
  py: number;  // 前フレームの画面Y
  base: number;
  size: number;
  big: boolean;
  col: [number, number, number];
  phase: number;
  tw: number;
}

type Mode = 'accumulate' | 'trails';

/**
 * 星の軌跡（日周運動）。
 * - accumulate: 露出蓄積。フェードを小さくして長く太い同心円を描く（参考写真の見た目）。
 * - trails: 周回＋短い尾。
 * 全星が同じ角速度で極を周回する剛体回転。Canvas2D 実装。
 */
export class StarTrailEffect implements Effect {
  readonly id = 'startrail';
  readonly title = '星の軌跡';
  readonly contextType = '2d' as const;

  params = {
    mode: 'accumulate' as Mode,
    speed: 0.12,   // 角速度 rad/秒
    count: 1800,
    trail: 0.85,   // 0(短い)〜1(長い)
    poleX: 0.72,
    poleY: 0.58,
    twinkle: true,
  };

  private ctx!: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private stars: Star[] = [];
  private pole = { x: 0, y: 0 };
  private readonly BG = '8,11,24';

  init(c: EffectContext): void {
    const ctx = c.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
  }

  resize(c: EffectContext): void {
    this.W = c.width;
    this.H = c.height;
    this.dpr = c.dpr;
    this.updatePole();
    this.makeStars();
    this.clear();
  }

  private fadeAlpha(): number {
    const t = this.params.trail;
    if (this.params.mode === 'accumulate') {
      // 長いほど消えにくく＝弧が長く育ち、ほぼ完全な円になる
      return 0.01 * Math.pow(0.0002 / 0.01, t);
    }
    return 0.12 * Math.pow(0.004 / 0.12, t);
  }

  private updatePole(): void {
    this.pole.x = this.params.poleX * this.W;
    this.pole.y = this.params.poleY * this.H;
  }

  private maxRadius(): number {
    const corners: [number, number][] = [
      [0, 0], [this.W, 0], [0, this.H], [this.W, this.H],
    ];
    let m = 0;
    for (const [cx, cy] of corners) {
      m = Math.max(m, Math.hypot(cx - this.pole.x, cy - this.pole.y));
    }
    return m;
  }

  private makeStars(): void {
    const stars: Star[] = [];
    const maxR = this.maxRadius();
    for (let i = 0; i < this.params.count; i++) {
      const r = maxR * Math.sqrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const bright = Math.pow(Math.random(), 2.0);
      const big = bright > 0.93;
      const size = (big ? (1.4 + Math.random() * 1.4) : (0.5 + Math.random() * 0.9)) * this.dpr;
      const c = Math.random();
      const col: [number, number, number] =
        c < 0.62 ? [255, 255, 255]
          : c < 0.82 ? [175, 200, 255]   // 青白
          : c < 0.93 ? [255, 236, 205]   // 暖色
          : [255, 205, 180];             // やや赤
      const px = this.pole.x + r * Math.cos(theta);
      const py = this.pole.y + r * Math.sin(theta);
      stars.push({
        r, theta, px, py,
        base: 0.38 + bright * 0.62,
        size, big, col,
        phase: Math.random() * Math.PI * 2,
        tw: 0.5 + Math.random() * 2.2,
      });
    }
    this.stars = stars;
  }

  /** リセット/リサイズ時の塗りつぶし（中心やや明・周辺暗のビネット） */
  private clear(): void {
    const ctx = this.ctx;
    const cx = this.W / 2;
    const cy = this.H / 2;
    const rad = Math.hypot(cx, cy);
    const g = ctx.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
    g.addColorStop(0, '#080b18');
    g.addColorStop(1, '#02030a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  /** 毎フレームのフェード塗り。周辺ほど速く暗く落としてビネットを作る */
  private fadeFill(): void {
    const ctx = this.ctx;
    const a = this.fadeAlpha();
    const cx = this.W / 2;
    const cy = this.H / 2;
    const rad = Math.hypot(cx, cy);
    const g = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    g.addColorStop(0, `rgba(${this.BG},${a})`);
    g.addColorStop(1, `rgba(2,3,10,${Math.min(1, a * 2.4)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  frame(timeMs: number, dt: number): void {
    const ctx = this.ctx;
    this.fadeFill();

    // 星は加算合成で描く（本物の露光のように軌跡が光をためて明るくなる）
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    const dtheta = this.params.speed * dt;
    for (const s of this.stars) {
      s.theta += dtheta;
      const x = this.pole.x + s.r * Math.cos(s.theta);
      const y = this.pole.y + s.r * Math.sin(s.theta);

      let a = s.base;
      if (this.params.twinkle) a *= 0.8 + 0.2 * Math.sin((timeMs / 1000) * s.tw + s.phase);
      const [cr, cg, cb] = s.col;

      // 前フレーム位置→現在位置を線分で描く＝速度に依らず連続した弧になる
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${a})`;
      ctx.lineWidth = (s.big ? 1.9 : 1.0) * this.dpr;
      ctx.beginPath();
      ctx.moveTo(s.px, s.py);
      ctx.lineTo(x, y);
      ctx.stroke();

      // 明るい星は先頭にグロー＋シャープな白い芯
      if (s.big) {
        const gr = s.size * 2.4;
        const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
        g.addColorStop(0.5, `rgba(${cr},${cg},${cb},${a * 0.3})`);
        g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, gr, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, a)})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.8, s.size * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }

      s.px = x;
      s.py = y;
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  pointer(p: Pointer): void {
    // クリック（またはドラッグ）で極を移動
    this.params.poleX = Math.min(1, Math.max(0, p.x));
    this.params.poleY = Math.min(1, Math.max(0, 1 - p.y)); // p.y は下→上なので戻す
    this.updatePole();
    this.makeStars();
    this.clear();
  }

  reset(): void {
    this.makeStars();
    this.clear();
  }

  buildControls(pane: ControlPane): void {
    pane.addBinding(this.params, 'mode', {
      label: 'モード',
      options: { '露出蓄積（円を描く）': 'accumulate', '周回＋尾': 'trails' },
    }).on('change', () => this.clear());
    pane.addBinding(this.params, 'speed', { min: 0.01, max: 0.5, step: 0.01, label: '回転速度' });
    pane.addBinding(this.params, 'count', { min: 200, max: 3000, step: 50, label: '星の数' })
      .on('change', () => this.makeStars());
    pane.addBinding(this.params, 'trail', { min: 0, max: 1, step: 0.01, label: '軌跡の長さ' });
    pane.addBinding(this.params, 'poleX', { min: 0, max: 1, step: 0.01, label: '極 X' })
      .on('change', () => { this.updatePole(); this.makeStars(); this.clear(); });
    pane.addBinding(this.params, 'poleY', { min: 0, max: 1, step: 0.01, label: '極 Y' })
      .on('change', () => { this.updatePole(); this.makeStars(); this.clear(); });
    pane.addBinding(this.params, 'twinkle', { label: 'きらめき' });
  }
}
