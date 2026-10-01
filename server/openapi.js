const response = description => ({ description });
export const openapi = {
  openapi: '3.1.0',
  info: { title: 'Автодиспетчер API', version: '2.0.0', description: 'Основа новой модели. Демонстрационные поезда и маршруты удалены; данные поездов пока не подключены.' },
  servers: [{ url: '/' }],
  paths: {
    '/api/health': { get: { summary: 'Состояние сервера и режим помощника', responses: { 200: response('Сервер работает') } } },
    '/api/state': { get: { summary: 'Пустое состояние новой модели', responses: { 200: response('Нет подключённых поездов и событий') } } },
    '/api/incident-types': { get: { summary: 'Справочник правил триажа Level 1–3', responses: { 200: response('Типы и правила оценки') } } },
    '/api/stations/kz': { get: { summary: 'Локальный каталог железнодорожных объектов Казахстана из GeoNames, OpenStreetMap и Wikidata', responses: { 200: response('1113 записей с координатами и типами') } } },
    '/api/stations': { get: { summary: 'Локальный поиск по Казахстану и поиск по другим странам через OpenRailwayMap', parameters: [{ in: 'query', name: 'q', required: true, schema: { type: 'string', minLength: 2, maxLength: 80 } }], responses: { 200: response('Список станций'), 400: response('Неверный запрос'), 503: response('Внешний поиск OpenRailwayMap недоступен') } } },
    '/api/assistant': { post: { summary: 'Поиск станции на карте или ответ помощника по текущему состоянию', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['question'], properties: { question: { type: 'string', minLength: 1, maxLength: 1000 } } } } } }, responses: { 200: response('Ответ помощника с возможным действием на карте'), 429: response('Слишком много запросов'), 502: response('Внешняя модель недоступна; возвращён локальный ответ') } } }
  }
};
