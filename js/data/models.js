// 모델 슬롯. 모든 캐릭터·동물·소품은 이 슬롯을 통해 만들어진다.
// glb 값을 채우면 절차적 모델 대신 그 파일을 불러온다 (Tripo 모델 교체 지점).
//
// 사람형(humanoid) 슬롯에 glb를 넣을 때는 boneMap 으로 리그 관절 이름을 glb 뼈 이름에 연결한다.
// 공통 관절: hips, spine, head, armL, armR, legL, legR  /  공통 소켓: handR, back
// glb 의 기준: 바닥이 y=0, 앞쪽이 +z, 키는 scale 로 맞춘다.

export const MODEL_SLOTS = {
  // ── 사람 (공통 사람형 리그) ──
  david: {
    rig: 'humanoid', glb: null, scale: 1, boneMap: null,
    look: { skin: 0xc68a5e, tunic: 0xd8c39a, belt: 0x6b4a2b, hair: 0x3b2414, height: 1.0, headwear: null },
  },
  jesse: {
    rig: 'humanoid', glb: null, scale: 1, boneMap: null,
    look: { skin: 0xb27a52, tunic: 0x7a5a3a, belt: 0x3f2c1a, hair: 0xd8d2c4, height: 1.12, headwear: 0xe8e0cc, beard: 0xd8d2c4, robe: true },
  },
  jonah: {
    rig: 'humanoid', glb: null, scale: 1, boneMap: null,
    look: { skin: 0xc0865a, tunic: 0x9aa36b, belt: 0x5a4a2a, hair: 0x2a1a10, height: 1.05, headwear: null },
  },
  eliab: { // 맏형 엘리압
    rig: 'humanoid', glb: null, scale: 1, boneMap: null,
    look: { skin: 0xb98058, tunic: 0x8a3a2a, belt: 0x3a2618, hair: 0x2a1a10, height: 1.16, headwear: null, beard: 0x2a1a10 },
  },
  oldwoman: { // 우물가 여인
    rig: 'humanoid', glb: null, scale: 1, boneMap: null,
    look: { skin: 0xb27a52, tunic: 0x5a6a8a, belt: 0x3a3a4a, hair: 0xcfc8bc, height: 0.98, headwear: 0xd8cfb8, robe: true },
  },
  thief: {
    rig: 'humanoid', glb: null, scale: 1, boneMap: null,
    look: { skin: 0x9a6a48, tunic: 0x2e2a30, belt: 0x1a1618, hair: 0x111111, height: 1.1, headwear: 0x1d1b22, mask: true },
  },

  // ── 동물 (네발 리그) ──
  sheep:   { rig: 'quad', glb: null, scale: 1, kind: 'sheep' },
  lamb:    { rig: 'quad', glb: null, scale: 0.7, kind: 'lamb' },   // 하얀귀
  goat:    { rig: 'quad', glb: null, scale: 1, kind: 'goat' },     // 염소 우리 (서브 B)
  bear:    { rig: 'quad', glb: null, scale: 1, kind: 'bear' },
  lion:    { rig: 'quad', glb: null, scale: 1, kind: 'lion' },
};
