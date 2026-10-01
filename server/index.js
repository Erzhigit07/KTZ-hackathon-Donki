import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openapi } from './openapi.js';
import { findStations, getKazakhstanCatalog } from './stations.js';
import { requestedStation } from './station-intent.js';
import { INCIDENT_TYPES } from './incidents.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC = path.join(ROOT, 'public');
const assistantRequests = new Map();

async function aiConfig() {
  let local = {};
  try {
    const contents = await readFile(path.join(ROOT, '.env'), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(OPENAI_API_KEY|OPENAI_MODEL)\s*=\s*(.*?)\s*$/);
      if (match) local[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { key: process.env.OPENAI_API_KEY || local.OPENAI_API_KEY || '', model: process.env.OPENAI_MODEL || local.OPENAI_MODEL || 'gpt-6-luna' };
}

const state = () => ({ status: 'empty', source: null, trains: [], incidents: [], events: [] });
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
};
const error = (res, status, message) => json(res, status, { error: message });

async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 64_000) throw new Error('Request too large');
  }
  try { return JSON.parse(data || '{}'); } catch { throw new Error('Invalid JSON'); }
}

function localAnswer(question) {
  const q = question.toLocaleLowerCase('ru');
  if (/карт|станц|пут|маршрут|слой/.test(q)) return 'Карта OpenRailwayMap показывает железнодорожные объекты из OpenStreetMap. Её можно перемещать по миру, приближать и искать станции. Кнопка KZ возвращает к Казахстану.';
  if (/инцидент|полом|триаж|критич/.test(q)) return 'Правила триажа Level 1–3 сохранены. Активных оценок нет: сначала нужно подключить новую модель и определить, какие события поступают в систему.';
  if (/поезд|состав|скорост|координат|данн|источник|реальн/.test(q)) return 'Данные поездов пока не подключены. Список составов, координаты и скорость сейчас пусты; я не могу сообщить их без нового источника данных.';
  return 'Сейчас доступна мировая железнодорожная карта. Новую модель движения и источник данных поездов ещё предстоит определить.';
}

async function assistantAnswer(question) {
  const ai = await aiConfig();
  if (!ai.key) return { answer: localAnswer(question), mode: 'local' };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${ai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ai.model, store: false, max_output_tokens: 400,
      instructions: 'Ты русскоязычный помощник в прототипе рабочего места железнодорожного диспетчера. Сейчас доступна мировая карта OpenRailwayMap, но данные поездов, маршруты, координаты, скорости, инциденты и журнал пусты. Не выдумывай их и не выдавай команд для управления движением. Отвечай кратко и ясно.',
      input: question })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `OpenAI HTTP ${response.status}`);
  const answer = result.output?.flatMap(item => item.type === 'message' ? item.content || [] : [])
    .filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
  if (!answer) throw new Error('AI returned no text');
  return { answer, mode: 'openai' };
}

const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
async function serveStatic(res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return error(res, 400, 'Bad path'); }
  const file = path.resolve(PUBLIC, '.' + (decoded === '/' ? '/index.html' : decoded));
  if (!file.startsWith(PUBLIC + path.sep)) return error(res, 403, 'Forbidden');
  if (!existsSync(file)) return error(res, 404, 'Not found');
  res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;
  try {
    if (req.method === 'GET' && route === '/api/health') return json(res, 200, { ok: true, time: new Date().toISOString(), mode: 'empty', ai: (await aiConfig()).key ? 'openai' : 'local' });
    if (req.method === 'GET' && route === '/api/state') return json(res, 200, state());
    if (req.method === 'GET' && route === '/api/incident-types') return json(res, 200, INCIDENT_TYPES);
    if (req.method === 'GET' && route === '/api/stations/kz') return json(res, 200, getKazakhstanCatalog());
    if (req.method === 'GET' && route === '/api/stations') {
      const query = (url.searchParams.get('q') || '').trim();
      if (query.length < 2 || query.length > 80) return error(res, 400, 'Введите от 2 до 80 символов');
      try { return json(res, 200, await findStations(query)); }
      catch { return error(res, 503, 'Поиск OpenRailwayMap временно недоступен'); }
    }
    if (req.method === 'GET' && route === '/api/openapi.json') return json(res, 200, openapi);
    if (req.method === 'POST' && route === '/api/assistant') {
      const ip = req.socket.remoteAddress || 'unknown', now = Date.now();
      const recent = (assistantRequests.get(ip) || []).filter(time => now - time < 60_000);
      if (recent.length >= 10) return error(res, 429, 'Too many requests');
      recent.push(now); assistantRequests.set(ip, recent);
      const data = await body(req);
      if (typeof data.question !== 'string' || !data.question.trim() || data.question.length > 1000) return error(res, 400, 'Question must be 1–1000 characters');
      const stationQuery = requestedStation(data.question);
      if (stationQuery) {
        try {
          const matches = await findStations(stationQuery);
          if (!matches.length) return json(res, 200, { mode: 'map-search', answer: `Станцию «${stationQuery}» не нашёл. Уточните название или попробуйте поиск над картой.` });
          const station = matches[0];
          return json(res, 200, { mode: 'map', answer: `Нашёл станцию ${station.name}. Приближаю её на карте.`, action: { type: 'focus_station', station } });
        } catch {
          return json(res, 200, { mode: 'map-search', answer: `Не могу найти станцию «${stationQuery}»: внешний поиск сейчас недоступен. Попробуйте позже или уточните название.` });
        }
      }
      try { return json(res, 200, await assistantAnswer(data.question.trim())); }
      catch (cause) { return json(res, 502, { error: `AI unavailable: ${cause.message}`, fallback: localAnswer(data.question) }); }
    }
    if (req.method === 'GET') return serveStatic(res, route);
    return error(res, 404, 'Not found');
  } catch (cause) {
    const status = /Invalid|too large/i.test(cause.message || '') ? 400 : 500;
    return error(res, status, cause.message || 'Internal error');
  }
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`Автодиспетчер: http://${host}:${server.address().port}`));

export { server };
