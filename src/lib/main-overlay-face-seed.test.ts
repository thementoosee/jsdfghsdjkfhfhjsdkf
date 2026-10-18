import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearMainOverlayFaceSeeds,
  seedChillOverlayFace,
  seedHuntOverlayFace,
  takeChillOverlayFace,
  takeHuntOverlayFace,
} from './main-overlay-face-seed';

describe('main-overlay-face-seed', () => {
  beforeEach(() => {
    clearMainOverlayFaceSeeds();
  });

  it('seeds and consumes a chill face once', () => {
    seedChillOverlayFace('c1', { id: 'c1', slot_name: 'Test' });
    expect(takeChillOverlayFace<{ id: string; slot_name: string }>('c1')).toEqual({
      id: 'c1',
      slot_name: 'Test',
    });
    expect(takeChillOverlayFace('c1')).toBeNull();
  });

  it('seeds and consumes a hunt face with items', () => {
    seedHuntOverlayFace('h1', { id: 'h1', name: 'Hunt' }, [{ id: 'i1' }]);
    expect(takeHuntOverlayFace<{ id: string; name: string }, { id: string }>('h1')).toEqual({
      hunt: { id: 'h1', name: 'Hunt' },
      items: [{ id: 'i1' }],
    });
    expect(takeHuntOverlayFace('h1')).toBeNull();
  });

  it('ignores mismatched ids', () => {
    seedChillOverlayFace('c1', { id: 'c1' });
    expect(takeChillOverlayFace('other')).toBeNull();
    expect(takeChillOverlayFace('c1')).toEqual({ id: 'c1' });
  });
});
