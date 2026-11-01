import { THREE, Bean, Particles, FollowCam, popText, setSpeedLines, damp, clamp, lerpAngle, $ } from './common.js';

// ───────── 박스 충돌 월드 ─────────
class BoxWorld {
  constructor() {
    this.list = [];
    this.grid = new Map();
    this.stamp = 1;
    this.C = 6;
  }
  add(x0, y0, z0, x1, y1, z1, tag) {
    const c = { x0, y0, z0, x1, y1, z1, tag, q: 0 };
    this.list.push(c);
    for (let cx = Math.floor(x0 / this.C); cx <= Math.floor(x1 / this.C); cx++)
      for (let cz = Math.floor(z0 / this.C); cz <= Math.floor(z1 / this.C); cz++) {
        const k = cx * 10000 + cz;
        (this.grid.get(k) || this.grid.set(k, []).get(k)).push(c);
      }
    return c;
  }
  query(x0, z0, x1, z1, out) {
    out.length = 0;
    const s = ++this.stamp;
    for (let cx = Math.floor(x0 / this.C); cx <= Math.floor(x1 / this.C); cx++)
      for (let cz = Math.floor(z0 / this.C); cz <= Math.floor(z1 / this.C); cz++) {
        const a = this.grid.get(cx * 10000 + cz);
        if (a) for (const c of a) if (c.q !== s) { c.q = s; out.push(c); }
      }
    return out;
  }
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const list = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), this._r || (this._r = []));
    let best = maxT;
    for (const c of list) {
      let t0 = 0, t1 = best, ok = true;
      for (const [o, d, a, b] of [[ox, dx, c.x0, c.x1], [oy, dy, c.y0, c.y1], [oz, dz, c.z0, c.z1]]) {
        if (Math.abs(d) < 1e-8) { if (o < a || o > b) { ok = false; break; } continue; }
        let u = (a - o) / d, v = (b - o) / d;
        if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u);
        t1 = Math.min(t1, v);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 > 0 && t0 < best) best = t0;
    }
    return best;
  }
}

const G = 30, JUMP = 12.2, RUN = 9, ACC = 42, AIR = 18;
const H_STAND = 1.05, H_SLIDE = 0.5, R = 0.3;

export function create(ctx) {
  const { app, input, sfx } = ctx;
  const { scene, camera } = app;
  scene.fog.near = 60;
  scene.fog.far = 260;
  const world = new BoxWorld();
  const parts = new Particles(scene, 500);

  // ───────── 코스 만들기 ─────────
  const boxes = [];
  const box = (x, z, w, d, y0, y1, color, solid = true, tag) => {
    boxes.push({ x, z, w, d, y0, y1, color });
    if (solid) return world.add(x - w / 2, y0, z - d / 2, x + w / 2, y1, z + d / 2, tag);
  };
  const roof = (x, z, w, d, top, color) => {
    box(x, z, w, d, 0, top, color);
    box(x, z, w - 0.3, d - 0.3, top, top + 0.03, '#69b37f', false);
  };
  const C1 = ['#f2b5a0', '#f4d58d', '#a8d5ba', '#b8c4f0', '#f0b8d8', '#cfe3a1'];
  // 0 출발
  roof(0, 6, 9, 14, 12, C1[0]);
  // 1 건너뛰기
  roof(0, 22, 8, 8, 12, C1[1]);
  roof(-1, 34, 7, 8, 13, C1[2]);
  roof(1, 45.5, 8, 5, 12, C1[3]);
  // 2 슬라이딩 구간
  roof(0, 56, 8, 16, 12, C1[4]);
  for (const z of [53, 58]) box(0, z, 8, 0.6, 12.62, 15, '#7d8a96');
  // 3 벽점프 굴뚝
  box(-1.85, 65.75, 0.5, 3.5, 12, 21.5, '#c9d3dc');
  box(1.85, 65.75, 0.5, 3.5, 12, 21.5, '#c9d3dc');
  box(0, 65.75, 3.2, 3.5, 0, 12, '#e3d3b0');
  roof(0, 75.75, 9, 15.5, 19, C1[5]);
  // 4 줄타기
  const zipA = new THREE.Vector3(0, 21.3, 82.5), zipB = new THREE.Vector3(0, 14.6, 119);
  box(0, 82.9, 0.3, 0.3, 19, 21.6, '#6d675d', false);
  roof(0, 124, 9, 14, 12.5, C1[0]);
  box(0, 118.7, 0.3, 0.3, 12.5, 15, '#6d675d', false);
  // 5 점프대
  const padPos = new THREE.Vector3(0, 12.5, 128.5);
  box(0, 128.5, 2, 2, 12.5, 12.75, '#ff5a7a');
  roof(0, 143, 9, 12, 19, C1[2]);
  // 6 가속판 + 큰 간격
  const boost = { x0: -2, x1: 2, z0: 143, z1: 147, y: 19 };
  box(0, 145, 4, 4, 19, 19.06, '#5ad1ff', false);
  roof(0, 166, 9, 12, 17, C1[3]);
  // 7 결승 광장
  roof(0, 181, 14, 16, 10, C1[1]);
  const finishZ = 184;

  // 코인
  const coinPts = [];
  const line = (a, b, n) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      coinPts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t));
    }
  };
  line([0, 14, 13.5], [0, 14, 17], 3);
  line([0, 14.5, 27], [-0.5, 15, 29.5], 3);
  line([0, 14.5, 39], [0.5, 14.5, 42], 3);
  line([0, 12.5, 50], [0, 12.5, 61], 6);
  line([0, 15, 65.75], [0, 19.5, 65.75], 4);
  line([0, 19.9, 88], [0, 15.8, 112], 7);
  line([0, 15, 129.5], [0, 20, 134], 4);
  line([0, 20.5, 151], [0, 19.5, 158], 4);
  line([0, 16, 173], [0, 11.5, 177], 4);

  // 장식 도시 (밟을 수 없음)
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let i = 0; i < 160; i++) {
    const x = (rnd() - 0.5) * 140, z = -30 + rnd() * 260;
    if (Math.abs(x) < 8) continue;
    const near = Math.abs(x) < 30;
    box(x, z, 4 + rnd() * 6, 4 + rnd() * 6, 0, near ? 2 + rnd() * 5 : 8 + rnd() * 30, ['#d9cfc2', '#c7cfd9', '#e6d6c2', '#cdd9c7', '#e0c8c0'][i % 5], false);
  }
  // 바닥
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: '#8a9a8a' }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 100;
  scene.add(ground);

  // 인스턴스 메쉬로 한번에 그리기
  const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), boxes.length);
  const dd = new THREE.Object3D(), col = new THREE.Color();
  boxes.forEach((b, i) => {
    dd.position.set(b.x, b.y0, b.z);
    dd.scale.set(b.w, b.y1 - b.y0, b.d);
    dd.updateMatrix();
    bm.setMatrixAt(i, dd.matrix);
    bm.setColorAt(i, col.set(b.color));
  });
  bm.computeBoundingSphere();
  scene.add(bm);

  // 줄
  const zipDir = zipB.clone().sub(zipA);
  const zipLen = zipDir.length();
  zipDir.normalize();
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, zipLen, 6), new THREE.MeshLambertMaterial({ color: '#333' }));
  rope.position.copy(zipA).add(zipB).multiplyScalar(0.5);
  rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), zipDir);
  scene.add(rope);
  // 화살표 표지
  const arrow = (x, y, z, text, ry = 0) => {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff6e6';
    g.beginPath();
    g.roundRect(4, 4, 248, 88, 24);
    g.fill();
    g.fillStyle = '#d9772b';
    g.font = '44px Jua, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    if (document.fonts) document.fonts.ready.then(() => {
      g.clearRect(0, 0, 256, 96);
      g.fillStyle = '#fff6e6'; g.beginPath(); g.roundRect(4, 4, 248, 88, 24); g.fill();
      g.fillStyle = '#d9772b'; g.fillText(text, 128, 50); tex.needsUpdate = true;
    });
  };
  arrow(3.2, 14, 50, '슬라이드!', Math.PI);
  arrow(0, 23, 64.2, '벽점프 ↑', Math.PI);
  arrow(3.2, 21, 82, '줄 잡기!', Math.PI);
  arrow(2.4, 14, 128.5, '점프대!', Math.PI);
  arrow(3.2, 21, 145, '가속!', Math.PI);
  // 결승 아치
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.25, 8, 24, Math.PI), new THREE.MeshLambertMaterial({ color: '#ffcf4a', emissive: '#553300' }));
  arch.position.set(0, 10, finishZ);
  scene.add(arch);
  // 점프대 / 가속판 표시 링
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 6, 20), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  padRing.rotation.x = Math.PI / 2;
  padRing.position.copy(padPos).setY(12.85);
  scene.add(padRing);

  // 코인 메쉬
  const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 14).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#7a5200' }), coinPts.length);
  coinMesh.frustumCulled = false;
  scene.add(coinMesh);
  const coinGot = coinPts.map(() => false);

  // ───────── 주인공 ─────────
  const bean = new Bean('#ff8a5c');
  scene.add(bean.root);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false }));
  scene.add(shadow);
  const cam = new FollowCam(camera, input, world, { dist: 5.8, pitch: 0.35, follow: 2.2, height: 1.0 });

  const checkpoints = [
    { z: 6, y: 12 }, { z: 49, y: 12 }, { z: 62, y: 12 }, { z: 72, y: 19 }, { z: 122, y: 12.5 }, { z: 140, y: 19 }, { z: 163, y: 17 },
  ];
  const tips = [
    { z: 8, text: '🏃 달려! 끝까지 가면 기록이 남아요', done: false },
    { z: 47, text: '🛝 달리다가 「슬라이드」 버튼! 파이프 밑으로 쏙', done: false },
    { z: 62, text: '🧗 벽에 붙어서 점프! 좌우 벽을 번갈아 차고 올라가', done: false },
    { z: 78, text: '🪢 점프해서 줄을 잡아! 내려가다 점프로 뛰어내리기', done: false },
    { z: 125, text: '🚀 분홍 점프대를 밟아봐', done: false },
    { z: 140, text: '⚡ 파란 가속판 → 멀리 점프!', done: false },
    { z: 168, text: '🎯 높은 데서 달리며 착지하면 「구르기」로 속도 유지', done: false },
  ];

  const S = {
    pos: new THREE.Vector3(0, 12, 4), vel: new THREE.Vector3(), facing: 0,
    grounded: false, h: H_STAND, slide: 0, airJump: 1, wallN: null, wallT: 0, zip: false, zipT: 0, zipS: 0, zipCd: 0,
    coyote: 0, buf: 0, peak: 12, cp: 0, stun: 0, roll: 0,
    combo: 0, comboT: 0, maxCombo: 0, coins: 0, time: 0, running: false, finished: false, dustT: 0,
  };
  const best = (() => { try { return parseFloat(localStorage.getItem('lab-parkour-best')) || null; } catch (_) { return null; } })();
  let bestTime = best;
  const tmpList = [];

  function respawn() {
    const c = checkpoints[S.cp];
    S.pos.set(0, c.y + 0.5, c.z);
    S.vel.set(0, 0, 0);
    S.facing = 0;
    S.zip = false;
    S.slide = 0;
    S.h = H_STAND;
    cam.yaw = Math.PI;
    cam.snap(S.pos);
    parts.emit(S.pos, 16, { color: '#ffffff', speed: 4, life: 0.5, size: 0.15 });
    sfx.pop();
    S.combo = 0;
  }
  cam.snap(S.pos);

  function trick(name, pts = 1) {
    S.combo += pts;
    S.comboT = 2.8;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    popText(`${name}${S.combo > 1 ? `  콤보 ×${S.combo}` : ''}`, 'trick');
  }

  const overlaps = (c, x, y, z, h) => c.x0 < x + R && c.x1 > x - R && c.z0 < z + R && c.z1 > z - R && c.y0 < y + h && c.y1 > y;
  function moveAxis(axis, d, wasGrounded) {
    if (!d) return;
    const p = S.pos;
    p.setComponent(axis, p.getComponent(axis) + d);
    const list = world.query(p.x - R - 0.1, p.z - R - 0.1, p.x + R + 0.1, p.z + R + 0.1, tmpList);
    for (const c of list) {
      if (!overlaps(c, p.x, p.y, p.z, S.h)) continue;
      if (axis === 1) {
        if (d < 0) { p.y = c.y1; S.vel.y = 0; S.grounded = true; }
        else { p.y = c.y0 - S.h - 1e-4; S.vel.y = 0; }
        continue;
      }
      const rise = c.y1 - p.y;
      if (rise > 0 && rise <= 0.35 && wasGrounded) { p.y = c.y1; continue; }
      if (axis === 0) {
        p.x = d > 0 ? c.x0 - R - 1e-4 : c.x1 + R + 1e-4;
        S.wallN = new THREE.Vector3(d > 0 ? -1 : 1, 0, 0);
        S.vel.x = 0;
      } else {
        p.z = d > 0 ? c.z0 - R - 1e-4 : c.z1 + R + 1e-4;
        S.wallN = new THREE.Vector3(0, 0, d > 0 ? -1 : 1);
        S.vel.z = 0;
      }
      if (!wasGrounded) S.wallT = 0.18;
    }
  }
  const canStand = () => {
    const list = world.query(S.pos.x - R, S.pos.z - R, S.pos.x + R, S.pos.z + R, tmpList);
    return !list.some((c) => overlaps(c, S.pos.x, S.pos.y + 0.01, S.pos.z, H_STAND));
  };

  ctx.setAction('🛝', '슬라이드');
  ctx.setHud('⏱️ 0.00', bestTime ? `최고 기록 ${bestTime.toFixed(2)}초` : '결승선까지 달려!');

  function finish() {
    S.finished = true;
    S.running = false;
    app.slowmo(1.2, 0.3);
    app.addShake(0.4);
    sfx.fanfare();
    for (let i = 0; i < 4; i++) parts.emit(new THREE.Vector3(S.pos.x, S.pos.y + 1.5, S.pos.z), 30, { color: ['#ff5a7a', '#ffd23f', '#5ad1ff', '#7bc96f', '#b38cff'], speed: 9, up: 1.5, life: 1.6, size: 0.12, gravity: 9, drag: 1 });
    const isBest = !bestTime || S.time < bestTime;
    if (isBest) {
      bestTime = S.time;
      try { localStorage.setItem('lab-parkour-best', String(S.time)); } catch (_) { /* 무시 */ }
    }
    setTimeout(() => ctx.showResult(isBest ? '🏆 신기록!' : '🏁 완주!', [
      ['⏱️', `${S.time.toFixed(2)}초`], ['🪙', `코인 ${S.coins}/${coinPts.length}`], ['🔥', `최대 콤보 ×${S.maxCombo}`], ['🏆', `최고 ${bestTime.toFixed(2)}초`],
    ]), 1300);
  }

  function update(dt) {
    const inp = input.read();
    const hs0 = Math.hypot(S.vel.x, S.vel.z);
    S.zipCd -= dt;
    S.wallT -= dt;
    S.stun -= dt;
    S.roll -= dt;
    S.comboT -= dt;
    if (S.comboT < 0 && S.combo) S.combo = 0;
    if (S.running) {
      S.time += dt;
      ctx.setHud(`⏱️ ${S.time.toFixed(2)}`, `🪙 ${S.coins}  ${S.combo > 1 ? '🔥 ×' + S.combo : ''}`);
    }

    // 방향 입력 (카메라 기준)
    let ix = inp.mx, iy = inp.my;
    const mag = Math.min(1, Math.hypot(ix, iy));
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let dx = fx * iy + rx * ix, dz = fz * iy + rz * ix;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) { dx /= dl; dz /= dl; }

    if (inp.jumpPressed) S.buf = 0.14; else S.buf -= dt;

    // ── 줄타기 ──
    if (S.zip) {
      S.zipS = Math.min(24, S.zipS + 9 * dt);
      S.zipT += (S.zipS * dt) / zipLen;
      const hp = zipA.clone().addScaledVector(zipDir, S.zipT * zipLen);
      S.pos.set(hp.x, hp.y - 1.05, hp.z);
      S.vel.copy(zipDir).multiplyScalar(S.zipS);
      S.facing = Math.atan2(zipDir.x, zipDir.z);
      if (Math.random() < 0.7) parts.emit(hp, 1, { color: ['#ffd23f', '#ff9a3d'], speed: 2, life: 0.3, size: 0.06, gravity: 12 });
      const end = S.zipT >= 1;
      if (S.buf > 0 || end) {
        S.zip = false;
        S.zipCd = 0.5;
        S.buf = 0;
        S.vel.copy(zipDir).multiplyScalar(S.zipS * 0.8);
        if (!end) { S.vel.y = JUMP * 0.85; sfx.jump(); bean.stretch(0.3); trick('줄 점프!'); }
        S.airJump = 1;
      }
    } else {
      // ── 일반 이동 ──
      let target = mag < 0.12 ? 0 : (0.3 + 0.7 * mag) * RUN;
      if (S.stun > 0) target = 0;
      if (S.slide > 0) {
        S.slide -= dt;
        const sp = Math.max(4, hs0 - 5 * dt);
        const sf = S.facing + (dl > 0 ? clamp(Math.atan2(Math.sin(Math.atan2(dx, dz) - S.facing), Math.cos(Math.atan2(dx, dz) - S.facing)), -1, 1) * 1.6 * dt : 0);
        S.facing = sf;
        S.vel.x = Math.sin(sf) * sp;
        S.vel.z = Math.cos(sf) * sp;
        if (S.slide <= 0 && !canStand()) S.slide = 0.05;
        if (S.slide <= 0) S.h = H_STAND;
        S.dustT -= dt;
        if (S.dustT < 0) { S.dustT = 0.03; parts.emit(S.pos, 2, { color: ['#ffd9a0', '#ffffff'], speed: 2.5, life: 0.35, size: 0.08 }); }
      } else {
        // 남은 속도(가속판/점프)는 서서히만 줄어들게
        const cur = hs0;
        const keep = dl > 0 && cur > target ? cur - (S.grounded ? 6 : 1.5) * dt : target;
        const tvx = dx * Math.max(target, keep);
        const tvz = dz * Math.max(target, keep);
        const acc = (S.grounded ? ACC : AIR) * dt;
        const ex = tvx - S.vel.x, ez = tvz - S.vel.z, el = Math.hypot(ex, ez);
        if (el <= acc || el < 1e-9) { S.vel.x = tvx; S.vel.z = tvz; } else { S.vel.x += (ex / el) * acc; S.vel.z += (ez / el) * acc; }
        if (target > 0.1) S.facing = lerpAngle(S.facing, Math.atan2(dx, dz), damp(S.grounded ? 16 : 6, dt));
      }

      // 슬라이드 시작
      if (inp.meowPressed && S.grounded && hs0 > 3 && S.slide <= 0) {
        S.slide = 0.75;
        S.h = H_SLIDE;
        const sp = Math.max(hs0, 12);
        S.vel.x = Math.sin(S.facing) * sp;
        S.vel.z = Math.cos(S.facing) * sp;
        sfx.noiseBurst(0.3, 700, 0.25, 0.7);
        app.addShake(0.12);
        trick('슬라이드!');
      }

      // 점프 / 벽점프 / 공중점프
      if (S.grounded) S.coyote = 0.11; else S.coyote -= dt;
      if (S.buf > 0) {
        if (S.coyote > 0) {
          const slideJump = S.slide > 0;
          S.vel.y = JUMP;
          if (slideJump) {
            const sp = Math.max(hs0, 13) * 1.12;
            S.vel.x = Math.sin(S.facing) * sp;
            S.vel.z = Math.cos(S.facing) * sp;
            S.slide = 0;
            S.h = canStand() ? H_STAND : H_SLIDE;
            trick('슬라이드 점프!', 2);
          }
          S.grounded = false; S.coyote = 0; S.buf = 0;
          sfx.jump();
          bean.stretch(0.35);
          parts.emit(S.pos, 8, { color: '#ffffff', speed: 3, up: 0.3, life: 0.4, size: 0.1 });
        } else if (S.wallT > 0 && S.wallN) {
          S.vel.set(S.wallN.x * 8.5, JUMP * 1.0, S.wallN.z * 8.5);
          S.facing = Math.atan2(S.wallN.x, S.wallN.z);
          S.wallT = 0; S.buf = 0; S.airJump = 1;
          sfx.tone('square', 520, 900, 0.1, 0.12);
          app.addShake(0.15);
          bean.stretch(0.35);
          parts.emit(S.pos.clone().add(new THREE.Vector3(-S.wallN.x * 0.3, 0.6, -S.wallN.z * 0.3)), 14, { color: ['#ffffff', '#ffe08a'], speed: 4, life: 0.4, size: 0.1 });
          trick('벽점프!');
        } else if (S.airJump > 0) {
          S.airJump--;
          S.vel.y = JUMP * 0.85;
          S.buf = 0;
          sfx.tone('sine', 600, 1200, 0.12, 0.15);
          bean.stretch(0.3);
          parts.emit(S.pos, 12, { color: '#bfe8ff', speed: 3.5, up: -0.2, life: 0.4, size: 0.1, gravity: 0 });
        }
      }
      // 중력 + 벽 미끄럼
      let g = G;
      if (S.vel.y > 0 && !inp.jumpHeld && !S.launched) g *= 1.8;
      S.vel.y -= g * dt;
      const pushing = S.wallN && S.wallT > 0 && mag > 0.3 && dx * S.wallN.x + dz * S.wallN.z < -0.2;
      if (!S.grounded && pushing && S.vel.y < -2.5) {
        S.vel.y = -2.5;
        if (Math.random() < 0.4) parts.emit(S.pos.clone().add(new THREE.Vector3(-S.wallN.x * 0.3, 0.8, -S.wallN.z * 0.3)), 1, { color: '#ffffff', speed: 1, life: 0.3, size: 0.07 });
      }
      S.vel.y = Math.max(S.vel.y, -40);

      // 이동 + 충돌
      const was = S.grounded;
      const vyB = S.vel.y;
      S.grounded = false;
      const steps = Math.max(1, Math.ceil((Math.max(Math.abs(S.vel.x), Math.abs(S.vel.y), Math.abs(S.vel.z)) * dt) / 0.2));
      for (let i = 0; i < steps; i++) {
        moveAxis(0, (S.vel.x * dt) / steps, was);
        moveAxis(2, (S.vel.z * dt) / steps, was);
        moveAxis(1, (S.vel.y * dt) / steps, was);
      }
      if (!S.grounded) S.peak = Math.max(S.peak, S.pos.y);
      else if (!was) {
        // 착지
        const fall = S.peak - S.pos.y;
        const hs = Math.hypot(S.vel.x, S.vel.z);
        S.airJump = 1;
        S.launched = false;
        if (fall > 4 && hs > 3.5) {
          S.roll = 0.45;
          trick('착지 구르기!');
          sfx.noiseBurst(0.2, 400, 0.25);
          app.addShake(0.15);
        } else if (fall > 5.5) {
          S.stun = 0.35;
          app.addShake(0.45);
          sfx.land(true);
          popText('쿵!', 'ouch');
        } else if (fall > 0.6) sfx.land(false);
        bean.land(clamp(-vyB * 0.025, 0.05, 0.45));
        parts.emit(S.pos, Math.min(24, 4 + Math.floor(fall * 3)), { color: '#f2e6d4', speed: 2 + fall * 0.5, up: 0.3, life: 0.5, size: 0.1 });
        S.peak = S.pos.y;
      } else S.peak = S.pos.y;

      // 줄 잡기
      if (!S.grounded && S.zipCd <= 0) {
        const hand = S.pos.clone().setY(S.pos.y + 1.05);
        const t = clamp(hand.clone().sub(zipA).dot(zipDir) / zipLen, 0, 1);
        const cp = zipA.clone().addScaledVector(zipDir, t * zipLen);
        if (cp.distanceTo(hand) < 1.15 && t < 0.95) {
          S.zip = true;
          S.zipT = t;
          S.zipS = Math.max(9, S.vel.dot(zipDir));
          sfx.tone('sawtooth', 200, 120, 0.25, 0.1);
          app.addShake(0.1);
          trick('줄 타기!');
        }
      }
      // 점프대
      if (S.grounded && Math.abs(S.pos.x - padPos.x) < 1 && Math.abs(S.pos.z - padPos.z) < 1 && Math.abs(S.pos.y - 12.75) < 0.1) {
        S.vel.y = 22;
        S.launched = true;
        S.grounded = false;
        bean.stretch(0.8);
        app.addShake(0.3);
        sfx.tone('sine', 200, 1000, 0.35, 0.3);
        parts.emit(S.pos, 30, { color: ['#ff5a7a', '#ffd23f', '#ffffff'], speed: 6, up: 1.2, life: 0.7, size: 0.12 });
        trick('슈퍼 점프!', 2);
      }
      // 가속판
      if (S.grounded && S.pos.x > boost.x0 && S.pos.x < boost.x1 && S.pos.z > boost.z0 && S.pos.z < boost.z1 && Math.abs(S.pos.y - boost.y) < 0.1 && S.vel.z < 15) {
        S.vel.z = 17;
        S.vel.x *= 0.3;
        S.facing = 0;
        app.addShake(0.2);
        sfx.tone('sawtooth', 300, 1400, 0.3, 0.15);
        trick('가속!');
      }
    }

    // 달리기 먼지
    const hs = Math.hypot(S.vel.x, S.vel.z);
    if (S.grounded && hs > 6 && S.slide <= 0) {
      S.dustT -= dt;
      if (S.dustT < 0) { S.dustT = 0.07; parts.emit(S.pos, 1, { color: '#f2e6d4', speed: 1, up: 0.5, life: 0.35, size: 0.08 }); }
    }

    // 코인
    for (let i = 0; i < coinPts.length; i++) {
      if (coinGot[i]) continue;
      const c = coinPts[i];
      if (Math.abs(c.x - S.pos.x) < 0.7 && Math.abs(c.z - S.pos.z) < 0.7 && c.y > S.pos.y - 0.3 && c.y < S.pos.y + S.h + 0.4) {
        coinGot[i] = true;
        S.coins++;
        sfx.pickup();
        parts.emit(c, 8, { color: ['#ffd23f', '#fff3b0'], speed: 3, life: 0.4, size: 0.08, gravity: 2 });
        S.comboT = Math.max(S.comboT, 1.5);
      }
    }

    // 출발 / 체크포인트 / 결승 / 낙하
    if (!S.running && !S.finished && S.pos.z > 10) { S.running = true; S.time = 0; popText('출발!', 'trick'); sfx.success(); }
    for (let i = S.cp + 1; i < checkpoints.length; i++) {
      if (S.pos.z > checkpoints[i].z - 1 && S.pos.y > checkpoints[i].y - 0.5 && S.grounded) {
        S.cp = i;
        sfx.sparkle();
        popText('🚩 체크포인트', 'cp');
      }
    }
    for (const t of tips) if (!t.done && S.pos.z > t.z) { t.done = true; ctx.hint(t.text); }
    if (!S.finished && S.pos.z > finishZ && S.pos.y > 9.5) finish();
    if (S.pos.y < 7) { popText('앗! 다시', 'ouch'); app.addShake(0.3); respawn(); }

    // ── 화면 ──
    bean.root.position.copy(S.pos);
    bean.root.rotation.y = S.facing;
    bean.root.rotation.x = S.roll > 0 ? (1 - S.roll / 0.45) * Math.PI * 2 : 0;
    bean.pivot.position.y = S.roll > 0 ? 0.4 : 0;
    bean.root.rotation.z = S.zip ? Math.sin(performance.now() / 120) * 0.08 : 0;
    bean.update(dt, { speed: hs, grounded: S.grounded || S.zip, vy: S.vel.y, slide: S.slide > 0, lean: S.zip ? -0.2 : 0 });
    const list = world.query(S.pos.x, S.pos.z, S.pos.x, S.pos.z, tmpList);
    let gy = -1;
    for (const c of list) if (S.pos.x >= c.x0 && S.pos.x <= c.x1 && S.pos.z >= c.z0 && S.pos.z <= c.z1 && c.y1 <= S.pos.y + 0.05 && c.y1 > gy) gy = c.y1;
    shadow.visible = gy > 0;
    shadow.position.set(S.pos.x, gy + 0.04, S.pos.z);
    const sc = Math.max(0.4, 1 - (S.pos.y - gy) * 0.08);
    shadow.scale.setScalar(sc);

    // 코인 회전
    const t = performance.now() / 1000;
    for (let i = 0; i < coinPts.length; i++) {
      dd.position.copy(coinPts[i]);
      dd.position.y += Math.sin(t * 3 + i) * 0.08;
      dd.rotation.set(0, t * 3 + i * 0.3, 0);
      dd.scale.setScalar(coinGot[i] ? 0 : 1);
      dd.updateMatrix();
      coinMesh.setMatrixAt(i, dd.matrix);
    }
    coinMesh.instanceMatrix.needsUpdate = true;
    padRing.scale.setScalar(1 + Math.sin(t * 6) * 0.15);
    arch.rotation.y = Math.sin(t) * 0.05;

    cam.update(dt, S.pos, S.facing, hs);
    setSpeedLines((hs - 10) / 8);
    app.fovKick += (clamp((hs - 8) * 1.2, 0, 14) - app.fovKick) * damp(4, dt);
    parts.update(dt);
  }

  return {
    S,
    cam,
    world,
    update,
    retry() {
      S.cp = 0;
      S.finished = false;
      S.running = false;
      S.coins = 0;
      S.maxCombo = 0;
      coinGot.fill(false);
      tips.forEach((t) => (t.done = false));
      respawn();
      ctx.setHud('⏱️ 0.00', bestTime ? `최고 기록 ${bestTime.toFixed(2)}초` : '결승선까지 달려!');
    },
  };
}
