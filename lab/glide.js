import { THREE, Bean, Particles, popText, setSpeedLines, damp, clamp } from './common.js';

const SIZE = 1600, SEG = 160;

// ───────── 지형 (값 노이즈) ─────────
function hash(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) {
    s += a * vnoise(x * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
function heightAt(x, z) {
  const n = fbm(x / 360 + 11, z / 360 + 7);
  const r = 1 - Math.abs(fbm(x / 160 + 40, z / 160) - 0.5) * 2;
  let h = (n - 0.43) * 300 + (n > 0.45 ? r * r * 45 : 0);
  const d = Math.hypot(x, z) / 760;
  h -= d * d * d * 160;
  // 출발 지점 주변은 산
  h += Math.max(0, 1 - Math.hypot(x, z) / 160) * 70;
  return h;
}

export function create(ctx) {
  const { app, input, sfx } = ctx;
  const { scene, camera } = app;
  camera.far = 1600;
  camera.updateProjectionMatrix();
  scene.fog.near = 140;
  scene.fog.far = 820;
  app.sun.position.set(300, 400, 200);
  const parts = new Particles(scene, 600);

  // 지형 메쉬
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const heights = new Float32Array((SEG + 1) * (SEG + 1));
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    const y = Math.max(-10, h);
    pos.setY(i, y);
    heights[i] = y;
    const j = (hash(Math.round(x), Math.round(z)) - 0.5) * 0.06;
    if (h < 2.5) c.set('#f1dca0');
    else if (h < 35) c.set('#8fd16a');
    else if (h < 75) c.set('#5fae5a');
    else if (h < 115) c.set('#9a8f84');
    else c.set('#f7f7fb');
    c.offsetHSL(0, 0, j);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  scene.add(terrain);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshLambertMaterial({ color: '#4fb3e0' }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  scene.add(sea);

  const cell = SIZE / SEG;
  function ground(x, z) {
    const gx = (x + SIZE / 2) / cell, gz = (z + SIZE / 2) / cell;
    if (gx < 0 || gz < 0 || gx >= SEG || gz >= SEG) return -10;
    const xi = Math.floor(gx), zi = Math.floor(gz), fx = gx - xi, fz = gz - zi;
    const i = zi * (SEG + 1) + xi;
    const a = heights[i], b = heights[i + 1], cc = heights[i + SEG + 1], d = heights[i + SEG + 2];
    return a + (b - a) * fx + (cc - a) * fz + (a - b - cc + d) * fx * fz;
  }

  // 나무, 집, 구름
  const rnd = (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const trees = [], houses = [];
  for (let i = 0; i < 6000 && trees.length < 2200; i++) {
    const x = (rnd() - 0.5) * SIZE * 0.95, z = (rnd() - 0.5) * SIZE * 0.95;
    const h = heightAt(x, z);
    if (h > 5 && h < 90 && fbm(x / 60, z / 60) > 0.48) trees.push([x, ground(x, z), z, 0.7 + rnd() * 0.8]);
    else if (h > 3 && h < 18 && houses.length < 260 && rnd() < 0.08) houses.push([x, ground(x, z), z, rnd()]);
  }
  const d = new THREE.Object3D();
  const leafMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 6, 6).translate(0, 4.5, 0), new THREE.MeshLambertMaterial({ flatShading: true }), trees.length);
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 2, 5).translate(0, 1, 0), new THREE.MeshLambertMaterial({ color: '#7a5a3c' }), trees.length);
  trees.forEach(([x, y, z, s], i) => {
    d.position.set(x, y, z);
    d.scale.setScalar(s);
    d.rotation.set(0, i, 0);
    d.updateMatrix();
    leafMesh.setMatrixAt(i, d.matrix);
    trunkMesh.setMatrixAt(i, d.matrix);
    leafMesh.setColorAt(i, c.set(['#3f8f4a', '#4fa35a', '#2f7a44', '#f2b630', '#e8833a'][i % 5]));
  });
  leafMesh.computeBoundingSphere();
  trunkMesh.computeBoundingSphere();
  scene.add(leafMesh, trunkMesh);
  const houseMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 4, 6).translate(0, 2, 0), new THREE.MeshLambertMaterial(), houses.length);
  const roofMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(4.6, 2.6, 4).rotateY(Math.PI / 4).translate(0, 5.3, 0), new THREE.MeshLambertMaterial(), houses.length);
  houses.forEach(([x, y, z, r], i) => {
    d.position.set(x, y - 0.5, z);
    d.scale.set(1, 1, 1);
    d.rotation.set(0, r * 6, 0);
    d.updateMatrix();
    houseMesh.setMatrixAt(i, d.matrix);
    roofMesh.setMatrixAt(i, d.matrix);
    houseMesh.setColorAt(i, c.set(['#fff6e6', '#f2e2c9', '#e6f0ff', '#ffe7e0'][i % 4]));
    roofMesh.setColorAt(i, c.set(['#e5433c', '#2b78c9', '#f2b51d', '#3fae5a'][i % 4]));
  });
  houseMesh.computeBoundingSphere();
  roofMesh.computeBoundingSphere();
  scene.add(houseMesh, roofMesh);
  const cloudMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#888888', flatShading: true }), 420);
  for (let i = 0; i < 420; i++) {
    const g = Math.floor(i / 6);
    const gr = mulRand(g);
    d.position.set((gr[0] - 0.5) * SIZE * 1.2 + (rnd() - 0.5) * 30, 150 + gr[1] * 90 + (rnd() - 0.5) * 8, (gr[2] - 0.5) * SIZE * 1.2 + (rnd() - 0.5) * 30);
    d.scale.set(10 + rnd() * 14, 6 + rnd() * 6, 10 + rnd() * 14);
    d.rotation.set(0, rnd() * 3, 0);
    d.updateMatrix();
    cloudMesh.setMatrixAt(i, d.matrix);
  }
  cloudMesh.computeBoundingSphere();
  scene.add(cloudMesh);
  function mulRand(g) {
    return [hash(g, 1), hash(g, 2), hash(g, 3)];
  }

  // 출발 바위 기둥
  const startTop = Math.max(heightAt(0, 0), 0) + 55;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, startTop + 20, 8), new THREE.MeshLambertMaterial({ color: '#a08f80', flatShading: true }));
  pillar.position.set(0, (startTop - 20) / 2, 0);
  scene.add(pillar);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.8, 12), new THREE.MeshLambertMaterial({ color: '#c98b5a' }));
  deck.position.set(0, startTop - 0.4, 0);
  scene.add(deck);

  // 링 코스 + 상승기류
  const rings = [];
  const ringGeo = new THREE.TorusGeometry(6, 0.5, 8, 28);
  let rp = new THREE.Vector3(0, startTop - 8, 70), dir = 0;
  for (let i = 0; i < 26; i++) {
    dir += (hash(i, 77) - 0.5) * 0.9;
    const step = 80 + hash(i, 5) * 40;
    const np = rp.clone().add(new THREE.Vector3(Math.sin(dir) * step, 0, Math.cos(dir) * step));
    const gh = Math.max(0, heightAt(np.x, np.z));
    np.y = Math.max(gh + 30, rp.y - 10 + (i % 6 === 5 ? 50 : 0));
    const m = new THREE.Mesh(ringGeo, new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#a06000' }));
    m.position.copy(np);
    const fwd = np.clone().sub(rp).normalize();
    m.lookAt(np.clone().add(fwd));
    scene.add(m);
    rings.push({ m, p: np, n: fwd, got: false, side: -1 });
    rp = np;
  }
  const drafts = [];
  const draftMat = new THREE.MeshBasicMaterial({ color: '#bfefff', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const addDraft = (x, z) => {
    const gh = Math.max(0, heightAt(x, z));
    const col = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 260, 16, 1, true), draftMat);
    col.position.set(x, gh + 130, z);
    scene.add(col);
    drafts.push({ x, z, gy: gh, r: 14 });
  };
  for (let i = 4; i < rings.length; i += 5) addDraft(rings[i].p.x + 25, rings[i].p.z + 10);
  for (let i = 0; i < 10; i++) addDraft((hash(i, 9) - 0.5) * SIZE * 0.8, (hash(i, 19) - 0.5) * SIZE * 0.8);

  // ───────── 글라이더 콩떡이 ─────────
  const rig = new THREE.Group();
  scene.add(rig);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.25, 1.4, -2.1, 0, -0.7, 0, 0.1, -0.35, 0, 0.25, 1.4, 0, 0.1, -0.35, 2.1, 0, -0.7], 3));
  wingGeo.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.55, 0.36, 1, 0.82, 0.25, 1, 0.82, 0.25, 1, 0.55, 0.36, 1, 0.82, 0.25, 0.36, 0.82, 1], 3));
  wingGeo.computeVertexNormals();
  const wing = new THREE.Mesh(wingGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  wing.position.y = 1.55;
  rig.add(wing);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#444' }));
  bar.position.set(0, 1.05, 0.2);
  rig.add(bar);
  const bean = new Bean('#b38cff');
  bean.root.scale.setScalar(0.8);
  rig.add(bean.root);
  // 날개 끝 바람 자국
  const trailPts = [[], []];
  const trailGeo = [0, 1].map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(40 * 3), 3));
    return g;
  });
  trailGeo.forEach((g) => scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }))));

  const S = {
    p: new THREE.Vector3(0, startTop, 0), yaw: 0, pitch: 0, roll: 0, speed: 0, vy: 0,
    state: 'ready', dist: 0, time: 0, ringsGot: 0, feathers: 3, maxSpeed: 0, ended: false,
  };
  let best = 0;
  try { best = parseFloat(localStorage.getItem('lab-glide-best') || '0'); } catch (_) { /* 무시 */ }
  ctx.setAction('💨', '부스트');
  ctx.setHud('🪂 0m', best ? `최고 ${(best / 1000).toFixed(2)}km · 점프로 출발!` : '점프 버튼으로 출발!');
  ctx.hint('🪂 점프로 출발! 앞으로 밀면 급강하(가속), 당기면 상승. 좌우로 선회');

  // 바람 소리
  let wind = null;
  function ensureWind() {
    if (wind || !sfx.ctx || sfx.muted) return;
    const a = sfx.ctx;
    const src = a.createBufferSource();
    src.buffer = sfx.noise;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.7;
    const g = a.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(sfx.master);
    src.start();
    wind = { f, g, src };
  }

  const camPos = new THREE.Vector3(0, startTop + 3, -9);
  const look = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  function end(kind) {
    S.state = 'over';
    S.ended = true;
    const msgs = { land: '🪂 착륙 성공!', crash: '💥 쿵! 추락', water: '🌊 풍덩!' };
    if (kind === 'land') { sfx.success(); popText('착륙 성공! +500m 보너스', 'trick big'); S.dist += 500; }
    else { app.addShake(0.6); sfx.land(true); parts.emit(S.p, 40, { color: kind === 'water' ? ['#bfefff', '#ffffff', '#4fb3e0'] : ['#8fd16a', '#7a5a3c', '#ffffff'], speed: 9, up: 1.4, life: 1, size: 0.25, gravity: 12 }); }
    const isBest = S.dist > best;
    if (isBest) { best = S.dist; try { localStorage.setItem('lab-glide-best', String(best)); } catch (_) { /* 무시 */ } }
    setTimeout(() => ctx.showResult(isBest ? '🏆 신기록! ' + msgs[kind] : msgs[kind], [
      ['🪂', `비행 ${(S.dist / 1000).toFixed(2)}km`], ['⏱️', `${Math.floor(S.time)}초 비행`], ['💍', `링 ${S.ringsGot}/${rings.length}`], ['⚡', `최고 ${Math.round(S.maxSpeed * 3.6)}km/h`],
    ]), 1200);
    if (wind) wind.g.gain.value = 0;
  }

  function update(dt) {
    const inp = input.read();
    const t = performance.now() / 1000;
    ensureWind();
    if (S.state === 'ready') {
      S.yaw += -inp.mx * dt * 1.5;
      if (inp.jumpPressed || inp.my > 0.5) {
        S.state = 'fly';
        S.speed = 17;
        S.pitch = -0.15;
        sfx.jump();
        popText('출발!', 'trick');
        app.addShake(0.15);
      }
    } else if (S.state === 'fly') {
      S.time += dt;
      // 조종
      const stall = S.speed < 8;
      let pt = -0.1 - inp.my * 0.75;
      if (stall) pt = Math.min(pt, -0.45);
      S.pitch += (clamp(pt, -0.9, 0.7) - S.pitch) * damp(2.6, dt);
      S.roll += (clamp(inp.mx, -1, 1) * 0.85 - S.roll) * damp(4, dt);
      S.yaw -= S.roll * (0.9 + Math.min(1, S.speed / 30) * 0.5) * dt;
      // 속도 (위치에너지 ↔ 속도)
      S.speed += (-12 * Math.sin(S.pitch) - 0.0034 * S.speed * S.speed) * dt;
      S.speed = clamp(S.speed, 4, 70);
      // 상승기류
      let inDraft = false;
      for (const dr of drafts) {
        const dx = S.p.x - dr.x, dz = S.p.z - dr.z;
        if (dx * dx + dz * dz < dr.r * dr.r && S.p.y < dr.gy + 260) inDraft = true;
      }
      S.vy += ((inDraft ? 16 : -1.3) - S.vy) * damp(inDraft ? 2 : 1.5, dt);
      if (inDraft && Math.random() < 0.3) parts.emit(S.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, -3, (Math.random() - 0.5) * 6)), 1, { color: '#ffffff', speed: 1, vy: 14, up: 0, life: 0.8, size: 0.12, gravity: 0 });
      if (inDraft && !S.wasDraft) { popText('⬆ 상승기류!', 'trick'); sfx.tone('sine', 300, 700, 0.5, 0.12); S.feathers = Math.min(3, S.feathers + 1); }
      S.wasDraft = inDraft;
      // 날갯짓 / 부스트
      if ((inp.jumpPressed || inp.meowPressed) && S.feathers > 0) {
        S.feathers--;
        if (inp.jumpPressed) { S.vy = Math.max(S.vy, 0) + 9; popText('파닥!', 'trick'); }
        else { S.speed += 14; popText('부스트!', 'trick'); }
        sfx.flap();
        bean.stretch(0.3);
        app.addShake(0.12);
        parts.emit(S.p.clone().setY(S.p.y + 1.5), 14, { color: ['#ffffff', '#ffe0f0'], speed: 4, life: 0.8, size: 0.14, gravity: 2 });
      }
      fwd.set(Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), Math.cos(S.yaw) * Math.cos(S.pitch));
      const ox = S.p.x, oz = S.p.z;
      S.p.addScaledVector(fwd, S.speed * dt);
      S.p.y += S.vy * dt;
      S.dist += Math.hypot(S.p.x - ox, S.p.z - oz);
      S.maxSpeed = Math.max(S.maxSpeed, S.speed);
      // 링 통과
      for (const r of rings) {
        if (r.got) continue;
        const rel = S.p.clone().sub(r.p);
        const side = Math.sign(rel.dot(r.n));
        if (rel.length() < 7 && side > 0 && r.side < 0) {
          r.got = true;
          S.ringsGot++;
          S.speed += 6;
          S.feathers = Math.min(3, S.feathers + 1);
          r.m.material.color.set('#7bc96f');
          r.m.material.emissive.set('#1f5f1f');
          sfx.pickup();
          sfx.sparkle();
          app.addShake(0.1);
          parts.emit(r.p, 30, { color: ['#ffd23f', '#ffffff', '#7bc96f'], speed: 8, life: 0.8, size: 0.2, gravity: 0, spread: 8, spreadY: 8 });
          popText(`💍 링 ${S.ringsGot}!`, 'trick');
        }
        r.side = rel.length() < 30 ? side : -1;
      }
      // 충돌
      const gh = Math.max(ground(S.p.x, S.p.z), 0);
      if (S.p.y < gh + 0.6) {
        S.p.y = gh + 0.6;
        if (gh <= 0.01 && ground(S.p.x, S.p.z) < 0) end('water');
        else if (S.speed < 15 && S.pitch > -0.4) end('land');
        else end('crash');
      }
      if (Math.abs(S.p.x) > SIZE * 0.8 || Math.abs(S.p.z) > SIZE * 0.8) {
        S.yaw += Math.PI * dt;
        ctx.hint('🌊 너무 멀리 왔어! 돌아가자');
      }
      ctx.setHud(`🪂 ${S.dist < 1000 ? Math.round(S.dist) + 'm' : (S.dist / 1000).toFixed(2) + 'km'}`, `⬆ ${Math.round(S.p.y - gh)}m · ${Math.round(S.speed * 3.6)}km/h · ${'🪶'.repeat(S.feathers)}${'·'.repeat(3 - S.feathers)}`);
    }

    // 화면
    rig.position.copy(S.p);
    rig.rotation.set(0, 0, 0);
    rig.rotateY(S.yaw);
    rig.rotateX(-S.pitch);
    rig.rotateZ(-S.roll * 0.9);
    bean.root.position.set(0, S.state === 'ready' ? 0 : 0.05, 0);
    bean.update(dt, { speed: S.state === 'ready' ? 0 : 3, grounded: S.state !== 'fly', vy: S.vy, lean: S.state === 'fly' ? 0.5 : 0 });
    wing.rotation.z = Math.sin(t * 3) * 0.02;

    // 날개 끝 자국
    if (S.state === 'fly' && S.speed > 22) {
      for (let k = 0; k < 2; k++) {
        const tip = new THREE.Vector3(k ? 2.1 : -2.1, 1.55, -0.7).applyMatrix4(rig.matrixWorld);
        trailPts[k].unshift(tip);
        if (trailPts[k].length > 40) trailPts[k].pop();
      }
    } else for (const tp of trailPts) tp.pop();
    rig.updateMatrixWorld();
    trailGeo.forEach((g, k) => {
      const arr = g.attributes.position.array;
      const pts = trailPts[k];
      for (let i = 0; i < 40; i++) {
        const p = pts[Math.min(i, pts.length - 1)] || S.p;
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      g.attributes.position.needsUpdate = true;
      g.setDrawRange(0, pts.length);
    });

    // 링 반짝
    for (const r of rings) if (!r.got) r.m.rotation.z = t;

    // 카메라 (뒤에서 따라가기)
    const back = new THREE.Vector3(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
    const dist = 9 + Math.min(6, S.speed * 0.08);
    const want = S.p.clone().addScaledVector(back, dist).add(new THREE.Vector3(0, 4.6 - S.pitch * 4, 0));
    const camGround = Math.max(ground(want.x, want.z), 0) + 1.5;
    if (want.y < camGround) want.y = camGround;
    camPos.lerp(want, damp(S.state === 'ready' ? 3 : 5, dt));
    camera.position.copy(camPos);
    look.copy(S.p).addScaledVector(fwd.lengthSq() ? fwd : back.clone().negate(), 6).setY(S.p.y + 1.2);
    camera.up.set(Math.sin(S.roll) * 0.15 * Math.cos(S.yaw), 1, -Math.sin(S.roll) * 0.15 * Math.sin(S.yaw)).normalize();
    camera.lookAt(look);

    const sp = S.state === 'fly' ? S.speed : 0;
    setSpeedLines((sp - 28) / 20);
    app.fovKick += (clamp((sp - 18) * 0.5, 0, 18) - app.fovKick) * damp(3, dt);
    if (wind) {
      wind.g.gain.value = S.state === 'fly' ? clamp(sp / 60, 0.05, 0.6) : 0;
      wind.f.frequency.value = 300 + sp * 25;
    }
    parts.update(dt);
  }

  return {
    update,
    retry() {
      Object.assign(S, { yaw: 0, pitch: 0, roll: 0, speed: 0, vy: 0, state: 'ready', dist: 0, time: 0, ringsGot: 0, feathers: 3, maxSpeed: 0, ended: false });
      S.p.set(0, startTop, 0);
      camPos.set(0, startTop + 3, -9);
      for (const r of rings) { r.got = false; r.side = -1; r.m.material.color.set('#ffd23f'); r.m.material.emissive.set('#a06000'); }
      trailPts[0].length = trailPts[1].length = 0;
      ctx.setHud('🪂 0m', best ? `최고 ${(best / 1000).toFixed(2)}km · 점프로 출발!` : '점프 버튼으로 출발!');
    },
  };
}
