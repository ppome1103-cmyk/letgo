import * as THREE from '../vendor/three.module.min.js';
import { HALF, CELLS } from './terrain.js';

// ───────── 하늘 (그라데이션 + 해 빛번짐 + 달) ─────────
export function makeSky(radius) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      moonDir: { value: new THREE.Vector3(0, -1, 0) },
      night: { value: 0 },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 moonDir; uniform float night;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.4), 0.55)) : mix(horizon, ground, min(1.0, -h * 6.0));
        float s = max(dot(d, sunDir), 0.0);
        float above = smoothstep(-0.12, 0.05, sunDir.y);
        c += sunColor * (pow(s, 6.0) * 0.28 + pow(s, 48.0) * 0.55) * above;
        c += sunColor * smoothstep(0.9990, 0.9995, s) * 2.5 * smoothstep(-0.02, 0.02, sunDir.y);
        // 해 쪽 지평선을 따뜻하게
        float hz = 1.0 - min(1.0, abs(h) * 4.0);
        c += sunColor * hz * pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0), 3.0) * 0.25 * above;
        float m = max(dot(d, moonDir), 0.0);
        c += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, m) * 1.5 + pow(m, 60.0) * 0.12) * night;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

// ───────── 물 (프레넬 + 햇빛 반짝임 + 얕은 곳 색 + 물가 거품) ─────────
export function makeWaterMaterial(heightTex) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      time: { value: 0 },
      deep: { value: new THREE.Color('#1f6f9a') },
      shallow: { value: new THREE.Color('#5fd0c8') },
      skyCol: { value: new THREE.Color('#bfe3ff') },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color('#ffffff') },
      heightTex: { value: null },
      texN: { value: CELLS + 1 },
      halfSize: { value: HALF },
      light: { value: 1 },
    },
  ]);
  uniforms.heightTex.value = heightTex;
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform vec3 skyCol; uniform vec3 sunDir; uniform vec3 sunColor;
      uniform sampler2D heightTex; uniform float texN; uniform float halfSize; uniform float light;
      varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        vec2 p = vW.xz;
        float t = time;
        vec3 n = normalize(vec3(
          sin(p.x * 0.045 + t * 0.7) * 0.05 + sin(p.y * 0.08 - t * 1.0 + p.x * 0.03) * 0.04 + sin((p.x + p.y) * 0.23 + t * 1.8) * 0.025 + sin(p.x * 0.61 - t * 2.6) * 0.012,
          1.0,
          cos(p.y * 0.05 + t * 0.6) * 0.05 + cos(p.x * 0.1 + t * 1.2) * 0.035 + cos((p.x - p.y) * 0.27 - t * 2.1) * 0.02 + cos(p.y * 0.57 + t * 2.3) * 0.012));
        vec3 V = normalize(cameraPosition - vW);
        float camD = length(cameraPosition - vW);
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(150.0, 1100.0, camD) * 0.85));
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec2 uv = ((p + halfSize) / (2.0 * halfSize) * (texN - 1.0) + 0.5) / texN;
        float th = texture2D(heightTex, uv).r * 60.0 - 20.0;
        float depth = vW.y - th;
        vec3 base = mix(shallow, deep, smoothstep(0.5, 9.0, depth));
        vec3 col = mix(base * light, skyCol, clamp(fres * 0.9 + 0.08, 0.0, 1.0));
        vec3 R = reflect(-V, n);
        float sp = max(dot(R, sunDir), 0.0);
        col += sunColor * (pow(sp, 160.0) * 2.2 + pow(sp, 18.0) * 0.12) * smoothstep(-0.05, 0.1, sunDir.y);
        // 물가 거품
        float foam = (1.0 - smoothstep(0.0, 1.4, depth)) * (0.55 + 0.45 * sin(t * 1.6 + p.x * 0.3 + p.y * 0.2));
        col = mix(col, vec3(0.97) * light + 0.05, foam * 0.7);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
}

// ───────── 구름 (카메라를 바라보는 부드러운 뭉게) ─────────
function puffTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) {
    const x = S / 2 + (r() - 0.5) * S * 0.38, y = S / 2 + (r() - 0.5) * S * 0.3, rad = S * (0.18 + r() * 0.16);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.28)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  }
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

export function makeClouds(puffs) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  const off = new Float32Array(puffs.length * 4);
  puffs.forEach((p, i) => {
    off[i * 4] = p.x;
    off[i * 4 + 1] = p.y;
    off[i * 4 + 2] = p.z;
    off[i * 4 + 3] = p.s;
  });
  geo.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = puffs.length;
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { map: { value: null }, lit: { value: new THREE.Color('#ffffff') }, shade: { value: new THREE.Color('#c9d3e6') }, time: { value: 0 } },
  ]);
  uniforms.map.value = puffTexture();
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute vec4 offset; uniform float time; varying vec2 vUv; varying float vFade; varying float vY;
      #include <fog_pars_vertex>
      void main(){
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 c = offset.xyz + vec3(time * 1.5, 0.0, 0.0);
        vec3 w = c + (right * position.x + up * position.y * 0.62) * offset.w;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float dist = -mvPosition.z;
        vFade = smoothstep(offset.w * 0.25, offset.w * 1.1, dist);
        vUv = uv;
        vY = position.y + 0.5;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 lit; uniform vec3 shade; varying vec2 vUv; varying float vFade; varying float vY;
      #include <fog_pars_fragment>
      void main(){
        float a = texture2D(map, vUv).a * vFade;
        if (a < 0.01) discard;
        vec3 col = mix(shade, lit, smoothstep(0.15, 0.85, vY));
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

// ───────── 폭포 (흐르는 물줄기) ─────────
export function makeFallMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, light: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time; uniform float light; varying vec2 vUv;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float x = floor(vUv.x * 26.0);
        float sp = 0.6 + h(x) * 0.6;
        float s = fract(vUv.y * 3.0 + time * sp + h(x + 7.0));
        float streak = smoothstep(0.0, 0.5, s) * (1.0 - smoothstep(0.5, 1.0, s));
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        vec3 col = mix(vec3(0.62, 0.84, 0.95), vec3(1.0), streak * 0.8) * light;
        gl_FragColor = vec4(col, (0.55 + streak * 0.4) * edge);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// 나무 흔들림 (인스턴스 위치로 위상 차이)
export function addWind(material, timeUniform, amount = 0.05) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeUniform;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float sw = (sin(uTime * 1.3 + ip.x * 0.045 + ip.z * 0.06) + sin(uTime * 2.7 + ip.z * 0.1) * 0.35) * ${amount.toFixed(3)} * max(0.0, position.y);
        transformed.x += sw;
        transformed.z += sw * 0.5;
      #endif`,
    );
  };
}

// 새 날갯짓 (인스턴스마다 다른 박자)
export function addFlap(material, timeUniform) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeUniform;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float ph = float(gl_InstanceID) * 1.7;
      transformed.y += sin(uTime * 9.0 + ph) * abs(position.x) * 0.7;`,
    );
  };
}
