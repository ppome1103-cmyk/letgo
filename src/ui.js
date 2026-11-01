import * as THREE from '../vendor/three.module.min.js';
import { HALF } from './world.js';

const v = new THREE.Vector3();

export class UI {
  constructor() {
    this.toastEl = document.getElementById('toast');
    this.layer = document.getElementById('fx');
    this.bubbles = [];
    this.floats = [];
    this.toastQ = [];
    this.toastT = 0;
    this.mm = document.getElementById('minimap');
    this.mmCtx = this.mm.getContext('2d');
  }

  toast(msg, ms = 2400) {
    this.toastQ.push({ msg, ms });
    if (this.toastQ.length > 4) this.toastQ.shift();
  }

  // 3D 위치에 말풍선
  bubble(pos, text, ms = 2200, cls = '') {
    const el = document.createElement('div');
    el.className = 'bubble ' + cls;
    el.textContent = text;
    this.layer.appendChild(el);
    this.bubbles.push({ el, pos: pos.clone ? pos : new THREE.Vector3(pos.x, pos.y, pos.z), follow: pos.isVector3 ? pos : null, t: ms / 1000, max: ms / 1000 });
  }

  // 위로 떠오르는 이모지
  float(pos, emoji, n = 1) {
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'float';
      el.textContent = emoji;
      this.layer.appendChild(el);
      this.floats.push({ el, pos: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.5, pos.y, pos.z + (Math.random() - 0.5) * 0.5), t: 0, dur: 1.2 + Math.random() * 0.5, dx: (Math.random() - 0.5) * 40, delay: i * 0.12 });
    }
  }

  project(pos, camera, w, h) {
    v.copy(pos).project(camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h];
  }

  update(dt, camera) {
    const w = window.innerWidth, h = window.innerHeight;
    // 토스트
    if (this.toastT > 0) {
      this.toastT -= dt * 1000;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    } else if (this.toastQ.length && !this.toastEl.classList.contains('show')) {
      const { msg, ms } = this.toastQ.shift();
      this.toastEl.textContent = msg;
      this.toastEl.classList.add('show');
      this.toastT = ms;
    }
    // 말풍선
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t -= dt;
      if (b.t <= 0) {
        b.el.remove();
        this.bubbles.splice(i, 1);
        continue;
      }
      const p = this.project(b.follow || b.pos, camera, w, h);
      if (!p) {
        b.el.style.opacity = 0;
        continue;
      }
      const fade = Math.min(1, b.t * 3, (b.max - b.t) * 6);
      b.el.style.opacity = fade;
      b.el.style.transform = `translate(${p[0]}px, ${p[1]}px) translate(-50%, -100%) scale(${0.85 + 0.15 * Math.min(1, (b.max - b.t) * 8)})`;
    }
    // 떠오르는 이모지
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      if (f.delay > 0) {
        f.delay -= dt;
        f.el.style.opacity = 0;
        continue;
      }
      f.t += dt;
      if (f.t > f.dur) {
        f.el.remove();
        this.floats.splice(i, 1);
        continue;
      }
      const p = this.project(f.pos, camera, w, h);
      if (!p) {
        f.el.style.opacity = 0;
        continue;
      }
      const k = f.t / f.dur;
      f.el.style.opacity = 1 - k * k;
      f.el.style.transform = `translate(${p[0] + f.dx * k}px, ${p[1] - k * 90}px) translate(-50%, -50%) scale(${0.6 + Math.min(1, k * 5) * 0.6})`;
    }
  }

  // ───────── 미니맵 ─────────
  buildMinimap(world) {
    const S = this.mm.width;
    const bg = document.createElement('canvas');
    bg.width = bg.height = S;
    const g = bg.getContext('2d');
    const k = S / (HALF * 2);
    const X = (x) => (x + HALF) * k;
    g.fillStyle = '#6b6e75';
    g.fillRect(0, 0, S, S);
    for (const b of world.blocks) {
      g.fillStyle = '#cdbba6';
      g.fillRect(X(b.x0), X(b.z0), 32 * k, 32 * k);
    }
    for (const r of world.rects) {
      if (r.type === 'park') g.fillStyle = '#8cc063';
      else if (r.type === 'lot') g.fillStyle = '#bdb2a3';
      else if (r.type === 'store') g.fillStyle = '#2f9e6e';
      else if (r.type === 'bld') g.fillStyle = r.h > 15 ? '#e8d6a8' : '#9a8f84';
      else continue;
      g.fillRect(X(r.x0), X(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
    }
    this.mmBg = bg;
    this.mmK = k;
    this.world = world;
  }

  drawMinimap(catPos, facing, camYaw, marks) {
    const g = this.mmCtx, S = this.mm.width, k = this.mmK;
    g.clearRect(0, 0, S, S);
    g.drawImage(this.mmBg, 0, 0);
    for (const m of marks) {
      const x = (m.x + HALF) * k, y = (m.z + HALF) * k;
      g.font = `${Math.round(S * 0.11)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(m.icon, x, y);
    }
    const x = (catPos.x + HALF) * k, y = (catPos.z + HALF) * k;
    // 시야 방향
    const th = Math.atan2(-Math.cos(camYaw), -Math.sin(camYaw));
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, S * 0.16, th - 0.5, th + 0.5);
    g.closePath();
    g.fill();
    g.save();
    g.translate(x, y);
    g.rotate(-facing + Math.PI);
    g.fillStyle = '#ff7a45';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -S * 0.055);
    g.lineTo(S * 0.04, S * 0.04);
    g.lineTo(-S * 0.04, S * 0.04);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
