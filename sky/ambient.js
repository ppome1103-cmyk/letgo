// 바람, 파도, 폭포, 새소리, 잔잔한 음악 (모두 코드로 합성)
export class Ambient {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    try {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    } catch (_) {
      this.ctx = null;
    }
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(c.destination);
    // 잔향
    this.reverb = c.createConvolver();
    const len = c.sampleRate * 3;
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb.buffer = ir;
    this.wet = c.createGain();
    this.wet.gain.value = 0.55;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0.22;
    this.music.connect(this.master);
    this.music.connect(this.reverb);
    // 노이즈
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < nd.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04; // 브라운 노이즈 느낌
      nd[i] = last * 3.2 * 0.6 + w * 0.4;
    }
    const loop = (type, freq, q) => {
      const s = c.createBufferSource();
      s.buffer = nb;
      s.loop = true;
      s.playbackRate.value = 0.7 + Math.random() * 0.3;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      s.connect(f);
      f.connect(g);
      g.connect(this.master);
      s.start();
      return { f, g };
    };
    this.wind = loop('bandpass', 500, 0.6);
    this.waves = loop('lowpass', 420, 0.5);
    this.fall = loop('bandpass', 1100, 0.4);
    this.t = 0;
    this.nextChord = 0;
    this.nextNote = 0;
    this.chordI = 0;
    this.nextBird = 2;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  note(freq, when, dur, vol, type = 'sine', dest = this.music) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + Math.min(dur * 0.3, type === 'sine' ? 1.8 : 0.015));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(dest);
    o.start(when);
    o.stop(when + dur + 0.1);
  }

  chirp(when, vol) {
    const c = this.ctx;
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator();
      const g = c.createGain();
      const t = when + i * (0.09 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.reverb);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  flap() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.35);
  }

  // s: { speed, sea, fall, forest, night, alt }
  update(dt, s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, now = c.currentTime;
    const k = Math.min(1, dt * 3);
    const set = (node, v) => (node.g.gain.value += (v - node.g.gain.value) * k);
    set(this.wind, 0.05 + Math.min(1, (s.speed - 9) / 35) * 0.5 + Math.min(0.15, s.alt / 4000));
    this.wind.f.frequency.value = 300 + s.speed * 22;
    set(this.waves, s.sea * (0.35 + Math.sin(now * 0.7) * 0.12));
    set(this.fall, s.fall * 0.5);
    // 음악
    const chords = s.night > 0.5
      ? [[220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 392], [164.8, 207.7, 246.9, 329.6]]
      : [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [174.6, 220, 261.6, 349.2], [196, 246.9, 293.7, 440]];
    if (now > this.nextChord) {
      const ch = chords[this.chordI++ % chords.length];
      for (const f of ch) {
        this.note(f / 2, now + 0.05, 9.5, 0.05);
        this.note(f / 2 * 1.003, now + 0.1, 9.5, 0.03);
      }
      this.nextChord = now + 8;
    }
    if (now > this.nextNote) {
      const scale = [523.3, 587.3, 659.3, 784, 880, 1046.5, 1174.7, 1318.5];
      if (Math.random() < (s.night > 0.5 ? 0.35 : 0.45)) {
        const f = scale[Math.floor(Math.random() * scale.length)] * (s.night > 0.5 ? 0.5 : 1);
        this.note(f, now + 0.02, 2.2, 0.06, 'triangle');
      }
      this.nextNote = now + (s.night > 0.5 ? 1.1 : 0.8);
    }
    // 새소리
    this.nextBird -= dt;
    if (this.nextBird < 0) {
      this.nextBird = 1.5 + Math.random() * 4;
      if (s.forest > 0.2 && s.night < 0.4) this.chirp(now + 0.05, 0.05 * s.forest);
    }
  }
}
