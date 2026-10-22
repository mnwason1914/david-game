// 1장 퀘스트 흐름. 각 구간(segment)은 setup(상태 맞추기) + run(진행)으로 되어 있어서
// 어느 구간에서든 시작·재시작(체크포인트)할 수 있다.
// 대사는 data/dialogue.js 의 키로만 부른다 (대사 문구는 여기서 쓰지 않는다).
import * as THREE from 'three';
import { LOC } from './world.js';
import { Thief, Bear, Lion, NPC, spawn, dist } from './actors.js';
import { createRig } from './engine/rig.js';
import * as P from './engine/props.js';
import { bakedMesh } from './engine/lowpoly.js';
import { PLAYER } from './data/enemies.js';
import { WEAPONS } from './data/weapons.js';
import { XP, SEGMENT_MIN_LEVEL } from './data/progression.js';
import { ABORT } from './game.js';

const v = (x, z) => ({ x, z });
// 곰·사자 경기장의 물맷돌 자리 (주우면 2개, 12초 뒤 다시 생김)
const ARENA_STONES = () => [v(LOC.bearArena.x - 5, LOC.bearArena.z - 4), v(LOC.bearArena.x + 5, LOC.bearArena.z + 5), v(LOC.bearArena.x - 4, LOC.bearArena.z + 6), v(LOC.bearArena.x + 6, LOC.bearArena.z - 5)];

// 다윗의 진행 상태 (구간 시작 시점 기준)
// hearts = 이야기로 얻은 하트 수 (레벨업 하트는 따로 더해짐)
function setProgress(g, { hearts, figs }) {
  g.prog.storyHearts = hearts;
  // 물매는 서브 B(물매 만들기)를 마친 뒤 구간부터
  const ids = SEGMENTS.map((sg) => sg.id);
  g.prog.sling = ids.indexOf(g.segId) > ids.indexOf('subB');
  if (g.prog.sling) g.prog.stones = Math.max(g.prog.stones, WEAPONS.sling.startStones);
  else g.prog.stones = 0;
  g.setLevelAtLeast(SEGMENT_MIN_LEVEL[g.segId] || 1);
  g.player.figs = figs;
  g.refreshStats(true);
  g.ui.figs(g.player.figs);
}

export const SEGMENTS = [
  // ───────── 씬 1. 별 아래 양 우리 ─────────
  {
    id: 's1', title: '별 아래 양 우리',
    async setup(g) {
      g.setTime('night');
      setProgress(g, { hearts: PLAYER.hearts, figs: 0 });
      g.world.closeFoldGate(false);
      g.flock.placeAll(LOC.fold, LOC.fold.r - 1.6);
      g.flock.sleeping = false;
      g.flock.setVisible(28);
      g.whiteEar = await g.spawnSheep('lamb', '하얀귀', LOC.campfire.x - 1.2, LOC.campfire.z + 0.8);
      g.lost = await g.spawnSheep('sheep', '길 잃은 양', LOC.lostSheep.x, LOC.lostSheep.z);
      g.player.setPos(LOC.campfire.x - 1.5, LOC.campfire.z - 0.6, 2.4);
      g.player.pose = 'sit';
      g.jesse.setPos(LOC.jesse.x, LOC.jesse.z, Math.PI);
      g.jonah.setPos(-4, -27, 0.5);
    },
    async run(g) {
      g.lock(true);
      g.focus(LOC.campfire, 0.55);
      g.snapCamera();
      g.focus(LOC.campfire, 0.45);
      await g.ui.fade(0, 1.6);
      g.ui.caption('다윗 1장<br><b>베들레헴의 목동</b>');
      await g.wait(2.2);
      await g.say('s1_open');
      g.player.pose = null;
      g.focus(LOC.fold, 0.8);
      await g.wait(1.0);
      await g.say('s1_count');
      g.focus(null);
      g.lock(false);
      g.objective('우리 밖으로 나간 양을 찾자', LOC.lostSheep);
      g.ui.prompt('왼쪽 화면 끌기 = 이동 · 오른쪽 화면 끌기 = 시점 회전 (PC: WASD / 마우스)', 5);
      await g.until(() => g.near(g.lost.pos, 2.5));
      g.lost.follow = g.player;
      await g.say('s1_found');
      g.objective('양을 우리 안으로 데려가자', LOC.fold);
      await g.until(() => dist(g.lost.pos, LOC.fold) < LOC.fold.r - 1.5);
      g.lost.follow = null;
      g.lost.target = v(LOC.fold.x - 1, LOC.fold.z);
      g.whiteEar.target = v(LOC.fold.x + 1, LOC.fold.z + 1);
      g.objective('');
      await g.say('s1_end');
      g.lock(true);
      await g.player.walkTo(LOC.foldBed.x, LOC.foldBed.z + 1.6, 3);
      await g.player.walkTo(LOC.foldBed.x, LOC.foldBed.z, 2);
      g.world.closeFoldGate(true);
      g.player.yaw = Math.PI / 2;
      g.player.pose = 'down';
      g.flock.sleeping = true;
      g.whiteEar.state = 'sleep';
      g.lost.state = 'sleep';
      await g.wait(1.6);
      g.gainXP(XP.scene, '씬 완료');
      await g.ui.fade(1, 1.2);
    },
  },

  // ───────── 씬 2. 밤도둑 (첫 전투) ─────────
  {
    id: 's2', title: '밤도둑', checkpoint: true,
    async setup(g) {
      g.setTime('night');
      setProgress(g, { hearts: PLAYER.hearts, figs: 0 });
      g.world.closeFoldGate(true);
      g.flock.placeAll(LOC.fold, LOC.fold.r - 1.6);
      g.flock.sleeping = true;
      g.flock.setVisible(28);
      g.whiteEar = await g.spawnSheep('lamb', '하얀귀', LOC.fold.x + 2, LOC.fold.z + 1.5);
      g.whiteEar.state = 'sleep';
      const lamb = await g.spawnSheep('sheep', '어린 양', 0, 0);
      g.player.setPos(LOC.foldBed.x, LOC.foldBed.z, Math.PI / 2);
      g.player.pose = 'down';
      const F = LOC.fold;
      // 도둑은 한 명: 어린 양을 안고 달아나려는 두목
      g.thieves = [
        g.combat.add(await spawn(g, Thief, 'thief', { leader: true, lamb, fleeTo: v(-66, 12) })),
      ];
      g.thieves[0].setPos(F.x - 3, F.z + 2.5, -Math.PI / 2);
      lamb.heldBy = g.thieves[0];
      for (const t of g.thieves) { t.active = false; t.state = 'intro'; }
    },
    async run(g) {
      g.lock(true);
      g.focus(LOC.fold, 0.7);
      g.snapCamera(-Math.PI / 2);
      await g.ui.fade(0, 1);
      g.ui.caption('밤도둑');
      g.flock.sleeping = false;
      g.flock.scare(LOC.fold);
      g.whiteEar.state = null;
      await g.wait(1.4);
      await g.say('s2_thief');
      g.player.pose = null;
      g.player.face(LOC.fold);
      await g.wait(0.5);
      await g.say('s2_david');
      g.world.closeFoldGate(false);
      for (const t of g.thieves) t.active = true;
      g.thieves[0].setState('carry');
      g.focus(null);
      g.lock(false);
      // 복선: 혼란 속에 하얀귀가 우리 밖으로 달아난다
      g.whiteEar.target = v(LOC.canyonGate.x + 4, LOC.canyonGate.z - 2);
      g.whiteEar.speed = 4;
      setTimeout(() => { if (g.whiteEar && !g.whiteEar.removed) g.whiteEar.rig.root.visible = false; }, 3500);
      g.objective('양을 안고 달아나는 도둑을 쫓아내자');
      g.ui.prompt('약공격 = 2연타 · 강공격 = 찌르기 · 방패 = 방어(맞기 직전에 누르면 저스트 가드) · 스텝 = 회피', 6);
      await g.until(() => g.thieves.every((t) => !t.alive));
      g.objective('');
      // 도둑이 떨어뜨린 자루 (다윗 근처에 떨어짐)
      const f = g.player.forward();
      const sp = { x: g.player.pos.x + f.x * 1.8, z: g.player.pos.z + f.z * 1.8 };
      g.world.resolve(sp, 0.7);
      const sack = g.addMesh(P.sack(), sp.x, sp.z);
      await g.wait(1.5);
      g.objective('도둑이 떨어뜨린 자루를 줍자', { x: sack.position.x, z: sack.position.z });
      await g.interactAt({ x: sack.position.x, z: sack.position.z }, '줍기');
      g.scene.remove(sack);
      g.player.figs += 2;
      g.ui.figs(g.player.figs);
      g.ui.toast('무화과떡 ×2 획득 (회복 버튼으로 먹기)');
      g.objective('');
      g.lock(true);
      await g.say('s2_end1');
      g.focus(LOC.foldGate, 0.6);
      await g.wait(0.8);
      await g.say('s2_end2');
      g.gainXP(XP.scene, '씬 완료');
      await g.ui.fade(1, 1.2);
      g.lock(false);
    },
  },

  // ───────── 씬 3. 하얀귀를 찾아서 ─────────
  {
    id: 's3', title: '하얀귀를 찾아서', checkpoint: true,
    async setup(g) {
      g.setTime('morning');
      setProgress(g, { hearts: PLAYER.hearts, figs: Math.max(2, g.player.figs) });
      g.world.closeFoldGate(true);
      g.flock.placeAll(LOC.fold, LOC.fold.r - 1.6);
      g.flock.sleeping = false;
      g.flock.setVisible(29);
      g.player.setPos(LOC.foldGate.x + 1.5, LOC.foldGate.z, -Math.PI / 2);
      g.whiteEar = await g.spawnSheep('lamb', '하얀귀', LOC.whiteEar.x, LOC.whiteEar.z);
      g.whiteEar.state = 'stuck';
      g.bush = g.addMesh(bakedMesh(P.thornPieces(0, 0, 1.0)), LOC.whiteEar.x, LOC.whiteEar.z);
      g.bushGlow = g.addMesh(P.glowMarker(0xffffff), LOC.whiteEar.x, LOC.whiteEar.z);
      g.clues = LOC.clues.map((c) => g.addMesh(P.glowMarker(), c.x, c.z));
      g.jesse.setPos(LOC.jesse.x, LOC.jesse.z, Math.PI);
      g.jesse.pose = null;
    },
    async run(g) {
      g.lock(true);
      g.focus(LOC.fold, 0.7);
      g.snapCamera();
      await g.ui.fade(0, 1);
      g.ui.caption('하얀귀를 찾아서');
      await g.wait(1.2);
      await g.say('s3_count');
      g.focus(LOC.canyonGate, 0.9);
      await g.wait(1.0);
      await g.say('s3_look');
      g.focus(null);
      g.lock(false);
      const clueText = ['가시에 걸린 하얀 양털이다', '진흙에 작은 발자국이 있다', '울음소리가 가까워진다…'];
      for (let i = 0; i < 3; i++) {
        g.objective(i === 0 ? '단서를 따라 바위 협곡으로 (빛나는 곳)' : `단서를 따라가자 (${i}/3)`, LOC.clues[i]);
        await g.until(() => g.near(LOC.clues[i], 1.8));
        g.scene.remove(g.clues[i]);
        g.ui.toast(clueText[i]);
      }
      g.objective('하얀귀를 찾자', LOC.whiteEar);
      await g.until(() => g.near(LOC.whiteEar, 4));
      g.lock(true);
      g.focus(LOC.whiteEar, 0.6);
      await g.say('s3_found');
      g.focus(null);
      g.lock(false);
      // 가시덤불 3번 내리치기
      let hits = 0;
      g.objective('지팡이로 가시덤불을 헤치자 (0/3)', LOC.whiteEar);
      g.combat.hittables.push({
        x: LOC.whiteEar.x, z: LOC.whiteEar.z, r: 1.0,
        onHit() {
          hits++;
          g.bush.scale.setScalar(1 - hits * 0.25);
          g.objective(`지팡이로 가시덤불을 헤치자 (${hits}/3)`, LOC.whiteEar);
          if (hits >= 3) this.done = true;
        },
      });
      await g.until(() => hits >= 3);
      g.scene.remove(g.bush);
      g.scene.remove(g.bushGlow);
      g.whiteEar.state = null;
      g.lock(true);
      await g.wait(0.4);
      g.player.carry(g.whiteEar);
      g.stats.rescued = Math.max(g.stats.rescued, 1);
      await g.say('s3_rescued');
      g.lock(false);
      g.objective('하얀귀를 메고 집으로 (아버지께 말 걸기)', LOC.jesse);
      g.jesse.marker.visible = true;
      g.ui.prompt('양을 메고 있으면 걸음이 느려지고 구를 수 없어요', 3);
      await g.interactAt(LOC.jesse, '말하기', 2.6);
      g.jesse.marker.visible = false;
      g.objective('');
      g.lock(true);
      g.jesse.face(g.player.pos);
      g.player.face(g.jesse.pos);
      g.focus({ x: (g.player.pos.x + LOC.jesse.x) / 2, z: (g.player.pos.z + LOC.jesse.z) / 2 }, 0.55);
      await g.say('s3_report_a');
      await g.wait(0.6);
      await g.say('s3_report_b');
      await g.wait(1.6); // 잠시 침묵
      await g.say('s3_report_c');
      g.prog.storyHearts += 1;
      g.refreshStats(true);
      g.ui.toast('체력 하트 +1');
      g.player.drop(g.player.pos.x + 0.8, g.player.pos.z + 0.5);
      g.whiteEar.follow = g.player;
      await g.wait(1.5);
      g.gainXP(XP.scene, '씬 완료');
      await g.ui.fade(1, 1.2);
      g.lock(false);
    },
  },

  // ───────── 서브 A. 별 아래 수금 (휴식·리듬) ─────────
  {
    id: 'subA', title: '서브: 별 아래 수금', checkpoint: true,
    async setup(g) {
      g.setTime('evening');
      setProgress(g, { hearts: PLAYER.hearts + 1, figs: g.player.figs });
      g.world.closeFoldGate(true);
      g.flock.placeAll(LOC.fold, LOC.fold.r - 1.6);
      g.flock.sleeping = false;
      g.flock.setVisible(29);
      g.whiteEar = await g.spawnSheep('lamb', '하얀귀', LOC.campfire.x - 1.4, LOC.campfire.z + 1.2);
      g.player.setPos(LOC.campfire.x - 1.6, LOC.campfire.z - 0.4, 2.2);
      g.player.pose = 'sit';
      g.harpMesh = g.addMesh(P.harp(), LOC.campfire.x - 1.3, LOC.campfire.z + 0.1);
      g.harpMesh.rotation.y = 2.2;
    },
    async run(g) {
      g.lock(true);
      g.focus({ x: LOC.campfire.x - 4, z: LOC.campfire.z - 2 }, 0.6);
      g.snapCamera();
      await g.ui.fade(0, 1);
      g.ui.caption('서브 퀘스트<br><b>별 아래 수금</b>');
      // 양들이 불안하게 서성임
      g.flock.scare(LOC.fold);
      await g.wait(2.0);
      await g.say('subA_start');
      const sheep = g.flock.sheep;
      const per = Math.ceil(sheep.length / 4);
      await g.ui.harp(4, async (bar) => {
        for (let i = bar * per; i < Math.min(sheep.length, (bar + 1) * per); i++) sheep[i].sleep = true;
        if (bar === 1) await g.say('subA_mid');
      });
      g.whiteEar.state = 'sleep';
      g.flock.sleeping = true;
      g.focus(LOC.fold, 0.7);
      await g.wait(1.4);
      await g.say('subA_end');
      g.player.peace = true;
      g.completeSub('A', '「평안」 버프');
      await g.wait(2.0);
      await g.ui.fade(1, 1.2);
    },
  },

  // ───────── 자유 시간: 서브 퀘스트 C·D·E·F (선택) ─────────
  {
    id: 'free', title: '자유 시간 (서브 퀘스트)', checkpoint: true,
    async setup(g) {
      g.setTime('day');
      setProgress(g, { hearts: PLAYER.hearts + 1, figs: g.player.figs });
      g.world.closeFoldGate(true);
      g.flock.placeAll(LOC.fold, LOC.fold.r - 1.6);
      g.flock.sleeping = false;
      g.flock.setVisible(29);
      g.player.setPos(LOC.yardCenter.x, LOC.yardCenter.z + 1.5, Math.PI);
      g.jesse.setPos(LOC.jesse.x, LOC.jesse.z, Math.PI);
      g.jonah.setPos(-4, -27, 0.5);
      g.eliab = g.addTemp(new NPC(g, await createRig('eliab'), '엘리압'));
      g.eliab.setPos(LOC.eliab.x, LOC.eliab.z, -2.2);
      g.woman = g.addTemp(new NPC(g, await createRig('oldwoman'), '여인'));
      g.woman.setPos(LOC.oldwoman.x, LOC.oldwoman.z, -2.5);
      g.hurtSheep = await g.spawnSheep('sheep', '다친 양', LOC.hurtSheep.x, LOC.hurtSheep.z);
      g.addMesh(P.oilBottle(), LOC.storage.x, LOC.storage.z);
      g.cStarted = g.fStarted = false;
    },
    async run(g) {
      const has = (k) => g.prog.subs.has(k);
      g.lock(true);
      g.snapCamera(Math.PI);
      await g.ui.fade(0, 1);
      g.ui.caption('— 며칠 후, 낮 —<br><b>자유 시간</b>');
      await g.wait(1.6);
      g.lock(false);
      g.objective('준비되면 아버지께 말을 걸어 이야기를 이어 가자', LOC.jesse);
      g.ui.prompt('서브 퀘스트는 선택이에요. 머리 위에 노란 표시가 있는 사람에게 말을 걸어 보세요.', 5);
      const bg = (f) => f(g).catch((e) => { if (e !== ABORT) console.error(e); });
      if (!has('D')) bg(subD);
      if (!has('E')) bg(subE);
      g.jesse.marker.visible = true;
      for (;;) {
        await g.interactAt(g.jesse.pos, '말하기', 2.6);
        const opts = [], acts = [];
        if (!has('C') && !g.cStarted) { opts.push('형들에게 점심 가져가기 (서브)'); acts.push('C'); }
        if (!has('F') && !g.fStarted) { opts.push('언덕에서 무화과 따 오기 (서브)'); acts.push('F'); }
        opts.push('이야기 계속하기 (물매 만들기)'); acts.push('go');
        opts.push('닫기'); acts.push('close');
        const act = acts[await g.choice('이새', opts)];
        if (act === 'C') { g.cStarted = true; bg(subC); }
        if (act === 'F') { g.fStarted = true; bg(subF); }
        if (act === 'go') break;
      }
      g.jesse.marker.visible = false;
      g.objective('');
      await g.ui.fade(1, 1);
    },
  },

  // ───────── 서브 B. 물매 만들기 (곰과 사자 전에 물매 해금) ─────────
  {
    id: 'subB', title: '물매 만들기', checkpoint: true,
    async setup(g) {
      g.setTime('day');
      setProgress(g, { hearts: PLAYER.hearts + 1, figs: g.player.figs });
      g.world.closeFoldGate(true);
      g.flock.placeAll(LOC.fold, LOC.fold.r - 1.6);
      g.flock.sleeping = false;
      g.flock.setVisible(29);
      g.player.setPos(LOC.yardCenter.x, LOC.yardCenter.z + 1.5, Math.PI);
      g.jesse.setPos(LOC.jesse.x, LOC.jesse.z, Math.PI);
      g.jonah.setPos(-4, -27, 0.5);
      const pen = LOC.goatPen;
      for (const [dx, dz] of [[-0.9, -0.6], [0.8, -0.9], [0.2, 0.7]]) {
        const goat = await g.spawnSheep('goat', '염소', pen.x + dx, pen.z + dz);
        goat.speed = 1;
      }
    },
    async run(g) {
      g.lock(true);
      g.snapCamera(Math.PI);
      await g.ui.fade(0, 1);
      g.ui.caption('— 다음 날 —<br><b>물매 만들기</b>');
      await g.wait(1.6);
      g.lock(false);
      // 이새가 물매 만드는 법을 알려 줌
      g.objective('아버지께 말을 걸자', LOC.jesse);
      g.jesse.marker.visible = true;
      await g.interactAt(g.jesse.pos, '말하기', 2.6);
      g.jesse.marker.visible = false;
      g.lock(true);
      g.player.face(g.jesse.pos);
      g.jesse.face(g.player.pos);
      await g.say('subB_start');
      g.lock(false);
      // ① 창고: 가죽 조각
      const leather = g.addMesh(P.leatherPiece(), LOC.storage.x, LOC.storage.z);
      const lg = g.addMesh(P.glowMarker(), LOC.storage.x, LOC.storage.z);
      g.objective('집 옆 창고에서 가죽 조각 찾기', LOC.storage);
      await g.interactAt(LOC.storage, '가죽 조각 줍기', 2.2);
      g.scene.remove(leather); g.scene.remove(lg);
      g.ui.toast('가죽 조각을 얻었다 (물매 주머니)');
      // ② 염소 우리: 염소털 끈
      const pen = LOC.goatPen, cp = { x: pen.x + 0.6, z: pen.z + 1.2 };
      const cord = g.addMesh(P.cordCoil(), cp.x, cp.z);
      const cg = g.addMesh(P.glowMarker(), cp.x, cp.z);
      g.objective('염소 우리에서 염소털 끈 얻기 (입구는 남쪽)', cp);
      await g.interactAt(cp, '염소털 끈 줍기', 1.8);
      g.scene.remove(cord); g.scene.remove(cg);
      g.ui.toast('염소털 끈을 얻었다 (물매 끈)');
      // ③ 시냇가: 매끄러운 돌 5개
      const stones = LOC.smoothStones.map((q) => ({ q, m: g.addMesh(P.smoothStone(), q.x, q.z), k: g.addMesh(P.glowMarker(0xdfe8ff), q.x, q.z), got: false }));
      let n = 0;
      const upd = () => { const nx = stones.find((st) => !st.got); g.objective(`시냇가에서 매끄러운 돌 줍기 (${n}/5)`, nx ? nx.q : null); };
      upd();
      g.ui.prompt('시냇가의 빛나는 돌 가까이 가면 주워요', 3);
      await g.until(() => {
        for (const st of stones) if (!st.got && g.near(st.q, 1.3)) { st.got = true; g.scene.remove(st.m); g.scene.remove(st.k); n++; upd(); }
        return n >= 5;
      });
      // ④ 물매 완성
      g.objective('');
      g.lock(true);
      g.player.pose = 'pray';
      await g.wait(1.0);
      g.player.pose = null;
      g.prog.sling = true;
      g.prog.stones = WEAPONS.sling.startStones;
      g.refreshStats(false);
      g.addStonePickups(LOC.smoothStones.slice(0, 3), 2, 8); // 연습하다 돌이 떨어지면 시냇가에서 다시 줍기
      g.ui.toast('물매 완성! 매끄러운 돌 5개를 주머니에 넣었다 (투척 아이템)', 2.6);
      await g.say('subB_made');
      g.lock(false);
      // ⑤ 나무 과녁 맞히기 3회
      const T = LOC.slingTarget;
      const target = g.addMesh(P.slingTarget(), T.x, T.z);
      target.position.y = g.world.heightAt(T.x, T.z);
      target.rotation.y = Math.PI;
      let hits = 0;
      const tgt = { pos: { x: T.x, z: T.z }, y: 1.3, r: 0.45, onHit() {
        hits++;
        target.rotation.z = 0.12; setTimeout(() => (target.rotation.z = 0), 160);
        g.objective(`나무 과녁을 물매로 맞히자 (${hits}/3)`, T);
        if (hits >= 3) this.done = true;
      } };
      g.combat.slingTargets.push(tgt);
      g.objective('나무 과녁을 물매로 맞히자 (0/3)', T);
      g.ui.prompt('아래 물매 칸(PC: R)을 누르면 돌을 하나 던져요. 앞쪽의 과녁이나 적을 자동으로 겨눠요. 돌은 시냇가에서 다시 주울 수 있어요', 6);
      await g.until(() => hits >= 3);
      g.objective('');
      g.lock(true);
      g.player.face(T);
      await g.say('subB_hit');
      g.completeSub('B', '물매 해금');
      await g.wait(1.6);
      g.lock(false);
      await g.ui.fade(1, 1);
    },
  },

  // ───────── 씬 6-1·6-2. 출정 + 골짜기 추적 ─────────
  {
    id: 's6a', title: '곰과 사자 — 출정', checkpoint: true,
    async setup(g) {
      g.setTime('evening');
      setProgress(g, { hearts: PLAYER.hearts + 1, figs: Math.max(0, g.player.figs) });
      g.world.closeFoldGate(true);
      g.flock.placeAll(LOC.fold, LOC.fold.r - 1.6);
      g.flock.setVisible(29);
      g.flock.sleeping = true;
      g.eastClosed = true;
      g.player.setPos(LOC.yardCenter.x - 1.2, LOC.yardCenter.z - 5, Math.PI / 2);
      g.player.pose = 'sit';
      g.jesse.setPos(LOC.yardCenter.x + 1.2, LOC.yardCenter.z - 5, -Math.PI / 2);
      g.jesse.pose = 'sit';
      g.jonah.setPos(0, -14, Math.PI);
      g.dinnerFire = g.addMesh(P.lamp(), LOC.yardCenter.x, LOC.yardCenter.z - 4.4);
    },
    async run(g) {
      g.lock(true);
      g.focus({ x: LOC.yardCenter.x, z: LOC.yardCenter.z - 3 }, 0.55);
      g.snapCamera();
      await g.ui.fade(0, 1);
      g.ui.caption('— 어느 날 저녁 —<br><b>곰과 사자</b>');
      await g.wait(2.0);
      // 요나가 급히 뛰어 들어옴
      g.jonah.pose = 'run';
      await g.jonah.walkTo(0, -27, 6);
      await g.jonah.walkTo(0.3, -31.5, 5);
      g.jonah.pose = null;
      g.jonah.face(g.jesse.pos);
      await g.say('s6_a');
      g.player.pose = null;
      await g.say('s6_b');
      g.focus(g.jesse.pos, 0.42);
      await g.wait(1.2); // 이새가 말을 잇지 못함
      g.focus({ x: LOC.yardCenter.x, z: LOC.yardCenter.z - 3 }, 0.5);
      await g.say('s6_c');
      g.focus(g.jesse.pos, 0.38);
      await g.wait(2.0); // 긴 침묵, 이새의 손
      g.jesse.pose = null;
      await g.say('s6_d');
      g.player.figs += 3;
      g.ui.figs(g.player.figs);
      g.ui.toast('무화과떡 ×3 획득');
      g.world.openEastValley();
      g.eastClosed = false;
      g.setTime('night');
      g.setTorch(true);
      g.focus(null);
      g.lock(false);
      g.trail = LOC.trail.map((t) => g.addMesh(P.woolTuft(), t.x, t.z));
      g.objective('횃불을 들고 동쪽 골짜기로', LOC.ridgeGap);
      await g.until(() => g.near(LOC.ridgeGap, 4));
      g.objective('흩어진 양털을 따라가자', LOC.trail[0]);
      await g.until(() => g.near(LOC.trail[0], 2.5));
      await g.say('s6_track1');
      g.objective('흩어진 양털을 따라가자', LOC.trail[2]);
      await g.until(() => g.near(LOC.trail[2], 2.5));
      g.ui.toast('멀리서 양의 울음소리가 들린다');
      await g.wait(1.0);
      await g.say('s6_track2');
      g.lock(true);
      g.player.pose = 'pray';
      await g.wait(0.8);
      await g.say('s6_pray');
      g.player.pose = null;
      g.lock(false);
    },
  },

  // ───────── 씬 6-3. 곰 ─────────
  {
    id: 's6b', title: '보스 ① 곰', checkpoint: true,
    async setup(g) {
      g.setTime('night');
      setProgress(g, { hearts: PLAYER.hearts + 1, figs: Math.max(3, g.player.figs) });
      g.world.openEastValley();
      g.eastClosed = false;
      g.setTorch(true);
      g.flock.setVisible(29);
      g.flock.sleeping = true;
      g.player.setPos(LOC.bearArena.x - 9.5, LOC.bearArena.z, Math.PI / 2);
      g.bearLamb = await g.spawnSheep('sheep', '어린 양', 0, 0);
      g.bearLamb.rig.root.scale.setScalar(0.75);
      g.bear = g.combat.add(await spawn(g, Bear, 'bear', { lamb: g.bearLamb }));
      g.bear.setPos(LOC.bearArena.x + 3, LOC.bearArena.z, -Math.PI / 2 + 0.6);
      g.bearLamb.heldBy = g.bear;
      g.bearLambHide = v(LOC.bearArena.x + 6, LOC.bearArena.z + 12);
      g.addStonePickups(ARENA_STONES());
    },
    async run(g) {
      g.lock(true);
      g.focus({ x: LOC.bearArena.x - 3, z: LOC.bearArena.z }, 0.5);
      g.snapCamera();
      await g.ui.fade(0, 0.8);
      await g.wait(0.8);
      await g.say('s6_bear1');
      g.bear.face(g.player.pos);
      g.focus({ x: LOC.bearArena.x - 2, z: LOC.bearArena.z }, 0.45);
      await g.wait(0.8);
      await g.say('s6_bear2');
      g.focus(null);
      g.lock(false);
      g.bear.setState('approach');
      g.objective('물매로 곰 머리를 3번 맞혀 어린 양을 구하자');
      g.ui.prompt('아래 물매 칸(PC: R)으로 곰을 맞히자. 돌이 떨어지면 바닥의 빛나는 돌을 줍자. 돌진은 옆으로 피하면 바위에 부딪혀 기절한다!', 6);
      g.once('bearDroppedLamb').then(() => g.objective('곰을 물리치자'));
      await g.until(() => !g.bear.alive);
      g.objective('');
      g.lock(true);
      g.stats.rescued = Math.max(g.stats.rescued, 2);
      await g.wait(1.4);
      await g.say('s6_bear_end1');
      g.focus(g.bearLamb.pos, 0.6);
      await g.wait(1.0);
      await g.say('s6_bear_end2');
      g.focus(null);
      g.lock(false);
    },
  },

  // ───────── 씬 6-4·6-5. 숨 고르기 + 사자 ─────────
  {
    id: 's6c', title: '보스 ② 사자', checkpoint: true,
    async setup(g) {
      g.setTime('night');
      setProgress(g, { hearts: PLAYER.hearts + 1, figs: g.player.figs });
      g.player.hp = Math.min(g.player.hp, g.player.maxHp);
      g.world.openEastValley();
      g.eastClosed = false;
      g.setTorch(true);
      g.player.setPos(LOC.bearArena.x, LOC.bearArena.z + 4, 0);
      // 쓰러진 곰 (배경)
      const deadBear = await spawn(g, Bear, 'bear');
      deadBear.setPos(LOC.bearArena.x + 2, LOC.bearArena.z - 1, 1);
      deadBear.alive = false;
      deadBear.setState('down');
      deadBear.stateT = 5;
      g.addTemp(deadBear);
      g.bearLamb = await g.spawnSheep('sheep', '어린 양', LOC.spring.x - 2.5, LOC.spring.z - 2);
      g.bearLamb.rig.root.scale.setScalar(0.75);
      g.whiteEar = await g.spawnSheep('lamb', '하얀귀', LOC.spring.x + 2.4, LOC.spring.z - 1.5);
      g.lionLambHide = v(LOC.spring.x - 4, LOC.spring.z + 3);
      g.addStonePickups(ARENA_STONES());
    },
    async run(g) {
      await g.ui.fade(0, 0.8);
      g.objective('샘물에서 숨을 고르자', LOC.spring);
      g.ui.prompt('무화과떡: 회복 버튼 (PC: Q)', 3);
      await g.until(() => g.near(LOC.spring, 3.2));
      g.objective('');
      g.lock(true);
      g.ui.toast('샘물을 마셨다. 체력이 모두 회복되었다');
      g.player.heal(99);
      await g.player.walkTo(g.bearLamb.pos.x + 1, g.bearLamb.pos.z, 2.5);
      g.player.face(g.bearLamb.pos);
      await g.say('s6_rest1');
      g.lock(false);
      g.objective('잠시 쉬자…');
      await g.wait(6);
      g.objective('');
      // 사자의 포효
      g.lock(true);
      g.setTime('dawn');
      g.fx.shake(0.4);
      g.ui.toast('— 사자의 포효 —', 2);
      g.lion = g.combat.add(await spawn(g, Lion, 'lion'));
      g.lion.setPos(LOC.lionRidge.x - 1, LOC.lionRidge.z + 2.6, -2.5);
      g.lion.state = 'scripted';
      g.focus(LOC.lionRidge, 0.6);
      await g.wait(1.6);
      await g.say('s6_rest2');
      // 사자가 뛰어내려 하얀귀를 물고 달아남
      await leapTo(g, g.lion, g.whiteEar.pos.x, g.whiteEar.pos.z, 1.0);
      g.focus(g.whiteEar.pos, 0.6);
      g.lion.lamb = g.whiteEar;
      g.whiteEar.heldBy = g.lion;
      await g.say('s6_rest3');
      g.focus(null);
      await runTo(g, g.lion, LOC.bearArena.x + 6, LOC.bearArena.z + 6, 9);
      g.lion.face(g.player.pos);
      g.focus({ x: (g.player.pos.x + g.lion.pos.x) / 2, z: (g.player.pos.z + g.lion.pos.z) / 2 }, 0.6);
      await g.say('s6_lion1');
      g.focus(null);
      g.lock(false);
      g.lion.setState('approach');
      g.objective('사자에게서 하얀귀를 되찾자');
      g.ui.prompt('붉은 표식이 뜨는 공격은 막을 수 없다! 스텝으로 피하자', 4);
      g.once('lionDroppedLamb').then(() => g.objective('사자를 물리치자'));
      await g.until(() => !g.lion.alive);
      g.objective('');
      g.lock(true);
      g.ui.boss(null);
      await g.wait(1.6);
      g.whiteEar.target = null;
      await g.player.walkTo(g.whiteEar.pos.x - 0.9, g.whiteEar.pos.z, 3);
      g.player.carry(g.whiteEar);
      g.player.pose = 'sit';
      await g.say('s6_lion_end1');
      g.player.pose = 'pray';
      g.focus(g.player.pos, 1.3);
      await g.wait(1.5);
      await g.say('s6_lion_end2');
      g.stats.rescued = 3; // 도둑에게서 되찾은 양, 곰에게서 구한 양, 하얀귀
      g.ui.toast('「용사의 증표」 획득 · 체력 하트 +1');
      g.prog.storyHearts += 1;
      g.refreshStats(true);
      await g.wait(1.8);
      await g.ui.fade(1, 1.2);
      g.player.pose = null;
    },
  },

  // ───────── 씬 7. 아버지께 보고 ─────────
  {
    id: 's7', title: '아버지께 보고', checkpoint: true,
    async setup(g) {
      g.setTime('dawn');
      setProgress(g, { hearts: PLAYER.hearts + 2, figs: g.player.figs });
      g.world.openEastValley();
      g.eastClosed = false;
      g.whiteEar = await g.spawnSheep('lamb', '하얀귀', 0, 0);
      g.player.setPos(0, -12, Math.PI);
      g.player.carry(g.whiteEar);
      g.jesse.setPos(LOC.house.x + 0.5, LOC.house.z + 4.2, 0);
      g.jesse.pose = null;
      g.jonah.setPos(-30, -10, 0);
      g.world.lampLight.intensity = 0; // 꺼진 등잔 (밤새 기다린 흔적)
    },
    async run(g) {
      await g.ui.fade(0, 1);
      g.objective('집으로 돌아가자', LOC.yardCenter);
      await g.until(() => g.near(LOC.yardCenter, 5.5));
      g.objective('');
      g.lock(true);
      g.focus({ x: 0, z: -31 }, 0.6);
      await g.say('s7_a');
      await g.jesse.walkTo(g.player.pos.x, g.player.pos.z - 1.6, 2.6);
      g.jesse.face(g.player.pos);
      g.player.face(g.jesse.pos);
      g.focus({ x: g.player.pos.x, z: g.player.pos.z - 0.8 }, 0.45);
      await g.say('s7_b');
      await g.say('s7_c');
      g.jesse.pose = 'hug';
      await g.wait(2.0);
      await g.say('s7_d');
      g.jesse.pose = null;
      await g.wait(0.6);
      await g.say('s7_e');
      await g.wait(0.8);
      await g.say('s7_f');
      // 떡밥: 요나가 달려옴
      g.jonah.setPos(g.player.pos.x - 12, g.player.pos.z + 6, 1);
      g.jonah.pose = 'run';
      await g.jonah.walkTo(g.player.pos.x - 2, g.player.pos.z - 0.5, 6);
      g.jonah.pose = null;
      g.jonah.face(g.jesse.pos);
      await g.say('s7_g');
      await g.wait(0.6);
      await g.say('s7_h');
      g.player.face(g.jesse.pos);
      await g.say('s7_i');
      await g.wait(0.8);
      await g.say('s7_j');
      // 엔딩: 카메라가 하늘로
      g.ui.cinema(true);
      g.focus({ x: g.player.pos.x, z: g.player.pos.z }, 3.2);
      await g.wait(2.5);
      g.ui.caption('— 1장 끝 —<br><b>다음 장: 기름 부음</b>');
      await g.wait(3.5);
      g.showEnd();
    },
  },
];

// ───────── 서브 퀘스트 본문 ─────────
// C. 형들의 점심: 이새 → 들판의 엘리압
async function subC(g) {
  g.ui.toast('볶은 곡식과 떡을 받았다');
  g.subStatus('C', '들판의 엘리압 형에게 점심 전하기', LOC.eliab);
  g.eliab.marker.visible = true;
  await g.interactAt(g.eliab.pos, '점심 주기', 2.6);
  g.eliab.marker.visible = false;
  g.lock(true);
  g.eliab.face(g.player.pos);
  g.player.face(g.eliab.pos);
  await g.say('subC_eliab');
  g.lock(false);
  g.prog.belt = true;
  g.completeSub('C', '형의 낡은 허리띠 (큰 피해 1 감소)');
}

// D. 우물가 노파의 물동이: 수풀 속 물동이 찾기 → 우물에서 물 긷기 → 집까지 배달
async function subD(g) {
  g.woman.marker.visible = true;
  g.subStatus('D', '우물가 여인에게 말 걸기', LOC.oldwoman);
  await g.interactAt(g.woman.pos, '말 걸기', 2.6);
  g.woman.marker.visible = false;
  g.ui.toast('아단 패거리가 물동이를 수풀에 던져 버렸다고 한다', 3);
  const jar = g.addMesh(P.jar(), LOC.jar.x, LOC.jar.z);
  const glow = g.addMesh(P.glowMarker(), LOC.jar.x, LOC.jar.z);
  g.subStatus('D', '수풀 속 물동이 찾기', LOC.jar);
  await g.interactAt(LOC.jar, '줍기', 2.4);
  g.scene.remove(jar); g.scene.remove(glow);
  g.subStatus('D', '우물에서 물 긷기', LOC.well);
  await g.interactAt(LOC.well, '물 긷기', 2.9);
  g.lock(true);
  g.player.face(LOC.well);
  g.ui.toast('두레박으로 물을 길어 물동이를 채웠다');
  await g.wait(1.2);
  g.lock(false);
  // 여인은 먼저 집으로 걸어감
  g.woman.walkTo(-34, -31, 1.8).then(() => g.woman.walkTo(LOC.hutDoor.x, LOC.hutDoor.z + 1.2, 1.8));
  g.subStatus('D', '여인의 집까지 물동이 배달', LOC.hutDoor);
  g.woman.marker.visible = true;
  await g.interactAt(g.woman.pos, '물동이 드리기', 2.6);
  g.woman.marker.visible = false;
  g.lock(true);
  g.woman.face(g.player.pos);
  g.player.face(g.woman.pos);
  await g.say('subD_thanks');
  g.lock(false);
  g.player.figs += 3;
  g.ui.figs(g.player.figs);
  g.completeSub('D', '무화과떡 ×3');
}

// E. 다친 양 치료: 우슬초 3줄기 + 기름 병 → 발라 주기
async function subE(g) {
  const sh = g.hurtSheep;
  sh.state = 'stuck'; // 절뚝거림
  const mark = g.addMesh(P.glowMarker(0xff9a9a), sh.pos.x, sh.pos.z);
  g.subStatus('E', '우리 앞의 다친 양 살펴보기', LOC.hurtSheep);
  await g.interactAt(sh.pos, '살펴보기', 2.2);
  g.ui.toast('다리를 다친 양이다. 우슬초와 기름이 필요하다', 3);
  let got = 0, oil = false;
  const upd = () => g.subStatus('E', `우슬초 ${got}/3 · 기름 병 ${oil ? '있음' : '없음 (집 옆 창고)'}`, got < 3 ? LOC.hyssop[got] : LOC.storage);
  upd();
  const plants = LOC.hyssop.map((h) => [g.addMesh(P.hyssop(), h.x, h.z), g.addMesh(P.glowMarker(0xd8ffb0), h.x, h.z)]);
  await Promise.all([
    ...LOC.hyssop.map(async (h, i) => {
      await g.interactAt(h, '우슬초 캐기', 1.9);
      plants[i].forEach((m) => g.scene.remove(m));
      got++; upd();
    }),
    (async () => { await g.interactAt(LOC.storage, '기름 병 꺼내기', 2.2); oil = true; upd(); })(),
  ]);
  g.subStatus('E', '다친 양에게 발라 주기', LOC.hurtSheep);
  await g.interactAt(sh.pos, '치료하기', 2.2);
  g.lock(true);
  g.player.face(sh.pos);
  g.player.pose = 'pray';
  g.fx.spark(sh.pos.x, 0.8, sh.pos.z, 0x9cff9c, 12);
  await g.wait(1.2);
  g.player.pose = null;
  g.lock(false);
  g.scene.remove(mark);
  sh.state = null;
  sh.target = { ...LOC.foldGate };
  g.prog.healBonus = 2;
  g.completeSub('E', '치유의 손 (무화과떡 회복량 +1 하트)');
}

// F. 무화과 따기: 나무를 지팡이로 흔들어 열매 10개
async function subF(g) {
  g.ui.toast('언덕의 무화과나무를 지팡이로 흔들어 열매 10개를 모으자', 3);
  let n = 0;
  const fruits = [];
  const upd = () => g.subStatus('F', `무화과 ${n}/10 (나무를 지팡이로 치기)`, LOC.figTrees[0]);
  upd();
  LOC.figTrees.forEach((t, ti) => {
    let left = 4;
    g.combat.hittables.push({
      x: t.x, z: t.z, r: 0.9,
      onHit() {
        const tree = g.world.figTrees[ti];
        tree.rotation.z = 0.08;
        setTimeout(() => (tree.rotation.z = 0), 150);
        for (let k = 0; k < 2 && left > 0; k++, left--) {
          const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 1.2;
          const p = { x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d };
          fruits.push({ p, m: g.addMesh(P.fig(), p.x, p.z) });
        }
        if (left <= 0) this.done = true;
      },
    });
  });
  await g.until(() => {
    for (const f of fruits) if (!f.got && g.near(f.p, 1.3)) { f.got = true; g.scene.remove(f.m); n++; upd(); }
    return n >= 10;
  });
  g.player.figs += 4;
  g.ui.figs(g.player.figs);
  g.completeSub('F', '무화과떡 ×4');
}

// 사자 도약 (컷신용)
async function leapTo(g, a, x, z, time) {
  const fx = a.pos.x, fz = a.pos.z;
  a.face({ x, z });
  const t0 = g.time;
  await g.until(() => {
    const t = Math.min(1, (g.time - t0) / time);
    a.pos.x = fx + (x - fx) * t;
    a.pos.z = fz + (z - fz) * t;
    a.rig.root.position.y = Math.sin(t * Math.PI) * 3;
    a.anim.action = 'leap'; a.anim.t = t;
    return t >= 1;
  });
  a.rig.root.position.y = 0;
}
async function runTo(g, a, x, z, speed) {
  await g.until(() => {
    a.face({ x, z });
    const d = dist(a.pos, { x, z });
    const s = Math.min(d, speed * 0.016);
    a.pos.x += Math.sin(a.yaw) * s; a.pos.z += Math.cos(a.yaw) * s;
    a.anim.move = 1; a.anim.phase += 0.35; a.anim.action = null;
    return d < 0.5;
  });
}

// 구간 실행기 (체크포인트 재시작 포함)
export class Runner {
  constructor(g) { this.g = g; this.index = 0; this.checkpoint = 0; }
  async runFrom(i) {
    const g = this.g;
    this.index = i;
    try {
      for (; this.index < SEGMENTS.length; this.index++) {
        const seg = SEGMENTS[this.index];
        if (seg.checkpoint || this.index === i) this.checkpoint = this.index;
        g.reset();
        g.segId = seg.id;
        const id = g.runId;
        await seg.setup(g);
        if (id !== g.runId) return;
        g.snapCamera();
        await seg.run(g);
      }
    } catch (e) {
      if (e !== ABORT) { console.error(e); throw e; }
    }
  }
  restartCheckpoint() { this.runFrom(this.checkpoint); }
}
