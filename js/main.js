// 시작점: 타이틀 화면 → 장면 선택 → 게임 실행
import { Game } from './game.js';
import { Runner, SEGMENTS } from './quest.js';

const $ = (id) => document.getElementById(id);

// 전체화면: 안드로이드·아이패드·PC는 Fullscreen API, 아이폰은 '홈 화면에 추가'로만 가능
const root = document.documentElement;
const canFull = !!(root.requestFullscreen || root.webkitRequestFullscreen);
const isStandalone = () => navigator.standalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
const isFull = () => isStandalone() || !!(document.fullscreenElement || document.webkitFullscreenElement);
function goFull() {
  if (isFull() || !canFull) return false;
  try {
    const r = (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' });
    r?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } catch (e) {}
  return true;
}
const syncFull = () => document.body.classList.toggle('isfull', isFull());
document.addEventListener('fullscreenchange', syncFull);
document.addEventListener('webkitfullscreenchange', syncFull);
syncFull();

async function boot() {
  const game = new Game();
  window.game = game; // 디버그용
  await game.init();
  const runner = new Runner(game);
  game.setTime('night');
  game.player.setPos(-14, 6, 0);
  game.snapCamera();
  game.start(runner);
  game.ui.fade(0.35, 0.01);
  $('loading').style.display = 'none';
  $('title').classList.add('on');

  // 장면 선택 (테스트용)
  const list = $('scene-list');
  SEGMENTS.forEach((s, i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1}. ${s.title}`;
    b.onclick = () => begin(i);
    list.appendChild(b);
  });

  const begin = async (i) => {
    goFull(); // 탭 직후에 불러야 브라우저가 허용한다
    $('title').classList.remove('on');
    $('scenes').classList.remove('on');
    await game.ui.fade(1, 0.3);
    runner.runFrom(i);
  };
  $('btn-start').onclick = () => begin(0);
  $('btn-full').onclick = () => { if (!goFull()) $('fullhint').classList.toggle('show'); };
  $('btn-scenes').onclick = () => $('scenes').classList.add('on');
  $('btn-scenes-close').onclick = () => $('scenes').classList.remove('on');
  $('btn-restart').onclick = () => { $('end').classList.remove('on'); begin(0); };

  // ?scene=3 처럼 주소로 바로 장면 시작
  const q = new URLSearchParams(location.search).get('scene');
  if (q !== null) begin(Math.max(0, Math.min(SEGMENTS.length - 1, (+q || 1) - 1)));
}

boot().catch((e) => {
  console.error(e);
  $('loading').textContent = '불러오기 실패: ' + e.message;
});
