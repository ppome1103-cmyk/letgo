import * as THREE from '../vendor/three.module.min.js';

// ───────── 세계 설정 ─────────
export const HALF = 2000; // 4km × 4km
export const CELLS = 320; // 12.5m 간격 격자
export const CELL = (HALF * 2) / CELLS;
export const LAKE = { x: 0, z: 150, r: 230, level: 22 };
export const RIVER = [[-200, -1080], [-130, -820], [-40, -580], [70, -360], [30, -190], [0, -96]];
export const ISLANDS = [[1450, -300, 150, 70], [1660, 260, 120, 55], [1390, 960, 190, 95], [1820, 720, 90, 42], [1560, -820, 115, 62], [1250, -1150, 80, 36]];
export const PLACES = {
  village: { x: -380, z: 640 },
  bigTree: { x: 470, z: 900 },
  lighthouse: { x: 1035, z: 260 },
  arch: { x: 1300, z: 560 },
  fall: { x: 0, z: -80 },
  cherry: { x: -880, z: 960 },
  pavilion: { x: 330, z: -1180 },
};

// ───────── 노이즈 ─────────
export function hash(x, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, z * f);
    n += a;
    f *= 2.03;
    a *= 0.5;
  }
  return s / n;
}
function ridged(x, z) {
  let s = 0, a = 0.5, f = 1, w = 1, n = 0;
  for (let i = 0; i < 5; i++) {
    let r = 1 - Math.abs(vnoise(x * f, z * f) * 2 - 1);
    r *= r * w;
    w = Math.min(1, Math.max(0, r * 1.6));
    s += r * a;
    n += a;
    f *= 2.1;
    a *= 0.5;
  }
  return s / n;
}
export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function riverDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}

// 지역 가중치
export const autumnW = (x, z) => smoothstep(-450, -820, x) * (1 - smoothstep(380, 700, z)) * (1 - smoothstep(-650, -1000, z));
export const cherryW = (x, z) => 1 - smoothstep(230, 520, Math.hypot(x - PLACES.cherry.x, z - PLACES.cherry.z));

// ───────── 높이 함수 ─────────
export function height(x, z) {
  const hills = (fbm(x / 260 + 3.1, z / 260 + 7.7, 4) - 0.5) * 55;
  const roll = (fbm(x / 80 + 11, z / 80 + 2, 3) - 0.5) * 7;
  let h = 34 + hills + roll;
  // 북쪽 산맥
  const mz = smoothstep(-430, -1150, z) * (1 - smoothstep(-1600, -1900, z));
  if (mz > 0) {
    const r = ridged(x / 430 + 20, z / 430 + 5);
    h += mz * (r * r * 620 + (fbm(x / 140, z / 140, 4) - 0.35) * 80);
  }
  // 서쪽 단풍 언덕
  const wx = smoothstep(-480, -1050, x) * (1 - smoothstep(-1500, -1800, x));
  if (wx > 0) h += wx * (ridged(x / 260 + 7, z / 260 + 3) * 150);
  // 호수 북쪽 고원 (폭포 절벽)
  const pm = smoothstep(-64, -92, z) * (1 - smoothstep(520, 760, Math.abs(x)));
  h += pm * 70;
  // 고원 위 강
  if (z < -70) {
    const rd = riverDist(x, z);
    if (rd < 50) h -= (1 - smoothstep(9, 50, rd)) * 10;
  }
  // 호수
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  const lk = (1 - smoothstep(LAKE.r * 0.68, LAKE.r * 1.12, dl)) * (1 - smoothstep(-40, -78, z));
  h += (LAKE.level - 9 - h) * lk;
  // 해안선
  const ang = Math.atan2(z, x);
  const rr = Math.hypot(x * 0.95, z) + (fbm(Math.cos(ang) * 2.5 + 9, Math.sin(ang) * 2.5 + 9, 3) - 0.5) * 520;
  const edge = smoothstep(1480, 1840, rr);
  const cliff = smoothstep(1050, 1115, x + (fbm(z / 130, 3.3, 3) - 0.5) * 140);
  const sea = Math.max(edge, cliff);
  h += (-30 - h) * sea;
  // 섬
  for (const [ix, iz, ir, ih] of ISLANDS) {
    const d = Math.hypot(x - ix, z - iz) / ir;
    if (d < 1.25) {
      const k = Math.max(0, 1 - d * d);
      const nh = -24 + (ih + 24) * Math.pow(k, 0.8) * (0.7 + fbm(x / 55, z / 55, 3) * 0.6);
      if (nh > h) h = nh;
    }
  }
  return h;
}

// ───────── 격자 생성 ─────────
const C = new THREE.Color();
const tmp = new THREE.Color();
function terrainColor(x, z, h, slope) {
  const n = fbm(x / 45 + 1, z / 45 + 4, 3);
  const n2 = fbm(x / 120 + 8, z / 120 + 1, 3);
  if (h < 1.5) {
    C.set(h < -2 ? '#c9b98a' : '#ead9a6');
    return C;
  }
  const nearLake = Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.15;
  if (h < 4.5 || (nearLake && h < LAKE.level + 2.2)) {
    C.set('#e9d8a4');
    return C;
  }
  // 풀
  C.set('#7fbf62').lerp(tmp.set('#a8d47a'), n);
  C.lerp(tmp.set('#5f9f50'), Math.max(0, n2 - 0.45) * 1.6);
  // 꽃밭
  const fl = fbm(x / 30 + 30, z / 30 + 30, 2);
  if (h < 80 && fl > 0.68) C.lerp(tmp.set(fl > 0.74 ? '#f2df86' : '#eef0e0'), Math.min(0.35, (fl - 0.68) * 3));
  const aw = autumnW(x, z);
  if (aw > 0) C.lerp(tmp.set('#c98f4c').lerp(tmp.clone().set('#b56a3a'), n), aw * 0.75);
  const cw = cherryW(x, z);
  if (cw > 0) {
    C.lerp(tmp.set('#b9de8e'), cw * 0.5);
    if (fl > 0.58) C.lerp(tmp.set('#f4c7da'), cw * (fl - 0.58) * 4);
  }
  // 높은 곳은 마른 풀
  if (h > 140) C.lerp(tmp.set('#9aa36a'), Math.min(1, (h - 140) / 160));
  // 바위
  const rock = smoothstep(0.36, 0.56, slope) + smoothstep(260, 360, h) * 0.6;
  if (rock > 0) C.lerp(tmp.set('#8e8780').lerp(tmp.clone().set('#a59d93'), n), Math.min(1, rock));
  // 눈
  const snowLine = 390 + (n2 - 0.5) * 120;
  if (h > snowLine && slope < 0.72) C.lerp(tmp.set('#f4f6fb'), Math.min(1, (h - snowLine) / 40));
  return C;
}

export class Terrain {
  constructor() {
    const N = CELLS + 1;
    this.N = N;
    this.h = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) this.h[j * N + i] = height(-HALF + i * CELL, z);
    }
    // 법선
    this.nrm = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const l = this.h[j * N + Math.max(0, i - 1)], r = this.h[j * N + Math.min(N - 1, i + 1)];
        const d = this.h[Math.max(0, j - 1) * N + i], u = this.h[Math.min(N - 1, j + 1) * N + i];
        let nx = l - r, ny = 2 * CELL, nz = d - u;
        const len = Math.hypot(nx, ny, nz);
        const k = (j * N + i) * 3;
        this.nrm[k] = nx / len;
        this.nrm[k + 1] = ny / len;
        this.nrm[k + 2] = nz / len;
      }
    }
  }

  // 빠른 지면 높이 (격자 보간)
  ground(x, z) {
    const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    if (gx < 0 || gz < 0 || gx >= CELLS || gz >= CELLS) return -30;
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, N = this.N;
    const a = this.h[j * N + i], b = this.h[j * N + i + 1], c = this.h[(j + 1) * N + i], d = this.h[(j + 1) * N + i + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }
  slope(x, z) {
    const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
    if (i < 0 || j < 0 || i >= this.N || j >= this.N) return 0;
    return 1 - this.nrm[(j * this.N + i) * 3 + 1];
  }

  buildMeshes(scene, material) {
    const CH = 40; // 청크 하나 = 40칸 = 500m
    const N = this.N;
    const meshes = [];
    for (let cj = 0; cj < CELLS / CH; cj++) {
      for (let ci = 0; ci < CELLS / CH; ci++) {
        const V = CH + 1;
        const pos = new Float32Array(V * V * 3), nor = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
        let minY = 1e9, maxY = -1e9;
        for (let j = 0; j < V; j++) {
          for (let i = 0; i < V; i++) {
            const gi = ci * CH + i, gj = cj * CH + j;
            const g = gj * N + gi, k = (j * V + i) * 3;
            const x = -HALF + gi * CELL, z = -HALF + gj * CELL, y = this.h[g];
            pos[k] = x;
            pos[k + 1] = y;
            pos[k + 2] = z;
            nor[k] = this.nrm[g * 3];
            nor[k + 1] = this.nrm[g * 3 + 1];
            nor[k + 2] = this.nrm[g * 3 + 2];
            const c = terrainColor(x, z, y, 1 - this.nrm[g * 3 + 1]);
            col[k] = c.r;
            col[k + 1] = c.g;
            col[k + 2] = c.b;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        if (maxY < -12) continue; // 완전히 바닷속이면 생략
        const idx = [];
        for (let j = 0; j < CH; j++) {
          for (let i = 0; i < CH; i++) {
            const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
            idx.push(a, c, b, b, c, d);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, material);
        scene.add(m);
        meshes.push(m);
      }
    }
    return meshes;
  }

  // 물 셰이더용 높이 텍스처 (-20m ~ +40m 범위)
  heightTexture() {
    const N = this.N;
    const data = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const v = Math.max(0, Math.min(255, Math.round(((this.h[i] + 20) / 60) * 255)));
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }
}
