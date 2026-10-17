/**
 * Resolve Twitch profile images via Helix Get Users (by twitch_user_id).
 * Cache is per-isolate — avoids repeated Helix calls during chat bursts.
 */

export const TWITCH_DEFAULT_AVATAR_URL =
  'https://static-cdn.jtvnw.net/user-default-pictures-uv/13e5fa74-defa-11e9-809c-784f43822e80-profile_image-70x70.png';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const avatarCache = new Map<string, { url: string; at: number }>();

export function isMissingOrGenericAvatar(url: string | null | undefined): boolean {
  const u = (url ?? '').trim();
  if (!u) return true;
  if (u === TWITCH_DEFAULT_AVATAR_URL) return true;
  if (/user-default-pictures/i.test(u)) return true;
  return false;
}

async function getAppAccessToken(): Promise<{ accessToken: string; clientId: string }> {
  const clientId = Deno.env.get('TWITCH_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('TWITCH_CLIENT_SECRET') ?? '';
  if (!clientId || !clientSecret) {
    throw new Error('twitch_client_not_configured');
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
    throw new Error(`twitch_app_token_failed:${response.status}`);
  }
  const data = (await response.json()) as { access_token: string };
  return { accessToken: data.access_token, clientId };
}

/** Batch Helix users (max 100 ids per request). Returns map twitchUserId → profile_image_url. */
export async function fetchTwitchProfileImagesByIds(
  twitchUserIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(twitchUserIds.map((id) => String(id).trim()).filter(Boolean))];
  if (unique.length === 0) return out;

  const now = Date.now();
  const missing: string[] = [];
  for (const id of unique) {
    const cached = avatarCache.get(id);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      out.set(id, cached.url);
    } else {
      missing.push(id);
    }
  }
  if (missing.length === 0) return out;

  const { accessToken, clientId } = await getAppAccessToken();

  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const qs = chunk.map((id) => `id=${encodeURIComponent(id)}`).join('&');
    const response = await fetch(`https://api.twitch.tv/helix/users?${qs}`, {
      headers: {
        'Client-Id': clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      console.error('[bt-twitch-avatars] helix users failed', response.status);
      for (const id of chunk) {
        if (!out.has(id)) out.set(id, TWITCH_DEFAULT_AVATAR_URL);
      }
      continue;
    }
    const body = (await response.json()) as {
      data?: Array<{ id?: string; profile_image_url?: string }>;
    };
    const found = new Set<string>();
    for (const user of body.data ?? []) {
      const id = String(user.id ?? '');
      if (!id) continue;
      const url = String(user.profile_image_url ?? '').trim() || TWITCH_DEFAULT_AVATAR_URL;
      avatarCache.set(id, { url, at: Date.now() });
      out.set(id, url);
      found.add(id);
    }
    for (const id of chunk) {
      if (!found.has(id)) {
        avatarCache.set(id, { url: TWITCH_DEFAULT_AVATAR_URL, at: Date.now() });
        out.set(id, TWITCH_DEFAULT_AVATAR_URL);
      }
    }
  }

  return out;
}

export async function resolveTwitchProfileImage(twitchUserId: string): Promise<string> {
  const map = await fetchTwitchProfileImagesByIds([twitchUserId]);
  return map.get(twitchUserId) ?? TWITCH_DEFAULT_AVATAR_URL;
}
