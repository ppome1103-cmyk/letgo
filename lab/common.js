import * as THREE from '../vendor/three.module.min.js';
import { damp, clamp, lerpAngle } from '../src/util.js';

export { THREE, damp, clamp, lerpAngle };

// ───────── 렌더러 + 장면 + 하늘 ─────────
export function createApp({ fogNear = 40, fogFar = 180, top = '#5aa6ee', horizon = '#d6eefc', far = 600, fov = 62 } = {}) {
  const canvas = document.getElementById('game');
  const dpr = window.devicePixelRatio || 1;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
  let pr = Math.min(dpr, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(horizon, fogNear, fogFar);
  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.08, far);
  const hemi = new THREE.HemisphereLight('#e2f1ff', '#a29580', 0.95 * Math.PI * 0.55);
  const sun = new THREE.DirectionalLight('#fff4e0', 1.15 * Math.PI);
  sun.position.set(40, 80, 25);
  scene.add(hemi, sun, sun.target);

  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color('#8f949c') } },
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
  const sky = new THREE.Mesh(new THREE.SphereGeometry(far * 0.9, 24, 12), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  const app = {
    renderer, scene, camera, hemi, sun, sky, timeScale: 1, slowT: 0,
    shake: 0,
    baseFov: fov,
    fovKick: 0,
    render() {
      // 카메라 흔들림
      const s = this.shake * this.shake;
      const ox = (Math.random() - 0.5) * s * 0.5, oy = (Math.random() - 0.5) * s * 0.5;
      camera.position.x += ox;
      camera.position.y += oy;
      sky.position.copy(camera.position);
      const portrait = window.innerWidth < window.innerHeight;
      const want = (portrait ? this.baseFov + 8 : this.baseFov) + this.fovKick;
      if (Math.abs(camera.fov - want) > 0.05) {
        camera.fov = want;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
      camera.position.x -= ox;
      camera.position.y -= oy;
    },
    addShake(a) {
      this.shake = Math.min(1, this.shake + a);
    },
    slowmo(dur, scale = 0.25) {
      this.slowT = Math.max(this.slowT, dur);
      this.slowScale = scale;
    },
    // 실제 경과시간 → 게임 시간
    step(rawDt) {
      this.shake = Math.max(0, this.shake - rawDt * 1.8);
      if (this.slowT > 0) {
        this.slowT -= rawDt;
        this.timeScale += (this.slowScale - this.timeScale) * damp(20, rawDt);
      } else this.timeScale += (1 - this.timeScale) * damp(6, rawDt);
      return rawDt * this.timeScale;
    },
  };

  const onResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);
  onResize();

  // 느리면 해상도 낮추기
  let acc = 0, n = 0;
  app.perf = (rawDt) => {
    acc += rawDt;
    n++;
    if (acc > 2) {
      if (n / acc < 45 && pr > 1) {
        pr = Math.max(1, pr - 0.25);
        renderer.setPixelRatio(pr);
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
      acc = 0;
      n = 0;
    }
  };
  return app;
}

// ───────── 동글동글 주인공 "콩떡이" ─────────
export class Bean {
  constructor(color = '#ff8a5c') {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    this.body = new THREE.Group();
    this.pivot.add(this.body);
    this.mat = new THREE.MeshToonMaterial({ color });
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const black = new THREE.MeshBasicMaterial({ color: '#1a1416' });
    const blush = new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.6, depthWrite: false });
    const sph = new THREE.SphereGeometry(1, 16, 12);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.32, 6, 16), this.mat);
    torso.position.y = 0.48;
    this.body.add(torso);
    this.face = new THREE.Group();
    this.face.position.set(0, 0.62, 0.27);
    this.body.add(this.face);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(sph, black);
      e.scale.set(0.045, 0.07, 0.03);
      e.position.set(s * 0.1, 0, 0);
      this.face.add(e);
      const h = new THREE.Mesh(sph, white);
      h.scale.set(0.016, 0.02, 0.01);
      h.position.set(s * 0.1 + 0.012, 0.025, 0.025);
      this.face.add(h);
      const b = new THREE.Mesh(sph, blush);
      b.scale.set(0.05, 0.028, 0.01);
      b.position.set(s * 0.18, -0.07, -0.02);
      b.rotation.y = s * 0.5;
      this.face.add(b);
    }
    this.eyes = this.face.children.filter((_, i) => i % 3 === 0);
    // 새싹 더듬이
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6), new THREE.MeshToonMaterial({ color: '#4f9e5a' }));
    stem.position.set(0, 0.97, 0);
    this.body.add(stem);
    this.sprout = new THREE.Group();
    this.sprout.position.set(0, 1.04, 0);
    this.body.add(this.sprout);
    const leafMat = new THREE.MeshToonMaterial({ color: '#7bc96f' });
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(sph, leafMat);
      l.scale.set(0.09, 0.03, 0.05);
      l.position.set(s * 0.08, 0.02, 0);
      l.rotation.z = s * 0.4;
      this.sprout.add(l);
    }
    // 발
    const footMat = new THREE.MeshToonMaterial({ color: '#5a3d2b' });
    this.feet = [-1, 1].map((s) => {
      const f = new THREE.Mesh(sph, footMat);
      f.scale.set(0.1, 0.07, 0.14);
      f.position.set(s * 0.14, 0.06, 0.02);
      this.pivot.add(f);
      return f;
    });
    this.sq = 0;
    this.sqV = 0;
    this.t = 0;
    this.phase = 0;
    this.blinkT = 2;
    this.root.traverse((o) => (o.frustumCulled = false));
  }
  land(amount) {
    this.sqV -= amount * 9;
  }
  stretch(amount) {
    this.sqV += amount * 9;
  }
  // s: { speed, grounded, vy, lean, slide, spin }
  update(dt, s) {
    this.t += dt;
    // 스프링 찌그러짐
    this.sqV += (-this.sq * 160 - this.sqV * 14) * dt;
    this.sq += this.sqV * dt;
    let sy = 1 + this.sq;
    if (!s.grounded) sy += clamp(s.vy * 0.012, -0.12, 0.15);
    if (s.slide) sy *= 0.55;
    sy = clamp(sy, 0.45, 1.6);
    const sxz = 1 / Math.sqrt(sy);
    this.pivot.scale.set(sxz, sy, sxz);
    const walk = s.grounded ? Math.min(1, s.speed / 4) : 0;
    this.phase += dt * (6 + s.speed * 1.6);
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.06 * walk;
    this.body.rotation.x = (s.lean || 0) + (s.slide ? 0.9 : 0);
    this.body.rotation.z = Math.sin(this.phase) * 0.06 * walk;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const ph = this.phase + i * Math.PI;
      f.position.z = 0.02 + (s.grounded ? Math.sin(ph) * 0.16 * walk : -0.08);
      f.position.y = 0.06 + (s.grounded ? Math.max(0, Math.cos(ph)) * 0.08 * walk : 0.1);
    }
    this.sprout.rotation.z = Math.sin(this.t * 3) * 0.2 + (s.grounded ? 0 : clamp(-s.vy * 0.05, -0.6, 0.6));
    this.sprout.rotation.x = -walk * 0.5;
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    const ey = this.blinkT < 0.12 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = 0.07 * ey;
  }
}

// ───────── 파티클 (먼지, 불꽃, 조각) ─────────
export class Particles {
  constructor(scene, max = 400) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), max);
    this.mesh.frustumCulled = false;
    this.max = max;
    this.list = [];
    this.d = new THREE.Object3D();
    this.c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.d.scale.setScalar(0);
      this.d.updateMatrix();
      this.mesh.setMatrixAt(i, this.d.matrix);
      this.mesh.setColorAt(i, this.c.set('#ffffff'));
    }
    scene.add(this.mesh);
    this.next = 0;
  }
  emit(pos, n, o = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const sp = o.speed ?? 3;
      const a = Math.random() * Math.PI * 2;
      const up = o.up ?? 1;
      const p = {
        i,
        x: pos.x + (Math.random() - 0.5) * (o.spread ?? 0.3),
        y: pos.y + (Math.random() - 0.5) * (o.spreadY ?? 0.1),
        z: pos.z + (Math.random() - 0.5) * (o.spread ?? 0.3),
        vx: Math.cos(a) * sp * (0.4 + Math.random() * 0.6) + (o.vx ?? 0),
        vy: up * sp * (0.3 + Math.random() * 0.7) + (o.vy ?? 0),
        vz: Math.sin(a) * sp * (0.4 + Math.random() * 0.6) + (o.vz ?? 0),
        life: (o.life ?? 0.6) * (0.6 + Math.random() * 0.6),
        t: 0,
        size: (o.size ?? 0.12) * (0.6 + Math.random() * 0.8),
        g: o.gravity ?? 6,
        drag: o.drag ?? 2,
      };
      p.max = p.life;
      this.list[i] = p;
      this.mesh.setColorAt(i, this.c.set(Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color || '#e8dccb'));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    const d = this.d;
    for (const p of this.list) {
      if (!p || p.life <= 0) continue;
      p.life -= dt;
      p.vy -= p.g * dt;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr;
      p.vz *= dr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = Math.max(0, p.life / p.max);
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.t, p.t * 1.3, 0);
      p.t += dt * 5;
      d.scale.setScalar(p.size * (0.3 + k * 0.7) * (p.life > 0 ? 1 : 0));
      d.updateMatrix();
      this.mesh.setMatrixAt(p.i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ───────── 화면 글자 효과 ─────────
export function popText(text, cls = '', ms = 900) {
  const layer = document.getElementById('fx');
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  layer.appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

export function setSpeedLines(k) {
  const el = document.getElementById('speed');
  if (el) el.style.opacity = clamp(k, 0, 1).toFixed(2);
}

export const $ = (id) => document.getElementById(id);

// 따라다니는 3인칭 카메라 (드래그로 회전)
export class FollowCam {
  constructor(camera, input, world, o = {}) {
    this.camera = camera;
    this.input = input;
    this.world = world;
    this.yaw = o.yaw ?? Math.PI;
    this.pitch = o.pitch ?? 0.32;
    this.dist = o.dist ?? 5.5;
    this.cur = this.dist;
    this.target = new THREE.Vector3();
    this.height = o.height ?? 0.9;
    this.follow = o.follow ?? 1.2;
  }
  snap(pos) {
    this.target.set(pos.x, pos.y + this.height, pos.z);
  }
  update(dt, pos, facing, speed) {
    const inp = this.input;
    this.yaw -= inp.camDX * 0.0058;
    this.pitch = clamp(this.pitch + inp.camDY * 0.0044, -0.2, 1.25);
    inp.camDX = inp.camDY = 0;
    if (inp.zoom) {
      this.dist = clamp(this.dist + inp.zoom * 0.5, 2.5, 12);
      inp.zoom = 0;
    }
    const since = (performance.now() - inp.lastDragTime) / 1000;
    if (since > 1.4 && speed > 1.5) this.yaw = lerpAngle(this.yaw, facing + Math.PI, damp(this.follow, dt) * Math.min(1, speed / 6));
    this.target.x += (pos.x - this.target.x) * damp(18, dt);
    this.target.z += (pos.z - this.target.z) * damp(18, dt);
    this.target.y += (pos.y + this.height - this.target.y) * damp(9, dt);
    const cp = Math.cos(this.pitch);
    const dx = Math.sin(this.yaw) * cp, dy = Math.sin(this.pitch), dz = Math.cos(this.yaw) * cp;
    let want = this.dist + Math.min(2.5, speed * 0.12);
    if (this.world) {
      const hit = this.world.raycast(this.target.x, this.target.y, this.target.z, dx, dy, dz, want);
      want = Math.max(0.8, hit - 0.3);
    }
    this.cur = want < this.cur ? want : this.cur + (want - this.cur) * damp(3, dt);
    this.camera.position.set(this.target.x + dx * this.cur, this.target.y + dy * this.cur, this.target.z + dz * this.cur);
    this.camera.lookAt(this.target);
  }
}
