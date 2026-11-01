import { createApp, $ } from './common.js';
import { Input } from '../src/input.js';
import { Sfx } from '../src/audio.js';

const MODES = {
  parkour: () => import('./parkour.js'),
  chaos: () => import('./chaos.js'),
  glide: () => import('./glide.js'),
};

const sfx = new Sfx();
let hintTimer = 0;

const ctx = {
  sfx,
  setAction(icon, label) {
    $('btnMeow').innerHTML = `${icon}<span>${label}</span>`;
  },
  setHud(main, sub) {
    $('hudMain').textContent = main;
    $('hudSub').textContent = sub || '';
  },
  hint(text) {
    const el = $('hint');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove('show'), 4200);
  },
  showResult(title, rows) {
    $('resultTitle').textContent = title;
    $('resultRows').innerHTML = rows.map(([i, t]) => `<div><span>${i}</span>${t}</div>`).join('');
    $('result').classList.add('show');
  },
};

async function start(mode) {
  sfx.unlock();
  document.body.classList.add('playing');
  $('menu').classList.add('hide');
  $('loading').classList.add('show');
  const mod = await MODES[mode]();
  const app = createApp(mode === 'glide' ? { fogNear: 140, fogFar: 820, far: 1600 } : {});
  const input = new Input($('touch'));
  input.enabled = true;
  Object.assign(ctx, { app, input });
  const game = mod.create(ctx);
  $('loading').classList.remove('show');
  if (window.matchMedia('(pointer: coarse)').matches) $('joyHint').classList.remove('hide');
  $('btnRetry').onclick = () => {
    $('result').classList.remove('show');
    game.retry();
  };
  let last = performance.now();
  const frame = (now) => {
    const raw = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    const dt = app.step(raw);
    game.update(dt, raw);
    app.render();
    app.perf(raw);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__lab = { app, game, ctx };
}

const goMenu = () => {
  location.hash = '';
  location.reload();
};
$('btnBack').addEventListener('click', goMenu);
$('btnMenu').addEventListener('click', goMenu);
$('btnSound').addEventListener('click', () => {
  sfx.unlock();
  sfx.setMuted(!sfx.muted);
  $('btnSound').textContent = sfx.muted ? '🔇' : '🔊';
});
document.querySelectorAll('[data-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    location.hash = b.dataset.mode;
    start(b.dataset.mode);
  }),
);
document.body.classList.toggle('touch', window.matchMedia('(pointer: coarse)').matches);
window.addEventListener('pointerdown', () => $('joyHint').classList.add('hide'), { once: false, capture: true });
document.addEventListener('gesturestart', (e) => e.preventDefault());
sfx.musicOn = false;

const initial = location.hash.replace('#', '');
if (MODES[initial]) {
  // 새로고침 시 바로 그 모드로 (소리는 첫 터치 후)
  start(initial);
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
}
window.__startLab = start;
