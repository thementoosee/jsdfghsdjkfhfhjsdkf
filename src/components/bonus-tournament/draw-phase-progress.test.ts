import { describe, expect, it } from 'vitest';
import { initialPhaseProgress } from './DrawSidebarOverlay';

describe('initialPhaseProgress (slot lift)', () => {
  it('awaiting_slot stays at 0 so slot_confirmed can animate from the start', () => {
    expect(
      initialPhaseProgress({
        phase: 'awaiting_slot',
        phaseStartedAt: null,
        phaseDurationMs: null,
      }),
    ).toBe(0);
  });

  it('slot_confirmed starts near 0 right after confirm', () => {
    const started = Date.now();
    expect(
      initialPhaseProgress(
        {
          phase: 'slot_confirmed',
          phaseStartedAt: new Date(started).toISOString(),
          phaseDurationMs: 2400,
        },
        started + 50,
      ),
    ).toBeLessThan(0.05);
  });

  it('slot_confirmed mid-phase drives lift progress', () => {
    const started = Date.now();
    const p = initialPhaseProgress(
      {
        phase: 'slot_confirmed',
        phaseStartedAt: new Date(started).toISOString(),
        phaseDurationMs: 2400,
      },
      started + 672, // ~0.28 of 2400ms — end of lift window
    );
    expect(p).toBeGreaterThan(0.25);
    expect(p).toBeLessThan(0.35);
  });
});
