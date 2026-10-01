import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { project, unproject, KAZAKHSTAN_BOUNDS, RAIL_TILE_URL } from '../public/map.js';
import { WORLD_OUTLINES } from '../public/world.js';

test('world projection round-trips coordinates in several countries', () => {
  for (const [lat, lon] of [[51.17, 71.43], [52.52, 13.4], [-33.87, 151.21], [40.71, -74.01]]) {
    const position = project(lat, lon, 8);
    const restored = unproject(position.x, position.y, 8);
    assert.ok(Math.abs(restored.lat - lat) < 1e-8);
    assert.ok(Math.abs(restored.lon - lon) < 1e-8);
  }
});

test('offline world map and Kazakhstan focus remain available', async () => {
  assert.ok(WORLD_OUTLINES.length >= 5);
  assert.ok(KAZAKHSTAN_BOUNDS.west > 45 && KAZAKHSTAN_BOUNDS.east < 90);
  const outline = JSON.parse(await readFile(new URL('../public/assets/kazakhstan-outline.json', import.meta.url), 'utf8'));
  assert.ok(outline.geometry.coordinates[0].length > 100);
  assert.equal(RAIL_TILE_URL, 'https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png');
});
