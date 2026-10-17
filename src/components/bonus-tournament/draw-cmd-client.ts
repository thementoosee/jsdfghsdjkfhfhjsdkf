/**
 * Browser → same-origin `/api/bt-draw-cmd` proxy (server attaches operator secret)
 * or JWT admin session. No direct table writes; no client entry roster.
 */
import { supabase } from '../../lib/supabase';
import { rowToDrawState } from './draw-sync';
import type { DrawAdminCommand, DrawPresentationState } from './draw-types';

export const BT_DRAW_CMD_PROXY = '/api/bt-draw-cmd';

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
  const { data: sessionData } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const accessToken = sessionData.session?.access_token;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let payload: {
    ok?: boolean;
    error?: string;
    detail?: string;
    state?: Record<string, unknown>;
  } = {};
  let httpStatus = 500;

  try {
    const res = await fetch(BT_DRAW_CMD_PROXY, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify({
        tournamentId: args.tournamentId,
        expectedVersion: args.expectedVersion,
        command: toEdgeCommand(args.command),
      }),
    });
    httpStatus = res.status;
    payload = (await res.json().catch(() => ({}))) as typeof payload;
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : 'draw_proxy_failed',
    };
  }

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

  if (payload?.error) {
    return {
      ok: false,
      status: httpStatus >= 400 ? httpStatus : 400,
      error: String(payload.error),
      detail: payload.detail,
      remote: payload.state ? rowToDrawState(payload.state) : undefined,
    };
  }

  if (!payload?.state) {
    return { ok: false, status: httpStatus >= 400 ? httpStatus : 500, error: 'missing_state' };
  }

  return { ok: true, state: rowToDrawState(payload.state) };
}
