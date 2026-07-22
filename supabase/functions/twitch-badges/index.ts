import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const DEFAULT_BROADCASTER_ID = '134614582';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

type BadgeEntry = {
  set_id: string;
  id: string;
  title: string;
  description?: string;
  image_url_1x: string;
  image_url_2x: string;
  image_url_4x: string;
  source: 'channel' | 'global';
};

type BadgeMap = Record<string, BadgeEntry>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function badgeKey(setId: string, versionId: string) {
  return `${setId}:${versionId}`;
}

async function getAppAccessToken() {
  const clientId = Deno.env.get('TWITCH_CLIENT_ID');
  const clientSecret = Deno.env.get('TWITCH_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required');
  }

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get app access token: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string };
  return { accessToken: data.access_token, clientId };
}

type HelixBadgeSet = {
  set_id: string;
  versions: Array<{
    id: string;
    title?: string;
    description?: string;
    image_url_1x: string;
    image_url_2x: string;
    image_url_4x: string;
  }>;
};

async function fetchHelixBadges(url: string, clientId: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Helix badges request failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const body = (await response.json()) as { data?: HelixBadgeSet[] };
  return body.data ?? [];
}

function mergeBadgeSets(
  target: BadgeMap,
  sets: HelixBadgeSet[],
  source: 'channel' | 'global'
) {
  for (const set of sets) {
    for (const version of set.versions ?? []) {
      const key = badgeKey(set.set_id, version.id);
      // Channel badges override global for the same set_id + id
      if (source === 'global' && target[key]?.source === 'channel') {
        continue;
      }
      target[key] = {
        set_id: set.set_id,
        id: version.id,
        title: version.title || set.set_id,
        description: version.description,
        image_url_1x: version.image_url_1x,
        image_url_2x: version.image_url_2x,
        image_url_4x: version.image_url_4x,
        source,
      };
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let forceRefresh = url.searchParams.get('refresh') === '1';
    let broadcasterId = url.searchParams.get('broadcaster_id') || DEFAULT_BROADCASTER_ID;

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as {
        refresh?: boolean;
        broadcaster_id?: string;
      };
      if (body.refresh) forceRefresh = true;
      if (body.broadcaster_id) broadcasterId = String(body.broadcaster_id);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const cacheKey = `channel:${broadcasterId}`;
    const { data: cached } = await supabase
      .from('twitch_badge_catalog')
      .select('badges, fetched_at, broadcaster_id')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    const fetchedAt = cached?.fetched_at ? new Date(cached.fetched_at).getTime() : 0;
    const cacheFresh = Boolean(cached) && Date.now() - fetchedAt < CACHE_TTL_MS;

    if (cached && cacheFresh && !forceRefresh) {
      console.log('[twitch-badges] cache hit', { cacheKey, count: Object.keys(cached.badges || {}).length });
      return json({
        ok: true,
        from_cache: true,
        broadcaster_id: broadcasterId,
        fetched_at: cached.fetched_at,
        badges: cached.badges as BadgeMap,
      });
    }

    console.log('[twitch-badges] refreshing from Helix', { broadcasterId, forceRefresh });
    const { accessToken, clientId } = await getAppAccessToken();

    const [globalSets, channelSets] = await Promise.all([
      fetchHelixBadges('https://api.twitch.tv/helix/chat/badges/global', clientId, accessToken),
      fetchHelixBadges(
        `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
        clientId,
        accessToken
      ),
    ]);

    const badges: BadgeMap = {};
    mergeBadgeSets(badges, globalSets, 'global');
    mergeBadgeSets(badges, channelSets, 'channel');

    const nowIso = new Date().toISOString();
    const { error: upsertError } = await supabase.from('twitch_badge_catalog').upsert(
      {
        cache_key: cacheKey,
        broadcaster_id: broadcasterId,
        badges,
        fetched_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'cache_key' }
    );

    if (upsertError) {
      console.warn('[twitch-badges] cache write failed:', upsertError.message);
    }

    console.log('[twitch-badges] refreshed', {
      broadcasterId,
      global_sets: globalSets.length,
      channel_sets: channelSets.length,
      mapped: Object.keys(badges).length,
    });

    return json({
      ok: true,
      from_cache: false,
      broadcaster_id: broadcasterId,
      fetched_at: nowIso,
      badges,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[twitch-badges]', message);
    return json({ ok: false, error: message }, 500);
  }
});
