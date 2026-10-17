import { describe, expect, it } from 'vitest';
import { resolveCountdownDisplay } from './draw-countdown-display';

describe('resolveCountdownDisplay', () => {
  const base = {
    phase: 'countdown',
    countdownValue: 3,
    phaseStartedAt: '2026-10-17T22:00:00.000Z',
    phaseDurationMs: 1000,
    runStatus: 'running',
  };

  it('shows 3 in the first second', () => {
    const t0 = Date.parse(base.phaseStartedAt!);
    expect(resolveCountdownDisplay(base, t0 + 100).value).toBe(3);
    expect(resolveCountdownDisplay(base, t0 + 100).progress).toBeLessThan(0.2);
  });

  it('advances to 2 then 1 from wall clock without remount', () => {
    const t0 = Date.parse(base.phaseStartedAt!);
    expect(resolveCountdownDisplay(base, t0 + 1100).value).toBe(2);
    expect(resolveCountdownDisplay(base, t0 + 2100).value).toBe(1);
  });

  it('holds at 1 after full countdown until server phase changes', () => {
    const t0 = Date.parse(base.phaseStartedAt!);
    const late = resolveCountdownDisplay(base, t0 + 10_000);
    expect(late.value).toBe(1);
    expect(late.progress).toBe(1);
  });

  it('freezes while paused', () => {
    const t0 = Date.parse(base.phaseStartedAt!);
    const paused = resolveCountdownDisplay({ ...base, runStatus: 'paused' }, t0 + 2500);
    expect(paused.value).toBe(3);
  });
});
