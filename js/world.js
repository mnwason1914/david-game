// 베들레헴 들판 존. 닫힌 방이 아니라 절벽·나무·바위로 둘러싸인 야외 한 구역.
// 좌표: x = 동(+)/서(-), z = 남(+)/북(-). 단위 m.
import * as THREE from 'three';
import { bakedMesh, rng, G } from './engine/lowpoly.js';
import * as P from './engine/props.js';
import { Terrain, lineDist } from './engine/terrain.js';
import { MAP1 } from './data/map1.js';

export const BOUNDS = { minX: -66, maxX: 86, minZ: -50, maxZ: 46 };

// 주요 장소 (퀘스트·미니맵에서 사용)
export const LOC = {
  fold: { x: -25, z: 5, r: 7 },            // 양 우리 (문은 동쪽)
  foldGate: { x: -17.6, z: 5 },
  foldBed: { x: -16.6, z: 5 },              // 다윗이 문 앞에 눕는 자리
  campfire: { x: -14.5, z: 9 },
  house: { x: 0, z: -40 },
  jesse: { x: 2.5, z: -31 },
  yardCenter: { x: 0, z: -29 },
  lostSheep: { x: -2, z: 16 },              // 씬 1 길 잃은 양
  canyonGate: { x: -40, z: 22 },
  clues: [{ x: -42, z: 27 }, { x: -50, z: 33 }, { x: -55, z: 39 }],
  whiteEar: { x: -60, z: 42 },              // 하얀귀가 걸린 가시덤불
  ridgeGap: { x: 36, z: 4 },                // 동쪽 골짜기 입구
  trail: [{ x: 42, z: 2 }, { x: 47, z: -3 }, { x: 52, z: 1 }],
  bearArena: { x: 62, z: 2 },
  spring: { x: 70, z: 20 },
  lionRidge: { x: 78, z: -14 },
  // 자유 시간 · 서브 퀘스트
  well: { x: -36, z: -26 },
  oldwoman: { x: -33, z: -24 },
  hut: { x: -50, z: -38 },
  hutDoor: { x: -50, z: -35.6 },
  jar: { x: -45, z: -16 },
  eliab: { x: 24, z: -22 },
  figTrees: [{ x: 8, z: 28 }, { x: 14, z: 34 }, { x: 2, z: 36 }],
  hyssop: [{ x: -6, z: 22 }, { x: -14, z: 32 }, { x: 20, z: 14 }],
  storage: { x: 4.6, z: -36.4 },  // 집 옆 창고 (기름 병)
  hurtSheep: { x: -11, z: 0 },
  // 서브 B. 물매 만들기
  goatPen: { x: -20, z: -24, r: 2.6 },
  brook: [{ x: -31, z: -14.5 }, { x: -24, z: -16.5 }, { x: -18, z: -15.8 }, { x: -12, z: -17.5 }, { x: -5, z: -18.6 }],
  smoothStones: [{ x: -27, z: -14.6 }, { x: -21.5, z: -17.4 }, { x: -16, z: -14.7 }, { x: -10.5, z: -18.9 }, { x: -6.5, z: -17.2 }],
  slingTarget: { x: -12, z: -8 },
};

// 퀘스트 좌표(LOC)마다 0 m 평탄 패드를 자동으로 붙인다 (판정 반경 + 여유)
function withAnchorPads(def) {
  const pads = [...def.pads];
  const add = (p, r = 2.5, blend = 2.5) => pads.push({ x: p.x, z: p.z, r, blend });
  for (const [k, v] of Object.entries(LOC)) {
    if (Array.isArray(v)) v.forEach((p) => add(p));
    else add(v, k === 'fold' ? v.r + 2 : k === 'ridgeGap' ? 5 : k === 'spring' ? 5 : v.r ? v.r + 1.5 : 3, k === 'fold' ? 4 : 2.5);
  }
  return { ...def, pads };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.circles = [];   // {x,z,r, tag}
    this.boxes = [];     // {minX,maxX,minZ,maxZ}
    this.dynamic = [];   // 매 프레임 갱신 (불꽃 등)
    this.mapFeatures = [];
    this.terrain = new Terrain(withAnchorPads(MAP1), BOUNDS);
    this.prevPos = new WeakMap(); // 이동체별 마지막으로 걸을 수 있던 위치 (가파른 곳에서 되돌리기)
    this.build();
    this.buildNav();
  }

  // 지면 높이 (경계 밖은 절벽 밑이 자연스럽게 살짝 올라감)
  heightAt(x, z) {
    const out = Math.max(BOUNDS.minX - x, x - BOUNDS.maxX, BOUNDS.minZ - z, z - BOUNDS.maxZ, 0);
    return this.terrain.heightAt(x, z) + out * 0.35;
  }

  // 캐릭터 발을 지면에 맞춘다. 게임 코드가 y를 직접 정한 경우(도약, 안고 가기 등)는 그 값을 지면 위 높이로 본다
  snapToGround(a) {
    if (!a || a.removed || a.carried || !a.pos) return;
    const o = a.pos;
    const g = this.heightAt(o.x, o.z);
    const base = a._snapY === undefined || o.y !== a._snapY ? o.y : a._snapY - a._snapG;
    o.y = base + g;
    a._snapY = o.y; a._snapG = g;
  }

  addCircle(x, z, r, tag) { const c = { x, z, r, tag }; this.circles.push(c); return c; }

  build() {
    const r = rng(7);
    const statics = [];
    // 조각 묶음을 지면 높이에 올려서 넣는다 (첫 조각 위치 기준)
    const S = (arr) => {
      if (!arr.length) return;
      const dy = this.heightAt(arr[0].pos[0], arr[0].pos[2]);
      for (const pc of arr) statics.push(dy ? { ...pc, pos: [pc.pos[0], pc.pos[1] + dy, pc.pos[2]] } : pc);
    };

    // ── 땅 ──
    this.ground = this.buildGround(r);
    this.scene.add(this.ground);

    // ── 경계: 절벽과 나무 줄 ──
    const { minX, maxX, minZ, maxZ } = BOUNDS;
    const edge = (x, z) => {
      if (r() < 0.65) S(P.cliffPieces(x, z, 1 + r() * 0.5, r));
      else S(P.treePieces(x, z, 1.2 + r() * 0.4, r));
      if (r() < 0.5) S(P.cypressPieces(x + (r() - 0.5) * 3, z + (r() - 0.5) * 3, 1 + r() * 0.4));
    };
    for (let x = minX - 2; x <= maxX + 2; x += 3.2) { edge(x, minZ - 3 - r() * 2); edge(x, maxZ + 3 + r() * 2); }
    for (let z = minZ; z <= maxZ; z += 3.2) { edge(minX - 3 - r() * 2, z); edge(maxX + 3 + r() * 2, z); }

    // ── 양 우리 (돌담 원형, 동쪽에 문) ──
    const F = LOC.fold;
    const segs = 30;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.2) continue; // 문 자리
      const x = F.x + Math.cos(a) * F.r, z = F.z + Math.sin(a) * F.r;
      S(P.wallStone(x, z, -a + Math.PI / 2, 1.55));
      this.addCircle(x, z, 0.55, 'foldwall');
    }
    // 문 기둥과 가시나무 문
    S(P.wallStone(F.x + F.r, F.z - 1.6, Math.PI / 2, 0.6));
    S(P.wallStone(F.x + F.r, F.z + 1.6, Math.PI / 2, 0.6));
    this.foldGateMesh = bakedMesh(P.thornPieces(0, 0, 0.7, r));
    this.foldGateMesh.position.set(F.x + F.r + 0.2, 0, F.z);
    this.scene.add(this.foldGateMesh);
    this.foldGateCollider = null;
    this.mapFeatures.push({ type: 'circle', x: F.x, z: F.z, r: F.r, color: '#cfc4ad', label: '양 우리' });

    // 모닥불
    this.campfire = P.campfire();
    this.campfire.position.set(LOC.campfire.x, 0, LOC.campfire.z);
    this.scene.add(this.campfire);
    this.dynamic.push(this.campfire);
    this.addCircle(LOC.campfire.x, LOC.campfire.z, 0.7);
    this.fireLight = new THREE.PointLight(0xff9a40, 0, 16, 1.6);
    this.fireLight.position.set(LOC.campfire.x, 1.3, LOC.campfire.z);
    this.scene.add(this.fireLight);

    // ── 이새의 집과 마당 ──
    const H = LOC.house;
    S(P.housePieces(H.x, H.z));
    this.boxes.push({ minX: H.x - 3.6, maxX: H.x + 3.6, minZ: H.z - 2.9, maxZ: H.z + 2.9 });
    // 마당 낮은 담 (남쪽 가운데가 열림)
    const yard = { minX: -9, maxX: 9, minZ: -37, maxZ: -23 };
    const wallLine = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 1.4);
      const rot = -Math.atan2(z1 - z0, x1 - x0);
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * (i / n), z = z0 + (z1 - z0) * (i / n);
        S(P.wallStone(x, z, rot, 1.5));
        this.addCircle(x, z, 0.55, 'yardwall');
      }
    };
    // 서쪽·동쪽 담에 쪽문 (우물 S1, 엘리압 S2 지름길)
    wallLine(yard.minX, yard.minZ, yard.minX, -31.4);
    wallLine(yard.minX, -28.6, yard.minX, yard.maxZ);
    wallLine(yard.maxX, yard.minZ, yard.maxX, -31.4);
    wallLine(yard.maxX, -28.6, yard.maxX, yard.maxZ);
    for (const gx of [yard.minX, yard.maxX]) { S(P.wallStone(gx, -32.2, Math.PI / 2, 0.6)); S(P.wallStone(gx, -27.8, Math.PI / 2, 0.6)); }
    wallLine(yard.minX, yard.maxZ, -2.5, yard.maxZ);
    wallLine(2.5, yard.maxZ, yard.maxX, yard.maxZ);
    S(P.treePieces(-6, -26, 1.1, r));
    this.addCircle(-6, -26, 0.5);
    S(P.waterTrough(6, -27));
    this.boxes.push({ minX: 5.1, maxX: 6.9, minZ: -27.35, maxZ: -26.65 });
    this.mapFeatures.push({ type: 'rect', ...yard, color: '#d9c49b', label: '집' });
    this.mapFeatures.push({ type: 'rect', minX: H.x - 3.5, maxX: H.x + 3.5, minZ: H.z - 2.75, maxZ: H.z + 2.75, color: '#a07850', fill: true });
    // 등잔 (문 앞)
    this.lamp = P.lamp();
    this.lamp.position.set(H.x + 1.2, 0, H.z + 3.3);
    this.scene.add(this.lamp);
    this.dynamic.push(this.lamp);
    this.lampLight = new THREE.PointLight(0xffb060, 0, 10, 1.6);
    this.lampLight.position.set(H.x + 1.2, 1.2, H.z + 3.6);
    this.scene.add(this.lampLight);

    // ── 우물과 노파의 오두막 (북서쪽) ──
    S(P.wellPieces(LOC.well.x, LOC.well.z));
    this.addCircle(LOC.well.x, LOC.well.z, 1.3);
    this.boxes.push({ minX: LOC.well.x + 1.4, maxX: LOC.well.x + 3.4, minZ: LOC.well.z + 0.05, maxZ: LOC.well.z + 0.75 });
    S(P.hutPieces(LOC.hut.x, LOC.hut.z));
    this.boxes.push({ minX: LOC.hut.x - 2, maxX: LOC.hut.x + 2, minZ: LOC.hut.z - 1.6, maxZ: LOC.hut.z + 1.6 });
    for (let i = 0; i < 4; i++) S(P.thornPieces(LOC.jar.x + (i % 2) * 1.6 - 0.8, LOC.jar.z + (i > 1 ? 1.2 : -1.2), 0.9, r));
    this.mapFeatures.push({ type: 'circle', x: LOC.well.x, z: LOC.well.z, r: 1.3, color: '#5aa6c8', fill: true, label: '우물' });
    this.mapFeatures.push({ type: 'rect', minX: LOC.hut.x - 2, maxX: LOC.hut.x + 2, minZ: LOC.hut.z - 1.6, maxZ: LOC.hut.z + 1.6, color: '#a07850', fill: true });
    // ── 염소 우리와 시냇물 (서브 B) ──
    S(P.goatPenPieces(LOC.goatPen.x, LOC.goatPen.z, LOC.goatPen.r));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (Math.abs(Math.sin(a) - 1) < 0.15) continue;
      this.addCircle(LOC.goatPen.x + Math.cos(a) * LOC.goatPen.r, LOC.goatPen.z + Math.sin(a) * LOC.goatPen.r, 0.35, 'pen');
    }
    const bp = LOC.brook.map((q) => [q.x, q.z]);
    this.scene.add(P.brook(bp, 1.5));
    for (let i = 0; i < bp.length - 1; i++) {
      for (let k = 0; k < 4; k++) {
        const t = (k + r()) / 4, x = bp[i][0] + (bp[i + 1][0] - bp[i][0]) * t, z = bp[i][1] + (bp[i + 1][1] - bp[i][1]) * t;
        S(P.brookStonePieces(x + (r() - 0.5) * 0.6, z + (r() < 0.5 ? -1 : 1) * (0.85 + r() * 0.3), r));
      }
    }
    this.mapFeatures.push({ type: 'circle', x: LOC.goatPen.x, z: LOC.goatPen.z, r: LOC.goatPen.r, color: '#a07850', label: '염소' });
    for (let i = 0; i < bp.length - 1; i++) this.mapFeatures.push({ type: 'line', x0: bp[i][0], z0: bp[i][1], x1: bp[i + 1][0], z1: bp[i + 1][1], color: '#5aa6c8', w: 2 });
    // 무화과나무 (남쪽 언덕)
    this.figTrees = LOC.figTrees.map((p) => {
      const t = P.figTree();
      t.position.set(p.x, 0, p.z);
      this.scene.add(t);
      this.addCircle(p.x, p.z, 0.5);
      return t;
    });
    this.mapFeatures.push({ type: 'circle', x: 8, z: 32, r: 0.1, color: '#4f7f34', label: '무화과' });

    // ── 동쪽 바위 능선 (골짜기 입구는 처음에 가시덤불로 막힘) ──
    for (let z = BOUNDS.minZ - 2; z <= BOUNDS.maxZ + 2; z += 2.2) {
      if (z > LOC.ridgeGap.z - 4 && z < LOC.ridgeGap.z + 4) continue;
      const x = 36 + Math.sin(z * 0.3) * 1.5;
      S(P.cliffPieces(x, z, 0.9 + r() * 0.3, r));
      this.addCircle(x, z, 1.9, 'ridge');
    }
    this.mapFeatures.push({ type: 'line', x0: 36, z0: BOUNDS.minZ, x1: 36, z1: LOC.ridgeGap.z - 4, color: '#8d7d64', w: 3 });
    this.mapFeatures.push({ type: 'line', x0: 36, z0: LOC.ridgeGap.z + 4, x1: 36, z1: BOUNDS.maxZ, color: '#8d7d64', w: 3 });
    this.eastBarrier = new THREE.Group();
    const barrierPieces = [];
    for (let z = LOC.ridgeGap.z - 3.5; z <= LOC.ridgeGap.z + 3.5; z += 1.2) barrierPieces.push(...P.thornPieces(36 + (r() - 0.5), z, 1.2, r));
    this.eastBarrier.add(bakedMesh(barrierPieces));
    this.scene.add(this.eastBarrier);
    this.eastBarrierColliders = [];
    for (let z = LOC.ridgeGap.z - 3.5; z <= LOC.ridgeGap.z + 3.5; z += 1.2) this.eastBarrierColliders.push(this.addCircle(36, z, 1.0, 'barrier'));

    // ── 동쪽 골짜기: 마른 강바닥, 바위, 샘, 사자 능선 ──
    for (let i = 0; i < 26; i++) {
      const x = 42 + r() * 42, z = -46 + r() * 90;
      if (Math.hypot(x - LOC.bearArena.x, z - LOC.bearArena.z) < 11) continue;
      if (Math.hypot(x - LOC.spring.x, z - LOC.spring.z) < 5) continue;
      if (Math.abs(z - 2) < 4 && x < 56) continue; // 입구 길
      const s = 0.9 + r() * 1.4;
      S(P.rockPieces(x, z, s, r, r() < 0.5 ? 0x9b8f7e : 0xa89a82));
      this.addCircle(x, z, 0.85 * s, 'rock');
    }
    // 곰 경기장 둘레의 큰 바위 (돌진이 부딪히는 곳)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const x = LOC.bearArena.x + Math.cos(a) * 11.5, z = LOC.bearArena.z + Math.sin(a) * 9.5;
      if (a > 2.7 && a < 3.6) continue; // 서쪽 입구
      S(P.rockPieces(x, z, 2.2, r, 0x958a78));
      this.addCircle(x, z, 1.8, 'bigrock');
      (this.arenaRocks = this.arenaRocks || []).push({ x, z });
    }
    // 사자 능선 (북동쪽 높은 바위)
    S(P.cliffPieces(LOC.lionRidge.x, LOC.lionRidge.z - 2, 1.6, r));
    S(P.cliffPieces(LOC.lionRidge.x + 4, LOC.lionRidge.z - 1, 1.4, r));
    this.addCircle(LOC.lionRidge.x, LOC.lionRidge.z - 2, 2.6);
    this.addCircle(LOC.lionRidge.x + 4, LOC.lionRidge.z - 1, 2.3);
    this.springMesh = P.spring();
    this.springMesh.position.set(LOC.spring.x, 0, LOC.spring.z);
    this.scene.add(this.springMesh);
    this.mapFeatures.push({ type: 'circle', x: LOC.spring.x, z: LOC.spring.z, r: 1.8, color: '#5aa6c8', fill: true });
    this.mapFeatures.push({ type: 'area', x: 62, z: 0, rx: 22, rz: 40, color: 'rgba(200,170,120,0.35)', label: '동쪽 골짜기' });

    // ── 바위 협곡 (남서쪽) ──
    const canyonRocks = [
      [-36, 18], [-34, 24], [-35, 30], [-38, 36], [-43, 44], [-46, 18], [-52, 22], [-58, 26], [-62, 30],
      [-47, 25], [-60, 36], [-40, 40],
    ];
    const inCanyon = (x, z, pad) => this.inCanyon(x, z, pad);
    for (const [x, z] of canyonRocks) {
      const s = 1.3 + r() * 1.2;
      if (inCanyon(x, z, 0.8 * s) || this.onPath(x, z, 0.8 * s)) { P.rockPieces(x, z, s, r); continue; }
      S(P.rockPieces(x, z, s, r, 0xa79478));
      this.addCircle(x, z, 0.85 * s, 'rock');
    }
    for (let i = 0; i < 14; i++) {
      const x = -36 - r() * 26, z = 20 + r() * 25;
      if (Math.hypot(x - LOC.whiteEar.x, z - LOC.whiteEar.z) < 3) continue;
      if (inCanyon(x, z, 0.9) || this.onPath(x, z, 0.9)) { P.thornPieces(x, z, 1, r); continue; } // 통로 안은 비움 (난수 순서는 유지)
      S(P.thornPieces(x, z, 0.8 + r() * 0.5, r));
      this.addCircle(x, z, 0.6, 'thorn');
    }
    this.mapFeatures.push({ type: 'area', x: -50, z: 33, rx: 15, rz: 12, color: 'rgba(170,150,110,0.35)', label: '바위 협곡' });

    // ── 들판의 나무·바위·풀 ──
    for (let i = 0; i < 70; i++) {
      const x = minX + r() * (34 - minX), z = minZ + r() * (maxZ - minZ);
      if (this.isReserved(x, z) || this.terrain.steep(x, z) || this.onPath(x, z, 0.8)) continue;
      if (r() < 0.45) { S(P.treePieces(x, z, 0.9 + r() * 0.5, r)); this.addCircle(x, z, 0.45); }
      else if (r() < 0.6) { const s = 0.5 + r() * 0.8; S(P.rockPieces(x, z, s, r)); this.addCircle(x, z, 0.75 * s); }
      else S(P.thornPieces(x, z, 0.6, r));
    }
    this.buildMarks(S, r);

    // 작은 소품(풀·꽃·자갈)은 그림자를 드리우지 않는 따로 묶음
    const smalls = [];
    const SG = (arr) => {
      if (!arr.length) return;
      const dy = this.heightAt(arr[0].pos[0], arr[0].pos[2]);
      for (const pc of arr) smalls.push({ ...pc, pos: [pc.pos[0], pc.pos[1] + dy, pc.pos[2]] });
    };
    this.buildDressing(S, SG, rng(11));
    this.buildBackdrop();

    // 정적 배경을 56 m 칸마다 합친다 (드로우콜 절약 + 화면 밖 칸은 그리지 않음)
    this.bakeChunks(statics, true);
    this.bakeChunks(smalls, false);
  }

  bakeChunks(list, cast) {
    const map = new Map();
    for (const pc of list) {
      const k = Math.floor(pc.pos[0] / 56) + ',' + Math.floor(pc.pos[2] / 56);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(pc);
    }
    for (const arr of map.values()) for (let i = 0; i < arr.length; i += 6000) {
      const mesh = bakedMesh(arr.slice(i, i + 6000));
      mesh.castShadow = cast;
      this.scene.add(mesh);
    }
  }

  // ── 꾸미기: 숲·관목·풀·들꽃·자갈·마을 소품 (data/map1.js의 군락 목록) ──
  buildDressing(S, SG, r) {
    const T = this.terrain, pads = T.def.pads;
    const inPad = (x, z, m) => pads.some((p) => p.rect
      ? x > p.rect[0] - m && x < p.rect[1] + m && z > p.rect[2] - m && z < p.rect[3] + m
      : Math.hypot(x - p.x, z - p.z) < p.r + m);
    const hits = (x, z, rad) => this.circles.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + rad) ** 2);
    const inB = (x, z, m) => x > BOUNDS.minX + m && x < BOUNDS.maxX - m && z > BOUNDS.minZ + m && z < BOUNDS.maxZ - m;
    // 길을 막을 수 있는 큰 소품이 놓여도 되는 곳
    const solidOk = (x, z, rad) => inB(x, z, 1.5) && !T.steep(x, z) && !inPad(x, z, rad + 0.6) && !this.onPath(x, z, rad + 0.8)
      && !this.inCanyon(x, z, rad + 0.6) && !hits(x, z, rad + 0.5) && !(x > 34 && x < 38.5);
    const tryPlace = (cx, cz, rad, tries, fn) => {
      for (let k = 0; k < tries; k++) {
        const a = r() * 6.283, d = Math.sqrt(r()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (fn(x, z)) return true;
      }
      return false;
    };

    // 숲 군락
    for (const g of MAP1.groves) for (let i = 0; i < g.n; i++) tryPlace(g.x, g.z, g.r, 14, (x, z) => {
      const big = g.kind === 'olive' || g.kind === 'carob';
      if (!solidOk(x, z, big ? 0.9 : 0.5)) return false;
      const s = 0.9 + r() * 0.4;
      if (g.kind === 'olive') { S(P.olivePieces(x, z, s, r)); this.addCircle(x, z, 0.4); }
      else if (g.kind === 'carob') { S(P.carobPieces(x, z, s, r)); this.addCircle(x, z, 0.45); }
      else if (g.kind === 'tamarisk') { S(P.tamariskPieces(x, z, s, r)); this.addCircle(x, z, 0.3); }
      else { S(P.deadTreePieces(x, z, s, r)); this.addCircle(x, z, 0.2); }
      return true;
    });

    // 흩어진 큰 바위 (고원 위, 골짜기 비탈, 들판 가장자리)
    for (let i = 0; i < 70; i++) {
      const x = BOUNDS.minX + r() * (BOUNDS.maxX - BOUNDS.minX), z = BOUNDS.minZ + r() * (BOUNDS.maxZ - BOUNDS.minZ);
      const h = this.heightAt(x, z);
      const want = h > 1.5 || x > 38 || Math.abs(x - BOUNDS.minX) < 8 || Math.abs(z - BOUNDS.minZ) < 6 || Math.abs(z - BOUNDS.maxZ) < 6;
      const s = 0.6 + r() * 1.1;
      if (!want || !solidOk(x, z, 0.8 * s)) continue;
      S(P.rockPieces(x, z, s, r, [0x9b8f7e, 0xa89a82, 0xb3a68c][i % 3]));
      if (s > 0.75) this.addCircle(x, z, 0.75 * s, s > 1.2 ? 'rock' : undefined);
    }

    // 관목 (충돌 없음): 들판·고원·골짜기 / 협곡 벽에 매달린 덤불
    for (let i = 0; i < 260; i++) {
      const x = BOUNDS.minX + r() * (BOUNDS.maxX - BOUNDS.minX), z = BOUNDS.minZ + r() * (BOUNDS.maxZ - BOUNDS.minZ);
      if (!inB(x, z, 0.5) || T.steep(x, z) || this.onPath(x, z, 0.6) || inPad(x, z, 0.5)) continue;
      const h = this.heightAt(x, z);
      SG(P.bushPieces(x, z, 0.7 + r() * 0.6, r, x > 37 || h > 2.5 ? 1 : r() < 0.5 ? 0 : 2));
    }
    for (let i = 0; i < 500; i++) {
      const x = -66 + r() * 36, z = 10 + r() * 36;
      const h = this.heightAt(x, z);
      if (!T.steep(x, z) || h < 1.2 || h > 7) continue;
      SG(P.bushPieces(x, z, 0.5 + r() * 0.4, r, 2));
    }
    // 협곡 바닥 가장자리 자갈, 와디 강바닥 자갈
    for (let i = 0; i < 160; i++) {
      const x = -64 + r() * 36, z = 10 + r() * 36;
      if (this.inCanyon(x, z, 0) && !this.inCanyon(x, z, -1.2)) SG(P.pebbles(x, z, r));
    }
    for (let i = 0; i < 90; i++) {
      const x = 38 + r() * 48, z = 2 + Math.sin(x * 0.12) * 5 + (r() - 0.5) * 8;
      SG(P.pebbles(x, z, r, 0xc2b394));
    }

    // 풀 포기 (높이·지역마다 색이 다름)
    for (let i = 0; i < 3000; i++) {
      const x = BOUNDS.minX + r() * (BOUNDS.maxX - BOUNDS.minX), z = BOUNDS.minZ + r() * (BOUNDS.maxZ - BOUNDS.minZ);
      if (T.steep(x, z) || this.onPath(x, z, 0.1)) continue;
      if (x > -10.5 && x < 10.5 && z > -44 && z < -22) continue; // 마당
      const h = this.heightAt(x, z);
      let tone = r() < 0.5 ? 0x7f9a48 : 0x8aa250;
      if (x > 37) { if (r() < 0.55) continue; tone = 0xa0a060; }
      else if (this.inCanyon(x, z, 0)) { if (r() < 0.6) continue; tone = 0x8a9450; }
      else if (h > 2.5) tone = r() < 0.5 ? 0x9a9a52 : 0xa6a35e;
      SG(P.grassClump(x, z, r, tone));
    }

    // 들꽃 밭
    for (const m of MAP1.meadows) for (let i = 0; i < m.n; i++) tryPlace(m.x, m.z, m.r, 6, (x, z) => {
      if (T.steep(x, z) || this.onPath(x, z, 0.3) || hits(x, z, 0.2)) return false;
      SG(P.flowerPatch(x, z, r, m.colors[Math.floor(r() * m.colors.length)]));
      return true;
    });

    // 마을·목장 소품
    for (const v of MAP1.village) {
      const { x, z } = v;
      switch (v.kind) {
        case 'jars': S(P.jarCluster(x, z, r)); this.addCircle(x, z, 0.75); break;
        case 'wood': S(P.woodStack(x, z, r() * 3)); this.addCircle(x, z, 0.75); break;
        case 'mill': S(P.millstone(x, z)); this.addCircle(x, z, 0.8); break;
        case 'garden': SG(P.gardenRows(x, z, 6, 4)); break;
        case 'threshing': SG(P.threshingFloor(x, z, 3.5, r)); break;
        case 'hay': S(P.hayPile(x, z, 1.1)); this.addCircle(x, z, 1.0); break;
        case 'trough': S(P.stoneTrough(x, z, 0.4)); this.addCircle(x, z, 0.8); break;
        case 'bones': SG(P.bones(x, z, r)); break;
      }
    }
  }

  // ── 원경: 경계 밖 산 능선 3겹 (걸을 수 없음, 안개 속으로 흐려짐) ──
  buildBackdrop() {
    const r = rng(23), pieces = [];
    const cx = (BOUNDS.minX + BOUNDS.maxX) / 2, cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2;
    const hx = (BOUNDS.maxX - BOUNDS.minX) / 2, hz = (BOUNDS.maxZ - BOUNDS.minZ) / 2;
    const layers = [{ d: 30, step: 13, h: [6, 12], col: [0x8f9468, 0x9a9a72] }, { d: 58, step: 19, h: [12, 22], col: [0x9da48a, 0xa6ab90] }, { d: 95, step: 28, h: [20, 36], col: [0xaab3a6, 0xb4bbb0] }];
    for (const L of layers) {
      const W = hx + L.d, D = hz + L.d, per = 4 * (W + D);
      for (let t = 0; t < per; t += L.step * (0.7 + r() * 0.6)) {
        let x, z, u = t;
        if (u < 2 * W) { x = cx - W + u; z = cz - D; }
        else if ((u -= 2 * W) < 2 * D) { x = cx + W; z = cz - D + u; }
        else if ((u -= 2 * D) < 2 * W) { x = cx + W - u; z = cz + D; }
        else { u -= 2 * W; x = cx - W; z = cz + D - u; }
        const h = L.h[0] + r() * (L.h[1] - L.h[0]), R = L.step * (0.9 + r() * 0.5);
        pieces.push({ geo: G.dodeca(1), color: L.col[Math.floor(r() * 2)], pos: [x + (r() - 0.5) * 6, h * 0.25, z + (r() - 0.5) * 6], rot: [r() * 0.4, r() * 6, r() * 0.4], scale: [R, h, R] });
      }
    }
    // 경계 밖 바닥 (빈 하늘이 보이지 않게)
    const under = new THREE.Mesh(new THREE.PlaneGeometry(520, 460), new THREE.MeshLambertMaterial({ color: 0x8f9a5c }));
    under.rotation.x = -Math.PI / 2; under.position.set(cx, -0.6, cz);
    this.scene.add(under);
    const m = bakedMesh(pieces, 0.05);
    m.castShadow = false; m.receiveShadow = false;
    this.scene.add(m);
  }

  // 협곡 통로·공터·경사로 안인가 (소품을 두지 않는 곳)
  inCanyon(x, z, pad = 0) {
    for (const c of MAP1.carves) {
      const { d, w } = lineDist(x, z, c.pts, c.widths);
      if (d < w + pad) return true;
      if (c.pockets.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + pad)) return true;
    }
    return MAP1.ramps.some((rp) => lineDist(x, z, rp.pts).d < rp.w + 1.5 + pad);
  }

  // 흙길 위인가 (원래 큰길 2개 + map1.js의 오솔길)
  onPath(x, z, m = 0) {
    if ((Math.abs(z - 4 - Math.sin(x * 0.08) * 1.2) < 1.3 + m && x > -17 && x < 60) ||
      (Math.abs(x - Math.sin(z * 0.1)) < 1.2 + m && z < 4 && z > -24)) return true;
    for (const p of MAP1.paths) if (lineDist(x, z, p.pts).d < p.w + m) return true;
    return false;
  }

  // 랜드마크·숨은 장소·전망 지점 (그레이박스 표식, 상호작용 없음)
  buildMarks(S, r) {
    for (const m of MAP1.marks) {
      const { x, z } = m;
      switch (m.kind) {
        case 'terebinth': S(P.treePieces(x, z, 2.3, r)); this.addCircle(x, z, 0.9); break;
        case 'olive': S(P.treePieces(x, z, 1.4, r)); this.addCircle(x, z, 0.5); break;
        case 'lonetree': S(P.treePieces(x, z, 1.6, r)); this.addCircle(x, z, 0.6); break;
        case 'cairn':
          S([0, 1, 2, 3].map((i) => ({ geo: G.dodeca(0.5 - i * 0.1), color: 0xb8ab92, pos: [x + (i % 2) * 0.1, 0.3 + i * 0.42, z], rot: [i, i * 2, 0] })));
          this.addCircle(x, z, 0.6); break;
        case 'arch':
          S(P.rockPieces(x - 1.6, z, 1.6, r)); S(P.rockPieces(x + 1.6, z, 1.6, r)); break;
        case 'bench':
          S(P.wallStone(x, z, 0.4, 1.4)); this.addCircle(x, z, 0.7); break;
        case 'ruin':
          for (let i = 0; i < 12; i++) { if (i % 4 === 1) continue; const a = (i / 12) * Math.PI * 2; S(P.wallStone(x + Math.cos(a) * 4, z + Math.sin(a) * 4, -a + Math.PI / 2, 1.2)); }
          break;
      }
      this.mapFeatures.push({ type: 'circle', x, z, r: 0.6, color: m.id[0] === 'V' ? '#6f8a3a' : '#b07a30', fill: true });
    }
    // 높은 땅 표시 (미니맵)
    this.mapFeatures.push({ type: 'area', x: -54, z: 34, rx: 16, rz: 14, color: 'rgba(150,130,90,0.25)' });
    this.mapFeatures.push({ type: 'area', x: 21, z: 42, rx: 9, rz: 6, color: 'rgba(150,130,90,0.25)' });
    this.mapFeatures.push({ type: 'area', x: 26, z: -38, rx: 9, rz: 11, color: 'rgba(150,130,90,0.25)' });
  }

  isReserved(x, z) {
    const near = (p, d) => Math.hypot(x - p.x, z - p.z) < d;
    if (near(LOC.fold, 12)) return true;
    if (x > -13 && x < 13 && z < -20) return true;
    if (near(LOC.campfire, 4) || near(LOC.lostSheep, 4)) return true;
    if (x < -33 && z > 15) return true; // 협곡은 따로 배치
    if (Math.abs(z - 4) < 3 && x > -16) return true; // 동쪽 길
    if (Math.abs(x - 0) < 2.5 && z < 5 && z > -23) return true; // 집 가는 길
    if (near(LOC.well, 7) || near(LOC.hut, 5) || near(LOC.jar, 3) || near(LOC.eliab, 4) || near(LOC.hurtSheep, 3)) return true;
    if (x > -2 && x < 18 && z > 24 && z < 40) return true; // 무화과 언덕
    for (const h of LOC.hyssop) if (near(h, 2)) return true;
    if (near(LOC.goatPen, 4.5) || near(LOC.slingTarget, 2.5)) return true;
    for (const b of LOC.brook) if (near(b, 4)) return true;
    return false;
  }

  buildGround(r) {
    const W = BOUNDS.maxX - BOUNDS.minX + 40, D = BOUNDS.maxZ - BOUNDS.minZ + 40;
    const geo = new THREE.PlaneGeometry(W, D, Math.round(W / 1.25), Math.round(D / 1.25)).toNonIndexed();
    geo.rotateX(-Math.PI / 2);
    geo.translate((BOUNDS.minX + BOUNDS.maxX) / 2, 0, (BOUNDS.minZ + BOUNDS.maxZ) / 2);
    const pos = geo.attributes.position;
    // 가장자리만 살짝 올려서 절벽 밑이 자연스럽게
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const out = Math.max(BOUNDS.minX - x, x - BOUNDS.maxX, BOUNDS.minZ - z, z - BOUNDS.maxZ, 0);
      const n = Math.sin(x * 0.37 + z * 0.21) * 0.08 + Math.sin(x * 0.11 - z * 0.17) * 0.12;
      const th = this.terrain.heightAt(x, z);
      // 앵커 평지(0 m)에서는 잡음을 줄여 발이 뜨거나 묻히지 않게
      pos.setY(i, th + n * (th > 0.05 ? 1 : 0.4) + out * 0.35);
    }
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      c.set(this.groundColor(x, z));
      const v = 0.94 + r() * 0.1;
      for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r * v; col[(i + j) * 3 + 1] = c.g * v; col[(i + j) * 3 + 2] = c.b * v; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.receiveShadow = true;
    return mesh;
  }

  groundColor(x, z) {
    // 높이 지형: 가파른 벽은 석회암, 높은 곳은 마른 풀
    const tg = this.terrain.gradAt(x, z), th = this.terrain.heightAt(x, z);
    if (tg > this.terrain.maxGrad) return th > 1 && x < 34 && x > -66 ? 0xb5a688 : 0xa89a80;
    if (tg > 0.45) return 0x9c9470;
    if (th > 2.5) return 0xa3a065;
    // 길
    if (this.onPath(x, z)) return th > 2 ? 0xb39a72 : 0xb9a274;
    if (x > 37) { // 마른 골짜기
      const riverbed = Math.abs(z - 2 - Math.sin(x * 0.12) * 5) < 5;
      return riverbed ? 0xc9b48c : 0xa8a065;
    }
    if (x < -33 && z > 16) return 0xa4986c; // 협곡 흙
    if (Math.hypot(x - LOC.fold.x, z - LOC.fold.z) < LOC.fold.r) return 0x9a9a5a;
    if (x > -9 && x < 9 && z > -37 && z < -23) return 0xc8b58a;
    return 0x8fa456;
  }

  openEastValley() {
    this.scene.remove(this.eastBarrier);
    this.circles = this.circles.filter((c) => !this.eastBarrierColliders.includes(c));
    this.buildNav();
  }

  closeFoldGate(closed) {
    if (closed && !this.foldGateCollider) this.foldGateCollider = this.addCircle(LOC.fold.x + LOC.fold.r, LOC.fold.z, 1.4, 'gate');
    if (!closed && this.foldGateCollider) { this.circles = this.circles.filter((c) => c !== this.foldGateCollider); this.foldGateCollider = null; }
    this.buildNav();
    this.foldGateMesh.position.z = LOC.fold.z + (closed ? 0 : 2.2);
  }


  // ───────── 길찾기 (1m 격자 + A*) ─────────
  // 장애물(원·상자)을 격자에 표시하고, 막혀 있으면 돌아가는 길을 찾는다.
  buildNav() {
    const C = 1, pad = 0.55; // 칸 크기, 이동체 여유 반경
    const W = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / C) + 1, H = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / C) + 1;
    const g = new Uint8Array(W * H);
    const mark = (x0, z0, x1, z1, test) => {
      for (let j = Math.max(0, Math.floor((z0 - BOUNDS.minZ) / C)); j <= Math.min(H - 1, Math.ceil((z1 - BOUNDS.minZ) / C)); j++)
        for (let i = Math.max(0, Math.floor((x0 - BOUNDS.minX) / C)); i <= Math.min(W - 1, Math.ceil((x1 - BOUNDS.minX) / C)); i++)
          if (test(BOUNDS.minX + i * C, BOUNDS.minZ + j * C)) g[j * W + i] = 1;
    };
    for (const c of this.circles) {
      const r = c.r + pad;
      mark(c.x - r, c.z - r, c.x + r, c.z + r, (x, z) => (x - c.x) ** 2 + (z - c.z) ** 2 < r * r);
    }
    for (const b of this.boxes) mark(b.minX - pad, b.minZ - pad, b.maxX + pad, b.maxZ + pad, () => true);
    // 가파른 지형 (협곡 벽, 능선, 고원 가장자리)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (this.terrain.steep(BOUNDS.minX + i * C, BOUNDS.minZ + j * C)) g[j * W + i] = 1;
    this.nav = { C, W, H, g };
  }
  navCell(x, z) {
    const { C, W, H } = this.nav;
    return [Math.max(0, Math.min(W - 1, Math.round((x - BOUNDS.minX) / C))), Math.max(0, Math.min(H - 1, Math.round((z - BOUNDS.minZ) / C)))];
  }
  navBlocked(i, j) { const { W, H, g } = this.nav; return i < 0 || j < 0 || i >= W || j >= H || g[j * W + i] === 1; }
  // 두 점 사이가 막혀 있지 않은가 (격자 위 직선 검사)
  lineClear(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.5);
    for (let k = 1; k < n; k++) {
      const [i, j] = this.navCell(a.x + (b.x - a.x) * (k / n), a.z + (b.z - a.z) * (k / n));
      if (this.navBlocked(i, j)) return false;
    }
    return true;
  }
  // 가장 가까운 빈칸
  nearestFree(i, j) {
    if (!this.navBlocked(i, j)) return [i, j];
    for (let r = 1; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++)
      if (!this.navBlocked(i + di, j + dj)) return [i + di, j + dj];
    return [i, j];
  }
  findPath(a, b) {
    const { C, W, g } = this.nav;
    const [si, sj] = this.nearestFree(...this.navCell(a.x, a.z));
    const [ti, tj] = this.nearestFree(...this.navCell(b.x, b.z));
    const start = sj * W + si, goal = tj * W + ti;
    const cost = new Map([[start, 0]]), from = new Map();
    const open = [[Math.hypot(ti - si, tj - sj), start]];
    let iter = 0;
    while (open.length && iter++ < 6000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === goal) break;
      const ci = cur % W, cj = (cur - ci) / W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (this.navBlocked(ni, nj)) continue;
        if (di && dj && (this.navBlocked(ci + di, cj) || this.navBlocked(ci, cj + dj))) continue; // 모서리 끼임 방지
        const nk = nj * W + ni, nc = cost.get(cur) + (di && dj ? 1.414 : 1);
        if (nc < (cost.get(nk) ?? Infinity)) {
          cost.set(nk, nc); from.set(nk, cur);
          open.push([nc + Math.hypot(ti - ni, tj - nj), nk]);
        }
      }
    }
    if (!from.has(goal)) return null;
    const pts = [];
    for (let k = goal; k !== start; k = from.get(k)) pts.push({ x: BOUNDS.minX + (k % W) * C, z: BOUNDS.minZ + Math.floor(k / W) * C });
    pts.reverse();
    // 직선으로 갈 수 있는 중간점은 건너뛴다
    const out = [];
    let anchor = a;
    for (let k = 0; k < pts.length; k++) {
      if (k === pts.length - 1 || !this.lineClear(anchor, pts[k + 1])) { out.push(pts[k]); anchor = pts[k]; }
    }
    return out;
  }
  // 이동체가 지금 향할 지점: 직선이 열려 있으면 목표, 아니면 경로의 다음 지점
  steer(agent, target) {
    if (this.lineClear(agent.pos, target)) { agent._path = null; return target; }
    const now = performance.now();
    const p = agent._path;
    if (!p || now - p.t > 600 || Math.hypot(p.tx - target.x, p.tz - target.z) > 2) {
      agent._path = { pts: this.findPath(agent.pos, target) || [], t: now, tx: target.x, tz: target.z };
    }
    const pts = agent._path.pts;
    while (pts.length > 1 && Math.hypot(pts[0].x - agent.pos.x, pts[0].z - agent.pos.z) < 0.9) pts.shift();
    // 다음 지점 다음이 바로 보이면 건너뛰기
    if (pts.length > 1 && this.lineClear(agent.pos, pts[1])) pts.shift();
    return pts[0] || target;
  }

  // 원 하나(이동체)를 장애물 밖으로 밀어낸다
  resolve(p, radius) {
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
    for (const b of this.boxes) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * radius; p.z = cz + (dz / d) * radius;
        } else {
          p.z = b.maxZ + radius;
        }
      }
    }
    p.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, p.x));
    p.z = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, p.z));
    // 가파른 곳으로는 못 들어감: 한 축씩 되돌려 벽을 따라 미끄러지게
    const T = this.terrain, last = this.prevPos.get(p);
    if (last && T.steep(p.x, p.z)) {
      if (!T.steep(last.x, p.z)) p.x = last.x;
      else if (!T.steep(p.x, last.z)) p.z = last.z;
      else { p.x = last.x; p.z = last.z; }
    }
    if (!T.steep(p.x, p.z)) {
      if (last) { last.x = p.x; last.z = p.z; } else if (typeof p === 'object') this.prevPos.set(p, { x: p.x, z: p.z });
    }
  }

  // 카메라를 가리는 큰 장애물(바위·절벽·집) 안인가. 낮은 돌담·가시덤불은 넘겨 본다
  camBlocked(x, z, y) {
    if (y !== undefined && this.heightAt(x, z) > y - 0.35) return true; // 지형(협곡 벽·능선·언덕)이 카메라보다 높음
    for (const c of this.circles) {
      const tall = c.tag === 'rock' || c.tag === 'bigrock' || c.tag === 'ridge' || c.tag === 'barrier' || (!c.tag && c.r >= 1);
      if (tall && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.25) ** 2) return true;
    }
    for (const b of this.boxes) if (x > b.minX - 0.25 && x < b.maxX + 0.25 && z > b.minZ - 0.25 && z < b.maxZ + 0.25) return true;
    return false;
  }

  // 이동 중 장애물에 부딪혔는지 (돌진 판정)
  hitsObstacle(x, z, radius, tags) {
    for (const c of this.circles) {
      if (tags && !tags.includes(c.tag)) continue;
      if (Math.hypot(x - c.x, z - c.z) < c.r + radius) return true;
    }
    return x <= BOUNDS.minX || x >= BOUNDS.maxX || z <= BOUNDS.minZ || z >= BOUNDS.maxZ;
  }

  update(dt, time) {
    for (const d of this.dynamic) {
      for (const f of d.userData.flames || []) {
        f.scale.y = 0.85 + Math.sin(time * 18 + f.id) * 0.15;
        f.scale.x = f.scale.z = 0.9 + Math.sin(time * 13 + f.id * 2) * 0.1;
      }
    }
    if (this.fireLight.intensity > 0) this.fireLight.intensity = this.fireBase * (0.9 + Math.sin(time * 17) * 0.1);
  }
}

// 시간대 조명 프리셋
export const LIGHTING = {
  night:   { sky: 0x0d1530, fog: [0x0d1530, 28, 70], hemi: [0x5a72b0, 0x22222c, 0.95], sun: [0x8aa2e0, 0.85], fire: 22, lamp: 6 },
  morning: { sky: 0xd8e0d8, fog: [0xd8e0d8, 30, 90], hemi: [0xf0f0e0, 0x6a6a4a, 1.0], sun: [0xfff0d0, 1.5], fire: 0, lamp: 0 },
  day:     { sky: 0xa8d0ec, fog: [0xa8d0ec, 45, 110], hemi: [0xffffff, 0x77704e, 1.0], sun: [0xfff6e0, 1.8], fire: 0, lamp: 0 },
  evening: { sky: 0x3a2f4a, fog: [0x3a2f4a, 28, 80], hemi: [0x8a6a8a, 0x2a2018, 0.8], sun: [0xff9a60, 0.9], fire: 18, lamp: 8 },
  dawn:    { sky: 0xe8b090, fog: [0xe8b090, 35, 95], hemi: [0xffd8c0, 0x5a4a40, 1.0], sun: [0xffc090, 1.4], fire: 0, lamp: 0 },
};
