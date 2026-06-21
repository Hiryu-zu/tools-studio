import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Effect, EffectContext, ControlPane } from '../engine/types';

/**
 * 星景（Three.js / WebGL）。
 * 3D空間の加算パーティクル星を天の極軸まわりに回転させ、
 * Afterimage で軌跡、UnrealBloom で光の滲み、トーンマッピングで階調、
 * 星雲スプライトで色と神秘性、カメラ微動で遠近感を出す。
 */
export class StarFieldEffect implements Effect {
  readonly id = 'starfield';
  readonly title = '星景（3D / Bloom）';
  readonly contextType = 'webgl' as const;

  params = {
    speed: 0.06,     // 回転 rad/秒
    trail: 0.993,    // Afterimage の damp（大きいほど軌跡が長い）
    bloom: 0.7,      // 輝きの強さ
    exposure: 0.85,  // 露出
    spread: 0.85,    // 近=速い / 遠=遅い の差の強さ（0で全シェル同速）
    colorful: 0.6,   // 虹色の星の割合（0=白のみ, 1=ほぼ虹色）
    drift: false,    // カメラ微動（遠近感）。軌跡を綺麗に出すため既定オフ
  };

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private afterimage!: AfterimagePass;
  private bloom!: UnrealBloomPass;
  private starGroup!: THREE.Group;
  private shells: THREE.Points[] = [];
  private shellMul: number[] = [];
  private starTex!: THREE.Texture;
  private readonly shellCfg = [
    { rMin: 220, rMax: 420, size: 4.4, count: 1100, mul: 2.4 },
    { rMin: 420, rMax: 640, size: 3.4, count: 1700, mul: 1.7 },
    { rMin: 640, rMax: 880, size: 2.8, count: 2200, mul: 1.2 },
    { rMin: 880, rMax: 1150, size: 2.3, count: 2500, mul: 0.85 },
    { rMin: 1150, rMax: 1500, size: 1.9, count: 2600, mul: 0.55 },
  ];
  private axis = new THREE.Vector3(0.62, 0.12, -0.78).normalize();
  private lookTarget = new THREE.Vector3(0, 0, -1000);
  private disposables: { dispose: () => void }[] = [];

  init(c: EffectContext): void {
    const renderer = new THREE.WebGLRenderer({ canvas: c.canvas, antialias: true });
    renderer.setClearColor(0x010410, 1); // 暗く青い夜
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.params.exposure;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010410, 0.00012);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(70, c.width / c.height, 0.1, 4000);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(this.lookTarget);

    const group = new THREE.Group();
    scene.add(group);
    this.starGroup = group;

    const starTex = this.makeSoftTexture(64, 'rgba(255,255,255,1)');
    this.disposables.push(starTex);
    this.starTex = starTex;

    // 距離シェルごとに星を作る（近=大きく速い / 遠=小さく遅い）
    this.buildStars();

    // 星雲（大きな加算スプライトの淡い発光で色と神秘性）
    this.addNebula(starTex);

    // ---- post-processing ----
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, this.camera));

    const after = new AfterimagePass();
    (after.uniforms as { damp: { value: number } }).damp.value = this.params.trail;
    composer.addPass(after);
    this.afterimage = after;

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(c.width, c.height),
      this.params.bloom, // strength
      0.6,               // radius
      0.22,              // threshold（明るい星だけ滲ませて夜を暗く保つ）
    );
    composer.addPass(bloom);
    this.bloom = bloom;

    composer.addPass(new OutputPass());
    this.composer = composer;

    this.resize(c);
  }

  private makeSoftTexture(size: number, core: string): THREE.Texture {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const x = cv.getContext('2d')!;
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, core);
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** シェル(距離帯)の星を生成。色変更時の作り直しにも使う */
  private buildStars(): void {
    for (const s of this.shells) {
      this.starGroup.remove(s);
      s.geometry.dispose();
      (s.material as THREE.Material).dispose();
    }
    this.shells = [];
    this.shellMul = [];
    for (const cfg of this.shellCfg) {
      const pts = this.buildShell(cfg.count, cfg.size, cfg.rMin, cfg.rMax, this.starTex);
      this.starGroup.add(pts);
      this.shells.push(pts);
      this.shellMul.push(cfg.mul);
    }
  }

  private buildShell(n: number, size: number, rMin: number, rMax: number, tex: THREE.Texture): THREE.Points {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const dir = this.randomDir();
      const r = rMin + Math.random() * (rMax - rMin);
      pos[i * 3] = dir.x * r;
      pos[i * 3 + 1] = dir.y * r;
      pos[i * 3 + 2] = dir.z * r;

      // 一部は白、それ以外は虹色（HSLで色相を全周に散らす）
      let b = 0.5 + Math.random() * 0.5;
      if (Math.random() < (1 - this.params.colorful)) {
        c.setRGB(1, 1, 1);
      } else {
        c.setHSL(Math.random(), 0.85, 0.62);
        b *= 1.15;
      }
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
    }
    return this.pointsFrom(pos, col, size, tex);
  }

  private pointsFrom(pos: Float32Array, col: Float32Array, size: number, tex: THREE.Texture): THREE.Points {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size,
      map: tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.disposables.push(geo, mat);
    return new THREE.Points(geo, mat);
  }

  private addNebula(tex: THREE.Texture): void {
    const colors = [0x101b40, 0x0b2a4a, 0x141436];
    for (let i = 0; i < colors.length; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: colors[i],
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const sp = new THREE.Sprite(mat);
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 2,
      ).normalize();
      sp.position.copy(dir.multiplyScalar(700));
      const s = 380 + Math.random() * 320;
      sp.scale.set(s, s, 1);
      this.disposables.push(mat);
      this.starGroup.add(sp);
    }
  }

  private randomDir(): THREE.Vector3 {
    // 球面一様
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    return new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
  }

  resize(c: EffectContext): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, true);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloom.setSize(window.innerWidth, window.innerHeight);
  }

  frame(timeMs: number, dt: number): void {
    // シェルごとに別速度で回転（近=速い/遠=遅い）。spreadで差の強さを調整
    const base = this.params.speed * dt;
    for (let i = 0; i < this.shells.length; i++) {
      const eff = 1 + (this.shellMul[i] - 1) * this.params.spread;
      this.shells[i].rotateOnAxis(this.axis, base * eff);
    }

    if (this.params.drift) {
      const t = timeMs / 1000;
      this.camera.position.set(Math.sin(t * 0.05) * 7, Math.cos(t * 0.04) * 5, 0);
      this.camera.lookAt(this.lookTarget);
    }

    this.renderer.toneMappingExposure = this.params.exposure;
    (this.afterimage.uniforms as { damp: { value: number } }).damp.value = this.params.trail;
    this.bloom.strength = this.params.bloom;

    this.composer.render();
  }

  reset(): void {
    // Afterimage バッファをクリアするため一瞬 damp を下げる
    const prev = this.params.trail;
    (this.afterimage.uniforms as { damp: { value: number } }).damp.value = 0;
    this.composer.render();
    (this.afterimage.uniforms as { damp: { value: number } }).damp.value = prev;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.renderer.dispose();
  }

  buildControls(pane: ControlPane): void {
    pane.addBinding(this.params, 'speed', { min: 0, max: 0.3, step: 0.005, label: '回転速度' });
    pane.addBinding(this.params, 'trail', { min: 0.8, max: 0.997, step: 0.001, label: '軌跡(残像)' });
    pane.addBinding(this.params, 'bloom', { min: 0, max: 2.5, step: 0.05, label: '輝き' });
    pane.addBinding(this.params, 'exposure', { min: 0.3, max: 2, step: 0.05, label: '露出' });
    pane.addBinding(this.params, 'spread', { min: 0, max: 1, step: 0.05, label: '近遠の差速' });
    pane.addBinding(this.params, 'colorful', { min: 0, max: 1, step: 0.05, label: '虹色の量' })
      .on('change', () => this.buildStars());
    pane.addBinding(this.params, 'drift', { label: 'カメラ微動' });
  }
}
