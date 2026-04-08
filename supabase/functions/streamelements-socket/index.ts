// streamelements-socket — simplified backend-only event sync using .env JWT
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeType(raw: unknown): string {
  const t = String(raw || '').toLowerCase();
  if (t.includes('follow')) return 'follower';
  if (t.includes('sub')) return 'subscriber';
  if (t.includes('raid')) return 'raid';
  if (t.includes('cheer') || t.includes('bit')) return 'cheer';
  if (t.includes('tip') || t.includes('donat')) return 'tip';
  if (t.includes('host')) return 'host';
  return '';
}

function isLikelyFollowerActivity(activity: any): boolean {
  const d = activity?.data || activity?.event || activity;
  const hasIdentity = Boolean(d?.username || d?.displayName || d?.name);
  const hasFollowerHints = Boolean(
    d?.providerId ||
    d?.avatar ||
    d?.provider === 'twitch' ||
    String(d?.providerType || '').toLowerCase().includes('twitch')
  );
  return hasIdentity && hasFollowerHints;
}

function resolveType(activity: any): string {
  for (const v of [
    activity?.type, activity?.listener,
    activity?.data?.type, activity?.data?.listener,
    activity?.event?.type, activity?.event?.listener,
  ]) {
    const t = normalizeType(v);
    if (t) return t;
  }

  if (isLikelyFollowerActivity(activity)) {
    return 'follower';
  }

  return 'unknown';
}

function parseActivityCreatedAt(activity: any): string {
  const d = activity?.data || activity?.event || activity;
  const candidate = d?.createdAt || activity?.createdAt || activity?.timestamp || null;

  if (!candidate) {
    return new Date().toISOString();
  }

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function extractActivities(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ['docs', 'items', 'activities', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

async function fetchActivities(accountId: string, jwtToken: string): Promise<any[]> {
  const url = `https://api.streamelements.com/kappa/v2/activities/${accountId}?limit=20`;
  for (const auth of [`Bearer ${jwtToken}`, `JWT ${jwtToken}`]) {
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (res.ok) return extractActivities(await res.json());
    if (res.status !== 401 && res.status !== 403) throw new Error(`SE API error ${res.status}`);
  }
  throw new Error('StreamElements auth failed — check SE_JWT_TOKEN');
}

function buildRow(a: any) {
  const eventType = resolveType(a);
  const d = a?.data || a?.event || a;
  const id = a?._id || a?.id || d?._id || d?.id || d?.providerId;
  const occurredAt = parseActivityCreatedAt(a);
  const username = String(d?.username || d?.displayName || d?.name || 'unknown');
  const eventId = id
    ? `${eventType}_${id}_${occurredAt}`
    : `${eventType}_${username}_${d?.amount || 0}_${occurredAt}`;
  return {
    eventType,
    row: {
      event_id: eventId,
      event_type: eventType,
      username,
      display_name: String(d?.displayName || username),
      message: d?.message ? String(d.message) : null,
      amount: Number(d?.amount) || 0,
      tier: d?.tier ? String(d.tier) : null,
      months: Number(d?.months) || 0,
      gifted: Boolean(d?.gifted),
      raw_data: a,
      created_at: occurredAt,
    },
  };
}

async function insertActivities(sb: any, activities: any[]) {
  let processed = 0, duplicates = 0, skipped = 0;
  for (const a of [...activities].reverse()) {
    const { eventType, row } = buildRow(a);
    if (eventType === 'unknown') { skipped++; continue; }
    const { error } = await sb.from('streamelements_events').insert(row);
    if (!error) { processed++; continue; }
    if (error.code === '23505') { duplicates++; continue; }
    skipped++;
  }
  return { processed, duplicates, skipped };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const seJwt = Deno.env.get('SE_JWT_TOKEN');
    const seAccountId = Deno.env.get('SE_ACCOUNT_ID');
    const seChannelName = Deno.env.get('SE_CHANNEL_NAME') || 'oficialfever';

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action: string = body.action || new URL(req.url).searchParams.get('action') || 'status';

    // ── STATUS ────────────────────────────────────────────────────────────────
    if (action === 'status') {
      return json({
        configured: Boolean(seJwt && seAccountId),
        channel_name: seChannelName,
        se_jwt_available: Boolean(seJwt),
        se_account_id_available: Boolean(seAccountId),
      });
    }

    // ── SYNC ──────────────────────────────────────────────────────────────────
    if (action === 'sync') {
      if (!seJwt || !seAccountId) {
        return json({ error: 'SE_JWT_TOKEN or SE_ACCOUNT_ID not configured in secrets', processed: 0, duplicates: 0, skipped: 0 }, 400);
      }

      let activities: any[];
      try {
        activities = await fetchActivities(seAccountId, seJwt);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[sync] fetch failed:', msg);
        return json({ processed: 0, duplicates: 0, skipped: 0, error: msg });
      }

      const result = await insertActivities(sb, activities);
      return json({ ...result, error: null });
    }

    // ── CLEAR ─────────────────────────────────────────────────────────────────
    if (action === 'clear') {
      const { error } = await sb.from('streamelements_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      return json({ success: !error, error: error?.message || null });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[streamelements-socket]', msg);
    return json({ error: msg }, 500);
  }
});
