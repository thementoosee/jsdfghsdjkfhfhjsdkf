/**
 * Per-bonus slot identity for CHILL history filtering + TOP 5 attribution.
 *
 * Priority (source of truth order):
 *  1. Persisted chill_bonuses.slot_id / slot_name (after approved migration)
 *  2. Compatibility localStorage map (written at SAVE; not deleted)
 *  3. No automatic chill_sessions.slot_name attribution (may have been overwritten)
 *
 * Session totals remain DB-trigger aggregates over all bonuses in the session.
 */

export type ChillBonusSlotMap = Record<string, string>;

export type ChillBonusSlotIdentity = {
  id: string;
  slot_id?: string | null;
  slot_name?: string | null;
};

const storagePrefix = 'chill-bonus-slots:v1:';

export function normalizeChillSlotKey(name: string | null | undefined): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function chillBonusSlotStorageKey(sessionId: string): string {
  return `${storagePrefix}${sessionId}`;
}

export function loadChillBonusSlotMap(sessionId: string): ChillBonusSlotMap {
  if (typeof localStorage === 'undefined' || !sessionId) return {};
  try {
    const raw = localStorage.getItem(chillBonusSlotStorageKey(sessionId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ChillBonusSlotMap = {};
    for (const [id, name] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof name === 'string' && name.trim()) out[id] = name.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function saveChillBonusSlotMap(sessionId: string, map: ChillBonusSlotMap): void {
  if (typeof localStorage === 'undefined' || !sessionId) return;
  try {
    localStorage.setItem(chillBonusSlotStorageKey(sessionId), JSON.stringify(map));
  } catch {
    // Quota / private mode — map stays in React state for the current visit.
  }
}

export function rememberChillBonusSlot(
  map: ChillBonusSlotMap,
  bonusId: string,
  slotName: string,
): ChillBonusSlotMap {
  const name = slotName.trim();
  if (!bonusId || !name) return map;
  return { ...map, [bonusId]: name };
}

export function forgetChillBonusSlot(map: ChillBonusSlotMap, bonusId: string): ChillBonusSlotMap {
  if (!map[bonusId]) return map;
  const next = { ...map };
  delete next[bonusId];
  return next;
}

export type ChillBonusIdentityKind = 'persisted_id' | 'persisted_name' | 'local_map' | 'none';

export function resolveChillBonusIdentity(
  bonus: ChillBonusSlotIdentity,
  localMap: ChillBonusSlotMap,
): { kind: ChillBonusIdentityKind; slot_id: string | null; slot_name: string | null } {
  const persistedId = typeof bonus.slot_id === 'string' && bonus.slot_id.trim() ? bonus.slot_id.trim() : null;
  const persistedName =
    typeof bonus.slot_name === 'string' && bonus.slot_name.trim() ? bonus.slot_name.trim() : null;

  if (persistedId || persistedName) {
    return {
      kind: persistedId ? 'persisted_id' : 'persisted_name',
      slot_id: persistedId,
      slot_name: persistedName,
    };
  }

  const mapped = localMap[bonus.id]?.trim() || null;
  if (mapped) {
    return { kind: 'local_map', slot_id: null, slot_name: mapped };
  }

  return { kind: 'none', slot_id: null, slot_name: null };
}

/**
 * Filter history to the selected slot using persisted identity first,
 * then localStorage compatibility map. Never uses chill_sessions.slot_name.
 */
export function filterChillBonusesBySlot<T extends ChillBonusSlotIdentity>(
  bonuses: T[],
  opts: {
    selectedSlotId?: string | null;
    selectedSlotName?: string | null;
    localMap?: ChillBonusSlotMap;
  },
): T[] {
  const selectedId = typeof opts.selectedSlotId === 'string' ? opts.selectedSlotId.trim() : '';
  const selectedKey = normalizeChillSlotKey(opts.selectedSlotName);
  if (!selectedId && !selectedKey) return [];

  const localMap = opts.localMap || {};

  return bonuses.filter((bonus) => {
    const identity = resolveChillBonusIdentity(bonus, localMap);
    if (identity.kind === 'none') return false;

    if (selectedId && identity.slot_id && identity.slot_id === selectedId) return true;
    if (selectedKey && normalizeChillSlotKey(identity.slot_name) === selectedKey) return true;
    return false;
  });
}

/** @deprecated Prefer filterChillBonusesBySlot with opts; kept for older call sites/tests. */
export function resolveChillBonusSlotName(
  bonusId: string,
  map: ChillBonusSlotMap,
  _sessionSlotName?: string | null,
  _allowSessionFallback = false,
): string | null {
  return map[bonusId]?.trim() || null;
}

/**
 * Historical triage helpers (no writes). Used for diagnostics / reports.
 * Safe candidate: exactly one bonus in the session AND exact catalog name match
 * for the *current* session.slot_name — still NOT auto-backfilled (session name
 * may already be wrong if the streamer switched slots).
 */
export type ChillHistoryTriageRow = {
  bonus_id: string;
  session_id: string;
  bonuses_in_session: number;
  session_slot_now: string;
  exact_catalog_match: boolean;
};

export function triageChillHistoryRow(row: ChillHistoryTriageRow): 'review_candidate' | 'ambiguous' {
  if (row.bonuses_in_session === 1 && row.exact_catalog_match && row.session_slot_now.trim()) {
    return 'review_candidate';
  }
  return 'ambiguous';
}
