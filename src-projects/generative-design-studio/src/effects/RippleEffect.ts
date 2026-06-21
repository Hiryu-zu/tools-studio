import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Effect, EffectContext, Pointer, ControlPane } from '../engine/types';

interface Drop { x: number; y: number; strength: number; radius: number; }

const SIM_VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// 波シミュレーション更新（half-float: x=高さ, y=速度 を生値で保持）
const SIM_UPDATE = `
  precision highp float;
  uniform sampler2D uPrev;
  uniform vec2 uTexel;
  uniform float uAspect;
  uniform float uDamping;
  uniform vec2 uDropCenter;
  uniform float uDropRadius;
  uniform float uDropStrength;
  varying vec2 vUv;
  void main(){
    vec2 info = texture2D(uPrev, vUv).xy;
    vec2 dx = vec2(uTexel.x, 0.0);
    vec2 dy = vec2(0.0, uTexel.y);
    vec2 dxy = uTexel;
    vec2 dxy2 = vec2(uTexel.x, -uTexel.y);
    float avg =
      ( texture2D(uPrev, vUv-dx).x + texture2D(uPrev, vUv+dx).x
      + texture2D(uPrev, vUv-dy).x + texture2D(uPrev, vUv+dy).x ) * 0.2 +
      ( texture2D(uPrev, vUv+dxy).x + texture2D(uPrev, vUv-dxy).x
      + texture2D(uPrev, vUv+dxy2).x + texture2D(uPrev, vUv-dxy2).x ) * 0.05;
    info.y += (avg - info.x) * 2.0;
    info.y *= uDamping;
    info.x += info.y;
    if (uDropStrength > 0.0) {
      vec2 d = vUv - uDropCenter;
      d.x *= uAspect;
      float dist = length(d);
      float drop = max(0.0, 1.0 - dist / uDropRadius);
      drop = 0.5 - cos(drop * 3.14159265) * 0.5;
      info.x += drop * uDropStrength;
    }
    info = clamp(info, -1.0, 1.0);
    gl_FragColor = vec4(info, 0.0, 1.0);
  }
`;

// 表示: 波の勾配で背景を屈折＋ティント＋スペキュラ＋星形きらめき
const RENDER_FRAG = `
  precision highp float;
  uniform sampler2D uRipple;
  uniform sampler2D uBg;
  uniform vec2 uTexel;
  uniform float uRefraction;
  uniform float uTime;
  uniform vec2 uBgScale;
  uniform vec2 uBgOffset;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }

  void main(){
    vec2 dx = vec2(uTexel.x, 0.0);
    vec2 dy = vec2(0.0, uTexel.y);
    float hL = texture2D(uRipple, vUv-dx).x;
    float hR = texture2D(uRipple, vUv+dx).x;
    float hD = texture2D(uRipple, vUv-dy).x;
    float hU = texture2D(uRipple, vUv+dy).x;
    float h  = texture2D(uRipple, vUv).x;

    vec2 grad = vec2(hR-hL, hU-hD);
    float gradMag = length(grad);

    vec2 uv = clamp(vUv + grad * uRefraction, 0.0, 1.0);
    vec2 bgUv = uv * uBgScale + uBgOffset;
    vec3 color = texture2D(uBg, bgUv).rgb;

    // 透明感: 薄い水色ティント（写真は濃いので明度の持ち上げは控えめ）
    vec3 waterTint = vec3(0.62, 0.86, 0.96);
    color = mix(color, color * waterTint + waterTint * 0.06, 0.14);

    // スペキュラ（後段Bloomで発光する）
    vec3 normal = normalize(vec3(-grad * 3.0, 1.0));
    vec3 lightDir = normalize(vec3(-0.35, 0.45, 0.85));
    float spec = pow(max(dot(normal, lightDir), 0.0), 80.0);
    color += spec * vec3(1.0, 1.0, 0.98) * 1.1;

    // 星形(十字)のきらめき: 波の起伏が大きい所に時間で明滅
    float sparkle = 0.0;
    {
      float aspect = uTexel.y / uTexel.x;
      float density = 70.0;
      vec2 sUv = vec2(vUv.x * aspect, vUv.y);
      vec2 gv = sUv * density;
      vec2 cellId = floor(gv);
      vec2 cellUv = fract(gv) - 0.5;
      float tphase = floor(uTime * 3.0);
      float on = step(0.90, hash(cellId + tphase * 1.7));
      vec2 jitter = (vec2(hash(cellId + 2.3), hash(cellId + 5.1)) - 0.5) * 0.5;
      vec2 p = cellUv - jitter;
      float twPhase = hash(cellId) * 6.2831853;
      float pulse = 0.5 + 0.5 * sin(uTime * 7.0 + twPhase);
      float core = 1.0 - smoothstep(0.0, 0.05, length(p));
      float vray = (1.0 - smoothstep(0.0, 0.018, abs(p.x))) * (1.0 - smoothstep(0.04, 0.45, abs(p.y)));
      float hray = (1.0 - smoothstep(0.0, 0.018, abs(p.y))) * (1.0 - smoothstep(0.04, 0.45, abs(p.x)));
      float glint = core + (vray + hray) * 0.55;
      sparkle = on * glint * pulse * smoothstep(0.012, 0.07, gradMag);
    }
    color += sparkle * 1.7;

    color *= 1.0 - clamp(-h, 0.0, 1.0) * 0.18;
    color += clamp(h, 0.0, 1.0) * 0.05;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * 水面リップル（Three.js + Bloom）。
 * 半精度フロートのピンポン波シミュで滑らかな波紋、写真背景を屈折させ、
 * 星形きらめき＋スペキュラを UnrealBloom で発光させて konmari 風の質感に。
 * 背景: public/water-bg.jpg
 */
export class RippleEffect implements Effect {
  readonly id = 'ripple';
  readonly title = '水面リップル';
  readonly contextType = 'webgl' as const;

  params = {
    refraction: 0.06,
    damping: 0.985,
    bloom: 0.6,
    exposure: 0.9,
    autoRipple: true,
  };

  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;

  private simScene!: THREE.Scene;
  private simCamera!: THREE.OrthographicCamera;
  private simQuad!: THREE.Mesh;
  private updateMat!: THREE.ShaderMaterial;

  private mainScene!: THREE.Scene;
  private mainCamera!: THREE.OrthographicCamera;
  private renderMat!: THREE.ShaderMaterial;

  private rtA!: THREE.WebGLRenderTarget;
  private rtB!: THREE.WebGLRenderTarget;
  private simW = 0;
  private simH = 0;
  private cw = 0;
  private ch = 0;

  private bgAspect = 0;
  private pending: Drop[] = [];
  private lastPointer: [number, number] | null = null;
  private lastAuto = 0;
  private disposables: { dispose: () => void }[] = [];

  init(c: EffectContext): void {
    const renderer = new THREE.WebGLRenderer({ canvas: c.canvas, antialias: true });
    renderer.setClearColor(0x0b1622, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.params.exposure;
    this.renderer = renderer;

    this.cw = c.width;
    this.ch = c.height;

    // --- sim ---
    this.simScene = new THREE.Scene();
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.updateMat = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uDamping: { value: this.params.damping },
        uDropCenter: { value: new THREE.Vector2(-1, -1) },
        uDropRadius: { value: 0.05 },
        uDropStrength: { value: 0 },
      },
      vertexShader: SIM_VERT,
      fragmentShader: SIM_UPDATE,
      depthTest: false,
      depthWrite: false,
    });
    this.disposables.push(this.updateMat);
    const simGeo = new THREE.PlaneGeometry(2, 2);
    this.disposables.push(simGeo);
    this.simQuad = new THREE.Mesh(simGeo, this.updateMat);
    this.simScene.add(this.simQuad);

    // --- main (display) ---
    this.mainScene = new THREE.Scene();
    this.mainCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const loader = new THREE.TextureLoader();
    const bgTex = loader.load('water-bg.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      if (t.image) {
        this.bgAspect = t.image.width / t.image.height;
        this.fitBackground();
      }
    });
    this.disposables.push(bgTex);

    this.renderMat = new THREE.ShaderMaterial({
      uniforms: {
        uRipple: { value: null },
        uBg: { value: bgTex },
        uTexel: { value: new THREE.Vector2() },
        uRefraction: { value: this.params.refraction },
        uTime: { value: 0 },
        uBgScale: { value: new THREE.Vector2(1, 1) },
        uBgOffset: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: SIM_VERT,
      fragmentShader: RENDER_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.disposables.push(this.renderMat);
    const mainGeo = new THREE.PlaneGeometry(2, 2);
    this.disposables.push(mainGeo);
    this.mainScene.add(new THREE.Mesh(mainGeo, this.renderMat));

    // --- post ---
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(this.mainScene, this.mainCamera));
    // 背景写真が明るいので閾値は高め＝きらめき/スペキュラ(>1)だけ発光させ白飛びを防ぐ
    const bloom = new UnrealBloomPass(new THREE.Vector2(c.width, c.height), this.params.bloom, 0.45, 0.9);
    composer.addPass(bloom);
    this.bloom = bloom;
    composer.addPass(new OutputPass());
    this.composer = composer;

    this.initSimTargets();
    this.resize(c);
  }

  private initSimTargets(): void {
    const maxDim = 512;
    const aspect = this.cw / this.ch;
    if (aspect >= 1) { this.simW = maxDim; this.simH = Math.max(2, Math.round(maxDim / aspect)); }
    else { this.simH = maxDim; this.simW = Math.max(2, Math.round(maxDim * aspect)); }

    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    };
    if (this.rtA) this.rtA.dispose();
    if (this.rtB) this.rtB.dispose();
    this.rtA = new THREE.WebGLRenderTarget(this.simW, this.simH, opts);
    this.rtB = new THREE.WebGLRenderTarget(this.simW, this.simH, opts);

    // クリア（静水）
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rtA);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.setRenderTarget(this.rtB);
    this.renderer.clear();
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(0x0b1622, 1);

    this.updateMat.uniforms.uTexel.value.set(1 / this.simW, 1 / this.simH);
    this.updateMat.uniforms.uAspect.value = this.simW / this.simH;
    this.renderMat.uniforms.uTexel.value.set(1 / this.simW, 1 / this.simH);
  }

  private fitBackground(): void {
    if (!this.bgAspect) return;
    const canvasAspect = this.cw / this.ch;
    let sx = 1, sy = 1, ox = 0, oy = 0;
    if (canvasAspect > this.bgAspect) {
      sx = this.bgAspect / canvasAspect; ox = (1 - sx) / 2;
    } else {
      sy = canvasAspect / this.bgAspect; oy = (1 - sy) / 2;
    }
    this.renderMat.uniforms.uBgScale.value.set(sx, sy);
    this.renderMat.uniforms.uBgOffset.value.set(ox, oy);
  }

  resize(c: EffectContext): void {
    this.cw = c.width;
    this.ch = c.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, true);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloom.setSize(window.innerWidth, window.innerHeight);
    this.initSimTargets();
    this.fitBackground();
  }

  private addDrop(x: number, y: number, strength: number, radius: number): void {
    this.pending.push({ x, y, strength, radius });
    if (this.pending.length > 8) this.pending.shift();
  }

  frame(timeMs: number, _dt: number): void {
    if (this.params.autoRipple && timeMs - this.lastAuto > 2200) {
      this.lastAuto = timeMs;
      this.addDrop(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7,
        0.5 + Math.random() * 0.3, 0.05 + Math.random() * 0.04);
    }

    const drop = this.pending.length ? this.pending[this.pending.length - 1] : null;

    // --- sim update pass ---
    this.updateMat.uniforms.uPrev.value = this.rtA.texture;
    this.updateMat.uniforms.uDamping.value = this.params.damping;
    if (drop) {
      this.updateMat.uniforms.uDropCenter.value.set(drop.x, drop.y);
      this.updateMat.uniforms.uDropRadius.value = drop.radius;
      this.updateMat.uniforms.uDropStrength.value = drop.strength;
    } else {
      this.updateMat.uniforms.uDropStrength.value = 0;
    }
    this.renderer.setRenderTarget(this.rtB);
    this.renderer.render(this.simScene, this.simCamera);
    this.renderer.setRenderTarget(null);

    const tmp = this.rtA; this.rtA = this.rtB; this.rtB = tmp; // swap

    // --- display via composer (+bloom) ---
    this.renderMat.uniforms.uRipple.value = this.rtA.texture;
    this.renderMat.uniforms.uRefraction.value = this.params.refraction;
    this.renderMat.uniforms.uTime.value = timeMs / 1000;
    this.renderer.toneMappingExposure = this.params.exposure;
    this.bloom.strength = this.params.bloom;
    this.composer.render();

    this.pending.length = 0;
  }

  pointer(p: Pointer): void {
    if (p.down) {
      this.addDrop(p.x, p.y, 0.9, 0.07);
      this.lastPointer = [p.x, p.y];
      return;
    }
    if (this.lastPointer) {
      const dx = p.x - this.lastPointer[0];
      const dy = p.y - this.lastPointer[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      const strength = Math.min(0.5, 0.1 + dist * 4.0);
      this.addDrop(p.x, p.y, strength, 0.045);
    }
    this.lastPointer = [p.x, p.y];
  }

  reset(): void {
    this.initSimTargets();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    if (this.rtA) this.rtA.dispose();
    if (this.rtB) this.rtB.dispose();
    this.renderer.dispose();
  }

  buildControls(pane: ControlPane): void {
    pane.addBinding(this.params, 'refraction', { min: 0, max: 0.15, step: 0.005, label: '屈折' });
    pane.addBinding(this.params, 'damping', { min: 0.9, max: 0.999, step: 0.001, label: '減衰' });
    pane.addBinding(this.params, 'bloom', { min: 0, max: 2, step: 0.05, label: '輝き' });
    pane.addBinding(this.params, 'exposure', { min: 0.3, max: 2, step: 0.05, label: '露出' });
    pane.addBinding(this.params, 'autoRipple', { label: '自動波紋' });
  }
}
