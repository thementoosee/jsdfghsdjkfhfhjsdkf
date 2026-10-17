/**
 * Bonus Tournament — operator admin API (no Dashboard login).
 *
 * Auth: BT_OPERATOR_SECRET via header X-BT-Operator-Secret (Edge secret only).
 * Writes use service_role; browsers never get direct INSERT/UPDATE/DELETE.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  assertOperatorAuthorized,
  clientRateKey,
  operatorSecretHeaderName,
  rateLimitAllow,
} from '../_shared/bt-operator-auth.ts';
import {
  fetchTwitchProfileImagesByIds,
  isMissingOrGenericAvatar,
} from '../_shared/bt-twitch-avatars.ts';

const TOURNAMENTS = 'bonus_tournaments';
const ENTRIES = 'bonus_tournament_entries';

type AdminClient = ReturnType<typeof createClient>;

async function refreshTournamentAvatars(
  sb: AdminClient,
  tournamentId: string,
): Promise<
  | { ok: true; updated: number; skipped: number; failed: number }
  | { ok: false; error: string; detail?: string; status: number }
> {
  const { data: rows, error } = await sb
    .from(ENTRIES)
    .select('id, twitch_user_id, avatar_url')
    .eq('tournament_id', tournamentId);
  if (error) return { ok: false, error: 'entries_failed', detail: error.message, status: 500 };

  const need = (rows ?? []).filter((r) => isMissingOrGenericAvatar(r.avatar_url as string));
  if (need.length === 0) {
    return { ok: true, updated: 0, skipped: (rows ?? []).length, failed: 0 };
  }

  let images: Map<string, string>;
  try {
    images = await fetchTwitchProfileImagesByIds(
      need.map((r) => String(r.twitch_user_id)),
    );
  } catch (err) {
    return {
      ok: false,
      error: 'helix_failed',
      detail: err instanceof Error ? err.message : String(err),
      status: 502,
    };
  }

  let updated = 0;
  let failed = 0;
  for (const row of need) {
    const id = String(row.twitch_user_id);
    const url = images.get(id);
    if (!url || isMissingOrGenericAvatar(url)) {
      failed += 1;
      continue;
    }
    const { error: upErr } = await sb
      .from(ENTRIES)
      .update({ avatar_url: url })
      .eq('id', row.id)
      .eq('tournament_id', tournamentId);
    if (upErr) {
      failed += 1;
      continue;
    }
    updated += 1;
  }

  // Patch players jsonb avatars for the same twitch ids (draw/bracket persistence).
  if (updated > 0) {
    const { data: tournament } = await sb
      .from(TOURNAMENTS)
      .select('players')
      .eq('id', tournamentId)
      .maybeSingle();
    const players = Array.isArray(tournament?.players) ? [...(tournament!.players as unknown[])] : [];
    let playersChanged = false;
    const patched = players.map((raw) => {
      const p = raw as Record<string, unknown>;
      const twitchId = String(p.twitchUserId ?? p.twitch_user_id ?? '');
      const nextUrl = images.get(twitchId);
      if (!nextUrl) return p;
      const current = String(p.avatarUrl ?? '');
      if (current === nextUrl) return p;
      if (isMissingOrGenericAvatar(current) || current !== nextUrl) {
        playersChanged = true;
        return { ...p, avatarUrl: nextUrl };
      }
      return p;
    });
    if (playersChanged) {
      await sb.from(TOURNAMENTS).update({ players: patched }).eq('id', tournamentId);
    }
  }

  return {
    ok: true,
    updated,
    skipped: (rows ?? []).length - need.length,
    failed,
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': `Content-Type, Authorization, X-Client-Info, Apikey, ${operatorSecretHeaderName()}`,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) throw new Error('server_misconfigured');
  return createClient(url, key);
}

type Action =
  | 'ping'
  | 'list'
  | 'get'
  | 'create'
  | 'activate'
  | 'deactivate'
  | 'upsert_state'
  | 'delete'
  | 'list_entries'
  | 'refresh_avatars';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!rateLimitAllow(`bt-admin:${clientRateKey(req)}`, 90, 60_000)) {
    return json({ error: 'rate_limited' }, 429);
  }

  const auth = assertOperatorAuthorized(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const action = String(body.action ?? '') as Action;
  if (!action) return json({ error: 'missing_action' }, 400);

  try {
    const sb = adminClient();

    if (action === 'ping') {
      return json({ ok: true, action: 'ping' });
    }

    if (action === 'list') {
      const { data, error } = await sb
        .from(TOURNAMENTS)
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) return json({ error: 'list_failed', detail: error.message }, 500);
      return json({ ok: true, rows: data ?? [] });
    }

    if (action === 'get') {
      const id = String(body.tournamentId ?? '');
      if (!id) return json({ error: 'missing_tournament_id' }, 400);
      const { data, error } = await sb.from(TOURNAMENTS).select('*').eq('id', id).maybeSingle();
      if (error) return json({ error: 'get_failed', detail: error.message }, 500);
      if (!data) return json({ error: 'not_found' }, 404);
      const { data: entries } = await sb
        .from(ENTRIES)
        .select('id, twitch_user_id, display_name, avatar_url, enrolled_at')
        .eq('tournament_id', id)
        .order('enrolled_at', { ascending: true });
      return json({ ok: true, row: data, entries: entries ?? [] });
    }

    if (action === 'list_entries') {
      const id = String(body.tournamentId ?? '');
      if (!id) return json({ error: 'missing_tournament_id' }, 400);
      const { data, error } = await sb
        .from(ENTRIES)
        .select('id, twitch_user_id, display_name, avatar_url, enrolled_at')
        .eq('tournament_id', id)
        .order('enrolled_at', { ascending: true });
      if (error) return json({ error: 'entries_failed', detail: error.message }, 500);
      return json({ ok: true, entries: data ?? [] });
    }

    if (action === 'create') {
      const name = String(body.name ?? '').trim() || 'Bonus Tournament';
      let chatCommand = String(body.chatCommand ?? '!torneio').trim();
      if (!chatCommand.startsWith('!')) chatCommand = `!${chatCommand}`;
      const prizePool = Math.max(0, Number(body.prizePool) || 0);
      const durationMinutes = Math.max(1, Number(body.durationMinutes) || 15);
      const durationSeconds = Math.round(durationMinutes * 60);
      const entriesConfig = {
        tournamentTitle: name,
        chatCommand,
        prizePool,
        durationSeconds,
        timerStartedAt: Date.now(),
        timerPaused: false,
        remainingSecondsSnapshot: null,
        entriesOpen: true,
      };

      const { data, error } = await sb
        .from(TOURNAMENTS)
        .insert({
          name,
          chat_command: chatCommand,
          prize_pool: prizePool,
          status: 'entries',
          is_active: false,
          is_demo: false,
          entries_open: true,
          entries_config: entriesConfig,
          players: [],
          matches: [],
          selected_match_id: null,
          overlay_view: 'entries',
          state_version: 0,
        })
        .select('*')
        .single();
      if (error) return json({ error: 'create_failed', detail: error.message }, 500);
      return json({ ok: true, row: data });
    }

    if (action === 'activate') {
      const id = String(body.tournamentId ?? '');
      if (!id) return json({ error: 'missing_tournament_id' }, 400);
      const { data, error } = await sb.rpc('bt_activate_tournament', {
        p_tournament_id: id,
        p_active: true,
      });
      if (error) return json({ error: 'activate_failed', detail: error.message }, 400);

      // Claim main-stream sidebar: clear show_on_main on competing modes so
      // MainStreamOverlay transitions CHILL/HUNT/OPENING → TOURNAMENT with existing slides.
      // Tournament stays ACTIVE even if the operator later reclaims CHILL on main.
      const clearedAt = new Date().toISOString();
      const clearMain = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
        try {
          const { error: clearErr } = await run();
          if (clearErr) console.warn(`[bt-admin] clear ${label}:`, clearErr.message);
        } catch (e) {
          console.warn(`[bt-admin] clear ${label}:`, e instanceof Error ? e.message : String(e));
        }
      };
      await Promise.all([
        clearMain('chill', () =>
          sb
            .from('chill_sessions')
            .update({ show_on_main_overlay: false, updated_at: clearedAt })
            .eq('show_on_main_overlay', true),
        ),
        clearMain('hunt', () =>
          sb
            .from('bonus_hunts')
            .update({ show_on_main_overlay: false, updated_at: clearedAt })
            .eq('show_on_main_overlay', true),
        ),
        clearMain('opening', () =>
          sb
            .from('bonus_openings')
            .update({ show_on_main_overlay: false, updated_at: clearedAt })
            .eq('show_on_main_overlay', true),
        ),
        clearMain('fever', () =>
          sb.from('fever_tournaments').update({ show_on_main_overlay: false }).eq('show_on_main_overlay', true),
        ),
      ]);

      return json({ ok: true, row: data });
    }

    if (action === 'refresh_avatars') {
      const id = String(body.tournamentId ?? '');
      if (!id) return json({ error: 'missing_tournament_id' }, 400);
      const result = await refreshTournamentAvatars(sb, id);
      if (!result.ok) return json({ error: result.error, detail: result.detail }, result.status);
      return json({
        ok: true,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      });
    }

    if (action === 'deactivate') {
      const id = body.tournamentId != null ? String(body.tournamentId) : '';
      if (id) {
        const { data, error } = await sb.rpc('bt_activate_tournament', {
          p_tournament_id: id,
          p_active: false,
        });
        if (error) return json({ error: 'deactivate_failed', detail: error.message }, 400);
        return json({ ok: true, row: data });
      }
      // Clear whatever is ACTIVE
      const { data: active } = await sb
        .from(TOURNAMENTS)
        .select('id')
        .eq('is_active', true)
        .maybeSingle();
      if (!active?.id) return json({ ok: true, row: null });
      const { data, error } = await sb.rpc('bt_activate_tournament', {
        p_tournament_id: active.id,
        p_active: false,
      });
      if (error) return json({ error: 'deactivate_failed', detail: error.message }, 400);
      return json({ ok: true, row: data });
    }

    if (action === 'upsert_state') {
      const id = String(body.tournamentId ?? '');
      const expectedVersion = Number(body.expectedVersion);
      const payload = body.payload;
      if (!id || !Number.isFinite(expectedVersion) || !payload || typeof payload !== 'object') {
        return json({ error: 'invalid_upsert_body' }, 400);
      }
      // Never allow flipping is_demo / is_active via payload — use activate actions
      const clean = { ...(payload as Record<string, unknown>) };
      delete clean.is_demo;
      delete clean.is_active;
      delete clean.id;

      const { data, error } = await sb.rpc('bt_tournament_cas_write', {
        p_tournament_id: id,
        p_expected_version: expectedVersion,
        p_payload: clean,
      });
      if (error) {
        const msg = error.message ?? '';
        if (/version conflict/i.test(msg)) {
          const { data: remote } = await sb.from(TOURNAMENTS).select('*').eq('id', id).maybeSingle();
          return json({ error: 'version_conflict', detail: msg, row: remote }, 409);
        }
        return json({ error: 'upsert_failed', detail: msg }, 400);
      }
      return json({ ok: true, row: data });
    }

    if (action === 'delete') {
      const id = String(body.tournamentId ?? '');
      if (!id) return json({ error: 'missing_tournament_id' }, 400);
      // Clear ACTIVE first if needed
      await sb.rpc('bt_activate_tournament', { p_tournament_id: id, p_active: false }).catch(() => null);
      await sb.from(ENTRIES).delete().eq('tournament_id', id);
      await sb.from('bonus_tournament_draw_presentations').delete().eq('tournament_id', id);
      const { error } = await sb.from(TOURNAMENTS).delete().eq('id', id);
      if (error) return json({ error: 'delete_failed', detail: error.message }, 500);
      return json({ ok: true, deleted: true });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'server_misconfigured') return json({ error: msg }, 500);
    return json({ error: 'server_error', detail: msg }, 500);
  }
});
