// twitch-oauth-callback — exchange authorization code for access/refresh tokens
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Always return 200 so supabase.functions.invoke() passes the body through
function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ALLOWED_REDIRECT_URIS = [
  'https://ollo-pasidaojk.vercel.app/',
  'https://ollo-pasidaojk.vercel.app',
  'http://localhost:5173/',
  'http://localhost:5173',
];

function resolveRedirectCandidates(requested?: string): string[] {
  const fromEnv = (Deno.env.get('TWITCH_OAUTH_REDIRECT_URI') || '').trim();
  const requestedTrimmed = (requested || '').trim();
  const ordered = [requestedTrimmed, fromEnv, ...ALLOWED_REDIRECT_URIS].filter(Boolean);

  // Prefer exact allowlisted values; also keep slash/no-slash twins together.
  const unique: string[] = [];
  for (const uri of ordered) {
    if (!ALLOWED_REDIRECT_URIS.includes(uri) && uri !== fromEnv) {
      continue;
    }
    if (!unique.includes(uri)) unique.push(uri);
    const twin = uri.endsWith('/') ? uri.slice(0, -1) : `${uri}/`;
    if ((ALLOWED_REDIRECT_URIS.includes(twin) || twin === fromEnv) && !unique.includes(twin)) {
      unique.push(twin);
    }
  }

  return unique.length > 0 ? unique : ['https://ollo-pasidaojk.vercel.app/', 'https://ollo-pasidaojk.vercel.app'];
}

async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
) {
  return fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as { code?: string; redirect_uri?: string };
    const code = (body.code || '').trim();

    if (!code) {
      return json({ success: false, error: 'Missing authorization code' });
    }

    const clientId = Deno.env.get('TWITCH_CLIENT_ID');
    const clientSecret = Deno.env.get('TWITCH_CLIENT_SECRET');

    console.log('[twitch-oauth-callback] Starting. clientId present:', !!clientId, 'clientSecret present:', !!clientSecret);

    if (!clientId || !clientSecret) {
      return json({ success: false, error: 'Server misconfigured: missing Twitch app secrets' });
    }

    // Exchange code for tokens — redirect_uri must match authorize request + Twitch console exactly
    const redirectCandidates = resolveRedirectCandidates(body.redirect_uri);
    console.log('[twitch-oauth-callback] Exchanging code with redirect candidates:', redirectCandidates);

    let tokenResponse: Response | null = null;
    let usedRedirectUri = redirectCandidates[0];
    let lastErrorText = '';

    for (const redirectUri of redirectCandidates) {
      const response = await exchangeCodeForToken(clientId, clientSecret, code, redirectUri);
      if (response.ok) {
        tokenResponse = response;
        usedRedirectUri = redirectUri;
        break;
      }
      lastErrorText = await response.text();
      console.warn('[twitch-oauth-callback] Exchange failed for', redirectUri, response.status, lastErrorText);
      // Authorization codes are single-use; stop after first non-redirect mismatch failure that consumes code
      if (!lastErrorText.includes('redirect_uri')) {
        tokenResponse = response;
        usedRedirectUri = redirectUri;
        break;
      }
    }

    if (!tokenResponse || !tokenResponse.ok) {
      console.error('[twitch-oauth-callback] Token exchange failed:', lastErrorText);
      return json({
        success: false,
        error: `Token exchange failed: ${lastErrorText || 'unknown error'}`,
        tried_redirect_uris: redirectCandidates,
      });
    }

    console.log('[twitch-oauth-callback] Token exchange OK with redirect_uri:', usedRedirectUri);

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    console.log('[twitch-oauth-callback] Token exchange success, access_token present:', !!tokenData.access_token);

    if (!tokenData.access_token) {
      return json({ success: false, error: 'No access token returned' });
    }

    // Validate token to get user info
    let channelName = 'oficialfever';
    let channelId = '';
    let grantedScopes: string[] = [];
    try {
      console.log('[twitch-oauth-callback] Validating token...');
      const validateRes = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${tokenData.access_token}` },
      });
      if (validateRes.ok) {
        const info = (await validateRes.json()) as { login?: string; user_id?: string; scopes?: string[] };
        channelName = info.login || channelName;
        channelId = info.user_id || '';
        grantedScopes = info.scopes ?? [];
        console.log('[twitch-oauth-callback] Validated:', channelName, channelId, 'scopes_count:', grantedScopes.length);
      } else {
        console.warn('[twitch-oauth-callback] Validation failed:', validateRes.status);
      }
    } catch (e) {
      console.warn('[twitch-oauth-callback] Token validation skipped:', e);
    }

    // Save tokens to twitch_config using service role (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    console.log('[twitch-oauth-callback] Supabase URL present:', !!supabaseUrl, 'Service key present:', !!serviceKey);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Only replace tokens AFTER successful exchange — update in place when possible
    console.log('[twitch-oauth-callback] Saving config (preserve until success)...');
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 14400) * 1000).toISOString();
    const insertPayload = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      channel_name: channelName,
      channel_id: channelId || channelName,
      is_active: true,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    console.log('[twitch-oauth-callback] Payload keys:', Object.keys(insertPayload));

    const { data: existingRows, error: existingError } = await supabase
      .from('twitch_config')
      .select('id')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (existingError) {
      console.warn('[twitch-oauth-callback] Existing lookup warning:', existingError.message);
    }

    const existingId = existingRows?.[0]?.id as string | undefined;
    if (existingId) {
      const { error: updateError } = await supabase
        .from('twitch_config')
        .update(insertPayload)
        .eq('id', existingId);
      if (updateError) {
        console.error('[twitch-oauth-callback] DB update error:', JSON.stringify(updateError));
        return json({ success: false, error: `Failed to save config: ${updateError.message}`, detail: updateError });
      }
    } else {
      const { error: insertError } = await supabase.from('twitch_config').insert(insertPayload);
      if (insertError) {
        console.error('[twitch-oauth-callback] DB insert error:', JSON.stringify(insertError));
        return json({ success: false, error: `Failed to save config: ${insertError.message}`, detail: insertError });
      }
    }

    console.log('[twitch-oauth-callback] Config saved, triggering EventSub setup...');

    // Trigger EventSub setup
    let setupResult: Record<string, unknown> = {};
    try {
      const setupUrl = `${supabaseUrl}/functions/v1/twitch-eventsub`;
      const setupRes = await fetch(setupUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ action: 'setup' }),
      });
      setupResult = (await setupRes.json()) as Record<string, unknown>;
      console.log('[twitch-oauth-callback] EventSub setup result:', JSON.stringify(setupResult));
    } catch (e) {
      console.warn('[twitch-oauth-callback] EventSub setup failed:', e);
      setupResult = { setup_error: e instanceof Error ? e.message : String(e) };
    }

    return json({
      success: true,
      channel_name: channelName,
      channel_id: channelId,
      scopes: grantedScopes,
      setup: setupResult,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    console.error('[twitch-oauth-callback] Unhandled:', msg, stack);
    return json({ success: false, error: msg });
  }
});
