import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

type JsonRecord = Record<string, unknown>;

interface TwitchEventSubNotification {
  subscription?: {
    id?: string;
    type?: string;
    version?: string;
    status?: string;
  };
  event?: Record<string, unknown>;
  challenge?: string;
}

interface TwitchConfigRow {
  id: string;
  access_token: string;
  refresh_token: string | null;
  channel_name: string;
  channel_id: string | null;
  is_active: boolean;
}

interface ValidatedTwitchToken {
  client_id: string;
  login: string;
  user_id: string;
  scopes: string[];
  expires_in: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

function getCallbackUrl() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  return `${supabaseUrl}/functions/v1/twitch-eventsub`;
}

function getEventSubSecret() {
  return Deno.env.get('TWITCH_EVENTSUB_SECRET') || (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').slice(0, 32);
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function isValidSignature(req: Request, rawBody: string) {
  const messageId = req.headers.get('Twitch-Eventsub-Message-Id') ?? '';
  const timestamp = req.headers.get('Twitch-Eventsub-Message-Timestamp') ?? '';
  const signature = req.headers.get('Twitch-Eventsub-Message-Signature') ?? '';

  if (!messageId || !timestamp || !signature) {
    return false;
  }

  // Twitch EventSub: HMAC-SHA256(secret, message_id + timestamp + body)
  const expected = `sha256=${await hmacSha256Hex(getEventSubSecret(), messageId + timestamp + rawBody)}`;
  return signature === expected;
}

async function getActiveTwitchConfig(supabase: ReturnType<typeof getAdminClient>) {
  const { data, error } = await supabase
    .from('twitch_config')
    .select('id, access_token, refresh_token, channel_name, channel_id, is_active')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as TwitchConfigRow | null) ?? null;
}

async function validateTwitchToken(accessToken: string) {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: {
      Authorization: `OAuth ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Twitch token validation failed with status ${response.status}`);
  }

  return response.json() as Promise<ValidatedTwitchToken>;
}

async function refreshTwitchAccessToken(refreshToken: string) {
  const clientId = Deno.env.get('TWITCH_CLIENT_ID');
  const clientSecret = Deno.env.get('TWITCH_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required to refresh Twitch tokens');
  }

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twitch token refresh failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string[];
    token_type: string;
  }>;
}

async function getValidatedTokenWithRefresh(supabase: ReturnType<typeof getAdminClient>, config: TwitchConfigRow) {
  try {
    const tokenInfo = await validateTwitchToken(config.access_token);
    return { accessToken: config.access_token, tokenInfo };
  } catch (error) {
    if (!config.refresh_token) {
      throw error;
    }

    const refreshed = await refreshTwitchAccessToken(config.refresh_token);
    const { error: updateError } = await supabase
      .from('twitch_config')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
      })
      .eq('id', config.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const tokenInfo = await validateTwitchToken(refreshed.access_token);
    return { accessToken: refreshed.access_token, tokenInfo };
  }
}

async function updateTwitchConfigChannelId(
  supabase: ReturnType<typeof getAdminClient>,
  configId: string,
  channelId: string
) {
  const { error } = await supabase
    .from('twitch_config')
    .update({ channel_id: channelId })
    .eq('id', configId);

  if (error) {
    throw new Error(error.message);
  }
}

async function listSubscriptions(clientId: string, accessToken: string) {
  const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list EventSub subscriptions: ${response.status}`);
  }

  const body = (await response.json()) as { data?: Array<Record<string, unknown>> };
  return body.data ?? [];
}

async function createSubscription(
  clientId: string,
  accessToken: string,
  type: string,
  version: string,
  condition: JsonRecord
) {
  const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type,
      version,
      condition,
      transport: {
        method: 'webhook',
        callback: getCallbackUrl(),
        secret: getEventSubSecret(),
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create ${type} subscription: ${response.status} ${text}`);
  }

  return response.json();
}

function buildRequiredSubscriptions(channelId: string) {
  return [
    {
      type: 'channel.follow',
      version: '2',
      condition: {
        broadcaster_user_id: channelId,
        moderator_user_id: channelId,
      },
    },
    {
      type: 'channel.subscribe',
      version: '1',
      condition: {
        broadcaster_user_id: channelId,
      },
    },
    {
      type: 'channel.subscription.message',
      version: '1',
      condition: {
        broadcaster_user_id: channelId,
      },
    },
    {
      type: 'channel.subscription.gift',
      version: '1',
      condition: {
        broadcaster_user_id: channelId,
      },
    },
    {
      type: 'channel.raid',
      version: '1',
      condition: {
        to_broadcaster_user_id: channelId,
      },
    },
    {
      type: 'channel.cheer',
      version: '1',
      condition: {
        broadcaster_user_id: channelId,
      },
    },
    // Normal chat messages via webhook (no persistent IRC/WebSocket)
    {
      type: 'channel.chat.message',
      version: '1',
      condition: {
        broadcaster_user_id: channelId,
        user_id: channelId,
      },
    },
  ];
}

const REQUIRED_CHAT_SCOPES = ['user:read:chat', 'user:bot', 'channel:bot'] as const;

type ChatIngestStatus = 'online' | 'offline' | 'reconnecting' | 'erro';

function deriveChatIngestStatus(params: {
  configured: boolean;
  tokenValid: boolean;
  scopes: string[];
  chatSubscription: Record<string, unknown> | null;
}): ChatIngestStatus {
  if (!params.configured) return 'offline';
  if (!params.tokenValid) return 'erro';

  const missing = REQUIRED_CHAT_SCOPES.filter((s) => !params.scopes.includes(s));
  if (missing.length > 0) return 'erro';

  const status = String(params.chatSubscription?.status ?? '');
  if (!params.chatSubscription) return 'offline';
  if (status === 'enabled') return 'online';
  if (status === 'webhook_callback_verification_pending') return 'reconnecting';
  return 'erro';
}

function subscriptionExists(existing: Array<Record<string, unknown>>, type: string, condition: JsonRecord) {
  return existing.some((item) => {
    if (item.type !== type) {
      return false;
    }

    const currentCondition = (item.condition as JsonRecord | undefined) ?? {};
    return Object.entries(condition).every(([key, value]) => currentCondition[key] === value);
  });
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
    throw new Error(`Failed to get app access token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string };
  return { accessToken: data.access_token, clientId };
}

async function ensureEventSubSetup(supabase: ReturnType<typeof getAdminClient>) {
  const config = await getActiveTwitchConfig(supabase);
  if (!config) {
    throw new Error('No active twitch_config found');
  }

  // Validate user token to get channel info
  const { tokenInfo } = await getValidatedTokenWithRefresh(supabase, config);
  const channelId = config.channel_id || tokenInfo.user_id;

  if (config.channel_id !== channelId) {
    await updateTwitchConfigChannelId(supabase, config.id, channelId);
  }

  // Use app access token for EventSub webhook subscriptions (required by Twitch)
  const { accessToken: appToken, clientId } = await getAppAccessToken();

  const existing = await listSubscriptions(clientId, appToken);
  const required = buildRequiredSubscriptions(channelId);

  const created: string[] = [];
  for (const subscription of required) {
    if (subscriptionExists(existing, subscription.type, subscription.condition)) {
      continue;
    }

    await createSubscription(
      clientId,
      appToken,
      subscription.type,
      subscription.version,
      subscription.condition
    );
    created.push(subscription.type);
  }

  const chatSub =
    existing.find((item) => item.type === 'channel.chat.message') ??
    (created.includes('channel.chat.message')
      ? { type: 'channel.chat.message', status: 'webhook_callback_verification_pending' }
      : null);

  const afterCreate = created.length > 0 ? await listSubscriptions(clientId, appToken) : existing;
  const chatAfter =
    (afterCreate.find((item) => item.type === 'channel.chat.message') as Record<string, unknown> | undefined) ??
    null;

  const chatIngestStatus = deriveChatIngestStatus({
    configured: true,
    tokenValid: true,
    scopes: tokenInfo.scopes ?? [],
    chatSubscription: chatAfter ?? (chatSub as Record<string, unknown> | null),
  });

  console.log('[twitch-eventsub] setup done', {
    channel_id: channelId,
    created,
    existing_count: afterCreate.length,
    chat_ingest_status: chatIngestStatus,
  });

  return {
    configured: true,
    channel_name: config.channel_name,
    channel_id: channelId,
    callback_url: getCallbackUrl(),
    secret_configured: Boolean(Deno.env.get('TWITCH_EVENTSUB_SECRET')),
    token_expires_in: tokenInfo.expires_in,
    scopes: tokenInfo.scopes,
    created,
    existing_count: afterCreate.length,
    chat_ingest_status: chatIngestStatus,
    chat_subscription_status: chatAfter ? String(chatAfter.status ?? '') : null,
  };
}

async function insertChatMessageFromNotification(
  supabase: ReturnType<typeof getAdminClient>,
  event: Record<string, unknown>
) {
  const twitchMessageId = String(event.message_id ?? '').trim();
  if (!twitchMessageId) {
    console.warn('[twitch-eventsub] chat message missing message_id, skipped');
    return { inserted: false, reason: 'missing_message_id' };
  }

  const messageObj = (event.message as JsonRecord | undefined) ?? {};
  const text = String(messageObj.text ?? '').trim();
  if (!text) {
    console.warn('[twitch-eventsub] chat message empty text, skipped', { twitch_message_id: twitchMessageId });
    return { inserted: false, reason: 'empty_text' };
  }

  const badgesRaw = Array.isArray(event.badges) ? (event.badges as Array<Record<string, unknown>>) : [];
  const badgeSets = new Set(badgesRaw.map((b) => String(b.set_id ?? '')));

  const row = {
    twitch_message_id: twitchMessageId,
    username: String(event.chatter_user_login ?? 'unknown'),
    display_name: String(event.chatter_user_name ?? event.chatter_user_login ?? 'Unknown'),
    message: text,
    color: String(event.color || '#FFFFFF'),
    badges: badgesRaw,
    is_subscriber: badgeSets.has('subscriber') || badgeSets.has('founder'),
    is_moderator: badgeSets.has('moderator') || badgeSets.has('broadcaster'),
    is_vip: badgeSets.has('vip'),
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('twitch_chat_messages')
    .upsert(row, { onConflict: 'twitch_message_id', ignoreDuplicates: true });

  if (error) {
    console.error('[twitch-eventsub] chat insert failed', error.message);
    throw new Error(error.message);
  }

  console.log('[twitch-eventsub] chat insert ok', {
    twitch_message_id: twitchMessageId,
    username: row.username,
  });

  return { inserted: true, twitch_message_id: twitchMessageId };
}

async function insertAlertFromNotification(
  supabase: ReturnType<typeof getAdminClient>,
  messageId: string,
  eventType: string,
  event: Record<string, unknown>
) {
  let alert: JsonRecord | null = null;

  if (eventType === 'channel.follow') {
    alert = {
      event_id: `twitch_eventsub_${messageId}`,
      alert_type: 'follow',
      username: String(event.user_login ?? 'unknown'),
      display_name: String(event.user_name ?? event.user_login ?? 'Unknown'),
      amount: 0,
      months: 0,
      metadata: { source: 'twitch-eventsub', event_type: eventType },
    };
  }

  if (eventType === 'channel.subscribe') {
    alert = {
      event_id: `twitch_eventsub_${messageId}`,
      alert_type: 'subscription',
      username: String(event.user_login ?? 'unknown'),
      display_name: String(event.user_name ?? event.user_login ?? 'Unknown'),
      tier: String(event.tier ?? ''),
      amount: 0,
      months: 1,
      metadata: { source: 'twitch-eventsub', event_type: eventType },
    };
  }

  if (eventType === 'channel.subscription.message') {
    alert = {
      event_id: `twitch_eventsub_${messageId}`,
      alert_type: 'resubscription',
      username: String(event.user_login ?? 'unknown'),
      display_name: String(event.user_name ?? event.user_login ?? 'Unknown'),
      tier: String(event.tier ?? ''),
      message: String((event.message as JsonRecord | undefined)?.text ?? ''),
      amount: 0,
      months: Number(event.cumulative_months ?? 1),
      metadata: { source: 'twitch-eventsub', event_type: eventType },
    };
  }

  if (eventType === 'channel.subscription.gift') {
    alert = {
      event_id: `twitch_eventsub_${messageId}`,
      alert_type: 'gift_subscription',
      username: String(event.user_login ?? 'anonymous'),
      display_name: String(event.user_name ?? event.user_login ?? 'Anonymous'),
      tier: String(event.tier ?? ''),
      amount: Number(event.total ?? event.cumulative_total ?? 1),
      months: 0,
      message: null,
      metadata: {
        source: 'twitch-eventsub',
        event_type: eventType,
        is_anonymous: Boolean(event.is_anonymous),
        cumulative_total: event.cumulative_total ?? null,
      },
    };
  }

  if (eventType === 'channel.raid') {
    const viewers = Number(event.viewers ?? 0);
    alert = {
      event_id: `twitch_eventsub_${messageId}`,
      alert_type: 'raid',
      username: String(event.from_broadcaster_user_login ?? 'unknown'),
      display_name: String(event.from_broadcaster_user_name ?? event.from_broadcaster_user_login ?? 'Unknown'),
      amount: 0,
      months: 0,
      metadata: {
        source: 'twitch-eventsub',
        event_type: eventType,
        viewers,
      },
    };
  }

  if (eventType === 'channel.cheer') {
    alert = {
      event_id: `twitch_eventsub_${messageId}`,
      alert_type: 'cheer',
      username: String(event.user_login ?? 'anonymous'),
      display_name: String(event.user_name ?? event.user_login ?? 'Anonymous'),
      message: String(event.message ?? ''),
      amount: Number(event.bits ?? 0),
      months: 0,
      metadata: { source: 'twitch-eventsub', event_type: eventType },
    };
  }

  if (!alert) {
    return;
  }

  // Idempotency key = Twitch EventSub message id (event_id).
  // Requires UNIQUE(event_id) — not a partial unique index — so PostgREST
  // ON CONFLICT (event_id) DO NOTHING works for webhook retries.
  const eventId = String(alert.event_id ?? '').trim();
  if (!eventId) {
    console.warn('[twitch-eventsub] alert skipped: missing event_id', { eventType });
    return;
  }
  alert.event_id = eventId;

  const { error } = await supabase
    .from('twitch_alerts')
    .upsert(alert, { onConflict: 'event_id', ignoreDuplicates: true });

  if (error) {
    console.error('[twitch-eventsub] alert upsert failed', {
      eventType,
      event_id: eventId,
      message: error.message,
    });
    throw new Error(error.message);
  }

  console.log('[twitch-eventsub] alert upsert ok', {
    eventType,
    event_id: eventId,
    alert_type: alert.alert_type,
    username: alert.username,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const supabase = getAdminClient();

  try {
    const url = new URL(req.url);
    let bodyAction: string | null = null;
    if (req.method === 'POST') {
      try {
        const cloned = req.clone();
        const parsed = (await cloned.json()) as { action?: string };
        bodyAction = parsed.action ?? null;
      } catch {
        bodyAction = null;
      }
    }

    const action = url.searchParams.get('action') || bodyAction;

    if ((req.method === 'GET' || req.method === 'POST') && action === 'status') {
      const secretsConfigured = Boolean(
        Deno.env.get('TWITCH_CLIENT_ID') && Deno.env.get('TWITCH_CLIENT_SECRET')
      );
      const config = await getActiveTwitchConfig(supabase);
      if (!config) {
        return jsonResponse({
          configured: false,
          callback_url: getCallbackUrl(),
          client_secret_configured: secretsConfigured,
          eventsub_secret_configured: Boolean(Deno.env.get('TWITCH_EVENTSUB_SECRET')),
          chat_ingest_status: 'offline' as ChatIngestStatus,
          chat_subscription_status: null,
          missing_chat_scopes: [...REQUIRED_CHAT_SCOPES],
        });
      }

      const tokenInfo = await validateTwitchToken(config.access_token).catch(() => null);
      const scopes = tokenInfo?.scopes ?? [];
      let chatSubscription: Record<string, unknown> | null = null;
      let chatListError: string | null = null;

      try {
        const { accessToken: appToken, clientId } = await getAppAccessToken();
        const existing = await listSubscriptions(clientId, appToken);
        chatSubscription =
          (existing.find((item) => {
            if (item.type !== 'channel.chat.message') return false;
            const condition = (item.condition as JsonRecord | undefined) ?? {};
            const channelId = config.channel_id || tokenInfo?.user_id;
            return (
              condition.broadcaster_user_id === channelId && condition.user_id === channelId
            );
          }) as Record<string, unknown> | undefined) ?? null;
      } catch (e) {
        chatListError = e instanceof Error ? e.message : String(e);
        console.warn('[twitch-eventsub] status chat list failed:', chatListError);
      }

      const chatIngestStatus = deriveChatIngestStatus({
        configured: true,
        tokenValid: Boolean(tokenInfo),
        scopes,
        chatSubscription,
      });

      const missingChatScopes = REQUIRED_CHAT_SCOPES.filter((s) => !scopes.includes(s));

      return jsonResponse({
        configured: true,
        channel_name: config.channel_name,
        channel_id: config.channel_id,
        callback_url: getCallbackUrl(),
        token_valid: Boolean(tokenInfo),
        token_expires_in: tokenInfo?.expires_in ?? null,
        scopes,
        refresh_available: Boolean(config.refresh_token),
        client_secret_configured: secretsConfigured,
        eventsub_secret_configured: Boolean(Deno.env.get('TWITCH_EVENTSUB_SECRET')),
        chat_ingest_status: chatIngestStatus,
        chat_subscription_status: chatSubscription ? String(chatSubscription.status ?? '') : null,
        missing_chat_scopes: missingChatScopes,
        chat_list_error: chatListError,
      });
    }

    if (req.method === 'POST' && action === 'setup') {
      const result = await ensureEventSubSetup(supabase);
      return jsonResponse(result);
    }

    const rawBody = await req.text();
    const messageType = req.headers.get('Twitch-Eventsub-Message-Type') ?? '';

    if (!rawBody) {
      return jsonResponse({ error: 'Empty body' }, 400);
    }

    const shouldValidate = Boolean(req.headers.get('Twitch-Eventsub-Message-Id'));
    if (shouldValidate) {
      const valid = await isValidSignature(req, rawBody);
      if (!valid) {
        return jsonResponse({ error: 'Invalid Twitch signature' }, 403);
      }
    }

    const body = JSON.parse(rawBody) as TwitchEventSubNotification;

    if (messageType === 'webhook_callback_verification' && body.challenge) {
      return new Response(body.challenge, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    if (messageType === 'revocation') {
      console.warn('[twitch-eventsub] Subscription revoked:', {
        type: body.subscription?.type,
        status: body.subscription?.status,
        id: body.subscription?.id,
      });
      return jsonResponse({ success: true, revoked: true });
    }

    const eventType = body.subscription?.type ?? '';
    const event = body.event ?? {};
    const messageId = req.headers.get('Twitch-Eventsub-Message-Id') ?? crypto.randomUUID();

    if (eventType === 'channel.chat.message') {
      console.log('[twitch-eventsub] chat message received', {
        eventsub_message_id: messageId,
        twitch_message_id: event.message_id ?? null,
        chatter: event.chatter_user_login ?? null,
      });
      const result = await insertChatMessageFromNotification(supabase, event);
      return jsonResponse({ success: true, chat: result });
    }

    await insertAlertFromNotification(supabase, messageId, eventType, event);
    return jsonResponse({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[twitch-eventsub]', message);
    return jsonResponse({ error: message }, 500);
  }
});
