import * as THREE from '../vendor/three.module.min.js';

// 시드 고정 난수 (매번 같은 동네가 만들어지도록)
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// 여러 도형을 색을 입혀 하나의 지오메트리로 합친다 (드로우콜 절약)
// parts: [{ geo, color, pos:[x,y,z], rot:[x,y,z], scale:[x,y,z] }]
export function mergeColored(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    e.set(...(part.rot || [0, 0, 0]));
    q.setFromEuler(e);
    p.set(...(part.pos || [0, 0, 0]));
    s.set(...(part.scale || [1, 1, 1]));
    m.compose(p, q, s);
    g.applyMatrix4(m);
    const pa = g.attributes.position.array;
    const na = g.attributes.normal.array;
    c.set(part.color);
    for (let i = 0; i < pa.length; i++) {
      positions.push(pa[i]);
      normals.push(na[i]);
    }
    for (let i = 0; i < pa.length / 3; i++) colors.push(c.r, c.g, c.b);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  out.computeBoundingSphere();
  return out;
}

// 동그란 그림자 / 빛 텍스처
export function radialTexture(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)', size = 64) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
