import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../data/stations-kz.json', import.meta.url), 'utf8'));
const osmCatalog = JSON.parse(readFileSync(new URL('../data/stations-kz-osm.json', import.meta.url), 'utf8'));
const curatedCatalog = JSON.parse(readFileSync(new URL('../data/stations-kz-curated.json', import.meta.url), 'utf8'));
const allStations = [...catalog.stations, ...osmCatalog.stations, ...curatedCatalog.stations];
const cache = new Map();
const TYPE_LABELS = { RSTN: 'станция', RSTP: 'остановочный пункт', RSD: 'боковой путь' };

function normalize(value) {
  return String(value).toLocaleLowerCase('ru').replaceAll('ё', 'е')
    .replace(/[áàâäãå]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôöõ]/g, 'o').replace(/[úùûü]/g, 'u').replace(/[ýÿ]/g, 'y')
    .replace(/[ğ]/g, 'g').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function romanize(value) {
  const letters = { а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'gh', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', ң: 'ng', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ы: 'y', і: 'i', э: 'e', ю: 'yu', я: 'ya', ә: 'a', ө: 'o' };
  return normalize(value).replace(/[а-яғқңұүіәө]/g, character => letters[character] || character);
}

function publicStation(station) {
  const matay = station.id === 'geonames:1521078';
  const osm = station.id.startsWith('osm-railroutes:');
  const wikidata = station.id.startsWith('wikidata:');
  return {
    id: station.id,
    name: station.name,
    type: TYPE_LABELS[station.type],
    typeCode: station.type,
    lat: matay ? 45.899227 : station.lat,
    lon: matay ? 78.723926 : station.lon,
    source: matay ? 'GeoNames · координаты Wikidata' : wikidata ? 'Wikidata' : osm ? 'OpenStreetMap (railroutes)' : 'GeoNames',
    sourceUrl: matay ? 'https://www.wikidata.org/wiki/Q98908403' : wikidata ? `https://www.wikidata.org/wiki/${station.id.slice(9)}` : osm ? osmCatalog.sourceUrl : `https://www.geonames.org/${station.id.slice(9)}`
  };
}

const indexed = allStations.map(station => ({
  station,
  primary: [normalize(station.name), romanize(station.name)],
  terms: [...new Set([station.name, station.originalName, ...station.aliases].filter(Boolean).flatMap(value => [normalize(value), romanize(value)]))]
}));

export function getKazakhstanCatalog() {
  return {
    sources: [
      { name: catalog.source, url: catalog.sourceUrl, license: catalog.license, licenseUrl: catalog.licenseUrl },
      { name: osmCatalog.source, url: osmCatalog.sourceUrl, license: osmCatalog.license, licenseUrl: osmCatalog.licenseUrl },
      { name: curatedCatalog.source, url: curatedCatalog.sourceUrl, license: curatedCatalog.license, licenseUrl: curatedCatalog.licenseUrl }
    ],
    importedAt: catalog.importedAt,
    counts: { ...catalog.counts, RSTN: catalog.counts.RSTN + osmCatalog.stations.length + curatedCatalog.stations.length, addedFromOSM: osmCatalog.stations.length, addedFromWikidata: curatedCatalog.stations.length },
    stations: allStations.map(publicStation)
  };
}

export function searchKazakhstanStations(query, limit = 50) {
  const key = normalize(query).replace(/^(станция|станцию|станции|стансасы|разъезд|остановочный пункт)\s+/, '');
  if (key.length < 2) return [];
  const latin = romanize(key);
  return indexed.map(({ station, primary, terms }) => {
    const aliasScore = Math.max(...terms.map(term => {
      if (term === key || term === latin) return 100;
      if (term.startsWith(key) || term.startsWith(latin)) return 70;
      if (term.includes(key) || term.includes(latin)) return 40;
      return 0;
    }));
    const primaryScore = Math.max(...primary.map(term => {
      if (term === key || term === latin) return 130;
      if (term.startsWith(key) || term.startsWith(latin)) return 110;
      return 0;
    }));
    const score = Math.max(aliasScore, primaryScore);
    return { station, score };
  }).filter(item => item.score).sort((a, b) => b.score - a.score || Number(b.station.type === 'RSTN') - Number(a.station.type === 'RSTN') || a.station.name.localeCompare(b.station.name, 'ru'))
    .slice(0, limit).map(item => publicStation(item.station));
}

export async function findStations(query) {
  const local = searchKazakhstanStations(query);
  if (local.length) return local;
  const key = normalize(query);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.items;
  const url = new URL('https://api.openrailwaymap.org/v2/facility');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '50');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5_000),
    headers: { Accept: 'application/json', 'User-Agent': 'AutodispatcherMVP/2.0 (local railway map prototype)' }
  });
  if (!response.ok) throw new Error(`OpenRailwayMap API HTTP ${response.status}`);
  const facilities = await response.json();
  if (!Array.isArray(facilities)) throw new Error('Некорректный ответ OpenRailwayMap');
  const items = facilities.filter(item => {
    const lat = Number(item.latitude), lon = Number(item.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180;
  }).map(item => ({
    id: item.osm_id,
    name: item.name || item.uic_name || item['railway:ref'] || 'Без названия',
    type: item.railway || 'станция',
    lat: Number(item.latitude), lon: Number(item.longitude)
  }));
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(key, { items, expires: Date.now() + 10 * 60_000 });
  return items;
}
