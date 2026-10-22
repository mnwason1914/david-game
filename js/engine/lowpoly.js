// 로우폴리 도형 도우미. 모든 절차적 모델은 여기 있는 함수로 만든다.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/addons/utils/BufferGeometryUtils.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  }
  return matCache.get(key);
}

export const VCOLOR_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// 기본 도형 (세그먼트를 적게 써서 각진 느낌)
export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg),
  cone: (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg),
  ico: (r, detail = 0) => new THREE.IcosahedronGeometry(r, detail),
  dodeca: (r) => new THREE.DodecahedronGeometry(r, 0),
};

// 메시 하나 만들기
export function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 여러 조각을 정점 색상을 가진 메시 하나로 합친다 (드로우콜 절약)
// pieces: [{ geo, color, pos, rot, scale }]
export function bake(pieces, jitter = 0) {
  const geos = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  for (const p of pieces) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    e.set(...(p.rot || [0, 0, 0]));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...(p.pos || [0, 0, 0])), q, new THREE.Vector3(...(p.scale || [1, 1, 1])));
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    c.set(p.color);
    for (let i = 0; i < n; i += 3) {
      // 면마다 살짝 밝기를 바꿔 손으로 칠한 느낌
      const v = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
      for (let j = 0; j < 3; j++) {
        col[(i + j) * 3] = c.r * v;
        col[(i + j) * 3 + 1] = c.g * v;
        col[(i + j) * 3 + 2] = c.b * v;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

export function bakedMesh(pieces, jitter = 0.08) {
  const mesh = new THREE.Mesh(bake(pieces, jitter), VCOLOR_MAT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// 간단한 결정적 난수 (맵이 매번 같게 나오도록)
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
