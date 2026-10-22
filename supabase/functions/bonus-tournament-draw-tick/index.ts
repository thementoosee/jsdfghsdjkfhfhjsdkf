/**
 * Bonus Tournament draw — server auto-advance (single controller).
 *
 * Auth: BT_DRAW_TICK_SECRET header only (never in browser / VITE_*).
 * Uses the same DRAW_TIMING as commands (draw-timing.json via bt-draw.ts).
 *
 * Body:
 * - { tournamentId } → tick one presentation
 * - { scanAll: true } or omit tournamentId → tick every due running presentation
 *
 * Cron / Vercel schedule should POST scanAll ≥1 Hz when available.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  catchUpPresentation,
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

async function tickOne(
  admin: ReturnType<typeof createClient>,
  tournamentId: string,
  nowMs: number,
): Promise<{ tournamentId: string; advanced: boolean; reason?: string }> {
  const { data: existing, error: loadErr } = await admin
    .from(PRESENTATIONS_TABLE)
    .select('*')
    .eq('tournament_id', tournamentId)
    .maybeSingle();
  if (loadErr) return { tournamentId, advanced: false, reason: loadErr.message };
  if (!existing) return { tournamentId, advanced: false, reason: 'no_row' };

  const row = existing as DrawRow;
  const { row: next, steps } = catchUpPresentation(row, nowMs);
  if (steps === 0) {
    return { tournamentId, advanced: false, reason: 'not_due' };
  }

  const { error: writeErr } = await admin.rpc('bt_draw_cas_write', {
    p_tournament_id: tournamentId,
    p_expected_version: row.version,
    p_payload: rowToCasPayload(next),
    p_allow_result_replace: false,
  });

  if (writeErr) {
    const msg = (writeErr.message ?? '').toLowerCase();
    if (msg.includes('version conflict')) {
      return { tournamentId, advanced: false, reason: 'version_conflict' };
    }
    return { tournamentId, advanced: false, reason: writeErr.message };
  }
  return { tournamentId, advanced: true };
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
    const body = (await req.json().catch(() => ({}))) as {
      tournamentId?: string;
      scanAll?: boolean;
    };
    const nowMs = Date.now();
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const scanAll = body.scanAll === true || !body.tournamentId;
    if (!scanAll) {
      const one = await tickOne(admin, String(body.tournamentId), nowMs);
      return json({ ok: true, ...one });
    }

    const { data: rows, error: listErr } = await admin
      .from(PRESENTATIONS_TABLE)
      .select('tournament_id')
      .eq('run_status', 'running');
    if (listErr) return json({ error: 'list_failed', detail: listErr.message }, 500);

    const ids = [...new Set((rows ?? []).map((r) => String((r as { tournament_id: string }).tournament_id)))];
    const results = [];
    for (const id of ids) {
      results.push(await tickOne(admin, id, nowMs));
    }
    return json({
      ok: true,
      scanned: ids.length,
      advanced: results.filter((r) => r.advanced).length,
      results,
    });
  } catch (err) {
    return json({ error: 'exception', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});
