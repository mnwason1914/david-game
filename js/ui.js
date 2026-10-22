// 화면 UI: 하트, 무화과떡, 목표, 미니맵, 대사창, 알림, 페이드
import { BOUNDS } from './world.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.dlg = null;
    this.mm = $('minimap');
    this.mctx = this.mm.getContext('2d');
    this.mmStatic = null;
    this.toastT = 0;
    this.promptT = 0;
    $('dialog').addEventListener('pointerdown', (e) => { e.preventDefault(); this.advance(); });
  }

  // ── 하트 / 떡 ──
  hearts(hp, max) {
    let h = '';
    for (let i = 0; i < max / 2; i++) {
      const v = hp - i * 2;
      h += `<span class="heart ${v >= 2 ? 'full' : v === 1 ? 'half' : 'empty'}"></span>`;
    }
    $('hearts').innerHTML = h;
    // 아래 가운데 체력 막대 (방어로 깎인 작은 피해도 그대로 보임)
    $('hpfill').style.width = Math.max(0, (hp / max) * 100) + '%';
    const shown = Math.max(0, Math.round(hp * 10) / 10);
    $('hpnum').innerHTML = `${shown % 1 ? shown.toFixed(1) : shown} <span>/ ${max}</span>`;
  }
  // 스태미나 막대 (값이 바뀔 때만 DOM을 건드림)
  stamina(v, max, exhausted) {
    const w = Math.round((v / max) * 200) / 2;
    if (w !== this._stW) { this._stW = w; $('stfill').style.width = w + '%'; }
    if (exhausted !== this._stEx) { this._stEx = exhausted; $('sttrack').classList.toggle('ex', !!exhausted); }
  }
  staminaBlink() {
    const t = $('sttrack');
    t.classList.remove('blink'); void t.offsetWidth; t.classList.add('blink');
  }
  jgFlash() {
    const f = $('jgflash');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  danger() {
    const f = $('danger');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  // 보스 자세 막대: 가운데에서 양쪽으로 차오름
  posture(enemy) {
    const P = enemy && enemy.def && enemy.def.posture;
    const k = P ? Math.min(1, enemy.posture / P.max) : 0;
    const w = Math.round(k * 100);
    if (w !== this._poW) { this._poW = w; $('bpfill').style.width = w + '%'; }
    const br = !!enemy && enemy.state === 'broken';
    if (br !== this._poBr) { this._poBr = br; $('bposture').classList.toggle('broken', br); }
  }
  stones(n) {
    $('stonecount').textContent = n;
    $('btn-sling').classList.toggle('disabled', n <= 0);
  }
  figs(n) {
    $('figcount').textContent = n;
    $('btn-heal').classList.toggle('disabled', n <= 0);
  }

  level(lv, xp, need, max) {
    $('lvnum').textContent = 'Lv ' + lv;
    $('lvfill').style.width = (max ? 100 : Math.min(100, (xp / need) * 100)) + '%';
    $('lvemb-n').textContent = lv;
    $('xpfill').style.width = $('lvfill').style.width;
  }
  xpPop(text) {
    const el = $('xppop');
    el.textContent = text;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  subs(lines) {
    const el = $('subs');
    el.innerHTML = lines.map((l) => `<div>◇ ${l}</div>`).join('');
    el.style.display = lines.length ? 'block' : 'none';
  }
  // 선택지 창: 고른 번호(0부터)를 돌려준다
  choice(title, options) {
    const el = $('choice');
    $('choice-title').textContent = title;
    const list = $('choice-list');
    list.innerHTML = '';
    this.choosing = true;
    return new Promise((resolve) => {
      const done = (i) => { this.choiceClose(); removeEventListener('keydown', onKey); resolve(i); };
      options.forEach((o, i) => {
        const b = document.createElement('button');
        b.textContent = o;
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); done(i); });
        list.appendChild(b);
      });
      const onKey = (e) => { const n = +e.key; if (n >= 1 && n <= options.length) done(n - 1); };
      addEventListener('keydown', onKey);
      el.classList.add('on');
    });
  }
  choiceClose() { $('choice').classList.remove('on'); this.choosing = false; }

  objective(text) {
    $('objective').textContent = text || '';
    $('objective').style.display = text ? 'block' : 'none';
  }

  boss(enemy) {
    const bar = $('bossbar');
    document.body.classList.toggle('bossfight', !!enemy);
    if (!enemy) { bar.style.display = 'none'; return; }
    bar.style.display = 'block';
    $('bossname').textContent = enemy.title;
    const w = Math.max(0, (enemy.hp / enemy.maxHp) * 100) + '%';
    $('bossfill').style.width = w;
    $('bosslag').style.width = w; // 깎인 만큼 밝은 잔상이 늦게 따라옴
  }

  interact(label) {
    const b = $('btn-interact');
    if (label) { b.textContent = label; b.style.display = 'flex'; } else b.style.display = 'none';
  }

  toast(text, time = 2.2) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('on');
    this.toastT = time;
  }
  prompt(text, time = 0) {
    const p = $('prompt');
    if (!text) { p.classList.remove('on'); return; }
    p.textContent = text;
    p.classList.add('on');
    this.promptT = time;
  }
  caption(text) { // 장면 제목 (가운데 큰 글씨)
    const c = $('caption');
    c.innerHTML = text;
    c.classList.remove('on');
    void c.offsetWidth;
    c.classList.add('on');
  }
  qte(on, success) {
    const q = $('qte');
    q.classList.toggle('on', !!on);
    if (success) { this.toast('수염을 잡고 내리쳤다!'); }
  }
  hurtFlash() {
    const h = $('hurt');
    h.classList.remove('on');
    void h.offsetWidth;
    h.classList.add('on');
  }

  fade(to, time = 0.6) {
    const f = $('fade');
    f.style.transition = `opacity ${time}s`;
    f.style.opacity = to;
    return new Promise((r) => setTimeout(r, time * 1000));
  }

  cinema(on) {
    document.body.classList.toggle('cinema', on);
  }

  // ── 수금 리듬 입력: 3음 × bars소절. 틀려도 실패 없음. onBar(i)는 소절이 끝날 때마다 호출 ──
  harp(bars, onBar) {
    const el = $('harp'), notesEl = $('harp-notes'), barEl = $('harp-bar');
    const keys = [...document.querySelectorAll('#harp-keys button')];
    el.classList.add('on');
    return new Promise((resolve) => {
      let bar = 0, idx = 0, seq = [], cells = [];
      const newBar = () => {
        seq = [0, 1, 2].map(() => Math.floor(Math.random() * 3));
        notesEl.innerHTML = '';
        cells = seq.map((n) => { const d = document.createElement('div'); d.className = 'hn'; d.textContent = ['♪', '♫', '♬'][n]; notesEl.appendChild(d); return d; });
        idx = 0;
        cells[0].classList.add('cur');
        barEl.textContent = `수금 연주 ${bar + 1} / ${bars} 소절 — 표시된 음을 누르세요`;
      };
      const play = (n) => {
        if (idx >= seq.length) return;
        keys[n].classList.add('hit');
        setTimeout(() => keys[n].classList.remove('hit'), 120);
        this.pluck(n, n === seq[idx]);
        cells[idx].classList.remove('cur');
        cells[idx].classList.add(n === seq[idx] ? 'ok' : 'miss');
        idx++;
        if (idx < seq.length) { cells[idx].classList.add('cur'); return; }
        const b = bar++;
        setTimeout(async () => {
          await onBar(b);
          if (bar >= bars) { cleanup(); resolve(); } else newBar();
        }, 450);
      };
      const onKey = (e) => {
        const m = { Digit1: 0, Digit2: 1, Digit3: 2, KeyJ: 0, KeyK: 1, KeyL: 2 }[e.code];
        if (m !== undefined && !this.dlg) play(m);
      };
      const handlers = keys.map((k, n) => { const h = (e) => { e.preventDefault(); if (!this.dlg) play(n); }; k.addEventListener('pointerdown', h); return h; });
      addEventListener('keydown', onKey);
      const cleanup = () => {
        el.classList.remove('on');
        removeEventListener('keydown', onKey);
        keys.forEach((k, n) => k.removeEventListener('pointerdown', handlers[n]));
      };
      newBar();
    });
  }
  // 간단한 수금 소리 (WebAudio)
  pluck(n, ok) {
    try {
      this.ac = this.ac || new (window.AudioContext || window.webkitAudioContext)();
      const ac = this.ac, t = ac.currentTime;
      const freq = [392, 494, 587][n] * (ok ? 1 : 0.94);
      for (const [mult, vol] of [[1, 0.22], [2, 0.06]]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle';
        o.frequency.value = freq * mult;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + 1.2);
      }
    } catch (e) {}
  }

  // ── 대사창 ──
  // lines: [[화자, 대사], ...]  → 모두 넘기면 resolve
  say(lines) {
    return new Promise((resolve) => {
      this.dlg = { lines, i: -1, resolve, shown: 0, full: '' };
      $('dialog').classList.add('on');
      this.nextLine();
    });
  }
  nextLine() {
    const d = this.dlg;
    d.i++;
    if (d.i >= d.lines.length) {
      $('dialog').classList.remove('on');
      this.dlg = null;
      d.resolve();
      return;
    }
    const [name, text] = d.lines[d.i];
    $('dname').textContent = name;
    $('dname').dataset.who = name.split(' ')[0];
    d.full = text;
    d.shown = 0;
    $('dtext').textContent = '';
    $('dnext').style.visibility = 'hidden';
  }
  advance() {
    const d = this.dlg;
    if (!d) return;
    if (d.shown < d.full.length) { d.shown = d.full.length; $('dtext').textContent = d.full; $('dnext').style.visibility = 'visible'; return; }
    this.nextLine();
  }

  update(dt, input) {
    if (this.dlg) {
      const d = this.dlg;
      if (d.shown < d.full.length) {
        d.shown = Math.min(d.full.length, d.shown + dt * 32);
        $('dtext').textContent = d.full.slice(0, Math.floor(d.shown));
        if (d.shown >= d.full.length) $('dnext').style.visibility = 'visible';
      }
      if (input.pressed('interact') || input.pressed('attack') || input.pressed('heavy')) this.advance();
    }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('on'); }
    if (this.promptT > 0) { this.promptT -= dt; if (this.promptT <= 0) $('prompt').classList.remove('on'); }
  }

  // ── 미니맵 ──
  buildMinimap(features) {
    const W = 260, H = Math.round(W * (BOUNDS.maxZ - BOUNDS.minZ) / (BOUNDS.maxX - BOUNDS.minX));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const sx = W / (BOUNDS.maxX - BOUNDS.minX), sz = H / (BOUNDS.maxZ - BOUNDS.minZ);
    this.mmScale = { sx, sz, W, H };
    const X = (x) => (x - BOUNDS.minX) * sx, Z = (z) => (z - BOUNDS.minZ) * sz;
    g.fillStyle = '#6f8a45'; g.fillRect(0, 0, W, H);
    for (const f of features) {
      g.strokeStyle = g.fillStyle = f.color;
      g.lineWidth = f.w || 2;
      if (f.type === 'circle') { g.beginPath(); g.arc(X(f.x), Z(f.z), f.r * sx, 0, Math.PI * 2); f.fill ? g.fill() : g.stroke(); }
      if (f.type === 'rect') { f.fill ? g.fillRect(X(f.minX), Z(f.minZ), (f.maxX - f.minX) * sx, (f.maxZ - f.minZ) * sz) : g.strokeRect(X(f.minX), Z(f.minZ), (f.maxX - f.minX) * sx, (f.maxZ - f.minZ) * sz); }
      if (f.type === 'line') { g.beginPath(); g.moveTo(X(f.x0), Z(f.z0)); g.lineTo(X(f.x1), Z(f.z1)); g.stroke(); }
      if (f.type === 'area') { g.beginPath(); g.ellipse(X(f.x), Z(f.z), f.rx * sx, f.rz * sz, 0, 0, Math.PI * 2); g.fill(); }
    }
    g.font = 'bold 11px sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.textAlign = 'center';
    for (const f of features) if (f.label) g.fillText(f.label, X(f.x ?? (f.minX + f.maxX) / 2), Z(f.z ?? f.minZ) - (f.r ? f.r * sz + 3 : 3));
    this.mmStatic = c;
    this.mm.width = W; this.mm.height = H;
  }

  drawMinimap(player, objective, enemies, marks = []) {
    if (!this.mmStatic) return;
    const g = this.mctx, { sx, sz, W, H } = this.mmScale;
    const X = (x) => (x - BOUNDS.minX) * sx, Z = (z) => (z - BOUNDS.minZ) * sz;
    g.drawImage(this.mmStatic, 0, 0);
    if (this.game.eastClosed) {
      g.fillStyle = '#4f5a2a'; g.fillRect(X(35), Z(0), 4, 8 * sz);
    }
    for (const e of enemies) if (e.alive && !e.removed) { g.fillStyle = '#ff4a3a'; g.beginPath(); g.arc(X(e.pos.x), Z(e.pos.z), e.boss ? 5 : 3, 0, Math.PI * 2); g.fill(); }
    for (const m of marks) { // 서브 퀘스트 위치 (하늘색 마름모)
      g.save(); g.translate(X(m.x), Z(m.z)); g.rotate(Math.PI / 4);
      g.fillStyle = '#8fd8ff'; g.strokeStyle = '#1a4a6a'; g.lineWidth = 1.2;
      g.fillRect(-3.5, -3.5, 7, 7); g.strokeRect(-3.5, -3.5, 7, 7);
      g.restore();
    }
    if (objective && objective.x !== undefined) {
      const t = performance.now() / 300;
      g.fillStyle = '#ffd34d';
      g.beginPath(); g.arc(X(objective.x), Z(objective.z), 4 + Math.sin(t) * 1.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7a5a00'; g.lineWidth = 1.5; g.stroke();
    }
    // 플레이어 화살표
    const px = X(player.pos.x), pz = Z(player.pos.z);
    g.save(); g.translate(px, pz); g.rotate(-player.yaw + Math.PI);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#222'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
