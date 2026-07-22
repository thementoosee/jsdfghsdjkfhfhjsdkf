import { supabase } from './supabase';

export type TwitchBadgeRef = {
  set_id: string;
  id: string;
  info?: string;
};

export type ResolvedTwitchBadge = {
  set_id: string;
  id: string;
  info?: string;
  title: string;
  image_url: string;
  source?: 'channel' | 'global';
};

type BadgeCatalogEntry = {
  set_id: string;
  id: string;
  title: string;
  image_url_1x: string;
  image_url_2x: string;
  image_url_4x: string;
  source?: 'channel' | 'global';
};

type BadgeCatalog = Record<string, BadgeCatalogEntry>;

const DEFAULT_BROADCASTER_ID = '134614582';
const MEMORY_TTL_MS = 30 * 60 * 1000; // 30 minutes client memory

let memoryCatalog: BadgeCatalog | null = null;
let memoryFetchedAt = 0;
let memoryBroadcasterId = DEFAULT_BROADCASTER_ID;
let inflight: Promise<BadgeCatalog> | null = null;
const warnedMissing = new Set<string>();

function badgeKey(setId: string, versionId: string) {
  return `${setId}:${versionId}`;
}

export async function loadTwitchBadgeCatalog(options?: {
  broadcasterId?: string;
  forceRefresh?: boolean;
}): Promise<BadgeCatalog> {
  const broadcasterId = options?.broadcasterId || DEFAULT_BROADCASTER_ID;
  const forceRefresh = Boolean(options?.forceRefresh);
  const memoryFresh =
    memoryCatalog &&
    memoryBroadcasterId === broadcasterId &&
    Date.now() - memoryFetchedAt < MEMORY_TTL_MS;

  if (memoryFresh && !forceRefresh && memoryCatalog) {
    return memoryCatalog;
  }

  if (inflight && !forceRefresh) {
    return inflight;
  }

  inflight = (async () => {
    const { data, error } = await supabase.functions.invoke('twitch-badges', {
      body: {
        broadcaster_id: broadcasterId,
        refresh: forceRefresh,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    const payload = data as {
      ok?: boolean;
      error?: string;
      badges?: BadgeCatalog;
      broadcaster_id?: string;
    };

    if (!payload?.ok || !payload.badges) {
      throw new Error(payload?.error || 'Failed to load Twitch badge catalog');
    }

    memoryCatalog = payload.badges;
    memoryFetchedAt = Date.now();
    memoryBroadcasterId = payload.broadcaster_id || broadcasterId;
    return memoryCatalog;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function resolveTwitchBadges(
  badges: TwitchBadgeRef[] | null | undefined,
  catalog: BadgeCatalog | null
): ResolvedTwitchBadge[] {
  if (!badges?.length || !catalog) return [];

  const resolved: ResolvedTwitchBadge[] = [];

  for (const badge of badges) {
    const setId = String(badge.set_id || '').trim();
    const versionId = String(badge.id || '').trim();
    if (!setId || !versionId) continue;

    const key = badgeKey(setId, versionId);
    const entry = catalog[key];

    if (!entry?.image_url_2x && !entry?.image_url_4x && !entry?.image_url_1x) {
      if (!warnedMissing.has(key)) {
        warnedMissing.add(key);
        console.warn('[twitch-badges] unresolved badge (hidden until cache refresh):', key);
        void loadTwitchBadgeCatalog({ forceRefresh: true }).catch((err) => {
          console.warn('[twitch-badges] cache refresh failed:', err);
        });
      }
      continue;
    }

    resolved.push({
      set_id: setId,
      id: versionId,
      info: badge.info,
      title: entry.title || setId,
      image_url: entry.image_url_2x || entry.image_url_4x || entry.image_url_1x,
      source: entry.source,
    });
  }

  return resolved;
}

export function normalizeBadgeList(raw: unknown): TwitchBadgeRef[] {
  if (!Array.isArray(raw)) return [];
  const out: TwitchBadgeRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const setId = String(row.set_id ?? '').trim();
    const id = String(row.id ?? '').trim();
    if (!setId || !id) continue;
    out.push({
      set_id: setId,
      id,
      info: row.info != null ? String(row.info) : undefined,
    });
  }
  return out;
}
