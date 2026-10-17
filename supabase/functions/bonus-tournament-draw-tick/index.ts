/**
 * Bonus Tournament draw — server auto-advance (single controller).
 *
 * Auth: BT_DRAW_TICK_SECRET header only (never in browser / VITE_*).
 * Uses the same DRAW_TIMING as commands (draw-timing.json via bt-draw.ts).
 * Does not hardcode phase durations in SQL.
 *
 * Cron must NOT be activated until approved. Prepared for ≥1 Hz scheduling
 * (shortest phase step is countdownStepMs = 1000).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  maybeAutoAdvance,
  PRESENTATIONS_TABLE,
  rowToCasPayload,
  type DrawRow,
} from '../_shared/bt-draw.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Info, Apikey, X-BT-Draw-Tick-Secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  let out = 0;
  for (let i = 0; i < aa.length; i += 1) out |= aa[i]! ^ bb[i]!;
  return out === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const expected = Deno.env.get('BT_DRAW_TICK_SECRET') ?? '';
  const provided = req.headers.get('X-BT-Draw-Tick-Secret') ?? '';
  if (!expected || !timingSafeEqual(provided, expected)) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const tournamentId = String(body.tournamentId ?? 'demo-bonus-tournament');

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
    if (!existing) return json({ ok: true, advanced: false, reason: 'no_row' });

    const row = existing as DrawRow;
    const advanced = maybeAutoAdvance(row);
    if (!advanced || advanced.version === row.version) {
      return json({ ok: true, advanced: false, state: existing });
    }

    const { data: written, error: writeErr } = await admin.rpc('bt_draw_cas_write', {
      p_tournament_id: tournamentId,
      p_expected_version: row.version,
      p_payload: rowToCasPayload(advanced),
      p_allow_result_replace: false,
    });

    if (writeErr) {
      const msg = (writeErr.message ?? '').toLowerCase();
      if (msg.includes('version conflict')) {
        return json({ ok: true, advanced: false, reason: 'version_conflict' }, 200);
      }
      return json({ error: 'cas_write_failed', detail: writeErr.message }, 500);
    }

    return json({ ok: true, advanced: true, state: written });
  } catch (err) {
    return json({ error: 'exception', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});
