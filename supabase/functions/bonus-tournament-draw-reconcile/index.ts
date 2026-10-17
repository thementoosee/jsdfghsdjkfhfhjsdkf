/**
 * Public, narrowly-scoped draw catch-up (no operator secret).
 *
 * POST { tournamentId } → apply overdue timed phase advances via CAS (single version bump).
 * Does NOT: generate/regenerate draws, delete, confirm slots, or accept arbitrary commands.
 *
 * Auth: none beyond rate limits (OBS Browser Sources have no admin session).
 * Safe: only maybeAutoAdvance / catchUpPresentation on an existing locked result.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  catchUpPresentation,
  PRESENTATIONS_TABLE,
  rowToCasPayload,
  type DrawRow,
} from '../_shared/bt-draw.ts';
import { clientRateKey, rateLimitAllow } from '../_shared/bt-operator-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const ip = clientRateKey(req);
  // Controlled frequency: ~1 reconcile/sec/IP sustained, burst 30/min
  if (!rateLimitAllow(`bt-draw-reconcile:${ip}`, 30, 60_000)) {
    return json({ error: 'rate_limited' }, 429);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { tournamentId?: string };
    const tournamentId = String(body.tournamentId ?? '').trim();
    if (!tournamentId || tournamentId.length > 80) {
      return json({ error: 'missing_tournament_id' }, 400);
    }
    if (!rateLimitAllow(`bt-draw-reconcile-tid:${tournamentId}`, 60, 60_000)) {
      return json({ error: 'rate_limited' }, 429);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: existing, error: loadErr } = await admin
      .from(PRESENTATIONS_TABLE)
      .select('*')
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (loadErr) return json({ error: 'load_failed', detail: loadErr.message }, 500);
    if (!existing) return json({ ok: true, advanced: false, steps: 0, reason: 'no_row' });

    const row = existing as DrawRow;
    const nowMs = Date.now();
    const { row: next, steps } = catchUpPresentation(row, nowMs);
    if (steps === 0) {
      return json({ ok: true, advanced: false, steps: 0, state: existing });
    }

    const { data: written, error: writeErr } = await admin.rpc('bt_draw_cas_write', {
      p_tournament_id: tournamentId,
      p_expected_version: row.version,
      p_payload: rowToCasPayload(next),
      p_allow_result_replace: false,
    });

    if (writeErr) {
      const msg = (writeErr.message ?? '').toLowerCase();
      if (msg.includes('version conflict')) {
        // Another client already reconciled — idempotent success
        const { data: fresh } = await admin
          .from(PRESENTATIONS_TABLE)
          .select('*')
          .eq('tournament_id', tournamentId)
          .maybeSingle();
        return json({
          ok: true,
          advanced: false,
          steps: 0,
          reason: 'version_conflict',
          state: fresh ?? existing,
        });
      }
      return json({ error: 'cas_write_failed', detail: writeErr.message }, 500);
    }

    return json({ ok: true, advanced: true, steps, state: written });
  } catch (err) {
    return json({ error: 'exception', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});
