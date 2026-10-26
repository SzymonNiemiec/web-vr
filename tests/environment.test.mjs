import assert from 'node:assert/strict';
import { ENVIRONMENT_COLORS, getPathSegments } from '../src/environment.js';

assert.equal(ENVIRONMENT_COLORS.skyTop, '#4f9ce8');
assert.equal(ENVIRONMENT_COLORS.skyMiddle, '#a9d7ff');
assert.equal(ENVIRONMENT_COLORS.skyBottom, '#dff1ff');
assert.equal(ENVIRONMENT_COLORS.grassBase, '#3f6f35');

assert.deepEqual(getPathSegments(), []);
