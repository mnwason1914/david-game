// 입력: 가상 조이스틱 + 버튼 (모바일), 키보드 (데스크톱 테스트)
// 게임 코드는 input.move(x,z), input.pressed('attack') 같은 값만 읽는다.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyJ: 'attack', Space: 'attack',
  KeyU: 'heavy', KeyI: 'heavy',
  KeyL: 'guard',
  KeyR: 'sling', KeyF: 'sling',
  KeyO: 'lock', Tab: 'lock',
  KeyK: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge',
  KeyE: 'interact', Enter: 'interact',
  KeyQ: 'heal', KeyH: 'heal',
  KeyZ: 'camL', KeyC: 'camR',
};

export class Input {
  constructor() {
    this.held = {};
    this.down = {};     // 이번 프레임에 눌림
    this.downAt = {};   // 마지막으로 눌린 시각 (performance.now 기준 초) — 저스트 가드 판정용
    this.lastUpAt = {}; // 마지막으로 뗀 시각
    this.up = {};       // 이번 프레임에 뗌
    this.joy = { x: 0, y: 0, active: false, id: null, ox: 0, oy: 0 };
    this.anyTap = false;
    this.cam = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
    this._bindKeys();
    this._bindTouch();
  }

  _press(name) {
    if (!this.held[name]) { this.down[name] = true; this.downAt[name] = performance.now() / 1000; }
    this.held[name] = true;
  }
  _release(name) {
    if (this.held[name]) { this.up[name] = true; this.lastUpAt[name] = performance.now() / 1000; }
    this.held[name] = false;
  }

  _bindKeys() {
    addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (k) { this._press(k); e.preventDefault(); }
      this.anyTap = true;
    });
    addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) this._release(k);
    });
    addEventListener('blur', () => { for (const k in this.held) this._release(k); });
  }

  _bindTouch() {
    const zone = document.getElementById('joyzone');
    const base = document.getElementById('joybase');
    const knob = document.getElementById('joyknob');
    const R = 52;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    const start = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      if (this.joy.active) return;
      this.joy.active = true;
      this.joy.id = t.identifier ?? 'mouse';
      this.joy.ox = t.clientX;
      this.joy.oy = t.clientY;
      base.style.left = t.clientX + 'px';
      base.style.top = t.clientY + 'px';
      base.classList.add('on');
      e.preventDefault();
    };
    const moveT = (e) => {
      if (!this.joy.active) return;
      const list = e.changedTouches ? [...e.changedTouches] : [e];
      for (const t of list) {
        if ((t.identifier ?? 'mouse') !== this.joy.id) continue;
        let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx *= R / len; dy *= R / len; }
        this.joy.x = dx / R;
        this.joy.y = dy / R;
        setKnob(dx, dy);
      }
      e.preventDefault();
    };
    const end = (e) => {
      const list = e.changedTouches ? [...e.changedTouches] : [e];
      for (const t of list) {
        if ((t.identifier ?? 'mouse') !== this.joy.id) continue;
        this.joy.active = false;
        this.joy.x = this.joy.y = 0;
        setKnob(0, 0);
        base.classList.remove('on');
        base.style.left = base.style.top = ''; // 제자리(왼쪽 아래)로
      }
    };
    zone.addEventListener('touchstart', start, { passive: false });
    zone.addEventListener('touchmove', moveT, { passive: false });
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
    zone.addEventListener('mousedown', start);
    addEventListener('mousemove', (e) => { if (this.joy.id === 'mouse') moveT(e); });
    addEventListener('mouseup', (e) => { if (this.joy.id === 'mouse') end(e); });

    // 오른쪽 화면 끌기 = 시점 회전
    const cz = document.getElementById('camzone');
    const cstart = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      if (this.cam.id !== null) return;
      this.cam.id = t.identifier ?? 'mouse';
      this.cam.x = t.clientX; this.cam.y = t.clientY;
      e.preventDefault();
    };
    const cmove = (e) => {
      if (this.cam.id === null) return;
      const list = e.changedTouches ? [...e.changedTouches] : [e];
      for (const t of list) {
        if ((t.identifier ?? 'mouse') !== this.cam.id) continue;
        this.cam.dx += t.clientX - this.cam.x; this.cam.dy += t.clientY - this.cam.y;
        this.cam.x = t.clientX; this.cam.y = t.clientY;
      }
      if (e.cancelable) e.preventDefault();
    };
    const cend = (e) => {
      const list = e.changedTouches ? [...e.changedTouches] : [e];
      for (const t of list) if ((t.identifier ?? 'mouse') === this.cam.id) this.cam.id = null;
    };
    cz.addEventListener('touchstart', cstart, { passive: false });
    cz.addEventListener('touchmove', cmove, { passive: false });
    cz.addEventListener('touchend', cend);
    cz.addEventListener('touchcancel', cend);
    cz.addEventListener('mousedown', cstart);
    addEventListener('mousemove', (e) => { if (this.cam.id === 'mouse') cmove(e); });
    addEventListener('mouseup', (e) => { if (this.cam.id === 'mouse') cend(e); });

    // 버튼: 손가락마다 지금 누르고 있는 버튼을 기억한다.
    // 누른 채 다른 버튼 위로 미끄러지면 앞 버튼을 떼고 새 버튼을 누른 것으로 처리 (방어 → 공격 엄지 밀기)
    const btns = [...document.querySelectorAll('[data-btn]')];
    const fingers = new Map(); // touch id → btn
    const pressBtn = (btn) => { this._press(btn.dataset.btn); btn.classList.add('on'); this.anyTap = true; };
    const releaseBtn = (btn) => { this._release(btn.dataset.btn); btn.classList.remove('on'); };
    const btnAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const b = el && el.closest ? el.closest('[data-btn]') : null;
      return b && btns.includes(b) && !b.classList.contains('disabled-hard') ? b : null;
    };
    for (const btn of btns) {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        for (const t of e.changedTouches) { fingers.set(t.identifier, btn); pressBtn(btn); }
      }, { passive: false });
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); fingers.set('mouse', btn); pressBtn(btn); });
    }
    const slide = (id, x, y) => {
      const cur = fingers.get(id);
      if (!cur) return;
      const b = btnAt(x, y);
      if (b && b !== cur && b.closest('#controls') && b.style.display !== 'none') {
        releaseBtn(cur); fingers.set(id, b); pressBtn(b);
      }
    };
    const lift = (id) => {
      const cur = fingers.get(id);
      if (!cur) return;
      fingers.delete(id);
      if (![...fingers.values()].includes(cur)) releaseBtn(cur);
    };
    addEventListener('touchmove', (e) => { for (const t of e.changedTouches) slide(t.identifier, t.clientX, t.clientY); }, { passive: true });
    addEventListener('touchend', (e) => { for (const t of e.changedTouches) lift(t.identifier); });
    addEventListener('touchcancel', (e) => { for (const t of e.changedTouches) lift(t.identifier); });
    addEventListener('mouseup', () => lift('mouse'));
  }

  // 화면 기준 이동 벡터 (x: 오른쪽, z: 아래쪽 = 카메라 기준 앞으로 내려옴)
  move() {
    let x = 0, z = 0;
    if (this.held.left) x -= 1;
    if (this.held.right) x += 1;
    if (this.held.up) z -= 1;
    if (this.held.down) z += 1;
    if (x || z) { const l = Math.hypot(x, z); return { x: x / l, z: z / l }; }
    if (this.joy.active) {
      const l = Math.hypot(this.joy.x, this.joy.y);
      if (l < 0.15) return { x: 0, z: 0 };
      const k = Math.min(1, (l - 0.15) / 0.75) / l;
      return { x: this.joy.x * k, z: this.joy.y * k };
    }
    return { x: 0, z: 0 };
  }

  takeCamDrag() {
    const d = { x: this.cam.dx, y: this.cam.dy };
    this.cam.dx = this.cam.dy = 0;
    return d;
  }

  pressed(name) { return !!this.down[name]; }
  released(name) { return !!this.up[name]; }
  isHeld(name) { return !!this.held[name]; }

  endFrame() {
    this.down = {};
    this.up = {};
    this.anyTap = false;
  }
}
