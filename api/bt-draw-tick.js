/**
 * Locked-down bulk tick (operator / cron only).
 * POST only — never GET. Does not expose operator secret to the browser.
 * Visitors cannot call this: requires X-BT-Draw-Tick-Secret matching server env,
 * or Vercel Cron header when BT_DRAW_TICK_SECRET is unset but cron is configured.
 *
 * Prefer /api/bt-draw-reconcile for OBS autonomy (tournament-scoped, no admin secret).
 */
export const config = { runtime: 'edge' };

const OPERATOR_HEADER = 'X-BT-Operator-Secret';
const TICK_HEADER = 'X-BT-Draw-Tick-Secret';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': `Content-Type, Authorization, ${TICK_HEADER}`,
      },
    });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const tickSecret = String(process.env.BT_DRAW_TICK_SECRET || '').trim();
  const provided = String(req.headers.get(TICK_HEADER) || '').trim();
  const isCron = req.headers.get('x-vercel-cron') === '1';

  // Require explicit tick secret OR (cron + operator secret). Never open to anonymous GET/POST.
  const operatorSecret = String(process.env.BT_OPERATOR_SECRET || '').trim();
  let authorized = false;
  if (tickSecret.length >= 16 && provided && provided === tickSecret) {
    authorized = true;
  } else if (isCron && operatorSecret.length >= 24) {
    authorized = true;
  }
  if (!authorized) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabaseUrl = String(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  ).replace(/\/$/, '');
  const anonKey = String(
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  );
  if (!supabaseUrl || !anonKey || operatorSecret.length < 24) {
    return json({ error: 'server_misconfigured' }, 503);
  }

  const edgeRes = await fetch(`${supabaseUrl}/functions/v1/bonus-tournament-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      [OPERATOR_HEADER]: operatorSecret,
    },
    body: JSON.stringify({ action: 'tick_due_draws' }),
  });

  const text = await edgeRes.text();
  return new Response(text, {
    status: edgeRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
