/**
 * Same-origin proxy → bonus-tournament-draw-reconcile Edge.
 * POST only. No operator secret — Edge only catch-up timed phases (not admin commands).
 */
export const config = { runtime: 'edge' };

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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = String(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  ).replace(/\/$/, '');
  const anonKey = String(
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  );
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'supabase_not_configured' }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body || typeof body.tournamentId !== 'string' || !body.tournamentId.trim()) {
    return json({ error: 'missing_tournament_id' }, 400);
  }

  const edgeRes = await fetch(`${supabaseUrl}/functions/v1/bonus-tournament-draw-reconcile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ tournamentId: body.tournamentId.trim() }),
  });

  const text = await edgeRes.text();
  return new Response(text, {
    status: edgeRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
