// 水面リップル背景エフェクト
// WebGLが使える場合: シェーダーによる波紋シミュレーション + 屈折表現
// WebGLが使えない場合: Canvas2Dのタイル分割によるフォールバック表現
// どちらの場合も「マウスで波紋が広がる」見た目になるようにしています。

(function () {
  'use strict';

  const canvas = document.getElementById('glCanvas');
  const fallback = document.getElementById('fallback');

  // -----------------------------------------------------------------------
  // 共有の状態（パラメーター・背景画像・入力）
  // -----------------------------------------------------------------------
  const params = {
    refraction: 0.05,
    damping: 0.985,
    autoRipple: true,
  };

  let pendingDrops = [];
  function addDrop(x, y, strength, radius) {
    pendingDrops.push({ x, y, strength, radius });
    if (pendingDrops.length > 8) pendingDrops.shift();
  }

  let bgImage = null;
  let bgImageSize = { width: 0, height: 0 };
  let bgScale = [1, 1];
  let bgOffset = [0, 0];
  let bgCover = null; // { sx, sy, sw, sh } 画像ピクセル空間でのcover矩形

  function updateBgFit() {
    if (!bgImageSize.width || !canvas.width || !canvas.height) return;
    const canvasAspect = canvas.width / canvas.height;
    const imgAspect = bgImageSize.width / bgImageSize.height;

    if (canvasAspect > imgAspect) {
      const scaleX = imgAspect / canvasAspect;
      bgScale = [scaleX, 1];
      bgOffset = [(1 - scaleX) / 2, 0];

      const cropW = bgImageSize.height * canvasAspect;
      bgCover = { sx: (bgImageSize.width - cropW) / 2, sy: 0, sw: cropW, sh: bgImageSize.height };
    } else {
      const scaleY = canvasAspect / imgAspect;
      bgScale = [1, scaleY];
      bgOffset = [0, (1 - scaleY) / 2];

      const cropH = bgImageSize.width / canvasAspect;
      bgCover = { sx: 0, sy: (bgImageSize.height - cropH) / 2, sw: bgImageSize.width, sh: cropH };
    }
  }

  function loadBackgroundImage(src, onDone) {
    const img = new Image();
    img.onload = function () {
      bgImage = img;
      bgImageSize = { width: img.width, height: img.height };
      updateBgFit();
      if (renderer && renderer.onBackgroundLoaded) renderer.onBackgroundLoaded(img);
      if (onDone) onDone(true);
    };
    img.onerror = function () {
      if (onDone) onDone(false);
    };
    img.src = src;
  }

  // -----------------------------------------------------------------------
  // 入力ハンドリング（共通）
  // -----------------------------------------------------------------------
  function clientToUv(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = 1.0 - (clientY - rect.top) / rect.height;
    return [x, y];
  }

  let lastPointer = null;

  canvas.addEventListener('pointermove', function (e) {
    const [x, y] = clientToUv(e.clientX, e.clientY);
    if (lastPointer) {
      const dx = x - lastPointer[0];
      const dy = y - lastPointer[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      const strength = Math.min(0.25, 0.04 + dist * 2.5);
      addDrop(x, y, strength, 0.04);
    }
    lastPointer = [x, y];
  });

  canvas.addEventListener('pointerdown', function (e) {
    const [x, y] = clientToUv(e.clientX, e.clientY);
    addDrop(x, y, 0.5, 0.08);
    lastPointer = [x, y];
  });

  canvas.addEventListener('pointerleave', function () {
    lastPointer = null;
  });

  // -----------------------------------------------------------------------
  // UI
  // -----------------------------------------------------------------------
  const refractionInput = document.getElementById('refraction');
  const dampingInput = document.getElementById('damping');
  const autoRippleInput = document.getElementById('autoRipple');
  const bgInput = document.getElementById('bgInput');
  const resetBtn = document.getElementById('resetBtn');
  const panel = document.getElementById('panel');
  const panelToggle = document.getElementById('panelToggle');

  refractionInput.value = params.refraction;
  dampingInput.value = params.damping;

  refractionInput.addEventListener('input', function () {
    params.refraction = parseFloat(refractionInput.value);
  });
  dampingInput.addEventListener('input', function () {
    params.damping = parseFloat(dampingInput.value);
  });
  autoRippleInput.addEventListener('change', function () {
    params.autoRipple = autoRippleInput.checked;
  });
  panelToggle.addEventListener('click', function () {
    panel.classList.toggle('collapsed');
  });

  bgInput.addEventListener('change', function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadBackgroundImage(url, function () {
      URL.revokeObjectURL(url);
    });
  });

  resetBtn.addEventListener('click', function () {
    if (renderer && renderer.reset) renderer.reset();
  });

  // =========================================================================
  // WebGLレンダラー
  // =========================================================================
  function createWebGLRenderer(gl) {
    const VERTEX_SHADER = `
      attribute vec2 aPosition;
      varying vec2 vUv;
      void main() {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const UPDATE_SHADER = `
      precision highp float;
      uniform sampler2D uTexture;
      uniform vec2 uTexel;
      uniform float uAspect;
      uniform float uDamping;
      uniform vec2 uDropCenter;
      uniform float uDropRadius;
      uniform float uDropStrength;
      varying vec2 vUv;

      vec2 decode(vec4 c) { return (c.rg - 0.5) * 2.0; }
      vec4 encode(vec2 v) { return vec4(v * 0.5 + 0.5, 0.0, 1.0); }

      void main() {
        vec2 info = decode(texture2D(uTexture, vUv));

        vec2 dx = vec2(uTexel.x, 0.0);
        vec2 dy = vec2(0.0, uTexel.y);
        vec2 dxy = vec2(uTexel.x, uTexel.y);
        vec2 dxy2 = vec2(uTexel.x, -uTexel.y);

        // 上下左右(重み高め)+斜め4方向(重み低め)で平均することで、
        // 波紋がより円形に・滑らかに伝わるようにする
        float average =
          (
            decode(texture2D(uTexture, vUv - dx)).r +
            decode(texture2D(uTexture, vUv + dx)).r +
            decode(texture2D(uTexture, vUv - dy)).r +
            decode(texture2D(uTexture, vUv + dy)).r
          ) * 0.2 +
          (
            decode(texture2D(uTexture, vUv + dxy)).r +
            decode(texture2D(uTexture, vUv - dxy)).r +
            decode(texture2D(uTexture, vUv + dxy2)).r +
            decode(texture2D(uTexture, vUv - dxy2)).r
          ) * 0.05;

        info.g += (average - info.r) * 2.0;
        info.g *= uDamping;
        info.r += info.g;

        if (uDropStrength > 0.0) {
          vec2 d = vUv - uDropCenter;
          d.x *= uAspect;
          float dist = length(d);
          float drop = max(0.0, 1.0 - dist / uDropRadius);
          drop = 0.5 - cos(drop * 3.14159265) * 0.5;
          info.r += drop * uDropStrength;
        }

        info = clamp(info, -1.0, 1.0);
        gl_FragColor = encode(info);
      }
    `;

    const RENDER_SHADER = `
      precision highp float;
      uniform sampler2D uRipple;
      uniform sampler2D uBackground;
      uniform vec2 uTexel;
      uniform float uRefraction;
      uniform vec2 uBgScale;
      uniform vec2 uBgOffset;
      uniform float uTime;
      varying vec2 vUv;

      vec2 decode(vec4 c) { return (c.rg - 0.5) * 2.0; }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec2 dx = vec2(uTexel.x, 0.0);
        vec2 dy = vec2(0.0, uTexel.y);

        float hL = decode(texture2D(uRipple, vUv - dx)).r;
        float hR = decode(texture2D(uRipple, vUv + dx)).r;
        float hD = decode(texture2D(uRipple, vUv - dy)).r;
        float hU = decode(texture2D(uRipple, vUv + dy)).r;
        float h  = decode(texture2D(uRipple, vUv)).r;

        vec2 grad = vec2(hR - hL, hU - hD);
        float gradMag = length(grad);

        vec2 uv = vUv + grad * uRefraction;
        uv = clamp(uv, 0.0, 1.0);
        vec2 bgUv = uv * uBgScale + uBgOffset;

        vec3 color = texture2D(uBackground, bgUv).rgb;

        // 水面の透明感: 背景に薄い水色のティントを重ねてガラス越しのような質感にする
        vec3 waterTint = vec3(0.55, 0.82, 0.95);
        color = mix(color, color * waterTint + waterTint * 0.08, 0.16);

        // 参考デモのような軽やかで明るいパステル質感へ:
        // わずかに脱彩度して明度を持ち上げ、白っぽい透明感を出す
        float lum = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(color, vec3(lum), 0.10);
        color = color * 1.05 + 0.025;

        vec3 normal = normalize(vec3(-grad * 3.0, 1.0));
        vec3 lightDir = normalize(vec3(-0.35, 0.45, 0.85));
        float spec = pow(max(dot(normal, lightDir), 0.0), 70.0);
        // ハイライトに淡い青白いブルームを乗せて水面のきらめきを強調
        color += spec * vec3(0.9, 0.97, 1.0) * 0.95;

        // キラキラした反射: 波の起伏が大きい場所に、時間で明滅する「星形(十字)」のきらめきを散らす。
        // 参考デモのように、丸い点ではなく中心の輝点＋上下左右に伸びる光条(diffraction spike)で
        // 本物の水面反射のようなキラッとした輝きを表現する。
        float sparkle = 0.0;
        {
          float aspect = uTexel.y / uTexel.x;    // simWidth/simHeight ≒ キャンバスのアスペクト
          float density = 72.0;                  // きらめきの密度(小さいほど大きく疎らに)
          vec2 sUv = vec2(vUv.x * aspect, vUv.y); // セルを正方形にして星を歪ませない
          vec2 gv = sUv * density;
          vec2 cellId = floor(gv);
          vec2 cellUv = fract(gv) - 0.5;          // セル内座標(-0.5〜0.5)
          float tphase = floor(uTime * 3.0);      // この瞬間に光るセットを切り替え
          float on = step(0.90, hash(cellId + tphase * 1.7));
          vec2 jitter = (vec2(hash(cellId + 2.3), hash(cellId + 5.1)) - 0.5) * 0.5;
          vec2 p = cellUv - jitter;               // きらめき中心からの相対位置
          float twPhase = hash(cellId) * 6.2831853;
          float pulse = 0.5 + 0.5 * sin(uTime * 7.0 + twPhase); // 明滅(0〜1)
          float core = 1.0 - smoothstep(0.0, 0.05, length(p));  // 中心の丸い輝点
          // 上下/左右に伸びる光条(細い帯×軸方向の減衰)。smoothstepは昇順引数で使う
          float vray = (1.0 - smoothstep(0.0, 0.018, abs(p.x))) * (1.0 - smoothstep(0.04, 0.45, abs(p.y)));
          float hray = (1.0 - smoothstep(0.0, 0.018, abs(p.y))) * (1.0 - smoothstep(0.04, 0.45, abs(p.x)));
          float glint = core + (vray + hray) * 0.55;
          sparkle = on * glint * pulse * smoothstep(0.012, 0.07, gradMag);
        }
        color += sparkle * vec3(1.0, 1.0, 1.0) * 1.8;

        color *= 1.0 - clamp(-h, 0.0, 1.0) * 0.18;
        color += clamp(h, 0.0, 1.0) * 0.05;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    function compileShader(type, src) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    function createProgram(vsSrc, fsSrc) {
      const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
      const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
      }
      const uniforms = {};
      const uCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < uCount; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, uniforms };
    }

    function createTexture(width, height, data) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    }

    function createFBO(tex) {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return fbo;
    }

    const updateProg = createProgram(VERTEX_SHADER, UPDATE_SHADER);
    const renderProg = createProgram(VERTEX_SHADER, RENDER_SHADER);

    if (!updateProg || !renderProg) return null;

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, 1, 1,
    ]), gl.STATIC_DRAW);

    function bindQuad(program) {
      const loc = gl.getAttribLocation(program, 'aPosition');
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    let simWidth = 0, simHeight = 0;
    let texA, texB, fboA, fboB;
    let readTex, readFbo, writeTex, writeFbo;

    function initSimTextures() {
      const maxDim = 480;
      const aspect = canvas.width / canvas.height;
      if (aspect >= 1) {
        simWidth = maxDim;
        simHeight = Math.max(2, Math.round(maxDim / aspect));
      } else {
        simHeight = maxDim;
        simWidth = Math.max(2, Math.round(maxDim * aspect));
      }

      const emptyData = new Uint8Array(simWidth * simHeight * 4);
      for (let i = 0; i < emptyData.length; i += 4) {
        emptyData[i] = 128;
        emptyData[i + 1] = 128;
        emptyData[i + 2] = 0;
        emptyData[i + 3] = 255;
      }

      if (texA) gl.deleteTexture(texA);
      if (texB) gl.deleteTexture(texB);
      if (fboA) gl.deleteFramebuffer(fboA);
      if (fboB) gl.deleteFramebuffer(fboB);

      texA = createTexture(simWidth, simHeight, emptyData);
      texB = createTexture(simWidth, simHeight, emptyData);
      fboA = createFBO(texA);
      fboB = createFBO(texB);

      readTex = texA; readFbo = fboA;
      writeTex = texB; writeFbo = fboB;
    }

    let bgTex = createTexture(2, 2, new Uint8Array([
      40, 70, 110, 255, 60, 110, 160, 255,
      30, 55, 90, 255, 80, 130, 180, 255,
    ]));

    initSimTextures();

    return {
      onResize() {
        initSimTextures();
      },
      onBackgroundLoaded(img) {
        gl.bindTexture(gl.TEXTURE_2D, bgTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      },
      reset() {
        initSimTextures();
      },
      frame(time, drops) {
        const drop = drops.length ? drops[drops.length - 1] : null;

        // --- シミュレーション更新パス ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
        gl.viewport(0, 0, simWidth, simHeight);
        gl.useProgram(updateProg.program);
        bindQuad(updateProg.program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.uniform1i(updateProg.uniforms['uTexture'], 0);
        gl.uniform2f(updateProg.uniforms['uTexel'], 1 / simWidth, 1 / simHeight);
        gl.uniform1f(updateProg.uniforms['uAspect'], simWidth / simHeight);
        gl.uniform1f(updateProg.uniforms['uDamping'], params.damping);

        if (drop) {
          gl.uniform2f(updateProg.uniforms['uDropCenter'], drop.x, drop.y);
          gl.uniform1f(updateProg.uniforms['uDropRadius'], drop.radius);
          gl.uniform1f(updateProg.uniforms['uDropStrength'], drop.strength);
        } else {
          gl.uniform2f(updateProg.uniforms['uDropCenter'], -1, -1);
          gl.uniform1f(updateProg.uniforms['uDropRadius'], 0.05);
          gl.uniform1f(updateProg.uniforms['uDropStrength'], 0);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        const tmpTex = readTex, tmpFbo = readFbo;
        readTex = writeTex; readFbo = writeFbo;
        writeTex = tmpTex; writeFbo = tmpFbo;

        // --- 描画パス ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(renderProg.program);
        bindQuad(renderProg.program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.uniform1i(renderProg.uniforms['uRipple'], 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, bgTex);
        gl.uniform1i(renderProg.uniforms['uBackground'], 1);

        gl.uniform2f(renderProg.uniforms['uTexel'], 1 / simWidth, 1 / simHeight);
        gl.uniform1f(renderProg.uniforms['uRefraction'], params.refraction);
        gl.uniform2f(renderProg.uniforms['uBgScale'], bgScale[0], bgScale[1]);
        gl.uniform2f(renderProg.uniforms['uBgOffset'], bgOffset[0], bgOffset[1]);
        gl.uniform1f(renderProg.uniforms['uTime'], time / 1000);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  }

  // =========================================================================
  // Canvas2Dフォールバックレンダラー（WebGL非対応環境向け）
  // =========================================================================
  function create2DRenderer(ctx) {
    const CELL_PX = 56; // グリッド1マスのおおよそのサイズ(px)
    const REFRACTION_PX = 220; // refractionパラメーターから変位量(px)への係数

    let gridCols = 10, gridRows = 10;
    let cellW = 1, cellH = 1;
    let height0 = new Float32Array(0);
    let velocity = new Float32Array(0);
    let prevHeight = new Float32Array(0);

    function initGrid() {
      gridCols = Math.max(10, Math.round(canvas.width / CELL_PX));
      gridRows = Math.max(10, Math.round(canvas.height / CELL_PX));
      cellW = canvas.width / gridCols;
      cellH = canvas.height / gridRows;
      const n = gridCols * gridRows;
      height0 = new Float32Array(n);
      velocity = new Float32Array(n);
      prevHeight = new Float32Array(n);
    }

    function idx(i, j) {
      i = Math.min(gridCols - 1, Math.max(0, i));
      j = Math.min(gridRows - 1, Math.max(0, j));
      return j * gridCols + i;
    }

    function stampDrop(drop) {
      const gx = drop.x * gridCols;
      const gy = (1 - drop.y) * gridRows;
      const radiusPx = drop.radius * canvas.width;
      const rCells = Math.max(1, radiusPx / cellW);

      const i0 = Math.max(0, Math.floor(gx - rCells));
      const i1 = Math.min(gridCols - 1, Math.ceil(gx + rCells));
      const j0 = Math.max(0, Math.floor(gy - rCells));
      const j1 = Math.min(gridRows - 1, Math.ceil(gy + rCells));

      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dist = Math.sqrt(((i - gx) / rCells) ** 2 + ((j - gy) / rCells) ** 2);
          if (dist >= 1) continue;
          let v = 1 - dist;
          v = 0.5 - Math.cos(v * Math.PI) * 0.5;
          height0[idx(i, j)] += v * drop.strength;
        }
      }
    }

    function updateSimulation() {
      prevHeight.set(height0);
      for (let j = 0; j < gridRows; j++) {
        for (let i = 0; i < gridCols; i++) {
          const k = idx(i, j);
          // 上下左右(重み高め)+斜め4方向(重み低め)で平均することで、
          // 波紋がより円形に・滑らかに伝わるようにする(WebGL版と同様)
          const average = (
            prevHeight[idx(i - 1, j)] +
            prevHeight[idx(i + 1, j)] +
            prevHeight[idx(i, j - 1)] +
            prevHeight[idx(i, j + 1)]
          ) * 0.2 + (
            prevHeight[idx(i - 1, j - 1)] +
            prevHeight[idx(i + 1, j - 1)] +
            prevHeight[idx(i - 1, j + 1)] +
            prevHeight[idx(i + 1, j + 1)]
          ) * 0.05;

          let v = velocity[k] + (average - prevHeight[k]) * 2.0;
          v *= params.damping;
          let h = prevHeight[k] + v;

          h = Math.max(-1, Math.min(1, h));
          v = Math.max(-1, Math.min(1, v));

          velocity[k] = v;
          height0[k] = h;
        }
      }
    }

    function drawBackground() {
      if (!bgImage || !bgCover) {
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, '#283c5a');
        grad.addColorStop(1, '#0f1c30');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return false;
      }
      return true;
    }

    // セル座標と時刻からきらめきの有無を決める簡易ハッシュ(WebGL版のsparkleと同じ考え方)
    function sparkleHash(i, j, twinkleSeed) {
      const v = Math.sin((i + twinkleSeed) * 12.9898 + (j + twinkleSeed) * 78.233) * 43758.5453;
      return v - Math.floor(v);
    }

    function render(time) {
      const hasBg = drawBackground();
      const twinkleSeed = Math.floor((time / 1000) * 5);

      for (let j = 0; j < gridRows; j++) {
        for (let i = 0; i < gridCols; i++) {
          const k = idx(i, j);
          const h = height0[k];
          const gxh = height0[idx(i + 1, j)] - height0[idx(i - 1, j)];
          const gyh = height0[idx(i, j + 1)] - height0[idx(i, j - 1)];
          const gradMag = Math.sqrt(gxh * gxh + gyh * gyh);

          const dx = gxh * params.refraction * REFRACTION_PX;
          const dy = gyh * params.refraction * REFRACTION_PX;

          const destX = i * cellW + dx;
          const destY = j * cellH + dy;
          const destW = cellW + 1;
          const destH = cellH + 1;

          if (hasBg) {
            const srcX = bgCover.sx + (i / gridCols) * bgCover.sw;
            const srcY = bgCover.sy + (j / gridRows) * bgCover.sh;
            const srcW = bgCover.sw / gridCols;
            const srcH = bgCover.sh / gridRows;
            ctx.drawImage(bgImage, srcX, srcY, srcW, srcH, destX, destY, destW, destH);

            // 水面の透明感: 薄い青みがかったティントを全体に重ねる
            ctx.fillStyle = 'rgba(140, 200, 230, 0.14)';
            ctx.fillRect(destX, destY, destW, destH);
          }

          if (h > 0.01) {
            ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.35, h * 0.25) + ')';
            ctx.fillRect(destX, destY, destW, destH);
          } else if (h < -0.01) {
            ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.35, -h * 0.25) + ')';
            ctx.fillRect(destX, destY, destW, destH);
          }

          // キラキラした反射: 波の起伏が大きいセルに、時間で揺らぐ「丸い」輝点を重ねる
          // (以前は fillRect で四角く塗っていたため四角いバグに見えていた)
          if (gradMag > 0.015) {
            const twinkle = sparkleHash(i, j, twinkleSeed);
            if (twinkle > 0.93) {
              const alpha = Math.min(0.9, (gradMag - 0.015) * 8);
              // セル内のランダムな位置に小さな円をソフトに描く
              const jx = sparkleHash(i + 11, j + 7, twinkleSeed);
              const jy = sparkleHash(i + 23, j + 19, twinkleSeed);
              const cx = destX + jx * cellW;
              const cy = destY + jy * cellH;
              const r = Math.max(1.5, Math.min(cellW, cellH) * 0.35);
              const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
              g.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
              g.addColorStop(1, 'rgba(255,255,255,0)');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(cx, cy, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    }

    initGrid();

    return {
      onResize() {
        initGrid();
      },
      onBackgroundLoaded() {
        // bgImage/bgCoverは共有状態側で更新済み
      },
      reset() {
        height0.fill(0);
        velocity.fill(0);
      },
      frame(time, drops) {
        for (let d = 0; d < drops.length; d++) stampDrop(drops[d]);
        updateSimulation();
        render(time);
      },
    };
  }

  // -----------------------------------------------------------------------
  // レンダラーの初期化
  // -----------------------------------------------------------------------
  let renderer = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    const changed = canvas.width !== w || canvas.height !== h;
    canvas.width = w;
    canvas.height = h;
    if (changed && renderer && renderer.onResize) renderer.onResize();
    updateBgFit();
  }

  // 既定の背景画像を試行（無ければグラデーションのまま）
  // file://で開いた場合、外部ファイルの<img>はWebGLのtexImage2Dで
  // SecurityError(クロスオリジン)になるため、bg-data.jsで埋め込んだ
  // data URLを優先的に使う。
  if (window.BG_DATA_URL) {
    loadBackgroundImage(window.BG_DATA_URL);
  } else {
    loadBackgroundImage('bg.jpg', function (ok) {
      if (!ok) loadBackgroundImage('bg.png');
    });
  }

  // まずキャンバスサイズを確定させてからレンダラーを作る
  {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }

  // 同じcanvas要素に対してgetContext('webgl')を呼んだ後にgetContext('2d')を呼ぶと、
  // 実装によってはnullが返ってきてしまう（コンテキスト種別が固定されるため）。
  // そのため、使い捨てのcanvasでWebGLが使えるかどうかを先に判定する。
  function detectWebGL() {
    try {
      const testCanvas = document.createElement('canvas');
      const testGl = testCanvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false })
        || testCanvas.getContext('experimental-webgl');
      return !!testGl;
    } catch (e) {
      return false;
    }
  }

  if (detectWebGL()) {
    const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false })
      || canvas.getContext('experimental-webgl');
    if (gl) {
      renderer = createWebGLRenderer(gl);
    }
  }

  if (!renderer) {
    const ctx2d = canvas.getContext('2d');
    if (ctx2d) {
      renderer = create2DRenderer(ctx2d);
    }
  }

  if (!renderer) {
    canvas.hidden = true;
    fallback.hidden = false;
    return;
  }

  updateBgFit();
  window.addEventListener('resize', resize);

  // -----------------------------------------------------------------------
  // メインループ
  // -----------------------------------------------------------------------
  let lastAutoRipple = 0;

  function step(time) {
    if (params.autoRipple && time - lastAutoRipple > 2200) {
      lastAutoRipple = time;
      addDrop(
        0.15 + Math.random() * 0.7,
        0.15 + Math.random() * 0.7,
        0.18 + Math.random() * 0.15,
        0.06 + Math.random() * 0.05
      );
    }

    renderer.frame(time, pendingDrops);
    pendingDrops.length = 0;

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
})();
