import * as THREE from 'three';
import { EffectComposer } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/EffectComposer.js?external=three';
import { RenderPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/RenderPass.js?external=three';
import { UnrealBloomPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/UnrealBloomPass.js?external=three';
import { OutputPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/OutputPass.js?external=three';
/**
 * マウス追従の眼（両目・拡大縮小・ドラッグ移動・瞬き・反応）。
 * 瞳孔の形は 丸/スリット/星/ハート/十字 から選択。強膜に血管を描ける。
 */
export class EyeEffect {
    constructor() {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'eye'
        });
        Object.defineProperty(this, "title", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'マウス追従の眼'
        });
        Object.defineProperty(this, "contextType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'webgl'
        });
        Object.defineProperty(this, "params", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                size: 0.45,
                spacing: 0.25,
                pupil: 0.07,
                pupilColor: '#000000',
                pupilShape: 'round', // round/slit/star/heart/cross
                slitWidth: 0.02,
                irisLines: 44, // 虹彩の線の本数
                irisLineStrength: 0.35, // 虹彩の線の濃さ
                hue: 0.08,
                follow: 1.0,
                blink: true,
                blinkEvery: 3.5,
                react: 0.5,
                vessels: 0.0, // 強膜の赤い血管の量
                lashes: true, // まつ毛
                lashCount: 12, // 本数
                lashLen: 0.06, // 長さ
                lashThick: 0.012, // 太さ
                lowerLash: false, // 下まつ毛
                highlight: 1.0,
                bloom: 0.0,
                exposure: 1.0,
            }
        });
        Object.defineProperty(this, "renderer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "scene", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "camera", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "composer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bloom", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mat", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mouse", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new THREE.Vector2(0.5, 0.5)
        });
        Object.defineProperty(this, "target", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new THREE.Vector2(0.5, 0.5)
        });
        Object.defineProperty(this, "center", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new THREE.Vector2(0.5, 0.5)
        });
        Object.defineProperty(this, "pressed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "grab", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new THREE.Vector2(0, 0)
        });
        Object.defineProperty(this, "blinkAmt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "blinkProgress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: -1
        });
        Object.defineProperty(this, "blinkTimer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1.5
        });
        Object.defineProperty(this, "blinkDur", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0.16
        });
        Object.defineProperty(this, "disposables", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    init(c) {
        const renderer = new THREE.WebGLRenderer({ canvas: c.canvas, antialias: true });
        renderer.setClearColor(0x06060a, 1);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = this.params.exposure;
        this.renderer = renderer;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.mat = new THREE.ShaderMaterial({
            uniforms: {
                uAspect: { value: c.width / c.height },
                uMouse: { value: this.mouse },
                uCenter: { value: this.center },
                uIris: { value: new THREE.Color().setHSL(this.params.hue, 0.7, 0.5) },
                uScale: { value: this.params.size },
                uSpacing: { value: this.params.spacing },
                uPupil: { value: this.params.pupil },
                uPupilColor: { value: new THREE.Color(this.params.pupilColor) },
                uSlitWidth: { value: this.params.slitWidth },
                uIrisLines: { value: this.params.irisLines },
                uIrisLineStrength: { value: this.params.irisLineStrength },
                uShape: { value: 0 },
                uFollow: { value: this.params.follow },
                uHighlight: { value: this.params.highlight },
                uBlink: { value: 0 },
                uSlit: { value: 0 },
                uVessels: { value: this.params.vessels },
                uLashes: { value: 1 },
                uLashCount: { value: this.params.lashCount },
                uLashLen: { value: this.params.lashLen },
                uLashThick: { value: this.params.lashThick },
                uLowerLash: { value: 0 },
            },
            vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
            fragmentShader: `
        precision highp float;
        uniform float uAspect, uScale, uSpacing, uPupil, uFollow, uHighlight, uBlink;
        uniform float uSlit, uSlitWidth, uShape, uVessels, uIrisLines, uIrisLineStrength;
        uniform float uLashes, uLashCount, uLashLen, uLashThick, uLowerLash;
        uniform vec3 uIris, uPupilColor;
        uniform vec2 uMouse, uCenter;
        varying vec2 vUv;

        float dot2(vec2 v){ return dot(v, v); }
        // 5芒星（頂点が上向き）
        float sdStar5(vec2 p, float r, float rf){
          const vec2 k1 = vec2(0.809016994375, -0.587785252292);
          const vec2 k2 = vec2(-k1.x, k1.y);
          p.x = abs(p.x);
          p -= 2.0*max(dot(k1,p),0.0)*k1;
          p -= 2.0*max(dot(k2,p),0.0)*k2;
          p.x = abs(p.x);
          p.y -= r;
          vec2 ba = rf*vec2(-k1.y,k1.x) - vec2(0.0,1.0);
          float hh = clamp(dot(p,ba)/dot(ba,ba), 0.0, r);
          return length(p-ba*hh) * sign(p.y*ba.x - p.x*ba.y);
        }
        float sdHeart(vec2 p){
          p.x = abs(p.x);
          if(p.y+p.x > 1.0) return sqrt(dot2(p-vec2(0.25,0.75))) - sqrt(2.0)/4.0;
          return sqrt(min(dot2(p-vec2(0.0,1.0)), dot2(p-0.5*max(p.x+p.y,0.0)))) * sign(p.x-p.y);
        }

        vec4 drawEye(vec2 P, vec2 C, float scale, vec2 M, vec3 iris, float pupil, float hl, float blink){
          vec2 q = (P - C) / scale;
          float nx = q.x, ny = q.y;
          float w = 0.42;
          float tt = clamp(nx/w, -1.0, 1.0);
          float h = 0.26 * (1.0 - tt*tt);
          float aaY = fwidth(ny)*1.5, aaX = fwidth(nx)*1.5;
          float almond = (1.0 - smoothstep(h-aaY, h+aaY, abs(ny)))
                       * (1.0 - smoothstep(w-aaX, w+aaX, abs(nx)));

          float hEff = h * (1.0 - blink);
          float openMask = (1.0 - smoothstep(hEff-aaY, hEff+aaY, abs(ny)))
                         * (1.0 - smoothstep(w-aaX, w+aaX, abs(nx)));

          // まぶた（肌）
          vec3 lid = vec3(0.86, 0.80, 0.80);
          lid *= (ny > 0.0) ? 1.0 : 0.92;
          vec3 col = lid;

          // 視線（虹彩位置）
          vec2 toM = M - C; float dM = length(toM);
          vec2 dir = dM > 1e-4 ? toM/dM : vec2(0.0);
          float maxTravel = 0.13 * uFollow;
          vec2 irisC = dir * min(maxTravel, dM/scale);

          float rIris = 0.17;
          float di = length(q - irisC);
          float aaI = fwidth(di)*1.5;

          // 強膜
          vec3 sclera = vec3(0.93,0.94,0.96);
          sclera *= 0.82 + 0.18*(1.0 - abs(ny)/max(h,1e-3));
          // 血管（強膜の赤い血管。虹彩の外側ほど多い）
          {
            vec2 vp = q - irisC;
            float rr = length(vp);
            float a2 = atan(vp.y, vp.x);
            float v = sin(a2*16.0 + sin(a2*5.0)*2.5 + rr*12.0);
            v = smoothstep(0.82, 0.98, v);
            float band = smoothstep(rIris*1.05, rIris*2.2, rr);
            sclera = mix(sclera, vec3(0.72,0.12,0.12), clamp(v*band*uVessels, 0.0, 0.6));
          }

          // 虹彩
          float ang = atan(q.y-irisC.y, q.x-irisC.x);
          float fib = 0.5 + 0.5*sin(ang*uIrisLines);
          float r01 = clamp(di/rIris, 0.0, 1.0);
          vec3 irisCol = mix(iris*1.4, iris*0.5, r01);
          irisCol *= 1.0 + uIrisLineStrength * (fib - 0.5) * 2.0;
          irisCol *= mix(1.0, 0.35, smoothstep(0.82, 1.0, r01));
          float irisMask = 1.0 - smoothstep(rIris-aaI, rIris+aaI, di);

          // 瞳孔の形（0=丸,1=スリット,2=星,3=ハート,4=十字）
          vec2 pp = q - irisC;
          float pupMask;
          if (uShape < 0.5) {
            pupMask = 1.0 - smoothstep(pupil-aaI, pupil+aaI, di);
          } else if (uShape < 1.5) {
            float sw = uSlitWidth + uSlit * 0.06;
            float sh = rIris * 0.95;
            float dd = length(vec2(pp.x/sw, pp.y/sh));
            float aaS = fwidth(dd)*1.5;
            pupMask = 1.0 - smoothstep(1.0-aaS, 1.0+aaS, dd);
          } else if (uShape < 2.5) {
            float R = pupil * 1.3;
            float d = sdStar5(pp / R, 1.0, 0.45);
            float aaS = fwidth(d)*1.5;
            pupMask = 1.0 - smoothstep(-aaS, aaS, d);
          } else if (uShape < 3.5) {
            float S = pupil * 1.6;
            vec2 hp = pp / S + vec2(0.0, 0.55);
            float d = sdHeart(hp);
            float aaS = fwidth(d)*1.5;
            pupMask = 1.0 - smoothstep(-aaS, aaS, d);
          } else {
            vec2 ap = abs(pp);
            float arm = pupil*1.5, wid = pupil*0.5;
            float cx = (1.0-smoothstep(wid-aaI,wid+aaI,ap.x))*(1.0-smoothstep(arm-aaI,arm+aaI,ap.y));
            float cy = (1.0-smoothstep(wid-aaI,wid+aaI,ap.y))*(1.0-smoothstep(arm-aaI,arm+aaI,ap.x));
            pupMask = max(cx, cy);
          }

          vec3 eyeball = sclera;
          eyeball = mix(eyeball, irisCol, irisMask);
          eyeball = mix(eyeball, uPupilColor, pupMask);
          if (hl > 0.0) {
            vec2 hlp = irisC + vec2(-0.05, 0.06);
            float glint = (1.0 - smoothstep(0.0, 0.028, length(q - hlp))) * hl;
            eyeball += glint * 1.9;
          }
          // 上まぶたのキワ（アイライン）
          float liner = (1.0 - smoothstep(0.0, 0.035, h - ny)) * step(0.0, ny) * openMask * uLashes;
          eyeball = mix(eyeball, vec3(0.05,0.04,0.05), liner*0.8);
          col = mix(col, eyeball, openMask);

          // まつ毛（上まぶたの縁から外へ伸びる先細りの線）
          float lashMask = 0.0;
          if (uLashes > 0.5) {
            float spacing = (2.0*w*0.9) / uLashCount;
            float rx = floor(nx/spacing + 0.5) * spacing;
            if (abs(rx) < w*0.92) {
              float rrim = 0.26*(1.0 - (rx/w)*(rx/w));
              vec2 root = vec2(rx, rrim);
              vec2 dir = normalize(vec2(sign(rx)*0.5, 1.0));
              vec2 nrm = vec2(-dir.y, dir.x);
              vec2 f = vec2(nx, ny) - root;
              float along = dot(f, dir);
              float across = dot(f, nrm);
              float L = uLashLen * (0.7 + 0.5*abs(rx)/w);
              float halfW = uLashThick * (1.0 - clamp(along/L, 0.0, 1.0));
              float aaA = fwidth(along)*1.5, aaC = fwidth(across)*1.5;
              lashMask = (1.0 - smoothstep(L-aaA, L+aaA, along))
                       * smoothstep(-aaA, aaA, along)
                       * (1.0 - smoothstep(halfW-aaC, halfW+aaC, abs(across)));
            }
            if (uLowerLash > 0.5) {
              float spacing2 = (2.0*w*0.8) / max(3.0, uLashCount*0.6);
              float rx2 = floor(nx/spacing2 + 0.5) * spacing2;
              if (abs(rx2) < w*0.85) {
                float rrim2 = -0.26*(1.0 - (rx2/w)*(rx2/w));
                vec2 root2 = vec2(rx2, rrim2);
                vec2 dir2 = normalize(vec2(sign(rx2)*0.4, -1.0));
                vec2 nrm2 = vec2(-dir2.y, dir2.x);
                vec2 f2 = vec2(nx, ny) - root2;
                float along2 = dot(f2, dir2);
                float across2 = dot(f2, nrm2);
                float L2 = uLashLen * 0.6;
                float halfW2 = uLashThick * 0.8 * (1.0 - clamp(along2/L2, 0.0, 1.0));
                float aaA2 = fwidth(along2)*1.5, aaC2 = fwidth(across2)*1.5;
                float lm2 = (1.0 - smoothstep(L2-aaA2, L2+aaA2, along2))
                          * smoothstep(-aaA2, aaA2, along2)
                          * (1.0 - smoothstep(halfW2-aaC2, halfW2+aaC2, abs(across2)));
                lashMask = max(lashMask, lm2);
              }
            }
          }
          col = mix(col, vec3(0.03,0.03,0.04), lashMask);
          float a = max(almond, lashMask);
          return vec4(col, a);
        }

        void main(){
          float aspect = uAspect;
          vec2 P = vec2(vUv.x*aspect, vUv.y);
          vec2 C = vec2(uCenter.x*aspect, uCenter.y);
          vec2 M = vec2(uMouse.x*aspect, uMouse.y);
          float sp = uSpacing;

          vec3 col = vec3(0.04,0.04,0.06);
          vec4 eL = drawEye(P, C - vec2(sp, 0.0), uScale, M, uIris, uPupil, uHighlight, uBlink);
          col = mix(col, eL.rgb, eL.a);
          vec4 eR = drawEye(P, C + vec2(sp, 0.0), uScale, M, uIris, uPupil, uHighlight, uBlink);
          col = mix(col, eR.rgb, eR.a);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
            depthTest: false,
            depthWrite: false,
        });
        this.mat.extensions = { derivatives: true };
        this.disposables.push(this.mat);
        const geo = new THREE.PlaneGeometry(2, 2);
        this.disposables.push(geo);
        this.scene.add(new THREE.Mesh(geo, this.mat));
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(this.scene, this.camera));
        const bloom = new UnrealBloomPass(new THREE.Vector2(c.width, c.height), this.params.bloom, 0.6, 0.6);
        composer.addPass(bloom);
        this.bloom = bloom;
        composer.addPass(new OutputPass());
        this.composer = composer;
        this.resize(c);
    }
    resize(c) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(window.innerWidth, window.innerHeight, true);
        this.composer.setPixelRatio(dpr);
        this.composer.setSize(window.innerWidth, window.innerHeight);
        this.bloom.setSize(window.innerWidth, window.innerHeight);
        this.mat.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
    }
    frame(timeMs, dt) {
        this.mouse.lerp(this.target, Math.min(1, dt * 8));
        if (this.params.blink) {
            if (this.blinkProgress < 0) {
                this.blinkTimer -= dt;
                this.blinkAmt = 0;
                if (this.blinkTimer <= 0)
                    this.blinkProgress = 0;
            }
            else {
                this.blinkProgress += dt / this.blinkDur;
                if (this.blinkProgress >= 1) {
                    this.blinkProgress = -1;
                    this.blinkAmt = 0;
                    this.blinkTimer = this.params.blinkEvery * (0.6 + Math.random() * 0.9);
                }
                else {
                    this.blinkAmt = Math.sin(Math.PI * this.blinkProgress);
                }
            }
        }
        else {
            this.blinkAmt = 0;
        }
        const d = Math.hypot(this.mouse.x - this.center.x, this.mouse.y - this.center.y);
        const react = Math.max(0, 1 - d / 0.5);
        const pupilEff = this.params.pupil + this.params.react * 0.05 * react;
        const u = this.mat.uniforms;
        u.uScale.value = this.params.size;
        u.uSpacing.value = this.params.spacing;
        u.uPupil.value = pupilEff;
        u.uFollow.value = this.params.follow;
        u.uHighlight.value = this.params.highlight;
        u.uBlink.value = this.blinkAmt;
        u.uSlit.value = react;
        u.uSlitWidth.value = this.params.slitWidth;
        u.uIrisLines.value = this.params.irisLines;
        u.uIrisLineStrength.value = this.params.irisLineStrength;
        u.uPupilColor.value.set(this.params.pupilColor);
        const shapeMap = { round: 0, slit: 1, star: 2, heart: 3, cross: 4 };
        u.uShape.value = shapeMap[this.params.pupilShape] ?? 0;
        u.uVessels.value = this.params.vessels;
        u.uLashes.value = this.params.lashes ? 1 : 0;
        u.uLashCount.value = this.params.lashCount;
        u.uLashLen.value = this.params.lashLen;
        u.uLashThick.value = this.params.lashThick;
        u.uLowerLash.value = this.params.lowerLash ? 1 : 0;
        u.uIris.value.setHSL(this.params.hue, 0.7, 0.5);
        this.renderer.toneMappingExposure = this.params.exposure;
        this.bloom.strength = this.params.bloom;
        this.composer.render();
    }
    pointer(p) {
        if (p.phase === 'down') {
            this.pressed = true;
            this.grab.set(this.center.x - p.x, this.center.y - p.y);
        }
        else if (p.phase === 'up') {
            this.pressed = false;
        }
        else {
            if (this.pressed) {
                this.center.set(Math.min(1, Math.max(0, p.x + this.grab.x)), Math.min(1, Math.max(0, p.y + this.grab.y)));
            }
            else {
                this.target.set(p.x, p.y);
            }
        }
    }
    reset() {
        this.center.set(0.5, 0.5);
        this.target.set(0.5, 0.5);
        this.mouse.set(0.5, 0.5);
    }
    dispose() {
        for (const d of this.disposables)
            d.dispose();
        this.disposables = [];
        this.renderer.dispose();
    }
    buildControls(pane) {
        pane.addBinding(this.params, 'size', { min: 0.3, max: 1.6, step: 0.02, label: '大きさ' });
        pane.addBinding(this.params, 'spacing', { min: 0, max: 1.2, step: 0.02, label: '両目の間隔' });
        pane.addBinding(this.params, 'pupil', { min: 0.02, max: 0.14, step: 0.005, label: '瞳サイズ' });
        pane.addBinding(this.params, 'pupilColor', { label: '瞳孔の色' });
        const shapeBinding = pane.addBinding(this.params, 'pupilShape', {
            label: '瞳孔の形',
            options: { '丸': 'round', 'スリット': 'slit', '星': 'star', 'ハート': 'heart', '十字': 'cross' },
        });
        const slitBinding = pane.addBinding(this.params, 'slitWidth', { min: 0.005, max: 0.1, step: 0.005, label: 'スリットの太さ' });
        const updateSlit = () => { slitBinding.hidden = this.params.pupilShape !== 'slit'; };
        shapeBinding.on('change', updateSlit);
        updateSlit(); // スリット選択時のみ表示
        pane.addBinding(this.params, 'hue', { min: 0, max: 1, step: 0.01, label: '虹彩の色相' });
        pane.addBinding(this.params, 'irisLines', { min: 4, max: 100, step: 1, label: '虹彩の線の本数' });
        pane.addBinding(this.params, 'irisLineStrength', { min: 0, max: 1, step: 0.05, label: '虹彩の線の濃さ' });
        pane.addBinding(this.params, 'follow', { min: 0.2, max: 1.6, step: 0.05, label: '追従量' });
        pane.addBinding(this.params, 'vessels', { min: 0, max: 1, step: 0.05, label: '血管' });
        pane.addBinding(this.params, 'blink', { label: '瞬き' });
        pane.addBinding(this.params, 'blinkEvery', { min: 1, max: 8, step: 0.2, label: '瞬き間隔(秒)' });
        pane.addBinding(this.params, 'react', { min: 0, max: 1, step: 0.05, label: '瞳の反応' });
        pane.addBinding(this.params, 'lashes', { label: 'まつ毛' });
        pane.addBinding(this.params, 'lashCount', { min: 4, max: 30, step: 1, label: 'まつ毛の本数' });
        pane.addBinding(this.params, 'lashLen', { min: 0.0, max: 0.16, step: 0.005, label: 'まつ毛の長さ' });
        pane.addBinding(this.params, 'lashThick', { min: 0.004, max: 0.03, step: 0.001, label: 'まつ毛の太さ' });
        pane.addBinding(this.params, 'lowerLash', { label: '下まつ毛' });
        pane.addBinding(this.params, 'highlight', { min: 0, max: 1.5, step: 0.05, label: 'ハイライト' });
        pane.addBinding(this.params, 'bloom', { min: 0, max: 2, step: 0.05, label: '輝き' });
        pane.addBinding(this.params, 'exposure', { min: 0.3, max: 2, step: 0.05, label: '露出' });
    }
}
