/**
 * Bonus Tournament draw — admin commands (server-side).
 *
 * Auth (either):
 * - X-BT-Operator-Secret === BT_OPERATOR_SECRET (preferred — no Dashboard login)
 * - OR JWT + app_metadata.bonus_tournament_admin (legacy optional)
 *
 * GENERATE/REGENERATE load entries from bonus_tournament_entries (never client roster)
 * Writes via bt_draw_cas_write (advisory lock + version CAS)
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  applyCommand,
  ENTRIES_TABLE,
  isAdminAppMetadata,
  PRESENTATIONS_TABLE,
  rowToCasPayload,
  type DrawCmd,
  type DrawRow,
} from '../_shared/bt-draw.ts';
import {
  assertOperatorAuthorized,
  clientRateKey,
  operatorSecretHeaderName,
  rateLimitAllow,
} from '../_shared/bt-operator-auth.ts';

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

const ALLOWED_TYPES = new Set([
  'CLOSE_ENTRIES',
  'GENERATE_DRAW',
  'REGENERATE_DRAW',
  'START_PRESENTATION',
  'PAUSE',
  'RESUME',
  'NEXT',
  'RESTART_PRESENTATION',
  'CONFIRM_SLOT',
  'CORRECT_SLOT',
  'LAUNCH_MATCHUPS',
]);

/** Parse Edge command — never accepts client entry rosters; slot picks are admin-only. */
function parseDrawCmd(raw: Record<string, unknown> | null): DrawCmd | null {
  if (!raw?.type || typeof raw.type !== 'string' || !ALLOWED_TYPES.has(raw.type)) {
    return null;
  }
  if (raw.type === 'CONFIRM_SLOT' || raw.type === 'CORRECT_SLOT') {
    const twitchUserId = String(raw.twitchUserId ?? '');
    const slotId = String(raw.slotId ?? '');
    const slotName = String(raw.slotName ?? '');
    const slotImage = String(raw.slotImage ?? '');
    if (!twitchUserId || !slotId || !slotName) return null;
    return {
      type: raw.type,
      twitchUserId,
      slotId,
      slotName,
      slotImage,
    };
  }
  return { type: raw.type } as DrawCmd;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!rateLimitAllow(`bt-draw-cmd:${clientRateKey(req)}`, 90, 60_000)) {
    return json({ error: 'rate_limited' }, 429);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: 'server_misconfigured' }, 500);
    }

    // Prefer operator secret (no Dashboard login). Fallback: JWT admin claim.
    const op = assertOperatorAuthorized(req);
    let authorized = op.ok;
    if (!authorized) {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (authHeader.startsWith('Bearer ')) {
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userData, error: userErr } = await userClient.auth.getUser();
        if (
          !userErr &&
          userData.user &&
          isAdminAppMetadata(userData.user.app_metadata as Record<string, unknown>)
        ) {
          authorized = true;
        }
      }
    }
    if (!authorized) {
      return json({ error: op.ok === false ? op.error : 'unauthorized' }, 401);
    }

    const body = await req.json();
    const tournamentId = String(body.tournamentId ?? '');
    const expectedVersion = Number(body.expectedVersion);
    const command = parseDrawCmd(
      body.command && typeof body.command === 'object'
        ? (body.command as Record<string, unknown>)
        : null,
    );
    if (!tournamentId || !command || !Number.isFinite(expectedVersion)) {
      return json({ error: 'invalid_body' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: existing, error: loadErr } = await admin
      .from(PRESENTATIONS_TABLE)
      .select('*')
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (loadErr) return json({ error: 'load_failed', detail: loadErr.message }, 500);

    if (existing && Number(existing.version) !== expectedVersion) {
      return json({ error: 'version_conflict', state: existing }, 409);
    }
    if (!existing && expectedVersion !== 0) {
      return json({ error: 'version_conflict_missing_row' }, 409);
    }

    let trustedEntries:
      | Array<{ twitchUserId: string; displayName: string; avatarUrl: string }>
      | undefined;

    if (command.type === 'GENERATE_DRAW' || command.type === 'REGENERATE_DRAW') {
      const { data: entryRows, error: entErr } = await admin
        .from(ENTRIES_TABLE)
        .select('twitch_user_id, display_name, avatar_url')
        .eq('tournament_id', tournamentId);
      if (entErr) {
        if (
          entErr.code === '42P01' ||
          (entErr.message ?? '').toLowerCase().includes('does not exist')
        ) {
          return json({
            error: 'entries_source_unavailable',
            detail:
              'Tabela bonus_tournament_entries inexistente ou vazia de integração. GENERATE remoto bloqueado até existir fonte confiável de inscritos.',
          }, 503);
        }
        return json({ error: 'entries_load_failed', detail: entErr.message }, 500);
      }
      if (!entryRows || entryRows.length === 0) {
        return json({
          error: 'entries_source_unavailable',
          detail:
            'Nenhum inscrito em bonus_tournament_entries para este torneio. Não se aceita lista do browser.',
        }, 503);
      }
      trustedEntries = entryRows.map((r) => ({
        twitchUserId: String(r.twitch_user_id),
        displayName: String(r.display_name ?? ''),
        avatarUrl: String(r.avatar_url ?? ''),
      }));
    }

    // Prefer is_demo from bonus_tournaments (live core); fall back to presentation row / false.
    let isDemo = false;
    if (existing && typeof (existing as { is_demo?: boolean }).is_demo === 'boolean') {
      isDemo = Boolean((existing as { is_demo?: boolean }).is_demo);
    } else {
      const { data: tour } = await admin
        .from('bonus_tournaments')
        .select('is_demo')
        .eq('id', tournamentId)
        .maybeSingle();
      if (tour && typeof tour.is_demo === 'boolean') isDemo = tour.is_demo;
    }

    const seedRow = existing
      ? ({ ...(existing as DrawRow), is_demo: isDemo } as DrawRow)
      : null;

    let applied;
    try {
      applied = await applyCommand(seedRow, command, tournamentId, trustedEntries);
      applied = {
        ...applied,
        row: { ...applied.row, is_demo: isDemo },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'entries_source_unavailable') {
        return json({ error: 'entries_source_unavailable', detail: msg }, 503);
      }
      return json({ error: 'command_rejected', detail: msg }, 400);
    }

    const payload = rowToCasPayload(applied.row);
    const { data: written, error: writeErr } = await admin.rpc('bt_draw_cas_write', {
      p_tournament_id: tournamentId,
      p_expected_version: expectedVersion,
      p_payload: payload,
      p_allow_result_replace: applied.allowResultReplace,
    });

    if (writeErr) {
      const msg = (writeErr.message ?? '').toLowerCase();
      if (msg.includes('version conflict')) {
        const remote = await admin
          .from(PRESENTATIONS_TABLE)
          .select('*')
          .eq('tournament_id', tournamentId)
          .maybeSingle();
        return json({ error: 'version_conflict', state: remote.data ?? null }, 409);
      }
      return json({ error: 'cas_write_failed', detail: writeErr.message }, 500);
    }

    return json({ ok: true, state: written });
  } catch (err) {
    return json({ error: 'exception', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});
