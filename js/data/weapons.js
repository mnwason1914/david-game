// 무기 데이터. 무기는 캐릭터와 분리된 모델이며, 캐릭터 리그의 소켓(socket)에 붙는다.
// 새 무기(예: 물매)는 여기에 항목을 추가하고 type에 맞는 공격 로직만 있으면 된다.
//
// model: 'proc:이름'  → engine/models.js 의 절차적 로우폴리 모델
//        'assets/xxx.glb' → glb 파일 (Tripo 등에서 만든 모델로 교체할 때)
// socket: 붙일 소켓 이름 (engine/rig.js 의 SOCKETS 참고). 'grip' = 양손 파지용 몸 소켓
// offset / rotation: 소켓 기준 위치(m)와 회전(라디안)

export const WEAPONS = {
  staff: {
    name: '목자의 지팡이',
    type: 'melee',
    power: 1,            // 기본 피해 (약공격 1타 = power × 배율 × 레벨 배율)
    // 양손 파지: 지팡이는 몸의 grip 소켓에 붙고, 두 손이 지팡이를 잡는다.
    // 지팡이 축 위 거리(m): 0 = 뒷손(오른손), 앞손 0.45, 끝 1.4, 꽁무니 -0.2
    grip: { front: 0.45 },
    // 타격 구간: 뒷손에서 from~to(m). 그보다 안쪽은 손잡이 쪽(피해·자세 nearMult배, 반동 2배)
    hitZone: { from: 0.6, to: 1.4, near: 0.15, pad: 0.12, nearMult: 0.5 },
    // 공격 데이터 (시간은 초). startup → active(판정) → recovery
    // chain: 입력창 from~to 사이에 누른 입력을 at 시점에 다음 공격으로 연결
    moves: {
      L1: { startup: 0.18, active: 0.10, recovery: 0.32, dmg: 1.0, posture: 8, stamina: 12, lunge: 0.25, knock: 4,
            chain: { from: 0.10, to: 0.52, at: 0.40, light: 'L2', heavy: 'H' }, stepCancel: 0.36, guardCancel: 0.45 },
      L2: { startup: 0.20, active: 0.10, recovery: 0.48, dmg: 1.2, posture: 10, stamina: 14, lunge: 0.15, knock: 5,
            chain: null, lockout: 0.20, stepCancel: 0.38, guardCancel: 0.60 },
      H:  { startup: 0.46, active: 0.12, recovery: 0.60, whiff: 0.25, dmg: 1.4, posture: 30, stamina: 30, lunge: 0.70, knock: 8,
            thrust: true, stepCancelOnHit: 0.95 },
      // 저스트 가드 후 window초 안에 강공격 → 같은 찌르기를 빠르게
      counter: { base: 'H', startup: 0.28, posture: 45, stamina: 20, window: 0.50 },
      // 스텝 회복 중 약공격 → L1을 준비 0.14초로
      stepAttack: { base: 'L1', startup: 0.14, lunge: 0.35 },
    },
    model: 'proc:staff',
    socket: 'grip',
    handSocket: 'handR',  // 컷신 포즈(기도·앉기 등)에서는 오른손에 든다
    offset: [0, -0.05, 0],
    rotation: [0, 0, 0],
    scale: 1,
  },

  // 물매: 서브 B에서 해금되는 보조 무기. 지팡이는 그대로 들고, 버튼을 누르면 오른손으로 돌을 던진다.
  // 시간은 초, 거리는 m. 돌은 고정 대상 → 부드러운 조준 → 바라보는 방향 순으로 날아간다.
  sling: {
    name: '물매', type: 'ranged',
    // 투척 아이템: 한 번 던질 때마다 매끄러운 돌 1개. 바닥의 빛나는 돌 자리에서 다시 줍는다
    maxStones: 10,
    startStones: 5,      // 물매를 만들 때 시냇가에서 주운 돌
    windup: 0.42,        // 머리 위로 돌리기 (이 동안 서 있음)
    recovery: 0.28,
    cooldown: 0.5,       // 다음 던지기까지
    stamina: 14,
    speed: 26,           // 돌 속도 (m/s)
    range: 22,
    aimRange: 20,        // 이 거리 안의 적을 자동으로 겨눔
    dmg: 0.8,            // 지팡이 약공격 1타 대비 피해
    posture: 12,
    knock: 1.5,
    model: 'proc:sling', handSocket: 'handR',
  },
};
