/**
 * Browser → Edge Function command path (no direct table writes, no client entry roster).
 * Auth: operator secret header (preferred) and/or existing session JWT.
 */
import { supabase } from '../../lib/supabase';
import {
  BT_OPERATOR_SECRET_HEADER,
  getOperatorSecret,
} from './bt-operator-session';
import { rowToDrawState } from './draw-sync';
import type { DrawAdminCommand, DrawPresentationState } from './draw-types';

export type InvokeDrawCmdResult =
  | { ok: true; state: DrawPresentationState }
  | { ok: false; status: number; error: string; detail?: string; remote?: DrawPresentationState };

/**
 * Strip client entry rosters (server loads bonus_tournament_entries).
 * Keep slot-confirm fields for CONFIRM_SLOT / CORRECT_SLOT.
 */
function toEdgeCommand(command: DrawAdminCommand): Record<string, unknown> {
  if (command.type === 'CONFIRM_SLOT' || command.type === 'CORRECT_SLOT') {
    return {
      type: command.type,
      twitchUserId: command.twitchUserId,
      slotId: command.slotId,
      slotName: command.slotName,
      slotImage: command.slotImage,
    };
  }
  return { type: command.type };
}

export async function invokeDrawCommand(args: {
  tournamentId: string;
  expectedVersion: number;
  command: DrawAdminCommand;
}): Promise<InvokeDrawCmdResult> {
  const secret = getOperatorSecret();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!secret && !sessionData.session) {
    return { ok: false, status: 401, error: 'operator_secret_required' };
  }

  const headers: Record<string, string> = {};
  if (secret) headers[BT_OPERATOR_SECRET_HEADER] = secret;

  const { data, error } = await supabase.functions.invoke('bonus-tournament-draw-cmd', {
    body: {
      tournamentId: args.tournamentId,
      expectedVersion: args.expectedVersion,
      command: toEdgeCommand(args.command),
    },
    headers,
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
