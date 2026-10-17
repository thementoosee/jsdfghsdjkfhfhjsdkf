import { describe, expect, it } from 'vitest';
import {
  BT_TEST_ROSTER,
  BT_TEST_USER_PREFIX,
  countBtTestEntries,
  isBtTestTwitchUserId,
} from './bt-test-entries';

describe('bt-test-entries', () => {
  it('defines exactly 8 distinct test players', () => {
    expect(BT_TEST_ROSTER).toHaveLength(8);
    const ids = new Set(BT_TEST_ROSTER.map((p) => p.twitchUserId));
    const names = new Set(BT_TEST_ROSTER.map((p) => p.displayName));
    expect(ids.size).toBe(8);
    expect(names.size).toBe(8);
    for (const p of BT_TEST_ROSTER) {
      expect(p.twitchUserId.startsWith(BT_TEST_USER_PREFIX)).toBe(true);
      expect(p.displayName).toMatch(/^TestPlayer0[1-8]$/);
    }
  });

  it('detects test ids without matching real Twitch numeric ids', () => {
    expect(isBtTestTwitchUserId('bt_test_01')).toBe(true);
    expect(isBtTestTwitchUserId('12345678')).toBe(false);
    expect(countBtTestEntries([{ twitchUserId: 'bt_test_01' }, { twitchUserId: '99' }])).toBe(1);
  });
});
