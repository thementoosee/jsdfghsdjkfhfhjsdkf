/**
 * Bonus Tournament — operator admin API.
 *
 * Auth: JWT app_metadata.bonus_tournament_admin OR BT_OPERATOR_SECRET
 * (secret only from Edge / same-origin Dashboard proxy — never VITE_*).
 * Writes use service_role; browsers never get direct INSERT/UPDATE/DELETE.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  authorizeBtAdmin,
  clientRateKey,
  operatorSecretHeaderName,
  rateLimitAllow,
} from '../_shared/bt-operator-auth.ts';
import {
  fetchTwitchProfileImagesByIds,
  isMissingOrGenericAvatar,
} from '../_shared/bt-twitch-avatars.ts';
import { BT_TEST_ROSTER, BT_TEST_USER_PREFIX, isBtTestTwitchUserId } from '../_shared/bt-test-entries.ts';

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

  const need = (rows ?? []).filter(
    (r) =>
      !isBtTestTwitchUserId(String(r.twitch_user_id ?? '')) &&
      isMissingOrGenericAvatar(r.avatar_url as string),
  );
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
  | 'refresh_avatars'
  | 'seed_test_entries'
  | 'remove_test_entries';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!rateLimitAllow(`bt-admin:${clientRateKey(req)}`, 90, 60_000)) {
    return json({ error: 'rate_limited' }, 429);
  }

  const auth = await authorizeBtAdmin(req);
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

    if (action === 'seed_test_entries') {
      const id = String(body.tournamentId ?? '');
      if (!id) return json({ error: 'missing_tournament_id' }, 400);
      const { data: tournament, error: tErr } = await sb
        .from(TOURNAMENTS)
        .select('id, status')
        .eq('id', id)
        .maybeSingle();
      if (tErr) return json({ error: 'tournament_lookup_failed', detail: tErr.message }, 500);
      if (!tournament) return json({ error: 'not_found' }, 404);

      const { data: existing, error: eErr } = await sb
        .from(ENTRIES)
        .select('twitch_user_id')
        .eq('tournament_id', id)
        .like('twitch_user_id', `${BT_TEST_USER_PREFIX}%`);
      if (eErr) return json({ error: 'entries_failed', detail: eErr.message }, 500);

      const have = new Set((existing ?? []).map((r) => String(r.twitch_user_id)));
      const missing = BT_TEST_ROSTER.filter((p) => !have.has(p.twitchUserId));
      let inserted = 0;
      if (missing.length > 0) {
        const { error: insErr } = await sb.from(ENTRIES).insert(
          missing.map((p) => ({
            tournament_id: id,
            twitch_user_id: p.twitchUserId,
            display_name: p.displayName,
            avatar_url: p.avatarUrl,
          })),
        );
        if (insErr) return json({ error: 'seed_failed', detail: insErr.message }, 500);
        inserted = missing.length;
      }

      const { data: allEntries } = await sb
        .from(ENTRIES)
        .select('id, twitch_user_id, display_name, avatar_url, enrolled_at')
        .eq('tournament_id', id)
        .order('enrolled_at', { ascending: true });

      return json({
        ok: true,
        inserted,
        reused: BT_TEST_ROSTER.length - missing.length,
        entries: allEntries ?? [],
      });
    }

    if (action === 'remove_test_entries') {
      const id = String(body.tournamentId ?? '');
      if (!id) return json({ error: 'missing_tournament_id' }, 400);

      const { data: tournament, error: tErr } = await sb
        .from(TOURNAMENTS)
        .select('id, status')
        .eq('id', id)
        .maybeSingle();
      if (tErr) return json({ error: 'tournament_lookup_failed', detail: tErr.message }, 500);
      if (!tournament) return json({ error: 'not_found' }, 404);

      const status = String(tournament.status ?? '');
      if (status !== 'preparation' && status !== 'entries') {
        return json(
          {
            error: 'draw_or_bracket_active',
            detail:
              'Já existe sorteio/confrontos. Repõe o torneio para a fase de inscrições antes de remover participantes TESTE.',
          },
          409,
        );
      }

      const { data: drawRow } = await sb
        .from('bonus_tournament_draw_presentations')
        .select('result, run_status, phase')
        .eq('tournament_id', id)
        .maybeSingle();
      if (
        drawRow &&
        (drawRow.result != null ||
          (drawRow.run_status && drawRow.run_status !== 'idle') ||
          (drawRow.phase && drawRow.phase !== 'idle'))
      ) {
        return json(
          {
            error: 'draw_presentation_locked',
            detail:
              'Há uma apresentação de sorteio ativa ou com resultado. Repõe o estado de teste (draw idle) antes de remover participantes TESTE.',
          },
          409,
        );
      }

      const { data: deleted, error: delErr } = await sb
        .from(ENTRIES)
        .delete()
        .eq('tournament_id', id)
        .like('twitch_user_id', `${BT_TEST_USER_PREFIX}%`)
        .select('id');
      if (delErr) return json({ error: 'remove_failed', detail: delErr.message }, 500);

      return json({ ok: true, removed: (deleted ?? []).length });
    }

    if (action === 'deactivate') {
      const claimChillFallback = async () => {
        // Restore CHILL on main when nothing else is claiming it (Opening/Hunt/Fever).
        const [{ data: opening }, { data: hunt }, { data: fever }] = await Promise.all([
          sb.from('bonus_openings').select('id').eq('show_on_main_overlay', true).maybeSingle(),
          sb.from('bonus_hunts').select('id').eq('show_on_main_overlay', true).maybeSingle(),
          sb
            .from('fever_tournaments')
            .select('id')
            .eq('show_on_main_overlay', true)
            .eq('status', 'active')
            .maybeSingle(),
        ]);
        if (opening?.id || hunt?.id || fever?.id) return;
        const { data: chill } = await sb
          .from('chill_sessions')
          .select('id')
          .is('ended_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!chill?.id) return;
        await sb
          .from('chill_sessions')
          .update({ show_on_main_overlay: true, updated_at: new Date().toISOString() })
          .eq('id', chill.id);
      };

      const id = body.tournamentId != null ? String(body.tournamentId) : '';
      if (id) {
        const { data, error } = await sb.rpc('bt_activate_tournament', {
          p_tournament_id: id,
          p_active: false,
        });
        if (error) return json({ error: 'deactivate_failed', detail: error.message }, 400);
        await claimChillFallback();
        return json({ ok: true, row: data });
      }
      // Clear whatever is ACTIVE
      const { data: active } = await sb
        .from(TOURNAMENTS)
        .select('id')
        .eq('is_active', true)
        .maybeSingle();
      if (!active?.id) {
        await claimChillFallback();
        return json({ ok: true, row: null });
      }
      const { data, error } = await sb.rpc('bt_activate_tournament', {
        p_tournament_id: active.id,
        p_active: false,
      });
      if (error) return json({ error: 'deactivate_failed', detail: error.message }, 400);
      await claimChillFallback();
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
