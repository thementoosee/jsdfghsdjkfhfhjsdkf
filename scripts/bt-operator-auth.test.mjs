/**
 * Mirrors Edge `_shared/bt-operator-auth.ts` timingSafeEqual for Node unit checks.
 * Run: node --test scripts/bt-operator-auth.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  let out = 0;
  for (let i = 0; i < aa.length; i += 1) out |= aa[i] ^ bb[i];
  return out === 0;
}

describe('bt-operator timingSafeEqual', () => {
  it('accepts equal secrets', () => {
    assert.equal(timingSafeEqual('abc123xyz', 'abc123xyz'), true);
  });
  it('rejects length mismatch', () => {
    assert.equal(timingSafeEqual('short', 'longer-secret'), false);
  });
  it('rejects content mismatch', () => {
    assert.equal(timingSafeEqual('abc123xyz', 'abc123xyZ'), false);
  });
});
