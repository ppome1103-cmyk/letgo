// 효과음은 모두 코드로 합성 (외부 파일 없음)
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = true;
    this.purrNode = null;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.7;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.16;
        this.musicGain.connect(this.master);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.startMusic();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (_) {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
  }

  ok() {
    return this.ctx && !this.muted;
  }

  tone(type, f0, f1, dur, vol = 0.3, when = 0) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, freq, vol = 0.25, q = 1, when = 0) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  meow(pitch = 1) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime;
    const p = pitch * (0.92 + Math.random() * 0.16);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(480 * p, t);
    o.frequency.linearRampToValueAtTime(820 * p, t + 0.13);
    o.frequency.linearRampToValueAtTime(560 * p, t + 0.48);
    const lfo = c.createOscillator();
    lfo.frequency.value = 7;
    const lg = c.createGain();
    lg.gain.value = 14 * p;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3.5;
    f.frequency.setValueAtTime(650, t);
    f.frequency.linearRampToValueAtTime(2100, t + 0.15);
    f.frequency.linearRampToValueAtTime(750, t + 0.5);
    const f2 = c.createBiquadFilter();
    f2.type = 'lowpass';
    f2.frequency.value = 3200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.05);
    g.gain.setValueAtTime(0.5, t + 0.32);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.56);
    o.connect(f);
    f.connect(f2);
    f2.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.6);
    lfo.start(t);
    lfo.stop(t + 0.6);
  }

  jump() {
    this.tone('sine', 380, 760, 0.14, 0.18);
  }
  land(big) {
    this.noiseBurst(big ? 0.18 : 0.08, big ? 300 : 500, big ? 0.35 : 0.15, 0.8);
  }
  pickup() {
    this.tone('triangle', 988, 988, 0.09, 0.22);
    this.tone('triangle', 1319, 1319, 0.16, 0.22, 0.07);
  }
  flap() {
    for (let i = 0; i < 4; i++) this.noiseBurst(0.06, 900 + Math.random() * 400, 0.12, 1.5, i * 0.07);
  }
  pop() {
    this.tone('sine', 300, 900, 0.12, 0.25);
  }
  sparkle() {
    [1568, 2093, 2637].forEach((f, i) => this.tone('sine', f, f, 0.12, 0.12, i * 0.05));
  }
  success() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.2, i * 0.09));
  }
  fanfare() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.2, i * 0.11));
  }

  purr(on) {
    if (!this.ctx) return;
    if (on && !this.purrNode && !this.muted) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 180;
      const am = c.createGain();
      am.gain.value = 0;
      const lfo = c.createOscillator();
      lfo.frequency.value = 24;
      const lg = c.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg);
      lg.connect(am.gain);
      const g = c.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.9, c.currentTime + 0.8);
      src.connect(f);
      f.connect(am);
      am.connect(g);
      g.connect(this.master);
      src.start();
      lfo.start();
      this.purrNode = { src, lfo, g };
    } else if (!on && this.purrNode) {
      const { src, lfo, g } = this.purrNode;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      src.stop(t + 0.45);
      lfo.stop(t + 0.45);
      this.purrNode = null;
    }
  }

  // 잔잔한 오르골 배경음
  startMusic() {
    const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319];
    const bass = [131, 165, 147, 196];
    let beat = 0;
    const c = this.ctx;
    const play = (f, when, dur, vol, type = 'sine') => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(when);
      o.stop(when + dur + 0.05);
    };
    let next = c.currentTime + 0.3;
    let last = 3;
    setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      while (next < c.currentTime + 0.6) {
        if (this.musicOn && !this.muted) {
          if (beat % 8 === 0) play(bass[(beat / 8) % 4], next, 1.6, 0.5, 'triangle');
          if (Math.random() < 0.62) {
            last = Math.max(0, Math.min(scale.length - 1, last + Math.floor(Math.random() * 5) - 2));
            play(scale[last], next, 0.9, 0.35);
            if (Math.random() < 0.2) play(scale[last] * 2, next + 0.01, 0.6, 0.08);
          }
        }
        beat++;
        next += 0.36;
      }
    }, 120);
  }
}
