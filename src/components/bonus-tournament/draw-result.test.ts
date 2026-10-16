import { describe, expect, it } from 'vitest';
import { buildDemoEntries } from './demo-data';
import {
  generateDrawResult,
  pairSelectedIntoMatchups,
  secureShuffle,
  uniqueEntriesByTwitchId,
  validateDrawResult,
} from './draw-result';
import { DRAW_MATCH_COUNT, DRAW_SLOT_COUNT } from './draw-types';

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i += 1) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      out[i] = s;
    }
    return out;
  };
}

describe('draw-result', () => {
  it('dedupes by twitchUserId', () => {
    const entries = [
      ...buildDemoEntries(3),
      { ...buildDemoEntries(1)[0], id: 'dup' },
    ];
    expect(uniqueEntriesByTwitchId(entries)).toHaveLength(3);
  });

  it('selects exactly 8 unique and 4 valid matchups', async () => {
    const entries = buildDemoEntries(40);
    const result = await generateDrawResult(entries, seededRandom(42));
    expect(result.selected).toHaveLength(DRAW_SLOT_COUNT);
    expect(result.matchups).toHaveLength(DRAW_MATCH_COUNT);
    expect(validateDrawResult(result)).toEqual({ ok: true });
    const ids = new Set(result.selected.map((p) => p.twitchUserId));
    expect(ids.size).toBe(DRAW_SLOT_COUNT);
  });

  it('with exactly 8 entries selects all of them', async () => {
    const entries = buildDemoEntries(8);
    const result = await generateDrawResult(entries, seededRandom(7));
    const source = new Set(entries.map((e) => e.twitchUserId));
    for (const p of result.selected) expect(source.has(p.twitchUserId)).toBe(true);
  });

  it('rejects under 8', async () => {
    await expect(generateDrawResult(buildDemoEntries(7), seededRandom(1))).rejects.toThrow(/8/);
  });

  it('secureShuffle permutes with deterministic bytes', () => {
    const a = secureShuffle([1, 2, 3, 4, 5], seededRandom(99));
    const b = secureShuffle([1, 2, 3, 4, 5], seededRandom(99));
    expect(a).toEqual(b);
    expect(a.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('pairSelectedIntoMatchups covers each player once', () => {
    const selected = buildDemoEntries(8).map((e) => ({
      twitchUserId: e.twitchUserId,
      displayName: e.displayName,
      avatarUrl: e.avatarUrl,
    }));
    const matchups = pairSelectedIntoMatchups(selected);
    expect(matchups).toHaveLength(4);
    expect(validateDrawResult({
      selected,
      matchups,
      generatedAt: new Date().toISOString(),
      resultHash: 'x',
    })).toEqual({ ok: true });
  });
});
