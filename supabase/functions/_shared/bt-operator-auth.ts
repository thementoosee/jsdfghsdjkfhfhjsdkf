/**
 * Bonus Tournament operator auth — Edge secrets only.
 * Never ship BT_OPERATOR_SECRET in VITE_* / browser bundles.
 */

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
