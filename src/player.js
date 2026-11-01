import * as THREE from '../vendor/three.module.min.js';
import { HALF } from './world.js';
import { lerpAngle, damp } from './util.js';

const GRAVITY = 28;
const JUMP_V = 11.6; // 약 2.4m 점프
const RUN = 7.2;
const STEP = 0.32;
const EPS = 1e-4;

export class CatController {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.hx = 0.27;
    this.h = 0.55;
    this.peakY = 0;
    this.events = [];
    this._list = [];
  }

  spawn(x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.peakY = y;
  }

  overlaps(c, px, py, pz) {
    const hx = this.hx;
    return c.x0 < px + hx && c.x1 > px - hx && c.z0 < pz + hx && c.z1 > pz - hx && c.y0 < py + this.h && c.y1 > py;
  }

  anyOverlap(px, py, pz, list) {
    for (const c of list) if (this.overlaps(c, px, py, pz)) return true;
    return false;
  }

  update(dt, inp, camYaw) {
    const ev = this.events;
    // 입력 → 방향
    let ix = inp.mx, iy = inp.my;
    let mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
      mag = 1;
    }
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = fx * iy + rx * ix;
    let dz = fz * iy + rz * ix;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) {
      dx /= dl;
      dz /= dl;
    }
    const speed = mag < 0.15 ? 0 : (0.25 + 0.75 * mag) * RUN;
    const tvx = dx * speed, tvz = dz * speed;
    const accel = this.grounded ? 34 : 14;
    const ddx = tvx - this.vel.x, ddz = tvz - this.vel.z;
    const dd = Math.hypot(ddx, ddz);
    const maxD = accel * dt;
    if (dd <= maxD) {
      this.vel.x = tvx;
      this.vel.z = tvz;
    } else {
      this.vel.x += (ddx / dd) * maxD;
      this.vel.z += (ddz / dd) * maxD;
    }
    if (speed > 0.1) this.facing = lerpAngle(this.facing, Math.atan2(dx, dz), damp(14, dt));

    // 점프 (코요테 타임 + 입력 버퍼)
    if (inp.jumpPressed) this.jumpBuf = 0.15;
    else this.jumpBuf -= dt;
    if (this.grounded) this.coyote = 0.12;
    else this.coyote -= dt;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vel.y = JUMP_V;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      ev.push({ type: 'jump' });
    }
    // 중력 (버튼을 짧게 누르면 낮게 점프)
    let g = GRAVITY;
    if (this.vel.y > 0 && !inp.jumpHeld) g *= 1.7;
    this.vel.y = Math.max(-32, this.vel.y - g * dt);

    // 이동 + 충돌
    const wasGrounded = this.grounded;
    const vyBefore = this.vel.y;
    this.grounded = false;
    const maxDisp = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z)) * dt;
    const steps = Math.max(1, Math.ceil(maxDisp / 0.2));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.moveAxis(0, this.vel.x * sdt, wasGrounded);
      this.moveAxis(2, this.vel.z * sdt, wasGrounded);
      this.moveAxis(1, this.vel.y * sdt, wasGrounded);
    }

    // 맵 경계
    const B = HALF - 0.8;
    if (this.pos.x < -B) { this.pos.x = -B; this.vel.x = 0; }
    if (this.pos.x > B) { this.pos.x = B; this.vel.x = 0; }
    if (this.pos.z < -B) { this.pos.z = -B; this.vel.z = 0; }
    if (this.pos.z > B) { this.pos.z = B; this.vel.z = 0; }
    if (this.pos.y < -5) {
      this.pos.y = 3;
      this.vel.set(0, 0, 0);
    }

    if (!this.grounded) {
      this.peakY = Math.max(this.peakY, this.pos.y);
    } else if (!wasGrounded) {
      const fall = this.peakY - this.pos.y;
      ev.push({ type: 'land', impact: -vyBefore, fall });
      this.peakY = this.pos.y;
    } else {
      this.peakY = this.pos.y;
    }
  }

  moveAxis(axis, d, wasGrounded) {
    if (d === 0) return;
    const p = this.pos;
    if (axis === 0) p.x += d;
    else if (axis === 1) p.y += d;
    else p.z += d;
    const r = this.hx + 0.05;
    const list = this.world.query(p.x - r, p.z - r, p.x + r, p.z + r, this._list);
    for (const c of list) {
      if (!this.overlaps(c, p.x, p.y, p.z)) continue;
      if (axis === 1) {
        if (d < 0) {
          p.y = c.y1;
          this.vel.y = 0;
          this.grounded = true;
        } else {
          p.y = c.y0 - this.h - EPS;
          this.vel.y = 0;
        }
        continue;
      }
      // 낮은 턱은 자동으로 올라가기
      const rise = c.y1 - p.y;
      if (rise > 0 && rise <= STEP && wasGrounded && !this.anyOverlap(p.x, c.y1 + EPS, p.z, list)) {
        p.y = c.y1;
        continue;
      }
      if (axis === 0) {
        p.x = d > 0 ? c.x0 - this.hx - EPS : c.x1 + this.hx + EPS;
        this.vel.x = 0;
      } else {
        p.z = d > 0 ? c.z0 - this.hx - EPS : c.z1 + this.hx + EPS;
        this.vel.z = 0;
      }
    }
  }
}
