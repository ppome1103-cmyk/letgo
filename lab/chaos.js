import * as CANNON from '../vendor/cannon-es.js';
import { THREE, Bean, Particles, FollowCam, popText, setSpeedLines, damp, clamp, lerpAngle } from './common.js';

const ARENA = 18;
const TIME = 60;

export function create(ctx) {
  const { app, input, sfx } = ctx;
  const { scene, camera } = app;
  scene.fog.near = 50;
  scene.fog.far = 160;
  app.sky.material.uniforms.top.value.set('#ffb8d9');
  app.sky.material.uniforms.horizon.value.set('#fff0dc');
  scene.fog.color.set('#fff0dc');
  const parts = new Particles(scene, 500);

  // ───────── 물리 월드 ─────────
  const pw = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
  pw.broadphase = new CANNON.SAPBroadphase(pw);
  pw.allowSleep = true;
  pw.solver.iterations = 8;
  pw.defaultContactMaterial.friction = 0.45;
  pw.defaultContactMaterial.restitution = 0.12;

  const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  pw.addBody(groundBody);

  // 바닥 (체크 무늬)
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#ffe7c7' : '#fff6e6';
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  const floorTex = new THREE.CanvasTexture(cv);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(9, 9);
  floorTex.magFilter = THREE.NearestFilter;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#b9e3a8' }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.02;
  scene.add(outside);

  // 고정 물체 (벽, 경사로)
  const statics = [];
  const staticBox = (x, y, z, hx, hy, hz, color, rx = 0) => {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), position: new CANNON.Vec3(x, y, z) });
    b.quaternion.setFromEuler(rx, 0, 0);
    pw.addBody(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    m.rotation.x = rx;
    scene.add(m);
    statics.push(m);
  };
  for (const [x, z, hx, hz] of [[0, -ARENA, ARENA, 0.4], [0, ARENA, ARENA, 0.4], [-ARENA, 0, 0.4, ARENA], [ARENA, 0, 0.4, ARENA]]) {
    staticBox(x, 0.6, z, hx + 0.4, 0.6, hz, '#c98b5a');
  }
  staticBox(12.5, 0.9, -4, 1.8, 0.2, 3.6, '#ff5a7a', 0.32);
  staticBox(-12.5, 0.9, -4, 1.8, 0.2, 3.6, '#5ad1ff', 0.32);

  // ───────── 무너뜨릴 것들 ─────────
  const items = [];
  const boxItems = [], cylItems = [];
  const addBox = (x, y, z, hx, hy, hz, mass, color, ry = 0) => {
    const b = new CANNON.Body({ mass, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), position: new CANNON.Vec3(x, y, z), sleepSpeedLimit: 0.15, sleepTimeLimit: 0.6, linearDamping: 0.05, angularDamping: 0.08 });
    b.quaternion.setFromEuler(0, ry, 0);
    pw.addBody(b);
    const it = { b, kind: 'box', s: [hx * 2, hy * 2, hz * 2], color, p0: b.position.clone(), q0: b.quaternion.clone(), knocked: false, i: boxItems.length };
    boxItems.push(it);
    items.push(it);
    return it;
  };
  const addCyl = (x, y, z, r, h, mass, color) => {
    const b = new CANNON.Body({ mass, shape: new CANNON.Cylinder(r, r, h, 10), position: new CANNON.Vec3(x, y, z), sleepSpeedLimit: 0.15, sleepTimeLimit: 0.6, angularDamping: 0.1 });
    pw.addBody(b);
    const it = { b, kind: 'cyl', s: [r * 2, h, r * 2], color, p0: b.position.clone(), q0: b.quaternion.clone(), knocked: false, i: cylItems.length };
    cylItems.push(it);
    items.push(it);
    return it;
  };

  // 도미노 (출발 지점 앞)
  const domCols = ['#ff5a7a', '#ff9a3d', '#ffd23f', '#7bc96f', '#5ad1ff', '#8f7bff', '#ff8fd0'];
  for (let i = 0; i < 30; i++) {
    const x = -9 + i * 0.62;
    const z = 9 + Math.sin(x * 0.45) * 1.6;
    const dz = Math.cos(x * 0.45) * 1.6 * 0.45;
    addBox(x, 0.45, z, 0.06, 0.45, 0.22, 0.6, domCols[i % domCols.length], -Math.atan2(dz, 1));
  }
  // 블록 탑 (젠가)
  const woods = ['#e8b87a', '#d9a066', '#f0c98f'];
  for (let l = 0; l < 10; l++) {
    for (let k = -1; k <= 1; k++) {
      const y = 0.15 + l * 0.3;
      if (l % 2 === 0) addBox(0, y, k * 0.5, 0.75, 0.15, 0.25, 0.8, woods[(l + k + 3) % 3]);
      else addBox(k * 0.5, y, 0, 0.25, 0.15, 0.75, 0.8, woods[(l + k + 3) % 3]);
    }
  }
  // 캔 피라미드
  const canCols = ['#e5433c', '#f2b51d', '#2b78c9', '#3fae5a'];
  for (const cx of [-9, 9]) {
    let n = 0;
    for (let row = 0; row < 5; row++) {
      const cnt = 5 - row;
      for (let k = 0; k < cnt; k++) {
        addCyl(cx + (k - (cnt - 1) / 2) * 0.52, 0.25 + row * 0.5, -2, 0.25, 0.5, 0.35, canCols[n++ % 4]);
      }
    }
  }
  // 상자 탑
  for (const [cx, cz] of [[-6, -10], [6, -10], [0, -13]]) {
    for (let k = 0; k < 5; k++) addBox(cx + (Math.random() - 0.5) * 0.05, 0.45 + k * 0.9, cz, 0.45, 0.45, 0.45, 1.5, ['#ff9a3d', '#5ad1ff', '#b38cff', '#7bc96f', '#ffd23f'][k]);
  }
  // 볼링핀
  const pinRows = [[0], [-0.35, 0.35], [-0.7, 0, 0.7], [-1.05, -0.35, 0.35, 1.05]];
  pinRows.forEach((row, r) => row.forEach((dx) => addCyl(-13 + dx, 0.45, -13 - r * 0.6, 0.16, 0.9, 0.4, '#ffffff')));
  pinRows.forEach((row, r) => row.forEach((dx) => addCyl(13 + dx, 0.45, -13 - r * 0.6, 0.16, 0.9, 0.4, '#ffffff')));

  for (const it of items) it.b.sleep();

  // 인스턴스 메쉬
  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), boxItems.length);
  const cylMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), new THREE.MeshLambertMaterial(), cylItems.length);
  const col = new THREE.Color();
  boxItems.forEach((it) => boxMesh.setColorAt(it.i, col.set(it.color)));
  cylItems.forEach((it) => cylMesh.setColorAt(it.i, col.set(it.color)));
  boxMesh.frustumCulled = cylMesh.frustumCulled = false;
  scene.add(boxMesh, cylMesh);
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
  function syncMeshes() {
    for (const it of items) {
      pp.set(it.b.position.x, it.b.position.y, it.b.position.z);
      qq.set(it.b.quaternion.x, it.b.quaternion.y, it.b.quaternion.z, it.b.quaternion.w);
      ss.set(it.s[0], it.s[1], it.s[2]);
      m4.compose(pp, qq, ss);
      (it.kind === 'box' ? boxMesh : cylMesh).setMatrixAt(it.i, m4);
    }
    boxMesh.instanceMatrix.needsUpdate = true;
    cylMesh.instanceMatrix.needsUpdate = true;
  }
  syncMeshes();

  // ───────── 햄스터 볼 콩떡이 ─────────
  const R = 0.6;
  const ball = new CANNON.Body({ mass: 6, shape: new CANNON.Sphere(R), position: new CANNON.Vec3(0, R, 14), linearDamping: 0.15, angularDamping: 0.4 });
  ball.allowSleep = false;
  pw.addBody(ball);
  const ballG = new THREE.Group();
  scene.add(ballG);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), new THREE.MeshLambertMaterial({ color: '#cfefff', transparent: true, opacity: 0.28, depthWrite: false }));
  ballG.add(shell);
  const ringG = new THREE.Group();
  ballG.add(ringG);
  for (const r of [0, Math.PI / 2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.99, 0.025, 6, 32), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    ring.rotation.y = r;
    ringG.add(ring);
  }
  const bean = new Bean('#7bc96f');
  bean.root.scale.setScalar(0.62);
  scene.add(bean.root);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 0.9, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }));
  scene.add(shadow);

  const cam = new FollowCam(camera, input, null, { dist: 7.5, pitch: 0.5, follow: 1.2, height: 0.6, yaw: 0 });
  cam.snap(ball.position);

  // 부딪히는 소리
  let soundBudget = 0;
  const kindPitch = { box: 1, cyl: 1.6 };
  const byBody = new Map(items.map((it) => [it.b, it]));
  pw.addEventListener('beginContact', () => {});
  for (const it of items) {
    it.b.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 2.5 && soundBudget > 0) {
        soundBudget--;
        const p = kindPitch[it.kind] * (0.8 + Math.random() * 0.4);
        sfx.tone('triangle', 180 * p + v * 10, 90 * p, 0.09, Math.min(0.18, v * 0.02));
      }
    });
  }
  ball.addEventListener('collide', (e) => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    const other = e.body === ball ? e.target : e.body;
    if (v > 5 && byBody.has(other)) {
      app.addShake(Math.min(0.25, v * 0.02));
      parts.emit(ball.position, 6, { color: ['#ffffff', '#ffe08a'], speed: v * 0.5, life: 0.35, size: 0.08 });
    }
  });

  const S = { score: 0, knocked: 0, chain: 0, chainT: 0, bestChain: 0, time: TIME, started: false, over: false, dashCd: 0, facing: Math.PI, grounded: false, checkT: 0, spin: new THREE.Quaternion() };
  let best = 0;
  try { best = parseInt(localStorage.getItem('lab-chaos-best') || '0', 10); } catch (_) { /* 무시 */ }
  ctx.setAction('💨', '돌진');
  ctx.setHud('💥 0', best ? `최고 ${best}점 · 움직이면 시작!` : '움직이면 60초 시작!');
  ctx.hint('🎳 굴러가서 전부 무너뜨려! 「돌진」으로 세게 박치기');

  const up = new CANNON.Vec3(0, 1, 0), tmpUp = new CANNON.Vec3();
  function checkKnocks() {
    let newly = 0;
    for (const it of items) {
      if (it.knocked) continue;
      const moved = it.b.position.distanceTo(it.p0) > 0.55;
      it.b.quaternion.vmult(up, tmpUp);
      const tilt = it.kind === 'cyl' || it.s[1] > it.s[0] ? tmpUp.y < 0.8 : false;
      if (moved || tilt) {
        it.knocked = true;
        newly++;
      }
    }
    if (newly && !S.over) {
      S.knocked += newly;
      S.chain += newly;
      S.chainT = 0.9;
      S.bestChain = Math.max(S.bestChain, S.chain);
      const mult = 1 + Math.floor(S.chain / 6);
      S.score += newly * 10 * mult;
      if (S.chain >= 3) popText(`와르르 ×${S.chain}${mult > 1 ? `  (점수 ×${mult})` : ''}`, S.chain >= 12 ? 'trick big' : 'trick');
      if (S.chain >= 10 && S.chain - newly < 10) {
        app.slowmo(0.7, 0.3);
        app.addShake(0.5);
        sfx.success();
      }
    }
  }

  function endGame() {
    S.over = true;
    app.slowmo(1.0, 0.3);
    sfx.fanfare();
    const isBest = S.score > best;
    if (isBest) {
      best = S.score;
      try { localStorage.setItem('lab-chaos-best', String(best)); } catch (_) { /* 무시 */ }
    }
    setTimeout(() => ctx.showResult(isBest ? '🏆 신기록!' : '⏰ 시간 끝!', [
      ['💥', `${S.score}점`], ['🧱', `${S.knocked}/${items.length}개 와르르`], ['🔗', `최대 연쇄 ×${S.bestChain}`], ['🏆', `최고 ${best}점`],
    ]), 1100);
  }

  let acc = 0;
  function update(dt) {
    const inp = input.read();
    soundBudget = Math.min(10, soundBudget + dt * 25);
    const mag = Math.min(1, Math.hypot(inp.mx, inp.my));
    if (!S.started && (mag > 0.2 || inp.jumpPressed || inp.meowPressed)) {
      S.started = true;
      popText('시작!', 'trick');
      sfx.success();
    }
    if (S.started && !S.over) {
      S.time -= dt;
      if (S.time <= 0) { S.time = 0; endGame(); }
      ctx.setHud(`💥 ${S.score}`, `⏱️ ${Math.ceil(S.time)}초  ${S.chain > 2 ? '🔗 ×' + S.chain : ''}`);
      if (S.time < 10 && Math.ceil(S.time) !== Math.ceil(S.time + dt)) sfx.tone('square', 880, 880, 0.06, 0.08);
    }
    const ctrl = !S.over;
    // 입력 → 힘
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let dx = fx * inp.my + rx * inp.mx, dz = fz * inp.my + rz * inp.mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) { dx /= dl; dz /= dl; }
    const v = ball.velocity;
    const hs = Math.hypot(v.x, v.z);
    if (ctrl && mag > 0.1) {
      const along = v.x * dx + v.z * dz;
      if (along < 11) ball.applyForce(new CANNON.Vec3(dx * 260 * mag, 0, dz * 260 * mag), ball.position);
      S.facing = lerpAngle(S.facing, Math.atan2(dx, dz), damp(8, dt));
    } else if (hs > 0.5) S.facing = lerpAngle(S.facing, Math.atan2(v.x, v.z), damp(4, dt));

    // 바닥에 닿았는지
    S.grounded = false;
    for (const c of pw.contacts) {
      if (c.bi === ball && -c.ni.y > 0.5) S.grounded = true;
      else if (c.bj === ball && c.ni.y > 0.5) S.grounded = true;
    }
    if (ctrl && inp.jumpPressed && S.grounded) {
      v.y = 9;
      sfx.jump();
      bean.stretch(0.3);
      parts.emit(ball.position.vadd(new CANNON.Vec3(0, -R, 0)), 10, { color: '#ffffff', speed: 3, up: 0.3, life: 0.4, size: 0.1 });
    }
    S.dashCd -= dt;
    if (ctrl && inp.meowPressed && S.dashCd <= 0) {
      S.dashCd = 0.8;
      const ddx = Math.sin(S.facing), ddz = Math.cos(S.facing);
      v.x = ddx * Math.max(16, hs + 6);
      v.z = ddz * Math.max(16, hs + 6);
      v.y = Math.max(v.y, 2);
      app.addShake(0.2);
      sfx.noiseBurst(0.35, 900, 0.3, 0.6);
      sfx.tone('sawtooth', 300, 900, 0.2, 0.12);
      popText('돌진!', 'trick');
    }
    if (S.dashCd > 0.5) parts.emit(ball.position, 2, { color: ['#bfe8ff', '#ffffff'], speed: 1, life: 0.4, size: 0.12, gravity: 0 });

    // 물리 (고정 시간 간격)
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n < 3) {
      pw.step(1 / 60);
      acc -= 1 / 60;
      n++;
    }
    if (n === 3) acc = 0;

    S.checkT -= dt;
    if (S.checkT < 0) { S.checkT = 0.1; checkKnocks(); }
    S.chainT -= dt;
    if (S.chainT < 0) S.chain = 0;

    // 화면 동기화
    syncMeshes();
    ballG.position.set(ball.position.x, ball.position.y, ball.position.z);
    ringG.quaternion.set(ball.quaternion.x, ball.quaternion.y, ball.quaternion.z, ball.quaternion.w);
    bean.root.position.set(ball.position.x, ball.position.y - R * 0.92, ball.position.z);
    bean.root.rotation.y = S.facing;
    bean.update(dt, { speed: hs, grounded: S.grounded, vy: v.y, lean: clamp(hs * 0.03, 0, 0.3) });
    shadow.position.set(ball.position.x, 0.02, ball.position.z);
    shadow.scale.setScalar(Math.max(0.4, 1 - ball.position.y * 0.1));
    if (ball.position.y < -5) { ball.position.set(0, 2, 14); v.set(0, 0, 0); }

    cam.update(dt, ball.position, S.facing, hs);
    setSpeedLines((hs - 10) / 6);
    app.fovKick += (clamp((hs - 7) * 1.3, 0, 12) - app.fovKick) * damp(4, dt);
    parts.update(dt);
  }

  return {
    update,
    retry() {
      for (const it of items) {
        it.b.position.copy(it.p0);
        it.b.quaternion.copy(it.q0);
        it.b.velocity.set(0, 0, 0);
        it.b.angularVelocity.set(0, 0, 0);
        it.b.sleep();
        it.knocked = false;
      }
      ball.position.set(0, R, 14);
      ball.velocity.set(0, 0, 0);
      ball.angularVelocity.set(0, 0, 0);
      Object.assign(S, { score: 0, knocked: 0, chain: 0, chainT: 0, bestChain: 0, time: TIME, started: false, over: false });
      cam.yaw = 0;
      ctx.setHud('💥 0', best ? `최고 ${best}점 · 움직이면 시작!` : '움직이면 60초 시작!');
    },
  };
}
