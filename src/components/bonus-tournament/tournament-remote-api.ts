/**
 * Bonus Tournament remote API — REAL live.
 * Public reads: anon SELECT of ACTIVE tournament (+ entries).
 * Writes: Edge `bonus-tournament-admin` + operator secret (never JWT login).
 */

import { supabase } from '../../lib/supabase';
import {
  BT_OPERATOR_SECRET_HEADER,
  getOperatorSecret,
} from './bt-operator-session';
import type {
  BonusTournamentDemo,
  BonusTournamentEntriesConfig,
  BonusTournamentEntry,
  BonusTournamentMatch,
  BonusTournamentPlayer,
  BonusTournamentStatus,
} from './types';
import { defaultEntriesConfig } from './demo-data';

export const BT_TOURNAMENTS_TABLE = 'bonus_tournaments';
export const BT_ENTRIES_TABLE = 'bonus_tournament_entries';
export const BT_ADMIN_FN = 'bonus-tournament-admin';

export type RemoteBackendStatus =
  | 'unknown'
  | 'ready'
  | 'missing_tables'
  | 'error'
  | 'needs_operator';

export type RemoteTournamentRow = {
  id: string;
  name: string;
  chat_command: string;
  prize_pool: number;
  status: BonusTournamentStatus;
  is_active: boolean;
  is_demo: boolean;
  entries_open: boolean;
  entries_config: BonusTournamentEntriesConfig | Record<string, unknown>;
  players: BonusTournamentPlayer[] | unknown;
  matches: BonusTournamentMatch[] | unknown;
  selected_match_id: string | null;
  overlay_view: BonusTournamentDemo['overlayView'];
  state_version: number;
  created_at: string;
  updated_at: string;
};

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function parseEntriesConfig(raw: unknown, fallbackTitle: string): BonusTournamentEntriesConfig {
  const base = defaultEntriesConfig({ tournamentTitle: fallbackTitle, entriesOpen: false });
  if (!raw || typeof raw !== 'object') return base;
  return { ...base, ...(raw as Partial<BonusTournamentEntriesConfig>) };
}

export function rowToTournament(
  row: RemoteTournamentRow,
  entries: BonusTournamentEntry[] = [],
): BonusTournamentDemo {
  const cfg = parseEntriesConfig(row.entries_config, row.name);
  return {
    id: row.id,
    name: row.name,
    isDemo: Boolean(row.is_demo),
    status: row.status,
    entries,
    entriesConfig: {
      ...cfg,
      tournamentTitle: cfg.tournamentTitle || row.name,
      chatCommand: row.chat_command || cfg.chatCommand,
      prizePool: Number(row.prize_pool) || cfg.prizePool,
      entriesOpen: row.entries_open,
    },
    players: asArray<BonusTournamentPlayer>(row.players),
    matches: asArray<BonusTournamentMatch>(row.matches),
    selectedMatchId: row.selected_match_id,
    overlayView: row.overlay_view || 'entries',
  };
}

export function tournamentToPayload(demo: BonusTournamentDemo): Record<string, unknown> {
  return {
    name: demo.name,
    chat_command: demo.entriesConfig.chatCommand,
    prize_pool: demo.entriesConfig.prizePool,
    status: demo.status,
    entries_open: demo.entriesConfig.entriesOpen,
    entries_config: demo.entriesConfig,
    players: demo.players,
    matches: demo.matches,
    selected_match_id: demo.selectedMatchId,
    overlay_view: demo.overlayView,
  };
}

function mapEntries(
  rows: Array<{
    id: string;
    twitch_user_id: string;
    display_name?: string;
    avatar_url?: string;
    enrolled_at?: string;
  }>,
): BonusTournamentEntry[] {
  return rows.map((r) => ({
    id: String(r.id),
    twitchUserId: String(r.twitch_user_id),
    displayName: String(r.display_name ?? ''),
    avatarUrl: String(r.avatar_url ?? ''),
    enrolledAt: String(r.enrolled_at ?? new Date().toISOString()),
  }));
}

async function invokeAdmin(
  action: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; data?: Record<string, unknown>; error?: string }> {
  const secret = getOperatorSecret();
  if (!secret) {
    return { ok: false, status: 401, error: 'operator_secret_required' };
  }

  const { data, error } = await supabase.functions.invoke(BT_ADMIN_FN, {
    body: { action, ...body },
    headers: { [BT_OPERATOR_SECRET_HEADER]: secret },
  });

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.error) {
    const status =
      payload.error === 'unauthorized'
        ? 401
        : payload.error === 'rate_limited'
          ? 429
          : payload.error === 'version_conflict'
            ? 409
            : 400;
    return {
      ok: false,
      status,
      error: String(payload.detail ?? payload.error),
      data: payload,
    };
  }
  return { ok: true, status: 200, data: payload };
}

/** Probe ACTIVE-readable tables (anon). */
export async function probeTournamentRemote(): Promise<{
  status: RemoteBackendStatus;
  detail?: string;
}> {
  const { error } = await supabase.from(BT_TOURNAMENTS_TABLE).select('id').eq('is_active', true).limit(1);
  if (!error) {
    return {
      status: getOperatorSecret() ? 'ready' : 'needs_operator',
      detail: getOperatorSecret()
        ? undefined
        : 'Tabelas OK · introduz o Operator Secret para administrar.',
    };
  }
  const msg = error.message || '';
  if (error.code === '42P01' || /does not exist|Could not find the table/i.test(msg)) {
    return {
      status: 'missing_tables',
      detail:
        'Tabela bonus_tournaments inexistente. Aplica as migrations BT num ambiente local/staging.',
    };
  }
  return { status: 'error', detail: msg };
}

/** Public: ACTIVE tournament only (OBS / overlays). */
export async function fetchActiveRemoteTournament(): Promise<{
  ok: boolean;
  tournament: BonusTournamentDemo | null;
  row: RemoteTournamentRow | null;
  error?: string;
}> {
  const { data, error } = await supabase
    .from(BT_TOURNAMENTS_TABLE)
    .select('*')
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    return { ok: false, tournament: null, row: null, error: error.message };
  }
  if (!data) return { ok: true, tournament: null, row: null };
  const row = data as RemoteTournamentRow;
  const entries = await fetchRemoteEntries(row.id);
  return {
    ok: true,
    row,
    tournament: rowToTournament(row, entries.entries),
  };
}

export async function fetchRemoteEntries(tournamentId: string): Promise<{
  entries: BonusTournamentEntry[];
  error?: string;
}> {
  const { data, error } = await supabase
    .from(BT_ENTRIES_TABLE)
    .select('id, twitch_user_id, display_name, avatar_url, enrolled_at')
    .eq('tournament_id', tournamentId)
    .order('enrolled_at', { ascending: true });
  if (error) return { entries: [], error: error.message };
  return { entries: mapEntries(data ?? []) };
}

/** Operator: list all tournaments (incl. inactive). */
export async function listRemoteTournaments(): Promise<{
  ok: boolean;
  rows: RemoteTournamentRow[];
  error?: string;
}> {
  const res = await invokeAdmin('list');
  if (!res.ok) return { ok: false, rows: [], error: res.error };
  return { ok: true, rows: (res.data?.rows as RemoteTournamentRow[]) ?? [] };
}

export async function fetchRemoteTournament(id: string): Promise<{
  ok: boolean;
  row?: RemoteTournamentRow;
  entries: BonusTournamentEntry[];
  error?: string;
}> {
  const res = await invokeAdmin('get', { tournamentId: id });
  if (!res.ok) return { ok: false, entries: [], error: res.error };
  return {
    ok: true,
    row: res.data?.row as RemoteTournamentRow,
    entries: mapEntries((res.data?.entries as Parameters<typeof mapEntries>[0]) ?? []),
  };
}

export async function createRemoteTournament(args: {
  name: string;
  chatCommand: string;
  prizePool: number;
  durationMinutes: number;
}): Promise<{ ok: boolean; row?: RemoteTournamentRow; error?: string }> {
  const res = await invokeAdmin('create', args);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, row: res.data?.row as RemoteTournamentRow };
}

export async function activateRemoteTournament(
  id: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (id === null) {
    const res = await invokeAdmin('deactivate', {});
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }
  const res = await invokeAdmin('activate', { tournamentId: id });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function persistRemoteTournamentState(
  demo: BonusTournamentDemo,
  expectedVersion: number,
): Promise<{ ok: boolean; row?: RemoteTournamentRow; error?: string; conflict?: boolean }> {
  const res = await invokeAdmin('upsert_state', {
    tournamentId: demo.id,
    expectedVersion,
    payload: tournamentToPayload(demo),
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.error,
      conflict: res.status === 409,
      row: res.data?.row as RemoteTournamentRow | undefined,
    };
  }
  return { ok: true, row: res.data?.row as RemoteTournamentRow };
}

export async function deleteRemoteTournament(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await invokeAdmin('delete', { tournamentId: id });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function pingOperatorAdmin(): Promise<{ ok: boolean; error?: string }> {
  const res = await invokeAdmin('ping');
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** OBS: subscribe to ACTIVE tournament changes (Postgres Realtime). */
export function subscribeActiveRemoteTournament(
  onChange: (tournament: BonusTournamentDemo | null) => void,
): () => void {
  let cancelled = false;

  const refresh = async () => {
    const pack = await fetchActiveRemoteTournament();
    if (cancelled) return;
    if (pack.ok) onChange(pack.tournament);
  };

  void refresh();

  const channel = supabase
    .channel(`bt-active-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: BT_TOURNAMENTS_TABLE },
      () => {
        void refresh();
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: BT_ENTRIES_TABLE },
      () => {
        void refresh();
      },
    )
    .subscribe();

  const poll = window.setInterval(() => {
    void refresh();
  }, 4000);

  return () => {
    cancelled = true;
    window.clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}

export function subscribeRemoteEntries(
  tournamentId: string,
  onChange: (entries: BonusTournamentEntry[]) => void,
): () => void {
  let cancelled = false;
  const refresh = async () => {
    // Operator path preferred when secret present (sees entries even if not ACTIVE yet)
    if (getOperatorSecret()) {
      const res = await invokeAdmin('list_entries', { tournamentId });
      if (!cancelled && res.ok) {
        onChange(mapEntries((res.data?.entries as Parameters<typeof mapEntries>[0]) ?? []));
        return;
      }
    }
    const pack = await fetchRemoteEntries(tournamentId);
    if (!cancelled) onChange(pack.entries);
  };
  void refresh();
  const channel = supabase
    .channel(`bt-entries-${tournamentId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: BT_ENTRIES_TABLE,
        filter: `tournament_id=eq.${tournamentId}`,
      },
      () => {
        void refresh();
      },
    )
    .subscribe();
  const poll = window.setInterval(() => {
    void refresh();
  }, 3000);
  return () => {
    cancelled = true;
    window.clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}
