import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPublishWorldSnapshot, nextRelayCursor } from '../dist/world-relay-policy.js';
test('relay is rate limited to five snapshots per second', () => {
 assert.equal(shouldPublishWorldSnapshot(1000,1199),false);
 assert.equal(shouldPublishWorldSnapshot(1000,1200),true);
 assert.equal(shouldPublishWorldSnapshot(1000,999),false);
});
test('relay cursor only moves forward through safe integer IDs', () => {
 assert.equal(nextRelayCursor(10,11),11);
 assert.equal(nextRelayCursor(10,9),10);
 assert.equal(nextRelayCursor(10,'12'),10);
 assert.equal(nextRelayCursor(10,Number.MAX_SAFE_INTEGER+1),10);
});
