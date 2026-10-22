import { useEffect, useRef } from 'react';
import { isReconcileDue, reconcileDrawPresentation } from './draw-reconcile';
import type { DrawPresentationState, DrawPublicSnapshot } from './draw-types';

const MIN_INTERVAL_MS = 450;

/**
 * When a timed phase is overdue, POST reconcile (catch-up CAS).
 * Works with dashboard closed — OBS Browser Source drives autonomy.
 * Not a busy loop: only armed while a timed phase is active; stops at gates.
 */
export function useDrawReconcile(
  tournamentId: string | null | undefined,
  snapshot: DrawPublicSnapshot | DrawPresentationState | null,
  onState?: (state: DrawPresentationState) => void,
  onError?: (error: string | null) => void,
): void {
  const inFlight = useRef(false);
  const lastAt = useRef(0);
  const onStateRef = useRef(onState);
  const onErrorRef = useRef(onError);
  onStateRef.current = onState;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!tournamentId || !snapshot) {
      onErrorRef.current?.(null);
      return;
    }
    const runStatus = snapshot.runStatus;
    if (runStatus !== 'running') {
      onErrorRef.current?.(null);
      return;
    }
    if (!snapshot.phaseStartedAt || snapshot.phaseDurationMs == null) {
      onErrorRef.current?.(null);
      return;
    }

    let cancelled = false;
    let timeoutId = 0;
    let intervalId = 0;

    const run = async () => {
      if (cancelled || inFlight.current) return;
      const now = Date.now();
      if (now - lastAt.current < MIN_INTERVAL_MS) return;
      if (!isReconcileDue(snapshot, now)) return;
      inFlight.current = true;
      lastAt.current = now;
      try {
        const res = await reconcileDrawPresentation(tournamentId);
        if (cancelled) return;
        if (res.ok && res.state) {
          onErrorRef.current?.(null);
          onStateRef.current?.(res.state);
        } else if (!res.ok) {
          onErrorRef.current?.(res.error || `reconcile_http_${res.status}`);
        }
      } finally {
        inFlight.current = false;
      }
    };

    const started = Date.parse(snapshot.phaseStartedAt);
    const duration = snapshot.phaseDurationMs;
    const dueAt = Number.isFinite(started) ? started + duration : Date.now();
    const delay = Math.max(0, Math.min(dueAt - Date.now() + 40, 60_000));

    timeoutId = window.setTimeout(() => {
      void run();
      intervalId = window.setInterval(() => {
        void run();
      }, MIN_INTERVAL_MS);
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [
    tournamentId,
    snapshot?.runStatus,
    snapshot?.phase,
    snapshot?.phaseStartedAt,
    snapshot?.phaseDurationMs,
    snapshot?.version,
    snapshot?.eventId,
  ]);
}
