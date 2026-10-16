import { describe, expect, it } from 'vitest';
import {
  filterChillBonusesBySlot,
  forgetChillBonusSlot,
  normalizeChillSlotKey,
  rememberChillBonusSlot,
  resolveChillBonusIdentity,
  triageChillHistoryRow,
} from './chill-bonus-slot';
import { buildChillBonusInsertPayload, setChillBonusSlotColumnCacheForTests } from './chill-bonus-persist';
import {
  individualMultiplier,
  rankTopSlotsByMaxMultiplier,
  type TopSlotCandidate,
} from './top-slots';

describe('chill bonus slot identity + history filter', () => {
  const xmas = { id: 'b1', slot_id: 'id-xmas', slot_name: 'Xmas Drop', bet: 1, win: 1000 };
  const gates = { id: 'b2', slot_id: 'id-gates', slot_name: 'Gates of Olympus', bet: 1, win: 500 };

  it('filters two slots in the same session by persisted identity', () => {
    const onlyXmas = filterChillBonusesBySlot([xmas, gates], {
      selectedSlotId: 'id-xmas',
      selectedSlotName: 'Xmas Drop',
    });
    expect(onlyXmas.map((b) => b.id)).toEqual(['b1']);

    const onlyGates = filterChillBonusesBySlot([xmas, gates], {
      selectedSlotId: 'id-gates',
      selectedSlotName: 'Gates of Olympus',
    });
    expect(onlyGates.map((b) => b.id)).toEqual(['b2']);
  });

  it('uses localStorage map when DB columns are empty (compatibility)', () => {
    const map = rememberChillBonusSlot(
      rememberChillBonusSlot({}, 'b1', 'Xmas Drop'),
      'b2',
      'Gates of Olympus',
    );
    const rows = [
      { id: 'b1', slot_id: null, slot_name: null },
      { id: 'b2', slot_id: null, slot_name: null },
    ];
    expect(
      filterChillBonusesBySlot(rows, { selectedSlotName: 'Xmas Drop', localMap: map }).map((b) => b.id),
    ).toEqual(['b1']);
  });

  it('does not use session.slot_name — unproven rows stay hidden', () => {
    const rows = [{ id: 'legacy', slot_id: null, slot_name: null }];
    expect(
      filterChillBonusesBySlot(rows, {
        selectedSlotName: 'Wanted Dead or a Wild',
        localMap: {},
      }),
    ).toEqual([]);
  });

  it('prefers persisted id over local map', () => {
    const map = rememberChillBonusSlot({}, 'b1', 'Wrong Name');
    const identity = resolveChillBonusIdentity(
      { id: 'b1', slot_id: 'id-xmas', slot_name: 'Xmas Drop' },
      map,
    );
    expect(identity.kind).toBe('persisted_id');
    expect(identity.slot_id).toBe('id-xmas');
  });

  it('remembers and forgets compatibility map entries', () => {
    let map = rememberChillBonusSlot({}, 'b1', 'Xmas Drop');
    map = forgetChillBonusSlot(map, 'b1');
    expect(map.b1).toBeUndefined();
  });

  it('normalizes exact names only', () => {
    expect(normalizeChillSlotKey('  Xmas   Drop ')).toBe('xmas drop');
    expect(normalizeChillSlotKey('Xmas Drop')).not.toBe(normalizeChillSlotKey('Xmas Drop 1000'));
  });
});

describe('chill bonus insert payload (column probe)', () => {
  it('omits slot fields when columns are not available', async () => {
    setChillBonusSlotColumnCacheForTests(false);
    const payload = await buildChillBonusInsertPayload(
      { session_id: 's1', bet_amount: 1, win_amount: 1000, multiplier: 1000 },
      { id: 'id-xmas', name: 'Xmas Drop' },
    );
    expect(payload).toEqual({
      session_id: 's1',
      bet_amount: 1,
      win_amount: 1000,
      multiplier: 1000,
    });
    expect('slot_id' in payload).toBe(false);
    expect('slot_name' in payload).toBe(false);
  });

  it('includes slot_id and slot_name when columns are available', async () => {
    setChillBonusSlotColumnCacheForTests(true);
    const payload = await buildChillBonusInsertPayload(
      { session_id: 's1', bet_amount: 1, win_amount: 1000, multiplier: 1000 },
      { id: 'id-xmas', name: 'Xmas Drop' },
    );
    expect(payload.slot_id).toBe('id-xmas');
    expect(payload.slot_name).toBe('Xmas Drop');
  });

  it('includes slot_name only when catalog id is missing', async () => {
    setChillBonusSlotColumnCacheForTests(true);
    const payload = await buildChillBonusInsertPayload(
      { session_id: 's1', bet_amount: 1, win_amount: 10, multiplier: 10 },
      { name: 'Unknown Slot' },
    );
    expect(payload.slot_name).toBe('Unknown Slot');
    expect(payload.slot_id).toBeUndefined();
  });
});

describe('historical triage (no writes)', () => {
  it('marks multi-bonus session rows as ambiguous', () => {
    expect(
      triageChillHistoryRow({
        bonus_id: 'a',
        session_id: 's',
        bonuses_in_session: 3,
        session_slot_now: 'Wanted Dead or a Wild',
        exact_catalog_match: true,
      }),
    ).toBe('ambiguous');
  });

  it('marks single-bonus + catalog match as review_candidate only (not auto-backfill)', () => {
    expect(
      triageChillHistoryRow({
        bonus_id: 'a',
        session_id: 's',
        bonuses_in_session: 1,
        session_slot_now: 'Xmas Drop',
        exact_catalog_match: true,
      }),
    ).toBe('review_candidate');
  });
});

describe('TOP 5 — CHILL + Opening records', () => {
  const XMAS_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  function hunt(multi: number): TopSlotCandidate {
    return {
      key: `id:${XMAS_ID}`,
      slot_id: XMAS_ID,
      slot_name: 'Xmas Drop',
      provider: 'Test',
      slot_image: null,
      multiplier: multi,
      bet_amount: 1,
      win_amount: multi,
      source: 'hunt',
    };
  }

  function chill(multi: number, catalogId: string | null): TopSlotCandidate {
    return {
      key: catalogId ? `id:${catalogId}` : 'name:xmas drop',
      slot_id: catalogId,
      slot_name: 'Xmas Drop',
      provider: catalogId ? 'Test' : null,
      slot_image: null,
      multiplier: multi,
      bet_amount: 1,
      win_amount: multi,
      source: 'chill',
      ambiguous: !catalogId,
    };
  }

  it('CHILL 1000x + Opening 2332x → single 2332x', () => {
    const ranked = rankTopSlotsByMaxMultiplier([chill(1000, XMAS_ID), hunt(2332)], 5);
    const filled = ranked.filter((r) => r.slot_name);
    expect(filled).toHaveLength(1);
    expect(filled[0].max_multiplier).toBe(2332);
  });

  it('removing opening record restores chill 1000x', () => {
    expect(rankTopSlotsByMaxMultiplier([chill(1000, XMAS_ID)], 5)[0].max_multiplier).toBe(1000);
  });

  it('never ranks by session average', () => {
    expect(individualMultiplier(1000, 1)).toBe(1000);
    expect(individualMultiplier(1000 + 2332, 2)).toBe(1666);
  });
});
