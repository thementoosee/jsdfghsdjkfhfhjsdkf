/**
 * Browser → Edge Function command path (no direct table writes, no client entry roster).
 */
import { supabase } from '../../lib/supabase';
import { rowToDrawState } from './draw-sync';
import type { DrawAdminCommand, DrawPresentationState } from './draw-types';

export type InvokeDrawCmdResult =
  | { ok: true; state: DrawPresentationState }
  | { ok: false; status: number; error: string; detail?: string; remote?: DrawPresentationState };

/** Strip entries — server loads bonus_tournament_entries. */
function toEdgeCommand(command: DrawAdminCommand): { type: string } {
  return { type: command.type };
}

export async function invokeDrawCommand(args: {
  tournamentId: string;
  expectedVersion: number;
  command: DrawAdminCommand;
}): Promise<InvokeDrawCmdResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { ok: false, status: 401, error: 'not_signed_in' };
  }

  const { data, error } = await supabase.functions.invoke('bonus-tournament-draw-cmd', {
    body: {
      tournamentId: args.tournamentId,
      expectedVersion: args.expectedVersion,
      command: toEdgeCommand(args.command),
    },
  });

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  const payload = data as {
    ok?: boolean;
    error?: string;
    detail?: string;
    state?: Record<string, unknown>;
  };

  if (payload?.error === 'version_conflict') {
    return {
      ok: false,
      status: 409,
      error: 'version_conflict',
      remote: payload.state ? rowToDrawState(payload.state) : undefined,
    };
  }

  if (payload?.error === 'entries_source_unavailable') {
    return {
      ok: false,
      status: 503,
      error: 'entries_source_unavailable',
      detail: payload.detail,
    };
  }

  if (!payload?.ok || !payload.state) {
    return {
      ok: false,
      status: 400,
      error: payload?.error || 'command_failed',
      detail: payload?.detail,
    };
  }

  return { ok: true, state: rowToDrawState(payload.state) };
}
