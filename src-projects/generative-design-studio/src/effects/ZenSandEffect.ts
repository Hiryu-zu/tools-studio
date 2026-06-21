import * as THREE from 'three';
import type { Effect, EffectContext, Pointer, ControlPane } from '../engine/types';

/**
 * 禅の砂紋（枯山水のレーキ模様）。
 * 石の周りに同心円の砂紋が広がり、砂の起伏に陰影をつけて立体感を出す。
 * クリックで石を配置（最大8個）。複数の石の波紋が自然に合流する。
 */
export class ZenSandEffect implements Effect {
  readonly id = 'zensand';
  readonly title = '禅の砂紋';
  readonly contextType = 'webgl' as const;

  params = {
    spacing: 0.03,  // 線の間隔
    relief: 0.6,    // 起伏の強さ
    grain: 0.04,    // 砂の粒
    rockR: 0.05,    // 石の大きさ
  };

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private mat!: THREE.ShaderMaterial;

  private rocks: THREE.Vector2[] = [];
  private rockCount = 0;
  private writeIdx = 0;
  private aspect = 1;
  private disposables: { dispose: () => void }[] = [];

  init(c: EffectContext): void {
    const renderer = new THREE.WebGLRenderer({ canvas: c.canvas, antialias: true });
    renderer.setClearColor(0x111111, 1);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.aspect = c.width / c.height;

    for (let i = 0; i < 8; i++) this.rocks.push(new THREE.Vector2(0, 0));
    const defaults: [number, number][] = [
      [-0.35, 0.12], [0.18, -0.08], [0.5, 0.22], [-0.05, -0.25],
    ];
    for (let i = 0; i < defaults.length; i++) this.rocks[i].set(defaults[i][0], defaults[i][1]);
    this.rockCount = defaults.length;
    this.writeIdx = defaults.length % 8;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uAspect: { value: this.aspect },
        uSpacing: { value: this.params.spacing },
        uRelief: { value: this.params.relief },
        uGrain: { value: this.params.grain },
        uRockR: { value: this.params.rockR },
        uRocks: { value: this.rocks },
        uRockCount: { value: this.rockCount },
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uAspect, uSpacing, uRelief, uGrain, uRockR;
        uniform vec2 uRocks[8];
        uniform int uRockCount;
        varying vec2 vUv;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }

        void main(){
          vec2 p = vUv - 0.5;
          p.x *= uAspect;

          // 最も近い石（の縁）までの距離と、その石の位置
          float minD = 1e9;
          vec2 nearest = vec2(0.0);
          for(int i=0;i<8;i++){
            if(i>=uRockCount) break;
            vec2 r = uRocks[i];
            float d = length(p - r) - uRockR;
            if(d < minD){ minD = d; nearest = r; }
          }
          float field = minD;

          float phase = field / uSpacing * 6.2831853;
          float hgt = sin(phase);

          // 起伏の陰影（溝の断面を斜面とみなしてライティング）
          vec2 fdir = normalize(p - nearest + vec2(1e-5));
          float slope = cos(phase) * (6.2831853/uSpacing) * uRelief * 0.015;
          vec3 nrm = normalize(vec3(-fdir.x*slope, -fdir.y*slope, 1.0));
          vec3 L = normalize(vec3(-0.6, 0.7, 0.85));
          float diff = clamp(dot(nrm, L), 0.0, 1.0);

          vec3 sand = vec3(0.82, 0.76, 0.62);
          sand *= 0.5 + 0.62*diff;
          sand *= 0.88 + 0.12*smoothstep(-1.0, 1.0, hgt); // 谷を少し暗く

          // 砂の粒
          float g = hash(floor((p + vec2(13.0)) * 1100.0));
          sand += (g - 0.5) * uGrain;

          // 石
          for(int i=0;i<8;i++){
            if(i>=uRockCount) break;
            vec2 r = uRocks[i];
            float dr = length(p - r);
            float aa = fwidth(dr)*1.5;
            // 石の影
            float shadow = smoothstep(uRockR*1.7, uRockR, dr) * (1.0 - smoothstep(uRockR, uRockR-aa, dr));
            sand = mix(sand, sand*0.55, shadow*0.7);
            // 石本体
            float m = 1.0 - smoothstep(uRockR-aa, uRockR+aa, dr);
            vec2 sn = (p - r)/uRockR;
            vec3 stone = vec3(0.27,0.26,0.25) * (0.8 + 0.5*(-sn.y*0.6 - sn.x*0.25));
            stone = clamp(stone, 0.05, 0.55);
            sand = mix(sand, stone, m);
          }

          gl_FragColor = vec4(sand, 1.0);
        }
      `,
    });
    this.mat.extensions = { derivatives: true } as unknown as THREE.ShaderMaterial['extensions'];
    this.disposables.push(this.mat);

    const geo = new THREE.PlaneGeometry(2, 2);
    this.disposables.push(geo);
    this.scene.add(new THREE.Mesh(geo, this.mat));

    this.resize(c);
  }

  resize(c: EffectContext): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, true);
    this.aspect = window.innerWidth / window.innerHeight;
    this.mat.uniforms.uAspect.value = this.aspect;
  }

  frame(): void {
    const u = this.mat.uniforms;
    u.uSpacing.value = this.params.spacing;
    u.uRelief.value = this.params.relief;
    u.uGrain.value = this.params.grain;
    u.uRockR.value = this.params.rockR;
    u.uRockCount.value = this.rockCount;
    this.renderer.render(this.scene, this.camera);
  }

  pointer(p: Pointer): void {
    if (p.phase !== 'down') return;
    const x = (p.x - 0.5) * this.aspect;
    const y = p.y - 0.5;
    this.rocks[this.writeIdx].set(x, y);
    this.writeIdx = (this.writeIdx + 1) % 8;
    this.rockCount = Math.min(8, this.rockCount + 1);
  }

  reset(): void {
    const defaults: [number, number][] = [
      [-0.35, 0.12], [0.18, -0.08], [0.5, 0.22], [-0.05, -0.25],
    ];
    for (let i = 0; i < defaults.length; i++) this.rocks[i].set(defaults[i][0], defaults[i][1]);
    this.rockCount = defaults.length;
    this.writeIdx = defaults.length % 8;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.renderer.dispose();
  }

  buildControls(pane: ControlPane): void {
    pane.addBinding(this.params, 'spacing', { min: 0.012, max: 0.08, step: 0.002, label: '線の間隔' });
    pane.addBinding(this.params, 'relief', { min: 0, max: 2, step: 0.05, label: '起伏' });
    pane.addBinding(this.params, 'grain', { min: 0, max: 0.12, step: 0.005, label: '砂の粒' });
    pane.addBinding(this.params, 'rockR', { min: 0.02, max: 0.12, step: 0.005, label: '石の大きさ' });
  }
}
