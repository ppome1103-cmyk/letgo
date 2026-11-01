import * as THREE from '../vendor/three.module.min.js';
import { damp } from './util.js';

export const FURS = {
  cheese: { name: '치즈', main: '#f2a04a', belly: '#fff4e2', acc1: '#d9772b', acc2: '#d9772b', iris: '#7fc95a', stripes: true },
  mackerel: { name: '고등어', main: '#9a978e', belly: '#f3f1ea', acc1: '#55524c', acc2: '#55524c', iris: '#c9d65a', stripes: true },
  tuxedo: { name: '턱시도', main: '#2b2b30', belly: '#f7f7f5', acc1: '#2b2b30', acc2: '#2b2b30', iris: '#e8c84a', socks: true },
  calico: { name: '삼색이', main: '#faf6ee', belly: '#ffffff', acc1: '#e58b3a', acc2: '#3a3330', iris: '#7cc46a', patches: true },
  black: { name: '까망', main: '#25252a', belly: '#2f2f35', acc1: '#25252a', acc2: '#25252a', iris: '#f2c94c' },
};

// 귀여운 로우폴리 고양이 (앞쪽이 +z, 발바닥이 y=0)
export class Cat {
  constructor(furKey = 'cheese') {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    this.t = 0;
    this.phase = 0;
    this.blinkT = 2;
    this.blink = 0;
    this.sitK = 0;
    this.loafK = 0;
    this.meowT = 0;
    this.squash = 0;
    this.earT = 3;
    this.mats = {
      main: new THREE.MeshToonMaterial(),
      belly: new THREE.MeshToonMaterial(),
      acc1: new THREE.MeshToonMaterial(),
      acc2: new THREE.MeshToonMaterial(),
      paw: new THREE.MeshToonMaterial(),
      pink: new THREE.MeshToonMaterial({ color: '#ff9fb0' }),
      iris: new THREE.MeshBasicMaterial(),
      pupil: new THREE.MeshBasicMaterial({ color: '#141014' }),
      white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      blush: new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.55, depthWrite: false }),
    };
    this.build();
    this.setFur(furKey);
  }

  mesh(geo, mat, pos, scale, rot, parent) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    (parent || this.body).add(m);
    return m;
  }

  build() {
    const M = this.mats;
    const sph = new THREE.SphereGeometry(1, 16, 12);
    const sphLo = new THREE.SphereGeometry(1, 10, 8);
    this.body = new THREE.Group();
    this.pivot.add(this.body);

    // 몸통
    const torso = new THREE.CapsuleGeometry(0.15, 0.28, 4, 12);
    torso.rotateX(Math.PI / 2);
    this.mesh(torso, M.main, [0, 0.3, 0], [1, 0.95, 1]);
    this.mesh(sph, M.belly, [0, 0.27, 0.13], [0.12, 0.12, 0.13]);
    // 줄무늬
    this.stripes = [];
    const band = new THREE.TorusGeometry(0.152, 0.02, 4, 14, Math.PI);
    for (const z of [-0.14, -0.04, 0.06]) {
      this.stripes.push(this.mesh(band, M.acc1, [0, 0.3, z], [1, 0.95, 1]));
    }
    // 삼색 무늬
    this.patches = [
      this.mesh(sphLo, M.acc1, [0.07, 0.38, -0.08], [0.1, 0.07, 0.13]),
      this.mesh(sphLo, M.acc2, [-0.06, 0.39, 0.08], [0.09, 0.06, 0.1]),
      this.mesh(sphLo, M.acc1, [-0.05, 0.36, -0.22], [0.08, 0.07, 0.08]),
    ];

    // 머리
    this.head = new THREE.Group();
    this.head.position.set(0, 0.48, 0.27);
    this.body.add(this.head);
    const H = this.head;
    this.mesh(sph, M.main, [0, 0, 0], [0.18, 0.155, 0.16], null, H);
    this.mesh(sph, M.belly, [0, -0.055, 0.115], [0.085, 0.06, 0.06], null, H);
    this.mesh(sph, M.pink, [0, -0.025, 0.162], [0.022, 0.015, 0.014], null, H);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.072, 0.012, 0.128);
      H.add(eye);
      this.mesh(sph, M.iris, [0, 0, 0], [0.036, 0.04, 0.024], null, eye);
      this.mesh(sph, M.pupil, [0, 0, 0.012], [0.024, 0.032, 0.016], null, eye);
      this.mesh(sphLo, M.white, [sx * 0.008 + 0.006, 0.014, 0.026], [0.009, 0.009, 0.006], null, eye);
      this.eyes.push(eye);
      this.mesh(sphLo, M.blush, [sx * 0.112, -0.05, 0.11], [0.03, 0.017, 0.01], [0, sx * 0.6, 0], H);
    }
    this.ears = [];
    const cone = new THREE.ConeGeometry(1, 1, 4);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(sx * 0.1, 0.12, -0.01);
      ear.rotation.z = -sx * 0.28;
      H.add(ear);
      this.mesh(cone, M.main, [0, 0.05, 0], [0.065, 0.12, 0.05], [0, Math.PI / 4, 0], ear);
      this.mesh(cone, M.pink, [0, 0.04, 0.018], [0.038, 0.08, 0.02], [0, Math.PI / 4, 0], ear);
      this.ears.push(ear);
    }
    // 이마 무늬
    this.headStripes = [];
    for (const x of [-0.04, 0, 0.04]) {
      this.headStripes.push(this.mesh(sphLo, M.acc1, [x, 0.12, 0.08], [0.012, 0.035, 0.02], [0.6, 0, 0], H));
    }
    this.headPatch = this.mesh(sphLo, M.acc2, [0.08, 0.07, 0.03], [0.1, 0.09, 0.11], null, H);

    // 다리
    this.legs = [];
    const legGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.2, 8).translate(0, -0.1, 0);
    for (const [x, z] of [[-0.085, 0.16], [0.085, 0.16], [-0.085, -0.16], [0.085, -0.16]]) {
      const g = new THREE.Group();
      g.position.set(x, 0.2, z);
      this.body.add(g);
      const leg = this.mesh(legGeo, M.main, [0, 0, 0], null, null, g);
      const paw = this.mesh(sphLo, M.paw, [0, -0.195, 0.012], [0.05, 0.032, 0.06], null, g);
      this.legs.push({ g, leg, paw });
    }

    // 꼬리
    this.tail = [];
    let parent = this.body;
    const seg = new THREE.CapsuleGeometry(0.032, 0.06, 3, 8).translate(0, 0.045, 0);
    const root = new THREE.Group();
    root.position.set(0, 0.36, -0.28);
    this.body.add(root);
    parent = root;
    for (let i = 0; i < 6; i++) {
      const j = new THREE.Group();
      if (i > 0) j.position.y = 0.075;
      parent.add(j);
      const m = this.mesh(seg, i === 5 && false ? M.acc1 : M.main, [0, 0, 0], null, null, j);
      this.tail.push({ j, m });
      parent = j;
    }

    this.root.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  setFur(key) {
    const f = FURS[key] || FURS.cheese;
    this.furKey = key;
    const M = this.mats;
    M.main.color.set(f.main);
    M.belly.color.set(f.belly);
    M.acc1.color.set(f.acc1);
    M.acc2.color.set(f.acc2);
    M.iris.color.set(f.iris);
    M.paw.color.set(f.socks ? f.belly : f.main);
    for (const s of this.stripes) s.visible = !!f.stripes;
    for (const s of this.headStripes) s.visible = !!f.stripes;
    for (const p of this.patches) p.visible = !!f.patches;
    this.headPatch.visible = !!f.patches;
    // 턱시도는 꼬리 끝이 흰색이 아니라 몸 색 그대로, 치즈/고등어는 꼬리 끝 진하게
    this.tail[5].m.material = f.stripes ? M.acc1 : M.main;
  }

  meow() {
    this.meowT = 0.5;
  }
  land(impact) {
    this.squash = Math.min(0.3, 0.08 + impact * 0.012);
  }

  // s: { speed, grounded, vy, mode: 'normal' | 'sit' | 'loaf' | 'box' }
  update(dt, s) {
    this.t += dt;
    const walk = s.grounded ? Math.min(1, s.speed / 2.5) : 0;
    this.phase += dt * (5 + s.speed * 2.4);
    const sitTarget = s.mode === 'sit' || s.mode === 'box' ? 1 : 0;
    const loafTarget = s.mode === 'loaf' ? 1 : 0;
    this.sitK += (sitTarget - this.sitK) * damp(8, dt);
    this.loafK += (loafTarget - this.loafK) * damp(6, dt);

    // 다리
    const sw = Math.sin(this.phase) * 0.75 * walk;
    const L = this.legs;
    if (s.grounded) {
      L[0].g.rotation.x = sw;
      L[3].g.rotation.x = sw;
      L[1].g.rotation.x = -sw;
      L[2].g.rotation.x = -sw;
    } else {
      const k = s.vy > 0 ? 1 : 0.4;
      L[0].g.rotation.x = L[1].g.rotation.x = -0.9 * k;
      L[2].g.rotation.x = L[3].g.rotation.x = 0.9 * k;
    }
    // 앉기: 뒷다리 접고 몸 세우기
    if (this.sitK > 0.01) {
      L[2].g.rotation.x = L[2].g.rotation.x * (1 - this.sitK) - 1.3 * this.sitK;
      L[3].g.rotation.x = L[3].g.rotation.x * (1 - this.sitK) - 1.3 * this.sitK;
      L[0].g.rotation.x *= 1 - this.sitK;
      L[1].g.rotation.x *= 1 - this.sitK;
    }
    const legScale = 1 - this.loafK * 0.75;
    for (const l of L) l.g.scale.y = legScale;

    const bob = Math.abs(Math.sin(this.phase)) * 0.025 * walk;
    this.body.position.y = bob - this.loafK * 0.14 - this.sitK * 0.04;
    this.body.rotation.x = -0.42 * this.sitK + (s.grounded ? 0 : -Math.max(-0.3, Math.min(0.3, s.vy * 0.03)));
    this.body.position.z = -this.sitK * 0.06;

    // 머리
    this.meowT = Math.max(0, this.meowT - dt);
    const meowK = this.meowT > 0 ? Math.sin((this.meowT / 0.5) * Math.PI) : 0;
    this.head.rotation.x = -0.45 * meowK + this.sitK * 0.38 + Math.sin(this.t * 1.3) * 0.03 + this.loafK * 0.1;
    this.head.rotation.z = Math.sin(this.t * 0.7) * 0.06 * (1 - walk);
    this.head.position.y = 0.48 - this.loafK * 0.04;

    // 꼬리
    const sway = Math.sin(this.t * (2 + walk * 3)) * (0.18 + walk * 0.2);
    for (let i = 0; i < this.tail.length; i++) {
      const j = this.tail[i].j;
      if (i === 0) {
        j.rotation.x = -1.0 + this.loafK * -0.9 + this.sitK * -0.6 + (s.grounded ? 0 : -0.5);
      } else {
        j.rotation.x = 0.28 - this.loafK * 0.35 + walk * 0.05;
      }
      j.rotation.z = sway * (0.4 + i * 0.25) * (1 - this.loafK * 0.7);
    }

    // 눈 깜빡 / 잠
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blink = 0.14;
      this.blinkT = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    const eyeY = this.blink > 0 ? 0.12 : 1 - this.loafK * 0.88;
    for (const e of this.eyes) e.scale.y += (eyeY - e.scale.y) * damp(30, dt);

    // 귀 쫑긋
    this.earT -= dt;
    if (this.earT < 0) {
      this.earT = 1.5 + Math.random() * 4;
      this.earTw = 0.25;
    }
    this.earTw = Math.max(0, (this.earTw || 0) - dt);
    this.ears[1].rotation.x = this.earTw > 0 ? -0.5 * Math.sin((this.earTw / 0.25) * Math.PI) : 0;
    this.ears[0].rotation.x = meowK * -0.3;
    this.ears[1].rotation.x += meowK * -0.3;

    // 착지 찌그러짐
    this.squash = Math.max(0, this.squash - dt * 1.4);
    const sq = this.squash;
    this.pivot.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.4);
  }
}
