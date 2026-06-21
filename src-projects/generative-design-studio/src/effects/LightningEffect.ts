import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Effect, EffectContext, Pointer, ControlPane } from '../engine/types';

type Pt = [number, number];

/**
 * 雷（落雷）。ミッドポイント変位でギザギザの稲妻＋枝を生成し、
 * 加算発光ライン＋UnrealBloomで放電らしく光らせる。
 * クリックでその場所へ落雷、合間に自動落雷、落雷時は画面がフラッシュ。
 */
export class LightningEffect implements Effect {
  readonly id = 'lightning';
  readonly title = '雷（落雷）';
  readonly contextType = 'webgl' as const;

  params = {
    autoEvery: 1.6,   // 自動落雷の平均間隔(秒)
    branches: 7,      // 枝の本数
    jagged: 0.6,      // ギザギザの強さ
    bloom: 1.5,       // 輝き
    thickness: 9,     // 発光ボディの太さ(px)
    exposure: 1.0,
    auto: true,
  };

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;

  private boltMat!: THREE.LineBasicMaterial;
  private bolt!: THREE.LineSegments;
  private glowMat!: THREE.PointsMaterial;
  private glow!: THREE.Points;
  private flashMat!: THREE.MeshBasicMaterial;

  private aspect = 1;
  private strikeTime = -10;
  private nextAuto = 1;
  private disposables: { dispose: () => void }[] = [];

  init(c: EffectContext): void {
    const renderer = new THREE.WebGLRenderer({ canvas: c.canvas, antialias: true });
    renderer.setClearColor(0x05070d, 1); // 暗い嵐の空
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.params.exposure;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.aspect = c.width / c.height;
    this.camera = new THREE.OrthographicCamera(-this.aspect, this.aspect, 1, -1, 0, 10);
    this.camera.position.z = 1;

    // 稲妻ライン（加算・頂点カラー）
    this.boltMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.disposables.push(this.boltMat);
    this.bolt = new THREE.LineSegments(new THREE.BufferGeometry(), this.boltMat);
    this.bolt.frustumCulled = false;
    this.scene.add(this.bolt);

    // 発光ボディ: 経路に沿ったソフトスプライトのポイント列で“太い光の筋”を作る
    const softTex = this.makeSoftTexture();
    this.disposables.push(softTex);
    this.glowMat = new THREE.PointsMaterial({
      map: softTex,
      vertexColors: true,
      size: this.params.thickness,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.disposables.push(this.glowMat);
    this.glow = new THREE.Points(new THREE.BufferGeometry(), this.glowMat);
    this.glow.frustumCulled = false;
    this.scene.add(this.glow);

    // 落雷フラッシュ（全画面の淡い発光）
    const flashGeo = new THREE.PlaneGeometry(2, 2);
    this.disposables.push(flashGeo);
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0x9fc0ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    });
    this.disposables.push(this.flashMat);
    const flash = new THREE.Mesh(flashGeo, this.flashMat);
    flash.scale.set(this.aspect * 2, 2, 1);
    flash.position.z = -0.5;
    flash.renderOrder = -1;
    this.scene.add(flash);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(c.width, c.height), this.params.bloom, 0.85, 0.25);
    composer.addPass(bloom);
    this.bloom = bloom;
    composer.addPass(new OutputPass());
    this.composer = composer;

    this.resize(c);
  }

  private makeSoftTexture(): THREE.Texture {
    const s = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const x = cv.getContext('2d')!;
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---- 稲妻生成 ----
  private midpointPath(a: Pt, b: Pt, displace: number, levels: number): Pt[] {
    let pts: Pt[] = [a, b];
    let disp = displace;
    for (let i = 0; i < levels; i++) {
      const np: Pt[] = [];
      for (let j = 0; j < pts.length - 1; j++) {
        const [x1, y1] = pts[j];
        const [x2, y2] = pts[j + 1];
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        let dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len, py = dx / len; // 垂直方向
        const off = (Math.random() * 2 - 1) * disp;
        np.push([x1, y1]);
        np.push([mx + px * off, my + py * off]);
      }
      np.push(pts[pts.length - 1]);
      pts = np;
      disp *= 0.5;
    }
    return pts;
  }

  private strike(targetX: number, targetY: number): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const gpos: number[] = []; // 発光ボディ(ポイント)
    const gcol: number[] = [];
    const COL: [number, number, number] = [0.85, 0.93, 1.0]; // 白青

    const pushPath = (path: Pt[], lineB: number, glowB: number) => {
      // 芯のライン
      for (let i = 0; i < path.length - 1; i++) {
        positions.push(path[i][0], path[i][1], 0, path[i + 1][0], path[i + 1][1], 0);
        for (let k = 0; k < 2; k++) colors.push(COL[0] * lineB, COL[1] * lineB, COL[2] * lineB);
        // 発光ボディ: 各セグメントを細かく分割して隙間なく光らせる
        const sub = 4;
        for (let s = 0; s < sub; s++) {
          const t = s / sub;
          const px = path[i][0] + (path[i + 1][0] - path[i][0]) * t;
          const py = path[i][1] + (path[i + 1][1] - path[i][1]) * t;
          gpos.push(px, py, 0);
          gcol.push(COL[0] * glowB, COL[1] * glowB, COL[2] * glowB);
        }
      }
      const last = path[path.length - 1];
      gpos.push(last[0], last[1], 0);
      gcol.push(COL[0] * glowB, COL[1] * glowB, COL[2] * glowB);
    };

    // 本線: 画面上端からターゲットへ
    const start: Pt = [targetX + (Math.random() - 0.5) * 0.5, 1.05];
    const end: Pt = [targetX, targetY];
    const main = this.midpointPath(start, end, this.params.jagged * 0.45, 6);
    pushPath(main, 3.0, 1.7);

    // 枝
    for (let k = 0; k < this.params.branches; k++) {
      const idx = 2 + Math.floor(Math.random() * (main.length - 4));
      const [sx, sy] = main[idx];
      const [nx, ny] = main[Math.min(idx + 1, main.length - 1)];
      let dx = nx - sx, dy = ny - sy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const ang = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
      const blen = (0.2 + Math.random() * 0.4) * 1.2;
      const ex = sx + Math.cos(ang) * blen;
      const ey = sy + Math.sin(ang) * blen;
      const bpath = this.midpointPath([sx, sy], [ex, ey], this.params.jagged * 0.25, 4);
      pushPath(bpath, 1.6, 0.9);
    }

    const geo = this.bolt.geometry;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeBoundingSphere();

    const gg = this.glow.geometry;
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
    gg.computeBoundingSphere();

    this.strikeTime = performance.now() / 1000;
  }

  resize(c: EffectContext): void {
    this.aspect = window.innerWidth / window.innerHeight;
    this.camera.left = -this.aspect;
    this.camera.right = this.aspect;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, true);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloom.setSize(window.innerWidth, window.innerHeight);
  }

  frame(timeMs: number, _dt: number): void {
    const t = timeMs / 1000;

    if (this.params.auto && t > this.nextAuto) {
      const tx = (Math.random() * 2 - 1) * this.aspect * 0.75;
      const ty = -1 + Math.random() * 0.5;
      this.strike(tx, ty);
      this.nextAuto = t + this.params.autoEvery * (0.5 + Math.random());
    }

    // 稲妻の明滅＋減衰（寿命 ~0.45s、複数回フリッカー）
    const age = t - this.strikeTime;
    const env = Math.max(0, 1 - age / 0.45);
    const flick = 0.7 + 0.3 * Math.sin(age * 70);
    const intensity = env * flick;
    this.boltMat.opacity = Math.max(0, intensity);
    this.glowMat.opacity = Math.max(0, intensity * 0.9);
    this.glowMat.size = this.params.thickness;
    this.flashMat.opacity = Math.max(0, env * env * 0.4);

    this.renderer.toneMappingExposure = this.params.exposure;
    this.bloom.strength = this.params.bloom;
    this.composer.render();
  }

  pointer(p: Pointer): void {
    if (!p.down) return;
    const tx = (p.x * 2 - 1) * this.aspect;
    const ty = p.y * 2 - 1;
    this.strike(tx, ty);
  }

  reset(): void {
    this.strikeTime = -10;
    this.boltMat.opacity = 0;
    this.glowMat.opacity = 0;
    this.flashMat.opacity = 0;
  }

  dispose(): void {
    this.bolt.geometry.dispose();
    this.glow.geometry.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.renderer.dispose();
  }

  buildControls(pane: ControlPane): void {
    pane.addBinding(this.params, 'auto', { label: '自動落雷' });
    pane.addBinding(this.params, 'autoEvery', { min: 0.3, max: 4, step: 0.1, label: '落雷間隔(秒)' });
    pane.addBinding(this.params, 'branches', { min: 0, max: 20, step: 1, label: '枝の多さ' });
    pane.addBinding(this.params, 'jagged', { min: 0.1, max: 1.5, step: 0.05, label: 'ギザギザ' });
    pane.addBinding(this.params, 'thickness', { min: 2, max: 24, step: 1, label: '太さ' });
    pane.addBinding(this.params, 'bloom', { min: 0, max: 2.5, step: 0.05, label: '輝き' });
    pane.addBinding(this.params, 'exposure', { min: 0.3, max: 2, step: 0.05, label: '露出' });
  }
}
