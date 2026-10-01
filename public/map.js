import { WORLD_OUTLINES } from './world.js';

const TILE_SIZE = 256;
let kazakhstanCatalogPromise;
export function loadKazakhstanCatalog() {
  return kazakhstanCatalogPromise ||= fetch('/api/stations/kz').then(response => {
    if (!response.ok) throw new Error('Справочник станций недоступен');
    return response.json();
  });
}
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const worldCenter = ({ lat, lon }) => ({ lat: clamp(lat, -85, 85), lon: ((lon + 180) % 360 + 360) % 360 - 180 });
export const KAZAKHSTAN_BOUNDS = { south: 40.45, north: 55.5, west: 46.2, east: 87.6 };
export const RAIL_TILE_URL = 'https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png';
export const RAIL_STYLES = { standard: 'Пути и станции', signals: 'Сигналы', maxspeed: 'Допустимые скорости', electrification: 'Электрификация', gauge: 'Ширина колеи' };

export function project(lat, lon, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const radians = clamp(lat, -85.051129, 85.051129) * Math.PI / 180;
  return { x: (lon + 180) / 360 * scale, y: (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * scale };
}

export function unproject(x, y, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  return { lat: clamp(Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI, -85, 85), lon: x / scale * 360 - 180 };
}

export class GeoMap {
  constructor(element, { onTap } = {}) {
    this.element = element;
    this.onTap = onTap;
    this.center = { lat: 0, lon: 20 };
    this.zoom = 2;
    this.railStyle = 'standard';
    this.tileUrl = window.MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    this.railTileUrl = RAIL_TILE_URL;
    this.tiles = new Map();
    this.railTiles = new Map();
    this.tilesEnabled = true;
    this.railTilesEnabled = true;
    this.foundStation = null;
    this.kazakhstanStations = [];
    this.showKazakhstanStations = true;
    this.outline = null;

    this.baseLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.baseLayer.classList.add('geo-base');
    this.tileLayer = document.createElement('div'); this.tileLayer.className = 'geo-tiles';
    this.railTileLayer = document.createElement('div'); this.railTileLayer.className = 'geo-rail-tiles';
    this.markerLayer = document.createElement('div'); this.markerLayer.className = 'geo-markers';
    this.tools = document.createElement('div'); this.tools.className = 'geo-tools';
    this.controls = document.createElement('div'); this.controls.className = 'geo-controls';
    this.errorNote = document.createElement('div'); this.errorNote.className = 'geo-error'; this.errorNote.hidden = true;
    this.attribution = document.createElement('div'); this.attribution.className = 'geo-attribution';
    this.attribution.innerHTML = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · <a href="https://www.openrailwaymap.org/" target="_blank" rel="noopener">OpenRailwayMap</a> · <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>)';

    this.styleSelect = document.createElement('select'); this.styleSelect.setAttribute('aria-label', 'Слой железнодорожной карты');
    for (const [value, label] of Object.entries(RAIL_STYLES)) this.styleSelect.append(new Option(label, value));
    this.styleSelect.addEventListener('change', () => this.setRailStyle(this.styleSelect.value));
    this.searchForm = document.createElement('form'); this.searchForm.className = 'geo-search';
    this.searchInput = document.createElement('input'); this.searchInput.type = 'search'; this.searchInput.minLength = 2; this.searchInput.maxLength = 80; this.searchInput.placeholder = 'Найти станцию'; this.searchInput.setAttribute('aria-label', 'Название станции');
    const searchButton = document.createElement('button'); searchButton.type = 'submit'; searchButton.textContent = 'Найти';
    this.searchResults = document.createElement('div'); this.searchResults.className = 'geo-search-results'; this.searchResults.hidden = true;
    this.searchForm.append(this.searchInput, searchButton);
    this.searchForm.addEventListener('submit', event => { event.preventDefault(); this.searchStations(); });
    this.stationToggle = document.createElement('label'); this.stationToggle.className = 'geo-station-toggle';
    this.stationCheckbox = document.createElement('input'); this.stationCheckbox.type = 'checkbox'; this.stationCheckbox.checked = true;
    this.stationCheckbox.addEventListener('change', () => { this.showKazakhstanStations = this.stationCheckbox.checked; this.drawFoundStation(); });
    this.stationToggle.append(this.stationCheckbox, document.createTextNode('Объекты ЖД Казахстана'));
    this.tools.append(this.styleSelect, this.searchForm, this.searchResults, this.stationToggle);
    this.element.replaceChildren(this.baseLayer, this.tileLayer, this.railTileLayer, this.markerLayer, this.tools, this.controls, this.errorNote, this.attribution);
    this.addControl('+', 'Приблизить карту', () => this.setView(this.center, this.zoom + 1));
    this.addControl('−', 'Отдалить карту', () => this.setView(this.center, this.zoom - 1));
    this.addControl('🌐', 'Показать весь мир', () => this.fitWorld());
    this.addControl('KZ', 'Показать весь Казахстан', () => this.fitKazakhstan());
    this.attachEvents();
    this.resizeObserver = new ResizeObserver(() => this.draw()); this.resizeObserver.observe(element);
    fetch('/assets/kazakhstan-outline.json').then(response => response.json()).then(data => { this.outline = data.geometry.coordinates[0]; this.drawBase(); }).catch(() => {});
    loadKazakhstanCatalog().then(data => {
      this.kazakhstanStations = data.stations;
      this.stationToggle.lastChild.textContent = `Объекты ЖД Казахстана · ${data.stations.length}`;
      this.drawFoundStation();
    }).catch(() => { this.stationToggle.lastChild.textContent = 'Справочник станций недоступен'; });
    this.draw();
  }

  addControl(label, title, action) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.title = title; button.setAttribute('aria-label', title);
    button.addEventListener('click', event => { event.stopPropagation(); action(); }); this.controls.append(button);
  }

  getView() { return { center: { ...this.center }, zoom: this.zoom }; }
  setView(center, zoom) { this.center = worldCenter(center); this.zoom = clamp(zoom, 1, 19); this.draw(); }
  invalidateSize() { this.draw(); }

  fitWorld() {
    const width = this.element.clientWidth, height = this.element.clientHeight;
    if (!width || !height) return;
    let zoom = 1;
    for (let candidate = 1; candidate <= 5; candidate++) {
      if (TILE_SIZE * 2 ** candidate > Math.min(width - 40, height * 1.65)) break;
      zoom = candidate;
    }
    this.foundStation = null; this.setView({ lat: 0, lon: 20 }, zoom);
  }

  fitKazakhstan() {
    const width = this.element.clientWidth, height = this.element.clientHeight;
    if (!width || !height) return;
    let zoom = 3;
    for (let candidate = 3; candidate <= 10; candidate++) {
      const nw = project(KAZAKHSTAN_BOUNDS.north, KAZAKHSTAN_BOUNDS.west, candidate);
      const se = project(KAZAKHSTAN_BOUNDS.south, KAZAKHSTAN_BOUNDS.east, candidate);
      if (se.x - nw.x > width - 60 || se.y - nw.y > height - 60) break;
      zoom = candidate;
    }
    const nw = project(KAZAKHSTAN_BOUNDS.north, KAZAKHSTAN_BOUNDS.west, zoom);
    const se = project(KAZAKHSTAN_BOUNDS.south, KAZAKHSTAN_BOUNDS.east, zoom);
    this.foundStation = null; this.setView(unproject((nw.x + se.x) / 2, (nw.y + se.y) / 2, zoom), zoom);
  }

  setRailStyle(style) {
    if (!(style in RAIL_STYLES)) return;
    if (this.railStyle !== style) { for (const tile of this.railTiles.values()) tile.remove(); this.railTiles.clear(); }
    this.railStyle = style; this.styleSelect.value = style;
    this.railTileUrl = `https://tiles.openrailwaymap.org/${style}/{z}/{x}/{y}.png`;
    this.railTilesEnabled = true; this.draw();
  }

  focusStation(station) {
    if (!Number.isFinite(station?.lat) || !Number.isFinite(station?.lon) || Math.abs(station.lat) > 85 || Math.abs(station.lon) > 180) return false;
    this.foundStation = station;
    this.searchInput.value = station.name;
    this.searchResults.hidden = true;
    this.setView({ lat: station.lat, lon: station.lon }, 13);
    return true;
  }

  async searchStations() {
    const query = this.searchInput.value.trim(); if (query.length < 2) return;
    this.searchResults.hidden = false; this.searchResults.textContent = 'Ищу станции…';
    try {
      const response = await fetch(`/api/stations?q=${encodeURIComponent(query)}`);
      const items = await response.json();
      if (!response.ok) throw new Error(items.error || 'Поиск временно недоступен');
      this.searchResults.replaceChildren();
      if (!items.length) { this.searchResults.textContent = 'Станции не найдены.'; return; }
      for (const station of items) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = `${station.name} · ${station.type}`;
        button.addEventListener('click', () => this.focusStation(station));
        this.searchResults.append(button);
      }
    } catch (error) { this.searchResults.textContent = error.message || 'Поиск временно недоступен'; }
  }

  attachEvents() {
    this.element.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button,a,input,select,.geo-controls,.geo-tools')) { this.pointer = null; return; }
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: project(this.center.lat, this.center.lon, this.zoom), moved: false };
      this.element.setPointerCapture(event.pointerId);
    });
    this.element.addEventListener('pointermove', event => {
      const drag = this.pointer; if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      this.center = worldCenter(unproject(drag.origin.x - dx, drag.origin.y - dy, this.zoom)); this.draw();
    });
    this.element.addEventListener('pointerup', event => {
      const drag = this.pointer; this.pointer = null;
      if (!drag || drag.id !== event.pointerId) return;
      if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
      if (!drag.moved && this.onTap) this.onTap();
    });
    this.element.addEventListener('pointercancel', () => { this.pointer = null; });
    this.element.addEventListener('wheel', event => {
      event.preventDefault();
      const next = clamp(this.zoom + (event.deltaY < 0 ? 1 : -1), 1, 19); if (next === this.zoom) return;
      const box = this.element.getBoundingClientRect();
      const offset = { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 };
      const center = project(this.center.lat, this.center.lon, this.zoom);
      const anchor = unproject(center.x + offset.x, center.y + offset.y, this.zoom);
      const anchored = project(anchor.lat, anchor.lon, next);
      this.zoom = next; this.center = worldCenter(unproject(anchored.x - offset.x, anchored.y - offset.y, next)); this.draw();
    }, { passive: false });
    this.element.addEventListener('keydown', event => {
      if (event.target !== this.element) return;
      if (event.key === 'Enter' && this.onTap) { this.onTap(); return; }
      if (event.key === '+' || event.key === '=') this.setView(this.center, this.zoom + 1);
      else if (event.key === '-') this.setView(this.center, this.zoom - 1);
      else if (event.key.startsWith('Arrow')) {
        const center = project(this.center.lat, this.center.lon, this.zoom);
        const dx = event.key === 'ArrowRight' ? 100 : event.key === 'ArrowLeft' ? -100 : 0;
        const dy = event.key === 'ArrowDown' ? 100 : event.key === 'ArrowUp' ? -100 : 0;
        this.center = worldCenter(unproject(center.x + dx, center.y + dy, this.zoom)); this.draw();
      } else return;
      event.preventDefault();
    });
  }

  toScreen(lat, lon) {
    const center = project(this.center.lat, this.center.lon, this.zoom), point = project(lat, lon, this.zoom);
    const worldWidth = TILE_SIZE * 2 ** this.zoom;
    const dx = ((point.x - center.x + worldWidth / 2) % worldWidth + worldWidth) % worldWidth - worldWidth / 2;
    return { x: dx + this.element.clientWidth / 2, y: point.y - center.y + this.element.clientHeight / 2 };
  }

  draw() {
    const width = this.element.clientWidth, height = this.element.clientHeight; if (!width || !height) return;
    const center = project(this.center.lat, this.center.lon, this.zoom);
    const left = center.x - width / 2, top = center.y - height / 2;
    const firstX = Math.floor(left / TILE_SIZE), lastX = Math.floor((left + width - 1) / TILE_SIZE);
    const firstY = Math.floor(top / TILE_SIZE), lastY = Math.floor((top + height - 1) / TILE_SIZE);
    this.syncTiles(this.tiles, this.tileLayer, this.tileUrl, this.tilesEnabled, firstX, lastX, firstY, lastY, left, top);
    this.syncTiles(this.railTiles, this.railTileLayer, this.railTileUrl, this.railTilesEnabled, firstX, lastX, firstY, lastY, left, top);
    this.drawBase(); this.drawFoundStation();
  }

  syncTiles(cache, layer, url, enabled, firstX, lastX, firstY, lastY, left, top) {
    const desired = new Set(), maxIndex = 2 ** this.zoom;
    if (enabled) for (let x = firstX; x <= lastX; x++) for (let y = firstY; y <= lastY; y++) {
      if (y < 0 || y >= maxIndex) continue;
      const key = `${this.zoom}/${x}/${y}`; desired.add(key);
      let tile = cache.get(key);
      if (!tile) {
        tile = document.createElement('img'); tile.className = 'geo-tile'; tile.alt = ''; tile.draggable = false; tile.dataset.status = 'pending';
        tile.addEventListener('load', () => { tile.dataset.status = 'loaded'; if (layer === this.railTileLayer) this.errorNote.hidden = true; });
        tile.addEventListener('error', () => {
          if (cache.get(key) !== tile) return;
          tile.dataset.status = 'error'; tile.style.display = 'none';
          if (cache.size && [...cache.values()].every(image => image.dataset.status === 'error')) {
            if (layer === this.railTileLayer) { this.railTilesEnabled = false; this.errorNote.textContent = 'OpenRailwayMap сейчас недоступна · показана локальная карта мира.'; this.errorNote.hidden = false; }
            else this.tilesEnabled = false;
            for (const image of cache.values()) image.remove(); cache.clear();
          }
        });
        cache.set(key, tile); layer.append(tile);
        const wrappedX = ((x % maxIndex) + maxIndex) % maxIndex;
        tile.src = url.replace('{z}', this.zoom).replace('{x}', wrappedX).replace('{y}', y);
      }
      tile.style.left = `${x * TILE_SIZE - left}px`; tile.style.top = `${y * TILE_SIZE - top}px`;
    }
    for (const [key, tile] of cache) if (!desired.has(key)) { tile.remove(); cache.delete(key); }
  }

  drawFoundStation() {
    this.markerLayer.replaceChildren();
    if (this.showKazakhstanStations && this.zoom >= 8) for (const station of this.kazakhstanStations) {
      const point = this.toScreen(station.lat, station.lon);
      if (point.x < -10 || point.x > this.element.clientWidth + 10 || point.y < -10 || point.y > this.element.clientHeight + 10) continue;
      const dot = document.createElement('button'); dot.type = 'button'; dot.className = `geo-station-dot ${station.typeCode}`;
      dot.style.left = `${point.x}px`; dot.style.top = `${point.y}px`;
      dot.title = `${station.name} · ${station.type}`; dot.setAttribute('aria-label', dot.title);
      dot.addEventListener('click', event => { event.stopPropagation(); this.focusStation(station); });
      this.markerLayer.append(dot);
    }
    if (!this.foundStation) return;
    const point = this.toScreen(this.foundStation.lat, this.foundStation.lon);
    if (point.x < -100 || point.x > this.element.clientWidth + 100 || point.y < -50 || point.y > this.element.clientHeight + 50) return;
    const pin = document.createElement('div'); pin.className = 'geo-found-station'; pin.style.left = `${point.x}px`; pin.style.top = `${point.y}px`; pin.textContent = this.foundStation.name; this.markerLayer.append(pin);
  }

  drawBase() {
    const width = this.element.clientWidth, height = this.element.clientHeight; if (!width || !height) return;
    this.baseLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const center = project(this.center.lat, this.center.lon, this.zoom), worldWidth = TILE_SIZE * 2 ** this.zoom;
    const point = ([lon, lat], shift = 0) => { const pixel = project(lat, lon, this.zoom); return `${(pixel.x - center.x + width / 2 + shift).toFixed(1)} ${(pixel.y - center.y + height / 2).toFixed(1)}`; };
    const shape = (coordinates, shift, fill, stroke) => `<path d="${coordinates.map((coordinate, index) => `${index ? 'L' : 'M'}${point(coordinate, shift)}`).join('')}Z" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
    const land = [-worldWidth, 0, worldWidth].map(shift => WORLD_OUTLINES.map(outline => shape(outline, shift, '#e9e8dc', '#c6d1c5')).join('')).join('');
    const kazakhstan = this.outline ? [-worldWidth, 0, worldWidth].map(shift => shape(this.outline, shift, '#deedce', '#87ae83')).join('') : '';
    this.baseLayer.innerHTML = `<rect width="${width}" height="${height}" fill="#acd2dc"/>${land}${kazakhstan}`;
  }
}
