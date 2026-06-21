import * as THREE from 'three';
import { EffectComposer } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/EffectComposer.js?external=three';
import { RenderPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/RenderPass.js?external=three';
import { UnrealBloomPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/UnrealBloomPass.js?external=three';
import { OutputPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/OutputPass.js?external=three';
/**
 * イラスト回転型 疑似スタートレイル（シンプル版）。
 * 軌跡は「イラストに描き込まれている」前提なので、動的な残像は使わない。
 * 同心円トレイルの正方形イラストを極（=画像中心）まわりに回すだけ。
 * 画面より大きくオーバースキャンして回すのでエッジは出ず、継ぎ目もない。
 * 任意で Bloom（発光）と前景シルエット（静止）を重ねられる。
 *
 * 画像の置き場所:
 *   public/starfield.png   … 空のイラスト（正方形・極が画像中央の同心円トレイル推奨）
 *   public/foreground.png  … 前景シルエット（透過PNG・任意）
 */
export class IllustrationTrailEffect {
    constructor() {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'illustration'
        });
        Object.defineProperty(this, "title", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'イラスト回転トレイル'
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
                speed: 0.03, // 回転 rad/秒
                bloom: 0.3, // 発光（イラストに焼き込み済みなら0でも可。にじみを抑えめに）
                exposure: 1.0,
                poleX: 0.5, // 極(回転中心)の画面位置 0..1
                poleY: 0.5,
                foreground: false, // 前景シルエットを重ねる
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
        Object.defineProperty(this, "skyMesh", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "fgMesh", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
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
        renderer.setClearColor(0x05060f, 1);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = this.params.exposure;
        this.renderer = renderer;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
        this.camera.position.z = 1;
        const loader = new THREE.TextureLoader();
        // 空イラスト（正方形・極が中央）。中央を回すので回転は継ぎ目なし
        const skyTex = loader.load('starfield.png', (t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            // 拡大表示でも少しでも鮮明に
            t.anisotropy = renderer.capabilities.getMaxAnisotropy();
            t.magFilter = THREE.LinearFilter;
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.generateMipmaps = true;
            t.needsUpdate = true;
        });
        this.disposables.push(skyTex);
        const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, depthTest: false, depthWrite: false });
        this.disposables.push(skyMat);
        const skyGeo = new THREE.PlaneGeometry(1, 1);
        this.disposables.push(skyGeo);
        this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyMesh);
        // 前景シルエット（静止・任意）
        const fgTex = loader.load('foreground.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; });
        this.disposables.push(fgTex);
        const fgMat = new THREE.MeshBasicMaterial({ map: fgTex, transparent: true, depthTest: false, depthWrite: false });
        this.disposables.push(fgMat);
        const fgGeo = new THREE.PlaneGeometry(1, 1);
        this.disposables.push(fgGeo);
        this.fgMesh = new THREE.Mesh(fgGeo, fgMat);
        this.fgMesh.position.z = 0.2;
        this.fgMesh.renderOrder = 1;
        this.fgMesh.visible = this.params.foreground;
        this.scene.add(this.fgMesh);
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(this.scene, this.camera));
        const bloom = new UnrealBloomPass(new THREE.Vector2(c.width, c.height), this.params.bloom, 0.4, 0.3);
        composer.addPass(bloom);
        this.bloom = bloom;
        composer.addPass(new OutputPass());
        this.composer = composer;
        this.resize(c);
    }
    /** カメラのアスペクトと、空・前景の配置/スケールを更新 */
    layout() {
        const aspect = window.innerWidth / window.innerHeight;
        this.camera.left = -aspect;
        this.camera.right = aspect;
        this.camera.top = 1;
        this.camera.bottom = -1;
        this.camera.updateProjectionMatrix();
        // 極の画面位置（中央=0,0／y上向き）
        const px = (this.params.poleX * 2 - 1) * aspect;
        const py = 1 - this.params.poleY * 2;
        // 回しても画面を覆うよう、極から四隅までの最大距離の2倍に拡大
        let maxd = 0;
        for (const cxr of [-aspect, aspect]) {
            for (const cyr of [-1, 1]) {
                maxd = Math.max(maxd, Math.hypot(cxr - px, cyr - py));
            }
        }
        const s = maxd * 2 * 1.02;
        this.skyMesh.position.set(px, py, 0);
        this.skyMesh.scale.set(s, s, 1);
        // 前景は画面全体を覆う（回転しない）
        this.fgMesh.position.set(0, 0, 0.2);
        this.fgMesh.scale.set(aspect * 2, 2, 1);
    }
    resize(c) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(window.innerWidth, window.innerHeight, true);
        this.composer.setPixelRatio(dpr);
        this.composer.setSize(window.innerWidth, window.innerHeight);
        this.bloom.setSize(window.innerWidth, window.innerHeight);
        this.layout();
    }
    frame(_timeMs, dt) {
        this.layout(); // 極スライダーの変更を反映（軽い）
        this.skyMesh.rotation.z += this.params.speed * dt;
        this.renderer.toneMappingExposure = this.params.exposure;
        this.bloom.strength = this.params.bloom;
        this.fgMesh.visible = this.params.foreground;
        this.composer.render();
    }
    pointer(p) {
        if (!p.down)
            return;
        this.params.poleX = Math.min(1, Math.max(0, p.x));
        this.params.poleY = Math.min(1, Math.max(0, 1 - p.y));
    }
    dispose() {
        for (const d of this.disposables)
            d.dispose();
        this.disposables = [];
        this.renderer.dispose();
    }
    buildControls(pane) {
        pane.addBinding(this.params, 'speed', { min: 0, max: 0.2, step: 0.005, label: '回転速度' });
        pane.addBinding(this.params, 'bloom', { min: 0, max: 2, step: 0.05, label: '輝き' });
        pane.addBinding(this.params, 'exposure', { min: 0.3, max: 2, step: 0.05, label: '露出' });
        pane.addBinding(this.params, 'poleX', { min: 0, max: 1, step: 0.01, label: '極 X' });
        pane.addBinding(this.params, 'poleY', { min: 0, max: 1, step: 0.01, label: '極 Y' });
        pane.addBinding(this.params, 'foreground', { label: '前景シルエット' });
    }
}
