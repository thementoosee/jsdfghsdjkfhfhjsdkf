/**
 * Visual countdown digit from authoritative DB snapshot + wall clock.
 * Does not write state — OBS can show 3→2→1 while the controller CAS catches up.
 */
export function resolveCountdownDisplay(
  snapshot: {
    phase: string;
    countdownValue: number | null;
    phaseStartedAt: string | null;
    phaseDurationMs: number | null;
    runStatus: string;
  },
  nowMs = Date.now(),
): { value: number; progress: number } {
  const base = snapshot.countdownValue ?? 3;
  const duration = snapshot.phaseDurationMs && snapshot.phaseDurationMs > 0 ? snapshot.phaseDurationMs : 1000;
  const started = snapshot.phaseStartedAt ? Date.parse(snapshot.phaseStartedAt) : NaN;

  if (!Number.isFinite(started) || snapshot.runStatus === 'paused') {
    return { value: base, progress: 0 };
  }

  const elapsed = Math.max(0, nowMs - started);
  const steps = Math.floor(elapsed / duration);
  if (steps >= base) {
    return { value: 1, progress: 1 };
  }
  const value = Math.max(1, base - steps);
  const intoStep = elapsed - steps * duration;
  return { value, progress: Math.min(1, intoStep / duration) };
}
