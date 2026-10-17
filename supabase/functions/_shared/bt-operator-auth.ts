/**
 * Bonus Tournament operator auth.
 * - Prefer JWT with app_metadata.bonus_tournament_admin
 * - Fallback: BT_OPERATOR_SECRET via X-BT-Operator-Secret (server / same-origin proxy only)
 * Never ship BT_OPERATOR_SECRET in VITE_* / browser bundles.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAdminAppMetadata } from './bt-draw.ts';

const HEADER = 'X-BT-Operator-Secret';

export function operatorSecretHeaderName(): string {
  return HEADER;
}

/** Constant-time string compare (length must match). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  let out = 0;
  for (let i = 0; i < aa.length; i += 1) out |= aa[i]! ^ bb[i]!;
  return out === 0;
}

export function getConfiguredOperatorSecret(): string {
  return (Deno.env.get('BT_OPERATOR_SECRET') ?? '').trim();
}

export function readOperatorSecretFromRequest(req: Request): string {
  return (req.headers.get(HEADER) ?? '').trim();
}

export function assertOperatorAuthorized(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = getConfiguredOperatorSecret();
  if (!expected || expected.length < 24) {
    return { ok: false, status: 503, error: 'operator_secret_not_configured' };
  }
  const provided = readOperatorSecretFromRequest(req);
  if (!provided || !timingSafeEqual(provided, expected)) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  return { ok: true };
}

/**
 * Authorize BT admin writes: JWT admin claim OR operator secret.
 * Direct Edge calls without either credential remain 401 (not public).
 */
export async function authorizeBtAdmin(
  req: Request,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const op = assertOperatorAuthorized(req);
  if (op.ok) return { ok: true };

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, status: op.status, error: op.error };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500, error: 'server_misconfigured' };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (
    !userErr &&
    userData.user &&
    isAdminAppMetadata(userData.user.app_metadata as Record<string, unknown>)
  ) {
    return { ok: true };
  }

  return { ok: false, status: op.status, error: op.error };
}

/** Simple per-isolate rate limit (best-effort; not shared across instances). */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimitAllow(
  key: string,
  limit = 60,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

export function clientRateKey(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
