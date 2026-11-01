import * as THREE from '../vendor/three.module.min.js';
import { mergeColored, mulberry32, radialTexture } from './util.js';
import { BLOCK, Y0 } from './world.js';

const sph = new THREE.SphereGeometry(1, 10, 8);
const boxG = new THREE.BoxGeometry(1, 1, 1);
const coneG = new THREE.ConeGeometry(1, 1, 6);

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────── 생선 간식 ─────────
export class FishSet {
  constructor(scene, points) {
    this.points = points;
    const geo = mergeColored([
      { geo: sph, color: '#8cc2e6', scale: [0.075, 0.1, 0.16] },
      { geo: coneG, color: '#5f9bc8', pos: [0, 0, -0.19], rot: [-Math.PI / 2, 0, 0], scale: [0.08, 0.1, 0.03] },
      { geo: sph, color: '#ffffff', pos: [0.05, 0.03, 0.09], scale: [0.025, 0.025, 0.025] },
      { geo: sph, color: '#1a1a1a', pos: [0.062, 0.03, 0.095], scale: [0.013, 0.013, 0.013] },
      { geo: sph, color: '#ffffff', pos: [-0.05, 0.03, 0.09], scale: [0.025, 0.025, 0.025] },
      { geo: sph, color: '#1a1a1a', pos: [-0.062, 0.03, 0.095], scale: [0.013, 0.013, 0.013] },
    ]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#1c3550' });
    this.mesh = new THREE.InstancedMesh(geo, mat, points.length);
    this.mesh.frustumCulled = false;
    this.collected = new Array(points.length).fill(false);
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
    // 반짝이 바닥 빛
    const glowMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,240,160,0.9)', 'rgba(255,240,160,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), glowMat, points.length);
    this.glow.frustumCulled = false;
    scene.add(this.glow);
    this.update(0, 0);
  }

  setCollected(arr) {
    for (let i = 0; i < this.collected.length; i++) this.collected[i] = !!arr[i];
  }

  update(dt, t) {
    const d = this.dummy;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (this.collected[i]) {
        d.scale.setScalar(0);
        d.position.set(p.x, -10, p.z);
      } else {
        d.position.set(p.x, p.y + 0.38 + Math.sin(t * 2.4 + i) * 0.07, p.z);
        d.rotation.set(0, t * 1.8 + i, 0.15);
        d.scale.setScalar(1);
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      d.position.y = this.collected[i] ? -10 : p.y + 0.03;
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(this.collected[i] ? 0 : 0.9 + Math.sin(t * 3 + i) * 0.15);
      d.updateMatrix();
      this.glow.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
  }

  tryCollect(pos) {
    for (let i = 0; i < this.points.length; i++) {
      if (this.collected[i]) continue;
      const p = this.points[i];
      const dx = p.x - pos.x, dz = p.z - pos.z, dy = p.y + 0.38 - (pos.y + 0.3);
      if (dx * dx + dz * dz < 0.55 && Math.abs(dy) < 0.75) {
        this.collected[i] = true;
        return i;
      }
    }
    return -1;
  }
}

// ───────── 비둘기 ─────────
const pigeonBody = mergeColored([
  { geo: sph, color: '#8d929c', scale: [0.11, 0.1, 0.16], pos: [0, 0.14, 0] },
  { geo: sph, color: '#6f7480', scale: [0.065, 0.065, 0.07], pos: [0, 0.26, 0.11] },
  { geo: sph, color: '#5d9a83', scale: [0.07, 0.05, 0.06], pos: [0, 0.2, 0.09] },
  { geo: coneG, color: '#3b3b3b', scale: [0.018, 0.05, 0.018], pos: [0, 0.25, 0.19], rot: [Math.PI / 2, 0, 0] },
  { geo: sph, color: '#ff8a3d', scale: [0.012, 0.012, 0.012], pos: [0.04, 0.28, 0.15] },
  { geo: sph, color: '#ff8a3d', scale: [0.012, 0.012, 0.012], pos: [-0.04, 0.28, 0.15] },
  { geo: boxG, color: '#5d626c', scale: [0.1, 0.02, 0.12], pos: [0, 0.15, -0.18] },
  { geo: boxG, color: '#e2737e', scale: [0.02, 0.06, 0.02], pos: [0.04, 0.03, 0.02] },
  { geo: boxG, color: '#e2737e', scale: [0.02, 0.06, 0.02], pos: [-0.04, 0.03, 0.02] },
]);
const wingGeo = mergeColored([{ geo: boxG, color: '#7c818c', scale: [0.2, 0.02, 0.12], pos: [0.1, 0, 0] }]);

export class Pigeons {
  constructor(scene, points, rand) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.list = points.map((p) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(pigeonBody, mat);
      g.add(body);
      const wl = new THREE.Mesh(wingGeo, mat);
      const wr = new THREE.Mesh(wingGeo, mat);
      wl.position.set(0.06, 0.17, 0);
      wr.position.set(-0.06, 0.17, 0);
      wr.scale.x = -1;
      wl.visible = wr.visible = false;
      g.add(wl, wr);
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = rand() * Math.PI * 2;
      scene.add(g);
      return { g, body, wl, wr, home: p, state: 'idle', t: rand() * 5, vel: new THREE.Vector3(), timer: 0, peck: 0 };
    });
  }

  // 놀래킨 비둘기 수 반환
  update(dt, catPos, scareR) {
    let scared = 0;
    for (const b of this.list) {
      b.t += dt;
      const dx = b.g.position.x - catPos.x, dz = b.g.position.z - catPos.z, dy = b.g.position.y - catPos.y;
      const d2 = dx * dx + dz * dz;
      if (b.state === 'idle') {
        b.peck -= dt;
        if (b.peck < 0) b.peck = 1 + Math.random() * 3;
        b.body.rotation.x = b.peck < 0.3 ? Math.sin((b.peck / 0.3) * Math.PI) * 0.5 : 0;
        if (Math.random() < dt * 0.3) b.g.rotation.y += (Math.random() - 0.5) * 2;
        if (d2 < scareR * scareR && Math.abs(dy) < 2.5) {
          b.state = 'fly';
          b.timer = 0;
          const d = Math.sqrt(d2) || 1;
          b.vel.set((dx / d) * 5, 6, (dz / d) * 5);
          b.g.rotation.y = Math.atan2(dx, dz);
          b.wl.visible = b.wr.visible = true;
          scared++;
        }
      } else if (b.state === 'fly') {
        b.timer += dt;
        b.vel.y = Math.max(2.5, b.vel.y - dt * 2);
        b.g.position.addScaledVector(b.vel, dt);
        const f = Math.sin(b.t * 28) * 0.9;
        b.wl.rotation.z = f;
        b.wr.rotation.z = -f;
        b.body.rotation.x = -0.3;
        if (b.timer > 3.5) {
          b.state = 'gone';
          b.g.visible = false;
          b.timer = 0;
        }
      } else if (b.state === 'gone') {
        b.timer += dt;
        const hx = b.home.x - catPos.x, hz = b.home.z - catPos.z;
        if (b.timer > 25 && hx * hx + hz * hz > 225) {
          b.state = 'idle';
          b.g.visible = true;
          b.g.position.set(b.home.x, b.home.y, b.home.z);
          b.wl.visible = b.wr.visible = false;
          b.body.rotation.x = 0;
        }
      }
    }
    return scared;
  }
}

// ───────── 나비 ─────────
export class Butterflies {
  constructor(scene, homes, rand) {
    const wing = new THREE.CircleGeometry(0.11, 8).translate(0.1, 0, 0);
    this.list = homes.map((h, i) => {
      const color = ['#ffffff', '#ffe066', '#ffd1e8', '#bfe3ff'][i % 4];
      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
      const g = new THREE.Group();
      const wl = new THREE.Mesh(wing, mat);
      const wr = new THREE.Mesh(wing, mat);
      wl.rotation.x = wr.rotation.x = -Math.PI / 2;
      g.add(wl, wr);
      scene.add(g);
      const b = { g, wl, wr, home: h, t: rand() * 10, seed: rand() * 100, gone: 0 };
      this.place(b, 0);
      return b;
    });
  }

  place(b, t) {
    const s = b.seed;
    b.g.position.set(
      b.home.x + Math.sin(t * 0.31 + s) * 4.5 + Math.sin(t * 0.73 + s * 2) * 1.5,
      b.home.y + 1.1 + Math.sin(t * 0.9 + s) * 0.6 + Math.sin(t * 2.3) * 0.15,
      b.home.z + Math.cos(t * 0.27 + s * 1.3) * 4.5 + Math.sin(t * 0.61 + s) * 1.5,
    );
  }

  update(dt, catPos) {
    let caught = null;
    for (const b of this.list) {
      b.t += dt;
      if (b.gone > 0) {
        b.gone -= dt;
        if (b.gone <= 0) b.g.visible = true;
        else continue;
      }
      const prev = b.g.position.clone();
      this.place(b, b.t);
      const v = b.g.position.clone().sub(prev);
      if (v.lengthSq() > 1e-8) b.g.rotation.y = Math.atan2(v.x, v.z) - Math.PI / 2;
      const f = Math.sin(b.t * 22) * 1.1;
      b.wl.rotation.y = f;
      b.wr.rotation.y = Math.PI - f;
      const dx = b.g.position.x - catPos.x, dy = b.g.position.y - (catPos.y + 0.35), dz = b.g.position.z - catPos.z;
      if (dx * dx + dy * dy + dz * dz < 0.45 * 0.45 * 4) {
        b.gone = 30;
        b.g.visible = false;
        caught = b.g.position.clone();
      }
    }
    return caught;
  }
}

// ───────── 사람 (행인 + 츄르 할머니) ─────────
function personGeo(o) {
  const parts = [
    { geo: boxG, color: o.shirt, scale: [0.46, 0.58, 0.28], pos: [0, 1.12, 0] },
    { geo: boxG, color: o.shirt, scale: [0.13, 0.5, 0.15], pos: [0.3, 1.13, 0] },
    { geo: boxG, color: o.shirt, scale: [0.13, 0.5, 0.15], pos: [-0.3, 1.13, 0] },
    { geo: sph, color: '#f1c9a5', scale: [0.07, 0.07, 0.07], pos: [0.3, 0.84, 0] },
    { geo: sph, color: '#f1c9a5', scale: [0.07, 0.07, 0.07], pos: [-0.3, 0.84, 0] },
    { geo: sph, color: '#f1c9a5', scale: [0.2, 0.21, 0.2], pos: [0, 1.62, 0] },
    { geo: sph, color: o.hair, scale: [0.215, 0.16, 0.215], pos: [0, 1.7, -0.02] },
    { geo: sph, color: '#2b2b2b', scale: [0.025, 0.03, 0.02], pos: [0.07, 1.63, 0.18] },
    { geo: sph, color: '#2b2b2b', scale: [0.025, 0.03, 0.02], pos: [-0.07, 1.63, 0.18] },
    { geo: sph, color: '#ff9fb0', scale: [0.04, 0.02, 0.01], pos: [0.12, 1.57, 0.17] },
    { geo: sph, color: '#ff9fb0', scale: [0.04, 0.02, 0.01], pos: [-0.12, 1.57, 0.17] },
  ];
  if (o.bag) parts.push({ geo: boxG, color: o.bag, scale: [0.34, 0.4, 0.14], pos: [0, 1.15, -0.22] });
  return mergeColored(parts);
}

const SHIRTS = ['#4f7cc9', '#e07a5f', '#f2cc8f', '#81b29a', '#9b72cf', '#f4f1de', '#3d405b', '#e5989b'];
const HAIRS = ['#2b2222', '#3b2a20', '#5a3d2b', '#1b1b1b', '#7a5233'];
const PANTS = ['#2f3e5c', '#3a3a3a', '#6b5b4b', '#455a64'];

export class Walkers {
  constructor(scene, blocks, rand) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const legGeo = new THREE.BoxGeometry(0.17, 0.82, 0.19).translate(0, -0.41, 0);
    const vBlocks = shuffle(blocks, rand).slice(0, 7);
    this.list = vBlocks.map((b, i) => {
      const g = new THREE.Group();
      const geo = personGeo({ shirt: SHIRTS[i % SHIRTS.length], hair: HAIRS[i % HAIRS.length], bag: rand() < 0.5 ? '#c96f4a' : null });
      const body = new THREE.Mesh(geo, mat);
      g.add(body);
      const legMat = new THREE.MeshLambertMaterial({ color: PANTS[i % PANTS.length] });
      const ll = new THREE.Mesh(legGeo, legMat);
      const lr = new THREE.Mesh(legGeo, legMat);
      ll.position.set(0.11, 0.84, 0);
      lr.position.set(-0.11, 0.84, 0);
      g.add(ll, lr);
      scene.add(g);
      const o = 1.35;
      const path = [
        [b.x0 + o, b.z0 + o],
        [b.x0 + BLOCK - o, b.z0 + o],
        [b.x0 + BLOCK - o, b.z0 + BLOCK - o],
        [b.x0 + o, b.z0 + BLOCK - o],
      ];
      const dir = rand() < 0.5 ? 1 : -1;
      const w = { g, ll, lr, path, seg: Math.floor(rand() * 4), u: rand(), dir, speed: 1.1 + rand() * 0.4, t: 0, pause: 0, bubbleCd: 0 };
      return w;
    });
  }

  update(dt) {
    for (const w of this.list) {
      w.bubbleCd = Math.max(0, w.bubbleCd - dt);
      if (w.pause > 0) {
        w.pause -= dt;
        w.ll.rotation.x = w.lr.rotation.x = 0;
        continue;
      }
      if (Math.random() < dt * 0.04) w.pause = 1.5 + Math.random() * 2;
      const a = w.path[w.seg];
      const b = w.path[(w.seg + (w.dir > 0 ? 1 : 3)) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      w.u += (w.speed * dt) / len;
      if (w.u >= 1) {
        w.u = 0;
        w.seg = (w.seg + (w.dir > 0 ? 1 : 3)) % 4;
      }
      const x = a[0] + (b[0] - a[0]) * w.u, z = a[1] + (b[1] - a[1]) * w.u;
      w.g.position.set(x, Y0, z);
      w.g.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
      w.t += dt * w.speed * 5;
      w.ll.rotation.x = Math.sin(w.t) * 0.5;
      w.lr.rotation.x = -Math.sin(w.t) * 0.5;
      w.g.children[0].position.y = Math.abs(Math.sin(w.t)) * 0.04;
    }
  }
}

export class Granny {
  constructor(scene, spot) {
    const parts = [
      // 의자
      { geo: boxG, color: '#e5433c', scale: [0.42, 0.4, 0.42], pos: [0, 0.2, -0.05] },
      // 몸 (꽃무늬 조끼)
      { geo: boxG, color: '#c75a7a', scale: [0.5, 0.52, 0.32], pos: [0, 0.68, -0.05] },
      { geo: sph, color: '#f4d35e', scale: [0.04, 0.04, 0.02], pos: [0.12, 0.75, 0.12] },
      { geo: sph, color: '#f4d35e', scale: [0.04, 0.04, 0.02], pos: [-0.1, 0.6, 0.12] },
      { geo: sph, color: '#ffffff', scale: [0.035, 0.035, 0.02], pos: [-0.05, 0.82, 0.12] },
      // 다리 (앉은 자세)
      { geo: boxG, color: '#5b4b6b', scale: [0.46, 0.16, 0.42], pos: [0, 0.48, 0.15] },
      { geo: boxG, color: '#5b4b6b', scale: [0.18, 0.42, 0.18], pos: [0.12, 0.21, 0.32] },
      { geo: boxG, color: '#5b4b6b', scale: [0.18, 0.42, 0.18], pos: [-0.12, 0.21, 0.32] },
      // 팔
      { geo: boxG, color: '#c75a7a', scale: [0.12, 0.12, 0.34], pos: [0.27, 0.72, 0.14] },
      { geo: boxG, color: '#c75a7a', scale: [0.12, 0.12, 0.34], pos: [-0.27, 0.72, 0.14] },
      { geo: sph, color: '#f1c9a5', scale: [0.065, 0.065, 0.065], pos: [0.22, 0.72, 0.32] },
      // 츄르
      { geo: boxG, color: '#ffffff', scale: [0.05, 0.03, 0.24], pos: [0.22, 0.73, 0.44] },
      { geo: boxG, color: '#ff8a3d', scale: [0.055, 0.035, 0.08], pos: [0.22, 0.73, 0.38] },
      // 머리
      { geo: sph, color: '#f1c9a5', scale: [0.19, 0.2, 0.19], pos: [0, 1.15, -0.03] },
      { geo: sph, color: '#2b2b2b', scale: [0.024, 0.012, 0.02], pos: [0.07, 1.16, 0.15] },
      { geo: sph, color: '#2b2b2b', scale: [0.024, 0.012, 0.02], pos: [-0.07, 1.16, 0.15] },
      { geo: sph, color: '#ff9fb0', scale: [0.04, 0.02, 0.01], pos: [0.11, 1.1, 0.15] },
      { geo: sph, color: '#ff9fb0', scale: [0.04, 0.02, 0.01], pos: [-0.11, 1.1, 0.15] },
    ];
    // 보라색 뽀글머리
    const rnd = mulberry32(7);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      parts.push({ geo: sph, color: i % 2 ? '#a58bd6' : '#9478c9', scale: [0.08, 0.08, 0.08], pos: [Math.cos(a) * 0.15, 1.24 + rnd() * 0.06, -0.04 + Math.sin(a) * 0.15] });
    }
    parts.push({ geo: sph, color: '#a58bd6', scale: [0.15, 0.1, 0.15], pos: [0, 1.32, -0.04] });
    const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.g = new THREE.Group();
    this.g.add(mesh);
    this.mesh = mesh;
    this.g.position.set(spot.x, spot.y, spot.z);
    this.g.rotation.y = spot.ry ?? Math.PI;
    scene.add(this.g);
    this.pos = this.g.position;
    this.t = 0;
    this.greeted = false;
    this.cd = 0;
  }
  update(dt) {
    this.t += dt;
    this.cd = Math.max(0, this.cd - dt);
    this.mesh.position.y = Math.sin(this.t * 1.6) * 0.01;
    this.mesh.rotation.z = Math.sin(this.t * 0.8) * 0.03;
  }
}

// ───────── 박스 ─────────
export class CardBoxes {
  constructor(scene, spots) {
    const W = 0.78, D = 0.66, H = 0.42, T = 0.03;
    const out = '#c9975a', inn = '#a87b45';
    const geo = mergeColored([
      { geo: boxG, color: inn, scale: [W, T, D], pos: [0, T / 2, 0] },
      { geo: boxG, color: out, scale: [W, H, T], pos: [0, H / 2, D / 2] },
      { geo: boxG, color: out, scale: [W, H, T], pos: [0, H / 2, -D / 2] },
      { geo: boxG, color: out, scale: [T, H, D], pos: [W / 2, H / 2, 0] },
      { geo: boxG, color: out, scale: [T, H, D], pos: [-W / 2, H / 2, 0] },
      { geo: boxG, color: '#d8a86a', scale: [W, 0.2, T], pos: [0, H + 0.08, D / 2 + 0.07], rot: [0.7, 0, 0] },
      { geo: boxG, color: '#d8a86a', scale: [W, 0.2, T], pos: [0, H + 0.08, -D / 2 - 0.07], rot: [-0.7, 0, 0] },
      { geo: boxG, color: '#e7d3a8', scale: [0.3, 0.12, 0.005], pos: [0.12, 0.25, D / 2 + 0.016] },
    ]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.list = spots.map((s, i) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = (i * 1.3) % (Math.PI * 2);
      scene.add(m);
      return { m, pos: m.position, visited: false };
    });
  }
}

// ───────── 햇볕 자리 ─────────
export class SunSpots {
  constructor(scene, spots) {
    const tex = radialTexture('rgba(255,214,110,0.95)', 'rgba(255,214,110,0)', 128);
    this.list = spots.map((s) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(2.8, 2.8).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }),
      );
      m.position.set(s.x, s.y + 0.04, s.z);
      scene.add(m);
      return { m, pos: m.position };
    });
    this.t = 0;
  }
  update(dt, dayLight) {
    this.t += dt;
    for (const s of this.list) {
      s.m.material.opacity = (0.5 + Math.sin(this.t * 2) * 0.15) * dayLight;
      s.m.rotation.y = this.t * 0.1;
    }
  }
}
