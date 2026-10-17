/**
 * Same-origin Dashboard proxy → bonus-tournament-draw-cmd Edge.
 * Attaches BT_OPERATOR_SECRET server-side so the browser never holds it.
 */
const OPERATOR_HEADER = 'X-BT-Operator-Secret';

function allowedOrigin(req) {
  const origin = String(req.headers.origin || '');
  const host = String(req.headers.host || '');
  if (!host) return false;
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = String(req.headers['sec-fetch-site'] || '');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!allowedOrigin(req)) {
    return res.status(403).json({ error: 'forbidden_origin' });
  }

  const secret = String(process.env.BT_OPERATOR_SECRET || '').trim();
  const supabaseUrl = String(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  ).replace(/\/$/, '');
  const anonKey = String(
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  );

  if (!secret || secret.length < 24) {
    return res.status(503).json({ error: 'operator_secret_not_configured' });
  }
  if (!supabaseUrl || !anonKey) {
    return res.status(503).json({ error: 'supabase_not_configured' });
  }

  const authHeader = String(req.headers.authorization || '');
  const edgeRes = await fetch(`${supabaseUrl}/functions/v1/bonus-tournament-draw-cmd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader || `Bearer ${anonKey}`,
      apikey: anonKey,
      [OPERATOR_HEADER]: secret,
    },
    body: JSON.stringify(req.body || {}),
  });

  const text = await edgeRes.text();
  res.status(edgeRes.status);
  res.setHeader('Content-Type', 'application/json');
  return res.send(text);
};
