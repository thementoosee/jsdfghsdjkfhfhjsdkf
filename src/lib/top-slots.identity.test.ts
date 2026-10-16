import { describe, expect, it } from 'vitest';
import {
  individualMultiplier,
  rankTopSlotsByMaxMultiplier,
  type TopSlotCandidate,
} from './top-slots';

/**
 * Fixture helpers mirror fetchTopSlotsRanking key rules WITHOUT touching the DB:
 * - Hunt with slot_id → key `id:{uuid}`
 * - Chill with exact catalog match → key `id:{uuid}`
 * - Chill without catalog match → key `name:{lower}`
 */
function huntCandidate(opts: {
  slotId: string | null;
  slotName: string;
  multi: number;
  bet?: number;
  win?: number;
}): TopSlotCandidate {
  const bet = opts.bet ?? 1;
  const win = opts.win ?? opts.multi * bet;
  return {
    key: opts.slotId ? `id:${opts.slotId}` : `name:${opts.slotName.toLowerCase()}`,
    slot_id: opts.slotId,
    slot_name: opts.slotName,
    provider: 'Test',
    slot_image: null,
    multiplier: opts.multi,
    bet_amount: bet,
    win_amount: win,
    source: 'hunt',
    ambiguous: !opts.slotId,
  };
}

function chillCandidate(opts: {
  catalogId: string | null;
  slotName: string;
  multi: number;
  bet?: number;
  win?: number;
}): TopSlotCandidate {
  const bet = opts.bet ?? 1;
  const win = opts.win ?? opts.multi * bet;
  return {
    key: opts.catalogId ? `id:${opts.catalogId}` : `name:${opts.slotName.toLowerCase()}`,
    slot_id: opts.catalogId,
    slot_name: opts.slotName,
    provider: opts.catalogId ? 'Test' : null,
    slot_image: null,
    multiplier: opts.multi,
    bet_amount: bet,
    win_amount: win,
    source: 'chill',
    ambiguous: !opts.catalogId,
  };
}

describe('TOP 5 identity — CHILL name + Opening slot_id', () => {
  const XMAS_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('merges when CHILL resolves to the same catalog id as Opening', () => {
    const ranked = rankTopSlotsByMaxMultiplier(
      [
        chillCandidate({ catalogId: XMAS_ID, slotName: 'Xmas Drop', multi: 5000 }),
        huntCandidate({ slotId: XMAS_ID, slotName: 'Xmas Drop', multi: 10000, bet: 2, win: 20000 }),
      ],
      5,
    );

    const filled = ranked.filter((r) => r.slot_name);
    expect(filled).toHaveLength(1);
    expect(filled[0].slot_name).toBe('Xmas Drop');
    expect(filled[0].max_multiplier).toBe(10000);
    expect(filled[0].slot_id).toBe(XMAS_ID);
  });

  it('keeps higher historical when Opening is lower than CHILL', () => {
    const ranked = rankTopSlotsByMaxMultiplier(
      [
        chillCandidate({ catalogId: XMAS_ID, slotName: 'Xmas Drop', multi: 5000 }),
        huntCandidate({ slotId: XMAS_ID, slotName: 'Xmas Drop', multi: 1200 }),
      ],
      5,
    );
    expect(ranked[0].max_multiplier).toBe(5000);
    expect(ranked.filter((r) => r.slot_name === 'Xmas Drop')).toHaveLength(1);
  });

  it('DUPLICATES when CHILL has no catalog match (name key) and Opening uses slot_id', () => {
    // Current system limitation — report, do not "fix" by fuzzy name matching.
    const ranked = rankTopSlotsByMaxMultiplier(
      [
        chillCandidate({ catalogId: null, slotName: 'Xmas Drop', multi: 5000 }),
        huntCandidate({ slotId: XMAS_ID, slotName: 'Xmas Drop', multi: 10000 }),
      ],
      5,
    );

    const xmas = ranked.filter((r) => r.slot_name === 'Xmas Drop');
    expect(xmas.length).toBe(2);
    expect(xmas.map((r) => r.max_multiplier).sort((a, b) => (b ?? 0) - (a ?? 0))).toEqual([
      10000, 5000,
    ]);
  });

  it('does not merge different slots with similar names', () => {
    const ranked = rankTopSlotsByMaxMultiplier(
      [
        huntCandidate({ slotId: 'id-1', slotName: 'Xmas Drop', multi: 100 }),
        huntCandidate({ slotId: 'id-2', slotName: 'Xmas Drop 1000', multi: 999 }),
      ],
      5,
    );
    expect(ranked.filter((r) => r.slot_name).map((r) => r.slot_name).sort()).toEqual([
      'Xmas Drop',
      'Xmas Drop 1000',
    ]);
  });
});

describe('TOP 5 fixtures A–F (local ranking only)', () => {
  const SLOT = 'bbbbbbbb-1111-2222-3333-444444444444';

  it('A→B→C: 5000x then 10000x becomes single 10000x', () => {
    let ranked = rankTopSlotsByMaxMultiplier(
      [chillCandidate({ catalogId: SLOT, slotName: 'Demo Slot', multi: 5000 })],
      5,
    );
    expect(ranked[0].max_multiplier).toBe(5000);

    ranked = rankTopSlotsByMaxMultiplier(
      [
        chillCandidate({ catalogId: SLOT, slotName: 'Demo Slot', multi: 5000 }),
        huntCandidate({ slotId: SLOT, slotName: 'Demo Slot', multi: 10000 }),
      ],
      5,
    );
    expect(ranked.filter((r) => r.slot_name === 'Demo Slot')).toHaveLength(1);
    expect(ranked[0].max_multiplier).toBe(10000);
  });

  it('E→F: removing 10000x restores 5000x', () => {
    const afterDelete = rankTopSlotsByMaxMultiplier(
      [chillCandidate({ catalogId: SLOT, slotName: 'Demo Slot', multi: 5000 })],
      5,
    );
    expect(afterDelete[0].max_multiplier).toBe(5000);
    expect(afterDelete.filter((r) => r.slot_name === 'Demo Slot')).toHaveLength(1);
  });

  it('multiplier semantic earning/bet', () => {
    expect(individualMultiplier(10000, 1)).toBe(10000);
    expect(individualMultiplier(20000, 2)).toBe(10000);
  });
});
