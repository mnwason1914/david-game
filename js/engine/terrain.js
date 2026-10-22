// 지면 높이 격자. three.js 없이 돌아가는 순수 계산 (노드에서 검사 스크립트로도 씀).
// 높이 도장(data/map1.js)을 합성 → 협곡 파내기 → 경사로 → 앵커 평탄 패드 순서로 만든다.
// 좌표: x = 동(+)/서(-), z = 남(+)/북(-). 단위 m.

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// 점 p에서 선분 a-b까지 거리와 선분 위 위치(0~1)
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz || 1e-9;
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / L2);
  return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
}
// 꺾은선까지 거리와, 가장 가까운 지점의 폭 값(점마다 다른 폭을 보간)
export function lineDist(px, pz, pts, widths) {
  let best = { d: Infinity, w: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const s = segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (s.d < best.d) best = { d: s.d, w: widths ? widths[i] + (widths[i + 1] - widths[i]) * s.t : 0, t: s.t, i };
  }
  return best;
}

// 도장 하나의 높이
function stampHeight(s, x, z) {
  switch (s.type) {
    case 'plateau': { // 타원 윗면이 평평한 언덕. falloff = 가장자리에서 0이 될 때까지 거리(m)
      const nx = (x - s.x) / s.rx, nz = (z - s.z) / s.rz;
      const d = Math.hypot(nx, nz);
      const e = Math.max(0, d - 1) * (s.rx + s.rz) / 2;
      let h = s.h * (1 - smooth(0, s.falloff, e));
      if (s.clipX !== undefined && x > s.clipX) h = 0; // 동쪽 자르기 (능선 너머로 비탈이 넘어가지 않게)
      return h;
    }
    case 'line': { // 꺾은선을 따라 솟은 둑·능선. top = 평평한 윗면 반폭
      const { d } = lineDist(x, z, s.pts);
      return s.h * (1 - smooth(s.top || 0, (s.top || 0) + s.falloff, d));
    }
    default: return 0;
  }
}

export class Terrain {
  constructor(def, bounds, cell = 1) {
    this.def = def;
    this.cell = cell;
    this.x0 = bounds.minX - 20; this.z0 = bounds.minZ - 20;
    this.W = Math.ceil((bounds.maxX - bounds.minX + 40) / cell) + 1;
    this.H = Math.ceil((bounds.maxZ - bounds.minZ + 40) / cell) + 1;
    this.h = new Float32Array(this.W * this.H);
    for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) {
      this.h[j * this.W + i] = this.compute(this.x0 + i * cell, this.z0 + j * cell);
    }
    // 경사(기울기 크기) 격자
    this.g = new Float32Array(this.W * this.H);
    for (let j = 1; j < this.H - 1; j++) for (let i = 1; i < this.W - 1; i++) {
      const k = j * this.W + i;
      const gx = (this.h[k + 1] - this.h[k - 1]) / (2 * cell), gz = (this.h[k + this.W] - this.h[k - this.W]) / (2 * cell);
      this.g[k] = Math.hypot(gx, gz);
    }
    this.maxGrad = Math.tan((def.maxSlopeDeg || 32) * Math.PI / 180);
  }

  compute(x, z) {
    const D = this.def;
    // 1) 도장 합성 (가장 높은 값)
    let h = 0;
    for (const s of D.stamps) h = Math.max(h, stampHeight(s, x, z));
    // 2) 협곡 파내기: 통로 안은 0, 벽은 가파르게
    for (const c of D.carves) {
      const { d, w } = lineDist(x, z, c.pts, c.widths);
      h = Math.min(h, Math.max(0, d - w) * c.wall);
      for (const p of c.pockets || []) h = Math.min(h, Math.max(0, Math.hypot(x - p.x, z - p.z) - p.r) * c.wall);
    }
    // 3) 경사로 (벽 안에 파낸 오르막)
    for (const r of D.ramps) {
      const { d, t, i } = lineDist(x, z, r.pts);
      if (d < r.w) {
        const segs = r.pts.length - 1;
        const u = (i + t) / segs;
        h = Math.min(h, r.h0 + (r.h1 - r.h0) * u);
      }
    }
    // 4) 앵커 평탄 패드 (퀘스트·전투 지점은 0 m)
    for (const p of D.pads) {
      let d;
      if (p.rect) {
        const dx = Math.max(p.rect[0] - x, 0, x - p.rect[1]);
        const dz = Math.max(p.rect[2] - z, 0, z - p.rect[3]);
        d = Math.hypot(dx, dz);
        h *= smooth(0, p.blend, d);
      } else {
        d = Math.hypot(x - p.x, z - p.z);
        h *= smooth(p.r, p.r + p.blend, d);
      }
    }
    return h;
  }

  idx(x, z) {
    const i = Math.round((x - this.x0) / this.cell), j = Math.round((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return -1;
    return j * this.W + i;
  }

  // 양선형 보간 높이
  heightAt(x, z) {
    const fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    const i = Math.max(0, Math.min(this.W - 2, Math.floor(fx))), j = Math.max(0, Math.min(this.H - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const k = j * this.W + i;
    const a = this.h[k], b = this.h[k + 1], c = this.h[k + this.W], d = this.h[k + this.W + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  // 경사 기울기 (tan 값)
  gradAt(x, z) { const k = this.idx(x, z); return k < 0 ? 0 : this.g[k]; }

  // 걸을 수 없는 가파른 곳인가. 주변 4칸 중 하나라도 가파르면 막는다 (보간 경계에서 새지 않게)
  steep(x, z) {
    const fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    const i = Math.floor(fx), j = Math.floor(fz);
    for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= this.W || jj >= this.H) continue;
      if (this.g[jj * this.W + ii] > this.maxGrad) return true;
    }
    return false;
  }
}
