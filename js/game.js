// 게임 본체: 렌더러, 카메라, 루프, 퀘스트에서 쓰는 도우미 함수들
import * as THREE from 'three';
import { World, LIGHTING, LOC } from './world.js';
import { Input } from './engine/input.js';
import { createRig } from './engine/rig.js';
import { Player, NPC, Sheep, Flock, dist } from './actors.js';
import { Combat, FX } from './combat.js';
import { UI } from './ui.js';
import { DIALOGUE } from './data/dialogue.js';
import { PLAYER } from './data/enemies.js';
import { LEVEL, SUB_QUESTS } from './data/progression.js';
import { arrowMarker, torch } from './engine/props.js';
import * as P from './engine/props.js';
import { WEAPONS } from './data/weapons.js';

const SLING_MAX_STONES = WEAPONS.sling.maxStones;

export const ABORT = Symbol('abort');
export const STEP = 1 / 60;

export class Game {
  constructor() {
    const canvas = document.getElementById('c');
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 220);
    this.camTarget = new THREE.Vector3();
    this.camFocus = null;   // 컷신용 카메라 목표 { x, z, zoom }
    this.camZoom = 1;
    this.camYaw = Math.PI;
    this.camPitch = 0.2;
    this.camManualT = 0;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -24; sc.right = sc.top = 24; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);
    this.torchLight = new THREE.PointLight(0xffa850, 0, 18, 1.2);
    this.scene.add(this.torchLight);

    this.input = new Input();
    this.ui = new UI(this);
    this.fx = new FX(this);
    this.combat = new Combat(this);
    this.world = new World(this.scene);
    this.ui.buildMinimap(this.world.mapFeatures);
    this.eastClosed = true;

    this.actors = [];   // 계속 남는 NPC
    this.temp = [];     // 구간마다 지우는 것들 (양, 소품)
    this.listeners = {};
    this.waiters = [];
    this.objectivePos = null;
    this.interactTarget = null;
    this.runId = 0;
    this.time = 0;
    this.stats = { saved: 30, rescued: 0, sub: 0 };
    // 성장 상태 (구간을 넘어가도 유지)
    this.prog = { level: 1, xp: 0, storyHearts: PLAYER.hearts, subs: new Set(), belt: false, healBonus: 0, sling: false, stones: 0 };
    this.interactables = [];
    this.arrow = arrowMarker();
    this.scene.add(this.arrow);

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  async init() {
    this.player = new Player(this, await createRig('david'));
    await this.player.equip('staff');
    this.torchMesh = torch();
    this.torchMesh.position.set(0, -0.62, 0.05);
    this.torchMesh.visible = false;
    this.player.rig.joints.armL.add(this.torchMesh);
    this.jesse = new NPC(this, await createRig('jesse'), '이새');
    this.jonah = new NPC(this, await createRig('jonah'), '요나');
    this.actors.push(this.jesse, this.jonah);
    this.flock = new Flock(this, 29, LOC.fold, LOC.fold.r - 1.6);
    this.ui.hearts(this.player.hp, this.player.maxHp);
    this.ui.figs(this.player.figs);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // 세로 화면에서는 더 멀리서 보아야 좌우가 보인다
    this.viewDist = w / h < 1 ? 1.2 : 1;
  }

  // ── 이벤트 ──
  emit(name) { (this.listeners[name] || []).forEach((f) => f()); this.listeners[name] = []; }
  once(name) { return new Promise((r) => (this.listeners[name] = [...(this.listeners[name] || []), r])); }

  // ── 퀘스트 도우미 (모두 중단(재시작) 가능) ──
  guard(id) { if (id !== this.runId) throw ABORT; }
  async say(key) {
    const id = this.runId;
    const lines = DIALOGUE[key];
    if (!lines) throw new Error('대사 없음: ' + key);
    await this.ui.say(lines);
    this.guard(id);
  }
  // 조건 대기: 게임 루프 안에서 매 프레임 검사한다 (입력·시간이 정확히 맞도록)
  until(fn) {
    const id = this.runId;
    return new Promise((res, rej) => this.waiters.push({ fn, res, rej, id }));
  }
  wait(sec) {
    const end = this.time + sec;
    return this.until(() => this.time >= end);
  }
  runWaiters() {
    const list = this.waiters;
    this.waiters = [];
    for (const w of list) {
      if (w.id !== this.runId) { w.rej(ABORT); continue; }
      let done = false;
      try { done = w.fn(); } catch (e) { w.rej(e); continue; }
      if (done) w.res(); else this.waiters.push(w);
    }
  }
  // 가까이 가서 상호작용 버튼 누르기
  // 가까이 가서 상호작용 버튼 누르기. 여러 개를 동시에 기다릴 수 있다 (가장 가까운 것이 버튼에 뜸)
  interactAt(pos, label, radius = 2.2) {
    const id = this.runId;
    return new Promise((res, rej) => this.interactables.push({ pos, label, radius, res, rej, id }));
  }
  runInteract() {
    this.interactables = this.interactables.filter((it) => { if (it.id !== this.runId) { it.rej(ABORT); return false; } return true; });
    let best = null, bd = Infinity;
    if (!this.player.locked && !this.ui.dlg && !this.ui.choosing) {
      for (const it of this.interactables) {
        const d = dist(this.player.pos, it.pos);
        if (d < it.radius && d < bd) { bd = d; best = it; }
      }
    }
    this.interactTarget = best ? best.label : null;
    if (best && this.input.pressed('interact')) {
      this.interactables = this.interactables.filter((it) => it !== best);
      this.interactTarget = null;
      best.res();
    }
  }
  async choice(title, options) {
    const id = this.runId;
    const r = await this.ui.choice(title, options);
    this.guard(id);
    return r;
  }

  // ── 레벨 ──
  levelHearts() { return LEVEL.heartLevels.filter((l) => this.prog.level >= l).length; }
  attackMult() { return 1 + (this.prog.level - 1) * LEVEL.attackPerLevel; }
  // ── 물맷돌 (투척 아이템) ──
  addStones(n) {
    const before = this.prog.stones;
    this.prog.stones = Math.min(SLING_MAX_STONES, this.prog.stones + n);
    this.ui.stones(this.prog.stones);
    return this.prog.stones - before;
  }
  // 바닥의 빛나는 돌 자리: 가까이 가면 돌 n개, respawn초 뒤 다시 생김
  addStonePickups(points, n = 2, respawn = 12) {
    this.stonePickups = this.stonePickups || [];
    for (const q of points) {
      const m = P.smoothStone(), k = P.glowMarker(0xdfe8ff);
      for (const o of [m, k]) { o.position.set(q.x, this.world.heightAt(q.x, q.z), q.z); this.scene.add(o); }
      this.stonePickups.push({ q, m, k, n, respawn, t: 0 });
    }
  }
  updateStonePickups(dt) {
    if (!this.stonePickups || !this.stonePickups.length || !this.prog.sling) return;
    const p = this.player.pos;
    for (const sp of this.stonePickups) {
      if (sp.t > 0) { sp.t -= dt; if (sp.t <= 0) sp.m.visible = sp.k.visible = true; continue; }
      if (Math.hypot(p.x - sp.q.x, p.z - sp.q.z) < 1.3 && this.prog.stones < SLING_MAX_STONES) {
        const got = this.addStones(sp.n);
        this.ui.toast(`물맷돌 +${got}`, 1.2);
        sp.m.visible = sp.k.visible = false;
        sp.t = sp.respawn;
      }
    }
  }
  refreshStats(fullHeal) {
    const p = this.player;
    p.maxHp = (this.prog.storyHearts + this.levelHearts()) * 2;
    p.hp = fullHeal ? p.maxHp : Math.min(p.hp, p.maxHp);
    this.ui.hearts(p.hp, p.maxHp);
    this.ui.level(this.prog.level, this.prog.xp, LEVEL.xpToNext(this.prog.level), this.prog.level >= LEVEL.max);
    document.body.classList.toggle('has-sling', !!this.prog.sling); // 물매 칸은 해금 뒤에만
    this.ui.stones(this.prog.stones);
  }
  gainXP(n, why) {
    const P = this.prog;
    if (P.level >= LEVEL.max) return;
    P.xp += n;
    this.ui.xpPop(`+${n} 경험치${why ? ' · ' + why : ''}`);
    while (P.level < LEVEL.max && P.xp >= LEVEL.xpToNext(P.level)) {
      P.xp -= LEVEL.xpToNext(P.level);
      P.level++;
      const heart = LEVEL.heartLevels.includes(P.level);
      this.refreshStats(true);
      this.fx.ring(this.player.pos.x, this.player.pos.z, 2.2, 0xffe27a);
      this.fx.spark(this.player.pos.x, 1.4, this.player.pos.z, 0xffe27a, 16);
      this.ui.toast(`레벨 업! Lv ${P.level} · 공격력 +${Math.round(LEVEL.attackPerLevel * 100)}%${heart ? ' · 하트 +1' : ''} · 체력 회복`, 3);
    }
    if (P.level >= LEVEL.max) P.xp = 0;
    this.refreshStats(false);
  }
  setLevelAtLeast(lv) {
    if (this.prog.level >= lv) return;
    this.prog.level = lv; this.prog.xp = 0;
  }
  completeSub(key, rewardText) {
    if (this.prog.subs.has(key)) return;
    this.prog.subs.add(key);
    this.stats.sub = this.prog.subs.size;
    this.subStatus(key, null);
    this.ui.toast(`서브 퀘스트 완료: ${SUB_QUESTS[key]}${rewardText ? ' · ' + rewardText : ''}`, 3.2);
    this.gainXP(50, SUB_QUESTS[key]);
  }
  subStatus(key, text, pos) {
    this.subLines = this.subLines || {};
    this.subMarks = this.subMarks || {};
    if (text) this.subLines[key] = `${SUB_QUESTS[key]}: ${text}`; else delete this.subLines[key];
    if (text && pos) this.subMarks[key] = pos; else delete this.subMarks[key];
    this.ui.subs(Object.values(this.subLines));
  }

  near(pos, r) { return dist(this.player.pos, pos) < r; }

  lock(on) { this.player.locked = on; this.ui.cinema(on); if (on) { this.player.setState('idle'); this.player.vel.x = this.player.vel.z = 0; } }
  focus(p, zoom = 1) { this.camFocus = p ? { x: p.x, z: p.z, zoom } : null; }
  objective(text, pos) { this.ui.objective(text); this.objectivePos = pos || null; }

  setTime(name) {
    const L = LIGHTING[name];
    this.lighting = name;
    this.scene.background = new THREE.Color(L.sky);
    this.scene.fog = new THREE.Fog(...L.fog);
    this.hemi.color.set(L.hemi[0]); this.hemi.groundColor.set(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    this.sun.color.set(L.sun[0]); this.sun.intensity = L.sun[1];
    this.world.fireBase = L.fire;
    this.world.fireLight.intensity = L.fire;
    this.world.lampLight.intensity = L.lamp;
    this.sunOffset = name === 'night' ? new THREE.Vector3(-12, 30, -8) : name === 'evening' || name === 'dawn' ? new THREE.Vector3(-25, 14, 6) : new THREE.Vector3(-10, 30, 12);
  }
  setTorch(on) { this.torchMesh.visible = on; this.torchLight.intensity = on ? 9 : 0; }

  addTemp(obj) { this.temp.push(obj); return obj; }
  async spawnSheep(slot, name, x, z) {
    const s = new Sheep(this, await createRig(slot), name);
    s.setPos(x, z, Math.random() * 6);
    return this.addTemp(s);
  }
  addMesh(mesh, x, z) { mesh.position.set(x, mesh.position.y, z); this.scene.add(mesh); this.temp.push({ mesh }); return mesh; }

  // 구간 재시작 전 정리
  reset() {
    this.runId++;
    for (const t of this.temp) {
      if (t.remove) t.remove();
      else if (t.mesh) this.scene.remove(t.mesh);
    }
    this.temp = [];
    for (const sp of this.stonePickups || []) { this.scene.remove(sp.m); this.scene.remove(sp.k); }
    this.stonePickups = [];
    this.combat.clear();
    this.listeners = {};
    if (this.player.carrying) { this.player.carrying.carried = false; this.player.carrying = null; }
    this.ui.dlg = null;
    document.getElementById('dialog').classList.remove('on');
    this.ui.boss(null);
    this.ui.prompt(null);
    this.ui.qte(false);
    this.ui.interact(null);
    this.focus(null);
    this.objective('');
    this.player.pose = null;
    this.player.hp = this.player.maxHp;
    this.player.iframe = 0;
    this.player.setState('idle');
    Object.assign(this.player, { st: PLAYER.stamina.max, stWait: 0, freeze: 0, buffer: null, lockoutT: 0, counterUntil: -1 });
    this.lockT = null; this.lockOff = false;
    this.player.rig.root.visible = true;
    this.jesse.pose = null; this.jonah.pose = null;
    this.jesse.marker.visible = false;
    this.jesse.walkTarget = this.jonah.walkTarget = null;
    this.player.walkTarget = null;
    this.setTorch(false);
    this.dying = false;
    this.subLines = {};
    this.subMarks = {};
    this.ui.subs([]);
    this.ui.choiceClose();
    this.lock(false);
    this.ui.hearts(this.player.hp, this.player.maxHp);
    this.ui.figs(this.player.figs);
  }

  // ── 메인 루프 ──
  start(runner) {
    this.runner = runner;
    let last = performance.now();
    let acc = 0;
    // 고정 스텝: 계산은 항상 1/60초 단위로 돌린다 (30fps 폰이든 120fps 폰이든 전투 타이밍이 같음).
    // 입력은 그 프레임의 첫 스텝에서만 '눌림'으로 보인다. timeScale: 테스트용 빠르게 감기 (기본 1)
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const ts = this.timeScale || 1;
      acc += dt * ts;
      let n = 0;
      const maxSteps = 5 * ts;
      while (acc >= STEP && n < maxSteps) { this.step(STEP); if (n === 0) this.input.endFrame(); acc -= STEP; n++; }
      if (n >= maxSteps) acc = 0; // 너무 밀리면 버린다 (탭 전환 뒤 등)
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  step(dt) {
    this.time += dt;
    const inDialog = !!this.ui.dlg;
    this.updateLock(inDialog);
    if (this.player.freeze > 0 && !inDialog) { this.player.freeze -= dt; if (!this.player.locked) this.player.collectInput(this.input, dt); } // 타격 정지(히트스톱): 입력은 계속 받음
    else if (!inDialog) this.player.update(dt, this.input);
    else { const l = this.player.locked; this.player.locked = true; this.player.update(dt, this.input); this.player.locked = l; }
    for (const a of this.actors) a.update(dt);
    for (const t of this.temp) if (t.update) t.update(dt);
    if (!inDialog || this.combat.finisher) for (const e of this.combat.enemies) {
      if (e.freeze > 0) { e.freeze -= dt; continue; }
      e.update(dt);
    }
    this.flock.update(dt);
    // 지형 높이: 걷는 캐릭터의 발을 지면에 맞춤 (퀘스트·전투 지점은 모두 0 m라 그곳에서는 변화 없음)
    const W = this.world;
    this.updateStonePickups(dt);
    W.snapToGround(this.player);
    for (const a of this.actors) W.snapToGround(a);
    for (const t of this.temp) if (t.rig && t.pos) W.snapToGround(t);
    for (const e of this.combat.enemies) W.snapToGround(e);
    this.combat.update(dt);
    this.fx.update(dt);
    this.world.update(dt, this.time);
    this.ui.update(dt, this.input);
    this.ui.interact(this.interactTarget && !inDialog ? this.interactTarget : null);
    const boss = this.combat.enemies.find((e) => e.boss && e.alive && e.state !== 'intro');
    this.ui.boss(boss || null);
    this.ui.posture(boss || null);

    // 목표 방향 화살표
    const o = this.objectivePos;
    if (o && !this.player.locked && dist(this.player.pos, o) > 5) {
      this.arrow.visible = true;
      this.arrow.position.set(this.player.pos.x, this.world.heightAt(this.player.pos.x, this.player.pos.z) + 0.08, this.player.pos.z);
      this.arrow.rotation.y = Math.atan2(o.x - this.player.pos.x, o.z - this.player.pos.z) + Math.PI;
    } else this.arrow.visible = false;

    // 횃불
    if (this.torchLight.intensity > 0) {
      const p = this.torchMesh.getWorldPosition(new THREE.Vector3());
      this.torchLight.position.set(p.x, p.y + 0.4, p.z);
      this.torchLight.intensity = 9 * (0.9 + Math.sin(this.time * 15) * 0.1);
    }

    // 쓰러짐 → 체크포인트에서 다시
    if (this.player.dead && !this.dying) {
      this.dying = true;
      this.onDeath();
    }

    this.runInteract();
    this.runWaiters();
    this.updateCamera(dt);
    this.ui.drawMinimap(this.player, this.objectivePos, this.combat.enemies, Object.values(this.subMarks || {}));
  }

  async onDeath() {
    const id = this.runId;
    await new Promise((r) => setTimeout(r, 1200));
    if (id !== this.runId) return;
    this.ui.prompt('다윗이 쓰러졌다… 화면을 누르면 다시 일어섭니다');
    await new Promise((r) => {
      const go = () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); r(); };
      setTimeout(() => { addEventListener('pointerdown', go); addEventListener('keydown', go); }, 400);
    });
    this.ui.prompt(null);
    await this.ui.fade(1, 0.4);
    this.runner.restartCheckpoint();
  }

  // 3인칭 카메라: 다윗 뒤에서 따라감. camYaw = 카메라가 바라보는 방향 (캐릭터 yaw와 같은 규칙)
  camForward() { return { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) }; }
  camRight() { return { x: -Math.cos(this.camYaw), z: Math.sin(this.camYaw) }; }
  // 조이스틱 입력(화면 기준)을 월드 방향으로 바꾼다. 위로 밀면 카메라가 보는 방향으로 이동
  // ── 타깃 고정 ──
  // 버튼으로 켜고 끔. 고정 중 오른쪽 화면을 좌우로 튕기면 옆 적으로 바꿈. 보스전이 시작되면 자동으로 켬
  lockCandidates() {
    return this.combat.enemies.filter((e) => e.alive && !e.removed && e.active && e.state !== 'scripted' && e.state !== 'intro');
  }
  pickLock(exclude, side = 0) {
    const pl = this.player, f = this.camForward(), r = this.camRight();
    let best = null, bs = -1e9;
    for (const e of this.lockCandidates()) {
      if (e === exclude) continue;
      const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > PLAYER.lockRange) continue;
      const fwd = (dx * f.x + dz * f.z) / (d || 1), rt = (dx * r.x + dz * r.z) / (d || 1);
      if (side === 0 && fwd < -0.2 && d > 3) continue;
      if (side && (side > 0 ? rt <= 0.05 : rt >= -0.05)) continue;
      const score = side ? -Math.abs(rt - side * 0.7) * 6 - d * 0.2 : fwd * 4 - d * 0.35 + (e.boss ? 3 : 0);
      if (score > bs) { bs = score; best = e; }
    }
    return best;
  }
  updateLock(inDialog) {
    const I = this.input, pl = this.player;
    if (!this.lockMark) {
      this.lockMark = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: 0xffd36a, depthTest: false, transparent: true, opacity: 0.95 }));
      this.lockMark.renderOrder = 9;
      this.scene.add(this.lockMark);
      this.lockSwipe = 0;
    }
    let L = this.lockT;
    if (L && (!L.alive || L.removed || !this.combat.enemies.includes(L) || dist(L.pos, pl.pos) > PLAYER.lockLose)) {
      L = this.lockT = (!L.alive || L.removed) ? this.pickLock(L) : null;
      if (L && dist(L.pos, pl.pos) > 10) L = this.lockT = null;
    }
    if (!inDialog && !pl.locked && I.pressed('lock')) {
      if (L) { this.lockT = L = null; this.lockOff = true; }
      else { this.lockT = L = this.pickLock(); this.lockOff = false; if (!L) this.ui.toast('가까이에 고정할 상대가 없다'); }
    }
    // 보스전 시작: 자동 고정 (직접 끄면 그 보스전에서는 다시 켜지 않음)
    const boss = this.combat.enemies.find((e) => e.boss && e.alive && e.state !== 'intro' && e.state !== 'scripted');
    if (boss !== this.lockBoss) { this.lockBoss = boss; this.lockOff = false; }
    if (boss && !L && !this.lockOff && !pl.locked) this.lockT = L = boss;
    if (pl.locked || this.camFocus) { /* 컷신 중에는 표시만 숨김 */ }
    this.lockMark.visible = !!L && !pl.locked && !this.camFocus;
    if (!!L !== this._lockCls) { this._lockCls = !!L; document.body.classList.toggle('locked-on', !!L); }
    if (L) {
      const top = L.boss ? (L.def.hurtbox?.h || 2) + 0.5 : 2.25;
      this.lockMark.position.set(L.pos.x, (L.pos.y || 0) + top + Math.sin(this.time * 4) * 0.06, L.pos.z);
      this.lockMark.rotation.y += 0.05;
    }
  }

  worldMove() {
    const mv = this.input.move();
    const f = this.camForward(), r = this.camRight();
    return { x: r.x * mv.x - f.x * mv.z, z: r.z * mv.x - f.z * mv.z, sx: mv.x, sz: mv.z };
  }

  updateCamera(dt) {
    const f = this.camFocus;
    const pl = this.player;
    this.bossActive = this.combat.enemies.find((e) => e.boss && e.alive && e.state !== 'intro' && e.state !== 'scripted');
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    // 직접 시점 돌리기 (오른쪽 화면 끌기 / Z·C 키)
    const drag = this.input.takeCamDrag();
    if (this.lockT && !f && !pl.locked) {
      // 고정 중: 화면 끌기는 시점 대신 대상 바꾸기 (좌우로 60px 넘게 튕기면)
      this.lockSwipe = (this.input.cam.id === null) ? 0 : this.lockSwipe + drag.x;
      if (Math.abs(this.lockSwipe) > 60) {
        const n = this.pickLock(this.lockT, this.lockSwipe > 0 ? 1 : -1);
        if (n) this.lockT = n;
        this.lockSwipe = -1e6 * Math.sign(this.lockSwipe); // 손을 뗄 때까지 한 번만
      }
      if (drag.y) this.camPitch = Math.max(0.04, Math.min(0.9, this.camPitch + drag.y * 0.004));
    } else if (drag.x || drag.y) {
      this.camYaw -= drag.x * 0.0065;
      this.camPitch = Math.max(0.04, Math.min(0.9, this.camPitch + drag.y * 0.004));
      this.camManualT = 1.2;
    }
    if (this.input.isHeld('camL')) { this.camYaw += dt * 2.2; this.camManualT = 1.2; }
    if (this.input.isHeld('camR')) { this.camYaw -= dt * 2.2; this.camManualT = 1.2; }
    this.camManualT = Math.max(0, (this.camManualT || 0) - dt);
    if (!f && !pl.locked && this.camManualT <= 0) {
      const boss = this.lockT || this.bossActive;
      if (boss) {
        // 보스전·타깃 고정: 다윗과 상대가 함께 보이도록 시점 고정
        const want = Math.atan2(boss.pos.x - pl.pos.x, boss.pos.z - pl.pos.z);
        this.camYaw += wrap(want - this.camYaw) * (1 - Math.exp(-dt * (this.lockT ? 5 : 2.5)));
      } else {
        // 옆으로 움직이면 천천히 캐릭터 뒤로 돌아감
        const mv = this.input.move();
        if (Math.abs(mv.x) > 0.2) this.camYaw += wrap(pl.yaw - this.camYaw) * Math.min(1, dt * 1.6 * Math.abs(mv.x));
      }
    }
    const tx = f ? f.x : pl.pos.x, tz = f ? f.z : pl.pos.z;
    const bd = this.bossActive ? Math.hypot(this.bossActive.pos.x - pl.pos.x, this.bossActive.pos.z - pl.pos.z) : 99;
    const zoom = f ? f.zoom : this.bossActive ? (bd < 4 ? 1.35 : 1.18) : 1; // 보스전: 붙으면 조금 더 뒤·위로 (다윗이 가리지 않게)
    const k = 1 - Math.exp(-dt * (f ? 2.5 : 10));
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.z += (tz - this.camTarget.z) * k;
    this.camGround = (this.camGround ?? 0) + (this.world.heightAt(this.camTarget.x, this.camTarget.z) - (this.camGround ?? 0)) * (1 - Math.exp(-dt * 8));
    this.camZoom += (zoom - this.camZoom) * (1 - Math.exp(-dt * 3));
    this.applyCamera();
  }

  applyCamera() {
    const sh = this.fx.shakeOffset();
    const z = this.camZoom;
    // 기본: 낮고 가까운 어깨 뒤 시점 (컷신 줌은 그대로)
    const cut = !!this.camFocus; // 컷신은 예전 구도 유지
    let dist = (cut ? (z <= 1 ? 2.2 + 4.6 * z : 6.8 + (z - 1) * 9)
      : (z <= 1 ? 1.6 + 2.9 * z : 4.5 + (z - 1) * 8)) * this.viewDist;
    const pitch = cut ? Math.max(this.camPitch, 0.36) + Math.max(0, z - 1) * 0.35 : this.camPitch + Math.max(0, z - 1) * 0.3;
    const fw = this.camForward();
    if (!cut) {
      // 뒤에 바위가 있으면 카메라를 앞으로 당겨 다윗이 가리지 않게
      const h = dist * Math.cos(pitch);
      let free = h;
      const gy = this.camGround || 0, tp = Math.tan(pitch);
      for (let t = 0.8; t <= h; t += 0.25) {
        if (this.world.camBlocked(this.camTarget.x - fw.x * t, this.camTarget.z - fw.z * t, gy + 1.55 + t * tp)) { free = Math.max(0.8, t - 0.35); break; }
      }
      const want = free / h;
      this.camClip = want < (this.camClip ?? 1) ? want : (this.camClip ?? 1) + (want - (this.camClip ?? 1)) * 0.08;
      dist *= this.camClip;
    }
    const cx = this.camTarget.x - fw.x * dist * Math.cos(pitch);
    const cz = this.camTarget.z - fw.z * dist * Math.cos(pitch);
    const gy = this.camGround || 0;
    const cy = Math.max(gy + 1.55 + dist * Math.sin(pitch), this.world.heightAt(cx, cz) + 0.6);
    // 오른쪽 어깨 너머로 살짝 비켜 서서, 캐릭터는 화면 가운데 약간 아래·왼쪽에
    const rt = this.camRight(), side = cut ? 0 : 0.45 * Math.min(1, z);
    this.camera.position.set(cx + rt.x * side + sh.x, cy, cz + rt.z * side + sh.z);
    const la = cut ? 2 : 5;
    this.camera.lookAt(this.camTarget.x + fw.x * la + rt.x * side + sh.x, gy + (cut ? 1.3 : 0.75), this.camTarget.z + fw.z * la + rt.z * side + sh.z);
    const so = this.sunOffset || new THREE.Vector3(-10, 30, 12);
    const ahead = { x: this.camTarget.x + fw.x * 10, z: this.camTarget.z + fw.z * 10 };
    this.sun.position.set(ahead.x + so.x, so.y + gy, ahead.z + so.z);
    this.sun.target.position.set(ahead.x, gy, ahead.z);
  }

  showEnd() {
    const el = document.getElementById('end');
    document.getElementById('end-stats').innerHTML =
      `지킨 양 <b>${this.stats.saved}</b>마리 · 구출한 양 <b>${this.stats.rescued}</b>마리 · 서브 퀘스트 <b>${this.stats.sub}</b>/${Object.keys(SUB_QUESTS).length} · 레벨 <b>${this.prog.level}</b>`;
    el.classList.add('on');
  }

  snapCamera(yaw) {
    const p = this.camFocus || this.player.pos;
    this.camTarget.set(p.x, 0, p.z);
    this.camGround = this.world.heightAt(p.x, p.z);
    this.camZoom = this.camFocus ? this.camFocus.zoom : 1;
    this.camYaw = yaw ?? this.player.yaw;
    this.applyCamera();
  }

}
