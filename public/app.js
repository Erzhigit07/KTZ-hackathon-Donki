import { GeoMap, loadKazakhstanCatalog } from './map.js';

const $ = selector => document.querySelector(selector);
const sections = ['overview', 'trains', 'journal'];
let lastSection = '';
let zoomOffset = 0;
let firstOverview = true;

const smallMap = new GeoMap($('#map'), { onTap: openMap });
const largeMap = new GeoMap($('#large-map'));
loadKazakhstanCatalog().then(data => {
  const { RSTN = 0, RSTP = 0, RSD = 0 } = data.counts;
  $('#station-catalog-status').textContent = `Локальный справочник: ${RSTN} станций, ${RSTP} остановочных пунктов и ${RSD} боковых путей. Ищите название на карте; точки появляются при приближении.`;
}).catch(() => { $('#station-catalog-status').textContent = 'Справочник станций сейчас недоступен.'; });

function activateSection(id) {
  if (!sections.includes(id)) id = 'overview';
  for (const section of sections) {
    const active = section === id;
    const tab = $(`#tab-${section}`);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $(`#panel-${section}`).hidden = !active;
  }
  if (id === 'overview' && lastSection !== 'overview') requestAnimationFrame(() => {
    if (firstOverview) { smallMap.fitWorld(); firstOverview = false; }
    else smallMap.invalidateSize();
  });
  lastSection = id;
}

for (const section of sections) {
  const tab = $(`#tab-${section}`);
  tab.addEventListener('click', () => { location.hash = section; activateSection(section); });
  tab.addEventListener('keydown', event => {
    const index = sections.indexOf(section);
    const next = event.key === 'ArrowRight' ? (index + 1) % sections.length
      : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    $(`#tab-${sections[next]}`).focus();
    $(`#tab-${sections[next]}`).click();
  });
}
window.addEventListener('hashchange', () => activateSection(location.hash.slice(1)));
activateSection(location.hash.slice(1));

function openMap() {
  $('#map-dialog').hidden = false;
  document.body.classList.add('modal-open');
  largeMap.setRailStyle(smallMap.railStyle);
  largeMap.foundStation = smallMap.foundStation;
  const view = smallMap.getView();
  zoomOffset = largeMap.element.clientWidth > smallMap.element.clientWidth + 200 ? 1 : 0;
  largeMap.setView(view.center, Math.min(19, view.zoom + zoomOffset));
  $('#close-map').focus();
}

function closeMap() {
  const view = largeMap.getView();
  smallMap.setRailStyle(largeMap.railStyle);
  smallMap.foundStation = largeMap.foundStation;
  smallMap.setView(view.center, Math.max(1, view.zoom - zoomOffset));
  $('#map-dialog').hidden = true;
  document.body.classList.remove('modal-open');
  $('#expand-map').focus();
}

$('#expand-map').addEventListener('click', openMap);
$('#close-map').addEventListener('click', closeMap);
$('#map-dialog').addEventListener('click', event => { if (event.target.id === 'map-dialog') closeMap(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#map-dialog').hidden) closeMap(); });

async function updateAiMode() {
  try {
    const response = await fetch('/api/health');
    const status = await response.json();
    $('#ai-mode').textContent = status.ai === 'openai' ? 'Ключ задан · соединение не проверено' : 'Локальный режим';
  } catch { $('#ai-mode').textContent = 'Помощник недоступен'; }
}
updateAiMode();

$('#chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('#chat-input');
  const question = input.value.trim();
  if (!question) return;
  const chat = $('#chat');
  const user = document.createElement('div'); user.className = 'message user'; user.textContent = question; chat.append(user);
  const answer = document.createElement('div'); answer.className = 'message assistant'; answer.textContent = 'Отвечаю…'; chat.append(answer);
  input.value = ''; input.disabled = true;
  chat.scrollTop = chat.scrollHeight;
  try {
    const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
    const data = await response.json();
    answer.textContent = response.ok ? data.answer : data.fallback || data.error || 'Помощник недоступен';
    if (response.ok && data.action?.type === 'focus_station' && smallMap.focusStation(data.action.station)) {
      location.hash = 'overview';
      activateSection('overview');
      $('#map').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    if (data.mode === 'openai') $('#ai-mode').textContent = 'OpenAI API работает';
    else if (data.mode === 'local') $('#ai-mode').textContent = 'Локальный режим';
    else if (!response.ok) $('#ai-mode').textContent = 'OpenAI API недоступен · локальный ответ';
  } catch { answer.textContent = 'Помощник недоступен. Проверьте соединение с сервером.'; $('#ai-mode').textContent = 'Нет соединения с сервером'; }
  input.disabled = false; input.focus(); chat.scrollTop = chat.scrollHeight;
});
