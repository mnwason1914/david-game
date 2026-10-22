// 소품·배경 모델 (절차적 로우폴리). 각 함수는 bake()용 조각 목록 또는 메시를 돌려준다.
// 나중에 glb로 바꾸려면 world.js에서 해당 함수 호출 대신 glb를 배치하면 된다.
import * as THREE from 'three';
import { G, part, bakedMesh, mat } from './lowpoly.js';

// ── 무기 ──
export const WEAPON_MODELS = {
  staff() {
    const g = new THREE.Group();
    // 손 위치 기준 -y 방향이 팔이 뻗는 방향. 지팡이는 손에서 앞쪽으로 1.2m, 뒤로 0.4m.
    g.add(part(G.cyl(0.035, 0.04, 1.6, 5), 0x8a6238, [0, -0.6, 0]));
    // 목자 지팡이의 굽은 끝
    g.add(part(G.cyl(0.035, 0.035, 0.32, 5), 0x8a6238, [0.1, -1.42, 0], [0, 0, 1.0]));
    g.add(part(G.cyl(0.035, 0.035, 0.22, 5), 0x8a6238, [0.24, -1.32, 0], [0, 0, -0.3]));
    return g;
  },
};

// ── 배경 조각 (bake용) ──
export function treePieces(x, z, s = 1, r = Math.random) {
  const h = (1.6 + r() * 0.8) * s;
  const lean = (r() - 0.5) * 0.25;
  const leaf = [0x5f7d3a, 0x6b8a40, 0x55733a][Math.floor(r() * 3)];
  return [
    { geo: G.cyl(0.14 * s, 0.24 * s, h, 5), color: 0x6a4d32, pos: [x, h / 2, z], rot: [lean, 0, lean] },
    { geo: G.ico(1.1 * s), color: leaf, pos: [x + lean * h, h + 0.5 * s, z], scale: [1.2, 0.8, 1.2] },
    { geo: G.ico(0.8 * s), color: leaf, pos: [x + 0.6 * s, h + 0.2 * s, z + 0.3 * s], scale: [1, 0.75, 1] },
  ];
}

export function cypressPieces(x, z, s = 1) {
  return [
    { geo: G.cyl(0.1 * s, 0.15 * s, 0.8 * s, 5), color: 0x5a4030, pos: [x, 0.4 * s, z] },
    { geo: G.cone(0.7 * s, 3.4 * s, 6), color: 0x3f5f32, pos: [x, 2.3 * s, z] },
  ];
}

export function rockPieces(x, z, s = 1, r = Math.random, color = 0x9b8f7e) {
  return [
    { geo: G.dodeca(0.8 * s), color, pos: [x, 0.35 * s, z], rot: [r() * 3, r() * 3, r() * 3], scale: [1.2, 0.75, 1] },
  ];
}

export function cliffPieces(x, z, s = 1, r = Math.random) {
  const out = [];
  const tones = [0xb09a7c, 0xa38e72, 0xbca684];
  for (let i = 0; i < 3; i++) {
    out.push({
      geo: G.dodeca(1.6 * s),
      color: tones[i % 3],
      pos: [x + (r() - 0.5) * 2 * s, (1.0 + i * 0.9) * s, z + (r() - 0.5) * 2 * s],
      rot: [r() * 3, r() * 3, r() * 3],
      scale: [1.3 - i * 0.25, 1.2, 1.3 - i * 0.25],
    });
  }
  return out;
}

export function thornPieces(x, z, s = 1, r = Math.random) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    out.push({
      geo: G.cone(0.45 * s, 0.9 * s, 5),
      color: [0x4f5a2a, 0x5d6630, 0x47502a][i % 3],
      pos: [x + (r() - 0.5) * 0.9 * s, 0.4 * s, z + (r() - 0.5) * 0.9 * s],
      rot: [(r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6],
    });
  }
  return out;
}

export function grassTuft(x, z, r = Math.random) {
  return [{ geo: G.cone(0.12, 0.35, 3), color: 0x7f9a48, pos: [x, 0.15, z], rot: [0, r() * 3, (r() - 0.5) * 0.4] }];
}

export function wallStone(x, z, rotY, len = 1.3) {
  return [
    { geo: G.box(len, 0.55, 0.55), color: 0xa49a88, pos: [x, 0.28, z], rot: [0, rotY, 0] },
    { geo: G.box(len * 0.8, 0.35, 0.45), color: 0xb5ab98, pos: [x, 0.7, z], rot: [0, rotY + 0.08, 0] },
  ];
}

// 이새의 집 (흙벽돌 + 평지붕)
export function housePieces(x, z) {
  return [
    { geo: G.box(7, 3.2, 5.5), color: 0xcdb48c, pos: [x, 1.6, z] },
    { geo: G.box(7.6, 0.35, 6.1), color: 0x8a6a48, pos: [x, 3.35, z] },
    { geo: G.box(1.3, 2.1, 0.2), color: 0x5a3e26, pos: [x, 1.05, z + 2.78] },
    { geo: G.box(0.8, 0.7, 0.2), color: 0x3a2a1c, pos: [x + 2.2, 2.1, z + 2.78] },
    { geo: G.box(0.8, 0.7, 0.2), color: 0x3a2a1c, pos: [x - 2.2, 2.1, z + 2.78] },
    // 지붕 위 난간
    { geo: G.box(7.6, 0.4, 0.25), color: 0xbfa47e, pos: [x, 3.7, z + 2.95] },
    // 항아리
    { geo: G.cyl(0.25, 0.35, 0.8, 6), color: 0xa8643a, pos: [x + 3, 0.4, z + 3.3] },
    { geo: G.cyl(0.2, 0.3, 0.6, 6), color: 0xa8643a, pos: [x + 3.6, 0.3, z + 3.1] },
  ];
}

export function waterTrough(x, z) {
  return [{ geo: G.box(1.8, 0.5, 0.7), color: 0x8f8574, pos: [x, 0.25, z] }];
}

// ── 개별 메시 소품 ──
export function campfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    g.add(part(G.box(0.9, 0.14, 0.14), 0x5a3a20, [0, 0.08, 0], [0, i * Math.PI / 4, 0]));
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.add(part(G.dodeca(0.16), 0x8a8274, [Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6]));
  }
  const flame = new THREE.Mesh(G.cone(0.3, 0.8, 5), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  flame.position.y = 0.45;
  const flame2 = new THREE.Mesh(G.cone(0.16, 0.5, 5), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
  flame2.position.y = 0.4;
  g.add(flame, flame2);
  g.userData.flames = [flame, flame2];
  return g;
}

export function torch() {
  const g = new THREE.Group();
  g.add(part(G.cyl(0.03, 0.04, 0.6, 5), 0x5a3a20, [0, -0.25, 0]));
  const f = new THREE.Mesh(G.cone(0.08, 0.22, 5), new THREE.MeshBasicMaterial({ color: 0xffb050 }));
  f.position.y = 0.12;
  g.add(f);
  g.userData.flames = [f];
  return g;
}

export function lamp() {
  const g = new THREE.Group();
  g.add(part(G.cyl(0.12, 0.16, 0.12, 6), 0xa8643a, [0, 0.06, 0]));
  const f = new THREE.Mesh(G.cone(0.05, 0.14, 4), new THREE.MeshBasicMaterial({ color: 0xffc060 }));
  f.position.y = 0.2;
  g.add(f);
  g.userData.flames = [f];
  return g;
}

export function sack() {
  const g = new THREE.Group();
  g.add(part(G.ico(0.32), 0xa58a5a, [0, 0.25, 0], [0, 0, 0], [1, 0.8, 1]));
  g.add(part(G.cyl(0.06, 0.12, 0.18, 5), 0x8a7048, [0, 0.55, 0]));
  return g;
}

// 살짝 빛나는 단서/표식
export function glowMarker(color = 0xfff2b0) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(G.ico(0.18), new THREE.MeshBasicMaterial({ color }));
  core.position.y = 0.3;
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.55, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.03;
  g.add(core, halo);
  g.userData.pulse = halo;
  return g;
}

export function woolTuft() {
  const g = new THREE.Group();
  g.add(part(G.ico(0.15), 0xffffff, [0, 0.12, 0]));
  g.add(part(G.ico(0.1), 0xf4f0e8, [0.12, 0.08, 0.05]));
  return g;
}

export function spring() {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.6, 9), new THREE.MeshLambertMaterial({ color: 0x5aa6c8, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.04;
  g.add(water);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.add(part(G.dodeca(0.3), 0x9a917e, [Math.cos(a) * 1.75, 0.1, Math.sin(a) * 1.75]));
  }
  return g;
}

// 바닥 표시 (공격 예고 범위)
export function groundCircle(radius, color = 0xff3b2f) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.renderOrder = 2;
  return m;
}

export function groundRect(w, len, color = 0xff3b2f) {
  const geo = new THREE.PlaneGeometry(w, len);
  geo.translate(0, len / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.renderOrder = 2;
  return m;
}

// 목표 방향 화살표 (플레이어 발밑)
export function arrowMarker() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.55);
  shape.lineTo(0.35, 0);
  shape.lineTo(0.12, 0);
  shape.lineTo(0.12, -0.35);
  shape.lineTo(-0.12, -0.35);
  shape.lineTo(-0.12, 0);
  shape.lineTo(-0.35, 0);
  shape.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group();
  m.position.z = -1.6;
  m.rotation.z = 0;
  g.add(m);
  g.position.y = 0.08;
  return g;
}

// 무리 양 (정적 합친 메시, 드로우콜 1개)
let sheepGeo = null;
export function flockSheepMesh() {
  if (!sheepGeo) {
    const m = bakedMesh([
      { geo: G.ico(0.5, 1), color: 0xf1ece0, pos: [0, 0.68, 0], scale: [0.75, 0.62, 1.05] },
      { geo: G.box(0.26, 0.24, 0.3), color: 0x3a3028, pos: [0, 0.82, 0.55] },
      { geo: G.box(0.16, 0.05, 0.07), color: 0x3a3028, pos: [0.17, 0.87, 0.5], rot: [0, 0, -0.4] },
      { geo: G.box(0.16, 0.05, 0.07), color: 0x3a3028, pos: [-0.17, 0.87, 0.5], rot: [0, 0, 0.4] },
      { geo: G.box(0.12, 0.45, 0.12), color: 0x3a3028, pos: [0.2, 0.22, 0.3] },
      { geo: G.box(0.12, 0.45, 0.12), color: 0x3a3028, pos: [-0.2, 0.22, 0.3] },
      { geo: G.box(0.12, 0.45, 0.12), color: 0x3a3028, pos: [0.2, 0.22, -0.3] },
      { geo: G.box(0.12, 0.45, 0.12), color: 0x3a3028, pos: [-0.2, 0.22, -0.3] },
    ], 0.05);
    sheepGeo = m.geometry;
  }
  const mesh = new THREE.Mesh(sheepGeo, mat(0xffffff, { vertexColors: true }));
  mesh.castShadow = true;
  return mesh;
}

// 수금 (작은 리라)
export function harp() {
  const g = new THREE.Group();
  g.add(part(G.box(0.5, 0.08, 0.12), 0x8a5a30, [0, 0.05, 0]));
  g.add(part(G.box(0.07, 0.6, 0.07), 0x8a5a30, [-0.22, 0.32, 0], [0, 0, 0.15]));
  g.add(part(G.box(0.07, 0.6, 0.07), 0x8a5a30, [0.22, 0.32, 0], [0, 0, -0.15]));
  g.add(part(G.box(0.62, 0.06, 0.07), 0x6a4020, [0, 0.62, 0]));
  for (let i = 0; i < 4; i++) g.add(part(G.box(0.012, 0.55, 0.012), 0xf0e0b0, [-0.12 + i * 0.08, 0.34, 0]));
  return g;
}

// 우물 (돌 원통 + 지붕 기둥 + 두레박)
export function wellPieces(x, z) {
  return [
    { geo: G.cyl(1.1, 1.2, 0.9, 9), color: 0xa49a88, pos: [x, 0.45, z] },
    { geo: G.cyl(0.85, 0.85, 0.92, 9), color: 0x2a3a48, pos: [x, 0.47, z] },
    { geo: G.box(0.14, 2.2, 0.14), color: 0x6a4a2a, pos: [x - 1.0, 1.1, z] },
    { geo: G.box(0.14, 2.2, 0.14), color: 0x6a4a2a, pos: [x + 1.0, 1.1, z] },
    { geo: G.box(2.3, 0.12, 0.12), color: 0x6a4a2a, pos: [x, 2.1, z] },
    { geo: G.cyl(0.18, 0.15, 0.3, 6), color: 0x8a6238, pos: [x, 1.5, z] },
    // 돌 구유와 나무 물통
    { geo: G.box(2.0, 0.5, 0.7), color: 0x8f8574, pos: [x + 2.4, 0.25, z + 0.4] },
    { geo: G.cyl(0.3, 0.26, 0.5, 7), color: 0x7a5a36, pos: [x - 1.8, 0.25, z + 1.0] },
  ];
}
// 작은 오두막 (노파의 집)
export function hutPieces(x, z) {
  return [
    { geo: G.box(4, 2.4, 3.2), color: 0xc4a77e, pos: [x, 1.2, z] },
    { geo: G.box(4.4, 0.3, 3.6), color: 0x7a5a3a, pos: [x, 2.5, z] },
    { geo: G.box(1.0, 1.7, 0.15), color: 0x4a3420, pos: [x, 0.85, z + 1.62] },
  ];
}
// 무화과나무 (넓은 잎 + 보라 열매)
export function figTree() {
  const g = new THREE.Group();
  g.add(part(G.cyl(0.18, 0.28, 1.6, 6), 0x7a5a3a, [0, 0.8, 0]));
  const leaf = part(G.ico(1.5, 0), 0x4f7f34, [0, 2.2, 0], [0, 0, 0], [1.3, 0.75, 1.3]);
  g.add(leaf);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.add(part(G.ico(0.12), 0x6a2a5a, [Math.cos(a) * 1.4, 1.75 + (i % 2) * 0.3, Math.sin(a) * 1.4]));
  }
  g.userData.leaf = leaf;
  return g;
}
export function fig() {
  const g = new THREE.Group();
  g.add(part(G.ico(0.14), 0x6a2a5a, [0, 0.14, 0]));
  return g;
}
// 우슬초 (작은 풀다발)
export function hyssop() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) g.add(part(G.cone(0.08, 0.5, 4), 0x8aa860, [(i - 2) * 0.07, 0.25, (i % 2) * 0.08], [0, 0, (i - 2) * 0.2]));
  g.add(part(G.ico(0.06), 0xf0f0ff, [0, 0.52, 0]));
  return g;
}
export function jar() {
  const g = new THREE.Group();
  g.add(part(G.cyl(0.18, 0.24, 0.5, 7), 0xa8643a, [0, 0.25, 0]));
  g.add(part(G.cyl(0.1, 0.14, 0.12, 7), 0xa8643a, [0, 0.56, 0]));
  return g;
}
export function oilBottle() {
  const g = new THREE.Group();
  g.add(part(G.cyl(0.1, 0.12, 0.28, 6), 0x5a7a4a, [0, 0.14, 0]));
  g.add(part(G.cyl(0.04, 0.05, 0.1, 5), 0x5a7a4a, [0, 0.33, 0]));
  return g;
}

// ───────── 1장 지형 꾸미기 (그레이박스 v2) ─────────
// 올리브나무: 비틀린 줄기 + 은녹색 납작한 잎 덩어리
export function olivePieces(x, z, s = 1, r = Math.random) {
  const lean = (r() - 0.5) * 0.5, h = (1.9 + r() * 0.5) * s;
  const leaf = [0x7d8c5a, 0x86946a, 0x71805a][Math.floor(r() * 3)];
  const out = [
    { geo: G.cyl(0.13 * s, 0.3 * s, h, 5), color: 0x6e5a44, pos: [x, h / 2, z], rot: [lean * 0.6, r() * 3, lean] },
    { geo: G.cyl(0.08 * s, 0.13 * s, 0.9 * s, 5), color: 0x6e5a44, pos: [x + 0.35 * s, h + 0.2 * s, z], rot: [0, 0, -0.7] },
  ];
  for (let i = 0; i < 3; i++) {
    const a = r() * 6.28;
    out.push({ geo: G.ico(0.75 * s * (0.8 + r() * 0.4)), color: leaf, pos: [x + Math.cos(a) * 0.65 * s, h + (0.35 + r() * 0.45) * s, z + Math.sin(a) * 0.65 * s], scale: [1.25, 0.65, 1.25] });
  }
  return out;
}

// 쥐엄나무·상수리류: 짙고 둥근 잎
export function carobPieces(x, z, s = 1, r = Math.random) {
  const h = (1.3 + r() * 0.4) * s;
  return [
    { geo: G.cyl(0.16 * s, 0.26 * s, h, 5), color: 0x5e4632, pos: [x, h / 2, z] },
    { geo: G.ico(1.4 * s, 1), color: 0x3f5a2e, pos: [x, h + 0.8 * s, z], scale: [1.2, 0.85, 1.2] },
  ];
}

// 위성류(타마리스크): 와디 가의 깃털 같은 나무
export function tamariskPieces(x, z, s = 1, r = Math.random) {
  const h = (1.2 + r() * 0.5) * s;
  const out = [{ geo: G.cyl(0.08 * s, 0.15 * s, h, 5), color: 0x6a5240, pos: [x, h / 2, z], rot: [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3] }];
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.28;
    out.push({ geo: G.ico(0.6 * s), color: [0x8f9e7a, 0x9aa888, 0x86967a][i % 3], pos: [x + Math.cos(a) * 0.45 * s, h + (0.2 + i * 0.35) * s, z + Math.sin(a) * 0.45 * s], scale: [1, 1.4, 1] });
  }
  return out;
}

// 마른 나무 (가지만)
export function deadTreePieces(x, z, s = 1, r = Math.random) {
  const h = 1.8 * s, out = [{ geo: G.cyl(0.07 * s, 0.16 * s, h, 5), color: 0x7a6a58, pos: [x, h / 2, z], rot: [0, 0, (r() - 0.5) * 0.2] }];
  for (let i = 0; i < 3; i++) out.push({ geo: G.cyl(0.03 * s, 0.06 * s, 0.9 * s, 4), color: 0x7a6a58, pos: [x + (r() - 0.5) * 0.5 * s, h * (0.6 + i * 0.15), z + (r() - 0.5) * 0.5 * s], rot: [(r() - 0.5) * 1.6, 0, (r() - 0.5) * 1.6] });
  return out;
}

// 관목 (로뎀·세이지): 납작한 덩어리 2~3개
export function bushPieces(x, z, s = 1, r = Math.random, tone = 0) {
  const cols = [[0x6f7d4a, 0x7a8752, 0x66733f], [0x8c9472, 0x98a07c, 0x828a68], [0x5d6e3a, 0x687a42, 0x55663a]][tone];
  const out = [];
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) out.push({ geo: G.ico(0.45 * s * (0.7 + r() * 0.5)), color: cols[i % 3], pos: [x + (r() - 0.5) * 0.7 * s, 0.28 * s, z + (r() - 0.5) * 0.7 * s], scale: [1.2, 0.75, 1.2] });
  return out;
}

// 풀 포기: 잎 3장
export function grassClump(x, z, r = Math.random, tone = 0x7f9a48) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = r() * 6.28, h = 0.28 + r() * 0.22;
    out.push({ geo: G.cone(0.07, h, 3), color: tone, pos: [x + Math.cos(a) * 0.12, h / 2, z + Math.sin(a) * 0.12], rot: [(r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5] });
  }
  return out;
}

// 들꽃 무리 (붉은 아네모네·노랑·흰색·보라)
export function flowerPatch(x, z, r = Math.random, color = 0xc8323a) {
  const out = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * 1.1, pz = z + (r() - 0.5) * 1.1, h = 0.18 + r() * 0.14;
    out.push({ geo: G.cyl(0.012, 0.012, h, 3), color: 0x6a8a3a, pos: [px, h / 2, pz] });
    out.push({ geo: G.cone(0.06, 0.07, 5), color, pos: [px, h + 0.02, pz], rot: [Math.PI, 0, 0] });
  }
  return out;
}

// 자갈 (작은 돌 몇 개)
export function pebbles(x, z, r = Math.random, color = 0xb0a48c) {
  const out = [];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) out.push({ geo: new THREE.OctahedronGeometry(0.08 + r() * 0.12, 0), color, pos: [x + (r() - 0.5) * 1.2, 0.05, z + (r() - 0.5) * 1.2], rot: [r() * 3, r() * 3, r() * 3], scale: [1.3, 0.6, 1] });
  return out;
}

// 건초 더미
export function hayPile(x, z, s = 1) {
  return [
    { geo: G.ico(0.9 * s, 0), color: 0xd2b56a, pos: [x, 0.35 * s, z], scale: [1.3, 0.6, 1.1] },
    { geo: G.ico(0.6 * s, 0), color: 0xc9a95c, pos: [x + 0.5 * s, 0.25 * s, z + 0.4 * s], scale: [1.2, 0.55, 1] },
  ];
}

// 항아리 묶음
export function jarCluster(x, z, r = Math.random) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const h = 0.5 + r() * 0.35, px = x + (i - 1) * 0.5, pz = z + (r() - 0.5) * 0.3;
    out.push({ geo: G.cyl(0.18, 0.26, h, 7), color: [0xa8643a, 0xb5764a, 0x9a5a34][i], pos: [px, h / 2, pz] });
    out.push({ geo: G.cyl(0.12, 0.18, 0.12, 7), color: 0x8a4a2a, pos: [px, h + 0.05, pz] });
  }
  return out;
}

// 장작 더미
export function woodStack(x, z, rotY = 0) {
  const out = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
    const off = (i - (3 - row) / 2) * 0.22;
    out.push({ geo: G.cyl(0.1, 0.1, 1.3, 5), color: [0x6a4a2a, 0x7a5432, 0x5e4226][(i + row) % 3], pos: [x + Math.cos(rotY) * off, 0.1 + row * 0.18, z - Math.sin(rotY) * off], rot: [Math.PI / 2, rotY, 0] });
  }
  return out;
}

// 맷돌
export function millstone(x, z) {
  return [
    { geo: G.cyl(0.7, 0.75, 0.3, 10), color: 0x9a9384, pos: [x, 0.15, z] },
    { geo: G.cyl(0.55, 0.55, 0.25, 10), color: 0xa8a092, pos: [x, 0.42, z] },
    { geo: G.box(0.08, 0.5, 0.08), color: 0x6a4a2a, pos: [x + 0.35, 0.75, z] },
  ];
}

// 타작마당 (평평한 돌 바닥 + 볏단)
export function threshingFloor(x, z, rad = 3.5, r = Math.random) {
  const out = [{ geo: G.cyl(rad, rad + 0.2, 0.12, 14), color: 0xc8b890, pos: [x, 0.06, z] }];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 6.28;
    out.push({ geo: G.dodeca(0.25), color: 0xa49a86, pos: [x + Math.cos(a) * (rad + 0.3), 0.12, z + Math.sin(a) * (rad + 0.3)], rot: [r() * 3, r() * 3, 0], scale: [1.3, 0.6, 1] });
  }
  for (let i = 0; i < 3; i++) out.push(...hayPile(x + (i - 1) * 1.6, z + (i % 2 ? 1 : -0.8), 0.7));
  return out;
}

// 채소밭 이랑
export function gardenRows(x, z, w = 6, d = 4) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const rz = z - d / 2 + (i + 0.5) * (d / 4);
    out.push({ geo: G.box(w, 0.18, 0.5), color: 0x8a6a48, pos: [x, 0.09, rz] });
    for (let k = 0; k < 6; k++) out.push({ geo: G.ico(0.22, 0), color: i % 2 ? 0x5f8a3a : 0x6f9a44, pos: [x - w / 2 + 0.5 + k * (w - 1) / 5, 0.28, rz], scale: [1, 0.7, 1] });
  }
  return out;
}

// 돌 구유
export function stoneTrough(x, z, rotY = 0) {
  return [{ geo: G.box(1.6, 0.45, 0.6), color: 0x9a9080, pos: [x, 0.22, z], rot: [0, rotY, 0] }, { geo: G.box(1.3, 0.05, 0.4), color: 0x5a86a0, pos: [x, 0.43, z], rot: [0, rotY, 0] }];
}

// 동물 뼈 (사자 바위 아래)
export function bones(x, z, r = Math.random) {
  const out = [{ geo: G.ico(0.18, 0), color: 0xe8e2d0, pos: [x, 0.12, z], scale: [1.3, 0.9, 1] }];
  for (let i = 0; i < 4; i++) out.push({ geo: G.cyl(0.03, 0.03, 0.5, 4), color: 0xe0dac6, pos: [x + (r() - 0.5) * 0.8, 0.04, z + (r() - 0.5) * 0.8], rot: [Math.PI / 2, r() * 3, 0] });
  return out;
}

// ───────── 서브 B. 물매 만들기 ─────────
// 시냇물: 꺾은선을 따라 얕은 물줄기 (걸어서 건널 수 있음)
export function brook(pts, w = 1.5) {
  const g = new THREE.Group();
  const water = new THREE.MeshLambertMaterial({ color: 0x5aa0c0, transparent: true, opacity: 0.82 });
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len + w * 0.6), water);
    m.rotation.set(-Math.PI / 2, 0, Math.atan2(bx - ax, bz - az));
    m.position.set((ax + bx) / 2, 0.035 + i * 0.001, (az + bz) / 2);
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
// 시냇가 돌 (정적 조각)
export function brookStonePieces(x, z, r = Math.random) {
  return [{ geo: G.dodeca(0.18 + r() * 0.2), color: [0x9a917e, 0xa8a090, 0x8a8272][Math.floor(r() * 3)], pos: [x, 0.08, z], rot: [r(), r(), r()], scale: [1.3, 0.6, 1] }];
}
// 염소 우리: 나무 말뚝 + 가로대 울타리 (반지름 rad, 남쪽에 입구)
export function goatPenPieces(x, z, rad = 2.6) {
  const out = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.abs(Math.sin(a) - 1) < 0.15) continue; // 남쪽(+z) 입구
    const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
    out.push({ geo: G.box(0.12, 1.0, 0.12), color: 0x6a4a2c, pos: [px, 0.5, pz] });
    const b = ((i + 1) / n) * Math.PI * 2;
    if (Math.abs(Math.sin(b) - 1) < 0.15) continue;
    const qx = x + Math.cos(b) * rad, qz = z + Math.sin(b) * rad;
    const len = Math.hypot(qx - px, qz - pz), rot = -Math.atan2(qz - pz, qx - px);
    for (const y of [0.45, 0.8]) out.push({ geo: G.box(len, 0.07, 0.07), color: 0x7a5634, pos: [(px + qx) / 2, y, (pz + qz) / 2], rot: [0, rot, 0] });
  }
  out.push({ geo: G.box(1.2, 0.3, 0.5), color: 0x8a6a44, pos: [x - 0.8, 0.15, z - 1.2] }); // 여물통
  return out;
}
// 매끄러운 돌 (주울 것)
export function smoothStone() {
  const g = new THREE.Group();
  g.add(part(G.dodeca(0.11), 0xd8d2c4, [0, 0.07, 0], [0.3, 0.6, 0], [1.2, 0.7, 1]));
  return g;
}
// 가죽 조각 · 염소털 끈 (창고·우리에서 찾을 물건)
export function leatherPiece() {
  const g = new THREE.Group();
  g.add(part(G.box(0.36, 0.03, 0.26), 0x8a5a34, [0, 0.03, 0], [0, 0.4, 0]));
  return g;
}
export function cordCoil() {
  const g = new THREE.Group();
  g.add(part(new THREE.TorusGeometry(0.13, 0.035, 4, 8), 0x3a3230, [0, 0.04, 0], [Math.PI / 2, 0, 0]));
  return g;
}
// 나무 과녁: 기둥 + 둥근 판 (판 가운데 높이 1.3 m)
export function slingTarget() {
  const g = new THREE.Group();
  g.add(part(G.box(0.16, 1.5, 0.16), 0x6a4a2c, [0, 0.75, 0]));
  g.add(part(G.cyl(0.42, 0.42, 0.08, 10), 0xc8a878, [0, 1.3, 0.1], [Math.PI / 2, 0, 0]));
  g.add(part(G.cyl(0.26, 0.26, 0.09, 10), 0xa83a2a, [0, 1.3, 0.1], [Math.PI / 2, 0, 0]));
  g.add(part(G.cyl(0.1, 0.1, 0.1, 8), 0xf0e6d0, [0, 1.3, 0.1], [Math.PI / 2, 0, 0]));
  return g;
}
// 날아가는 돌
export function slingShot() {
  return part(G.dodeca(0.09), 0xe0dacb);
}
// 손에 든 물매 (끈 + 주머니)
export function slingMesh() {
  const g = new THREE.Group();
  g.add(part(G.box(0.025, 0.55, 0.025), 0x6a4a2c, [0, -0.27, 0]));
  g.add(part(G.box(0.1, 0.05, 0.08), 0x8a5a34, [0, -0.56, 0]));
  return g;
}
