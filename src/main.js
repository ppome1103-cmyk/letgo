import * as THREE from '../vendor/three.module.min.js';
import { World, HALF, Y0 } from './world.js';
import { Cat, FURS } from './cat.js';
import { CatController } from './player.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { UI } from './ui.js';
import { FishSet, Pigeons, Butterflies, Walkers, Granny, CardBoxes, SunSpots } from './entities.js';
import { mulberry32, clamp, damp, lerpAngle, radialTexture } from './util.js';

// ───────── 기본 설정 ─────────
const SAVE_KEY = 'gilnyang-v1';
const DAY_LEN = 540; // 하루 9분
const LIGHT = Math.PI;

const MISSIONS = [
  { id: 'fish', icon: '🐟', text: '생선 간식 모으기', goal: 20, hint: '옥상, 실외기, 담벼락 위에 많이 숨어 있어!' },
  { id: 'box', icon: '📦', text: '박스에 쏙 들어가기', goal: 3, hint: '골목, 마당, 옥상 어딘가에 빈 박스가 있어. 들어가면 자동으로 쏙!' },
  { id: 'pigeon', icon: '🕊️', text: '비둘기 놀래키기', goal: 5, hint: '비둘기 근처로 달려가거나 야옹 해봐!' },
  { id: 'granny', icon: '👵', text: '츄르 할머니 찾아 야옹하기', goal: 1, hint: '편의점 앞이나 공원 벤치 근처에 계신대. 가까이 가서 야옹!' },
  { id: 'tower', icon: '🏢', text: '제일 높은 옥상 오르기', goal: 1, hint: '🚩 깃발이 꽂힌 햇살맨션! 실외기를 밟고 차근차근 올라가봐' },
  { id: 'sun', icon: '☀️', text: '햇볕에서 식빵 굽기', goal: 1, hint: '바닥이 따뜻하게 빛나는 곳에서 가만히 있어봐' },
  { id: 'butterfly', icon: '🦋', text: '나비 잡기', goal: 3, hint: '공원에 나비가 많아. 점프해서 잡아봐!' },
];

const NAME_A = ['골목대장', '편의점', '옥상', '햇살', '동네', '담벼락', '느긋한', '배고픈', '새침한', '꾸벅꾸벅'];
const NAME_B = ['호떡', '두부', '모찌', '콩이', '보리', '감자', '망고', '찹쌀', '나비', '까미', '치즈', '누룽지'];

// ───────── 저장 ─────────
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && s.v === 1) return s;
  } catch (_) { /* 저장소를 못 쓰는 환경 */ }
  return null;
}
let saveTimer = 0;
function save() {
  saveTimer = 0.5;
}
function flushSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (_) { /* 무시 */ }
}
function randomName() {
  return NAME_A[Math.floor(Math.random() * NAME_A.length)] + ' ' + NAME_B[Math.floor(Math.random() * NAME_B.length)];
}
function freshState(fur, name) {
  return {
    v: 1,
    fur: fur || 'cheese',
    name: name || randomName(),
    fish: [],
    boxes: [],
    prog: { fish: 0, box: 0, pigeon: 0, granny: 0, tower: 0, sun: 0, butterfly: 0 },
    stats: { jumps: 0, meows: 0, maxFall: 0, time: 0 },
    ended: false,
  };
}
let state = load() || freshState();

// ───────── 렌더러 ─────────
const canvas = document.getElementById('game');
const dpr = window.devicePixelRatio || 1;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
let maxPR = Math.min(dpr, 2);
let pr = maxPR;
renderer.setPixelRatio(pr);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 520);
scene.fog = new THREE.Fog('#cfe8f7', 40, 175);

const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 1);
scene.add(sun, sun.target);

// 하늘
const skyMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color('#8f949c') } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP;
    void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.8), 0.6)) : mix(horizon, bottom, min(1.0, -h * 5.0));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
    }`,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), skyMat);
sky.renderOrder = -1;
scene.add(sky);
// 별
const starPos = [];
const sr = mulberry32(42);
for (let i = 0; i < 260; i++) {
  const a = sr() * Math.PI * 2, e = 0.12 + sr() * 1.3;
  starPos.push(Math.cos(a) * Math.cos(e) * 420, Math.sin(e) * 420, Math.sin(a) * Math.cos(e) * 420);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// ───────── 동네 ─────────
const world = new World(scene, 1101);
const rand = mulberry32(2026);
const pickN = (arr, n, filter) => {
  const a = (filter ? arr.filter(filter) : arr).slice();
  const out = [];
  while (out.length < n && a.length) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]);
  return out;
};
const P = world.points;
const fishPoints = [
  ...pickN(P.roof, 14),
  ...pickN(P.ac, 10, (p) => p.y > 2),
  ...pickN(P.wall, 8),
  ...pickN(P.leaf, 4),
  ...pickN(P.ground, 4),
];
const fish = new FishSet(scene, fishPoints);
fish.setCollected(fishPoints.map((_, i) => state.fish.includes(i)));

const boxSpots = [...pickN(P.ground, 3), ...pickN(P.roof, 2, (p) => !p.top && p.y > 4)];
const boxes = new CardBoxes(scene, boxSpots);
boxes.list.forEach((b, i) => (b.visited = state.boxes.includes(i)));

const sunSpots = new SunSpots(scene, P.sun);
const pigeons = new Pigeons(scene, [...pickN(P.sidewalk, 9), ...pickN(P.roof, 6, (p) => !p.top), ...pickN(P.ground, 3)], rand);
const pc = world.parkCenter;
const bHomes = [pc, pc, pc, ...pickN(P.ground, 3)].map((p) => ({ x: p.x, y: p.y, z: p.z }));
const butterflies = new Butterflies(scene, bHomes, rand);
const walkers = new Walkers(scene, world.blocks.filter((b) => b.type !== 'P'), rand);

// 츄르 할머니는 매번 다른 곳에
const grannySpots = [
  ...P.storeFront.map((p) => ({ x: p.x, z: p.z, ry: 0 })),
  ...P.bench.slice(0, 3).map((p) => ({ x: p.x + 1.3, z: p.z + 0.2, ry: -Math.PI / 2 })),
];
const gs = grannySpots[Math.floor(Math.random() * grannySpots.length)];
gs.y = world.groundHeightAt(gs.x, gs.z, 5);
const granny = new Granny(scene, gs);

// ───────── 고양이 ─────────
const cat = new Cat(state.fur);
scene.add(cat.root);
const ctrl = new CatController(world);
const spawn = { x: pc.x + 1.2, y: pc.y + 0.05, z: pc.z + 2.2 };
ctrl.spawn(spawn.x, spawn.y, spawn.z);
ctrl.facing = Math.PI;

const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
);
scene.add(shadow);

// ───────── 입력 / 소리 / UI ─────────
const input = new Input(document.getElementById('touch'));
const sfx = new Sfx();
const ui = new UI();
ui.buildMinimap(world);
const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

const $ = (id) => document.getElementById(id);
let mode = 'title';
let catMode = 'normal';
let idle = 0;
let sunT = 0;
let zzzT = 0;
let insideBox = null;
let lastFallToast = 0;
let tutorial = 0;
let dayT = 0.31;

// ───────── 미션 UI ─────────
function missionDone(m) {
  return state.prog[m.id] >= m.goal;
}
function renderMissions() {
  const list = $('missionList');
  list.innerHTML = '';
  let done = 0;
  for (const m of MISSIONS) {
    const ok = missionDone(m);
    if (ok) done++;
    const li = document.createElement('li');
    li.className = ok ? 'done' : '';
    const cnt = m.goal > 1 ? ` <b>${Math.min(state.prog[m.id], m.goal)}/${m.goal}</b>` : '';
    li.innerHTML = `<span class="ic">${ok ? '✅' : m.icon}</span><span class="tx">${m.text}${cnt}</span>`;
    li.addEventListener('click', (e) => {
      e.stopPropagation();
      ui.toast(`${m.icon} ${m.hint}`, 3200);
    });
    list.appendChild(li);
  }
  $('missionCount').textContent = `${done}/${MISSIONS.length}`;
  return done;
}

function addProgress(id, n = 1) {
  const m = MISSIONS.find((x) => x.id === id);
  const was = missionDone(m);
  state.prog[id] = Math.min(m.goal, state.prog[id] + n);
  const now = missionDone(m);
  const done = renderMissions();
  save();
  if (!was && now) {
    sfx.success();
    ui.toast(`✅ 미션 완료! ${m.icon} ${m.text}`, 2600);
    $('missionBtn').classList.add('pulse');
    setTimeout(() => $('missionBtn').classList.remove('pulse'), 1200);
    if (done === MISSIONS.length && !state.ended) {
      state.ended = true;
      save();
      setTimeout(showEnd, 1800);
    }
  } else if (m.goal > 1 && !now) {
    ui.toast(`${m.icon} ${m.text} ${state.prog[id]}/${m.goal}`, 1400);
  }
}

// ───────── 타이틀 화면 ─────────
function refreshTitle() {
  $('catName').textContent = state.name;
  document.querySelectorAll('.fur').forEach((b) => b.classList.toggle('on', b.dataset.fur === state.fur));
  $('furName').textContent = FURS[state.fur].name;
}
document.querySelectorAll('.fur').forEach((b) => {
  b.style.setProperty('--c1', FURS[b.dataset.fur].main);
  b.style.setProperty('--c2', FURS[b.dataset.fur].patches ? FURS[b.dataset.fur].acc1 : FURS[b.dataset.fur].belly);
  b.addEventListener('click', () => {
    state.fur = b.dataset.fur;
    cat.setFur(state.fur);
    cat.meow();
    sfx.unlock();
    sfx.meow(state.fur === 'black' ? 0.92 : 1.05);
    refreshTitle();
    save();
  });
});
$('btnDice').addEventListener('click', () => {
  state.name = randomName();
  refreshTitle();
  save();
});
$('btnStart').addEventListener('click', startGame);
refreshTitle();
const anyProgress = Object.values(state.prog).some((v) => v > 0);
$('btnStart').textContent = anyProgress ? '이어서 하기 🐾' : '시작하기 🐾';
$('controlsHelp').innerHTML = isTouch
  ? '👈 왼쪽 드래그: 걷기 · 👉 오른쪽 드래그: 둘러보기<br>🐾 점프 (꾹 누르면 높이!) · 😺 야옹'
  : 'WASD / 방향키: 걷기 · 마우스 드래그: 둘러보기<br>스페이스: 점프 · E: 야옹 · 휠: 줌';

function startGame() {
  sfx.unlock();
  mode = 'play';
  input.enabled = true;
  document.body.classList.add('playing');
  $('title').classList.add('hide');
  renderMissions();
  $('nameTag').textContent = `${state.name} · ${FURS[state.fur].name}`;
  camYaw = ctrl.facing + Math.PI;
  camPitch = 0.38;
  ui.toast(`🐾 ${state.name}의 하루가 시작됐다냥!`, 2600);
  ui.toast('📋 할 일 항목을 누르면 힌트가 나와!', 2800);
  tutorial = 1;
  if (isTouch) $('joyHint').classList.remove('hide');
  // 할 일 목록을 잠깐 펼쳐 보여주고 접기
  $('missions').classList.remove('collapsed');
  setTimeout(() => $('missions').classList.add('collapsed'), 5500);
}

// ───────── 엔딩 카드 ─────────
function shareText() {
  const s = state.stats;
  return `🐾 길냥이체험기\n${state.name}(${FURS[state.fur].name})의 하루 끝!\n🐟 ${state.prog.fish} · 🕊️ ${state.prog.pigeon} · 🦋 ${state.prog.butterfly} · 📦 ${state.prog.box}\n야옹 ${s.meows}번, 점프 ${s.jumps}번, 최고 낙하 ${s.maxFall.toFixed(1)}m\n오늘도 잘 살았다냥 #길냥이체험기`;
}
function showEnd() {
  sfx.fanfare();
  const s = state.stats;
  const min = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
  $('endStats').innerHTML = `
    <div><span>⏱️</span>${min}분 ${sec}초</div>
    <div><span>😺</span>야옹 ${s.meows}번</div>
    <div><span>🐾</span>점프 ${s.jumps}번</div>
    <div><span>🪂</span>최고 낙하 ${s.maxFall.toFixed(1)}m</div>`;
  $('shareBox').textContent = shareText();
  $('endCard').classList.add('show');
}
$('btnContinue').addEventListener('click', () => $('endCard').classList.remove('show'));
$('btnShare').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareText());
    ui.toast('📋 복사했어! 친구한테 자랑해봐', 2200);
  } catch (_) {
    const r = document.createRange();
    r.selectNodeContents($('shareBox'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    ui.toast('글자를 길게 눌러서 복사해줘', 2400);
  }
});
$('btnNewDay').addEventListener('click', () => {
  const fur = state.fur, name = state.name;
  state = freshState(fur, name);
  flushSave();
  location.reload();
});

// ───────── 상단 버튼 ─────────
$('missionBtn').addEventListener('click', () => $('missions').classList.toggle('collapsed'));
$('btnSound').addEventListener('click', () => {
  sfx.unlock();
  sfx.setMuted(!sfx.muted);
  if (sfx.muted) sfx.purr(false);
  $('btnSound').textContent = sfx.muted ? '🔇' : '🔊';
});
if (!document.documentElement.requestFullscreen) $('btnFull').style.display = 'none';
$('btnFull').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch (_) {
    ui.toast('이 브라우저는 전체화면을 지원하지 않아요', 1800);
  }
});
$('btnHelp').addEventListener('click', () => {
  ui.toast(isTouch ? '👈 왼쪽 드래그로 걷고, 👉 오른쪽 드래그로 둘러봐. 🐾 꾹 누르면 높이 점프!' : 'WASD 이동 · 스페이스 점프(길게=높이) · E 야옹 · 마우스 드래그로 시점', 3600);
});

// ───────── 카메라 ─────────
let camYaw = Math.PI * 0.75;
let camPitch = 0.3;
let camDist = isTouch ? 4.6 : 4.4;
let camCur = camDist;
const camTarget = new THREE.Vector3(spawn.x, spawn.y + 0.5, spawn.z);

function updateCamera(dt) {
  const sens = 0.0058;
  camYaw -= input.camDX * sens;
  camPitch = clamp(camPitch + input.camDY * sens * 0.75, -0.12, 1.25);
  input.camDX = input.camDY = 0;
  if (input.zoom) {
    camDist = clamp(camDist + input.zoom * 0.45, 2.4, 9);
    input.zoom = 0;
  }
  const since = (performance.now() - input.lastDragTime) / 1000;
  const hs = Math.hypot(ctrl.vel.x, ctrl.vel.z);
  if (since > 1.6 && hs > 1.5) camYaw = lerpAngle(camYaw, ctrl.facing + Math.PI, damp(0.9, dt) * Math.min(1, hs / 6));

  camTarget.x += (ctrl.pos.x - camTarget.x) * damp(16, dt);
  camTarget.z += (ctrl.pos.z - camTarget.z) * damp(16, dt);
  camTarget.y += (ctrl.pos.y + 0.5 - camTarget.y) * damp(8, dt);
  const cp = Math.cos(camPitch);
  const dx = Math.sin(camYaw) * cp, dy = Math.sin(camPitch), dz = Math.cos(camYaw) * cp;
  const hit = world.raycast(camTarget.x, camTarget.y, camTarget.z, dx, dy, dz, camDist);
  const want = Math.max(0.7, hit - 0.25);
  camCur = want < camCur ? want : camCur + (want - camCur) * damp(3, dt);
  camera.position.set(camTarget.x + dx * camCur, Math.max(0.25, camTarget.y + dy * camCur), camTarget.z + dz * camCur);
  camera.lookAt(camTarget);
}

// ───────── 낮과 밤 ─────────
const KEYS = [
  { t: 0.0, top: '#0f1a3d', hor: '#2c3a6b', sun: '#8fa6ff', si: 0.45, hs: '#8a9ae0', hg: '#3a3656', hi: 0.95 },
  { t: 0.2, top: '#1d2a5c', hor: '#56508a', sun: '#a9a8ff', si: 0.45, hs: '#959bd8', hg: '#453a56', hi: 0.95 },
  { t: 0.26, top: '#5b7fc8', hor: '#ffb08a', sun: '#ffb47a', si: 0.7, hs: '#c9cfee', hg: '#8a6f5a', hi: 0.85 },
  { t: 0.34, top: '#5aa6ee', hor: '#cfe9fa', sun: '#fff1d6', si: 1.05, hs: '#d8ecff', hg: '#9c8f7a', hi: 0.9 },
  { t: 0.55, top: '#4a9cec', hor: '#d6eefc', sun: '#ffffff', si: 1.15, hs: '#e2f1ff', hg: '#a29580', hi: 0.92 },
  { t: 0.72, top: '#5a86d0', hor: '#ffd29a', sun: '#ffc27a', si: 1.0, hs: '#e6dccc', hg: '#9a7f66', hi: 0.88 },
  { t: 0.79, top: '#3e4c9a', hor: '#ff8f6a', sun: '#ff8a5c', si: 0.75, hs: '#c8a8b8', hg: '#6a4f52', hi: 0.82 },
  { t: 0.85, top: '#1d2a5c', hor: '#5d4f8e', sun: '#a9a8ff', si: 0.45, hs: '#959bd8', hg: '#453a56', hi: 0.92 },
  { t: 1.0, top: '#0f1a3d', hor: '#2c3a6b', sun: '#8fa6ff', si: 0.45, hs: '#8a9ae0', hg: '#3a3656', hi: 0.95 },
];
const cA = new THREE.Color(), cB = new THREE.Color();
const mix = (a, b, t, out) => out.copy(cA.set(a)).lerp(cB.set(b), t);
let dayLight = 1;
function updateSky(dt) {
  dayT = (dayT + dt / DAY_LEN) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= dayT) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = (dayT - a.t) / (b.t - a.t);
  mix(a.top, b.top, t, skyMat.uniforms.top.value);
  mix(a.hor, b.hor, t, skyMat.uniforms.horizon.value);
  scene.fog.color.copy(skyMat.uniforms.horizon.value);
  mix(a.sun, b.sun, t, sun.color);
  sun.intensity = (a.si + (b.si - a.si) * t) * LIGHT;
  mix(a.hs, b.hs, t, hemi.color);
  mix(a.hg, b.hg, t, hemi.groundColor);
  hemi.intensity = (a.hi + (b.hi - a.hi) * t) * LIGHT * 0.55;
  const ang = (dayT - 0.25) * Math.PI * 2;
  const el = Math.sin(ang);
  const day = el > -0.05;
  const sx = Math.cos(ang) * 0.7, sy = Math.max(0.25, Math.abs(el)), sz = 0.45;
  sun.position.set(ctrl.pos.x + (day ? sx : -sx) * 50, ctrl.pos.y + sy * 50, ctrl.pos.z + sz * 50);
  sun.target.position.copy(ctrl.pos);
  const night = dayT < 0.21 || dayT > 0.84;
  world.setNight(night);
  dayLight = clamp((el + 0.1) * 3, 0, 1);
  starMat.opacity = clamp(1 - dayLight * 1.4, 0, 0.9);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
}

// ───────── 게임 진행 ─────────
const tmpV = new THREE.Vector3();
const WALK_LINES = ['어? 고양이다!', '야옹~ 😊', '귀여워ㅠㅠ', '츄르 없는데 미안해', '안녕 냥이야~', '어디 가니?'];
const GRANNY_LINES = ['또 왔니~', '오늘도 예쁘네', '배고프지? 천천히 먹어', '아이고 우리 강아지… 아니 고양이~'];

function setCatMode(m) {
  if (catMode === m) return;
  if (catMode === 'loaf') sfx.purr(false);
  catMode = m;
  if (m === 'loaf') sfx.purr(true);
}

function updatePlay(dt) {
  state.stats.time += dt;
  const inp = input.read();
  const moving = Math.hypot(inp.mx, inp.my) > 0.15;
  if (moving || inp.jumpPressed) {
    idle = 0;
    sunT = 0;
    if (catMode !== 'normal') setCatMode('normal');
    if (tutorial === 1 && moving) {
      tutorial = 2;
      $('joyHint').classList.add('hide');
    }
  }

  ctrl.update(dt, catMode === 'box' && !moving ? { ...inp, mx: 0, my: 0 } : inp, camYaw);

  for (const e of ctrl.events) {
    if (e.type === 'jump') {
      sfx.jump();
      state.stats.jumps++;
    } else if (e.type === 'land') {
      if (e.impact > 5) cat.land(e.impact);
      if (e.fall > 1.2) sfx.land(e.fall > 4);
      if (e.fall > state.stats.maxFall) state.stats.maxFall = e.fall;
      if (e.fall > 4.5 && performance.now() - lastFallToast > 4000) {
        lastFallToast = performance.now();
        ui.toast(`🐈 ${e.fall.toFixed(1)}m 낙하! 사뿐히 착지 성공`, 1800);
      }
    }
  }
  ctrl.events.length = 0;

  const hs = Math.hypot(ctrl.vel.x, ctrl.vel.z);
  const p = ctrl.pos;
  const head = tmpV.set(p.x, p.y + 0.85, p.z);

  // 야옹
  let scareR = 1.9 + Math.min(1.5, hs * 0.2);
  if (inp.meowPressed) {
    state.stats.meows++;
    cat.meow();
    sfx.meow(state.fur === 'black' ? 0.92 : 1.05);
    ui.bubble(head.clone(), '야옹~', 1100, 'cat');
    scareR = 5;
    const gd = granny.pos.distanceTo(p);
    if (gd < 3.2) {
      ui.float(new THREE.Vector3(granny.pos.x, granny.pos.y + 1.3, granny.pos.z), '💗', 4);
      if (state.prog.granny < 1) {
        ui.bubble(new THREE.Vector3(granny.pos.x, granny.pos.y + 1.55, granny.pos.z), '아이고 예쁜 것~ 츄르 먹자 😊', 2600);
        ui.float(head.clone(), '😋', 1);
        addProgress('granny');
      } else {
        ui.bubble(new THREE.Vector3(granny.pos.x, granny.pos.y + 1.55, granny.pos.z), GRANNY_LINES[Math.floor(Math.random() * GRANNY_LINES.length)], 2000);
      }
    }
    for (const w of walkers.list) {
      if (w.g.position.distanceTo(p) < 4.5 && w.bubbleCd <= 0) {
        w.bubbleCd = 4;
        w.pause = 2;
        ui.bubble(w.g.position.clone().setY(w.g.position.y + 1.95), WALK_LINES[Math.floor(Math.random() * WALK_LINES.length)], 2000);
        ui.float(w.g.position.clone().setY(w.g.position.y + 1.8), '💗', 2);
      }
    }
  }

  // 할머니 근처
  const gdist = granny.pos.distanceTo(p);
  if (gdist < 6 && !granny.greeted) {
    granny.greeted = true;
    ui.bubble(new THREE.Vector3(granny.pos.x, granny.pos.y + 1.55, granny.pos.z), state.prog.granny ? '또 왔구나~' : '어머, 고양이네? 야옹~ 해볼래?', 2600);
  }
  if (gdist > 12) granny.greeted = false;

  // 생선
  const fi = fish.tryCollect(p);
  if (fi >= 0) {
    state.fish.push(fi);
    sfx.pickup();
    ui.float(head.clone(), '🐟', 1);
    addProgress('fish');
  }

  // 비둘기
  const scared = pigeons.update(dt, p, scareR);
  if (scared > 0) {
    sfx.flap();
    ui.float(head.clone(), '❗', 1);
    addProgress('pigeon', scared);
  }

  // 나비
  const caught = butterflies.update(dt, p);
  if (caught) {
    sfx.sparkle();
    ui.float(caught, '✨', 3);
    addProgress('butterfly');
  }

  // 박스
  if (insideBox) {
    const dx = p.x - insideBox.pos.x, dz = p.z - insideBox.pos.z;
    if (dx * dx + dz * dz > 0.9 * 0.9 || Math.abs(p.y - insideBox.pos.y) > 0.5) insideBox = null;
  } else if (ctrl.grounded) {
    boxes.list.forEach((b, i) => {
      const dx = p.x - b.pos.x, dz = p.z - b.pos.z;
      if (Math.abs(dx) < 0.3 && Math.abs(dz) < 0.28 && Math.abs(p.y - b.pos.y) < 0.25) {
        insideBox = b;
        p.x = b.pos.x;
        p.z = b.pos.z;
        ctrl.vel.x = ctrl.vel.z = 0;
        setCatMode('box');
        sfx.pop();
        ui.bubble(head.clone(), '쏙!', 1000, 'cat');
        if (!b.visited) {
          b.visited = true;
          state.boxes.push(i);
          addProgress('box');
        }
      }
    });
  }

  // 가만히 있기 → 앉기 / 식빵
  if (!moving && ctrl.grounded && hs < 0.3 && catMode !== 'box') {
    idle += dt;
    let inSun = false;
    for (const s of sunSpots.list) {
      const dx = p.x - s.pos.x, dz = p.z - s.pos.z;
      if (dx * dx + dz * dz < 1.3 * 1.3 && Math.abs(p.y - s.pos.y) < 0.6) inSun = true;
    }
    if (inSun && dayLight > 0.2 && idle > 1.0) {
      setCatMode('loaf');
      sunT += dt;
      if (sunT > 2.5 && state.prog.sun < 1) {
        ui.bubble(head.clone(), '따뜻하다냥…', 2000, 'cat');
        addProgress('sun');
      }
    } else if (idle > 16) setCatMode('loaf');
    else if (idle > 3.5) setCatMode('sit');
  }
  if (catMode === 'loaf') {
    zzzT -= dt;
    if (zzzT < 0) {
      zzzT = 1.3;
      ui.float(head.clone(), '💤', 1);
    }
  }

  // 제일 높은 옥상
  const T = world.tower;
  if (state.prog.tower < 1 && ctrl.grounded && p.x > T.x0 && p.x < T.x1 && p.z > T.z0 && p.z < T.z1 && p.y >= T.y - 0.05) {
    addProgress('tower');
    ui.bubble(head.clone(), '동네가 다 보인다냥!', 2400, 'cat');
    ui.float(head.clone(), '🎉', 4);
  }

  // 행인이 가끔 반응
  for (const w of walkers.list) {
    if (w.bubbleCd <= 0 && w.g.position.distanceTo(p) < 1.6 && Math.random() < dt * 0.8) {
      w.bubbleCd = 8;
      ui.bubble(w.g.position.clone().setY(w.g.position.y + 1.95), Math.random() < 0.5 ? '앗 깜짝이야!' : '귀엽다…', 1600);
    }
  }

  updateCatVisual(dt, hs);
  updateCamera(dt);
}

function updateCatVisual(dt, hs) {
  cat.root.position.copy(ctrl.pos);
  cat.root.rotation.y = ctrl.facing;
  cat.update(dt, { speed: hs, grounded: ctrl.grounded, vy: ctrl.vel.y, mode: catMode });
  // 그림자
  const gy = world.groundHeightAt(ctrl.pos.x, ctrl.pos.z, ctrl.pos.y + 0.05);
  const h = Math.max(0, ctrl.pos.y - gy);
  const s = 0.75 * Math.max(0.35, 1 - h * 0.08);
  shadow.position.set(ctrl.pos.x, gy + 0.02, ctrl.pos.z);
  shadow.scale.set(s, 1, s * 1.2);
  shadow.material.opacity = Math.max(0.25, 1 - h * 0.06);
}

function updateTitle(dt) {
  camYaw += dt * 0.18;
  const tx = ctrl.pos.x, ty = ctrl.pos.y + 0.32, tz = ctrl.pos.z;
  const d = window.innerWidth < window.innerHeight ? 3.0 : 2.4;
  camera.position.set(tx + Math.sin(camYaw) * d, ty + 0.75, tz + Math.cos(camYaw) * d);
  camera.lookAt(tx, ty + (window.innerWidth < window.innerHeight ? 0.15 : 0), tz);
  setCatMode('sit');
  updateCatVisual(dt, 0);
}

// ───────── 루프 ─────────
let last = performance.now();
let fpsAcc = 0, fpsN = 0, lowStreak = 0;
let elapsed = 0;
function frame(now) {
  const rawDt = Math.max(0, (now - last) / 1000);
  last = now;
  const dt = Math.min(0.05, rawDt);
  elapsed += dt;

  if (mode === 'play') updatePlay(dt);
  else updateTitle(dt);

  updateSky(dt);
  world.update(elapsed);
  fish.update(dt, elapsed);
  walkers.update(dt);
  granny.update(dt);
  sunSpots.update(dt, dayLight);
  if (mode !== 'play') {
    pigeons.update(dt, { x: 1e5, y: 0, z: 1e5 }, 0);
    butterflies.update(dt, { x: 1e5, y: -100, z: 1e5 });
  }
  ui.update(dt, camera);
  if (mode === 'play') ui.drawMinimap(ctrl.pos, ctrl.facing, camYaw, [{ x: world.flag.x, z: world.flag.z, icon: '🚩' }]);

  if (saveTimer > 0) {
    saveTimer -= dt;
    if (saveTimer <= 0) flushSave();
  }

  renderer.render(scene, camera);

  // 느린 폰이면 해상도 자동으로 낮추기
  fpsAcc += rawDt;
  fpsN++;
  if (fpsAcc > 2) {
    const fps = fpsN / fpsAcc;
    if (fps < 45 && pr > 1) {
      lowStreak++;
      if (lowStreak >= 1) {
        pr = Math.max(1, pr - 0.25);
        renderer.setPixelRatio(pr);
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
    } else lowStreak = 0;
    fpsAcc = 0;
    fpsN = 0;
  }
  requestAnimationFrame(frame);
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = window.innerWidth < window.innerHeight ? 70 : 62;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flushSave();
    sfx.purr(false);
  }
  last = performance.now();
});
document.addEventListener('gesturestart', (e) => e.preventDefault());

// 테스트/디버그용 핸들
window.__game = { ctrl, world, state, cat, renderer, get mode() { return mode; }, startGame, setDay: (t) => (dayT = t) };

document.body.classList.add('ready');
requestAnimationFrame(frame);
