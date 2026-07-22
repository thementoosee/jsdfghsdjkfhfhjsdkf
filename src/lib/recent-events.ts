export type EventSource = 'twitch' | 'streamelements';

export type CanonicalEventType =
  | 'follow'
  | 'subscription'
  | 'resubscription'
  | 'gift_subscription'
  | 'raid'
  | 'cheer'
  | 'tip';

export interface NormalizedRecentEvent {
  id: string;
  source: EventSource;
  type: CanonicalEventType;
  username: string;
  display_name: string;
  amount: number;
  currency: string | null;
  months: number;
  viewers: number;
  tier: string | null;
  message: string | null;
  created_at: string;
  event_id: string | null;
}

const TWITCH_NATIVE_TYPES = new Set([
  'follow',
  'subscription',
  'resubscription',
  'gift_subscription',
  'raid',
  'cheer',
]);

const SE_ALLOWED_TYPES = new Set(['tip']);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function canonicalizeTwitchAlertType(raw: string | null | undefined): CanonicalEventType | null {
  const t = (raw || '').toLowerCase();
  if (t === 'follow' || t === 'follower') return 'follow';
  if (t === 'subscription' || t === 'subscriber' || t === 'sub') return 'subscription';
  if (t === 'resubscription' || t === 'resub') return 'resubscription';
  if (t === 'gift_subscription' || t === 'subgift' || t === 'gift') return 'gift_subscription';
  if (t === 'raid') return 'raid';
  if (t === 'cheer' || t === 'bits') return 'cheer';
  return null;
}

export function canonicalizeStreamElementsType(raw: string | null | undefined): CanonicalEventType | null {
  const t = (raw || '').toLowerCase();
  if (t === 'tip' || t.includes('donat')) return 'tip';
  // Explicitly ignore Twitch-native duplicates from SE
  if (
    t.includes('follow') ||
    t.includes('sub') ||
    t.includes('raid') ||
    t.includes('cheer') ||
    t.includes('bit') ||
    t.includes('host')
  ) {
    return null;
  }
  return null;
}

export function normalizeTwitchAlert(row: Record<string, unknown>): NormalizedRecentEvent | null {
  const type = canonicalizeTwitchAlertType(String(row.alert_type || ''));
  if (!type || !TWITCH_NATIVE_TYPES.has(type)) return null;

  const metadata = asRecord(row.metadata);
  const viewersFromMeta = Number(metadata.viewers ?? 0);
  const amountRaw = Number(row.amount || 0);
  const viewers = type === 'raid' ? (viewersFromMeta || amountRaw || 0) : 0;
  const amount = type === 'raid' ? 0 : amountRaw;

  return {
    id: `tw_${row.id}`,
    source: 'twitch',
    type,
    username: String(row.username || 'unknown'),
    display_name: String(row.display_name || row.username || 'Unknown'),
    amount,
    currency: null,
    months: Number(row.months || 0),
    viewers,
    tier: row.tier != null ? String(row.tier) : null,
    message: row.message != null ? String(row.message) : null,
    created_at: String(row.created_at || new Date().toISOString()),
    event_id: row.event_id != null ? String(row.event_id) : null,
  };
}

export function normalizeStreamElementsEvent(row: Record<string, unknown>): NormalizedRecentEvent | null {
  const type = canonicalizeStreamElementsType(String(row.event_type || ''));
  if (!type || !SE_ALLOWED_TYPES.has(type)) return null;

  const raw = asRecord(row.raw_data);
  const data = asRecord(raw.data);
  const currency =
    (data.currency != null && String(data.currency)) ||
    (raw.currency != null && String(raw.currency)) ||
    null;

  return {
    id: `se_${row.id}`,
    source: 'streamelements',
    type,
    username: String(row.username || 'unknown'),
    display_name: String(row.display_name || row.username || 'Unknown'),
    amount: Number(row.amount || 0),
    currency,
    months: Number(row.months || 0),
    viewers: 0,
    tier: row.tier != null ? String(row.tier) : null,
    message: row.message != null ? String(row.message) : null,
    created_at: String(row.created_at || new Date().toISOString()),
    event_id: row.event_id != null ? String(row.event_id) : null,
  };
}

function minuteBucket(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  return String(Math.floor(t / 60000));
}

function crossSourceFallbackKey(event: NormalizedRecentEvent) {
  const quantity = event.type === 'raid' ? event.viewers : event.amount;
  return [
    event.type,
    event.username.toLowerCase(),
    quantity,
    event.months,
    minuteBucket(event.created_at),
  ].join('|');
}

/** Max events shown in the overlay "Recent Events" panel (combined list). */
export const RECENT_EVENTS_LIMIT = 3;

/** Merge Twitch + SE tips, newest first, with safe dedupe. */
export function mergeRecentEvents(
  twitchRows: Record<string, unknown>[],
  seRows: Record<string, unknown>[],
  limit = RECENT_EVENTS_LIMIT
): NormalizedRecentEvent[] {
  const normalized = [
    ...twitchRows.map(normalizeTwitchAlert),
    ...seRows.map(normalizeStreamElementsEvent),
  ]
    .filter((e): e is NormalizedRecentEvent => Boolean(e))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const seenEventIds = new Set<string>();
  const seenCross = new Set<string>();
  const out: NormalizedRecentEvent[] = [];

  for (const event of normalized) {
    if (event.event_id) {
      const scoped = `${event.source}:${event.event_id}`;
      if (seenEventIds.has(scoped) || seenEventIds.has(event.event_id)) continue;
      seenEventIds.add(scoped);
      seenEventIds.add(event.event_id);
    }

    const cross = crossSourceFallbackKey(event);
    if (seenCross.has(cross)) continue;
    seenCross.add(cross);

    out.push(event);
    if (out.length >= limit) break;
  }

  return out;
}

export function recentEventLabel(event: NormalizedRecentEvent): string {
  switch (event.type) {
    case 'follow':
      return 'New Follower';
    case 'subscription':
      return 'New Sub';
    case 'resubscription':
      return event.months > 1 ? `Resub (${event.months}mo)` : 'Resub';
    case 'gift_subscription':
      return 'Gift Sub';
    case 'raid':
      return `Raid (${event.viewers || 0})`;
    case 'cheer':
      return `${event.amount} Bits`;
    case 'tip':
      return event.currency ? `Tip ${event.amount} ${event.currency}` : `Tip ${event.amount}`;
    default:
      return event.type;
  }
}
