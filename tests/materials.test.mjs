import assert from 'node:assert/strict';
import { getColorOverride, getMaterialOverride } from '../src/materials.js';

assert.deepEqual(getMaterialOverride('Dach'), {
  color: '#353b42',
  roughness: 0.72,
  metalness: 0.02
});

assert.deepEqual(getMaterialOverride('Regen_Keramzytobeton'), {
  color: '#d9d3c7',
  roughness: 0.9,
  metalness: 0
});

assert.deepEqual(getMaterialOverride('unknown'), null);

assert.deepEqual(getColorOverride('#c0c0c0'), {
  color: '#d9d3c7',
  roughness: 0.9,
  metalness: 0
});

assert.equal(getColorOverride('#123456'), null);
