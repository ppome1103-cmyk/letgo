import * as THREE from '../vendor/three.module.min.js';
import { mergeColored } from '../src/util.js';
import { HALF, CELLS, CELL, LAKE, RIVER, PLACES, hash, fbm, autumnW, cherryW, smoothstep } from './terrain.js';
import { makeWaterMaterial, makeClouds, makeFallMaterial, addWind, addFlap } from './shaders.js';

const sph = new THREE.SphereGeometry(1, 10, 8);
const ico = new THREE.IcosahedronGeometry(1, 0);
const icoHi = new THREE.IcosahedronGeometry(1, 1);
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = (rt, rb, s = 8) => new THREE.CylinderGeometry(rt, rb, 1, s);
const cone = (s = 6) => new THREE.ConeGeometry(1, 1, s);

export class Scenery {
  constructor(scene, terrain) {
    this.scene = scene;
    this.T = terrain;
    this.time = { value: 0 };
    this.anim = [];
    this.waterMats = [];
    this.lightMats = []; // 밤에 켜지는 것들
    this.water(scene);
    this.trees(scene);
    this.landmarks(scene);
    this.birds(scene);
    this.cloudLayer(scene);
    this.particles(scene);
  }

  // ───────── 물: 바다, 호수, 강, 폭포 ─────────
  water(scene) {
    const tex = this.T.heightTexture();
    const sea = makeWaterMaterial(tex);
    this.waterMats.push(sea);
    const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 5, HALF * 5).rotateX(-Math.PI / 2), sea);
    scene.add(seaMesh);
    const lake = makeWaterMaterial(tex);
    lake.uniforms.deep.value.set('#2a7f8f');
    this.waterMats.push(lake);
    const lakeMesh = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r * 1.15, 48).rotateX(-Math.PI / 2), lake);
    lakeMesh.position.set(LAKE.x, LAKE.level, LAKE.z);
    scene.add(lakeMesh);
    // 강 (고원 위 리본)
    const pts = [];
    for (let i = 0; i < RIVER.length - 1; i++) {
      const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 10);
      for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    pts.push(RIVER[RIVER.length - 1]);
    let y = 1e9;
    const ys = pts.map(([x, z]) => (y = Math.min(y, this.T.ground(x, z) + 3.2)));
    const pos = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz);
      dx /= l;
      dz /= l;
      const w = 19;
      pos.push(pts[i][0] - dz * w, ys[i], pts[i][1] + dx * w, pts[i][0] + dz * w, ys[i], pts[i][1] - dx * w);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setIndex(idx);
    const river = makeWaterMaterial(tex);
    river.uniforms.deep.value.set('#2f8a9a');
    river.side = THREE.DoubleSide;
    this.waterMats.push(river);
    scene.add(new THREE.Mesh(rg, river));
    this.riverTop = ys[ys.length - 1];
    // 폭포
    const top = this.riverTop, bottom = LAKE.level;
    const fg = new THREE.PlaneGeometry(40, 1, 1, 1);
    const fp = fg.attributes.position;
    // 위쪽 모서리는 절벽 위(z -100), 아래는 호수(z -58)
    for (let i = 0; i < fp.count; i++) {
      const up = fp.getY(i) > 0;
      fp.setY(i, up ? top - 0.3 : bottom);
      fp.setZ(i, up ? -95 : -64);
    }
    fg.computeVertexNormals();
    this.fallMat = makeFallMaterial();
    const fall = new THREE.Mesh(fg, this.fallMat);
    fall.position.x = 0;
    fall.renderOrder = 4;
    scene.add(fall);
    this.fallPos = new THREE.Vector3(0, bottom + 2, -64);
    // 폭포 물안개
    const mist = [];
    for (let k = 0; k < 14; k++) mist.push({ x: (hash(k, 61) - 0.5) * 50, y: bottom + 4 + hash(k, 62) * 16, z: -58 + (hash(k, 63) - 0.5) * 24, s: 24 + hash(k, 64) * 22 });
    this.mist = makeClouds(mist);
    this.mist.material.uniforms.lit.value.set('#ffffff');
    this.mist.material.uniforms.shade.value.set('#e6f2f8');
    scene.add(this.mist);
  }

  // ───────── 나무 ─────────
  trees(scene) {
    const T = this.T, N = T.N;
    const types = {
      pine: { geo: mergeColored([
        { geo: new THREE.CylinderGeometry(0.25, 0.35, 1, 4, 1, true), color: '#6b4a32', pos: [0, 0.6, 0], scale: [1, 1.6, 1] },
        { geo: new THREE.ConeGeometry(1, 1, 6, 1, true), color: '#3f7f4a', pos: [0, 2.6, 0], scale: [2.2, 3.2, 2.2] },
        { geo: new THREE.ConeGeometry(1, 1, 6, 1, true), color: '#4b9254', pos: [0, 4.4, 0], scale: [1.6, 2.6, 1.6] },
        { geo: new THREE.ConeGeometry(1, 1, 6, 1, true), color: '#57a05e', pos: [0, 5.9, 0], scale: [1.0, 1.9, 1.0] },
      ]), list: [] },
      round: { geo: mergeColored([
        { geo: new THREE.CylinderGeometry(0.25, 0.38, 1, 4, 1, true), color: '#6b4a32', pos: [0, 1, 0], scale: [1, 2.2, 1] },
        { geo: ico, color: '#ffffff', pos: [0, 3.4, 0], scale: [2.1, 1.8, 2.1] },
        { geo: ico, color: '#e6e6e6', pos: [0.9, 2.9, 0.4], scale: [1.3, 1.2, 1.3] },
        { geo: ico, color: '#f2f2f2', pos: [-0.8, 3.0, -0.5], scale: [1.4, 1.2, 1.4] },
      ]), list: [] },
    };
    const autumnCols = ['#e0632f', '#f0a030', '#d94a2a', '#f2c03a', '#c8562e'];
    const greenCols = ['#6fb35a', '#7fc062', '#5ea552', '#8cc86b'];
    const cherryCols = ['#f6c1d6', '#f9d3e2', '#f2a9c6', '#ffe0ec'];
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL;
        const h = T.h[j * N + i];
        if (h < 5 || h > 330) continue;
        const slope = 1 - T.nrm[(j * N + i) * 3 + 1];
        if (slope > 0.45) continue;
        if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.12) continue;
        const r = hash(i * 7 + 3, j * 13 + 1);
        const aw = autumnW(x, z), cw = cherryW(x, z);
        const forest = fbm(x / 160 + 50, z / 160 + 20, 3);
        let dens = smoothstep(0.5, 0.64, forest) * 0.32 + 0.012;
        if (h > 150) dens *= 1.2;
        dens = Math.max(dens, aw * 0.3, cw * 0.32);
        // 마을/큰나무 주변 비우기
        if (Math.hypot(x - PLACES.village.x, z - PLACES.village.z) < 120 || Math.hypot(x - PLACES.bigTree.x, z - PLACES.bigTree.z) < 60) dens = 0;
        if (r > dens) continue;
        const jx = (hash(i, j + 99) - 0.5) * CELL * 0.9, jz = (hash(i + 99, j) - 0.5) * CELL * 0.9;
        const px = x + jx, pz = z + jz, py = T.ground(px, pz) - 0.3;
        const s = 0.8 + hash(i + 5, j + 5) * 0.9;
        const r2 = hash(i + 11, j + 17);
        if (cw > 0.4 && r2 < cw) types.round.list.push([px, py, pz, s * 1.05, cherryCols[(i + j) % 4]]);
        else if (aw > 0.3 && r2 < aw * 0.9) types.round.list.push([px, py, pz, s, autumnCols[(i * 3 + j) % 5]]);
        else if (h > 120 || r2 < 0.45) types.pine.list.push([px, py, pz, s * (h > 120 ? 1.2 : 1), null]);
        else types.round.list.push([px, py, pz, s, greenCols[(i + j * 3) % 4]]);
      }
    }
    this.treeSets = [];
    const d = new THREE.Object3D(), c = new THREE.Color();
    for (const t of Object.values(types)) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      addWind(mat, this.time, 0.035);
      const mesh = new THREE.InstancedMesh(t.geo, mat, t.list.length);
      mesh.frustumCulled = false;
      t.list.forEach(([x, y, z, s, col], k) => {
        d.position.set(x, y, z);
        d.rotation.set(0, hash(k, 3) * 6.28, 0);
        d.scale.setScalar(s * 2.2);
        d.updateMatrix();
        mesh.setMatrixAt(k, d.matrix);
        mesh.setColorAt(k, c.set(col || '#ffffff'));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      // 원본 행렬 보관 (가시성 컬링용)
      const all = new Float32Array(mesh.instanceMatrix.array);
      const cols = mesh.instanceColor ? new Float32Array(mesh.instanceColor.array) : null;
      this.treeSets.push({ mesh, list: t.list, all, cols });
    }
    this.treeCount = this.treeSets.reduce((a, s) => a + s.list.length, 0);
  }

  // 카메라 근처 + 앞쪽 나무만 그리기
  cullTrees(cam, maxDist) {
    const fx = cam.fx, fz = cam.fz;
    for (const s of this.treeSets) {
      const arr = s.mesh.instanceMatrix.array, ca = s.mesh.instanceColor?.array;
      let n = 0;
      for (let k = 0; k < s.list.length; k++) {
        const t = s.list[k];
        const dx = t[0] - cam.x, dz = t[2] - cam.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > maxDist * maxDist) continue;
        if (d2 > 150 * 150 && (dx * fx + dz * fz) < -Math.sqrt(d2) * 0.35) continue;
        arr.set(s.all.subarray(k * 16, k * 16 + 16), n * 16);
        if (ca) ca.set(s.cols.subarray(k * 3, k * 3 + 3), n * 3);
        n++;
      }
      s.mesh.count = n;
      s.mesh.instanceMatrix.needsUpdate = true;
      if (ca) s.mesh.instanceColor.needsUpdate = true;
    }
  }

  // ───────── 랜드마크 ─────────
  place(geo, x, z, ry = 0, sink = 0.5, mat) {
    const m = new THREE.Mesh(geo, mat || new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.position.set(x, this.T.ground(x, z) - sink, z);
    m.rotation.y = ry;
    this.scene.add(m);
    return m;
  }

  landmarks(scene) {
    const T = this.T;
    // 풍차 마을
    const V = PLACES.village;
    const houseCols = ['#fff6e6', '#f6e7cf', '#eef3ff', '#ffe9e0', '#f3f0e6'];
    const roofCols = ['#d9583f', '#3f78c9', '#e3a92f', '#4f9a5c', '#b0563d'];
    for (let k = 0; k < 16; k++) {
      const a = k * 2.4 + 0.5, r = 25 + (k % 5) * 14 + hash(k, 1) * 10;
      const x = V.x + Math.cos(a) * r, z = V.z + Math.sin(a) * r;
      const w = 7 + hash(k, 2) * 4, d = 8 + hash(k, 3) * 4, h = 5 + hash(k, 4) * 3;
      const geo = mergeColored([
        { geo: box, color: houseCols[k % 5], pos: [0, h / 2, 0], scale: [w, h, d] },
        { geo: cone(4), color: roofCols[k % 5], pos: [0, h + 2.2, 0], rot: [0, Math.PI / 4, 0], scale: [w * 0.78, 4.4, d * 0.78] },
        { geo: box, color: '#6b4a33', pos: [0, 1.3, d / 2 + 0.05], scale: [1.4, 2.6, 0.1] },
        { geo: box, color: '#8fc3e6', pos: [w / 4, h * 0.6, d / 2 + 0.05], scale: [1.3, 1.3, 0.1] },
        { geo: box, color: '#8fc3e6', pos: [-w / 4, h * 0.6, d / 2 + 0.05], scale: [1.3, 1.3, 0.1] },
        { geo: box, color: '#9a8f84', pos: [w * 0.25, h + 3.2, 0], scale: [1, 3, 1] },
      ]);
      this.place(geo, x, z, -a + Math.PI / 2, 0.6);
    }
    for (const [ox, oz] of [[-70, -40], [60, 70], [-10, 95]]) {
      const x = V.x + ox, z = V.z + oz;
      const body = mergeColored([
        { geo: cyl(2.4, 4, 8), color: '#f3ece0', pos: [0, 8, 0], scale: [1, 16, 1] },
        { geo: cone(8), color: '#b0563d', pos: [0, 18, 0], scale: [3.2, 4.5, 3.2] },
        { geo: box, color: '#6b4a33', pos: [0, 1.4, 3.6], scale: [1.6, 2.8, 0.3] },
      ]);
      const m = this.place(body, x, z, 0.5, 0.6);
      const blades = mergeColored([0, 1, 2, 3].map((i) => ({ geo: box, color: i % 2 ? '#f6f1e6' : '#e8dccb', pos: [Math.cos((i * Math.PI) / 2) * 5, Math.sin((i * Math.PI) / 2) * 5, 0], rot: [0, 0, (i * Math.PI) / 2], scale: [9, 1.6, 0.2] })));
      const b = new THREE.Mesh(blades, new THREE.MeshLambertMaterial({ vertexColors: true }));
      b.position.set(Math.sin(0.5) * 4.4, m.position.y + 15.5, Math.cos(0.5) * 4.4);
      b.position.x += x;
      b.position.z += z;
      b.rotation.y = 0.5;
      scene.add(b);
      this.anim.push((t) => (b.rotation.z = t * 0.6));
    }
    // 천년 나무
    const B = PLACES.bigTree;
    const parts = [{ geo: cyl(4, 7.5, 9), color: '#6b4a32', pos: [0, 18, 0], scale: [1, 36, 1] }];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      parts.push({ geo: cyl(1.2, 2.2, 6), color: '#6b4a32', pos: [Math.cos(a) * 9, 32, Math.sin(a) * 9], rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], scale: [1, 22, 1] });
    }
    const leafC = ['#6fb35a', '#5ea552', '#7fc062', '#8cc86b'];
    for (let k = 0; k < 16; k++) {
      const a = k * 2.39, r = 10 + (k % 4) * 6;
      parts.push({ geo: icoHi, color: leafC[k % 4], pos: [Math.cos(a) * r, 42 + (k % 3) * 6 - r * 0.2, Math.sin(a) * r], scale: [13, 10, 13] });
    }
    const big = mergeColored(parts);
    const bigMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.place(big, B.x, B.z, 0, 2, bigMat);
    // 등대
    const L = PLACES.lighthouse;
    const lh = mergeColored([
      { geo: cyl(4, 5.5, 14), color: '#ffffff', pos: [0, 7, 0], scale: [1, 14, 1] },
      { geo: cyl(3.6, 4, 14), color: '#e0453a', pos: [0, 18, 0], scale: [1, 8, 1] },
      { geo: cyl(3.2, 3.6, 14), color: '#ffffff', pos: [0, 25, 0], scale: [1, 6, 1] },
      { geo: cyl(4.4, 4.4, 14), color: '#3b3b3b', pos: [0, 28.4, 0], scale: [1, 0.8, 1] },
      { geo: cone(14), color: '#e0453a', pos: [0, 34, 0], scale: [3.4, 3.4, 3.4] },
      { geo: box, color: '#f3ece0', pos: [9, 3, 0], scale: [10, 6, 8] },
      { geo: cone(4), color: '#e0453a', pos: [9, 7.5, 0], rot: [0, Math.PI / 4, 0], scale: [7.5, 3.4, 6] },
    ]);
    const lm = this.place(lh, L.x, L.z, 0.3, 0.5);
    const lampMat = new THREE.MeshBasicMaterial({ color: '#fff3c0' });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3.6, 12), lampMat);
    lamp.position.set(L.x, lm.position.y + 30.6, L.z);
    scene.add(lamp);
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(14, 220, 16, 1, true).translate(0, -110, 0).rotateZ(Math.PI / 2), beamMat);
    beam.position.copy(lamp.position);
    scene.add(beam);
    this.beam = { beam, beamMat, lampMat };
    this.anim.push((t) => (beam.rotation.y = t * 0.5));
    // 바위 아치
    const A = PLACES.arch;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(42, 11, 7, 14, Math.PI), new THREE.MeshLambertMaterial({ color: '#9b8f84', flatShading: true }));
    arch.position.set(A.x, -6, A.z);
    arch.rotation.y = 0.9;
    scene.add(arch);
    // 정자 (산 위 전망대)
    const Pv = PLACES.pavilion;
    let best = { x: Pv.x, z: Pv.z, h: -1e9 };
    for (let dz = -160; dz <= 160; dz += 20) for (let dx = -160; dx <= 160; dx += 20) {
      const h = T.ground(Pv.x + dx, Pv.z + dz);
      if (h > best.h && T.slope(Pv.x + dx, Pv.z + dz) < 0.35) best = { x: Pv.x + dx, z: Pv.z + dz, h };
    }
    const pv = [];
    for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) pv.push({ geo: cyl(0.3, 0.3, 6), color: '#b5352b', pos: [px, 2.6, pz], scale: [1, 5.2, 1] });
    pv.push({ geo: box, color: '#a8784f', pos: [0, 0.4, 0], scale: [8.4, 0.8, 8.4] });
    pv.push({ geo: cone(4), color: '#3d4a47', pos: [0, 6.6, 0], rot: [0, Math.PI / 4, 0], scale: [7.8, 3, 7.8] });
    pv.push({ geo: box, color: '#2e8a72', pos: [0, 5.3, 0], scale: [7.4, 0.5, 7.4] });
    pv.push({ geo: sph, color: '#d9a640', pos: [0, 8.4, 0], scale: [0.5, 0.5, 0.5] });
    this.place(mergeColored(pv), best.x, best.z, 0.4, 0.3);
    this.pavilionPos = new THREE.Vector3(best.x, best.h, best.z);
    // 열기구
    this.balloons = [];
    const bc = [['#ff6b6b', '#ffd93d'], ['#6bc5ff', '#ffffff'], ['#a98bff', '#ffb3d9'], ['#7bd88f', '#fff3a8'], ['#ff9f45', '#ff6b9d']];
    bc.forEach(([c1, c2], k) => {
      const gparts = [];
      for (let s = 0; s < 8; s++) gparts.push({ geo: new THREE.SphereGeometry(1, 8, 10, (s / 8) * Math.PI * 2, Math.PI / 4), color: s % 2 ? c1 : c2, pos: [0, 14, 0], scale: [9, 11, 9] });
      gparts.push({ geo: cyl(1.6, 1.3, 6), color: '#8b5a3c', pos: [0, 0, 0], scale: [1, 1.6, 1] });
      const geo = mergeColored(gparts);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      scene.add(m);
      const b = { m, cx: -200 + k * 160, cz: 500 + (k % 2) * 220, r: 120 + k * 30, y: 150 + k * 25, ph: k * 1.3 };
      this.balloons.push(b);
    });
    // 돛단배
    this.boats = [];
    for (let k = 0; k < 5; k++) {
      const geo = mergeColored([
        { geo: box, color: '#8b5a3c', pos: [0, 0.6, 0], scale: [3, 1.4, 9] },
        { geo: cyl(0.15, 0.15, 5), color: '#6b4a32', pos: [0, 6, 0], scale: [1, 10, 1] },
        { geo: cone(3), color: k % 2 ? '#ffffff' : '#ffe3c4', pos: [0, 6.5, 1.6], rot: [0, Math.PI / 2, 0], scale: [0.1, 8, 3.6] },
      ]);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      scene.add(m);
      this.boats.push({ m, cx: 1300 + (k % 3) * 200, cz: -500 + k * 380, r: 90 + k * 20, ph: k });
    }
  }

  // ───────── 새떼 ─────────
  birds(scene) {
    const geo = mergeColored([
      { geo: box, color: '#3d3d46', pos: [0, 0, 0], scale: [0.35, 0.3, 1.1] },
      { geo: box, color: '#4a4a55', pos: [0.9, 0, 0], scale: [1.6, 0.06, 0.6] },
      { geo: box, color: '#4a4a55', pos: [-0.9, 0, 0], scale: [1.6, 0.06, 0.6] },
    ]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    addFlap(mat, this.time);
    this.flocks = [];
    const F = 3, B = 16;
    this.birdMesh = new THREE.InstancedMesh(geo, mat, F * B);
    this.birdMesh.frustumCulled = false;
    scene.add(this.birdMesh);
    for (let f = 0; f < F; f++) {
      const members = [];
      for (let b = 0; b < B; b++) members.push({ ox: (hash(f, b) - 0.5) * 30, oy: (hash(b, f) - 0.5) * 8, oz: (hash(f + b, 9) - 0.5) * 30, p: new THREE.Vector3(), v: new THREE.Vector3() });
      this.flocks.push({ c: new THREE.Vector3(), cx: [-300, 600, -900][f], cz: [200, -200, 700][f], r: [500, 420, 380][f], y: [120, 210, 140][f], ph: f * 2, members, follow: 0, fp: new THREE.Vector3() });
    }
  }

  // ───────── 구름 ─────────
  cloudLayer(scene) {
    const puffs = [];
    // 산맥 위 구름바다
    this.cloudSeaY = 330;
    for (let x = -1500; x <= 1500; x += 95) {
      for (let z = -1800; z <= -620; z += 95) {
        const n = fbm(x / 400 + 4, z / 400 + 2, 3);
        if (n < 0.42) continue;
        puffs.push({ x: x + (hash(x, z) - 0.5) * 70, y: this.cloudSeaY + (hash(z, x) - 0.5) * 14, z: z + (hash(x + 1, z) - 0.5) * 70, s: 150 + hash(x, z + 3) * 70 });
      }
    }
    // 뭉게구름
    for (let k = 0; k < 46; k++) {
      const cx = (hash(k, 1) - 0.5) * 3800, cz = (hash(k, 2) - 0.5) * 3800, cy = 430 + hash(k, 3) * 120;
      const n = 6 + Math.floor(hash(k, 4) * 6);
      for (let i = 0; i < n; i++) {
        puffs.push({ x: cx + (hash(k, i + 10) - 0.5) * 140, y: cy + (hash(k, i + 30) - 0.3) * 30, z: cz + (hash(k, i + 50) - 0.5) * 90, s: 60 + hash(k, i + 70) * 50 });
      }
    }
    this.clouds = makeClouds(puffs);
    scene.add(this.clouds);
  }

  // ───────── 꽃잎 / 낙엽 / 반딧불 / 별 ─────────
  particles(scene) {
    const P = 220;
    const geo = new THREE.PlaneGeometry(0.5, 0.35);
    this.petalMat = new THREE.MeshBasicMaterial({ color: '#ffc6dc', side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false });
    this.petals = new THREE.InstancedMesh(geo, this.petalMat, P);
    this.petals.frustumCulled = false;
    this.petalData = Array.from({ length: P }, (_, i) => ({ p: new THREE.Vector3((hash(i, 1) - 0.5) * 120, (hash(i, 2) - 0.5) * 60, (hash(i, 3) - 0.5) * 120), r: hash(i, 4) * 6, s: 0.6 + hash(i, 5) }));
    scene.add(this.petals);
    // 반딧불
    const fp = [];
    for (let i = 0; i < 500; i++) {
      const a = hash(i, 7) * Math.PI * 2, r = LAKE.r * (0.95 + hash(i, 8) * 0.9);
      let x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      if (i > 300) { x = PLACES.cherry.x + (hash(i, 9) - 0.5) * 500; z = PLACES.cherry.z + (hash(i, 10) - 0.5) * 500; }
      fp.push(x, this.T.ground(x, z) + 1 + hash(i, 11) * 6, z);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    const glow = (() => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 32;
      const g = cv.getContext('2d');
      const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,255,200,1)');
      grd.addColorStop(0.3, 'rgba(220,255,140,0.6)');
      grd.addColorStop(1, 'rgba(200,255,120,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(cv);
    })();
    this.flyMat = new THREE.PointsMaterial({ size: 2.2, map: glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: '#e6ff9a' });
    this.flies = new THREE.Points(fg, this.flyMat);
    scene.add(this.flies);
    this.flyBase = fp.slice();
    // 별
    const sp = [];
    for (let i = 0; i < 900; i++) {
      const a = hash(i, 21) * Math.PI * 2, e = Math.asin(0.05 + hash(i, 22) * 0.95);
      sp.push(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp.map((v) => v * 1800), 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);
  }

  // ───────── 매 프레임 ─────────
  update(dt, t, cam, env) {
    this.time.value = t;
    for (const m of this.waterMats) {
      m.uniforms.time.value = t;
      m.uniforms.sunDir.value.copy(env.sunDir);
      m.uniforms.sunColor.value.copy(env.sunColor);
      m.uniforms.skyCol.value.copy(env.horizon);
      m.uniforms.light.value = env.light;
    }
    this.fallMat.uniforms.time.value = t;
    this.fallMat.uniforms.light.value = env.light;
    this.mist.material.uniforms.time.value = Math.sin(t * 0.4) * 2;
    this.mist.material.uniforms.lit.value.copy(env.cloudLit).lerp(new THREE.Color('#ffffff'), 0.5);
    this.mist.material.uniforms.shade.value.copy(env.cloudLit).multiplyScalar(0.9);
    const cm = this.clouds.material.uniforms;
    cm.time.value = t;
    cm.lit.value.copy(env.cloudLit);
    cm.shade.value.copy(env.cloudShade);
    for (const a of this.anim) a(t);
    // 등대 불빛 (밤)
    this.beam.beamMat.opacity = env.night * 0.18;
    this.beam.lampMat.color.set(env.night > 0.3 ? '#fff3c0' : '#d8d2c0');
    // 열기구 / 배
    for (const b of this.balloons) {
      const a = t * 0.02 + b.ph;
      b.m.position.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(t * 0.3 + b.ph) * 6, b.cz + Math.sin(a) * b.r);
    }
    for (const b of this.boats) {
      const a = t * 0.015 + b.ph;
      b.m.position.set(b.cx + Math.cos(a) * b.r, Math.sin(t * 1.2 + b.ph) * 0.3 - 0.2, b.cz + Math.sin(a) * b.r);
      b.m.rotation.set(Math.sin(t * 1.1 + b.ph) * 0.05, -a, Math.sin(t * 0.9 + b.ph) * 0.06);
    }
    // 새떼: 평소엔 원을 그리고, 가까이 오면 옆에서 같이 날기
    const d = new THREE.Object3D();
    let bi = 0;
    for (const f of this.flocks) {
      const a = t * 0.05 + f.ph;
      const home = new THREE.Vector3(f.cx + Math.cos(a) * f.r, f.y + Math.sin(t * 0.2 + f.ph) * 20, f.cz + Math.sin(a * 1.3) * f.r);
      const near = cam.flyer.distanceTo(f.c) < 90 && cam.speed > 8;
      f.follow += ((near ? 1 : 0) - f.follow) * Math.min(1, dt * (near ? 0.8 : 0.15));
      const side = new THREE.Vector3(Math.cos(cam.heading), 0, -Math.sin(cam.heading)).multiplyScalar(26);
      const target = home.clone().lerp(cam.flyer.clone().add(side).add(new THREE.Vector3(0, 6, 0)), f.follow);
      f.c.lerp(target, Math.min(1, dt * 1.2));
      const dir = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a * 1.3)).normalize().lerp(cam.dir, f.follow).normalize();
      for (const m of f.members) {
        m.p.set(f.c.x + m.ox, f.c.y + m.oy, f.c.z + m.oz);
        d.position.copy(m.p);
        d.lookAt(m.p.clone().add(dir));
        d.scale.setScalar(1.6);
        d.updateMatrix();
        this.birdMesh.setMatrixAt(bi++, d.matrix);
      }
    }
    this.birdMesh.instanceMatrix.needsUpdate = true;
    // 꽃잎 / 낙엽: 카메라 주변에만
    const cw = cherryW(cam.flyer.x, cam.flyer.z), aw = autumnW(cam.flyer.x, cam.flyer.z);
    const low = 1 - smoothstep(60, 160, cam.flyer.y - this.T.ground(cam.flyer.x, cam.flyer.z));
    const pk = Math.max(cw, aw) * low;
    this.petalMat.opacity = pk * 0.9;
    this.petals.visible = pk > 0.02;
    if (this.petals.visible) {
      this.petalMat.color.set(cw > aw ? '#ffc6dc' : '#f0a040');
      for (let i = 0; i < this.petalData.length; i++) {
        const q = this.petalData[i];
        q.p.x += (2.5 + Math.sin(t + i) * 1.2) * dt;
        q.p.y -= (1.2 + q.s * 0.8) * dt;
        q.p.z += Math.cos(t * 0.7 + i) * 1.2 * dt;
        const wx = ((q.p.x - cam.flyer.x + 60) % 120 + 120) % 120 - 60;
        const wy = ((q.p.y - cam.flyer.y + 30) % 60 + 60) % 60 - 30;
        const wz = ((q.p.z - cam.flyer.z + 60) % 120 + 120) % 120 - 60;
        d.position.set(cam.flyer.x + wx, cam.flyer.y + wy, cam.flyer.z + wz);
        d.rotation.set(t * q.s + q.r, t * 0.7 + q.r, t * 0.5 * q.s);
        d.scale.setScalar(q.s);
        d.updateMatrix();
        this.petals.setMatrixAt(i, d.matrix);
      }
      this.petals.instanceMatrix.needsUpdate = true;
    }
    // 반딧불 (밤)
    this.flyMat.opacity = env.night * 0.95;
    this.flies.visible = env.night > 0.02;
    if (this.flies.visible) {
      const pa = this.flies.geometry.attributes.position.array, b = this.flyBase;
      for (let i = 0; i < pa.length; i += 3) {
        pa[i] = b[i] + Math.sin(t * 0.5 + i) * 2;
        pa[i + 1] = b[i + 1] + Math.sin(t * 0.8 + i * 0.3) * 1.2;
        pa[i + 2] = b[i + 2] + Math.cos(t * 0.4 + i) * 2;
      }
      this.flies.geometry.attributes.position.needsUpdate = true;
    }
    this.starMat.opacity = env.night * 0.95;
    this.stars.position.copy(cam.position);
  }
}
