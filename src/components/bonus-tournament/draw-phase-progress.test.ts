import { describe, expect, it } from 'vitest';
import { DRAW_TIMING } from './draw-timing';
import {
  initialPhaseProgress,
  shouldSnapSlotConfirmToEnd,
  slotConfirmAnimKey,
} from './DrawSidebarOverlay';
import type { DrawPublicSnapshot } from './draw-types';

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
});

describe('slotConfirmAnimKey / shouldSnapSlotConfirmToEnd', () => {
  const base = (over: Partial<DrawPublicSnapshot> = {}): DrawPublicSnapshot => ({
    tournamentId: 't1',
    presentationId: 'p1',
    tournamentName: 'HUNT',
    version: 3,
    eventId: 'evt-confirm-1',
    runStatus: 'running',
    phase: 'slot_confirmed',
    revealedPlayers: 1,
    revealedMatches: 0,
    countdownValue: null,
    phaseStartedAt: new Date().toISOString(),
    phaseDurationMs: DRAW_TIMING.slotConfirmMs,
    result: {
      selected: [
        {
          twitchUserId: 'u0',
          displayName: 'P0',
          avatarUrl: '',
          slot: { slotId: 's1', slotName: 'Slot', slotImage: '' },
        },
      ],
      matchups: [],
      generatedAt: new Date().toISOString(),
      resultHash: 'h',
    },
    entriesClosed: true,
    uniqueEntryCount: 8,
    updatedAt: new Date().toISOString(),
    ...over,
  });

  it('anim key ignores version bumps from polling', () => {
    const a = slotConfirmAnimKey(base({ version: 3 }));
    const b = slotConfirmAnimKey(base({ version: 9 }));
    expect(a).toBe(b);
    expect(a).toContain('s1');
  });

  it('new confirm event gets a new anim key', () => {
    expect(slotConfirmAnimKey(base({ eventId: 'a' }))).not.toBe(
      slotConfirmAnimKey(base({ eventId: 'b' })),
    );
  });

  it('does not snap while confirm window is still open', () => {
    const started = Date.now();
    expect(
      shouldSnapSlotConfirmToEnd(
        {
          phaseStartedAt: new Date(started).toISOString(),
          phaseDurationMs: 2400,
        },
        started + 200,
      ),
    ).toBe(false);
  });

  it('snaps to end after confirm window for refresh/late join', () => {
    const started = Date.now() - 5000;
    expect(
      shouldSnapSlotConfirmToEnd(
        {
          phaseStartedAt: new Date(started).toISOString(),
          phaseDurationMs: 2400,
        },
        Date.now(),
      ),
    ).toBe(true);
  });
});
