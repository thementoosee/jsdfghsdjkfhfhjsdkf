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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as { code?: string };
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

    // Exchange code for tokens
    console.log('[twitch-oauth-callback] Exchanging code...');
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: 'https://jsdfghsdjkfhfhjsdkf.vercel.app/',
      }),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      console.error('[twitch-oauth-callback] Token exchange failed:', text);
      return json({ success: false, error: `Token exchange failed (${tokenResponse.status}): ${text}` });
    }

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
    try {
      console.log('[twitch-oauth-callback] Validating token...');
      const validateRes = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${tokenData.access_token}` },
      });
      if (validateRes.ok) {
        const info = (await validateRes.json()) as { login?: string; user_id?: string };
        channelName = info.login || channelName;
        channelId = info.user_id || '';
        console.log('[twitch-oauth-callback] Validated:', channelName, channelId);
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

    // Clear old config
    console.log('[twitch-oauth-callback] Deleting old config...');
    const { error: deleteError } = await supabase.from('twitch_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (deleteError) {
      console.warn('[twitch-oauth-callback] Delete warning:', deleteError.message);
    }

    // Insert new config
    console.log('[twitch-oauth-callback] Inserting new config...');
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 14400) * 1000).toISOString();
    const insertPayload = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      channel_name: channelName,
      channel_id: channelId || channelName,
      is_active: true,
      expires_at: expiresAt,
    };
    console.log('[twitch-oauth-callback] Insert payload keys:', Object.keys(insertPayload));

    const { error: insertError } = await supabase.from('twitch_config').insert(insertPayload);

    if (insertError) {
      console.error('[twitch-oauth-callback] DB insert error:', JSON.stringify(insertError));
      return json({ success: false, error: `Failed to save config: ${insertError.message}`, detail: insertError });
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
      setup: setupResult,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    console.error('[twitch-oauth-callback] Unhandled:', msg, stack);
    return json({ success: false, error: msg });
  }
});
