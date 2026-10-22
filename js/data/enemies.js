// 적 능력치. 숫자만 바꿔서 난이도를 조절할 수 있다.
// 피해 단위: 플레이어 체력은 '반 하트' 단위 (하트 1개 = 2).

export const PLAYER = {
  hearts: 4,          // 시작 하트 수 (하얀귀 퀘스트 보상 +1)
  speed: 5.2,         // 이동 속도 m/s
  carrySpeed: 3.6,    // 양을 메고 있을 때
  hurtIframe: 0.8,
  // 스태미나: 공격·스텝·방어에 쓰고, 0이면 탈진(회복이 늦게 시작)
  stamina: { max: 100, regen: 45, guardRegen: 18, delay: 0.5, exhaustDelay: 1.2 },
  // 방향 스텝: time초에 dist m. 무적 iframe[0]~[1]초. 연속 스텝은 비용이 chainAdd씩 늘어남
  step: { time: 0.30, recovery: 0.14, dist: 2.4, backDist: 1.6, iframe: [0.03, 0.21], backIframe: [0.03, 0.15],
          stamina: 20, chainAdd: 8, chainGap: 0.5, nextAt: 0.36, bufferFrom: 0.20 },
  // 방어: 누르고 있으면 일반 방어, 누른 지 jgWindow초 안에 맞으면 저스트 가드
  guard: { arc: 150, chip: 0.25, moveMult: 0.45, blockStun: 0.25, breakTime: 0.9, breakDmg: 0.5,
           jgWindow: 0.15, jgGrace: 0.03, jgSpamWindow: 0.06, jgSpamGap: 0.35, jgTime: 0.12 },
  lockRange: 14, lockLose: 18,
  figHeal: 4,         // 무화과떡 1개 회복량 (반 하트 단위 → 하트 2개)
};

// 적 공격 등급: class 'light' | 'heavy'. unblockable = 방어·저스트 가드 불가 (보스 강공격)
// guardCost = 막을 때 다윗 스태미나 소모, jgPosture = 저스트 가드 당했을 때 이 적이 받는 자세 피해
// deflect = 저스트 가드 당하면 휘청이는 시간(0이면 연속 공격을 그대로 이어감)
// posture: max(붕괴 한계), regen(초당 회복), delay(마지막 피격 뒤 회복 시작), broken(붕괴 시간),
//          flinch(약공격에 움찔하는지), taken(받는 자세 피해 배율)
// hurtbox: 지팡이 판정용 몸통. r 반지름, h 높이, len 몸길이(네발은 앞뒤로 긴 캡슐)
export const ENEMIES = {
  thief: {
    slot: 'thief', hp: 4, xp: 15, opening: 2.0, speed: 3.6, radius: 0.5,
    attack: { damage: 1, range: 1.6, windup: 0.55, cooldown: 1.4, class: 'light', guardCost: 18, jgPosture: 15, deflect: 0.6 },
    // 일반 적 강공격: 몽둥이를 크게 들어 내리치기. 방어·저스트 가드 가능
    heavy: { damage: 2, range: 1.9, windup: 1.0, cooldown: 1.8, class: 'heavy', guardCost: 40, jgPosture: 25, deflect: 0.8,
             chance: 0.2, guardChance: 0.3, guardTime: 1.5 },
    posture: { max: 40, regen: 12, delay: 0.8, broken: 2.0, flinch: true, taken: 1 },
    hurtbox: { r: 0.45, h: 1.8, len: 0 },
  },
  bear: {
    slot: 'bear', hp: 36, xp: 120, opening: 2.0, speed: 3.0, radius: 1.3,
    rescueHits: 3,                      // 양을 물고 있을 때 이만큼 맞으면 양을 놓음 (원안: 물매 3회)
    swipe: { damage: 2, range: 2.6, windup: 0.6, gap: 0.45, cooldown: 1.2, class: 'light', guardCost: 32, jgPosture: 18, deflect: 0.5 },
    rear: { damage: 3, radius: 3.0, windup: 0.95, class: 'heavy', unblockable: true },
    charge: { damage: 3, speed: 15, windup: 0.9, maxTime: 1.3, stun: 2.0, class: 'heavy', unblockable: true },
    rockPosture: 40,                    // 바위에 부딪혀 기절할 때 쌓이는 자세
    posture: { max: 140, regen: 7, delay: 2.0, broken: 3.0, flinch: false, taken: 1 },
    hurtbox: { r: 0.85, h: 2.0, len: 1.7 },
    rageAt: 0.3,                        // 체력 30% 이하 분노: 돌진 2회 연속
  },
  lion: {
    slot: 'lion', hp: 36, xp: 160, opening: 2.0, speed: 4.4, radius: 1.1,
    claw: { damage: 1, range: 2.3, windup: 0.45, gap: 0.28, cooldown: 1.0, class: 'light', guardCost: 20, jgPosture: 14, deflect: 0.7 },
    charge: { damage: 2, speed: 18, windup: 0.6, maxTime: 1.0, stun: 1.0, class: 'heavy', unblockable: true },
    pounce: { damage: 3, radius: 2.4, windup: 1.0, air: 0.55, recover: 1.4, class: 'heavy', unblockable: true },
    posture: { max: 110, regen: 9, delay: 1.5, broken: 2.5, flinch: false, taken: 1 },
    hurtbox: { r: 0.65, h: 1.7, len: 1.5 },
    enrageAt: 0.5,                      // 체력 50%: 하얀귀를 놓고 속도 상승
    enrageSpeed: 1.3,
    finisherWindow: 0.9,                // 마무리 타이밍 입력 시간(초)
  },
};

// 모든 적 공통
export const COMBAT = {
  minTelegraph: 0.6,     // 방어 불가 공격의 최소 예고 시간(초). 분노로 빨라져도 이보다 짧아지지 않음
  brokenHeavyMult: 3,    // 자세 붕괴 중 강공격(결정타) 피해 배율
  brokenLightMult: 1.5,
  brokenReset: 0.5,      // 결정타 뒤 자세를 최대치의 이만큼에서 다시 시작
  postureHpScale: 0.4,   // 자세 회복 = regen × (postureHpScale + (1-postureHpScale) × 남은 체력 비율)
  flinchTime: 0.25,
  // 큰 공격 뒤 빈틈(opening, 각 적의 opening초): 이때 맞혀야 유효타.
  // 빈틈으로 치는 상태: 큰 공격 뒤 멈춤, 기절, 자세 붕괴, 저스트 가드로 휘청, 바위에서 떨어짐
  openStates: ['opening', 'stun', 'broken', 'deflected', 'fall'],
  openMult: 1.6,         // 빈틈에 맞힌 피해 배율
  guardedMult: 0.1,      // 빈틈이 아닐 때 피해 배율 (거의 막힘)
  hitstop: { light: [0.06, 0.08], heavy: [0.09, 0.12], jg: 0.08, wall: 0.05 },  // [다윗, 맞은 적]
};
