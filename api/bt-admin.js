/**
 * Same-origin Dashboard proxy → bonus-tournament-admin Edge.
 * Attaches BT_OPERATOR_SECRET server-side so the browser never holds it.
 */
export const config = { runtime: 'edge' };

const OPERATOR_HEADER = 'X-BT-Operator-Secret';

function allowedOrigin(req) {
  const origin = req.headers.get('origin') || '';
  const host = req.headers.get('host') || '';
  if (!host) return false;
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get('sec-fetch-site') || '';
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return true;
}

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
  if (!allowedOrigin(req)) {
    return json({ error: 'forbidden_origin' }, 403);
  }

  const secret = String(process.env.BT_OPERATOR_SECRET || '').trim();
  const supabaseUrl = String(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  ).replace(/\/$/, '');
  const anonKey = String(
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  );

  if (!secret || secret.length < 24) {
    return json({ error: 'operator_secret_not_configured' }, 503);
  }
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'supabase_not_configured' }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const authHeader = req.headers.get('authorization') || '';
  const edgeRes = await fetch(`${supabaseUrl}/functions/v1/bonus-tournament-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader || `Bearer ${anonKey}`,
      apikey: anonKey,
      [OPERATOR_HEADER]: secret,
    },
    body: JSON.stringify(body || {}),
  });

  const text = await edgeRes.text();
  return new Response(text, {
    status: edgeRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
