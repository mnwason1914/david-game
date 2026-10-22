// 공통 리그. 사람형(humanoid)과 네발(quad) 두 종류.
// 모든 사람 캐릭터는 같은 관절 이름과 소켓을 쓰기 때문에 무기·애니메이션을 그대로 공유한다.
// 모델 슬롯에 glb가 지정되면 glb를 불러와 boneMap으로 관절을 연결한다.
import * as THREE from 'three';
import { G, part } from './lowpoly.js';
import { MODEL_SLOTS } from '../data/models.js';

export const JOINTS = ['hips', 'spine', 'head', 'armL', 'armR', 'legL', 'legR'];
export const SOCKETS = ['handR', 'back', 'grip']; // grip = 양손 지팡이 파지 (몸 기준, 포즈 함수가 위치·방향을 정함)

// ───────────── 사람형 ─────────────
function buildHumanoid(look) {
  const h = look.height || 1;
  const root = new THREE.Group();
  const body = new THREE.Group(); // 구르기·쓰러짐 회전용
  body.scale.setScalar(h);
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = 0.78;
  body.add(hips);

  const mkLeg = (x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0, 0);
    leg.add(part(G.box(0.15, 0.72, 0.17), look.skin, [0, -0.38, 0]));
    leg.add(part(G.box(0.17, 0.09, 0.26), look.belt, [0, -0.74, 0.04]));
    hips.add(leg);
    return leg;
  };
  const legL = mkLeg(0.11);
  const legR = mkLeg(-0.11);

  // 치마형 튜닉 (엉덩이에 고정)
  hips.add(part(G.cyl(0.26, look.robe ? 0.38 : 0.32, look.robe ? 0.62 : 0.42, 7), look.tunic, [0, look.robe ? -0.28 : -0.16, 0]));

  const spine = new THREE.Group();
  hips.add(spine);
  spine.add(part(G.cyl(0.25, 0.24, 0.6, 7), look.tunic, [0, 0.3, 0]));
  spine.add(part(G.cyl(0.255, 0.255, 0.08, 7), look.belt, [0, 0.04, 0]));

  const head = new THREE.Group();
  head.position.y = 0.66;
  spine.add(head);
  head.add(part(G.box(0.1, 0.1, 0.1), look.skin, [0, 0.0, 0]));
  head.add(part(G.ico(0.18), look.skin, [0, 0.16, 0]));
  head.add(part(G.ico(0.185), look.hair, [0, 0.21, -0.04], [0, 0, 0], [1, 0.75, 1]));
  // 눈 (방향 파악용)
  head.add(part(G.box(0.04, 0.04, 0.02), 0x1a1a1a, [0.07, 0.17, 0.165]));
  head.add(part(G.box(0.04, 0.04, 0.02), 0x1a1a1a, [-0.07, 0.17, 0.165]));
  if (look.beard) head.add(part(G.cone(0.14, 0.24, 6), look.beard, [0, 0.0, 0.08], [Math.PI, 0, 0]));
  if (look.headwear) head.add(part(G.ico(0.215), look.headwear, [0, 0.24, -0.02], [0, 0, 0], [1, 0.8, 1.05]));
  if (look.mask) head.add(part(G.box(0.3, 0.1, 0.06), look.headwear || 0x111111, [0, 0.08, 0.15]));

  const mkArm = (x) => {
    const arm = new THREE.Group();
    arm.position.set(x, 0.55, 0);
    arm.add(part(G.box(0.12, 0.3, 0.13), look.tunic, [0, -0.12, 0]));
    arm.add(part(G.box(0.1, 0.32, 0.11), look.skin, [0, -0.4, 0]));
    arm.add(part(G.box(0.11, 0.1, 0.11), look.skin, [0, -0.6, 0]));
    spine.add(arm);
    return arm;
  };
  const armL = mkArm(0.32);
  const armR = mkArm(-0.32);

  const handR = new THREE.Group();
  handR.position.y = -0.6;
  armR.add(handR);
  const back = new THREE.Group();
  back.position.set(0, 0.35, -0.26);
  spine.add(back);
  const grip = new THREE.Group();
  body.add(grip);

  return { root, body, joints: { hips, spine, head, armL, armR, legL, legR }, sockets: { handR, back, grip }, height: h };
}

// ───────────── 네발 ─────────────
const QUAD_LOOKS = {
  sheep: { body: 0xf1ece0, face: 0x3a3028, leg: 0x3a3028, size: [0.75, 0.62, 1.05], legH: 0.38, head: 0.2, woolly: true },
  lamb:  { body: 0xffffff, face: 0xf3e6dc, leg: 0xe8d8cc, size: [0.6, 0.5, 0.8], legH: 0.34, head: 0.19, woolly: true, ears: 0xffffff },
  bear:  { body: 0x75492a, face: 0x5e3a20, leg: 0x553420, size: [1.5, 1.35, 2.3], legH: 0.62, head: 0.5, snout: 0x8a6440 },
  goat:  { body: 0x3e3430, face: 0x2e2622, leg: 0x2a221e, size: [0.5, 0.55, 0.9], legH: 0.42, head: 0.17, horns: 0xcfc4a8 },
  lion:  { body: 0xc8964a, face: 0xc08a3e, leg: 0xb8863e, size: [0.95, 0.95, 2.0], legH: 0.62, head: 0.36, mane: 0x7a4418, tail: true },
};

function buildQuad(kind) {
  const L = QUAD_LOOKS[kind];
  const [w, hgt, len] = L.size;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const torso = new THREE.Group();
  torso.position.y = L.legH + hgt * 0.45;
  body.add(torso);
  if (L.woolly) {
    torso.add(part(G.ico(0.5, 1), L.body, [0, 0, 0], [0, 0, 0], [w, hgt, len]));
  } else {
    torso.add(part(G.box(w, hgt, len), L.body, [0, 0, 0]));
    torso.add(part(G.box(w * 1.06, hgt * 1.05, len * 0.42), L.body, [0, 0.03, len * 0.28]));
  }
  const head = new THREE.Group();
  head.position.set(0, hgt * 0.3, len * 0.5);
  torso.add(head);
  const hr = L.head;
  head.add(part(G.box(hr * 1.3, hr * 1.2, hr * 1.5), L.face, [0, 0, hr * 0.5]));
  if (L.snout) head.add(part(G.box(hr * 0.7, hr * 0.55, hr * 0.6), L.snout, [0, -hr * 0.2, hr * 1.4]));
  if (L.mane) {
    head.add(part(G.ico(hr * 1.25), L.mane, [0, 0.05, 0.05], [0, 0, 0], [1.25, 1.25, 0.9]));
    head.add(part(G.box(hr * 0.6, hr * 0.5, hr * 0.5), 0xd8a860, [0, -hr * 0.2, hr * 1.25]));
  }
  if (L.horns) {
    head.add(part(G.cone(0.04, 0.26, 4), L.horns, [hr * 0.35, hr * 0.85, hr * 0.1], [-0.7, 0, -0.2]));
    head.add(part(G.cone(0.04, 0.26, 4), L.horns, [-hr * 0.35, hr * 0.85, hr * 0.1], [-0.7, 0, 0.2]));
    head.add(part(G.box(0.05, 0.12, 0.04), L.face, [0, -hr * 0.55, hr * 1.1])); // 턱수염
  }
  if (kind === 'bear') {
    head.add(part(G.box(0.16, 0.16, 0.08), L.face, [hr * 0.55, hr * 0.65, hr * 0.2]));
    head.add(part(G.box(0.16, 0.16, 0.08), L.face, [-hr * 0.55, hr * 0.65, hr * 0.2]));
  }
  if (L.woolly) {
    const ec = L.ears || L.face;
    head.add(part(G.box(0.18, 0.06, 0.08), ec, [hr * 0.75, hr * 0.25, hr * 0.2], [0, 0, -0.4]));
    head.add(part(G.box(0.18, 0.06, 0.08), ec, [-hr * 0.75, hr * 0.25, hr * 0.2], [0, 0, 0.4]));
  }
  head.add(part(G.box(0.05, 0.05, 0.02), 0x111111, [hr * 0.4, hr * 0.2, hr * 1.26]));
  head.add(part(G.box(0.05, 0.05, 0.02), 0x111111, [-hr * 0.4, hr * 0.2, hr * 1.26]));

  const legs = [];
  const lw = Math.max(0.1, w * 0.22);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const leg = new THREE.Group();
    leg.position.set(x * w * 0.3, L.legH + 0.05, z * len * 0.32);
    leg.add(part(G.box(lw, L.legH + 0.1, lw), L.leg, [0, -(L.legH + 0.1) / 2, 0]));
    body.add(leg);
    legs.push(leg);
  }
  let tail = null;
  if (L.tail) {
    tail = new THREE.Group();
    tail.position.set(0, hgt * 0.25, -len * 0.5);
    tail.add(part(G.box(0.07, 0.07, 0.8), L.leg, [0, 0, -0.4]));
    tail.add(part(G.ico(0.1), L.mane || L.leg, [0, 0, -0.82]));
    tail.rotation.x = -0.6;
    torso.add(tail);
  }
  const mouth = new THREE.Group(); // 물고 있는 양을 붙이는 소켓
  mouth.position.set(0, -hr * 0.4, hr * 1.6);
  head.add(mouth);
  return { root, body, torso, head, legs, tail, sockets: { mouth }, kind, size: L.size, legH: L.legH };
}

// ───────────── glb 슬롯 ─────────────
let gltfLoaderPromise = null;
async function loadGLB(path) {
  if (!gltfLoaderPromise) {
    gltfLoaderPromise = import('../../vendor/addons/loaders/GLTFLoader.js').then((m) => new m.GLTFLoader());
  }
  const loader = await gltfLoaderPromise;
  return new Promise((res, rej) => loader.load(path, res, undefined, rej));
}

// glb 사람형 모델을 공통 리그 형태로 감싼다
async function buildHumanoidFromGLB(slot) {
  const gltf = await loadGLB(slot.glb);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const model = gltf.scene;
  model.scale.setScalar(slot.scale || 1);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  body.add(model);
  const joints = {};
  const map = slot.boneMap || {};
  for (const j of JOINTS) {
    const name = map[j];
    joints[j] = (name && model.getObjectByName(name)) || new THREE.Group();
  }
  const handR = new THREE.Group();
  joints.armR.add(handR);
  const back = new THREE.Group();
  joints.spine.add(back);
  const grip = new THREE.Group();
  body.add(grip);
  return { root, body, joints, sockets: { handR, back, grip }, height: 1, fromGLB: true };
}

// 슬롯 이름으로 리그를 만든다. glb는 비동기라서 항상 Promise를 반환한다.
export async function createRig(slotName) {
  const slot = MODEL_SLOTS[slotName];
  if (!slot) throw new Error('모델 슬롯 없음: ' + slotName);
  if (slot.glb) {
    try {
      if (slot.rig === 'humanoid') return await buildHumanoidFromGLB(slot);
    } catch (e) {
      console.warn('glb 로드 실패, 절차적 모델로 대체:', slotName, e);
    }
  }
  if (slot.rig === 'humanoid') return buildHumanoid(slot.look);
  const q = buildQuad(slot.kind);
  q.root.scale.setScalar(slot.scale || 1);
  return q;
}

// ───────────── 절차적 애니메이션 ─────────────
// 사람형: state = { move(0~1), phase, action, t(0~1), combo, carry }
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

// ───────────── 양손 지팡이 포즈 ─────────────
// 몸 기준 좌표 (+z 앞, +x 다윗의 왼쪽). H = 뒷손(오른손) 위치, yaw/pitch = 지팡이가 향하는 방향(도),
// twist/lean = 상체 비틀기·숙이기(라디안), crouch = 골반 낮추기(m), stride = 앞발(왼발) 내딛기(라디안)
const SP = (H, yaw, pitch, twist = 0, lean = 0, crouch = 0.03, stride = 0.25) => ({ H, yaw, pitch, twist, lean, crouch, stride });
export const STAFF_POSES = {
  stance: SP([-0.2, 0.98, 0.26], 12, 22, -0.18, 0.04, 0.03, 0.22),
  guard:  SP([-0.5, 1.28, 0.36], 86, 12, 0.08, 0.06, 0.09, 0.32),
  guardHit: SP([-0.5, 1.3, 0.24], 84, 18, 0.0, -0.12, 0.12, 0.36),
  jg:     SP([-0.48, 1.34, 0.5], 80, 26, 0.12, 0.14, 0.08, 0.4),
  broken: SP([-0.32, 1.55, 0.02], 55, 58, 0.3, -0.28, 0.0, 0.1),
  // 약공격 1타: 오른쪽 뒤에서 왼쪽 앞으로 비스듬히 가로치기
  L1wind: SP([-0.38, 1.34, 0.02], -118, 30, -0.9, 0.0, 0.07, 0.34),
  L1mid:  SP([-0.14, 1.16, 0.36], -5, 6, 0.0, 0.12, 0.08, 0.42),
  L1end:  SP([0.16, 1.04, 0.3], 72, -14, 0.68, 0.16, 0.09, 0.46),
  L1foll: SP([0.24, 0.98, 0.2], 94, -24, 0.78, 0.12, 0.07, 0.42),
  // 약공격 2타: 왼쪽 아래에서 오른쪽 위로 되돌려 올려치기
  L2wind: SP([0.3, 0.95, 0.14], 112, -30, 0.9, 0.1, 0.1, 0.4),
  L2mid:  SP([0.0, 1.16, 0.38], 5, 10, 0.0, 0.1, 0.08, 0.42),
  L2end:  SP([-0.24, 1.34, 0.26], -78, 34, -0.68, 0.0, 0.05, 0.34),
  L2foll: SP([-0.3, 1.4, 0.16], -96, 40, -0.8, -0.04, 0.04, 0.3),
  // 강공격: 허리 옆으로 당겼다가(무게 뒤) 정면 찌르기(무게 앞)
  Hpull:  SP([-0.22, 1.0, -0.24], 3, 4, -0.45, -0.1, 0.13, 0.5),
  Hhold:  SP([-0.22, 0.99, -0.3], 2, 3, -0.5, -0.12, 0.14, 0.52),
  Hext:   SP([-0.07, 1.18, 0.52], 0, 2, 0.15, 0.32, 0.1, 0.72),
};
const lerpArr = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function mixStaffPose(a, b, t) {
  const o = { H: lerpArr(a.H, b.H, t) };
  for (const k of ['yaw', 'pitch', 'twist', 'lean', 'crouch', 'stride']) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}
// keys: [[시간, 포즈], ...] (시간 오름차순) → time 에서의 포즈
export function staffTrack(keys, time) {
  if (time <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (time <= keys[i][0]) {
      const [t0, p0] = keys[i - 1], [t1, p1] = keys[i];
      return mixStaffPose(p0, p1, ease((time - t0) / Math.max(1e-4, t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
export function staffDir(p, out = new THREE.Vector3()) {
  const y = p.yaw * Math.PI / 180, x = p.pitch * Math.PI / 180;
  return out.set(Math.sin(y) * Math.cos(x), Math.sin(x), Math.cos(y) * Math.cos(x));
}
// 팔(한 덩어리)을 몸 기준 점 target 쪽으로 돌린다
function aimArm(rig, arm, target) {
  _w.set(target[0], target[1], target[2]);
  rig.body.localToWorld(_w);
  arm.parent.worldToLocal(_w);
  _v.copy(_w).sub(arm.position).normalize();
  arm.quaternion.setFromUnitVectors(DOWN, _v);
}
// 양손 파지 포즈 적용. sp = 지팡이 포즈, front = 앞손 위치(지팡이 축 위 m), freeL = 왼팔은 건드리지 않음
function applyStaff(rig, s, sp, front) {
  const j = rig.joints;
  j.spine.rotation.y += sp.twist;
  j.spine.rotation.x += sp.lean;
  j.hips.position.y -= sp.crouch;
  if (s.move < 0.25) {
    const k = 1 - s.move / 0.25;
    j.legL.rotation.x += -sp.stride * k;
    j.legR.rotation.x += sp.stride * 0.55 * k;
  }
  const g = rig.sockets.grip;
  g.position.set(sp.H[0], sp.H[1], sp.H[2]);
  const d = staffDir(sp, _v);
  g.quaternion.setFromUnitVectors(DOWN, d);
  rig.root.updateMatrixWorld(true);
  aimArm(rig, j.armR, sp.H);
  if (!s.freeL) aimArm(rig, j.armL, [sp.H[0] + d.x * front, sp.H[1] + d.y * front, sp.H[2] + d.z * front]);
}

export function poseHumanoid(rig, s) {
  const j = rig.joints;
  const sw = Math.sin(s.phase) * 0.7 * s.move;
  j.legL.rotation.set(sw, 0, 0);
  j.legR.rotation.set(-sw, 0, 0);
  j.armL.rotation.set(-sw * 0.8, 0, 0.08);
  j.armR.rotation.set(sw * 0.6 - 0.2, 0, -0.08);
  j.spine.rotation.set(0.05 * s.move, 0, 0);
  j.head.rotation.set(0, 0, 0);
  j.hips.position.y = 0.78 + Math.abs(Math.cos(s.phase)) * 0.05 * s.move + Math.sin(s.idle || 0) * 0.008;
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);

  if (s.carry) {
    // 양을 어깨에 메고 두 손을 가슴 앞으로 모아 다리를 붙잡음
    j.armL.rotation.set(-0.85, 0, -0.4);
    j.armR.rotation.set(-0.85, 0, 0.4);
  }

  const t = s.t;
  switch (s.action) {
    case 'attack': {
      if (s.combo === 0) { // 오른쪽 → 왼쪽 가로 휘두르기
        const k = ease(Math.min(1, t * 1.6));
        j.spine.rotation.y = lerp(1.1, -1.0, k);
        j.armR.rotation.set(-1.45, 0, lerp(-0.5, 0.2, k));
      } else if (s.combo === 1) { // 왼쪽 → 오른쪽
        const k = ease(Math.min(1, t * 1.6));
        j.spine.rotation.y = lerp(-1.0, 1.1, k);
        j.armR.rotation.set(-1.45, 0, lerp(0.3, -0.4, k));
      } else { // 내리찍기
        const k = ease(Math.min(1, t * 1.5));
        j.armR.rotation.set(lerp(-3.0, -0.9, k), 0, 0);
        j.armL.rotation.set(lerp(-2.8, -0.9, k), 0, 0);
        j.spine.rotation.x = lerp(-0.2, 0.35, k);
      }
      break;
    }
    case 'charge': // 꾹 누르는 중: 지팡이를 뒤로 당김
      j.spine.rotation.y = 1.3;
      j.armR.rotation.set(-1.5, 0, -0.6);
      j.spine.rotation.x = 0.1 + Math.sin(s.idle * 30) * 0.02;
      break;
    case 'spin': // 강한 휘두르기: 한 바퀴 회전
      rig.body.rotation.y = -ease(t) * Math.PI * 2;
      j.armR.rotation.set(-1.55, 0, -0.2);
      j.armL.rotation.set(-0.3, 0, 0.9);
      break;
    case 'dodge': // 앞구르기
      rig.body.position.y = 0.45 * Math.sin(t * Math.PI) - 0.15;
      rig.body.rotation.x = t * Math.PI * 2;
      j.legL.rotation.x = -1.4; j.legR.rotation.x = -1.4;
      j.armL.rotation.x = -1.2; j.armR.rotation.x = -1.2;
      break;
    case 'hurt':
      j.spine.rotation.x = -0.35 * (1 - t);
      j.head.rotation.x = -0.3 * (1 - t);
      break;
    case 'down': // 쓰러짐 / 눕기
      rig.body.rotation.x = -Math.PI / 2 * ease(Math.min(1, t * 2));
      rig.body.position.y = 0.15;
      break;
    case 'raise': // 공격 예고 (적)
      j.armR.rotation.set(-2.7 * ease(t), 0, 0);
      j.spine.rotation.x = -0.15 * t;
      break;
    case 'strike':
      j.armR.rotation.set(lerp(-2.7, -0.5, ease(Math.min(1, t * 2))), 0, 0);
      j.spine.rotation.x = 0.3;
      break;
    case 'raise2': // 강공격 예고 (도둑): 두 손으로 몽둥이를 머리 위로 크게
      j.armR.rotation.set(-3.0 * ease(t), 0, 0.15 * t);
      j.armL.rotation.set(-3.0 * ease(t), 0, -0.15 * t);
      j.spine.rotation.x = -0.3 * t;
      j.hips.position.y -= 0.06 * t;
      break;
    case 'strike2':
      { const k = ease(Math.min(1, t * 2.2));
        j.armR.rotation.set(lerp(-3.0, -0.3, k), 0, 0.15);
        j.armL.rotation.set(lerp(-3.0, -0.3, k), 0, -0.15);
        j.spine.rotation.x = lerp(-0.3, 0.45, k);
        j.legL.rotation.x = -0.5 * k; }
      break;
    case 'flinch': // 움찔 (도둑)
      j.spine.rotation.x = -0.3 * (1 - t);
      j.head.rotation.x = -0.25 * (1 - t);
      j.armR.rotation.set(-0.3, 0, -0.4);
      break;
    case 'reel': // 휘청 (저스트 가드 당함)
      j.spine.rotation.x = -0.4 * Math.sin(Math.min(1, t) * Math.PI);
      j.spine.rotation.z = 0.2 * Math.sin(t * 9);
      j.armR.rotation.set(-2.4, 0, -0.3);
      j.legR.rotation.x = 0.4;
      break;
    case 'broken': // 자세 붕괴: 한쪽 무릎을 꿇음
      j.hips.position.y = 0.5;
      j.legL.rotation.x = -1.4; j.legR.rotation.x = 0.6;
      j.spine.rotation.x = 0.5 + Math.sin((s.idle || 0) * 5) * 0.04;
      j.armR.rotation.set(-0.4, 0, -0.2); j.armL.rotation.set(-0.6, 0, 0.3);
      j.head.rotation.x = 0.4;
      break;
    case 'pray':
      j.armL.rotation.set(-1.0, 0, -0.5);
      j.armR.rotation.set(-1.0, 0, 0.5);
      j.head.rotation.x = 0.35;
      break;
    case 'sit':
      j.legL.rotation.x = -1.5; j.legR.rotation.x = -1.5;
      j.hips.position.y = 0.32;
      break;
    case 'hug':
      j.armL.rotation.set(-1.5, 0, -0.5);
      j.armR.rotation.set(-1.5, 0, 0.5);
      break;
    case 'run': // 급하게 뛰기 (요나)
      j.spine.rotation.x = 0.25;
      break;
  }
  if (s.staff && rig.sockets.grip) applyStaff(rig, s, s.staff, s.staffFront ?? 0.45);
}

// 네발: state = { move, phase, action, t }
export function poseQuad(rig, s) {
  const sw = Math.sin(s.phase) * 0.6 * s.move;
  const [a, b, c, d] = rig.legs;
  a.rotation.x = sw; d.rotation.x = sw; b.rotation.x = -sw; c.rotation.x = -sw;
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.y = Math.abs(Math.cos(s.phase)) * 0.06 * s.move;
  rig.torso.rotation.set(0, 0, 0);
  rig.head.rotation.set(Math.sin(s.idle || 0) * 0.04, 0, 0);
  if (rig.tail) rig.tail.rotation.set(-0.6 + Math.sin((s.idle || 0) * 2) * 0.15, Math.sin((s.idle || 0) * 1.3) * 0.3, 0);
  const t = s.t;
  switch (s.action) {
    case 'windup': // 돌진/공격 준비: 몸을 낮춤
      rig.body.position.y = -0.15 * t;
      rig.torso.rotation.x = 0.12 * t;
      rig.head.rotation.x = 0.2 * t;
      break;
    case 'charge':
      rig.torso.rotation.x = 0.08;
      break;
    case 'swipeL': case 'swipeR': { // 앞발 휘두르기
      const dir = s.action === 'swipeL' ? 1 : -1;
      const k = Math.sin(Math.min(1, t) * Math.PI);
      rig.torso.rotation.x = -0.45 * k;
      rig.torso.rotation.z = 0.25 * dir * k;
      rig.head.rotation.y = 0.5 * dir * k;
      (dir > 0 ? a : b).rotation.x = -1.6 * k;
      break;
    }
    case 'rear': // 일어서기 (곰 포효)
      rig.torso.rotation.x = -0.8 * ease(t);
      rig.body.position.y = 0.3 * ease(t);
      a.rotation.x = -1.4 * t; b.rotation.x = -1.4 * t;
      break;
    case 'crouch':
      rig.body.position.y = -0.25 * t;
      rig.torso.rotation.x = 0.15;
      break;
    case 'leap':
      rig.torso.rotation.x = lerp(-0.5, 0.4, t);
      a.rotation.x = -1.2; b.rotation.x = -1.2; c.rotation.x = 1.0; d.rotation.x = 1.0;
      break;
    case 'stun':
      rig.torso.rotation.z = 0.25 + Math.sin((s.idle || 0) * 6) * 0.08;
      rig.head.rotation.x = 0.5;
      rig.body.position.y = -0.2;
      break;
    case 'down':
      rig.body.rotation.z = Math.PI / 2 * ease(Math.min(1, t * 1.5));
      rig.body.position.y = 0.1;
      break;
    case 'reel': // 휘청 (저스트 가드 당함)
      rig.torso.rotation.x = -0.35 * Math.sin(Math.min(1, t) * Math.PI);
      rig.torso.rotation.z = 0.15 * Math.sin(t * 8);
      rig.head.rotation.y = 0.3 * Math.sin(t * 6);
      break;
    case 'broken': // 자세 붕괴: 앞다리를 꿇고 머리를 떨굼
      rig.body.position.y = -0.3;
      rig.torso.rotation.x = 0.22;
      rig.torso.rotation.z = 0.1 + Math.sin((s.idle || 0) * 4) * 0.05;
      rig.head.rotation.x = 0.7;
      a.rotation.x = -0.9; b.rotation.x = -0.9;
      break;
    case 'graze':
      rig.head.rotation.x = 0.6;
      break;
    case 'sleep':
      rig.body.position.y = -(rig.legH || 0.3) * 0.8;
      rig.head.rotation.x = 0.5;
      break;
  }
}
