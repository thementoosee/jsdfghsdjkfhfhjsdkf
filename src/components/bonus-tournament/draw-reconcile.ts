/**
 * OBS / Dashboard: reconcile overdue timed draw phases without operator secret.
 * Call only when a timed phase is due — not a busy loop.
 */
import { rowToDrawState } from './draw-sync';
import type { DrawPresentationState, DrawPublicSnapshot } from './draw-types';

export const BT_DRAW_RECONCILE_PROXY = '/api/bt-draw-reconcile';

type ReconcileView = Pick<
  DrawPublicSnapshot,
  'runStatus' | 'phase' | 'phaseStartedAt' | 'phaseDurationMs'
>;

/** Phases that auto-advance on a timer (gates like awaiting_slot are excluded). */
export function isTimedAutoPhase(phase: string): boolean {
  return (
    phase === 'intro' ||
    phase === 'countdown' ||
    phase === 'reveal_player' ||
    phase === 'slot_confirmed' ||
    phase === 'show_selected' ||
    phase === 'reveal_match'
  );
}

export function isReconcileDue(snapshot: ReconcileView, nowMs = Date.now()): boolean {
  if (snapshot.runStatus !== 'running') return false;
  if (!isTimedAutoPhase(snapshot.phase)) return false;
  if (!snapshot.phaseStartedAt || snapshot.phaseDurationMs == null || snapshot.phaseDurationMs <= 0) {
    return false;
  }
  const started = Date.parse(snapshot.phaseStartedAt);
  if (!Number.isFinite(started)) return false;
  return nowMs >= started + snapshot.phaseDurationMs;
}

export type ReconcileResult =
  | { ok: true; advanced: boolean; steps: number; state: DrawPresentationState | null }
  | { ok: false; error: string; status: number };

export async function reconcileDrawPresentation(tournamentId: string): Promise<ReconcileResult> {
  try {
    const res = await fetch(BT_DRAW_RECONCILE_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ tournamentId }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      advanced?: boolean;
      steps?: number;
      state?: Record<string, unknown>;
    };
    if (!res.ok || payload.error) {
      return {
        ok: false,
        status: res.status,
        error: payload.error || `reconcile_http_${res.status}`,
      };
    }
    return {
      ok: true,
      advanced: Boolean(payload.advanced),
      steps: Number(payload.steps ?? 0),
      state: payload.state ? rowToDrawState(payload.state) : null,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : 'reconcile_failed',
    };
  }
}
