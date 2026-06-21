import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Effect, EffectContext, Pointer, ControlPane } from '../engine/types';

/**
 * 高層雷（スプライト／赤い妖精）。
 * 嵐の上空に現れる大規模放電。上部は赤く拡散、下へクラゲ状の触手が垂れ、
 * 先端は紫〜青へ。下の親雷フラッシュに続いて上空に出現し、ふわっと消える。
 * 加算発光＋UnrealBloom で幽玄に。
 */
export class SpriteLightningEffect implements Effect {
  readonly id = 'redsprite';
  readonly title = '高層雷（スプライト）';
  readonly contextType = 'webgl' as const;

  params = {
    autoEvery: 2.6,
    columns: 5,
    thickness: 9,
    bloom: 0.6,
    exposure: 1.0,
    auto: true,
  };

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;

  private lineMat!: THREE.LineBasicMaterial;
  private lines!: THREE.LineSegments;
  private glowMat!: THREE.PointsMaterial;
  private glow!: THREE.Points;
  private flashMat!: THREE.MeshBasicMaterial;

  private aspect = 1;
  private strikeTime = -10;
  private nextAuto = 1.2;
  private readonly yTop = 0.78;
  private disposables: { dispose: () => void }[] = [];

  init(c: EffectContext): void {
    const renderer = new THREE.WebGLRenderer({ canvas: c.canvas, antialias: true });
    renderer.setClearColor(0x03040a, 1); // 深い夜
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.params.exposure;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.aspect = c.width / c.height;
    this.camera = new THREE.OrthographicCamera(-this.aspect, this.aspect, 1, -1, 0, 10);
    this.camera.position.z = 1;

    const softTex = this.makeSoftTexture();
    this.disposables.push(softTex);

    // 夜空の淡い星
    this.scene.add(this.makeStars(softTex));

    // 下の雲のフラッシュ（親雷）
    const flashGeo = new THREE.PlaneGeometry(1, 1);
    this.disposables.push(flashGeo);
    this.flashMat = new THREE.MeshBasicMaterial({
      map: softTex, color: 0xff8866, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    });
    this.disposables.push(this.flashMat);
    const flash = new THREE.Mesh(flashGeo, this.flashMat);
    flash.scale.set(this.aspect * 2.4, 0.9, 1);
    flash.position.set(0, -1.0, -0.5);
    this.scene.add(flash);

    // スプライト本体: 芯ライン
    this.lineMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    });
    this.disposables.push(this.lineMat);
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.lineMat);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);

    // 発光ボディ
    this.glowMat = new THREE.PointsMaterial({
      map: softTex, vertexColors: true, size: this.params.thickness, sizeAttenuation: false,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    });
    this.disposables.push(this.glowMat);
    this.glow = new THREE.Points(new THREE.BufferGeometry(), this.glowMat);
    this.glow.frustumCulled = false;
    this.scene.add(this.glow);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // 赤い妖精は淡い。閾値高め＋強さ控えめにして白飛びと背景の発光を防ぐ
    const bloom = new UnrealBloomPass(new THREE.Vector2(c.width, c.height), this.params.bloom, 0.7, 0.45);
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
    g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private makeStars(tex: THREE.Texture): THREE.Points {
    const n = 400;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * this.aspect;
      pos[i * 3 + 1] = Math.random() * 2 - 1;
      pos[i * 3 + 2] = -0.3;
      const b = 0.15 + Math.random() * 0.35;
      col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b * 1.1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.disposables.push(geo);
    const mat = new THREE.PointsMaterial({
      map: tex, vertexColors: true, size: 3, sizeAttenuation: false,
      transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    });
    this.disposables.push(mat);
    return new THREE.Points(geo, mat);
  }

  private colorAt(y: number): [number, number, number] {
    const t = Math.min(1, Math.max(0, (this.yTop - y) / 0.9)); // 0=上, 1=下
    let r: number, g: number, b: number;
    if (t < 0.5) { const k = t / 0.5; r = 1.0; g = 0.22 + 0.12 * k; b = 0.3 + 0.4 * k; }
    else { const k = (t - 0.5) / 0.5; r = 1.0 - 0.5 * k; g = 0.34 + 0.06 * k; b = 0.7 + 0.3 * k; }
    const bright = 1.0 - 0.45 * t;
    return [r * bright, g * bright, b * bright];
  }

  private trigger(cx: number): void {
    const lpos: number[] = [], lcol: number[] = [];
    const gpos: number[] = [], gcol: number[] = [];

    const addSeg = (x0: number, y0: number, x1: number, y1: number, gB: number) => {
      const c0 = this.colorAt(y0), c1 = this.colorAt(y1);
      lpos.push(x0, y0, 0, x1, y1, 0);
      lcol.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2]);
      const sub = 1;
      for (let s = 0; s <= sub; s++) {
        const t = s / sub;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const c = this.colorAt(y);
        gpos.push(x, y, 0);
        gcol.push(c[0] * gB, c[1] * gB, c[2] * gB);
      }
    };

    const branch = (x0: number, y0: number, ang: number, length: number, depth: number) => {
      const steps = Math.max(5, Math.floor(length * 50));
      let x = x0, y = y0, px = x0, py = y0;
      const stepLen = length / steps;
      for (let i = 0; i < steps; i++) {
        const a = ang + (Math.random() - 0.5) * 0.6;
        x += Math.cos(a) * stepLen; y += Math.sin(a) * stepLen;
        addSeg(px, py, x, y, 0.4);
        px = x; py = y;
        if (depth > 0 && Math.random() < 0.12) {
          const ca = ang + (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.6);
          branch(x, y, ca, length * (0.4 + Math.random() * 0.3), depth - 1);
        }
      }
    };

    const cols = this.params.columns;
    for (let i = 0; i < cols; i++) {
      const colx = cx + (Math.random() - 0.5) * 0.55;
      branch(colx, this.yTop - Math.random() * 0.1, -Math.PI / 2, 0.6 + Math.random() * 0.35, 3);
      if (Math.random() < 0.6) branch(colx, this.yTop, Math.PI / 2, 0.05 + Math.random() * 0.08, 1); // 冠(上向き)
    }

    // ハロー（上部の淡い赤い輪）
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = 0.18 + Math.random() * 0.28;
      const x = cx + Math.cos(a) * rr;
      const y = this.yTop + 0.04 + Math.sin(a) * 0.07;
      gpos.push(x, y, 0);
      gcol.push(0.16, 0.03, 0.05);
    }

    const lg = this.lines.geometry;
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lcol, 3));
    lg.computeBoundingSphere();
    const gg = this.glow.geometry;
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
    gg.computeBoundingSphere();

    this.strikeTime = performance.now() / 1000;
  }

  resize(c: EffectContext): void {
    this.aspect = window.innerWidth / window.innerHeight;
    this.camera.left = -this.aspect; this.camera.right = this.aspect;
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
      this.trigger((Math.random() * 2 - 1) * this.aspect * 0.5);
      this.nextAuto = t + this.params.autoEvery * (0.6 + Math.random() * 0.8);
    }

    const age = t - this.strikeTime;
    // スプライトは幽玄: 立ち上がり速く、ふわっと長めに減衰(~0.7s)
    const env = Math.max(0, 1 - age / 0.7);
    const soft = 0.78 + 0.22 * Math.sin(age * 45);
    const intensity = env * soft;
    this.lineMat.opacity = Math.max(0, intensity * 0.5);
    this.glowMat.opacity = Math.max(0, intensity * 0.6);
    this.glowMat.size = this.params.thickness;
    // 親雷フラッシュは一瞬(出現直後)
    this.flashMat.opacity = Math.max(0, Math.max(0, 1 - age / 0.18) * 0.35);

    this.renderer.toneMappingExposure = this.params.exposure;
    this.bloom.strength = this.params.bloom;
    this.composer.render();
  }

  pointer(p: Pointer): void {
    if (!p.down) return;
    this.trigger((p.x * 2 - 1) * this.aspect);
  }

  reset(): void {
    this.strikeTime = -10;
    this.lineMat.opacity = 0;
    this.glowMat.opacity = 0;
    this.flashMat.opacity = 0;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.glow.geometry.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.renderer.dispose();
  }

  buildControls(pane: ControlPane): void {
    pane.addBinding(this.params, 'auto', { label: '自動発生' });
    pane.addBinding(this.params, 'autoEvery', { min: 0.5, max: 6, step: 0.1, label: '発生間隔(秒)' });
    pane.addBinding(this.params, 'columns', { min: 1, max: 12, step: 1, label: '柱の数' });
    pane.addBinding(this.params, 'thickness', { min: 4, max: 30, step: 1, label: '太さ' });
    pane.addBinding(this.params, 'bloom', { min: 0, max: 2.5, step: 0.05, label: '輝き' });
    pane.addBinding(this.params, 'exposure', { min: 0.3, max: 2, step: 0.05, label: '露出' });
  }
}
