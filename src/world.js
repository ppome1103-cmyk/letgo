import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './util.js';

// ───────── 동네 크기 ─────────
export const N = 5; // 블록 개수 (가로/세로)
export const BLOCK = 32; // 블록 한 변 (m)
export const ROAD = 10; // 도로 폭
export const HALF = (N * BLOCK + (N + 1) * ROAD) / 2; // 맵 반지름 (110m)
export const Y0 = 0.15; // 보도 높이
const SIDEWALK = 2.2;
const FH = 2.9; // 한 층 높이
const CELL = 8; // 충돌 해시 칸 크기

const SIDES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const VILLA = ['#b9583f', '#c46a4f', '#e3d3b0', '#efe7d8', '#d6d0c6', '#e6bfb3', '#bfdccc', '#d8c39a', '#a9553f', '#f2e2c9', '#c9d3dc'];
const WALLS = ['#b4ac9f', '#a65f49', '#c6bfb2', '#988f84', '#d0c8b9'];
const TANKS = ['#3f7fcc', '#e9c54a', '#4f9a5c', '#e3e3e3'];
const LEAVES = ['#f2c12e', '#f0b323', '#e8a33a', '#f5d04a', '#d9852f', '#9cc35a'];

// V: 빌라 골목, S: 편의점, P: 놀이터 공원, T: 제일 높은 맨션
const LAYOUT = ['VVVVV', 'VSVTV', 'VVPVV', 'VVVSV', 'VVVVV'];

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const h = {};
  c.getHSL(h);
  c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + amt)));
  return '#' + c.getHexString();
}

export class World {
  constructor(scene, seed = 1101) {
    this.scene = scene;
    this.rand = mulberry32(seed);
    this.colliders = [];
    this.big = [];
    this.grid = new Map();
    this.qstamp = 1;
    this.inst = {};
    this.meshes = {};
    this.windows = []; // { i, lit, store }
    this.points = { roof: [], ac: [], wall: [], ground: [], sidewalk: [], storeFront: [], bench: [], sun: [], leaf: [] };
    this.rects = []; // 미니맵용
    this.poleTops = [];
    this.wires = [];
    this.blocks = [];
    this.signs = [];
    this.tower = null;
    this.parkCenter = null;
    this.night = null;
    this.build();
    this.finalize();
  }

  pick(arr) {
    return arr[Math.floor(this.rand() * arr.length)];
  }
  range(a, b) {
    return a + this.rand() * (b - a);
  }

  // ───────── 인스턴스 / 충돌 ─────────
  addInst(cat, x, y, z, sx, sy, sz, color, rot) {
    (this.inst[cat] ||= []).push({ x, y, z, sx, sy, sz, color, rot });
    return this.inst[cat].length - 1;
  }

  collider(x0, y0, z0, x1, y1, z1, tag) {
    const c = { x0, y0, z0, x1, y1, z1, tag, q: 0 };
    this.colliders.push(c);
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 300) {
      this.big.push(c);
      return c;
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * 1000 + cz;
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(c);
      }
    }
    return c;
  }

  query(x0, z0, x1, z1, out = []) {
    out.length = 0;
    const s = ++this.qstamp;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const a = this.grid.get(cx * 1000 + cz);
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const c = a[i];
          if (c.q !== s) {
            c.q = s;
            out.push(c);
          }
        }
      }
    }
    for (let i = 0; i < this.big.length; i++) out.push(this.big[i]);
    return out;
  }

  // 발 밑 바닥 높이 (그림자/착지 표시용)
  groundHeightAt(x, z, maxY) {
    const list = this.query(x, z, x, z, this._q || (this._q = []));
    let best = -1;
    for (const c of list) {
      if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && c.y1 <= maxY + 0.02 && c.y1 > best) best = c.y1;
    }
    return best;
  }

  // 선분 레이캐스트 (카메라가 벽을 뚫지 않게)
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const list = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), this._rq || (this._rq = []));
    let best = maxT;
    for (const c of list) {
      if (c.tag === 'leaf') continue;
      let t0 = 0, t1 = best;
      // x
      if (Math.abs(dx) < 1e-8) {
        if (ox < c.x0 || ox > c.x1) continue;
      } else {
        let a = (c.x0 - ox) / dx, b = (c.x1 - ox) / dx;
        if (a > b) [a, b] = [b, a];
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) continue;
      }
      if (Math.abs(dy) < 1e-8) {
        if (oy < c.y0 || oy > c.y1) continue;
      } else {
        let a = (c.y0 - oy) / dy, b = (c.y1 - oy) / dy;
        if (a > b) [a, b] = [b, a];
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-8) {
        if (oz < c.z0 || oz > c.z1) continue;
      } else {
        let a = (c.z0 - oz) / dz, b = (c.z1 - oz) / dz;
        if (a > b) [a, b] = [b, a];
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) continue;
      }
      if (t0 > 0 && t0 < best) best = t0;
    }
    return best;
  }

  // 상자 하나 (x,z = 중심, y = 바닥)
  box(x, y, z, sx, sy, sz, color, solid = true, cat = 'box', tag) {
    this.addInst(cat, x, y, z, sx, sy, sz, color);
    if (solid) return this.collider(x - sx / 2, y, z - sz / 2, x + sx / 2, y + sy, z + sz / 2, tag);
    return null;
  }

  addWindow(x, y, z, sx, sy, sz, store = false) {
    const i = this.addInst('window', x, y, z, sx, sy, sz, '#5f7f9c');
    this.windows.push({ i, lit: store || this.rand() < 0.5, store, tint: this.rand() });
  }

  // ───────── 동네 생성 ─────────
  build() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 200, HALF * 2 + 200),
      new THREE.MeshLambertMaterial({ color: '#5a5d64' }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.collider(-HALF - 100, -2, -HALF - 100, HALF + 100, 0, HALF + 100, 'ground');

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const type = LAYOUT[j][i];
        const bx0 = -HALF + ROAD + i * (BLOCK + ROAD);
        const bz0 = -HALF + ROAD + j * (BLOCK + ROAD);
        this.box(bx0 + BLOCK / 2, 0, bz0 + BLOCK / 2, BLOCK, Y0, BLOCK, '#c9b49e');
        this.blocks.push({ i, j, type, x0: bx0, z0: bz0 });
        if (type === 'V') this.villaBlock(bx0, bz0);
        else if (type === 'S') this.storeBlock(bx0, bz0);
        else if (type === 'P') this.parkBlock(bx0, bz0);
        else if (type === 'T') this.towerBlock(bx0, bz0);
        this.streetDeco(bx0, bz0, type, i, j);
      }
    }
    this.roadMarks();
    this.backdrop();
  }

  wallLine(xa, za, xb, zb, h, color, gateAt, gw) {
    const wt = 0.25;
    const horiz = Math.abs(za - zb) < 1e-6;
    const a0 = horiz ? xa : za, a1 = horiz ? xb : zb;
    const segs = gateAt == null ? [[a0, a1]] : [[a0, gateAt - gw], [gateAt + gw, a1]];
    for (const [s0, s1] of segs) {
      const len = s1 - s0;
      if (len < 0.3) continue;
      const mid = (s0 + s1) / 2;
      if (horiz) this.box(mid, Y0, za, len, h, wt, color);
      else this.box(xa, Y0, mid, wt, h, len, color);
      // 담벼락 위 기와 느낌의 얇은 덮개
      if (horiz) this.box(mid, Y0 + h, za, len, 0.06, wt + 0.08, shade(color, -0.1), false);
      else this.box(xa, Y0 + h, mid, wt + 0.08, 0.06, len, shade(color, -0.1), false);
      const p = horiz ? { x: mid, y: Y0 + h, z: za } : { x: xa, y: Y0 + h, z: mid };
      this.points.wall.push(p);
    }
  }

  villaBlock(bx0, bz0) {
    const I = SIDEWALK, A = 2.4;
    const inner = BLOCK - 2 * I;
    const L = (inner - A) / 2;
    const xs = [bx0 + I, bx0 + I + L + A];
    const zs = [bz0 + I, bz0 + I + L + A];
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        const gate = this.rand() < 0.5 ? (a ? 'e' : 'w') : b ? 's' : 'n';
        this.villaLot(xs[a], zs[b], xs[a] + L, zs[b] + L, gate);
      }
    }
    // 골목 (십자)
    this.points.ground.push({ x: bx0 + BLOCK / 2, y: Y0, z: bz0 + BLOCK / 2 });
    this.points.ground.push({ x: bx0 + BLOCK / 2, y: Y0, z: bz0 + I + L / 2 });
    this.points.ground.push({ x: bx0 + I + L / 2, y: Y0, z: bz0 + BLOCK / 2 });
    // 골목에 쓰레기봉투 / 화분
    if (this.rand() < 0.7) {
      const x = bx0 + BLOCK / 2 + this.range(-0.6, 0.6), z = bz0 + I + this.range(2, L - 2);
      this.box(x, Y0, z, 0.55, 0.5, 0.55, '#ececec', true);
      this.box(x + 0.4, Y0, z + 0.5, 0.5, 0.45, 0.5, '#3c3c3c', true);
    }
    this.rects.push({ x0: bx0 + I, z0: bz0 + I, x1: bx0 + BLOCK - I, z1: bz0 + BLOCK - I, type: 'lot' });
  }

  villaLot(x0, z0, x1, z1, gate, floors) {
    const wt = 0.25;
    const wh = this.range(1.15, 1.6);
    const wc = this.pick(WALLS);
    const gx = (x0 + x1) / 2 + this.range(-1.5, 1.5);
    const gz = (z0 + z1) / 2 + this.range(-1.5, 1.5);
    const gw = 1.1;
    this.wallLine(x0, z0 + wt / 2, x1, z0 + wt / 2, wh, wc, gate === 'n' ? gx : null, gw);
    this.wallLine(x0, z1 - wt / 2, x1, z1 - wt / 2, wh, wc, gate === 's' ? gx : null, gw);
    this.wallLine(x0 + wt / 2, z0 + wt, x0 + wt / 2, z1 - wt, wh, wc, gate === 'w' ? gz : null, gw);
    this.wallLine(x1 - wt / 2, z0 + wt, x1 - wt / 2, z1 - wt, wh, wc, gate === 'e' ? gz : null, gw);
    // 마당 바닥
    this.box((x0 + x1) / 2, Y0, (z0 + z1) / 2, x1 - x0 - 0.1, 0.02, z1 - z0 - 0.1, '#b3aa9c', false);
    // 건물
    const m = 1.55;
    const availW = x1 - x0 - 2 * (m + wt);
    const availD = z1 - z0 - 2 * (m + wt);
    const bw = Math.min(availW, this.range(6.5, 8.5));
    const bd = Math.min(availD, this.range(6.5, 8.5));
    const bx = x0 + wt + m + bw / 2 + this.rand() * (availW - bw);
    const bz = z0 + wt + m + bd / 2 + this.rand() * (availD - bd);
    const fl = floors ?? 2 + Math.floor(this.rand() * 3);
    this.building(bx, bz, bw, bd, fl, { front: gate });
    // 마당의 디딤돌 (담 타기용 화분/통)
    const corner = this.rand() < 0.5;
    const sx = corner ? x0 + wt + 0.45 : x1 - wt - 0.45;
    const sz = this.rand() < 0.5 ? z0 + wt + 0.45 : z1 - wt - 0.45;
    if (this.rand() < 0.75) {
      this.box(sx, Y0, sz, 0.6, 0.55, 0.6, this.pick(['#5b8f55', '#8b5a3c', '#5d7fa8', '#9aa0a6']));
    }
    const S = SIDES[gate];
    this.points.ground.push({ x: (x0 + x1) / 2 + S[0] * (x1 - x0) * 0.36, y: Y0, z: (z0 + z1) / 2 + S[1] * (z1 - z0) * 0.36 });
  }

  building(cx, cz, w, d, floors, o = {}) {
    const H = Y0 + floors * FH + 0.3;
    const color = o.color || this.pick(VILLA);
    this.box(cx, Y0, cz, w, H - Y0, d, color);
    this.rects.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, type: 'bld', h: H });
    // 초록 방수페인트 옥상
    this.box(cx, H, cz, w - 0.3, 0.02, d - 0.3, o.roofColor || '#5aa874', false);
    // 난간
    const pc = shade(color, -0.12), pt = 0.18, ph = 0.25;
    this.box(cx, H, cz - d / 2 + pt / 2, w, ph, pt, pc);
    this.box(cx, H, cz + d / 2 - pt / 2, w, ph, pt, pc);
    this.box(cx - w / 2 + pt / 2, H, cz, pt, ph, d - 2 * pt, pc);
    this.box(cx + w / 2 - pt / 2, H, cz, pt, ph, d - 2 * pt, pc);
    // 층 구분선
    for (let f = 1; f < floors; f++) {
      this.box(cx, Y0 + f * FH - 0.06, cz, w + 0.06, 0.12, d + 0.06, pc, false);
    }
    // 창문
    for (const sk of ['n', 's', 'e', 'w']) {
      const S = SIDES[sk];
      const len = S[0] ? d : w;
      const n = Math.max(1, Math.floor((len - 1.2) / 2.3));
      const step = len / n;
      for (let f = 0; f < floors; f++) {
        const wy = Y0 + f * FH + 0.95;
        for (let k = 0; k < n; k++) {
          const off = -len / 2 + step * (k + 0.5);
          if (sk === o.front && f === 0 && Math.abs(off) < 1.5) continue;
          const px = cx + S[0] * (w / 2 + 0.02) + (S[0] ? 0 : off);
          const pz = cz + S[1] * (d / 2 + 0.02) + (S[1] ? 0 : off);
          this.addWindow(px, wy, pz, S[0] ? 0.06 : 1.0, 1.15, S[0] ? 1.0 : 0.06);
        }
      }
    }
    // 현관문
    if (o.front) {
      const S = SIDES[o.front];
      const px = cx + S[0] * (w / 2 + 0.03), pz = cz + S[1] * (d / 2 + 0.03);
      this.box(px, Y0, pz, S[0] ? 0.08 : 1.2, 1.95, S[0] ? 1.2 : 0.08, '#6b4a33', false);
      // 현관 차양 (발판)
      const ax = cx + S[0] * (w / 2 + 0.45), az = cz + S[1] * (d / 2 + 0.45);
      this.box(ax, 2.15, az, S[0] ? 0.9 : 1.8, 0.1, S[0] ? 1.8 : 0.9, '#7d8a96');
      this.points.ac.push({ x: ax, y: 2.25, z: az });
    }
    // 실외기 계단 (고양이 등반로!)
    const acSides = o.acSides || [this.pick(['n', 's', 'e', 'w'].filter((s) => s !== o.front))];
    for (const sk of acSides) this.acStair(cx, cz, w, d, H, sk);

    // 옥상 소품
    const blocked = [];
    if (o.tank !== false && w > 5.5 && this.rand() < 0.75) {
      const tx = cx + (this.rand() < 0.5 ? -1 : 1) * (w / 2 - 1.3);
      const tz = cz + (this.rand() < 0.5 ? -1 : 1) * (d / 2 - 1.3);
      this.box(tx, H, tz, 1.3, 0.35, 1.3, '#8b8b8b');
      this.addInst('tank', tx, H + 0.35, tz, 1.5, 1.3, 1.5, this.pick(TANKS));
      this.collider(tx - 0.75, H + 0.35, tz - 0.75, tx + 0.75, H + 1.65, tz + 0.75);
      blocked.push([tx - 1, tz - 1, tx + 1, tz + 1]);
      this.points.roof.push({ x: tx, y: H + 1.65, z: tz, top: true });
    }
    if (o.hut || (w > 6 && this.rand() < 0.45)) {
      let hx, hz, tries = 0;
      do {
        hx = cx + this.range(-(w / 2 - 1.6), w / 2 - 1.6);
        hz = cz + this.range(-(d / 2 - 1.6), d / 2 - 1.6);
        tries++;
      } while (tries < 8 && blocked.some((b) => hx + 1.4 > b[0] && hx - 1.4 < b[2] && hz + 1.4 > b[1] && hz - 1.4 < b[3]));
      if (tries < 8) {
        this.box(hx, H, hz, 2.4, 1.95, 2.4, shade(color, 0.05));
        this.box(hx, H + 1.95, hz, 2.6, 0.08, 2.6, '#7d8a96');
        blocked.push([hx - 1.4, hz - 1.4, hx + 1.4, hz + 1.4]);
        this.points.roof.push({ x: hx, y: H + 2.03, z: hz, top: true });
      }
    }
    for (let k = 0; k < 3; k++) {
      const px = cx + this.range(-(w / 2 - 0.8), w / 2 - 0.8);
      const pz = cz + this.range(-(d / 2 - 0.8), d / 2 - 0.8);
      if (blocked.some((b) => px > b[0] && px < b[2] && pz > b[1] && pz < b[3])) continue;
      this.points.roof.push({ x: px, y: H, z: pz });
    }
    return H;
  }

  acStair(cx, cz, w, d, H, sk) {
    const S = SIDES[sk];
    const len = S[0] ? d : w;
    const base = (this.rand() - 0.5) * Math.max(0, len - 3);
    const tops = [0.95];
    let t = 0.95;
    while (H + 0.25 - t > 1.8) {
      t += 1.65;
      tops.push(t);
    }
    const acD = 0.72, acW = 0.88, acH = 0.55;
    for (let k = 0; k < tops.length; k++) {
      const off = base + (k % 2 ? 0.75 : -0.75);
      const top = tops[k];
      const px = cx + S[0] * (w / 2 + acD / 2) + (S[0] ? 0 : off);
      const pz = cz + S[1] * (d / 2 + acD / 2) + (S[1] ? 0 : off);
      const ry = Math.atan2(S[0], S[1]);
      this.addInst('ac', px, top - acH, pz, acW, acH, acD, '#ffffff', [0, ry, 0]);
      const sx = S[0] ? acD : acW, sz = S[0] ? acW : acD;
      this.collider(px - sx / 2, top - acH, pz - sz / 2, px + sx / 2, top, pz + sz / 2);
      // 실외기 받침대
      if (k > 0) this.box(px, top - acH - 0.06, pz, sx, 0.06, sz, '#6d6d6d', false);
      this.points.ac.push({ x: px, y: top, z: pz });
    }
  }

  storeBlock(bx0, bz0) {
    const I = SIDEWALK, A = 2.4;
    const inner = BLOCK - 2 * I;
    const L = (inner - A) / 2;
    this.villaLot(bx0 + I, bz0 + I, bx0 + I + L, bz0 + I + L, 'n');
    this.villaLot(bx0 + I + L + A, bz0 + I, bx0 + I + inner, bz0 + I + L, 'n');
    this.rects.push({ x0: bx0 + I, z0: bz0 + I, x1: bx0 + BLOCK - I, z1: bz0 + I + L, type: 'lot' });

    const sw = 11, sd = 7, sh = 3.6;
    const sx = bx0 + BLOCK / 2;
    const sz = bz0 + BLOCK - I - 4.6 - sd / 2;
    const front = sz + sd / 2;
    // 광장 바닥
    this.box(sx, Y0, bz0 + BLOCK - I - 2.3 - 0.2, inner, 0.02, 5.0, '#d7cdbf', false);
    this.box(sx, Y0, sz, sw, sh - Y0, sd, '#f4f4f0');
    this.rects.push({ x0: sx - sw / 2, z0: sz - sd / 2, x1: sx + sw / 2, z1: sz + sd / 2, type: 'store', h: sh });
    this.box(sx, sh - 0.95, sz, sw + 0.06, 0.55, sd + 0.06, '#2f9e6e', false);
    this.box(sx, sh - 0.4, sz, sw + 0.06, 0.12, sd + 0.06, '#2b6fb3', false);
    // 옥상
    this.box(sx, sh, sz, sw - 0.3, 0.02, sd - 0.3, '#9aa3a8', false);
    const pt = 0.18, ph = 0.25;
    this.box(sx, sh, sz - sd / 2 + pt / 2, sw, ph, pt, '#d9d9d4');
    this.box(sx, sh, sz + sd / 2 - pt / 2, sw, ph, pt, '#d9d9d4');
    this.box(sx - sw / 2 + pt / 2, sh, sz, pt, ph, sd - 2 * pt, '#d9d9d4');
    this.box(sx + sw / 2 - pt / 2, sh, sz, pt, ph, sd - 2 * pt, '#d9d9d4');
    // 유리창 + 문
    this.addWindow(sx - 1.5, Y0 + 0.25, front + 0.03, sw - 4.5, 2.0, 0.06, true);
    this.box(sx + 3.6, Y0, front + 0.035, 1.6, 2.3, 0.07, '#cfeaf3', false);
    // 간판
    this.signs.push({ x: sx, y: sh - 0.67, z: front + 0.07, w: 6.5, h: 0.55, ry: 0, text: '24시 골목편의점', bg: '#2f9e6e', fg: '#ffffff' });
    // 차양 (발판)
    this.box(sx, 2.6, front + 0.8, sw, 0.12, 1.6, '#3aa676');
    this.points.ac.push({ x: sx - 3, y: 2.72, z: front + 0.8 });
    // 플라스틱 테이블과 의자
    for (const tx of [sx - 3.2, sx + 0.6]) {
      const tz = front + 2.6;
      this.box(tx, Y0, tz, 0.9, 0.72, 0.9, '#3fae5a');
      this.box(tx - 0.8, Y0, tz, 0.42, 0.45, 0.42, '#3fae5a');
      this.box(tx + 0.8, Y0, tz, 0.42, 0.45, 0.42, '#3fae5a');
      this.points.ac.push({ x: tx, y: Y0 + 0.72, z: tz });
    }
    // 음료 상자 계단 (차양으로 올라가는 길)
    const cx = sx + sw / 2 - 0.5, cz = front + 2.1;
    const crate = (x, y, z) => this.box(x, y, z, 0.6, 0.6, 0.6, this.pick(['#e5433c', '#f2b51d', '#2b78c9']));
    crate(cx + 1.3, Y0, cz);
    crate(cx + 0.65, Y0, cz);
    crate(cx + 0.65, Y0 + 0.6, cz);
    crate(cx, Y0, cz);
    crate(cx, Y0 + 0.6, cz);
    crate(cx, Y0 + 1.2, cz);
    // 옥상 실외기
    for (let k = 0; k < 2; k++) {
      const px = sx - 3 + k * 2.2, pz = sz - 1.5;
      this.addInst('ac', px, sh, pz, 0.88, 0.55, 0.72, '#ffffff', [0, 0, 0]);
      this.collider(px - 0.44, sh, pz - 0.36, px + 0.44, sh + 0.55, pz + 0.36);
    }
    this.points.roof.push({ x: sx + 2.5, y: sh, z: sz });
    this.points.sun.push({ x: sx + 2.8, y: sh, z: sz + 1 });
    this.points.storeFront.push({ x: sx - 1.2, y: Y0, z: front + 3.0 });
    this.points.ground.push({ x: sx + 2.2, y: Y0, z: front + 3.2 });
  }

  parkBlock(bx0, bz0) {
    const I = SIDEWALK;
    const inner = BLOCK - 2 * I;
    const cx = bx0 + BLOCK / 2, cz = bz0 + BLOCK / 2;
    this.parkCenter = { x: cx, y: Y0 + 0.11, z: cz };
    this.rects.push({ x0: bx0 + I, z0: bz0 + I, x1: bx0 + BLOCK - I, z1: bz0 + BLOCK - I, type: 'park' });
    this.box(cx, Y0, cz, inner, 0.05, inner, '#8cc063');
    // 산책로
    this.box(cx, Y0 + 0.05, cz, inner, 0.05, 2.6, '#dccba8');
    this.box(cx, Y0 + 0.05, cz, 2.6, 0.05, inner, '#dccba8');
    // 모래 놀이터 (북동)
    const px = cx + 7, pz = cz - 7;
    this.box(px, Y0 + 0.05, pz, 9, 0.06, 9, '#ead59c');
    // 미끄럼틀
    const sy = Y0 + 0.11;
    this.box(px - 1.5, sy, pz - 1.6, 0.9, 0.6, 0.9, '#f2b51d');
    this.box(px - 1.5, sy, pz - 0.8, 0.9, 1.2, 0.8, '#2b78c9');
    this.box(px - 1.5, sy, pz, 1.2, 1.8, 1.0, '#e5433c');
    this.box(px - 1.5, sy + 1.8, pz, 1.4, 0.1, 1.2, '#f2b51d');
    const slen = Math.hypot(2.8, 1.75);
    this.addInst('box', px - 1.5, sy + 0.9, pz + 2.0, 0.9, 0.08, slen, '#f2b51d', [Math.atan2(1.75, 2.8), 0, 0]);
    this.points.ac.push({ x: px - 1.5, y: sy + 1.9, z: pz });
    // 그네
    const gx = px + 1.8, gz = pz + 1.5;
    this.box(gx - 1.7, sy, gz, 0.12, 2.4, 0.12, '#e5433c');
    this.box(gx + 1.7, sy, gz, 0.12, 2.4, 0.12, '#e5433c');
    this.box(gx, sy + 2.4, gz, 3.6, 0.12, 0.14, '#e5433c');
    for (const ox of [-0.8, 0.8]) {
      this.box(gx + ox - 0.22, sy + 0.5, gz, 0.03, 1.9, 0.03, '#888', false);
      this.box(gx + ox + 0.22, sy + 0.5, gz, 0.03, 1.9, 0.03, '#888', false);
      this.box(gx + ox, sy + 0.45, gz, 0.55, 0.06, 0.3, '#2b78c9');
    }
    // 벤치
    const benches = [
      [cx - 5, cz + 1.9, 0],
      [cx + 5, cz + 1.9, 0],
      [cx - 5, cz - 1.9, 0],
      [cx - 1.9, cz + 6, 1],
    ];
    for (const [x, z, rot] of benches) {
      if (rot) this.box(x, sy, z, 0.5, 0.45, 1.6, '#a8713f');
      else this.box(x, sy, z, 1.6, 0.45, 0.5, '#a8713f');
      this.points.bench.push({ x, y: sy + 0.45, z });
    }
    // 정자 (남서)
    const jx = cx - 7.5, jz = cz + 7.5;
    for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      this.box(jx + ox, sy, jz + oz, 0.22, 2.6, 0.22, '#8a5a35');
    }
    this.box(jx, sy, jz, 3.6, 0.45, 3.6, '#b98552');
    this.box(jx, sy + 2.6, jz, 4.4, 0.25, 4.4, '#5b6e52');
    this.box(jx, sy + 2.85, jz, 2.6, 0.3, 2.6, '#4d5f45');
    this.box(jx + 2.6, sy, jz - 1.2, 0.6, 0.9, 0.6, '#8b5a3c');
    this.box(jx + 2.6, sy, jz - 0.4, 0.6, 1.6, 0.6, '#8b5a3c');
    this.points.roof.push({ x: jx, y: sy + 3.15, z: jz, top: true });
    // 나무
    const tp = [
      [-11, -11], [-6, -12], [11.5, 3], [11, 11], [4, 11.5], [-12, -4], [-12, 3], [5, -12], [-3, -11.5], [11.5, -2], [-2.5, 11.5],
    ];
    for (const [ox, oz] of tp) this.tree(cx + ox, cz + oz, this.range(0.85, 1.15), sy);
    // 햇볕 자리
    this.points.sun.push({ x: cx - 6.5, y: sy, z: cz - 6.5 });
    this.points.sun.push({ x: cx + 6, y: sy, z: cz + 6.5 });
    this.points.ground.push({ x: cx + 6, y: sy, z: cz + 5 });
  }

  towerBlock(bx0, bz0) {
    const I = SIDEWALK;
    const cx = bx0 + BLOCK / 2, cz = bz0 + BLOCK / 2 - 1;
    this.box(cx, Y0, bz0 + BLOCK / 2, BLOCK - 2 * I, 0.02, BLOCK - 2 * I, '#cfc6b6', false);
    const w = 13, d = 11;
    const H = this.building(cx + 2, cz, w, d, 7, { front: 's', acSides: ['w', 'n', 'e'], color: '#ece6da', hut: true });
    this.tower = { x0: cx + 2 - w / 2, x1: cx + 2 + w / 2, z0: cz - d / 2, z1: cz + d / 2, y: H, cx: cx + 2, cz };
    this.signs.push({ x: cx + 2, y: H - 1.0, z: cz + d / 2 + 0.05, w: 4.8, h: 0.8, ry: 0, text: '햇살맨션', bg: '#f6efe0', fg: '#b9583f' });
    // 깃발
    this.flag = { x: cx + 2 + w / 2 - 0.8, y: H, z: cz - d / 2 + 0.8 };
    this.box(this.flag.x, H, this.flag.z, 0.08, 3.2, 0.08, '#dddddd', false);
    // 별관 (2층)
    this.building(bx0 + I + 3.2, cz + 7, 5.2, 6, 2, { front: 'w', tank: false });
    this.building(bx0 + I + 3.2, cz - 6.5, 5.2, 6.5, 4, { front: 'w', tank: false });
    // 화단
    this.box(cx + 2, Y0, bz0 + BLOCK - I - 1.5, 10, 0.5, 1.2, '#8b6b4c');
    this.tree(cx - 2, bz0 + BLOCK - I - 1.5, 0.9, Y0 + 0.5);
    this.tree(cx + 6, bz0 + BLOCK - I - 1.5, 0.9, Y0 + 0.5);
    this.rects.push({ x0: bx0 + I, z0: bz0 + I, x1: bx0 + BLOCK - I, z1: bz0 + BLOCK - I, type: 'lot' });
    this.points.sun.push({ x: this.tower.cx - 2, y: H, z: cz + 2 });
  }

  tree(x, z, s = 1, baseY = Y0, color) {
    const th = 2.2 * s, lr = 1.3 * s;
    const leafY = baseY + th + lr * 0.5;
    this.addInst('trunk', x, baseY, z, 0.24 * s, th, 0.24 * s, '#7a5a3c');
    this.addInst('leaf', x, leafY, z, lr, lr * 0.9, lr, color || this.pick(LEAVES), [0, this.rand() * 3, 0]);
    this.collider(x - 0.14 * s, baseY, z - 0.14 * s, x + 0.14 * s, baseY + th, z + 0.14 * s);
    const top = leafY + lr * 0.9 * 0.72;
    this.collider(x - lr * 0.62, top - 0.3, z - lr * 0.62, x + lr * 0.62, top, z + lr * 0.62, 'leaf');
    this.points.leaf.push({ x, y: top, z });
  }

  streetDeco(bx0, bz0, type, i, j) {
    const o = 0.7;
    const corners = [
      [bx0 + o, bz0 + o],
      [bx0 + BLOCK - o, bz0 + o],
      [bx0 + BLOCK - o, bz0 + BLOCK - o],
      [bx0 + o, bz0 + BLOCK - o],
    ];
    const tops = [];
    for (const [x, z] of corners) {
      this.addInst('pole', x, Y0, z, 0.26, 8.5, 0.26, '#8f897d');
      this.collider(x - 0.13, Y0, z - 0.13, x + 0.13, Y0 + 8.5, z + 0.13);
      this.box(x, Y0 + 7.6, z, 1.3, 0.1, 0.1, '#6d675d', false);
      tops.push([x, Y0 + 7.65, z]);
    }
    this.poleTops.push({ i, j, tops });
    for (let k = 0; k < 4; k++) {
      const a = tops[k], b = tops[(k + 1) % 4];
      this.wires.push([a, b, 0.9]);
      this.wires.push([[a[0], a[1] + 0.25, a[2]], [b[0], b[1] + 0.25, b[2]], 0.7]);
    }
    // 가로수 (은행나무)
    if (type !== 'P') {
      for (const side of ['n', 's']) {
        if (this.rand() < 0.4) continue;
        const z = side === 'n' ? bz0 + 0.9 : bz0 + BLOCK - 0.9;
        for (let x = bx0 + 5; x < bx0 + BLOCK - 4; x += 9) this.tree(x + this.range(-0.5, 0.5), z, this.range(0.75, 0.9));
      }
    }
    // 인도 지점
    for (let k = 0; k < 3; k++) {
      const t = this.range(3, BLOCK - 3);
      const side = Math.floor(this.rand() * 4);
      const p = [
        { x: bx0 + t, z: bz0 + 1.3 },
        { x: bx0 + BLOCK - 1.3, z: bz0 + t },
        { x: bx0 + t, z: bz0 + BLOCK - 1.3 },
        { x: bx0 + 1.3, z: bz0 + t },
      ][side];
      this.points.sidewalk.push({ x: p.x, y: Y0, z: p.z });
    }
  }

  roadMarks() {
    const step = BLOCK + ROAD;
    const roadC = (k) => -HALF + ROAD / 2 + k * step;
    const nearCross = (v) => {
      for (let k = 0; k <= N; k++) if (Math.abs(v - roadC(k)) < ROAD / 2 + 3.2) return true;
      return false;
    };
    const lineCol = '#e9e3cf';
    for (let k = 0; k <= N; k++) {
      const c = roadC(k);
      for (let v = -HALF + 1; v < HALF - 1; v += 4) {
        if (nearCross(v + 1)) continue;
        this.box(v + 1, 0, c, 2, 0.02, 0.16, lineCol, false);
        this.box(c, 0, v + 1, 0.16, 0.02, 2, lineCol, false);
      }
    }
    // 횡단보도
    for (let a = 1; a < N; a++) {
      for (let b = 1; b < N; b++) {
        const X = roadC(a), Z = roadC(b);
        for (let s = 0; s < 6; s++) {
          const off = -ROAD / 2 + 1 + s * 1.6;
          this.box(X + ROAD / 2 + 1.6, 0, Z + off, 2.2, 0.02, 0.6, '#efefe8', false);
          this.box(X - ROAD / 2 - 1.6, 0, Z + off, 2.2, 0.02, 0.6, '#efefe8', false);
          this.box(X + off, 0, Z + ROAD / 2 + 1.6, 0.6, 0.02, 2.2, '#efefe8', false);
          this.box(X + off, 0, Z - ROAD / 2 - 1.6, 0.6, 0.02, 2.2, '#efefe8', false);
        }
      }
    }
    // 맵 가장자리 울타리
    const e = HALF - 0.3;
    this.box(0, 0, -e, HALF * 2, 0.9, 0.3, '#5f8f4f');
    this.box(0, 0, e, HALF * 2, 0.9, 0.3, '#5f8f4f');
    this.box(-e, 0, 0, 0.3, 0.9, HALF * 2, '#5f8f4f');
    this.box(e, 0, 0, 0.3, 0.9, HALF * 2, '#5f8f4f');
  }

  backdrop() {
    const cols = ['#c9ced8', '#b8bfcc', '#d6d2cc', '#aeb6c4', '#e0dcd4'];
    for (let side = 0; side < 4; side++) {
      for (let t = -HALF - 20; t < HALF + 20; t += this.range(9, 14)) {
        const depth = HALF + this.range(8, 30);
        const h = this.range(14, 42);
        const w = this.range(7, 11);
        const x = side === 0 ? t : side === 1 ? t : side === 2 ? depth : -depth;
        const z = side === 0 ? depth : side === 1 ? -depth : t;
        this.box(x, 0, z, w, h, w, this.pick(cols), false, 'far');
      }
    }
  }

  // ───────── 메쉬 만들기 ─────────
  finalize() {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const geos = {
      box: boxGeo,
      far: boxGeo,
      window: boxGeo,
      ac: this.acGeometry(),
      trunk: new THREE.CylinderGeometry(0.5, 0.62, 1, 6).translate(0, 0.5, 0),
      leaf: new THREE.IcosahedronGeometry(1, 0),
      pole: new THREE.CylinderGeometry(0.42, 0.5, 1, 6).translate(0, 0.5, 0),
      tank: new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0),
    };
    const mats = {
      box: new THREE.MeshLambertMaterial(),
      far: new THREE.MeshLambertMaterial(),
      window: new THREE.MeshBasicMaterial(),
      ac: new THREE.MeshLambertMaterial({ map: this.acTexture() }),
      trunk: new THREE.MeshLambertMaterial(),
      leaf: new THREE.MeshLambertMaterial({ flatShading: true }),
      pole: new THREE.MeshLambertMaterial(),
      tank: new THREE.MeshLambertMaterial(),
    };
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    for (const cat of Object.keys(this.inst)) {
      const list = this.inst[cat];
      const mesh = new THREE.InstancedMesh(geos[cat], mats[cat], list.length);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        dummy.position.set(it.x, it.y, it.z);
        if (it.rot) dummy.rotation.set(it.rot[0], it.rot[1], it.rot[2]);
        else dummy.rotation.set(0, 0, 0);
        dummy.scale.set(it.sx, it.sy, it.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, col.set(it.color));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.meshes[cat] = mesh;
    }
    this.setNight(false);

    // 전깃줄
    const pts = [];
    for (const [a, b, sag] of this.wires) {
      const seg = 8;
      for (let k = 0; k < seg; k++) {
        for (const t of [k / seg, (k + 1) / seg]) {
          pts.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t);
        }
      }
    }
    // 블록 사이 도로를 건너는 전깃줄
    const byIJ = new Map(this.poleTops.map((p) => [p.i + ',' + p.j, p.tops]));
    for (const p of this.poleTops) {
      const r = byIJ.get(p.i + 1 + ',' + p.j);
      const dn = byIJ.get(p.i + ',' + (p.j + 1));
      const pairs = [];
      if (r) pairs.push([p.tops[1], r[0]], [p.tops[2], r[3]]);
      if (dn) pairs.push([p.tops[3], dn[0]]);
      for (const [a, b] of pairs) {
        const seg = 8;
        for (let k = 0; k < seg; k++) {
          for (const t of [k / seg, (k + 1) / seg]) {
            pts.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 1.1 * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t);
          }
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#2d2d2d' })));

    // 간판
    this.signMeshes = [];
    for (const s of this.signs) {
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = Math.round((512 * s.h) / s.w);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: tex }));
      mesh.position.set(s.x, s.y, s.z);
      mesh.rotation.y = s.ry;
      this.scene.add(mesh);
      const draw = () => {
        const g = cv.getContext('2d');
        g.fillStyle = s.bg;
        g.fillRect(0, 0, cv.width, cv.height);
        g.fillStyle = s.fg;
        g.font = `${Math.round(cv.height * 0.68)}px Jua, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(s.text, cv.width / 2, cv.height / 2 + 2);
        tex.needsUpdate = true;
      };
      draw();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
      this.signMeshes.push(mesh);
    }

    // 깃발 천
    if (this.flag) {
      const fg = new THREE.PlaneGeometry(1.4, 0.9, 6, 1).translate(0.7, 0, 0);
      this.flagMesh = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: '#ff5a5f', side: THREE.DoubleSide }));
      this.flagMesh.position.set(this.flag.x + 0.04, this.flag.y + 2.7, this.flag.z);
      this.flagBase = fg.attributes.position.array.slice();
      this.scene.add(this.flagMesh);
    }
  }

  update(t) {
    if (this.flagMesh) {
      const p = this.flagMesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = this.flagBase[i * 3];
        p.array[i * 3 + 2] = Math.sin(t * 5 + x * 3) * 0.12 * x;
      }
      p.needsUpdate = true;
    }
  }

  setNight(night) {
    if (this.night === night) return;
    this.night = night;
    const mesh = this.meshes.window;
    if (!mesh) return;
    const c = new THREE.Color();
    for (const w of this.windows) {
      if (w.store) c.set(night ? '#fff1b8' : '#bfe6f2');
      else if (night && w.lit) c.set(w.tint < 0.5 ? '#ffd98a' : '#ffe9b0');
      else if (night) c.set('#2b3550');
      else c.set(w.tint < 0.33 ? '#6d8aa6' : w.tint < 0.66 ? '#5f7f9c' : '#7d97ad');
      mesh.setColorAt(w.i, c);
    }
    mesh.instanceColor.needsUpdate = true;
  }

  acGeometry() {
    const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setX(i, uv.getX(i) * 0.5 + (f === 4 ? 0.5 : 0));
      }
    }
    return g;
  }

  acTexture() {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#dfe1df';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#cfd2cf';
    for (let y = 6; y < 64; y += 8) g.fillRect(2, y, 60, 2);
    g.fillStyle = '#e6e8e5';
    g.fillRect(64, 0, 64, 64);
    g.fillStyle = '#3d4246';
    g.beginPath();
    g.arc(90, 32, 22, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#9aa0a4';
    g.lineWidth = 2;
    for (let r = 6; r < 22; r += 5) {
      g.beginPath();
      g.arc(90, 32, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#b5babc';
    g.fillRect(117, 10, 6, 44);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
