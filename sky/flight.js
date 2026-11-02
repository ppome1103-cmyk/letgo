import * as THREE from '../vendor/three.module.min.js';
import { damp, clamp } from '../src/util.js';
import { HALF, LAKE, hash } from './terrain.js';

// 실패 없는 부드러운 활공 조종 (나중에 걷기/탈것도 같은 형태로 추가)
export class Flyer {
  constructor(terrain) {
    this.T = terrain;
    this.pos = new THREE.Vector3();
    this.heading = Math.PI; // 앞 = (sin, cos)
    this.pitch = 0;
    this.roll = 0;
    this.speed = 16;
    this.vy = 0;
    this.flapCd = 0;
    this.flapT = 0;
    this.lift = 0;
    this.fwd = new THREE.Vector3();
    this.skim = 0;
    // 상승기류 위치 (초원과 언덕 위)
    this.thermals = [];
    for (let i = 0; i < 70 && this.thermals.length < 34; i++) {
      const x = (hash(i, 41) - 0.5) * 3000, z = (hash(i, 42) - 0.5) * 3000;
      const g = terrain.ground(x, z);
      if (g > 8 && Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r * 1.3) this.thermals.push({ x, z, r: 45 + hash(i, 43) * 35 });
    }
  }

  spawn(x, y, z, heading) {
    this.pos.set(x, y, z);
    this.heading = heading;
    this.speed = 16;
    this.vy = 0;
  }

  // inp: { mx, my, jumpPressed }  my > 0 = 올라가기
  update(dt, inp) {
    const T = this.T, p = this.pos;
    const sx = clamp(inp.mx, -1, 1), sy = clamp(inp.my, -1, 1);
    this.roll += (sx * 0.7 - this.roll) * damp(3, dt);
    this.heading -= this.roll * (0.75 + Math.min(1, this.speed / 35) * 0.35) * dt;

    let pt = sy * 0.5 - 0.04;
    if (this.speed < 10.5) pt = Math.min(pt, 0.02);
    // 앞쪽 지형을 미리 보고 부드럽게 피하기
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const g0 = Math.max(T.ground(p.x, p.z), 0);
    const g1 = Math.max(T.ground(p.x + fx * 30, p.z + fz * 30), 0);
    const g2 = Math.max(T.ground(p.x + fx * 70, p.z + fz * 70), 0);
    const clear = Math.min(p.y - g1, p.y - g2 + 8);
    if (clear < 22) pt = Math.max(pt, ((22 - clear) / 22) * 0.6);
    const alt = p.y - g0;
    if (alt < 7) pt = Math.max(pt, ((7 - alt) / 7) * 0.3);
    if (p.y > 900) pt = Math.min(pt, -0.1);
    this.pitch += (clamp(pt, -0.75, 0.65) - this.pitch) * damp(2.2, dt);

    // 속도 (위치 에너지 ↔ 속도)
    const acc = 0.9 - 11 * Math.sin(this.pitch) - 0.0035 * this.speed * this.speed;
    this.speed = clamp(this.speed + acc * dt, 9, 48);

    // 상승기류
    let up = -0.5;
    for (const th of this.thermals) {
      const dx = p.x - th.x, dz = p.z - th.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < th.r * th.r && p.y < 620) up = Math.max(up, 7 * (1 - Math.sqrt(d2) / th.r) + 2);
    }
    this.lift = up;
    // 날갯짓
    this.flapCd -= dt;
    this.flapT = Math.max(0, this.flapT - dt);
    if (inp.jumpPressed && this.flapCd <= 0) {
      this.flapCd = 0.45;
      this.flapT = 0.5;
      this.vy += 7;
      this.speed = Math.min(48, this.speed + 1.5);
      this.flapped = true;
    }
    this.vy += (up - this.vy) * damp(this.vy > up ? 1.2 : 1.6, dt);

    this.fwd.set(fx * Math.cos(this.pitch), Math.sin(this.pitch), fz * Math.cos(this.pitch));
    p.addScaledVector(this.fwd, this.speed * dt);
    p.y += this.vy * dt;

    // 절대 땅이나 물에 부딪히지 않게
    const g = Math.max(T.ground(p.x, p.z), 0);
    const minY = g + (g <= 0.5 ? 2.2 : 3.5);
    if (p.y < minY) {
      p.y += (minY - p.y) * Math.min(1, dt * 8);
      if (p.y < minY - 1.5) p.y = minY - 1.5;
      this.vy = Math.max(this.vy, 0);
    }
    this.skim = g <= 0.5 ? clamp(1 - (p.y - 2) / 6, 0, 1) : 0;

    // 바다 끝에서 부드럽게 되돌아오기
    const r = Math.hypot(p.x, p.z);
    this.outside = r > HALF * 1.05;
    if (this.outside) {
      const toC = Math.atan2(-p.x, -p.z);
      let d = toC - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * dt * 0.5;
    }
  }
}
