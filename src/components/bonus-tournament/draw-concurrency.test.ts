import { describe, expect, it } from 'vitest';
import { advancePresentation, maybeAutoAdvance } from './draw-presentation-machine';
import { DRAW_TIMING } from './draw-timing';
import { createIdleDrawState, type DrawPresentationState } from './draw-types';
import { generateDrawResult } from './draw-result';
import { buildDemoEntries } from './demo-data';

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

async function runningIntro(): Promise<DrawPresentationState> {
  const result = await generateDrawResult(buildDemoEntries(8), seededRandom(1));
  const base = createIdleDrawState({
    tournamentId: 't',
    tournamentName: 'T',
    uniqueEntryCount: 8,
    entriesClosed: true,
  });
  return {
    ...base,
    result,
    version: 2,
    runStatus: 'running',
    phase: 'intro',
    phaseStartedAt: new Date(Date.now() - DRAW_TIMING.introMs - 10).toISOString(),
    phaseDurationMs: DRAW_TIMING.introMs,
    revealedPlayers: 0,
    revealedMatches: 0,
  };
}

describe('draw concurrency / timings', () => {
  it('auto-advance waits for phaseDurationMs from DRAW_TIMING', async () => {
    const state = await runningIntro();
    const tooEarly = maybeAutoAdvance(
      {
        ...state,
        phaseStartedAt: new Date().toISOString(),
      },
      Date.now(),
    );
    expect(tooEarly).toBeNull();

    const due = maybeAutoAdvance(state, Date.now());
    expect(due).not.toBeNull();
    expect(due!.phase).toBe('countdown');
    expect(due!.phaseDurationMs).toBe(DRAW_TIMING.countdownStepMs);
    expect(due!.version).toBe(state.version + 1);
  });

  it('two logical advances from same version produce same next version base', async () => {
    const state = await runningIntro();
    const a = advancePresentation(state);
    const b = advancePresentation(state);
    expect(a.version).toBe(b.version);
    expect(a.phase).toBe(b.phase);
    // CAS would accept only one write at expectedVersion=state.version
    expect(a.version).toBe(state.version + 1);
  });

  it('restart keeps result hash', async () => {
    const state = await runningIntro();
    const hash = state.result!.resultHash;
    const restarted = advancePresentation({
      ...state,
      phase: 'intro',
      // simulate restart fields without regenerating
      presentationId: 'new-pres',
    });
    expect(restarted.result!.resultHash).toBe(hash);
  });
});
