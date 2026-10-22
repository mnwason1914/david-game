// 캐릭터들: 플레이어(다윗), NPC, 양, 적(도둑·곰·사자)
import * as THREE from 'three';
import { createRig, poseHumanoid, poseQuad, STAFF_POSES, staffTrack, mixStaffPose } from './engine/rig.js';
import { WEAPON_MODELS } from './engine/props.js';
import * as P from './engine/props.js';
import { WEAPONS } from './data/weapons.js';
import { PLAYER, ENEMIES, COMBAT } from './data/enemies.js';

const TAU = Math.PI * 2;
// 바닥 예고 색: 방어 가능(주황) / 방어 불가 보스 강공격(짙은 진홍, 깜빡임 + 머리 위 표식)
const TELE = { block: 0xff9a2a, unblock: 0xb00018 };
export const angleTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turnTo = (cur, target, maxStep) => cur + Math.max(-maxStep, Math.min(maxStep, wrap(target - cur)));

// ───────────── 공통 ─────────────
class Actor {
  constructor(game, rig, radius) {
    this.game = game;
    this.rig = rig;
    this.radius = radius;
    this.pos = rig.root.position;
    this.yaw = 0;
    this.anim = { move: 0, phase: 0, action: null, t: 0, combo: 0, idle: Math.random() * 10 };
    this.flash = 0;
    game.scene.add(rig.root);
  }
  setPos(x, z, yaw) { this.pos.set(x, 0, z); if (yaw !== undefined) this.yaw = yaw; this.rig.root.rotation.y = this.yaw; }
  face(p, rate = 99) { this.yaw = turnTo(this.yaw, angleTo(this.pos, p), rate); }
  forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  remove() { this.rig.root.parent?.remove(this.rig.root); this.removed = true; }
  pulse() { this.flash = 0.15; }
  applyVisual(dt) {
    this.rig.root.rotation.y = this.yaw;
    this.anim.idle += dt;
    if (this.flash > 0) {
      this.flash -= dt;
      const s = 1 + Math.max(0, this.flash) * 0.8;
      this.rig.body.scale.set(s * (this.rig.height || 1), (this.rig.height || 1) / s, s * (this.rig.height || 1));
    } else if (this.rig.height) this.rig.body.scale.setScalar(this.rig.height);
    else this.rig.body.scale.setScalar(1);
  }
}

// ───────────── 사람형 공통 ─────────────
export class Humanoid extends Actor {
  constructor(game, rig, radius = 0.4) {
    super(game, rig, radius);
    this.weapon = null;
    this.weaponMesh = null;
    this.walkTarget = null;
    this.walkSpeed = 3;
    this.pose = null; // 고정 포즈 (컷신용): 'pray', 'sit', 'down', 'hug' ...
  }
  async equip(weaponId) {
    if (this.weaponMesh) this.weaponMesh.parent.remove(this.weaponMesh);
    const w = WEAPONS[weaponId];
    this.weapon = w ? { id: weaponId, ...w } : null;
    if (!w) return;
    let mesh;
    if (w.model.startsWith('proc:')) mesh = WEAPON_MODELS[w.model.slice(5)]();
    else {
      const { GLTFLoader } = await import('../vendor/addons/loaders/GLTFLoader.js');
      mesh = (await new GLTFLoader().loadAsync(w.model)).scene;
    }
    mesh.position.set(...w.offset);
    mesh.rotation.set(...w.rotation);
    mesh.scale.setScalar(w.scale);
    this.rig.sockets[w.socket].add(mesh);
    this.weaponMesh = mesh;
    mesh.visible = !this.carrying;
  }
  // 컷신: 목표 지점까지 걷기 (Promise)
  walkTo(x, z, speed = 3) {
    this.walkTarget = { x, z };
    this.walkSpeed = speed;
    return new Promise((res) => { this._walkDone = res; });
  }
  updateWalk(dt) {
    if (!this.walkTarget) return false;
    const d = dist(this.pos, this.walkTarget);
    if (d < 0.15) {
      this.walkTarget = null;
      this._walkDone && this._walkDone();
      return false;
    }
    this.face(this.walkTarget, dt * 10);
    const step = Math.min(d, this.walkSpeed * dt);
    this.pos.x += Math.sin(this.yaw) * step;
    this.pos.z += Math.cos(this.yaw) * step;
    this.anim.move = Math.min(1, this.walkSpeed / 4);
    this.anim.phase += dt * this.walkSpeed * 2.4;
    return true;
  }
}

// ───────────── NPC ─────────────
export class NPC extends Humanoid {
  constructor(game, rig, name) {
    super(game, rig, 0.45);
    this.name = name;
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    this.marker.position.y = 2.35 * (rig.height || 1);
    this.marker.visible = false;
    rig.root.add(this.marker);
  }
  update(dt) {
    const walking = this.updateWalk(dt);
    if (!walking) this.anim.move = Math.max(0, this.anim.move - dt * 5);
    this.anim.action = this.pose;
    this.anim.t = Math.min(1, this.anim.t + dt);
    poseHumanoid(this.rig, this.anim);
    if (this.marker.visible) { this.marker.rotation.y += dt * 2; this.marker.position.y = 2.35 * (this.rig.height || 1) + Math.sin(this.anim.idle * 3) * 0.08; }
    this.applyVisual(dt);
  }
}

// ───────────── 플레이어 ─────────────
// 상태: idle · attack(약1/약2/강/반격/스텝공격) · guard · guardHit · jg · guardBreak · step · recoil · hurt · dead
// 공격은 Startup → Active(지팡이 판정) → Recovery. 모든 시간·수치는 data/weapons.js, data/enemies.js 에 있다.
const GUARDING = ['guard', 'guardHit', 'jg'];
const STAFF_SAMPLES = [0.15, 0.45, 0.7, 0.95, 1.2, 1.4]; // 지팡이 축 위 판정 점 (뒷손에서 m)
const _p = new THREE.Vector3();

export class Player extends Humanoid {
  constructor(game, rig) {
    super(game, rig, 0.42);
    this.maxHp = PLAYER.hearts * 2;
    this.hp = this.maxHp;
    this.figs = 0;
    this.locked = false;      // 컷신·대화 중 입력 막기
    this.state = 'idle';
    this.stateT = 0;
    this.iframe = 0;
    this.freeze = 0;          // 타격 정지(히트스톱)
    this.carrying = null;
    this.vel = { x: 0, z: 0 };
    this.st = PLAYER.stamina.max;
    this.stWait = 0;
    this.buffer = null;       // 미리 누른 입력 { kind, at(상태 시간), age }
    this.lockoutT = 0;        // 약공격 2타 뒤 콤보 종료 잠금
    this.counterUntil = -1;   // 저스트 가드 뒤 반격 찌르기 가능 시각
    this.guardPressT = -9;
    this.guardSpam = false;
    this.lastStepEnd = -9;
    this.stepChain = 0;
    this.mount = null;
    this.curPose = STAFF_POSES.stance;
    this.poseFrom = STAFF_POSES.stance;
    this.prevPts = null;
  }

  get dead() { return this.hp <= 0; }

  setState(s) {
    this.state = s; this.stateT = 0; this.anim.t = 0; this.hitDone = false;
    this.poseFrom = this.curPose;
  }

  async equip(weaponId) {
    await super.equip(weaponId);
    this.mount = null;
    this.setMount('grip');
  }
  // 지팡이를 양손 파지 소켓(grip) 또는 오른손(hand, 컷신 포즈용)에 붙인다
  setMount(m) {
    const mesh = this.weaponMesh, w = this.weapon;
    if (!mesh || this.mount === m) return;
    this.mount = m;
    mesh.parent?.remove(mesh);
    if (m === 'grip') { mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); this.rig.sockets.grip.add(mesh); }
    else { mesh.position.set(...w.offset); mesh.rotation.set(...w.rotation); this.rig.sockets[w.handSocket || 'handR'].add(mesh); }
  }

  // ── 체력 ──
  // 평안 버프·허리띠는 모든 피해(방어로 깎이는 피해 포함)에 적용
  modDamage(n, chip) {
    if (this.peace) { n = chip ? n / 2 : Math.max(1, Math.floor(n / 2)); this.peace = false; this.game.ui.toast('「평안」이 피해를 줄였다'); }
    if (this.game.prog.belt && n >= 3) n -= 1; // 형의 낡은 허리띠: 큰 피해 1 감소
    return n;
  }
  loseHp(n) {
    this.hp = Math.max(0, Math.round((this.hp - n) * 100) / 100);
    this.game.ui.hearts(this.hp, this.maxHp);
    if (this.dead) this.setState('dead');
  }
  takeDamage(n, from) {
    if (this.iframe > 0 || this.dead || this.locked) return false;
    n = this.modDamage(n, false);
    this.loseHp(n);
    this.iframe = PLAYER.hurtIframe;
    const a = angleTo(from, this.pos);
    this.vel.x = Math.sin(a) * 9; this.vel.z = Math.cos(a) * 9;
    if (!this.dead) this.setState('hurt');
    this.game.fx.shake(0.25 + n * 0.08);
    this.game.fx.spark(this.pos.x, this.pos.y + 1.0, this.pos.z, 0xff5040, 8);
    this.game.ui.hurtFlash();
    return true;
  }
  invulnerable() {
    if (this.iframe > 0) return true;
    if (this.state !== 'step') return false;
    const I = this.stepBack ? PLAYER.step.backIframe : PLAYER.step.iframe;
    return this.stateT >= I[0] && this.stateT < I[1];
  }

  // 적 공격을 받는다. 반환: 'miss' | 'dodged' | 'hit' | 'blocked' | 'jg' | 'broken'
  receiveAttack(enemy, atk, from = enemy.pos, opts = {}) {
    if (this.locked || this.dead) return 'miss';
    if (this.invulnerable()) return 'dodged';
    const G = PLAYER.guard, C = this.game.combat;
    const guarding = GUARDING.includes(this.state);
    const facing = Math.abs(wrap(angleTo(this.pos, from) - this.yaw)) <= (G.arc * Math.PI / 180) / 2;
    if (atk.unblockable) {
      const broke = guarding && facing;
      this.takeDamage(atk.damage, from);
      if (broke && !this.dead) { this.st = 0; this.stWait = PLAYER.stamina.exhaustDelay; this.setState('guardBreak'); C.sfx('break'); }
      return 'hit';
    }
    if (guarding && facing) {
      const since = this.game.time - this.guardPressT;
      const win = (this.guardSpam ? G.jgSpamWindow : G.jgWindow) + G.jgGrace;
      if (since >= -0.001 && since <= win) {
        // 저스트 가드: 피해 0, 반격 기회
        this.setState('jg');
        this.counterUntil = this.game.time + this.weapon.moves.counter.window;
        this.freeze = COMBAT.hitstop.jg;
        enemy.freeze = Math.max(enemy.freeze || 0, COMBAT.hitstop.jg);
        C.staffSpark(this, 0xfff4c8, 14);
        this.game.fx.shake(0.12);
        C.sfx('jg');
        this.game.ui.jgFlash();
        try { navigator.vibrate && navigator.vibrate(30); } catch (e) {}
        this.game.stats.jg = (this.game.stats.jg || 0) + 1;
        enemy.onDeflected(atk, opts.last !== false);
        return 'jg';
      }
      const a = angleTo(from, this.pos);
      if (this.st < atk.guardCost) {
        // 가드 붕괴
        this.st = 0; this.stWait = PLAYER.stamina.exhaustDelay;
        this.loseHp(this.modDamage(atk.damage * G.breakDmg, true));
        if (!this.dead) this.setState('guardBreak');
        this.vel.x = Math.sin(a) * 6; this.vel.z = Math.cos(a) * 6;
        this.game.fx.shake(0.3);
        C.staffSpark(this, 0xd8c8a8, 8);
        C.sfx('break');
        this.game.ui.toast('가드가 무너졌다!', 1.2);
        return 'broken';
      }
      this.spend(atk.guardCost);
      this.loseHp(this.modDamage(atk.damage * G.chip, true));
      if (!this.dead) this.setState('guardHit');
      this.vel.x = Math.sin(a) * 3.5; this.vel.z = Math.cos(a) * 3.5;
      this.game.fx.shake(0.1 + atk.damage * 0.04);
      C.staffSpark(this, 0xffd890, 6);
      C.sfx('block');
      return 'blocked';
    }
    return this.takeDamage(atk.damage, from) ? 'hit' : 'miss';
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
    this.game.ui.hearts(this.hp, this.maxHp);
  }

  useFig() {
    if (this.figs <= 0 || this.hp >= this.maxHp) return;
    this.figs--;
    this.heal(PLAYER.figHeal + this.game.prog.healBonus);
    this.game.fx.spark(this.pos.x, this.pos.y + 1.2, this.pos.z, 0x8cff8c, 10);
    this.game.ui.figs(this.figs);
  }

  // ── 스태미나 ──
  spend(n) {
    const S = PLAYER.stamina;
    this.st = Math.max(0, this.st - n);
    this.stWait = this.st <= 0 ? S.exhaustDelay : S.delay;
  }
  updateStamina(dt) {
    const S = PLAYER.stamina;
    if (this.stWait > 0) this.stWait -= dt;
    else if (this.st < S.max) this.st = Math.min(S.max, this.st + (GUARDING.includes(this.state) ? S.guardRegen : S.regen) * dt);
    this.game.ui.stamina(this.st, S.max, this.st <= 0 || (this.stWait > S.delay && this.st < 1));
  }

  // ── 상대 고르기 ──
  target() { return this.game.lockT && this.game.lockT.alive ? this.game.lockT : null; }
  softAim(dir) {
    // 고정 안 했을 때: 3.5 m 안, 바라보는(또는 스틱) 방향 ±60° 안의 적에게만 살짝 맞춘다
    let best = null, bs = 1e9;
    for (const e of this.game.combat.enemies) {
      if (!e.alive || e.removed || !e.active) continue;
      const d = dist(this.pos, e.pos) - e.radius;
      if (d > 3.5) continue;
      const da = Math.abs(wrap(angleTo(this.pos, e.pos) - dir));
      if (da > Math.PI / 3) continue;
      const sc = d + da * 1.5;
      if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }

  // ── 행동 시작 ──
  startMove(id, from) {
    const W = this.weapon || WEAPONS.staff, M = W.moves;
    let m;
    if (id === 'counter') m = { ...M[M.counter.base], ...M.counter, id: 'H', counter: true };
    else if (id === 'stepAttack') m = { ...M[M.stepAttack.base], ...M.stepAttack, id: 'L1' };
    else m = { ...M[id], id };
    if (this.st < 1) { this.game.ui.staminaBlink(); return false; }
    this.spend(m.stamina);
    this.move = m;
    this.extraRec = 0;
    this.hitList = new Set();
    this.hitAny = false;
    this.lungeLeft = m.lunge;
    this.setState('attack');
    this.buffer = null;
    this.prevPts = null;
    // 방향: 고정 대상 → 부드러운 조준 → 스틱 방향
    const mv = this.game.worldMove();
    const T = this.target();
    const dir = Math.hypot(mv.x, mv.z) > 0.2 ? Math.atan2(mv.x, mv.z) : this.yaw;
    const aim = T || this.softAim(dir);
    this.aimAt = aim;
    if (aim) this.yaw = angleTo(this.pos, aim.pos);
    else this.yaw = dir;
    return true;
  }
  startStep() {
    const P = PLAYER.step;
    const chain = this.game.time - this.lastStepEnd < P.chainGap ? this.stepChain + 1 : 0;
    if (this.st < 1) { this.game.ui.staminaBlink(); return false; }
    this.stepChain = chain;
    this.spend(P.stamina + P.chainAdd * chain);
    const mv = this.game.worldMove();
    const ml = Math.hypot(mv.x, mv.z);
    const T = this.target();
    this.stepBack = false;
    if (T) {
      // 고정 중: 적 기준 앞·뒤·왼·오 4방향
      const fa = angleTo(this.pos, T.pos);
      this.yaw = fa;
      if (ml < 0.2) { this.stepDir = fa + Math.PI; this.stepBack = true; this.stepSide = 'back'; }
      else {
        const rel = wrap(Math.atan2(mv.x, mv.z) - fa);
        const q = Math.round(rel / (Math.PI / 2));
        this.stepDir = fa + q * Math.PI / 2;
        this.stepSide = ['fwd', 'left', 'back', 'right', 'back'][(q + 4) % 4] || 'fwd';
        if (Math.abs(q) === 2) this.stepBack = true;
      }
    } else if (ml >= 0.2) { this.yaw = Math.atan2(mv.x, mv.z); this.stepDir = this.yaw; this.stepSide = 'fwd'; }
    else { this.stepDir = this.yaw + Math.PI; this.stepBack = true; this.stepSide = 'back'; }
    this.stepDist = this.stepBack ? P.backDist : P.dist;
    this.setState('step');
    this.buffer = null;
    return true;
  }
  tryStart(kind) {
    if (kind === 'light') return this.startMove(this.state === 'step' ? 'stepAttack' : 'L1');
    if (kind === 'heavy') return this.startMove(this.game.time <= this.counterUntil ? 'counter' : 'H');
    if (kind === 'step') return !this.carrying && this.startStep();
    if (kind === 'guard') { this.setState('guard'); return true; }
    if (kind === 'sling') return this.startSling();
    return false;
  }
  // ── 물매: 지팡이를 든 채 오른손으로 돌을 던진다 ──
  startSling() {
    const S = WEAPONS.sling;
    if (!this.game.prog.sling || this.carrying) return false;
    if (this.game.time < (this.slingReadyAt || 0)) return false;
    if (this.game.prog.stones <= 0) {
      if (this.game.time - (this.noStoneTipT ?? -9) > 2) { this.noStoneTipT = this.game.time; this.game.ui.toast('물맷돌이 없다! 바닥의 빛나는 돌을 줍자', 1.8); }
      return false;
    }
    if (this.st < 1) { this.game.ui.staminaBlink(); return false; }
    this.spend(S.stamina);
    this.setState('sling');
    this.buffer = null;
    this.slingFired = false;
    this.slingAim = this.pickSlingAim();
    if (this.slingAim) this.yaw = angleTo(this.pos, this.slingAim.pos);
    if (!this.slingMesh) { this.slingMesh = P.slingMesh(); this.rig.sockets.handR.add(this.slingMesh); }
    this.slingMesh.visible = true;
    return true;
  }
  // 겨눌 대상: 고정 대상 → 스틱(또는 바라보는) 방향 ±70° 안에서 가까운 적·과녁
  pickSlingAim() {
    const S = WEAPONS.sling;
    const T = this.target();
    if (T) return T;
    const mv = this.game.worldMove();
    const dir = Math.hypot(mv.x, mv.z) > 0.2 ? Math.atan2(mv.x, mv.z) : this.yaw;
    let best = null, bs = 1e9;
    const cands = [...this.game.combat.enemies.filter((e) => e.alive && !e.removed && e.active !== false), ...this.game.combat.slingTargets.filter((t) => !t.done)];
    for (const e of cands) {
      const d = dist(this.pos, e.pos);
      if (d > S.aimRange) continue;
      const da = Math.abs(wrap(angleTo(this.pos, e.pos) - dir));
      if (da > Math.PI * 0.39) continue;
      const sc = d + da * 6;
      if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }

  // 입력 모으기: 미리 누른 입력을 기억한다 (타격 정지 중에도 불림)
  collectInput(input, dt) {
    if (input.pressed('guard')) {
      const now = performance.now() / 1000;
      const lag = Math.min(0.05, Math.max(0, now - (input.downAt.guard || now))) * (this.game.timeScale || 1);
      this.guardPressT = this.game.time - lag;
      // 막 떼었다가 다시 누른 연타는 저스트 가드 창이 좁아진다
      this.guardSpam = this.game.time - (this.guardUpT ?? -9) < PLAYER.guard.jgSpamGap;
    }
    if (input.released('guard')) this.guardUpT = this.game.time;
    let press = null;
    if (input.pressed('dodge')) press = 'step';
    else if (input.pressed('sling') && this.game.prog.sling) press = 'sling';
    else if (input.pressed('heavy')) press = 'heavy';
    else if (input.pressed('attack')) press = 'light';
    else if (input.pressed('guard')) press = 'guard';
    if (this.carrying) press = null; // 양을 멘 동안엔 싸우지도 스텝하지도 않음
    if (press) this.buffer = { kind: press, at: this.stateT, state: this.state, age: 0 };
    else if (this.buffer) this.buffer.age += dt;
  }

  update(dt, input) {
    this.stateT += dt;
    this.iframe = Math.max(0, this.iframe - dt);
    this.lockoutT = Math.max(0, this.lockoutT - dt);
    const W = this.weapon || WEAPONS.staff;

    // 컷신 포즈·쓰러짐은 오른손에, 나머지는 양손 파지
    this.setMount(this.state === 'dead' || (this.locked && this.pose) ? 'hand' : 'grip');

    if (this.locked) {
      // 컷신 중: 걷기 명령만 처리
      const walking = this.updateWalk(dt);
      if (!walking) this.anim.move = Math.max(0, this.anim.move - dt * 6);
      this.anim.action = this.pose;
      this.anim.t = Math.min(1, this.anim.t + dt * 1.5);
      this.anim.carry = !!this.carrying && !this.pose;
      this.anim.staff = this.mount === 'grip' && !this.carrying ? STAFF_POSES.stance : null;
      this.anim.freeL = false;
      if (this.state !== 'idle' && this.state !== 'dead') { this.state = 'idle'; this.stateT = 0; }
      this.curPose = STAFF_POSES.stance;
      poseHumanoid(this.rig, this.anim);
      this.applyVisual(dt);
      return;
    }

    const mv = this.game.worldMove();
    const mlen = Math.hypot(mv.x, mv.z);

    if (this.state === 'dead') {
      this.anim.action = 'down'; this.anim.staff = null;
      this.anim.t = Math.min(1, this.anim.t + dt);
      poseHumanoid(this.rig, this.anim);
      this.applyVisual(dt);
      return;
    }

    if (input.pressed('heal')) this.useFig();
    this.updateStamina(dt);

    this.collectInput(input, dt);
    const B = this.buffer;
    const guardHeld = input.isHeld('guard') && !this.carrying;
    const t = this.stateT;
    const T = this.target();

    // ── 상태별 처리 ──
    let speed = 0, faceT = false;
    switch (this.state) {
      case 'idle': {
        speed = this.carrying ? PLAYER.carrySpeed : PLAYER.speed;
        if (B && this.lockoutT > 0 && (B.kind === 'light' || B.kind === 'heavy')) this.buffer = null; // 콤보 종료 잠금
        else if (B && B.age < 0.2) { if (this.tryStart(B.kind)) break; this.buffer = null; }
        if (guardHeld) { this.setState('guard'); break; }
        faceT = !!T;
        break;
      }
      case 'attack': {
        const m = this.move;
        const S = m.startup, A = m.active, R = m.recovery + this.extraRec, total = S + A + R;
        // 방향: 처음 0.1초는 대상 쪽으로 바로, 나머지 준비 동작은 초당 90°까지, 판정 중엔 고정
        const aim = this.aimAt && this.aimAt.alive ? this.aimAt : null;
        if (aim && t < S) {
          const want = angleTo(this.pos, aim.pos);
          this.yaw = t < 0.1 ? turnTo(this.yaw, want, dt * 30) : turnTo(this.yaw, want, dt * Math.PI / 2);
        }
        // 체중을 실어 내딛기 (준비 후반 ~ 판정 끝)
        const l0 = S * 0.55, l1 = S + A;
        if (t > l0 && t <= l1 + dt && this.lungeLeft > 0) {
          const step = Math.min(this.lungeLeft, m.lunge * dt / (l1 - l0));
          // 상대 몸에 파고들지 않게
          const nearE = aim && dist(this.pos, aim.pos) < aim.radius + this.radius + 0.35;
          if (!nearE) { const f = this.forward(); this.pos.x += f.x * step; this.pos.z += f.z * step; }
          this.lungeLeft -= step;
        }
        // 판정
        if (t >= S && t - dt < S + A) this.game.combat.staffSweep(this, m);
        else this.prevPts = this.staffPoints(this.prevPts);
        // 헛치기: 판정이 끝났는데 아무것도 못 맞혔으면 회복이 길어짐
        if (t >= S + A && !this.hitDone) { this.hitDone = true; if (!this.hitAny && m.whiff) this.extraRec = m.whiff; }
        // 연결
        if (m.id === 'L2' || m.thrust) { if (B && (B.kind === 'light' || B.kind === 'heavy')) this.buffer = null; }
        const ch = m.chain;
        const cur = this.buffer;
        if (ch && cur && (cur.kind === 'light' || cur.kind === 'heavy')) {
          if (cur.state !== 'attack' || cur.at < ch.from || cur.at > ch.to) this.buffer = null;
          else if (t >= ch.at) { if (this.startMove(cur.kind === 'light' ? ch.light : ch.heavy)) break; this.buffer = null; }
        }
        const sc = m.thrust ? (this.hitAny ? m.stepCancelOnHit : null) : m.stepCancel;
        if (cur && cur.kind === 'step' && cur.age < 0.3 && sc != null && t >= sc) { if (this.startStep()) break; }
        if (!m.thrust && t >= m.guardCancel && (guardHeld || (cur && cur.kind === 'guard'))) { this.setState('guard'); break; }
        if (t >= total) {
          if (m.lockout) this.lockoutT = m.lockout;
          this.setState(guardHeld ? 'guard' : 'idle');
        }
        break;
      }
      case 'guard':
        speed = PLAYER.speed * PLAYER.guard.moveMult;
        faceT = !!T;
        if (!guardHeld) { this.setState('idle'); break; }
        if (B && B.kind !== 'guard' && B.age < 0.2) { if (this.tryStart(B.kind)) break; this.buffer = null; }
        break;
      case 'guardHit':
        if (t >= PLAYER.guard.blockStun) this.setState(guardHeld ? 'guard' : 'idle');
        break;
      case 'jg':
        // 튕겨낸 직후: 바로 반격할 수 있다
        if (B && (B.kind === 'light' || B.kind === 'heavy' || B.kind === 'step')) { if (this.tryStart(B.kind)) break; this.buffer = null; }
        if (t >= PLAYER.guard.jgTime) this.setState(guardHeld ? 'guard' : 'idle');
        break;
      case 'guardBreak':
        this.buffer = null;
        if (t >= PLAYER.guard.breakTime) this.setState('idle');
        break;
      case 'step': {
        const P = PLAYER.step;
        if (t < P.time) {
          const k = t / P.time, k0 = Math.max(0, (t - dt) / P.time);
          const d = this.stepDist * ((2 * k - k * k) - (2 * k0 - k0 * k0));
          this.pos.x += Math.sin(this.stepDir) * d; this.pos.z += Math.cos(this.stepDir) * d;
          if (T) this.yaw = turnTo(this.yaw, angleTo(this.pos, T.pos), dt * 10);
          if (B && B.at < P.bufferFrom && B.state === 'step') this.buffer = null; // 너무 이른 입력은 버림
        } else {
          const cur = this.buffer;
          if (cur && cur.kind === 'light') { if (this.tryStart('light')) { this.lastStepEnd = this.game.time; break; } }
          if (guardHeld || (cur && cur.kind === 'guard')) { this.lastStepEnd = this.game.time; this.setState('guard'); break; }
          if (cur && cur.kind === 'step' && t >= P.nextAt) { this.lastStepEnd = this.game.time; if (this.startStep()) break; }
          if (cur && cur.kind === 'heavy') this.buffer = null;
          if (t >= P.time + P.recovery) { this.lastStepEnd = this.game.time; this.setState('idle'); }
        }
        break;
      }
      case 'sling': {
        const S = WEAPONS.sling;
        const aim = this.slingAim && (this.slingAim.alive !== false) && !this.slingAim.done ? this.slingAim : null;
        if (aim && !this.slingFired) this.yaw = turnTo(this.yaw, angleTo(this.pos, aim.pos), dt * 12);
        if (!this.slingFired && t >= S.windup) {
          this.slingFired = true;
          this.game.combat.fireStone(this, aim);
          this.game.addStones(-1);
          this.slingReadyAt = this.game.time + S.cooldown;
        }
        const cur = this.buffer;
        if (this.slingFired && cur && cur.kind === 'step' && cur.age < 0.3) { if (this.startStep()) break; }
        if (t >= S.windup + S.recovery) this.setState(guardHeld ? 'guard' : 'idle');
        break;
      }
      case 'recoil': // 바위·벽에 지팡이가 튕김
        if (t >= 0.35) this.setState('idle');
        break;
      case 'hurt':
        if (t > 0.3) this.setState('idle');
        break;
    }

    // ── 이동 ──
    if (speed > 0 && mlen > 0.05) {
      if (faceT && T) {
        // 고정 중: 상대를 바라본 채 옆·뒤로 걷기
        speed *= 0.75;
        this.yaw = turnTo(this.yaw, angleTo(this.pos, T.pos), dt * 14);
      } else this.yaw = turnTo(this.yaw, Math.atan2(mv.x, mv.z), dt * (this.state === 'guard' ? 5 : 14));
      this.pos.x += mv.x * speed * dt;
      this.pos.z += mv.z * speed * dt;
      this.anim.move = Math.min(1, mlen) * (speed / PLAYER.speed);
      this.anim.phase += dt * speed * 2.3 * Math.min(1, mlen + 0.3);
    } else {
      if (faceT && T) this.yaw = turnTo(this.yaw, angleTo(this.pos, T.pos), dt * 10);
      this.anim.move = Math.max(0, this.anim.move - dt * 8);
    }
    // 넉백
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.vel.x *= Math.exp(-dt * 10); this.vel.z *= Math.exp(-dt * 10);
    this.game.world.resolve(this.pos, this.radius);

    // ── 애니메이션 ──
    this.curPose = this.carrying ? null : this.staffPose();
    this.anim.staff = this.curPose;
    this.anim.staffFront = W.grip ? W.grip.front : 0.45;
    this.anim.freeL = !!(this.game.torchMesh && this.game.torchMesh.visible);
    this.anim.action = this.state === 'hurt' ? 'hurt' : null;
    this.anim.t = this.state === 'hurt' ? Math.min(1, t / 0.3) : 1;
    this.anim.carry = !!this.carrying;
    poseHumanoid(this.rig, this.anim);
    if (this.slingMesh) this.slingMesh.visible = this.state === 'sling';
    if (this.state === 'sling') {
      // 오른팔을 머리 위로 들어 돌리다가 앞으로 내던짐
      const S = WEAPONS.sling, aR = this.rig.joints.armR;
      if (t < S.windup) aR.rotation.set(-2.7 + Math.sin(t * 34) * 0.25, Math.cos(t * 34) * 0.4, -0.35);
      else { const k = Math.min(1, (t - S.windup) / 0.12); aR.rotation.set(-2.7 + k * 2.0, 0, -0.35 + k * 0.25); }
      this.rig.joints.spine.rotation.y = t < S.windup ? -0.35 : -0.35 + Math.min(1, (t - S.windup) / 0.12) * 0.6;
    }
    if (this.state === 'step') {
      // 스텝 방향으로 몸을 기울임
      const k = Math.sin(Math.min(1, t / PLAYER.step.time) * Math.PI);
      const rel = wrap(this.stepDir - this.yaw);
      this.rig.body.rotation.x = Math.cos(rel) * 0.22 * k;
      this.rig.body.rotation.z = -Math.sin(rel) * 0.22 * k;
      this.rig.body.position.y = -0.08 * k;
    }
    if (this.state === 'recoil') this.rig.body.rotation.x = -0.12 * (1 - t / 0.35);
    // 무적 깜빡임 (피격 뒤만)
    this.rig.root.visible = !(this.iframe > 0 && this.state !== 'step' && Math.floor(this.iframe * 20) % 2 === 0);
    this.applyVisual(dt);
  }

  // 지금 상태의 지팡이 포즈 (data 시간표 그대로)
  staffPose() {
    const P = STAFF_POSES, t = this.stateT, from = this.poseFrom || P.stance;
    switch (this.state) {
      case 'attack': {
        const m = this.move, S = m.startup, A = m.active, R = m.recovery + this.extraRec, tot = S + A + R;
        let keys;
        if (m.id === 'L1') keys = [[0, from], [S, P.L1wind], [S + A * 0.5, P.L1mid], [S + A, P.L1end], [S + A + 0.12, P.L1foll], [tot, P.stance]];
        else if (m.id === 'L2') keys = [[0, from], [S, P.L2wind], [S + A * 0.5, P.L2mid], [S + A, P.L2end], [S + A + 0.15, P.L2foll], [tot, P.stance]];
        else keys = [[0, from], [S * 0.65, P.Hpull], [S, P.Hhold], [S + A * 0.6, P.Hext], [S + A + 0.15 + this.extraRec, P.Hext], [tot, P.stance]];
        return staffTrack(keys, t);
      }
      case 'guard': return staffTrack([[0, from], [0.08, P.guard]], t);
      case 'guardHit': return staffTrack([[0, from], [0.05, P.guardHit], [PLAYER.guard.blockStun, P.guard]], t);
      case 'jg': return staffTrack([[0, from], [0.04, P.jg], [PLAYER.guard.jgTime + 0.08, P.guard]], t);
      case 'guardBreak': { const bt = PLAYER.guard.breakTime; return staffTrack([[0, from], [0.12, P.broken], [bt * 0.75, P.broken], [bt, P.stance]], t); }
      case 'recoil': return staffTrack([[0, from], [0.06, mixStaffPose(from, P.stance, 0.3)], [0.35, P.stance]], t);
      default: return staffTrack([[0, from], [0.15, P.stance]], t);
    }
  }

  // 지팡이 판정 점들의 월드 좌표
  staffPoints(out) {
    const g = this.rig.sockets.grip;
    out = out || STAFF_SAMPLES.map(() => new THREE.Vector3());
    STAFF_SAMPLES.forEach((s, i) => { out[i].set(0, -s, 0); g.localToWorld(out[i]); });
    return out;
  }

  // 양을 어깨에 메기
  carry(sheepActor) {
    this.carrying = sheepActor;
    if (this.weaponMesh) this.weaponMesh.visible = !sheepActor; // 업는 동안 지팡이는 숨김
    if (sheepActor) {
      sheepActor.carried = true;
      this.rig.joints.spine.add(sheepActor.rig.root);
      sheepActor.rig.root.position.set(0, 0.22, -0.12);
      sheepActor.rig.root.rotation.set(0, Math.PI / 2, 0);
    }
  }
  drop(x, z) {
    const s = this.carrying;
    if (!s) return;
    this.carrying = null;
    if (this.weaponMesh) this.weaponMesh.visible = true;
    s.carried = false;
    this.game.scene.add(s.rig.root);
    s.setPos(x, z, this.yaw);
  }
}

// ───────────── 양 (개별 리그: 따라오는 양, 하얀귀) ─────────────
export class Sheep extends Actor {
  constructor(game, rig, name) {
    super(game, rig, 0.4);
    this.name = name;
    this.follow = null;     // 따라갈 대상
    this.target = null;     // 이동 목표
    this.speed = 2.5;
    this.state = null;      // 'sleep' | 'stuck' | 'graze' | 'flee'
    this.carried = false;
    this.heldBy = null;
  }
  update(dt) {
    if (this.carried) {
      this.anim.move = 0; this.anim.action = null;
      poseQuad(this.rig, this.anim);
      return;
    }
    if (this.heldBy) {
      this.anim.action = null; this.anim.move = 0;
      poseQuad(this.rig, this.anim);
      return;
    }
    let goal = this.target;
    if (this.follow) {
      const d = dist(this.pos, this.follow.pos);
      goal = d > 1.8 ? this.follow.pos : null;
    }
    if (goal) goal = this.game.world.steer(this, goal);
    let moving = false;
    if (goal && this.state !== 'stuck' && this.state !== 'sleep') {
      const d = dist(this.pos, goal);
      if (d > 0.3) {
        this.face(goal, dt * 6);
        const sp = Math.min(d * 2, this.follow ? Math.min(6, 1.5 + dist(this.pos, this.follow.pos)) : this.speed);
        this.pos.x += Math.sin(this.yaw) * sp * dt;
        this.pos.z += Math.cos(this.yaw) * sp * dt;
        this.anim.phase += dt * sp * 4;
        this.anim.move = Math.min(1, sp / 2);
        moving = true;
      } else if (this.target === goal) this.target = null;
    }
    if (!moving) this.anim.move = Math.max(0, this.anim.move - dt * 5);
    this.game.world.resolve(this.pos, this.radius);
    this.anim.action = this.state === 'sleep' ? 'sleep' : this.state === 'stuck' ? 'stun' : (!moving && Math.sin(this.anim.idle * 0.7) > 0.3 ? 'graze' : null);
    this.anim.t = 1;
    poseQuad(this.rig, this.anim);
    this.applyVisual(dt);
  }
}

// ───────────── 양 떼 (합친 메시, 우리 안을 어슬렁) ─────────────
export class Flock {
  constructor(game, n, center, radius) {
    this.game = game;
    this.sheep = [];
    this.center = center;
    this.radius = radius;
    this.sleeping = false;
    for (let i = 0; i < n; i++) {
      const m = P.flockSheepMesh();
      game.scene.add(m);
      const s = { mesh: m, x: 0, z: 0, tx: 0, tz: 0, yaw: Math.random() * TAU, wait: Math.random() * 3, bob: Math.random() * 10, scatter: null };
      this.sheep.push(s);
    }
    this.placeAll();
  }
  placeAll(center = this.center, radius = this.radius) {
    this.center = center; this.radius = radius;
    for (const s of this.sheep) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius;
      s.x = s.tx = center.x + Math.cos(a) * r;
      s.z = s.tz = center.z + Math.sin(a) * r;
      s.scatter = null;
      s.sleep = false;
    }
  }
  setVisible(n) { this.sheep.forEach((s, i) => (s.mesh.visible = i < n)); }
  // 놀라서 흩어지기
  scare(from) {
    for (const s of this.sheep) {
      const a = Math.atan2(s.z - from.z, s.x - from.x) + (Math.random() - 0.5);
      s.scatter = 1.2;
      s.tx = this.center.x + Math.cos(a) * this.radius * 0.95;
      s.tz = this.center.z + Math.sin(a) * this.radius * 0.95;
    }
  }
  update(dt) {
    for (const s of this.sheep) {
      if (!s.mesh.visible) continue;
      s.bob += dt;
      const asleep = this.sleeping || s.sleep;
      if (!asleep) {
        const d = Math.hypot(s.tx - s.x, s.tz - s.z);
        const sp = s.scatter ? 4.5 : 0.7;
        if (s.scatter) s.scatter -= dt;
        if (d > 0.2) {
          const want = Math.atan2(s.tx - s.x, s.tz - s.z);
          s.yaw = turnTo(s.yaw, want, dt * 4);
          s.x += Math.sin(s.yaw) * sp * dt;
          s.z += Math.cos(s.yaw) * sp * dt;
        } else {
          s.wait -= dt;
          if (s.wait < 0) {
            s.wait = 2 + Math.random() * 5;
            const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * this.radius;
            s.tx = this.center.x + Math.cos(a) * r;
            s.tz = this.center.z + Math.sin(a) * r;
          }
        }
      }
      s.mesh.position.set(s.x, asleep ? -0.3 : Math.abs(Math.sin(s.bob * 5)) * 0.03, s.z);
      s.mesh.rotation.y = s.yaw;
    }
  }
  remove() { for (const s of this.sheep) this.game.scene.remove(s.mesh); }
}

// ───────────── 적 공통 ─────────────
class Enemy extends Actor {
  constructor(game, rig, def) {
    super(game, rig, def.radius);
    this.def = def;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.state = 'idle';
    this.stateT = 0;
    this.cd = 1;
    this.vel = { x: 0, z: 0 };
    this.indicator = null;
    this.alive = true;
    this.active = true;
    this.posture = 0;       // 자세: 쌓여서 최대치에 닿으면 붕괴
    this.postureT = 0;
    this.freeze = 0;
  }
  setState(s) { this.state = s; this.stateT = 0; this.anim.t = 0; this.struck = false; this.enter = true; this.clearIndicator(); }

  // ── 자세·경직 ──
  // 자세 붕괴·휘청·움찔을 받으면 안 되는 상태 (연출·쓰러짐 등)
  protectedState() { return ['down', 'flee', 'scripted', 'intro', 'finisherWind', 'finisher', 'carry'].includes(this.state); }
  addPosture(n) {
    const P = this.def.posture;
    if (!P || !this.alive || this.protectedState() || this.state === 'broken') return;
    this.posture = Math.min(P.max, this.posture + n * (P.taken ?? 1));
    this.postureT = 0;
    if (this.posture >= P.max) this.breakPosture();
  }
  breakPosture() {
    this.posture = this.def.posture.max;
    this.setState('broken');
    this.game.fx.shake(0.3);
    this.game.fx.spark(this.pos.x, (this.pos.y || 0) + 1.2, this.pos.z, 0xffe070, 14);
    this.game.combat.sfx('posture');
    this.game.ui.toast(this.boss ? `${this.title}의 자세가 무너졌다! 강공격으로 결정타` : '자세가 무너졌다! 강공격으로 제압', 1.8);
  }
  endBroken() { this.posture = Math.min(this.posture, this.def.posture.max * COMBAT.brokenReset); this.afterStagger(); }
  afterStagger() { this.cd = Math.max(this.cd, 0.5); this.setState(this.boss ? 'idle' : 'approach'); }
  // 다윗의 공격에 움찔 (보스는 약공격에 움찔하지 않음)
  flinch(heavy) {
    const P = this.def.posture;
    if (!P || this.protectedState() || ['broken', 'deflected'].includes(this.state)) return;
    // 큰 공격 → 빈틈 흐름을 끊지 않도록 움찔은 쓰지 않는다 (빈틈은 정해진 시간 동안 유지)
    return;
  }
  // 저스트 가드 당함: 자세 피해 + (연속 공격의 마지막이면) 휘청
  onDeflected(atk, last) {
    this.addPosture(atk.jgPosture || 0);
    if (this.state === 'broken' || this.protectedState()) return;
    if (last && atk.deflect) { this.reelTime = atk.deflect; this.setState('deflected'); }
  }
  // 경직 상태 공통 처리. 처리했으면 true (이번 스텝은 여기서 끝)
  stagger(dt, pose) {
    const P = this.def.posture;
    if (P) {
      this.postureT += dt;
      if (this.state !== 'broken' && this.postureT > P.delay && this.posture > 0) {
        const hpK = COMBAT.postureHpScale + (1 - COMBAT.postureHpScale) * (this.hp / this.maxHp);
        this.posture = Math.max(0, this.posture - P.regen * hpK * dt);
      }
    }
    const st = this.state;
    if (st !== 'flinch' && st !== 'deflected' && st !== 'broken') return false;
    let action, t;
    if (st === 'flinch') { action = 'flinch'; t = this.stateT / COMBAT.flinchTime; if (this.stateT >= COMBAT.flinchTime) this.afterStagger(); }
    else if (st === 'deflected') { action = 'reel'; t = this.stateT / (this.reelTime || 0.6); if (this.stateT >= (this.reelTime || 0.6)) this.afterStagger(); }
    else { action = 'broken'; t = 1; if (this.stateT >= P.broken) { this.posture = 0; this.afterStagger(); } }
    this.physics(dt);
    this.followLamb && this.followLamb();
    this.anim.move = Math.max(0, this.anim.move - dt * 5);
    this.anim.action = action;
    this.anim.t = Math.min(1, t);
    pose(this.rig, this.anim);
    this.applyVisual(dt);
    return true;
  }
  clearIndicator() { if (this.indicator) { this.game.scene.remove(this.indicator); this.indicator = null; } }
  showIndicator(mesh, x, z, yaw = 0) {
    this.clearIndicator();
    mesh.position.x = x; mesh.position.z = z;
    mesh.rotation.z = yaw; // 바닥에 누운 평면이라 z 회전 = 수평 회전
    this.game.scene.add(mesh);
    this.indicator = mesh;
  }
  knock(from, power) {
    const a = angleTo(from, this.pos);
    const k = power / (this.def.radius * 2);
    this.vel.x += Math.sin(a) * k; this.vel.z += Math.cos(a) * k;
  }
  physics(dt) {
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.vel.x *= Math.exp(-dt * 8); this.vel.z *= Math.exp(-dt * 8);
    this.game.world.resolve(this.pos, this.radius);
  }
  chase(target, speed, dt, stopAt = 0) {
    // 막혀 있으면 길찾기 경로를 따라 돌아간다
    const goal = this.game.world.steer(this, target);
    this.face(goal, dt * 6);
    const d = dist(this.pos, target);
    if (d > stopAt) {
      this.pos.x += Math.sin(this.yaw) * speed * dt;
      this.pos.z += Math.cos(this.yaw) * speed * dt;
      this.anim.move = Math.min(1, speed / 3);
      this.anim.phase += dt * speed * 2.6;
    } else this.anim.move = Math.max(0, this.anim.move - dt * 5);
    return d;
  }
  // 큰 공격 뒤 빈틈인가 (이때만 유효타)
  isOpen() { return COMBAT.openStates.includes(this.state); }
  // 큰 공격을 마친 뒤 멈춤
  startOpening() {
    this.setState('opening');
    this.vel.x = this.vel.z = 0;
    if (!this.game.openTipShown) { this.game.openTipShown = true; this.game.ui.prompt('큰 공격 뒤 멈춘 지금이 빈틈! 이때 때려야 제대로 들어간다', 3); }
  }
  // 빈틈 동안: 숨을 몰아쉬며 멈춰 있음 (노란 원 표시). 처리했으면 true
  opening(dt, pose, action) {
    if (this.state !== 'opening') return false;
    const T = this.def.opening || 2;
    if (!this.indicator) this.showIndicator(P.groundCircle((this.def.radius || 0.6) + 0.5, 0xffd040), this.pos.x, this.pos.z);
    this.indicator.position.set(this.pos.x, (this.pos.y || 0) + 0.06, this.pos.z);
    this.indicator.material.opacity = 0.25 + 0.2 * Math.abs(Math.sin(this.stateT * 6));
    this.physics(dt);
    this.followLamb && this.followLamb();
    this.anim.move = Math.max(0, this.anim.move - dt * 5);
    this.anim.action = action;
    this.anim.t = 1;
    pose(this.rig, this.anim);
    this.rig.body.position.y = -0.04 * Math.abs(Math.sin(this.stateT * 4)); // 거친 숨
    this.applyVisual(dt);
    if (this.stateT >= T) { this.rig.body.position.y = 0; this.cd = Math.max(this.cd || 0, 0.6); this.setState(this.boss ? 'idle' : 'approach'); }
    return true;
  }
  // 반환: 실제로 입힌 피해
  hurt(dmg, from, knock) {
    if (!this.alive) return 0;
    if (this.isOpen()) dmg *= COMBAT.openMult;
    else {
      // 빈틈이 아니면 거의 막힌다
      dmg *= COMBAT.guardedMult;
      knock *= 0.3;
      this.game.combat.sfx('block');
      if (!this.slingHit && this.game.time - (this.game.guardTipT ?? -9) > 5) { this.game.guardTipT = this.game.time; this.game.ui.toast('막혔다! 큰 공격 뒤 빈틈을 노리자', 1.6); }
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.pulse();
    this.knock(from, knock);
    if (this.hp <= 0) this.onDefeat();
    return dmg;
  }
  remove() { this.clearIndicator(); super.remove(); }
}

// ───────────── 도둑 ─────────────
export class Thief extends Enemy {
  constructor(game, rig, opts = {}) {
    super(game, rig, ENEMIES.thief);
    this.lamb = opts.lamb || null; // 들고 있는 양
    this.leader = !!opts.leader;
    this.fleeTo = opts.fleeTo || { x: -66, z: 30 };
    this.setState(this.lamb ? 'carry' : 'approach');
    this.cd = 0.8 + Math.random();
  }
  hurt(dmg, from, knock) {
    if (this.lamb) { // 양을 든 도둑을 먼저 맞추면 양을 떨어뜨림
      const l = this.lamb;
      this.lamb = null;
      l.heldBy = null;
      this.game.scene.add(l.rig.root);
      l.setPos(this.pos.x + 1, this.pos.z + 0.5, this.yaw);
      l.target = { x: -25, z: 5 };
      this.game.ui.toast('양을 되찾았다!');
      this.setState('approach');
    }
    return super.hurt(dmg, from, knock);
  }
  onDefeat() {
    this.alive = false;
    this.setState('down');
    this.game.fx.spark(this.pos.x, 1, this.pos.z, 0xffffff, 10);
    this.game.gainXP(this.def.xp || 0);
  }
  update(dt) {
    const pl = this.game.player;
    this.stateT += dt;
    this.cd -= dt;
    if (this.stagger(dt, poseHumanoid)) return;
    if (this.opening(dt, poseHumanoid, 'strike2')) return;
    const A = this.atk || this.def.attack;
    const heavy = A === this.def.heavy;
    // 다윗이 오래 방어만 하면 강공격으로 흔든다
    this.plGuardT = ['guard', 'guardHit'].includes(pl.state) ? (this.plGuardT || 0) + dt : 0;
    let action = null;
    switch (this.state) {
      case 'carry': // 양을 안고 달아나려 함
        this.chase(this.fleeTo, 2.2, dt);
        if (dist(this.pos, pl.pos) < 3) this.face(pl.pos, dt * 2);
        action = 'hug';
        break;
      case 'approach': {
        const d = this.chase(pl.pos, this.def.speed, dt, A.range * 0.8);
        // 다른 도둑과 겹치지 않게
        for (const e of this.game.combat.enemies) if (e !== this && e.alive) {
          const dd = dist(this.pos, e.pos);
          if (dd < 1.2 && dd > 0.01) { this.pos.x += (this.pos.x - e.pos.x) / dd * dt * 2; this.pos.z += (this.pos.z - e.pos.z) / dd * dt * 2; }
        }
        if (d < this.def.attack.range && this.cd <= 0) {
          const H = this.def.heavy;
          // 몽둥이를 크게 한 번 내리치는 공격만 쓴다 (그 뒤 빈틈)
          this.atk = H || this.def.attack;
          this.setState('windup');
        }
        break;
      }
      case 'windup':
        this.face(pl.pos, dt * 3);
        action = heavy ? 'raise2' : 'raise';
        this.anim.t = Math.min(1, this.stateT / A.windup);
        if (!this.indicator) this.showIndicator(P.groundRect(1.6, A.range + 0.3, TELE.block), this.pos.x, this.pos.z, this.yaw + Math.PI);
        this.indicator.position.set(this.pos.x, (this.pos.y || 0) + 0.06, this.pos.z);
        this.indicator.rotation.z = this.yaw + Math.PI;
        this.indicator.material.opacity = 0.15 + 0.35 * this.anim.t;
        if (this.stateT >= A.windup) this.setState('strike');
        break;
      case 'strike': {
        action = heavy ? 'strike2' : 'strike';
        const hitAt = heavy ? 0.1 : 0.08, endAt = heavy ? 0.7 : 0.45;
        this.anim.t = this.stateT / (heavy ? 0.35 : 0.3);
        if (!this.struck && this.stateT > hitAt) {
          this.struck = true;
          this.game.combat.enemyStrike(this, A, this.game.combat.inArc(this, pl.pos, A.range + 0.3, 100));
          if (heavy) this.game.fx.shake(0.1);
        }
        if (this.stateT > endAt && this.state === 'strike') { this.cd = A.cooldown + Math.random() * 0.8; this.atk = null; this.startOpening(); }
        break;
      }
      case 'down':
        action = 'down';
        this.anim.t = this.stateT;
        if (this.stateT > 1.0) this.setState('flee');
        break;
      case 'flee': // 사람은 죽이지 않는다: 일어나서 도망
        this.chase(this.fleeTo, 6, dt);
        action = 'run';
        if (this.stateT > 4) this.remove();
        break;
    }
    if (this.state !== 'down') this.physics(dt);
    if (this.lamb) {
      this.lamb.pos.set(this.pos.x + Math.sin(this.yaw) * 0.45, 0.8, this.pos.z + Math.cos(this.yaw) * 0.45);
      this.lamb.yaw = this.yaw + Math.PI / 2;
      this.lamb.rig.root.rotation.y = this.lamb.yaw;
    }
    this.anim.action = action;
    if (!['raise', 'strike', 'raise2', 'strike2', 'down'].includes(action)) this.anim.t = 1;
    poseHumanoid(this.rig, this.anim);
    this.applyVisual(dt);
  }
}

// ───────────── 곰: 돌진 + 앞발 휘두르기 (+ 일어서 내리찍기) ─────────────
export class Bear extends Enemy {
  constructor(game, rig, opts = {}) {
    super(game, rig, ENEMIES.bear);
    this.lamb = opts.lamb || null;
    this.rescueHits = 0;
    this.chargesLeft = 0;
    this.chargeDir = 0;
    this.setState('intro');
    this.boss = true;
    this.title = '곰';
  }
  get raging() { return this.hp / this.maxHp <= this.def.rageAt; }
  hurt(dmg, from, knock) {
    if (this.state === 'stun') dmg *= 1.5;
    if (this.lamb) {
      // 1단계: 곰 머리를 물매로 맞혀야 양을 놓는다 (지팡이는 피해만 조금)
      if (this.slingHit) {
        this.rescueHits++;
        this.game.ui.toast(`곰이 양을 놓으려 한다 (${this.rescueHits}/${this.def.rescueHits})`);
        if (this.rescueHits >= this.def.rescueHits) this.releaseLamb();
      } else if (this.game.time - (this.slingTipT ?? -9) > 4) {
        this.slingTipT = this.game.time;
        this.game.ui.toast('지팡이로는 양을 놓지 않는다! 물매로 곰 머리를 맞히자');
      }
      dmg *= 0.5;
    }
    return super.hurt(dmg, from, knock * 0.25);
  }
  releaseLamb() {
    const l = this.lamb;
    this.lamb = null;
    l.heldBy = null;
    this.game.scene.add(l.rig.root);
    l.setPos(this.pos.x + 1.5, this.pos.z, 0);
    l.target = { ...this.game.bearLambHide };
    this.game.ui.toast('어린 양이 바위 뒤로 도망쳤다!');
    this.game.emit('bearDroppedLamb');
  }
  onDefeat() {
    this.alive = false;
    this.setState('down');
    if (this.lamb) this.releaseLamb();
    if (this.active !== false && this.game.combat.enemies.includes(this)) this.game.gainXP(this.def.xp || 0);
    this.game.fx.shake(0.6);
  }
  pick() {
    const pl = this.game.player;
    const d = dist(this.pos, pl.pos);
    if (this.raging && Math.random() < 0.55) { this.chargesLeft = 2; return this.setState('chargeWind'); }
    // 가까우면 주로 일어서서 내리찍기(큰 공격 → 빈틈), 가끔 앞발 2연타
    if (d < 3.6) return this.setState(Math.random() < 0.6 ? 'rear' : 'swipe1');
    if (d > 6 && !this.lamb && Math.random() < 0.75) { this.chargesLeft = 1; return this.setState('chargeWind'); }
    this.setState('approach');
  }
  update(dt) {
    const pl = this.game.player;
    const D = this.def;
    this.stateT += dt;
    this.cd -= dt;
    if (this.state === 'scripted') { poseQuad(this.rig, this.anim); this.applyVisual(dt); return; }
    if (this.stagger(dt, poseQuad)) return;
    if (this.opening(dt, poseQuad, 'stun')) return;

    let action = null, t = 1;
    const rageMul = this.raging ? 1.2 : 1;
    switch (this.state) {
      case 'intro':
        action = 'graze';
        break;
      case 'idle':
        this.face(pl.pos, dt * 3);
        if (this.stateT > (this.raging ? 0.35 : 0.7)) this.pick();
        break;
      case 'approach': {
        const d = this.chase(pl.pos, D.speed * rageMul * (this.lamb ? 0.7 : 1), dt, 2.6);
        if (d < 3.2 || this.stateT > 2.5) this.pick();
        break;
      }
      case 'swipe1': case 'swipe2': {
        const S = D.swipe;
        const wind = this.state === 'swipe1' ? S.windup / rageMul : S.gap;
        this.face(pl.pos, dt * 2.5);
        action = this.state === 'swipe1' ? 'swipeL' : 'swipeR';
        if (this.stateT < wind) {
          t = 0.35 * (this.stateT / wind);
          if (!this.indicator) {
            const ind = P.groundRect(2.6, S.range, TELE.block);
            this.showIndicator(ind, this.pos.x, this.pos.z, this.yaw + Math.PI);
          }
          this.indicator.position.set(this.pos.x, 0.06, this.pos.z);
          this.indicator.rotation.z = this.yaw + Math.PI;
          this.indicator.material.opacity = 0.15 + 0.3 * (this.stateT / wind);
        } else {
          t = 0.35 + (this.stateT - wind) / 0.35 * 0.65;
          if (!this.struck) {
            this.struck = true;
            this.clearIndicator();
            const f = this.forward();
            this.pos.x += f.x * 0.6; this.pos.z += f.z * 0.6;
            this.game.combat.enemyStrike(this, S, this.game.combat.inArc(this, pl.pos, S.range + 0.4, 110), this.pos, { last: this.state === 'swipe2' });
            this.game.fx.shake(0.12);
          }
          if (this.stateT > wind + 0.35) {
            if (this.state === 'swipe1') this.setState('swipe2');
            else if (this.state !== 'swipe2') break;
            else { this.cd = S.cooldown; this.setState('idle'); }
          }
        }
        break;
      }
      case 'rear': { // 일어서서 포효 후 내리찍기 (원형 범위)
        action = 'rear';
        const Rr = D.rear;
        const wind = Math.max(COMBAT.minTelegraph, Rr.windup / rageMul);
        const f = this.forward();
        const cx = this.pos.x + f.x * 1.8, cz = this.pos.z + f.z * 1.8;
        if (this.stateT < wind) {
          t = this.stateT / wind;
          if (!this.indicator) { this.showIndicator(P.groundCircle(Rr.radius, TELE.unblock), cx, cz); this.game.combat.warn(this); }
          this.indicator.material.opacity = 0.2 + 0.35 * t * (0.7 + 0.3 * Math.sin(this.stateT * 20));
        } else {
          action = 'crouch'; t = 1;
          if (!this.struck) {
            this.struck = true;
            this.clearIndicator();
            this.game.fx.ring(cx, cz, Rr.radius, 0xd8b890);
            this.game.fx.shake(0.4);
            this.game.combat.enemyStrike(this, Rr, Math.hypot(pl.pos.x - cx, pl.pos.z - cz) < Rr.radius + pl.radius, { x: cx, z: cz });
          }
          if (this.stateT > wind + 0.5) { this.cd = 1; this.startOpening(); }
        }
        break;
      }
      case 'chargeWind': {
        const C = D.charge;
        action = 'windup';
        t = Math.min(1, this.stateT / C.windup);
        const lock = this.stateT < C.windup * 0.7;
        if (lock) this.face(pl.pos, dt * 6);
        if (!this.indicator) { this.showIndicator(P.groundRect(2.4, 16, TELE.unblock), this.pos.x, this.pos.z, this.yaw + Math.PI); this.game.combat.warn(this); }
        this.indicator.position.set(this.pos.x, 0.06, this.pos.z);
        this.indicator.rotation.z = this.yaw + Math.PI;
        this.indicator.material.opacity = (0.15 + 0.3 * t) * (0.75 + 0.25 * Math.sin(this.stateT * 20));
        if (this.stateT >= Math.max(COMBAT.minTelegraph, C.windup / (this.chargesLeft === 1 && this.raging ? 1.4 : 1))) { this.chargeDir = this.yaw; this.setState('charge'); }
        break;
      }
      case 'charge': {
        const C = D.charge;
        action = 'charge';
        this.yaw = this.chargeDir;
        const sp = C.speed * rageMul;
        this.pos.x += Math.sin(this.yaw) * sp * dt;
        this.pos.z += Math.cos(this.yaw) * sp * dt;
        this.anim.phase += dt * 22; this.anim.move = 1;
        if (!this.struck && dist(this.pos, pl.pos) < this.radius + pl.radius + 0.3) {
          const r = this.game.combat.enemyStrike(this, C, true);
          this.struck = r !== 'dodged' && r !== 'miss';
        }
        const f = this.forward();
        if (this.game.world.hitsObstacle(this.pos.x + f.x * 0.8, this.pos.z + f.z * 0.8, this.radius, ['bigrock', 'rock', 'ridge'])) {
          this.game.fx.shake(0.5);
          this.game.fx.ring(this.pos.x + f.x * 1.2, this.pos.z + f.z * 1.2, 2, 0xd8c8a0);
          this.game.ui.toast('곰이 바위에 부딪혀 기절했다! 지금 공격!');
          this.chargesLeft = 0;
          this.setState('stun');
          this.addPosture(D.rockPosture || 0);
        } else if (this.stateT > C.maxTime) {
          this.chargesLeft--;
          if (this.chargesLeft > 0) this.setState('chargeWind');
          else { this.cd = 0.8; this.setState('skid'); }
        }
        break;
      }
      case 'skid':
        action = 'windup'; t = 1 - Math.min(1, this.stateT / 0.8);
        if (this.stateT > 0.8) this.setState('idle');
        break;
      case 'stun':
        action = 'stun';
        if (this.stateT > D.charge.stun) this.setState('idle');
        break;
      case 'down':
        action = 'down'; t = this.stateT;
        break;
    }
    if (this.state !== 'charge' && this.state !== 'down') this.physics(dt);
    else if (this.state === 'charge') this.game.world.resolve(this.pos, this.radius);
    this.followLamb();
    this.anim.action = action;
    this.anim.t = t;
    poseQuad(this.rig, this.anim);
    this.applyVisual(dt);
  }
  followLamb() {
    if (!this.lamb) return;
    const m = this.rig.sockets.mouth.getWorldPosition(new THREE.Vector3());
    this.lamb.pos.set(m.x, Math.max(0.2, m.y - 0.45), m.z);
    this.lamb.yaw = this.yaw + Math.PI / 2;
    this.lamb.rig.root.rotation.y = this.lamb.yaw;
  }
}

// ───────────── 사자: 돌진 + 도약 덮치기 + 할퀴기 3연타 + 마무리 타이밍 ─────────────
export class Lion extends Enemy {
  constructor(game, rig, opts = {}) {
    super(game, rig, ENEMIES.lion);
    this.lamb = opts.lamb || null;
    this.enraged = false;
    this.leap = null;
    this.clawN = 0;
    this.setState('intro');
    this.boss = true;
    this.title = '사자';
    this.finisherDone = false;
  }
  get spd() { return this.enraged ? this.def.enrageSpeed : 1; }
  hurt(dmg, from, knock) {
    if (this.state === 'finisher' || this.state === 'finisherWind') return 0;
    if (this.state === 'stun' || this.state === 'recover') dmg *= 1.4;
    // 체력이 바닥나면 마지막 덮치기 (마무리 타이밍 입력). 빈틈 규칙을 적용한 피해로 판단
    const eff = dmg * (this.isOpen() ? COMBAT.openMult : COMBAT.guardedMult);
    if (this.hp - eff <= 0 && !this.finisherDone) {
      this.hp = 1;
      this.pulse();
      this.setState('finisherWind');
      return dmg;
    }
    const r = super.hurt(dmg, from, knock * 0.3);
    if (!this.enraged && this.hp / this.maxHp <= this.def.enrageAt) this.enrage();
    return r;
  }
  enrage() {
    this.enraged = true;
    if (this.lamb) {
      const l = this.lamb;
      this.lamb = null;
      l.heldBy = null;
      this.game.scene.add(l.rig.root);
      l.setPos(this.pos.x + 1.4, this.pos.z + 0.6, 0);
      l.target = { ...this.game.lionLambHide };
      this.game.ui.toast('사자가 하얀귀를 놓았다! 사자가 더 빨라진다!');
      this.game.emit('lionDroppedLamb');
    }
  }
  onDefeat() {
    this.alive = false;
    this.setState('down');
    this.game.fx.shake(0.6);
    this.game.gainXP(this.def.xp || 0);
  }
  pick() {
    const pl = this.game.player;
    const d = dist(this.pos, pl.pos);
    const r = Math.random();
    if (d < 3.0 && r < 0.35) { this.clawN = 0; return this.setState('clawWind'); }
    if (d < 3.0 && r < 0.85) return this.setState('pounceWind'); // 가까워도 주로 덮치기(큰 공격 → 빈틈)
    // 바위 오르기: 바위 위에서 덮칠 준비 → 물매로 맞히면 떨어져 기절
    const rock = this.game.prog.sling && this.game.time > (this.perchCd || 0) && this.nearestRock();
    if (rock && d > 3 && r < 0.3) { this.perchRock = rock; this.perchCd = this.game.time + 9; return this.setState('perchJump'); }
    if (d > 4 && r < 0.5) return this.setState('pounceWind');
    if (d > 6) return this.setState('chargeWind');
    if (r < 0.35) return this.setState('pounceWind');
    this.setState('approach');
  }
  nearestRock() {
    const rocks = this.game.world.arenaRocks || [];
    let best = null, bd = 16;
    for (const k of rocks) { const d = dist(this.pos, k); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  onSling() {
    if (this.state !== 'perch' && this.state !== 'perchJump') return;
    // 바위 위에서 맞으면 떨어져 기절
    this.clearIndicator();
    this.leapY0 = 0;
    const pl = this.game.player, a = angleTo(this.perchRock, pl.pos);
    this.fallFrom = { x: this.pos.x, z: this.pos.z, y: this.perchH || 0 };
    this.fallTo = { x: this.perchRock.x + Math.sin(a) * 2.6, z: this.perchRock.z + Math.cos(a) * 2.6 };
    this.game.ui.toast('사자가 바위에서 떨어졌다! 지금 공격!');
    this.game.fx.shake(0.3);
    this.setState('fall');
  }
  update(dt) {
    const pl = this.game.player;
    const D = this.def;
    this.stateT += dt;
    if (this.state === 'scripted') { poseQuad(this.rig, this.anim); this.applyVisual(dt); return; }
    if (this.stagger(dt, poseQuad)) { this.rig.root.position.y = 0; return; }
    if (this.opening(dt, poseQuad, 'stun')) return;
    const entered = this.enter;
    this.enter = false;
    let action = null, t = 1;
    switch (this.state) {
      case 'intro':
        this.face(pl.pos, dt * 3);
        break;
      case 'idle':
        this.face(pl.pos, dt * 4);
        // 옆으로 맴돌기
        { const a = angleTo(pl.pos, this.pos) + dt * 0.6; const d = dist(this.pos, pl.pos);
          this.pos.x = pl.pos.x + Math.sin(a) * d; this.pos.z = pl.pos.z + Math.cos(a) * d;
          this.anim.move = 0.5; this.anim.phase += dt * 4; }
        if (this.stateT > 0.6 / this.spd) this.pick();
        break;
      case 'approach': {
        const d = this.chase(pl.pos, D.speed * this.spd, dt, 2.2);
        if (d < 2.6 || this.stateT > 2) this.pick();
        break;
      }
      case 'clawWind': {
        const C = D.claw;
        action = 'windup';
        const wind = (this.clawN === 0 ? C.windup : C.gap) / this.spd;
        t = this.stateT / wind;
        this.face(pl.pos, dt * 5);
        if (!this.indicator) this.showIndicator(P.groundRect(2.0, C.range, TELE.block), this.pos.x, this.pos.z, this.yaw + Math.PI);
        this.indicator.position.set(this.pos.x, 0.06, this.pos.z);
        this.indicator.rotation.z = this.yaw + Math.PI;
        if (this.stateT >= wind) this.setState('claw');
        break;
      }
      case 'claw': {
        const C = D.claw;
        action = this.clawN % 2 ? 'swipeR' : 'swipeL';
        t = this.stateT / 0.25;
        if (!this.struck) {
          this.struck = true;
          const f = this.forward();
          this.pos.x += f.x * 0.7; this.pos.z += f.z * 0.7;
          this.game.combat.enemyStrike(this, C, this.game.combat.inArc(this, pl.pos, C.range + 0.3, 100), this.pos, { last: this.clawN === 2 });
        }
        if (this.stateT > 0.25 && this.state === 'claw') {
          this.clawN++;
          if (this.clawN < 3) this.setState('clawWind');
          else this.setState('recover');
        }
        break;
      }
      case 'chargeWind': {
        const C = D.charge;
        action = 'windup'; t = Math.min(1, this.stateT / C.windup);
        this.face(pl.pos, dt * 6);
        if (!this.indicator) { this.showIndicator(P.groundRect(1.8, 18, TELE.unblock), this.pos.x, this.pos.z, this.yaw + Math.PI); this.game.combat.warn(this); }
        this.indicator.position.set(this.pos.x, 0.06, this.pos.z);
        this.indicator.rotation.z = this.yaw + Math.PI;
        this.indicator.material.opacity = (0.15 + 0.3 * t) * (0.75 + 0.25 * Math.sin(this.stateT * 20));
        if (this.stateT >= Math.max(COMBAT.minTelegraph, C.windup / this.spd)) { this.chargeDir = this.yaw; this.setState('charge'); }
        break;
      }
      case 'charge': {
        const C = D.charge;
        action = 'charge';
        this.yaw = this.chargeDir;
        const sp = C.speed * this.spd;
        this.pos.x += Math.sin(this.yaw) * sp * dt; this.pos.z += Math.cos(this.yaw) * sp * dt;
        this.anim.phase += dt * 24; this.anim.move = 1;
        if (!this.struck && dist(this.pos, pl.pos) < this.radius + pl.radius + 0.3) { const r = this.game.combat.enemyStrike(this, C, true); this.struck = r !== 'dodged' && r !== 'miss'; }
        const f = this.forward();
        if (this.game.world.hitsObstacle(this.pos.x + f.x * 0.7, this.pos.z + f.z * 0.7, this.radius, ['bigrock', 'rock', 'ridge'])) {
          this.game.fx.shake(0.35);
          this.setState('stun');
        } else if (this.stateT > C.maxTime) this.setState('recover');
        break;
      }
      case 'pounceWind': case 'finisherWind': { // 땅에 그림자 원이 뜸
        const Pn = D.pounce;
        const fin = this.state === 'finisherWind';
        action = 'crouch'; t = Math.min(1, this.stateT / Pn.windup);
        if (entered || !this.leap) {
          this.leap = { fx: this.pos.x, fz: this.pos.z, tx: pl.pos.x, tz: pl.pos.z };
          this.showIndicator(P.groundCircle(Pn.radius, fin ? 0xffd040 : 0x220000), pl.pos.x, pl.pos.z);
          this.indicator.material.opacity = 0.2;
          if (fin) this.game.ui.prompt('사자가 마지막으로 덮친다! 그림자가 진해지면 공격!');
          else this.game.combat.warn(this);
        }
        // 그림자는 플레이어를 살짝 따라감 (마지막 순간엔 고정)
        if (this.stateT < Pn.windup * 0.6 / this.spd) {
          this.leap.tx += (pl.pos.x - this.leap.tx) * dt * 3; this.leap.tz += (pl.pos.z - this.leap.tz) * dt * 3;
          this.indicator.position.set(this.leap.tx, 0.06, this.leap.tz);
        }
        this.indicator.material.opacity = (fin ? 0.25 : 0.2) + 0.35 * t;
        this.face({ x: this.leap.tx, z: this.leap.tz }, dt * 8);
        if (this.stateT >= (fin ? Pn.windup / this.spd : Math.max(COMBAT.minTelegraph, Pn.windup / this.spd))) {
          const ind = this.indicator; this.indicator = null; // 공중 동안 유지
          this.setState(fin ? 'finisher' : 'pounce');
          this.indicator = ind;
          this.game.scene.add(ind);
          this.leap.fx = this.pos.x; this.leap.fz = this.pos.z;
          if (fin) this.game.combat.openFinisher(D.finisherWindow, this);
        }
        break;
      }
      case 'pounce': case 'finisher': {
        const Pn = D.pounce;
        action = 'leap';
        const air = this.state === 'finisher' ? D.finisherWindow : Pn.air;
        t = Math.min(1, this.stateT / air);
        this.pos.x = this.leap.fx + (this.leap.tx - this.leap.fx) * t;
        this.pos.z = this.leap.fz + (this.leap.tz - this.leap.fz) * t;
        this.rig.root.position.y = Math.sin(t * Math.PI) * 2.6 + (1 - t) * (this.leapY0 || 0);
        if (t >= 1) {
          this.rig.root.position.y = 0;
          this.leapY0 = 0;
          const hitP = Math.hypot(pl.pos.x - this.leap.tx, pl.pos.z - this.leap.tz) < Pn.radius + pl.radius;
          this.clearIndicator();
          this.game.fx.ring(this.leap.tx, this.leap.tz, Pn.radius, 0xd8b890);
          this.game.fx.shake(0.35);
          if (this.state === 'finisher') {
            const ok = this.game.combat.closeFinisher();
            if (ok) { this.finisherDone = true; this.hp = 0; this.onDefeat(); this.game.emit('lionFinished'); break; }
            this.game.combat.enemyStrike(this, Pn, hitP, { x: this.leap.tx, z: this.leap.tz });
            this.hp = Math.round(this.maxHp * 0.15);
            this.game.ui.prompt('타이밍을 놓쳤다! 다시 몰아붙이자.', 2);
            this.leap = null;
            this.setState('recover');
            break;
          } else this.game.combat.enemyStrike(this, Pn, hitP, { x: this.leap.tx, z: this.leap.tz });
          this.leap = null;
          this.startOpening(); // 덮치기(큰 공격) 뒤 빈틈
        }
        break;
      }
      case 'perchJump': { // 가까운 큰 바위 위로 뛰어오름
        action = 'leap';
        const k = this.perchRock;
        if (!this.leap) this.leap = { fx: this.pos.x, fz: this.pos.z };
        const tt = Math.min(1, this.stateT / 0.55);
        const a = angleTo(k, { x: this.leap.fx, z: this.leap.fz });
        const tx = k.x + Math.sin(a) * 0.4, tz = k.z + Math.cos(a) * 0.4;
        this.perchH = 1.9;
        this.pos.x = this.leap.fx + (tx - this.leap.fx) * tt;
        this.pos.z = this.leap.fz + (tz - this.leap.fz) * tt;
        this.pos.y = Math.sin(tt * Math.PI) * 1.4 + tt * this.perchH;
        this.face(pl.pos, dt * 6);
        t = tt;
        if (tt >= 1) { this.leap = null; this.setState('perch'); }
        break;
      }
      case 'perch': { // 바위 위에서 웅크림: 물매로 맞히지 않으면 높이 덮친다
        action = 'crouch'; t = Math.min(1, this.stateT / 2.4);
        this.pos.y = this.perchH;
        this.face(pl.pos, dt * 6);
        if (!this.indicator) {
          this.showIndicator(P.groundCircle(D.pounce.radius * 1.15, 0x220000), pl.pos.x, pl.pos.z);
          this.game.ui.prompt('사자가 바위 위에 올랐다! 물매로 맞혀 떨어뜨리자', 2.5);
        }
        this.indicator.position.set(pl.pos.x, 0.06 + this.game.world.heightAt(pl.pos.x, pl.pos.z), pl.pos.z);
        this.indicator.material.opacity = 0.2 + 0.35 * t;
        if (this.stateT >= 2.6 / this.spd) {
          // 바위에서 덮치기 (일반 도약과 같은 판정)
          this.leap = { fx: this.pos.x, fz: this.pos.z, tx: pl.pos.x, tz: pl.pos.z };
          this.leapY0 = this.perchH;
          const ind = this.indicator; this.indicator = null;
          this.setState('pounce');
          this.indicator = ind;
          this.game.scene.add(ind);
          this.game.combat.warn(this);
        }
        break;
      }
      case 'fall': {
        action = 'stun';
        const tt = Math.min(1, this.stateT / 0.45);
        this.pos.x = this.fallFrom.x + (this.fallTo.x - this.fallFrom.x) * tt;
        this.pos.z = this.fallFrom.z + (this.fallTo.z - this.fallFrom.z) * tt;
        this.pos.y = this.fallFrom.y * (1 - tt * tt);
        if (tt >= 1) { this.pos.y = 0; this.game.fx.ring(this.pos.x, this.pos.z, 1.6, 0xd8b890); this.addPosture?.(25); if (this.state === 'fall') this.setState('stun'); }
        break;
      }
      case 'recover':
        action = 'stun'; t = 1;
        if (this.stateT > D.pounce.recover / this.spd) this.setState('idle');
        break;
      case 'stun':
        action = 'stun';
        if (this.stateT > D.charge.stun + 0.6) this.setState('idle');
        break;
      case 'down':
        action = 'down'; t = this.stateT;
        this.rig.root.position.y = 0;
        break;
    }
    if (!['pounce', 'finisher', 'perchJump', 'perch', 'fall'].includes(this.state) ) {
      const h = this.pos.y - this.game.world.heightAt(this.pos.x, this.pos.z); // 바위 위에서 끊긴 경우 내려옴 (값은 지면 위 높이로 넣음)
      if (h > 0.02) this.pos.y = Math.max(0, h - dt * 8);
    }
    if (!['charge', 'pounce', 'finisher', 'down', 'perchJump', 'perch', 'fall'].includes(this.state)) this.physics(dt);
    else if (this.state === 'charge') this.game.world.resolve(this.pos, this.radius);
    this.followLamb();
    this.anim.action = action;
    this.anim.t = t;
    poseQuad(this.rig, this.anim);
    this.applyVisual(dt);
  }
}

// 사자 입에 문 하얀귀 위치 맞추기
Lion.prototype.followLamb = function () {
  if (!this.lamb) return;
  const m = this.rig.sockets.mouth.getWorldPosition(new THREE.Vector3());
  this.lamb.pos.set(m.x, Math.max(0.2, m.y - 0.4), m.z);
  this.lamb.yaw = this.yaw + Math.PI / 2;
  this.lamb.rig.root.rotation.y = this.lamb.yaw;
};

export async function spawn(game, Cls, slot, ...args) {
  const rig = await createRig(slot);
  return new Cls(game, rig, ...args);
}
