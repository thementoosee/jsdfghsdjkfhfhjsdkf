import { describe, expect, it } from 'vitest';
import type { DrawParticipant } from './draw-types';
import {
  SPOTLIGHT_FADE_END,
  SPOTLIGHT_LAND_END,
  SPOTLIGHT_SPIN_END,
  buildSpotlightSequence,
  easeSoftLand,
  pickSpotlightSatellites,
  spotlightIndexAtProgress,
} from './spotlight-draw';

function p(id: string, name: string): DrawParticipant {
  return {
    twitchUserId: id,
    displayName: name,
    avatarUrl: `https://example.com/${id}.png`,
    slot: null,
  };
}

describe('spotlight-draw', () => {
  const winner = p('w', 'Winner');
  const pool = [winner, p('a', 'A'), p('b', 'B'), p('c', 'C'), p('d', 'D'), p('e', 'E')];

  it('sequence always ends on the persisted winner', () => {
    const seq = buildSpotlightSequence(pool, winner, 20);
    expect(seq).toHaveLength(20);
    expect(seq[seq.length - 1]?.twitchUserId).toBe('w');
    expect(seq.some((x) => x.twitchUserId !== 'w')).toBe(true);
  });

  it('index lands on last step by spin end', () => {
    const steps = 24;
    expect(spotlightIndexAtProgress(0, steps)).toBe(0);
    expect(spotlightIndexAtProgress(SPOTLIGHT_SPIN_END, steps)).toBe(steps - 1);
    expect(spotlightIndexAtProgress(1, steps)).toBe(steps - 1);
  });

  it('decelerates: more index change early than late', () => {
    const steps = 28;
    const early = spotlightIndexAtProgress(0.25, steps) - spotlightIndexAtProgress(0, steps);
    const late =
      spotlightIndexAtProgress(SPOTLIGHT_SPIN_END, steps) -
      spotlightIndexAtProgress(SPOTLIGHT_SPIN_END * 0.75, steps);
    expect(early).toBeGreaterThan(late);
  });

  it('satellites exclude the center face', () => {
    const sats = pickSpotlightSatellites(pool, winner, 4);
    expect(sats).toHaveLength(4);
    expect(sats.every((s) => s.twitchUserId !== 'w')).toBe(true);
  });

  it('soft land phases are ordered: spin → fade → glide', () => {
    expect(SPOTLIGHT_SPIN_END).toBeLessThan(SPOTLIGHT_FADE_END);
    expect(SPOTLIGHT_FADE_END).toBeLessThan(SPOTLIGHT_LAND_END);
    expect(SPOTLIGHT_LAND_END).toBeLessThan(1);
    // ~300ms fade and ~1100ms glide at revealPlayerMs=3600
    expect(SPOTLIGHT_FADE_END - SPOTLIGHT_SPIN_END).toBeGreaterThan(0.07);
    expect(SPOTLIGHT_FADE_END - SPOTLIGHT_SPIN_END).toBeLessThan(0.12);
    expect(SPOTLIGHT_LAND_END - SPOTLIGHT_FADE_END).toBeGreaterThan(0.28);
    expect(SPOTLIGHT_LAND_END - SPOTLIGHT_FADE_END).toBeLessThan(0.4);
  });

  it('easeSoftLand is soft ease-out (cubic-bezier 0.22,1,0.36,1)', () => {
    expect(easeSoftLand(0)).toBeCloseTo(0, 5);
    expect(easeSoftLand(1)).toBeCloseTo(1, 5);
    // Strong ease-out: mid progress is already near the end
    expect(easeSoftLand(0.5)).toBeGreaterThan(0.85);
    expect(easeSoftLand(0.25)).toBeGreaterThan(0.55);
  });
});
