import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIncident } from '../server/incidents.js';

test('triage rules remain available without a model train', () => {
  assert.equal(classifyIncident('sensor-vibration').level, 1);
  assert.equal(classifyIncident('aux-computer', true).level, 2);
  assert.equal(classifyIncident('aux-computer', false).level, 3);
  for (const code of ['brake-hose', 'wheel-jam', 'diesel-failure', 'track-obstacle', 'smoke-fire', 'unknown']) {
    assert.equal(classifyIncident(code).level, 3);
  }
});
