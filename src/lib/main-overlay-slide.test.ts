import { describe, expect, it } from 'vitest';
import {
  MAIN_OVERLAY_SLIDE_ENTER_MS,
  MAIN_OVERLAY_SLIDE_EXIT_MS,
  planMainOverlaySlide,
  sameMainOverlayIdentity,
} from './main-overlay-slide';

describe('main-overlay-slide', () => {
  it('uses the original 450 ms exit/enter durations', () => {
    expect(MAIN_OVERLAY_SLIDE_EXIT_MS).toBe(450);
    expect(MAIN_OVERLAY_SLIDE_ENTER_MS).toBe(450);
  });

  it('sameMainOverlayIdentity matches type + id only', () => {
    expect(sameMainOverlayIdentity({ type: 'chill', id: 'a' }, { type: 'chill', id: 'a' })).toBe(
      true,
    );
    expect(sameMainOverlayIdentity({ type: 'chill', id: 'a' }, { type: 'hunt', id: 'a' })).toBe(
      false,
    );
  });

  it('no-ops when idle and target equals current', () => {
    expect(
      planMainOverlaySlide({
        current: { type: 'chill', id: '1' },
        next: { type: 'chill', id: '1' },
        sliding: false,
        pending: null,
      }),
    ).toBe('noop');
  });

  it('starts a slide when idle and target differs', () => {
    expect(
      planMainOverlaySlide({
        current: { type: 'chill', id: '1' },
        next: { type: 'hunt', id: '2' },
        sliding: false,
        pending: null,
      }),
    ).toBe('start');
  });

  it('queues a distinct target while sliding', () => {
    expect(
      planMainOverlaySlide({
        current: { type: 'hunt', id: '2' },
        next: { type: 'tournament', id: '3' },
        sliding: true,
        pending: null,
      }),
    ).toBe('queue');
  });

  it('no-ops when Realtime reaffirms the in-flight target', () => {
    expect(
      planMainOverlaySlide({
        current: { type: 'hunt', id: '2' },
        next: { type: 'hunt', id: '2' },
        sliding: true,
        pending: null,
      }),
    ).toBe('noop');
  });

  it('no-ops when the queued pending already matches next', () => {
    expect(
      planMainOverlaySlide({
        current: { type: 'hunt', id: '2' },
        next: { type: 'tournament', id: '3' },
        sliding: true,
        pending: { type: 'tournament', id: '3' },
      }),
    ).toBe('noop');
  });
});
