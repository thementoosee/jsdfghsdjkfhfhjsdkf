import { describe, expect, it } from 'vitest';
import {
  MAIN_OVERLAY_FLIP_DURATION_MS,
  planMainOverlayFlip,
  sameMainOverlayIdentity,
} from './main-overlay-flip';

describe('main-overlay-flip', () => {
  it('uses a 600–800 ms duration', () => {
    expect(MAIN_OVERLAY_FLIP_DURATION_MS).toBeGreaterThanOrEqual(600);
    expect(MAIN_OVERLAY_FLIP_DURATION_MS).toBeLessThanOrEqual(800);
  });

  it('sameMainOverlayIdentity matches type + id only', () => {
    expect(sameMainOverlayIdentity({ type: 'chill', id: 'a' }, { type: 'chill', id: 'a' })).toBe(
      true,
    );
    expect(sameMainOverlayIdentity({ type: 'chill', id: 'a' }, { type: 'chill', id: 'b' })).toBe(
      false,
    );
    expect(sameMainOverlayIdentity({ type: 'chill', id: 'a' }, { type: 'hunt', id: 'a' })).toBe(
      false,
    );
  });

  it('no-ops when idle and target equals current', () => {
    expect(
      planMainOverlayFlip({
        current: { type: 'chill', id: '1' },
        next: { type: 'chill', id: '1' },
        flipping: false,
        pending: null,
      }),
    ).toBe('noop');
  });

  it('starts a flip when idle and target differs', () => {
    expect(
      planMainOverlayFlip({
        current: { type: 'chill', id: '1' },
        next: { type: 'hunt', id: '2' },
        flipping: false,
        pending: null,
      }),
    ).toBe('start');
  });

  it('queues a distinct target while flipping', () => {
    expect(
      planMainOverlayFlip({
        current: { type: 'hunt', id: '2' },
        next: { type: 'tournament', id: '3' },
        flipping: true,
        pending: null,
      }),
    ).toBe('queue');
  });

  it('no-ops when Realtime reaffirms the in-flight target', () => {
    expect(
      planMainOverlayFlip({
        current: { type: 'hunt', id: '2' },
        next: { type: 'hunt', id: '2' },
        flipping: true,
        pending: null,
      }),
    ).toBe('noop');
  });

  it('no-ops when the queued pending already matches next', () => {
    expect(
      planMainOverlayFlip({
        current: { type: 'hunt', id: '2' },
        next: { type: 'tournament', id: '3' },
        flipping: true,
        pending: { type: 'tournament', id: '3' },
      }),
    ).toBe('noop');
  });
});
