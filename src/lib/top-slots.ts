import { SLOT_FALLBACK_IMAGE } from './slot-image';

/** Shape prepared for future historical max-multiplier ranking. */
export interface TopSlotEntry {
  rank: number;
  slot_image: string | null;
  slot_name?: string | null;
  provider?: string | null;
  /** Future: highest historical multiplier for this slot. */
  max_multiplier?: number | null;
  bet_amount?: number | null;
  win_amount?: number | null;
}

export const TOP_SLOTS_LIMIT = 5;

/** Visual-only empty Top 5: fallback thumbnails, no invented names or stats. */
export function createEmptyTopSlotsPlaceholders(count = TOP_SLOTS_LIMIT): TopSlotEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    slot_image: SLOT_FALLBACK_IMAGE,
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
