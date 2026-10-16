import { supabase } from './supabase';
import { resolveSlotImageUrl, SLOT_FALLBACK_IMAGE, TOP_SLOT_FALLBACK_IMAGE } from './slot-image';
import { loadChillBonusSlotMap } from './chill-bonus-slot';
import { chillBonusesSupportSlotIdentity } from './chill-bonus-persist';

/** Shape for historical max-multiplier ranking (Dashboard + Chat overlay). */
export interface TopSlotEntry {
  rank: number;
  slot_image: string | null;
  slot_name?: string | null;
  provider?: string | null;
  max_multiplier?: number | null;
  bet_amount?: number | null;
  win_amount?: number | null;
  /** Canonical Slot Database id when known. */
  slot_id?: string | null;
  /** True when ranked by name only (no slot_id). */
  ambiguous?: boolean;
}

export const TOP_SLOTS_LIMIT = 5;

export type TopSlotCandidate = {
  key: string;
  slot_id: string | null;
  slot_name: string;
  provider: string | null;
  slot_image: string | null;
  multiplier: number;
  bet_amount: number;
  win_amount: number;
  source: 'hunt' | 'chill';
  ambiguous?: boolean;
};

/** Visual-only empty Top 5: fallback thumbnails, no invented names or stats. */
export function createEmptyTopSlotsPlaceholders(count = TOP_SLOTS_LIMIT): TopSlotEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    slot_image: TOP_SLOT_FALLBACK_IMAGE,
    slot_name: null,
    provider: null,
    max_multiplier: null,
    bet_amount: null,
    win_amount: null,
  }));
}

export function isTopSlotFilled(slot: TopSlotEntry | null | undefined): boolean {
  return Boolean(slot?.slot_name && String(slot.slot_name).trim());
}

/** Individual multiplier = EARNING / BET (same semantic as Hunt opening). */
export function individualMultiplier(win: number, bet: number): number | null {
  if (!Number.isFinite(win) || !Number.isFinite(bet) || bet <= 0 || win <= 0) return null;
  return win / bet;
}

/**
 * Keep one row per slot key (prefer slot_id, else normalized name).
 * Highest individual multiplier wins; ties keep the first seen (stable).
 */
export function rankTopSlotsByMaxMultiplier(
  candidates: TopSlotCandidate[],
  limit = TOP_SLOTS_LIMIT,
): TopSlotEntry[] {
  const bestByKey = new Map<string, TopSlotCandidate>();

  for (const c of candidates) {
    if (!Number.isFinite(c.multiplier) || c.multiplier <= 0) continue;
    const prev = bestByKey.get(c.key);
    if (!prev || c.multiplier > prev.multiplier) {
      bestByKey.set(c.key, c);
    }
  }

  const ranked = [...bestByKey.values()].sort((a, b) => b.multiplier - a.multiplier).slice(0, limit);

  const entries: TopSlotEntry[] = ranked.map((c, index) => ({
    rank: index + 1,
    slot_id: c.slot_id,
    slot_name: c.slot_name,
    provider: c.provider,
    slot_image: c.slot_image || TOP_SLOT_FALLBACK_IMAGE,
    max_multiplier: c.multiplier,
    bet_amount: c.bet_amount,
    win_amount: c.win_amount,
    ambiguous: c.ambiguous,
  }));

  while (entries.length < limit) {
    entries.push({
      rank: entries.length + 1,
      slot_image: TOP_SLOT_FALLBACK_IMAGE,
      slot_name: null,
      provider: null,
      max_multiplier: null,
      bet_amount: null,
      win_amount: null,
    });
  }

  return entries;
}

type SlotRow = {
  id: string;
  name: string;
  provider: string | null;
  image_url?: string | null;
  image_storage_path?: string | null;
};

/**
 * Load TOP 5 from persisted Hunt/Opening payments + Chill wins.
 * No invented values — empty placeholders when no eligible payments.
 */
export async function fetchTopSlotsRanking(limit = TOP_SLOTS_LIMIT): Promise<TopSlotEntry[]> {
  const candidates: TopSlotCandidate[] = [];

  const { data: huntItems, error: huntError } = await supabase
    .from('bonus_hunt_items')
    .select(
      'slot_id, slot_name, slot_image_url, bet_amount, payment_amount, result_amount, multiplier, slots:slot_id(id, name, provider, image_url, image_storage_path)',
    )
    .or('payment_amount.gt.0,result_amount.gt.0');

  if (huntError) {
    console.error('[top-slots] hunt items error:', huntError);
  } else {
    for (const row of huntItems || []) {
      const bet = Number(row.bet_amount) || 0;
      const win = Number(row.payment_amount ?? row.result_amount) || 0;
      const multi =
        typeof row.multiplier === 'number' && row.multiplier > 0
          ? row.multiplier
          : individualMultiplier(win, bet);
      if (multi == null) continue;

      const slotJoin = Array.isArray(row.slots) ? row.slots[0] : row.slots;
      const slotId = (row.slot_id as string | null) || (slotJoin as SlotRow | null)?.id || null;
      const slotName =
        (slotJoin as SlotRow | null)?.name ||
        (typeof row.slot_name === 'string' ? row.slot_name.trim() : '') ||
        '';
      if (!slotName && !slotId) continue;

      const image = slotJoin
        ? resolveSlotImageUrl(slotJoin as SlotRow)
        : row.slot_image_url || SLOT_FALLBACK_IMAGE;

      candidates.push({
        key: slotId ? `id:${slotId}` : `name:${slotName.toLowerCase()}`,
        slot_id: slotId,
        slot_name: slotName || '—',
        provider: (slotJoin as SlotRow | null)?.provider ?? null,
        slot_image: image,
        multiplier: multi,
        bet_amount: bet,
        win_amount: win,
        source: 'hunt',
        ambiguous: !slotId,
      });
    }
  }

  const chillRows = await loadChillBonusRowsForTopSlots();
  if (chillRows) {
    /**
     * Identity priority:
     *  1. chill_bonuses.slot_id (+ optional slots join)
     *  2. chill_bonuses.slot_name with exact catalog match
     *  3. localStorage compatibility map (same-origin only)
     * Never invent attribution from chill_sessions.slot_name (may be overwritten).
     */
    const localSlotByBonusId = loadBrowserChillBonusSlotOverrides(chillRows);

    const chillNames = new Set<string>();
    const chillIds = new Set<string>();
    for (const row of chillRows) {
      if (typeof row.slot_id === 'string' && row.slot_id) chillIds.add(row.slot_id);
      const persistedName = typeof row.slot_name === 'string' ? row.slot_name.trim() : '';
      const localName = typeof row.id === 'string' ? localSlotByBonusId.get(row.id) : undefined;
      if (persistedName) chillNames.add(persistedName);
      else if (localName) chillNames.add(localName);
    }

    const nameToSlot = new Map<string, SlotRow>();
    const idToSlot = new Map<string, SlotRow>();

    if (chillNames.size > 0) {
      const { data: slots } = await supabase
        .from('slots')
        .select('id, name, provider, image_url, image_storage_path')
        .in('name', [...chillNames]);
      for (const s of slots || []) {
        nameToSlot.set(String(s.name).toLowerCase(), s as SlotRow);
        idToSlot.set(s.id, s as SlotRow);
      }
    }

    if (chillIds.size > 0) {
      const missing = [...chillIds].filter((id) => !idToSlot.has(id));
      if (missing.length > 0) {
        const { data: slots } = await supabase
          .from('slots')
          .select('id, name, provider, image_url, image_storage_path')
          .in('id', missing);
        for (const s of slots || []) {
          idToSlot.set(s.id, s as SlotRow);
          nameToSlot.set(String(s.name).toLowerCase(), s as SlotRow);
        }
      }
    }

    for (const row of chillRows) {
      const bet = Number(row.bet_amount) || 0;
      const win = Number(row.win_amount) || 0;
      const multi =
        typeof row.multiplier === 'number' && row.multiplier > 0
          ? row.multiplier
          : individualMultiplier(win, bet);
      if (multi == null) continue;

      const joinSlot = Array.isArray(row.slots) ? row.slots[0] : row.slots;
      const persistedId =
        (typeof row.slot_id === 'string' && row.slot_id) ||
        (joinSlot as SlotRow | null | undefined)?.id ||
        null;
      const persistedName =
        (joinSlot as SlotRow | null | undefined)?.name ||
        (typeof row.slot_name === 'string' ? row.slot_name.trim() : '') ||
        '';
      const localName = typeof row.id === 'string' ? localSlotByBonusId.get(row.id) : undefined;

      let slotId = persistedId;
      let slotName = persistedName || localName || '';
      let catalog: SlotRow | null =
        (slotId && idToSlot.get(slotId)) ||
        (slotName ? nameToSlot.get(slotName.toLowerCase()) || null : null) ||
        (joinSlot as SlotRow | null) ||
        null;

      if (catalog) {
        slotId = catalog.id;
        slotName = catalog.name;
      }

      // No proven identity → skip (do not use chill_sessions.slot_name).
      if (!slotId && !slotName) continue;
      if (!persistedId && !persistedName && !localName) continue;

      candidates.push({
        key: slotId ? `id:${slotId}` : `name:${slotName.toLowerCase()}`,
        slot_id: slotId,
        slot_name: slotName || '—',
        provider: catalog?.provider ?? null,
        slot_image: catalog ? resolveSlotImageUrl(catalog) : TOP_SLOT_FALLBACK_IMAGE,
        multiplier: multi,
        bet_amount: bet,
        win_amount: win,
        source: 'chill',
        ambiguous: !slotId,
      });
    }
  }

  if (candidates.length === 0) {
    return createEmptyTopSlotsPlaceholders(limit);
  }

  return rankTopSlotsByMaxMultiplier(candidates, limit);
}

type ChillTopSlotRow = {
  id?: string | null;
  session_id?: string | null;
  slot_id?: string | null;
  slot_name?: string | null;
  bet_amount?: number | null;
  win_amount?: number | null;
  multiplier?: number | null;
  slots?: SlotRow | SlotRow[] | null;
};

async function loadChillBonusRowsForTopSlots(): Promise<ChillTopSlotRow[] | null> {
  const withIdentity = await chillBonusesSupportSlotIdentity();

  if (withIdentity) {
    const { data, error } = await supabase
      .from('chill_bonuses')
      .select(
        'id, session_id, slot_id, slot_name, bet_amount, win_amount, multiplier, slots:slot_id(id, name, provider, image_url, image_storage_path)',
      )
      .gt('win_amount', 0);
    if (error) {
      console.error('[top-slots] chill bonuses (with identity) error:', error);
      return null;
    }
    return (data || []) as ChillTopSlotRow[];
  }

  const { data, error } = await supabase
    .from('chill_bonuses')
    .select('id, session_id, bet_amount, win_amount, multiplier')
    .gt('win_amount', 0);
  if (error) {
    console.error('[top-slots] chill bonuses error:', error);
    return null;
  }
  return (data || []) as ChillTopSlotRow[];
}

/** Collect bonus_id → slot_name from localStorage maps for known session ids. */
function loadBrowserChillBonusSlotOverrides(
  rows: Array<{ id?: string | null; session_id?: string | null }>,
): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof localStorage === 'undefined') return out;

  const sessionIds = new Set<string>();
  for (const row of rows) {
    if (typeof row.session_id === 'string' && row.session_id) sessionIds.add(row.session_id);
  }

  for (const sessionId of sessionIds) {
    const map = loadChillBonusSlotMap(sessionId);
    for (const [bonusId, slotName] of Object.entries(map)) {
      if (bonusId && slotName) out.set(bonusId, slotName);
    }
  }

  return out;
}
