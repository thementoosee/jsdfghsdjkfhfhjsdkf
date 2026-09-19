// streamelements-socket — SE tips sync via panel config (DB) or env secrets fallback
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
  throw new Error('StreamElements auth failed — JWT/Account ID invalidos');
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
    // Hybrid architecture: SE only persists tips/donations (Twitch EventSub owns native alerts)
    if (eventType !== 'tip') {
      skipped++;
      continue;
    }
    const { error } = await sb.from('streamelements_events').insert(row);
    if (!error) { processed++; continue; }
    if (error.code === '23505') { duplicates++; continue; }
    skipped++;
  }
  return { processed, duplicates, skipped };
}

type SeConfig = {
  jwt_token: string | null;
  account_id: string | null;
  channel_name: string | null;
  is_active: boolean | null;
  updated_at: string | null;
};

async function loadDbConfig(sb: any): Promise<SeConfig | null> {
  const { data, error } = await sb
    .from('streamelements_config')
    .select('jwt_token, account_id, channel_name, is_active, updated_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[streamelements-socket] load config error:', error.message);
    return null;
  }
  return data as SeConfig | null;
}

function resolveCredentials(dbConfig: SeConfig | null) {
  const jwt = (dbConfig?.jwt_token || Deno.env.get('SE_JWT_TOKEN') || '').trim();
  const accountId = (dbConfig?.account_id || Deno.env.get('SE_ACCOUNT_ID') || '').trim();
  const channelName = (dbConfig?.channel_name || Deno.env.get('SE_CHANNEL_NAME') || 'oficialfever').trim();
  return { jwt, accountId, channelName, fromDb: Boolean(dbConfig?.jwt_token && dbConfig?.account_id) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action: string = body.action || new URL(req.url).searchParams.get('action') || 'status';

    // ── SAVE (dashboard panel) ────────────────────────────────────────────────
    if (action === 'save') {
      const jwtToken = String(body.jwtToken || body.jwt_token || '').trim();
      const accountId = String(body.accountId || body.account_id || '').trim();
      const channelName = String(body.channelName || body.channel_name || 'jigadores').trim() || 'jigadores';

      if (!jwtToken || !accountId) {
        return json({ error: 'jwtToken and accountId are required', configured: false }, 400);
      }

      // Replace previous active rows so only one active config remains.
      await sb.from('streamelements_config').update({ is_active: false }).eq('is_active', true);

      const now = new Date().toISOString();
      const { data, error } = await sb
        .from('streamelements_config')
        .insert({
          jwt_token: jwtToken,
          account_id: accountId,
          channel_name: channelName,
          is_active: true,
          updated_at: now,
        })
        .select('channel_name, is_active, updated_at')
        .single();

      if (error) {
        console.error('[save] insert failed:', error.message);
        return json({ error: error.message, configured: false }, 500);
      }

      // Smoke-test SE credentials immediately so the panel gets a clear error.
      try {
        await fetchActivities(accountId, jwtToken);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[save] SE auth smoke test failed:', msg);
        return json({
          configured: true,
          channel_name: data.channel_name,
          is_active: true,
          updated_at: data.updated_at,
          warning: msg,
        });
      }

      return json({
        configured: true,
        channel_name: data.channel_name,
        is_active: true,
        updated_at: data.updated_at,
      });
    }

    const dbConfig = await loadDbConfig(sb);
    const creds = resolveCredentials(dbConfig);

    // ── STATUS ────────────────────────────────────────────────────────────────
    if (action === 'status') {
      return json({
        configured: Boolean(creds.jwt && creds.accountId),
        channel_name: creds.channelName,
        is_active: Boolean(dbConfig?.is_active ?? (creds.jwt && creds.accountId)),
        updated_at: dbConfig?.updated_at ?? null,
        se_jwt_available: Boolean(creds.jwt),
        se_account_id_available: Boolean(creds.accountId),
        source: creds.fromDb ? 'database' : (creds.jwt ? 'env' : 'none'),
      });
    }

    // ── SYNC ──────────────────────────────────────────────────────────────────
    if (action === 'sync') {
      if (!creds.jwt || !creds.accountId) {
        return json({
          error: 'StreamElements nao configurado. Guarda JWT + Account ID no painel.',
          processed: 0,
          duplicates: 0,
          skipped: 0,
        }, 400);
      }

      let activities: any[];
      try {
        activities = await fetchActivities(creds.accountId, creds.jwt);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[sync] fetch failed:', msg);
        return json({ processed: 0, duplicates: 0, skipped: 0, error: msg });
      }

      const result = await insertActivities(sb, activities);
      return json({ ...result, error: null, channel_name: creds.channelName });
    }

    // ── CLEAR events ──────────────────────────────────────────────────────────
    if (action === 'clear') {
      const { error } = await sb.from('streamelements_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      return json({ success: !error, error: error?.message || null });
    }

    // ── CLEAR config ──────────────────────────────────────────────────────────
    if (action === 'clear_config') {
      const { error } = await sb.from('streamelements_config').update({ is_active: false }).eq('is_active', true);
      return json({ success: !error, error: error?.message || null, configured: false });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[streamelements-socket]', msg);
    return json({ error: msg }, 500);
  }
});
