// spotify-now-playing — OAuth PKCE + currently playing for overlay top bar
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SPOTIFY_CLIENT_ID =
  Deno.env.get('SPOTIFY_CLIENT_ID') || '5b6233d112574af2b8fafa8321bd3753';
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET') || '';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

async function exchangeToken(params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Confidential apps can send Basic auth; public PKCE apps omit secret.
  if (SPOTIFY_CLIENT_SECRET) {
    headers.Authorization =
      'Basic ' + btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers,
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || `token_http_${res.status}`);
  }
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };
}

async function loadActiveConfig(sb: ReturnType<typeof getAdmin>) {
  const { data, error } = await sb
    .from('spotify_config')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    access_token: string | null;
    refresh_token: string | null;
    expires_at: string | null;
    display_name: string | null;
  } | null;
}

async function ensureAccessToken(sb: ReturnType<typeof getAdmin>) {
  const config = await loadActiveConfig(sb);
  if (!config?.refresh_token && !config?.access_token) {
    return { error: 'not_connected' as const, config: null, accessToken: null };
  }

  const expiresAt = config.expires_at ? new Date(config.expires_at).getTime() : 0;
  const stillValid = config.access_token && expiresAt - Date.now() > 60_000;
  if (stillValid) {
    return { error: null, config, accessToken: config.access_token as string };
  }

  if (!config.refresh_token) {
    return { error: 'missing_refresh_token' as const, config, accessToken: null };
  }

  const tokenParams: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: config.refresh_token,
    client_id: SPOTIFY_CLIENT_ID,
  };

  const refreshed = await exchangeToken(tokenParams);
  const expires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const { error } = await sb
    .from('spotify_config')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || config.refresh_token,
      expires_at: expires,
      updated_at: new Date().toISOString(),
    })
    .eq('id', config.id);

  if (error) throw new Error(error.message);
  return { error: null, config, accessToken: refreshed.access_token };
}

async function fetchProfile(accessToken: string) {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data?.display_name as string) || (data?.id as string) || null;
}

async function fetchCurrentlyPlaying(accessToken: string) {
  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 204 = nothing playing
  if (res.status === 204) {
    return { is_playing: false, track: null, artist: null, album_art: null };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`currently_playing_${res.status}: ${text.slice(0, 180)}`);
  }

  const data = await res.json();
  const item = data?.item;
  if (!item) {
    return { is_playing: Boolean(data?.is_playing), track: null, artist: null, album_art: null };
  }

  const artists = Array.isArray(item.artists)
    ? item.artists.map((a: { name?: string }) => a?.name).filter(Boolean).join(', ')
    : '';

  const art =
    Array.isArray(item.album?.images) && item.album.images.length > 0
      ? item.album.images[item.album.images.length - 1]?.url || item.album.images[0]?.url
      : null;

  return {
    is_playing: Boolean(data?.is_playing),
    track: item.name || null,
    artist: artists || null,
    album_art: art,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const sb = getAdmin();

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action =
      body.action || new URL(req.url).searchParams.get('action') || 'currently_playing';

    if (action === 'status') {
      const config = await loadActiveConfig(sb);
      return json({
        connected: Boolean(config?.refresh_token || config?.access_token),
        display_name: config?.display_name || null,
        client_id: SPOTIFY_CLIENT_ID,
      });
    }

    if (action === 'exchange') {
      const code = String(body.code || '').trim();
      const redirectUri = String(body.redirect_uri || '').trim();
      const codeVerifier = String(body.code_verifier || '').trim();

      if (!code || !redirectUri || !codeVerifier) {
        return json({ error: 'code, redirect_uri and code_verifier are required' }, 400);
      }

      const tokenParams: Record<string, string> = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: SPOTIFY_CLIENT_ID,
        code_verifier: codeVerifier,
      };

      const tokens = await exchangeToken(tokenParams);
      const displayName = await fetchProfile(tokens.access_token);
      const expires = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      await sb.from('spotify_config').update({ is_active: false }).eq('is_active', true);

      const { data, error } = await sb
        .from('spotify_config')
        .insert({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          expires_at: expires,
          display_name: displayName,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .select('display_name, is_active, updated_at')
        .single();

      if (error) return json({ error: error.message }, 500);

      return json({
        success: true,
        connected: true,
        display_name: data.display_name,
      });
    }

    if (action === 'disconnect') {
      await sb.from('spotify_config').update({ is_active: false }).eq('is_active', true);
      return json({ success: true, connected: false });
    }

    if (action === 'currently_playing' || action === 'now') {
      const ensured = await ensureAccessToken(sb);
      if (ensured.error || !ensured.accessToken) {
        return json({
          connected: false,
          is_playing: false,
          track: null,
          artist: null,
          album_art: null,
          error: ensured.error || 'not_connected',
        });
      }

      const now = await fetchCurrentlyPlaying(ensured.accessToken);
      return json({
        connected: true,
        display_name: ensured.config?.display_name || null,
        ...now,
      });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[spotify-now-playing]', msg);
    return json({ error: msg }, 500);
  }
});
