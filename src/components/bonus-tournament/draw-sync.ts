/**
 * Sync helpers for Bonus Tournament draw.
 *
 * READ (OBS + Manager hydrate): anon-safe SELECT + Realtime + poll.
 * WRITE: never from this module — use `invokeDrawCommand` (Edge Function).
 * DrawObsPage must only import read helpers.
 */
import { supabase } from '../../lib/supabase';
import { toPublicSnapshot, type DrawPresentationState, type DrawPublicSnapshot } from './draw-types';

export const DEMO_DRAW_TOURNAMENT_ID = 'demo-bonus-tournament';
export const DRAW_TABLE = 'bonus_tournament_draw_presentations';

export type DrawSyncStatus =
  | 'unknown'
  | 'ready'
  | 'missing_table'
  | 'error'
  | 'offline';

export function rowToDrawState(row: Record<string, unknown>): DrawPresentationState {
  return {
    tournamentId: String(row.tournament_id),
    presentationId: String(row.presentation_id),
    tournamentName: String(row.tournament_name ?? ''),
    version: Number(row.version ?? 0),
    eventId: String(row.event_id ?? ''),
    runStatus: row.run_status as DrawPresentationState['runStatus'],
    phase: row.phase as DrawPresentationState['phase'],
    revealedPlayers: Number(row.revealed_players ?? 0),
    revealedMatches: Number(row.revealed_matches ?? 0),
    countdownValue: row.countdown_value == null ? null : Number(row.countdown_value),
    phaseStartedAt: (row.phase_started_at as string | null) ?? null,
    phaseDurationMs: row.phase_duration_ms == null ? null : Number(row.phase_duration_ms),
    result: (row.result as DrawPresentationState['result']) ?? null,
    entriesClosed: Boolean(row.entries_closed),
    uniqueEntryCount: Number(row.unique_entry_count ?? 0),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
}

export async function probeDrawSync(): Promise<{ status: DrawSyncStatus; detail?: string }> {
  const { error } = await supabase.from(DRAW_TABLE).select('tournament_id').limit(1);
  if (!error) return { status: 'ready' };
  if (isMissingRelation(error)) return { status: 'missing_table', detail: error.message };
  return { status: 'error', detail: error.message };
}

export async function fetchDrawState(
  tournamentId: string,
): Promise<{ state: DrawPresentationState | null; status: DrawSyncStatus; detail?: string }> {
  const { data, error } = await supabase
    .from(DRAW_TABLE)
    .select(
      [
        'tournament_id',
        'presentation_id',
        'tournament_name',
        'version',
        'event_id',
        'run_status',
        'phase',
        'revealed_players',
        'revealed_matches',
        'countdown_value',
        'phase_started_at',
        'phase_duration_ms',
        'result',
        'entries_closed',
        'unique_entry_count',
        'updated_at',
      ].join(','),
    )
    .eq('tournament_id', tournamentId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return { state: null, status: 'missing_table', detail: error.message };
    return { state: null, status: 'error', detail: error.message };
  }
  if (!data) return { state: null, status: 'ready' };
  return { state: rowToDrawState(data as Record<string, unknown>), status: 'ready' };
}

export function subscribeDrawState(
  tournamentId: string,
  onChange: (snapshot: DrawPublicSnapshot) => void,
): { unsubscribe: () => void } {
  const channel = supabase
    .channel(`bt_draw_${tournamentId}_${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: DRAW_TABLE,
        filter: `tournament_id=eq.${tournamentId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown> | null;
        if (!row || !row.tournament_id) return;
        onChange(toPublicSnapshot(rowToDrawState(row)));
      },
    )
    .subscribe();

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}

export function asObsSnapshot(state: DrawPresentationState): DrawPublicSnapshot {
  return toPublicSnapshot(state);
}
