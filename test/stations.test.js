import test from 'node:test';
import assert from 'node:assert/strict';
import { findStations, getKazakhstanCatalog, searchKazakhstanStations } from '../server/stations.js';
import { requestedStation } from '../server/station-intent.js';

test('station request is recognized in chat', () => {
  assert.equal(requestedStation('найди на карте станцию Матай'), 'Матай');
  assert.equal(requestedStation('Покажи станцию Матай, пожалуйста'), 'Матай');
  assert.equal(requestedStation('Сколько поездов на участке?'), null);
});

test('Matay is available when external station search is down', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const [station] = await findStations('Матай');
    assert.equal(station.name, 'Матай');
    assert.ok(Math.abs(station.lat - 45.899227) < 0.000001);
    assert.ok(Math.abs(station.lon - 78.723926) < 0.000001);
    assert.equal((await findStations('Matay'))[0].name, 'Матай');
  } finally { globalThis.fetch = originalFetch; }
});

test('Kazakhstan catalog is local and Russian queries find supplemental stations', () => {
  const catalog = getKazakhstanCatalog();
  assert.equal(catalog.stations.length, 1113);
  assert.deepEqual(catalog.counts, { RSD: 259, RSTN: 700, RSTP: 154, addedFromOSM: 54, addedFromWikidata: 1 });
  assert.equal(searchKazakhstanStations('Актобе')[0].name, 'Aktobe');
  assert.equal(searchKazakhstanStations('Семей')[0].name, 'Semey');
  assert.equal(searchKazakhstanStations('Кокшетау')[0].name, 'Кокшетау-1');
  assert.equal(searchKazakhstanStations('Матай')[0].name, 'Матай');
});

test('station search accepts world results and discards invalid positions', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => [
    { osm_id: 1, name: 'Berlin Hbf', railway: 'station', latitude: 52.525, longitude: 13.369 },
    { osm_id: 2, name: 'Invalid', railway: 'station', latitude: 999, longitude: 999 }
  ] });
  try {
    assert.deepEqual((await findStations('Berlin Hbf')).map(item => item.name), ['Berlin Hbf']);
  } finally { globalThis.fetch = originalFetch; }
});
