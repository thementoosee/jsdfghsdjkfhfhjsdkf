import { describe, expect, it } from 'vitest';
import {
  individualMultiplier,
  rankTopSlotsByMaxMultiplier,
  type TopSlotCandidate,
} from './top-slots';

describe('individualMultiplier', () => {
  it('computes earning / bet', () => {
    expect(individualMultiplier(1000, 2)).toBe(500);
  });

  it('rejects invalid bets', () => {
    expect(individualMultiplier(100, 0)).toBeNull();
    expect(individualMultiplier(0, 2)).toBeNull();
  });
});

describe('rankTopSlotsByMaxMultiplier', () => {
  const base = (partial: Partial<TopSlotCandidate> & Pick<TopSlotCandidate, 'key' | 'slot_name' | 'multiplier'>): TopSlotCandidate => ({
    slot_id: null,
    provider: null,
    slot_image: null,
    bet_amount: 1,
    win_amount: partial.multiplier,
    source: 'hunt',
    ...partial,
  });

  it('keeps one entry per slot and sorts by max multi', () => {
    const ranked = rankTopSlotsByMaxMultiplier(
      [
        base({ key: 'id:a', slot_name: 'A', multiplier: 100, slot_id: 'a' }),
        base({ key: 'id:a', slot_name: 'A', multiplier: 500, slot_id: 'a', win_amount: 500 }),
        base({ key: 'id:b', slot_name: 'B', multiplier: 300, slot_id: 'b' }),
        base({ key: 'id:c', slot_name: 'C', multiplier: 200, slot_id: 'c' }),
      ],
      5,
    );

    expect(ranked[0].slot_name).toBe('A');
    expect(ranked[0].max_multiplier).toBe(500);
    expect(ranked[1].slot_name).toBe('B');
    expect(ranked.filter((r) => r.slot_name === 'A')).toHaveLength(1);
  });

  it('pads to limit with empty placeholders', () => {
    const ranked = rankTopSlotsByMaxMultiplier(
      [base({ key: 'id:a', slot_name: 'A', multiplier: 10, slot_id: 'a' })],
      5,
    );
    expect(ranked).toHaveLength(5);
    expect(ranked[0].slot_name).toBe('A');
    expect(ranked[4].slot_name).toBeNull();
  });
});
