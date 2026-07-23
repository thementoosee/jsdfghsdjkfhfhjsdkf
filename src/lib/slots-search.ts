import { supabase } from './supabase';

export type SlotSearchResult = {
  id: string;
  name: string;
  provider: string;
  image_url: string | null;
  aliases?: string[] | null;
  is_active?: boolean;
  max_win?: number;
  volatility?: string;
  rtp?: number;
  slug?: string | null;
  rank_score?: number;
};

export const SLOT_FALLBACK_IMAGE = '/slot-fallback.svg';
export const SLOT_SEARCH_LIMIT = 20;
export const SLOT_SEARCH_DEBOUNCE_MS = 300;

export async function searchSlotsCatalog(
  query: string,
  limit = SLOT_SEARCH_LIMIT
): Promise<SlotSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const { data, error } = await supabase.rpc('search_slots', {
    q,
    lim: limit,
  });

  if (error) {
    console.error('[slots-search] search_slots failed:', error);
    throw error;
  }

  return (data || []) as SlotSearchResult[];
}

export async function getSlotProviders(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_slot_providers');
  if (error) {
    console.error('[slots-search] get_slot_providers failed:', error);
    throw error;
  }
  return ((data || []) as { provider: string }[]).map((row) => row.provider).filter(Boolean);
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
