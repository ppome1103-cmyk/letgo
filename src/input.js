// 터치(가상 조이스틱 + 시점 드래그) / 마우스 / 키보드 입력
export class Input {
  constructor(el) {
    this.el = el;
    this.mx = 0;
    this.my = 0;
    this.jumpHeld = false;
    this._jump = false;
    this._meow = false;
    this.camDX = 0;
    this.camDY = 0;
    this.zoom = 0;
    this.lastDragTime = -10;
    this.lastInputTime = 0;
    this.keys = new Set();
    this.joyId = null;
    this.camId = null;
    this.joyR = 55;
    this.enabled = false;

    this.joyBase = document.getElementById('joy');
    this.joyKnob = document.getElementById('joyKnob');
    this.joyHint = document.getElementById('joyHint');

    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('wheel', (e) => {
      this.zoom += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    this.bindButton(document.getElementById('btnJump'), () => {
      this._jump = true;
      this.jumpHeld = true;
    }, () => {
      this.jumpHeld = false;
    });
    this.bindButton(document.getElementById('btnMeow'), () => {
      this._meow = true;
    });

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'spacebar') {
        if (!this.jumpHeld) this._jump = true;
        this.jumpHeld = true;
        e.preventDefault();
      } else if (k === 'e' || k === 'q' || k === 'm') {
        if (!e.repeat) this._meow = true;
      } else this.keys.add(k);
      this.lastInputTime = performance.now();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'spacebar') this.jumpHeld = false;
      this.keys.delete(k);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.jumpHeld = false;
      this.resetJoy();
    });
  }

  bindButton(btn, onDown, onUp) {
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (_) { /* 무시 */ }
      btn.classList.add('down');
      this.lastInputTime = performance.now();
      onDown();
    });
    const end = () => {
      btn.classList.remove('down');
      if (onUp) onUp();
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', end);
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    this.lastInputTime = performance.now();
    if (e.pointerType !== 'mouse' && e.clientX < window.innerWidth * 0.45 && this.joyId === null) {
      this.joyId = e.pointerId;
      this.jx = e.clientX;
      this.jy = e.clientY;
      this.joyBase.style.left = e.clientX + 'px';
      this.joyBase.style.top = e.clientY + 'px';
      this.joyBase.classList.add('on');
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
      if (this.joyHint) this.joyHint.classList.add('hide');
      return;
    }
    if (this.camId === null) {
      this.camId = e.pointerId;
      this.cx = e.clientX;
      this.cy = e.clientY;
    }
  }

  move(e) {
    if (e.pointerId === this.joyId) {
      let dx = e.clientX - this.jx, dy = e.clientY - this.jy;
      const d = Math.hypot(dx, dy);
      if (d > this.joyR) {
        dx = (dx / d) * this.joyR;
        dy = (dy / d) * this.joyR;
      }
      this.mx = dx / this.joyR;
      this.my = -dy / this.joyR;
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.lastInputTime = performance.now();
      e.preventDefault();
    } else if (e.pointerId === this.camId) {
      const s = e.pointerType === 'mouse' ? 1 : 1.25;
      this.camDX += (e.clientX - this.cx) * s;
      this.camDY += (e.clientY - this.cy) * s;
      this.cx = e.clientX;
      this.cy = e.clientY;
      this.lastDragTime = performance.now();
      e.preventDefault();
    }
  }

  up(e) {
    if (e.pointerId === this.joyId) this.resetJoy();
    if (e.pointerId === this.camId) this.camId = null;
  }

  resetJoy() {
    this.joyId = null;
    this.mx = 0;
    this.my = 0;
    this.joyBase.classList.remove('on');
  }

  // 한 프레임 입력 읽기
  read() {
    let mx = this.mx, my = this.my;
    if (this.joyId === null && this.keys.size) {
      const K = this.keys;
      mx = (K.has('d') || K.has('arrowright') ? 1 : 0) - (K.has('a') || K.has('arrowleft') ? 1 : 0);
      my = (K.has('w') || K.has('arrowup') ? 1 : 0) - (K.has('s') || K.has('arrowdown') ? 1 : 0);
      if (K.has('shift')) {
        mx *= 0.45;
        my *= 0.45;
      }
    }
    const out = { mx, my, jumpPressed: this._jump, jumpHeld: this.jumpHeld, meowPressed: this._meow };
    this._jump = false;
    this._meow = false;
    return out;
  }
}
