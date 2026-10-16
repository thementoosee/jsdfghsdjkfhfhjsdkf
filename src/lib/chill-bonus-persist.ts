import { supabase } from './supabase';

/**
 * Feature probe for chill_bonuses.slot_id / slot_name.
 * Remote DB may not have the columns until the local migration is approved & applied.
 * Cache avoids repeated failing selects; resetChillBonusSlotColumnCache() for tests.
 */

let slotColumnsSupported: boolean | null = null;
let probeInflight: Promise<boolean> | null = null;

export function resetChillBonusSlotColumnCache(): void {
  slotColumnsSupported = null;
  probeInflight = null;
}

export function setChillBonusSlotColumnCacheForTests(value: boolean | null): void {
  slotColumnsSupported = value;
  probeInflight = null;
}

/** True when SELECT slot_id, slot_name succeeds (columns exist). */
export async function chillBonusesSupportSlotIdentity(): Promise<boolean> {
  if (slotColumnsSupported !== null) return slotColumnsSupported;
  if (probeInflight) return probeInflight;

  probeInflight = (async () => {
    const { error } = await supabase.from('chill_bonuses').select('slot_id, slot_name').limit(1);
    const ok = !error;
    slotColumnsSupported = ok;
    probeInflight = null;
    return ok;
  })();

  return probeInflight;
}

export type ChillBonusInsertBase = {
  session_id: string;
  bet_amount: number;
  win_amount: number;
  multiplier: number;
};

export type ChillBonusSlotFields = {
  slot_id?: string | null;
  slot_name?: string | null;
};

/**
 * Build insert payload. Slot fields are included only when columns are available
 * AND a non-empty slot_name is provided. Never invents catalog rows.
 */
export async function buildChillBonusInsertPayload(
  base: ChillBonusInsertBase,
  slot: { id?: string | null; name?: string | null } | null,
): Promise<ChillBonusInsertBase & ChillBonusSlotFields> {
  const payload: ChillBonusInsertBase & ChillBonusSlotFields = { ...base };
  const slotName = typeof slot?.name === 'string' ? slot.name.trim() : '';
  if (!slotName) return payload;

  const supported = await chillBonusesSupportSlotIdentity();
  if (!supported) return payload;

  payload.slot_name = slotName;
  if (typeof slot?.id === 'string' && slot.id.trim()) {
    payload.slot_id = slot.id.trim();
  }
  return payload;
}

/** Detect PostgREST / Postgres "column does not exist" style errors. */
export function isMissingSlotColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: string; code?: string; details?: string };
  const text = `${e.message || ''} ${e.details || ''}`.toLowerCase();
  return (
    e.code === 'PGRST204' ||
    e.code === '42703' ||
    (text.includes('slot_id') && text.includes('does not exist')) ||
    (text.includes('slot_name') && text.includes('does not exist')) ||
    (text.includes('column') && text.includes('slot_') && text.includes('schema cache'))
  );
}
