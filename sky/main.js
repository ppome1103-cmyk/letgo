import * as THREE from '../vendor/three.module.min.js';
import { Input } from '../src/input.js';
import { damp, clamp } from '../src/util.js';
import { Bean, Particles } from '../lab/common.js';
import { Terrain, HALF, LAKE, PLACES, autumnW, cherryW } from './terrain.js';
import { makeSky } from './shaders.js';
import { Scenery } from './scenery.js';
import { Flyer } from './flight.js';
import { Ambient } from './ambient.js';

const $ = (id) => document.getElementById(id);
const settings = (() => {
  try { return JSON.parse(localStorage.getItem('sky-settings') || '{}'); } catch (_) { return {}; }
})();
const saveSettings = () => { try { localStorage.setItem('sky-settings', JSON.stringify(settings)); } catch (_) { /* 무시 */ } };

// ───────── 렌더러 ─────────
const canvas = $('game');
const dpr = window.devicePixelRatio || 1;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
let maxPR = settings.light ? 1 : Math.min(dpr, 1.6);
let pr = maxPR;
renderer.setPixelRatio(pr);
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#cfe6f7', 250, 2600);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 4400);
const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
const sun = new THREE.DirectionalLight('#ffffff', 1);
scene.add(hemi, sun, sun.target);
const sky = makeSky(4000);
scene.add(sky);

// ───────── 세계 만들기 (로딩 화면 뒤에서) ─────────
let terrain, scenery, flyer, rig, bean, wing, parts, ribbons;
const input = new Input($('touch'));
const audio = new Ambient();

function buildWorld() {
  terrain = new Terrain();
  const tmat = new THREE.MeshLambertMaterial({ vertexColors: true });
  terrain.buildMeshes(scene, tmat);
  scenery = new Scenery(scene, terrain);
  flyer = new Flyer(terrain);
  flyer.spawn(-60, 140, 760, Math.PI);
  parts = new Particles(scene, 240);

  // 글라이더 + 콩떡이
  rig = new THREE.Group();
  scene.add(rig);
  const wg = new THREE.BufferGeometry();
  const P = [], Cc = [];
  const span = 2.4, segs = 10;
  const cA = new THREE.Color('#ff8a5c'), cB = new THREE.Color('#ffd166'), cC = new THREE.Color('#fff3e6');
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, x = (u - 0.5) * 2 * span;
    const arch = (1 - Math.pow(Math.abs(u - 0.5) * 2, 2)) * 0.35;
    const back = Math.abs(u - 0.5) * 1.2;
    const nose = 1.3 - back * 1.4;
    P.push(x, 0.1 + arch, nose, x, arch * 0.6, -0.75 + back * 0.15);
    const c = new THREE.Color().copy(cA).lerp(cB, Math.abs(u - 0.5) * 2);
    Cc.push(c.r, c.g, c.b, cC.r, cC.g, cC.b);
  }
  const wi = [];
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    wi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  wg.setIndex(wi);
  wg.computeVertexNormals();
  wing = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  wing.position.y = 1.65;
  rig.add(wing);
  const strut = new THREE.MeshLambertMaterial({ color: '#5a4a40' });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6).rotateZ(Math.PI / 2), strut);
  bar.position.set(0, 1.1, 0.25);
  rig.add(bar);
  for (const s of [-1, 1]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 5), strut);
    st.position.set(s * 0.6, 1.4, 0.2);
    st.rotation.z = s * 0.25;
    rig.add(st);
  }
  bean = new Bean('#b38cff');
  bean.root.scale.setScalar(0.82);
  rig.add(bean.root);
  // 날개 끝 리본
  ribbons = [0, 1].map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(30 * 3), 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
    line.frustumCulled = false;
    scene.add(line);
    return { g, pts: [] };
  });
}

// ───────── 시간과 빛 ─────────
const KEYS = [
  { t: 0.0, top: '#0b1433', hor: '#24305e', sun: '#8ea6ff', si: 0.3, hs: '#5868a8', hg: '#1d1b2e', hi: 0.62, lit: '#8f9ac8', sh: '#2c3458', l: 0.35, n: 1 },
  { t: 0.21, top: '#1d2a62', hor: '#7a6a9e', sun: '#ffa08a', si: 0.35, hs: '#7a80b8', hg: '#2a2438', hi: 0.68, lit: '#c8b8d8', sh: '#5a5080', l: 0.5, n: 0.6 },
  { t: 0.27, top: '#5d86cf', hor: '#ffc39c', sun: '#ffb27a', si: 0.85, hs: '#c6cde8', hg: '#7b6a5a', hi: 0.85, lit: '#fff0e0', sh: '#d0a8b8', l: 0.8, n: 0 },
  { t: 0.36, top: '#4f97e6', hor: '#cfe6f7', sun: '#fff1d8', si: 1.25, hs: '#d7e9ff', hg: '#8f8a76', hi: 0.95, lit: '#ffffff', sh: '#c9d6ea', l: 1, n: 0 },
  { t: 0.55, top: '#3f8de6', hor: '#d8eefc', sun: '#ffffff', si: 1.35, hs: '#e0efff', hg: '#9a9480', hi: 1.0, lit: '#ffffff', sh: '#cbd8ea', l: 1.05, n: 0 },
  { t: 0.69, top: '#4b88d6', hor: '#f3e3c4', sun: '#ffe0b0', si: 1.2, hs: '#e8e0d0', hg: '#94826a', hi: 0.92, lit: '#fff4e4', sh: '#d8c4c4', l: 0.95, n: 0 },
  { t: 0.765, top: '#46559e', hor: '#ff9a6a', sun: '#ff8a50', si: 0.95, hs: '#d6a8a8', hg: '#6a4a4a', hi: 0.8, lit: '#ffc8a0', sh: '#9a7090', l: 0.78, n: 0 },
  { t: 0.83, top: '#1f2a5c', hor: '#6a4f86', sun: '#b9a0ff', si: 0.35, hs: '#6a6aa6', hg: '#2a2238', hi: 0.62, lit: '#9a90c0', sh: '#3a3460', l: 0.45, n: 0.7 },
  { t: 1.0, top: '#0b1433', hor: '#24305e', sun: '#8ea6ff', si: 0.3, hs: '#5868a8', hg: '#1d1b2e', hi: 0.62, lit: '#8f9ac8', sh: '#2c3458', l: 0.35, n: 1 },
];
const DAY = 1200; // 하루 20분
let dayT = 0.3, dayTarget = null;
const env = { sunDir: new THREE.Vector3(), sunColor: new THREE.Color(), horizon: new THREE.Color(), cloudLit: new THREE.Color(), cloudShade: new THREE.Color(), light: 1, night: 0 };
const ca = new THREE.Color(), cb = new THREE.Color();
const mixC = (a, b, t, out) => out.copy(ca.set(a)).lerp(cb.set(b), t);
function updateEnv(dt) {
  if (dayTarget !== null) {
    let d = dayTarget - dayT;
    if (d < 0) d += 1;
    const step = Math.min(d, dt * 0.12);
    dayT = (dayT + step) % 1;
    if (d < 0.002) dayTarget = null;
  } else dayT = (dayT + dt / DAY) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= dayT) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = (dayT - a.t) / (b.t - a.t);
  const U = sky.material.uniforms;
  mixC(a.top, b.top, t, U.top.value);
  mixC(a.hor, b.hor, t, U.horizon.value);
  U.ground.value.copy(U.horizon.value).multiplyScalar(0.75);
  mixC(a.sun, b.sun, t, env.sunColor);
  U.sunColor.value.copy(env.sunColor);
  env.horizon.copy(U.horizon.value);
  scene.fog.color.copy(U.horizon.value).lerp(U.top.value, 0.12);
  mixC(a.hs, b.hs, t, hemi.color);
  mixC(a.hg, b.hg, t, hemi.groundColor);
  hemi.intensity = (a.hi + (b.hi - a.hi) * t) * Math.PI * 0.5;
  mixC(a.lit, b.lit, t, env.cloudLit);
  mixC(a.sh, b.sh, t, env.cloudShade);
  env.light = a.l + (b.l - a.l) * t;
  env.night = a.n + (b.n - a.n) * t;
  const ang = (dayT - 0.25) * Math.PI * 2;
  env.sunDir.set(Math.cos(ang) * 0.82, Math.sin(ang), -0.42).normalize();
  U.sunDir.value.copy(env.sunDir);
  U.moonDir.value.copy(env.sunDir).negate();
  U.night.value = env.night;
  const day = env.sunDir.y > -0.04;
  const L = day ? env.sunDir : U.moonDir.value;
  sun.color.copy(day ? env.sunColor : ca.set('#9fb3ff'));
  sun.intensity = (a.si + (b.si - a.si) * t) * Math.PI;
  sun.position.copy(flyer.pos).addScaledVector(L, 500);
  sun.target.position.copy(flyer.pos);
  scene.fog.near = 260 - env.night * 80;
  scene.fog.far = 2700 - env.night * 900;
}

// ───────── 카메라 ─────────
const cam = { yawOff: 0, pitchOff: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), roll: 0 };
const q = new THREE.Quaternion();
function updateCamera(dt, autopilot) {
  const sens = 0.005;
  cam.yawOff -= input.camDX * sens;
  cam.pitchOff = clamp(cam.pitchOff + input.camDY * sens * 0.7, -0.5, 1.0);
  input.camDX = input.camDY = 0;
  const idle = (performance.now() - input.lastDragTime) / 1000;
  if (idle > 2.2) {
    cam.yawOff += (Math.atan2(Math.sin(-cam.yawOff), Math.cos(-cam.yawOff))) * damp(1.2, dt);
    cam.pitchOff += -cam.pitchOff * damp(1.2, dt);
  }
  const p = flyer.pos;
  const yaw = flyer.heading + Math.PI + cam.yawOff + (autopilot ? Math.sin(performance.now() / 9000) * 0.9 + 0.6 : 0);
  const pc = 0.22 + cam.pitchOff;
  const dist = (autopilot ? 15 : 11) + flyer.speed * 0.07;
  const want = new THREE.Vector3(p.x + Math.sin(yaw) * Math.cos(pc) * dist, p.y + 2 + Math.sin(pc) * dist, p.z + Math.cos(yaw) * Math.cos(pc) * dist);
  const g = Math.max(terrain.ground(want.x, want.z), 0) + 2.5;
  if (want.y < g) want.y = g;
  cam.pos.lerp(want, damp(autopilot ? 2 : 4.5, dt));
  if (cam.pos.y < g) cam.pos.y = g;
  camera.position.copy(cam.pos);
  cam.look.copy(p).addScaledVector(flyer.fwd, 7);
  cam.look.y += 1.4;
  cam.roll += (-flyer.roll * 0.18 - cam.roll) * damp(3, dt);
  camera.up.set(0, 1, 0);
  camera.lookAt(cam.look);
  q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), cam.roll);
  camera.quaternion.multiply(q);
  const want2 = 58 + clamp((flyer.speed - 16) * 0.55, 0, 16) + (window.innerWidth < window.innerHeight ? 10 : 0);
  if (Math.abs(camera.fov - want2) > 0.05) {
    camera.fov += (want2 - camera.fov) * damp(3, dt);
    camera.updateProjectionMatrix();
  }
}

// ───────── 장소 이름 ─────────
const PLACE_NAMES = [
  { name: '하얀 물줄기 폭포', test: (x, z, y) => Math.hypot(x, z + 80) < 160 },
  { name: '고요한 호수', test: (x, z) => Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.1 },
  { name: '산 위의 정자', test: (x, z) => scenery.pavilionPos && Math.hypot(x - scenery.pavilionPos.x, z - scenery.pavilionPos.z) < 160 },
  { name: '구름바다 봉우리', test: (x, z) => z < -900 && Math.abs(x) < 1500 },
  { name: '강이 흐르는 고원', test: (x, z) => z < -110 && z > -560 && Math.abs(x) < 600 },
  { name: '높은 산맥', test: (x, z) => z <= -560 && z > -900 },
  { name: '풍차 마을', test: (x, z) => Math.hypot(x - PLACES.village.x, z - PLACES.village.z) < 220 },
  { name: '천년 나무', test: (x, z) => Math.hypot(x - PLACES.bigTree.x, z - PLACES.bigTree.z) < 160 },
  { name: '바위 아치', test: (x, z) => Math.hypot(x - PLACES.arch.x, z - PLACES.arch.z) < 200 },
  { name: '바람의 등대', test: (x, z) => Math.hypot(x - PLACES.lighthouse.x, z - PLACES.lighthouse.z) < 220 },
  { name: '벚꽃 언덕', test: (x, z) => cherryW(x, z) > 0.6 },
  { name: '단풍 골짜기', test: (x, z) => autumnW(x, z) > 0.6 },
  { name: '끝없는 바다', test: (x, z) => terrain.ground(x, z) < -10 && Math.hypot(x, z) > 1400 },
  { name: '바람의 들판', test: (x, z) => z > 300 && z < 1400 && Math.abs(x) < 900 },
];
let placeNow = null, placeCd = 0;
function updatePlace(dt) {
  placeCd -= dt;
  if (placeCd > 0) return;
  placeCd = 0.6;
  const { x, z, y } = flyer.pos;
  const found = PLACE_NAMES.find((p) => p.test(x, z, y));
  const name = found ? found.name : null;
  if (name && name !== placeNow) {
    placeNow = name;
    const el = $('place');
    el.textContent = name;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    placeCd = 5;
  } else if (!name) placeNow = null;
}

// ───────── UI ─────────
let mode = 'title';
const TIMES = [['새벽', 0.255], ['아침', 0.36], ['한낮', 0.52], ['노을', 0.755], ['밤', 0.93]];
let timeIdx = 1;
$('btnTime').addEventListener('click', () => {
  timeIdx = (timeIdx + 1) % TIMES.length;
  dayTarget = TIMES[timeIdx][1];
  toastSmall(`🌅 ${TIMES[timeIdx][0]}`);
});
$('btnPhoto').addEventListener('click', () => {
  document.body.classList.toggle('photo');
  if (document.body.classList.contains('photo')) toastSmall('📷 사진 모드 · 다시 누르면 돌아와요');
});
$('btnSound').addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  $('btnSound').textContent = audio.muted ? '🔇' : '🔊';
});
function toastSmall(t) {
  const el = $('small');
  el.textContent = t;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}
const optInvert = $('optInvert'), optLight = $('optLight');
const refreshOpts = () => {
  optInvert.textContent = settings.invert ? '조종: 위로 밀면 내려가기' : '조종: 위로 밀면 올라가기';
  optLight.textContent = settings.light ? '그래픽: 가볍게 (배터리 절약)' : '그래픽: 선명하게';
};
optInvert.addEventListener('click', () => { settings.invert = !settings.invert; saveSettings(); refreshOpts(); });
optLight.addEventListener('click', () => {
  settings.light = !settings.light;
  saveSettings();
  refreshOpts();
  maxPR = settings.light ? 1 : Math.min(dpr, 1.6);
  pr = maxPR;
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
});
refreshOpts();
$('btnStart').addEventListener('click', () => {
  audio.unlock();
  mode = 'fly';
  input.enabled = true;
  document.body.classList.add('playing');
  $('title').classList.add('hide');
  cam.yawOff = 0;
  setTimeout(() => toastSmall(window.matchMedia('(pointer: coarse)').matches ? '👈 왼쪽 드래그: 방향 · 🪶 날갯짓: 올라가기 · 👉 오른쪽 드래그: 둘러보기' : 'WASD: 방향 · 스페이스: 날갯짓 · 마우스 드래그: 둘러보기'), 600);
});

// ───────── 루프 ─────────
let last = performance.now(), elapsed = 0, cullT = 0, fpsAcc = 0, fpsN = 0;
const camInfo = { x: 0, z: 0, fx: 0, fz: -1, flyer: null, speed: 0, heading: 0, dir: new THREE.Vector3(), position: camera.position };
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  elapsed += dt;
  let inp;
  if (mode === 'title') {
    // 타이틀 화면: 자동으로 천천히 날기
    const t = elapsed;
    inp = { mx: Math.sin(t * 0.13) * 0.35, my: 0.1 + Math.sin(t * 0.21) * 0.2, jumpPressed: flyer.pos.y - terrain.ground(flyer.pos.x, flyer.pos.z) < 60 && Math.random() < 0.02 };
  } else {
    const r = input.read();
    inp = { mx: r.mx, my: settings.invert ? -r.my : r.my, jumpPressed: r.jumpPressed };
  }
  flyer.update(dt, inp);
  if (flyer.flapped) {
    flyer.flapped = false;
    audio.flap();
    bean.stretch(0.25);
    parts.emit(new THREE.Vector3(flyer.pos.x, flyer.pos.y + 1.6, flyer.pos.z), 10, { color: ['#ffffff', '#ffe8f0'], speed: 2.5, life: 0.9, size: 0.1, gravity: 1 });
  }
  if (flyer.outside && mode === 'fly' && Math.random() < dt * 0.3) toastSmall('🌊 바다 너머는 아직 비어 있어요');
  // 수면 물보라
  if (flyer.skim > 0.2 && Math.random() < flyer.skim * 0.9) {
    parts.emit(new THREE.Vector3(flyer.pos.x, 0.3, flyer.pos.z), 2, { color: ['#ffffff', '#d8f3ff'], speed: 2 + flyer.speed * 0.1, up: 1.5, life: 0.7, size: 0.18, gravity: 9, vx: -flyer.fwd.x * 4, vz: -flyer.fwd.z * 4 });
  }

  // 글라이더 자세
  rig.position.copy(flyer.pos);
  rig.rotation.set(0, 0, 0);
  rig.rotateY(flyer.heading);
  rig.rotateX(-flyer.pitch);
  rig.rotateZ(-flyer.roll * 0.85);
  bean.update(dt, { speed: 0, grounded: false, vy: flyer.vy, lean: 0.35 });
  wing.scale.y = 1 + Math.sin(elapsed * 2.2) * 0.04 + (flyer.flapT > 0 ? Math.sin(flyer.flapT * 20) * 0.25 : 0);
  // 리본
  rig.updateMatrixWorld();
  for (let k = 0; k < 2; k++) {
    const R = ribbons[k];
    const tip = new THREE.Vector3(k ? 2.4 : -2.4, 1.72, -0.6).applyMatrix4(rig.matrixWorld);
    if (R.pts.length && R.pts[0].distanceTo(tip) > 15) R.pts.length = 0;
    const fast = flyer.speed > 24;
    if (fast) R.pts.unshift(tip);
    else if (R.pts.length) R.pts.pop();
    const maxLen = Math.round(clamp((flyer.speed - 24) * 0.8, 2, 14));
    while (R.pts.length > maxLen) R.pts.pop();
    if (!R.pts.length) { R.g.setDrawRange(0, 0); continue; }
    const arr = R.g.attributes.position.array;
    for (let i = 0; i < 30; i++) {
      const pt = R.pts[Math.min(i, R.pts.length - 1)];
      arr[i * 3] = pt.x; arr[i * 3 + 1] = pt.y; arr[i * 3 + 2] = pt.z;
    }
    R.g.attributes.position.needsUpdate = true;
    R.g.setDrawRange(0, R.pts.length);
  }

  updateEnv(dt);
  updateCamera(dt, mode === 'title');
  if (mode === 'fly') updatePlace(dt);

  // 구름 속 하얗게
  const cy = scenery.cloudSeaY, cp = camera.position;
  const inSea = cp.z < -620 && cp.z > -1800 && Math.abs(cp.x) < 1500 ? Math.max(0, 1 - Math.abs(cp.y - cy) / 26) : 0;
  $('whiteout').style.opacity = (inSea * 0.85).toFixed(2);

  camInfo.x = cp.x;
  camInfo.z = cp.z;
  const fdir = new THREE.Vector3();
  camera.getWorldDirection(fdir);
  camInfo.fx = fdir.x;
  camInfo.fz = fdir.z;
  const fl = Math.hypot(fdir.x, fdir.z) || 1;
  camInfo.fx /= fl;
  camInfo.fz /= fl;
  camInfo.flyer = flyer.pos;
  camInfo.speed = flyer.speed;
  camInfo.heading = flyer.heading;
  camInfo.dir.copy(flyer.fwd);
  cullT -= dt;
  if (cullT < 0) {
    cullT = 0.35;
    scenery.cullTrees(camInfo, settings.light ? 600 : 1000);
  }
  scenery.update(dt, elapsed, camInfo, env);
  parts.update(dt);
  sky.position.copy(camera.position);

  const g0 = Math.max(terrain.ground(flyer.pos.x, flyer.pos.z), 0);
  audio.update(dt, {
    speed: flyer.speed,
    alt: flyer.pos.y - g0,
    sea: clamp(1 - (flyer.pos.y - 2) / 90, 0, 1) * (terrain.ground(flyer.pos.x, flyer.pos.z) < 2 ? 1 : 0.3 * clamp(1 - (Math.hypot(flyer.pos.x, flyer.pos.z) - 1100) / -300, 0, 1)),
    fall: clamp(1 - scenery.fallPos.distanceTo(flyer.pos) / 260, 0, 1),
    forest: clamp(1 - (flyer.pos.y - g0) / 120, 0, 1) * (g0 > 5 ? 1 : 0),
    night: env.night,
  });

  renderer.render(scene, camera);

  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 2.5) {
    const fps = fpsN / fpsAcc;
    if (fps < 42 && pr > 0.9) {
      pr = Math.max(0.85, pr - 0.15);
      renderer.setPixelRatio(pr);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    fpsAcc = 0;
    fpsN = 0;
  }
  requestAnimationFrame(frame);
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
document.addEventListener('gesturestart', (e) => e.preventDefault());

// 로딩 화면이 먼저 보이도록 한 박자 쉬고 생성
requestAnimationFrame(() => setTimeout(() => {
  const t0 = performance.now();
  buildWorld();
  const fp = flyer.pos;
  cam.pos.set(fp.x + 10, fp.y + 6, fp.z + 16);
  updateEnv(0);
  scenery.cullTrees({ x: fp.x, z: fp.z, fx: 0, fz: -1 }, 1000);
  document.body.classList.add('ready');
  window.__sky = { flyer, terrain, scenery, renderer, camera, setTime: (t) => { dayT = t; }, buildMs: Math.round(performance.now() - t0), get mode() { return mode; } };
  last = performance.now();
  requestAnimationFrame(frame);
}, 30));
