import { describe, expect, it } from 'vitest';
import {
  PRODUCT_DISPLAY_MS,
  SHOP_HIGHLIGHT_HIDDEN_GAP_MS,
  SHOP_HIGHLIGHT_PER_PRODUCT_MS,
} from '../components/ShopHighlightsOverlay';
import {
  clampShopHighlightIndex,
  formatJigadoresPoints,
  normalizeShopHighlight,
  normalizeShopHighlights,
  planShopOpenSession,
  resolveShopProductAdvance,
} from './shop-highlights';

describe('shop timing constants', () => {
  it('keeps each product visible for 10 seconds', () => {
    expect(PRODUCT_DISPLAY_MS).toBe(10_000);
    expect(SHOP_HIGHLIGHT_PER_PRODUCT_MS).toBe(10_000);
  });

  it('keeps the drawer hidden for 8 minutes between sequences', () => {
    expect(SHOP_HIGHLIGHT_HIDDEN_GAP_MS).toBe(8 * 60 * 1_000);
  });
});

describe('resolveShopProductAdvance', () => {
  it('keeps the drawer open while advancing through products', () => {
    expect(resolveShopProductAdvance(0, 3)).toEqual({
      type: 'next',
      nextIndex: 1,
      drawerStaysOpen: true,
    });
    expect(resolveShopProductAdvance(1, 3)).toEqual({
      type: 'next',
      nextIndex: 2,
      drawerStaysOpen: true,
    });
  });

  it('retracts only after the last product', () => {
    expect(resolveShopProductAdvance(2, 3)).toEqual({
      type: 'retract',
      drawerStaysOpen: false,
    });
    expect(resolveShopProductAdvance(0, 1)).toEqual({
      type: 'retract',
      drawerStaysOpen: false,
    });
  });

  it('plays positions 0..n-1 then retracts', () => {
    const sequence = planShopOpenSession(3);
    expect(sequence).toEqual([0, 1, 2]);

    const steps = sequence.map((index) =>
      resolveShopProductAdvance(index, sequence.length),
    );
    expect(steps[0].type).toBe('next');
    expect(steps[1].type).toBe('next');
    expect(steps[2].type).toBe('retract');
    expect(steps[0].drawerStaysOpen).toBe(true);
    expect(steps[1].drawerStaysOpen).toBe(true);
    expect(steps[2].drawerStaysOpen).toBe(false);
  });
});

describe('formatJigadoresPoints', () => {
  it('formats thousands with pt-PT separators', () => {
    expect(formatJigadoresPoints(260000)).toBe('260.000 JP');
    expect(formatJigadoresPoints(1000)).toBe('1.000 JP');
    expect(formatJigadoresPoints(0)).toBe('0 JP');
  });

  it('handles invalid numbers safely', () => {
    expect(formatJigadoresPoints(Number.NaN)).toBe('0 JP');
  });
});

describe('normalizeShopHighlights', () => {
  it('returns empty list for empty payload', () => {
    expect(normalizeShopHighlights({ items: [] })).toEqual([]);
    expect(normalizeShopHighlights(null)).toEqual([]);
    expect(normalizeShopHighlights({})).toEqual([]);
  });

  it('keeps a single valid product', () => {
    const items = normalizeShopHighlights({
      items: [
        {
          id: 'a',
          name: 'Iphone 17',
          image: 'https://cdn.example/iphone.png',
          pointsCost: 260000,
          position: 1,
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Iphone 17');
    expect(items[0].pointsCost).toBe(260000);
    expect(items[0].imageScale).toBe(1);
  });

  it('sorts by position and caps at 3', () => {
    const items = normalizeShopHighlights({
      items: [
        { id: 'c', name: 'C', pointsCost: 3, position: 3 },
        { id: 'a', name: 'A', pointsCost: 1, position: 1 },
        { id: 'b', name: 'B', pointsCost: 2, position: 2 },
        { id: 'd', name: 'D', pointsCost: 4, position: 4 },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignores invalid rows', () => {
    const items = normalizeShopHighlights({
      items: [
        null,
        { id: 'x' },
        { id: 'ok', name: 'Ok', pointsCost: 10, position: 2 },
        { id: 'bad', name: 'Bad', pointsCost: -1, position: 1 },
        'nope',
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('ok');
  });

  it('accepts a bare array payload', () => {
    const items = normalizeShopHighlights([
      { id: '1', name: 'One', pointsCost: 5, position: 1 },
    ]);
    expect(items).toHaveLength(1);
  });
});

describe('normalizeShopHighlight', () => {
  it('returns null for incomplete objects', () => {
    expect(normalizeShopHighlight({ id: '1', name: 'X' })).toBeNull();
  });
});

describe('clampShopHighlightIndex', () => {
  it('wraps safely when list length changes', () => {
    expect(clampShopHighlightIndex(5, 3)).toBe(2);
    expect(clampShopHighlightIndex(0, 0)).toBe(0);
    expect(clampShopHighlightIndex(-1, 2)).toBe(0);
  });
});
