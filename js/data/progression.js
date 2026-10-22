// 레벨 시스템. 숫자만 바꿔서 성장 속도를 조절할 수 있다.

export const LEVEL = {
  max: 10,
  // 다음 레벨까지 필요한 경험치
  xpToNext: (lv) => 60 + lv * 40,
  // 레벨당 공격력 증가 (1레벨 = 1.0배)
  attackPerLevel: 0.08,
  // 하트가 늘어나는 레벨 (레벨업 보상)
  heartLevels: [3, 5, 7, 9],
};

// 경험치 보상
export const XP = {
  thief: 15,
  bear: 120,
  lion: 160,
  scene: 40,     // 본편 씬 하나 완료
  sub: 50,       // 서브 퀘스트 완료
};

// 장면 선택으로 바로 시작할 때 맞춰 주는 최소 레벨 (처음부터 하면 직접 올린 레벨을 씀)
export const SEGMENT_MIN_LEVEL = {
  s1: 1, s2: 1, s3: 2, subA: 2, free: 2, subB: 2, s6a: 3, s6b: 3, s6c: 4, s7: 4,
};

// 서브 퀘스트 목록 (종료 화면 집계용)
export const SUB_QUESTS = {
  A: '별 아래 수금',
  B: '물매 만들기',
  C: '형들의 점심',
  D: '우물가 노파의 물동이',
  E: '다친 양 치료',
  F: '무화과 따기',
};
