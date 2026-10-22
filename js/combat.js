// 전투 판정과 효과(불꽃, 화면 흔들림, 소리)
import * as THREE from 'three';
import { angleTo, dist } from './actors.js';
import { COMBAT } from './data/enemies.js';
import { WEAPONS } from './data/weapons.js';
import * as P from './engine/props.js';

const WALL_TAGS = ['rock', 'bigrock', 'ridge', 'foldwall', 'yardwall'];
const _a = new THREE.Vector3();
// 점 p 와 선분 ab 사이 수평 거리
function segDist2D(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const k = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * k), pz - (az + dz * k));
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.hittables = []; // { x, z, r, onHit() }  가시덤불 등
    this.slingTargets = []; // { pos:{x,z}, y, r, onHit() }  물매 과녁
    this.stones = [];       // 날아가는 물맷돌
    this.finisher = null;
  }
  add(e) { this.enemies.push(e); return e; }
  clear() {
    for (const e of this.enemies) if (!e.removed) e.remove();
    for (const st of this.stones) this.game.scene.remove(st.mesh);
    this.enemies = []; this.hittables = []; this.slingTargets = []; this.stones = []; this.finisher = null; this.game.lockT = null;
  }

  // ── 물매 ──
  // aim: 적 또는 과녁 (없으면 바라보는 방향으로 곧게)
  fireStone(pl, aim) {
    const S = WEAPONS.sling;
    const hand = pl.rig.sockets.handR.getWorldPosition(new THREE.Vector3());
    const from = new THREE.Vector3(pl.pos.x, Math.max(hand.y, pl.pos.y + 1.5), pl.pos.z);
    let to;
    if (aim) {
      const gy = aim.def ? (aim.pos.y || 0) + (aim.def.hurtbox?.h || 1.6) * 0.6 : this.game.world.heightAt(aim.pos.x, aim.pos.z) + (aim.y || 1.2);
      to = new THREE.Vector3(aim.pos.x, gy, aim.pos.z);
    } else {
      const f = pl.forward();
      to = new THREE.Vector3(pl.pos.x + f.x * S.range, from.y - 0.4, pl.pos.z + f.z * S.range);
    }
    const vel = to.clone().sub(from).normalize().multiplyScalar(S.speed);
    const mesh = P.slingShot();
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    this.stones.push({ mesh, vel, travel: 0, pl });
    this.sfx('sling');
  }
  updateStones(dt) {
    const S = WEAPONS.sling, W = this.game.world;
    for (const st of this.stones) {
      if (st.done) continue;
      const p = st.mesh.position;
      const steps = 3, h = dt / steps;
      for (let k = 0; k < steps && !st.done; k++) {
        st.vel.y -= 3 * h;
        p.addScaledVector(st.vel, h);
        st.travel += st.vel.length() * h;
        st.mesh.rotation.x += h * 20;
        // 적
        for (const e of this.enemies) {
          if (!e.alive || e.removed || e.active === false) continue;
          const hb = e.def.hurtbox || { r: e.radius, h: 1.8, len: 0 };
          const f = e.forward(), half = hb.len / 2, gy = e.pos.y || 0;
          if (p.y < gy - 0.2 || p.y > gy + hb.h + 0.3) continue;
          if (segDist2D(p.x, p.z, e.pos.x - f.x * half, e.pos.z - f.z * half, e.pos.x + f.x * half, e.pos.z + f.z * half) > hb.r + 0.15) continue;
          st.done = true;
          this.slingStrike(st.pl, e, p);
          break;
        }
        if (st.done) break;
        // 과녁
        for (const t of this.slingTargets) {
          if (t.done) continue;
          const ty = W.heightAt(t.pos.x, t.pos.z) + t.y;
          if (Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < t.r + 0.1 && Math.abs(p.y - ty) < t.r + 0.15) {
            st.done = true;
            this.game.fx.spark(p.x, p.y, p.z, 0xe8c890, 7);
            this.sfx('wood');
            t.onHit();
            break;
          }
        }
        if (st.done) break;
        // 땅·바위·사거리
        const g = W.heightAt(p.x, p.z);
        if (p.y < g + 0.05 || (p.y < g + 2 && W.camBlocked(p.x, p.z)) || st.travel > S.range) {
          st.done = true;
          if (st.travel <= S.range) { this.game.fx.spark(p.x, Math.max(p.y, g + 0.1), p.z, 0xb8b0a0, 4); this.sfx('pebble'); }
        }
      }
      if (st.done) this.game.scene.remove(st.mesh);
    }
    this.stones = this.stones.filter((st) => !st.done);
  }
  slingStrike(pl, e, p) {
    const S = WEAPONS.sling;
    if (e.onSling) e.onSling();
    e.slingHit = true;
    e.hurt(S.dmg * this.game.attackMult(), pl.pos, S.knock);
    e.slingHit = false;
    e.freeze = Math.max(e.freeze || 0, 0.05);
    this.game.fx.spark(p.x, p.y, p.z, 0xfff1c0, 8);
    this.game.fx.shake(0.06);
    this.sfx('hit');
    if (e.alive && e.state !== 'broken' && e.addPosture) e.addPosture(S.posture * (e.isOpen && !e.isOpen() ? 0.35 : 1));
  }

  inArc(src, p, range, arcDeg) {
    const d = dist(src.pos, p);
    if (d > range) return false;
    if (arcDeg >= 360 || d < 0.6) return true;
    const a = Math.atan2(Math.sin(angleTo(src.pos, p) - src.yaw), Math.cos(angleTo(src.pos, p) - src.yaw));
    return Math.abs(a) <= (arcDeg * Math.PI / 180) / 2;
  }

  nearestEnemy(pos, maxD) {
    let best = null, bd = maxD;
    for (const e of this.enemies) {
      if (!e.alive || e.removed || !e.active) continue;
      const d = dist(pos, e.pos) - e.radius;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ── 다윗의 지팡이 판정 ──
  // Active 동안 매 스텝: 지난 스텝과 이번 스텝의 지팡이 점들을 이어 쓸고 지나간 자리를 적 몸통과 비교
  staffSweep(pl, move) {
    const W = pl.weapon, Z = W.hitZone;
    const prev = pl.prevPts ? pl.prevPts.map((v) => v.clone()) : null;
    const cur = pl.staffPoints(pl.prevPts);
    pl.prevPts = cur;
    if (!prev) return;
    const samples = [0.15, 0.45, 0.7, 0.95, 1.2, 1.4];
    const test = (hit) => {
      let best = null; // 'far' 우선
      for (let i = 0; i < cur.length; i++) {
        for (let k = 0; k <= 2; k++) {
          _a.lerpVectors(prev[i], cur[i], k / 2);
          if (hit(_a)) { const far = samples[i] >= Z.from; if (far) return { far: true, p: _a.clone() }; if (!best) best = { far: false, p: _a.clone() }; }
        }
      }
      return best;
    };
    for (const e of this.enemies) {
      if (!e.alive || e.removed || !e.active || pl.hitList.has(e)) continue;
      if (move.thrust && pl.hitList.size) break; // 찌르기는 처음 맞은 하나에서 멈춤
      const hb = e.def.hurtbox || { r: e.radius, h: 1.8, len: 0 };
      const f = e.forward(), half = hb.len / 2, gy = e.pos.y || 0;
      const ax = e.pos.x - f.x * half, az = e.pos.z - f.z * half, bx = e.pos.x + f.x * half, bz = e.pos.z + f.z * half;
      const r = test((p) => p.y > gy - 0.3 && p.y < gy + hb.h + 0.3 && segDist2D(p.x, p.z, ax, az, bx, bz) <= hb.r + Z.pad);
      if (r) { pl.hitList.add(e); this.playerStrike(pl, e, move, !r.far, r.p); }
    }
    for (const h of this.hittables) {
      if (h.done || pl.hitList.has(h)) continue;
      const gy = this.game.world.heightAt(h.x, h.z);
      const r = test((p) => p.y > gy - 0.3 && p.y < gy + 2.4 && Math.hypot(p.x - h.x, p.z - h.z) <= h.r + Z.pad);
      if (r) {
        pl.hitList.add(h); pl.hitAny = true;
        h.onHit();
        this.game.fx.spark(r.p.x, r.p.y, r.p.z, 0x9aa060, 6);
        this.sfx('wood');
        pl.freeze = COMBAT.hitstop.light[0];
      }
    }
    // 바위·담에 지팡이 끝이 걸리면 튕김 (아무것도 안 맞혔을 때만)
    if (!pl.hitAny) {
      const tip = cur[cur.length - 1], mid = cur[2];
      for (const q of [tip, mid]) {
        const gy = this.game.world.heightAt(q.x, q.z);
        if (q.y - gy < 1.0 && this.game.world.hitsObstacle(q.x, q.z, -0.1, WALL_TAGS) && !this.outOfBounds(q)) {
          this.game.fx.spark(q.x, q.y, q.z, 0xb8b0a0, 6);
          this.sfx('wall');
          pl.freeze = COMBAT.hitstop.wall;
          pl.setState('recoil');
          break;
        }
      }
    }
  }
  outOfBounds(q) { return !this.game.world.hitsObstacle(q.x, q.z, -0.1, ['__none__']) ? false : true; }

  // 다윗의 공격이 적에게 맞음: 체력·자세·움찔·결정타
  playerStrike(pl, e, move, near, p) {
    const W = pl.weapon, Z = W.hitZone, C = COMBAT;
    let dmg = W.power * move.dmg * this.game.attackMult() * (near ? Z.nearMult : 1);
    const post = move.posture * (near ? Z.nearMult : 1);
    const broken = e.state === 'broken';
    let finisher = false;
    if (broken) {
      if (move.thrust) { finisher = true; dmg *= C.brokenHeavyMult; if (!e.boss) dmg = Math.max(dmg, e.hp); }
      else dmg *= C.brokenLightMult;
    }
    const heavy = !!move.thrust;
    e.hurt(dmg, pl.pos, move.knock * (near ? 0.5 : 1));
    pl.hitAny = true;
    const hs = heavy ? C.hitstop.heavy : C.hitstop.light;
    pl.freeze = hs[0] * (near ? 1.3 : 1);
    e.freeze = Math.max(e.freeze || 0, hs[1]);
    if (heavy) { const f = pl.forward(); pl.vel.x -= f.x * 1.5; pl.vel.z -= f.z * 1.5; }
    this.game.fx.spark(p.x, p.y, p.z, finisher ? 0xffe070 : near ? 0xd8c8a8 : 0xfff1c0, finisher ? 16 : heavy ? 10 : 7);
    this.game.fx.shake(finisher ? 0.35 : heavy ? 0.15 : near ? 0.06 : 0.08);
    this.sfx(finisher ? 'finisher' : heavy ? 'thrust' : near ? 'dull' : 'hit');
    if (!e.alive) return;
    if (finisher) {
      e.posture = e.def.posture.max * C.brokenReset;
      e.endBroken();
      this.game.ui.toast('결정타!', 1.2);
    } else if (!broken) {
      e.addPosture(post * (e.isOpen && !e.isOpen() ? 0.35 : 1)); // 빈틈이 아니면 자세도 조금만
      if (e.state !== 'broken') e.flinch(heavy);
    }
  }

  // ── 적의 공격 ──
  // inRange: 그 공격 모양(부채꼴·원·몸통)에 다윗이 들어 있는지. 방어·저스트 가드·무적 판단은 다윗이 한다.
  enemyStrike(e, atk, inRange, from = e.pos, opts = {}) {
    if (!inRange) return 'miss';
    return this.game.player.receiveAttack(e, atk, from, opts);
  }
  // 방어 불가 공격 예고: 머리 위 붉은 표식 + 낮은 울림 + 화면 가장자리
  warn(e) {
    const m = this.warnMark || (this.warnMark = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#c0101e'; g.beginPath(); g.moveTo(32, 3); g.lineTo(61, 58); g.lineTo(3, 58); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.fillRect(29, 20, 6, 22); g.fillRect(29, 46, 6, 6);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      sp.renderOrder = 10; sp.scale.setScalar(0.8);
      this.game.scene.add(sp);
      return sp;
    })());
    m.userData.target = e; m.userData.life = 0.5;
    m.visible = true;
    this.sfx('warn');
    this.game.ui.danger();
  }
  // 저스트 가드·방어 불꽃: 지팡이 가운데
  staffSpark(pl, color, n) {
    const pts = pl.staffPoints();
    const q = pts[2];
    this.game.fx.spark(q.x, q.y, q.z, color, n);
  }

  // ── 소리 (WebAudio로 짧게 합성, 파일 없음) ──
  sfx(kind) {
    try {
      const ui = this.game.ui;
      ui.ac = ui.ac || new (window.AudioContext || window.webkitAudioContext)();
      const ac = ui.ac, t = ac.currentTime;
      if (ac.state === 'suspended') ac.resume();
      const S = {
        hit: [[180, 0.25, 0.09, 'triangle', 90], [900, 0.06, 0.03, 'square', 400]],
        dull: [[120, 0.22, 0.08, 'triangle', 70]],
        thrust: [[140, 0.32, 0.14, 'triangle', 60], [600, 0.08, 0.05, 'square', 200]],
        finisher: [[90, 0.4, 0.3, 'sawtooth', 40], [300, 0.15, 0.2, 'triangle', 120]],
        wood: [[260, 0.2, 0.07, 'triangle', 140]],
        wall: [[700, 0.12, 0.05, 'square', 500], [150, 0.15, 0.06, 'triangle', 90]],
        block: [[320, 0.22, 0.08, 'square', 180]],
        jg: [[1500, 0.22, 0.16, 'triangle', 1400], [2250, 0.12, 0.22, 'sine', 2200], [400, 0.18, 0.05, 'square', 300]],
        break: [[220, 0.3, 0.25, 'sawtooth', 70]],
        warn: [[70, 0.35, 0.45, 'sawtooth', 55], [140, 0.12, 0.45, 'square', 110]],
        posture: [[110, 0.35, 0.4, 'sawtooth', 50], [800, 0.1, 0.2, 'triangle', 300]],
        sling: [[500, 0.12, 0.12, 'sine', 1400]],
        pebble: [[900, 0.08, 0.04, 'square', 600]],
      }[kind];
      if (!S) return;
      for (const [f0, vol, dur, type, f1] of S) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        g.gain.setValueAtTime(vol * 0.6, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + dur + 0.02);
      }
    } catch (e) {}
  }

  openFinisher(time, target) {
    this.finisher = { t: time, hit: false, target };
    this.game.ui.qte(true);
  }
  closeFinisher() {
    const ok = !!(this.finisher && this.finisher.hit);
    this.finisher = null;
    this.game.ui.qte(false);
    this.game.ui.prompt(null);
    return ok;
  }

  update(dt) {
    if (this.finisher && !this.finisher.hit && (this.game.input.pressed('attack') || this.game.input.pressed('heavy'))) {
      this.finisher.hit = true;
      this.game.ui.qte(false, true);
    }
    this.enemies = this.enemies.filter((e) => !e.removed);
    if (this.stones.length) this.updateStones(dt);
    const m = this.warnMark;
    if (m && m.visible) {
      const e = m.userData.target;
      m.userData.life -= dt;
      if (m.userData.life <= 0 || !e || e.removed) m.visible = false;
      else { m.position.set(e.pos.x, (e.pos.y || 0) + (e.def.hurtbox?.h || 2) + 0.9, e.pos.z); m.material.opacity = 0.6 + 0.4 * Math.abs(Math.sin(m.userData.life * 18)); }
    }
  }

  get bossAlive() { return this.enemies.some((e) => e.boss && e.alive); }
  get anyAlive() { return this.enemies.some((e) => e.alive); }
}

export class FX {
  constructor(game) {
    this.game = game;
    this.parts = [];
    this.rings = [];
    this.shakeT = 0;
    this.shakeA = 0;
    this.stop = 0;
    this.geo = new THREE.TetrahedronGeometry(0.09);
  }
  // 불꽃 조각은 미리 만든 64개를 돌려 쓰고, 재질은 색마다 하나씩만 만든다
  spark(x, y, z, color, n = 6) {
    this.mats = this.mats || new Map();
    let m = this.mats.get(color);
    if (!m) { m = new THREE.MeshBasicMaterial({ color }); this.mats.set(color, m); }
    if (!this.pool) {
      this.pool = [];
      for (let i = 0; i < 64; i++) { const p = new THREE.Mesh(this.geo, m); p.visible = false; p.userData.life = 0; this.game.scene.add(p); this.pool.push(p); }
      this.pi = 0;
    }
    for (let i = 0; i < n; i++) {
      const p = this.pool[this.pi = (this.pi + 1) % this.pool.length];
      if (p.parent !== this.game.scene) this.game.scene.add(p);
      p.material = m;
      p.position.set(x, y, z);
      p.visible = true;
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      Object.assign(p.userData, { vx: Math.cos(a) * s, vy: 2 + Math.random() * 4, vz: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3 });
      if (!this.parts.includes(p)) this.parts.push(p);
    }
  }
  ring(x, z, r, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.85, r, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.08, z);
    m.userData.life = 0.35;
    this.game.scene.add(m);
    this.rings.push(m);
  }
  shake(a) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = 0.25; }
  update(dt) {
    for (const p of this.parts) {
      const u = p.userData;
      u.life -= dt;
      u.vy -= 14 * dt;
      p.position.x += u.vx * dt; p.position.y = p.position.y + u.vy * dt; p.position.z += u.vz * dt;
      p.rotation.x += dt * 8;
      if (u.life <= 0) p.visible = false;
    }
    this.parts = this.parts.filter((p) => p.userData.life > 0);
    for (const r of this.rings) {
      r.userData.life -= dt;
      r.scale.setScalar(1 + (0.35 - r.userData.life) * 1.2);
      r.material.opacity = Math.max(0, r.userData.life / 0.35) * 0.8;
      if (r.userData.life <= 0) { this.game.scene.remove(r); r.geometry.dispose(); }
    }
    this.rings = this.rings.filter((r) => r.userData.life > 0);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakeA = 0;
  }
  shakeOffset() {
    if (this.shakeT <= 0) return { x: 0, z: 0 };
    const a = this.shakeA * (this.shakeT / 0.25);
    return { x: (Math.random() - 0.5) * a, z: (Math.random() - 0.5) * a };
  }
}
