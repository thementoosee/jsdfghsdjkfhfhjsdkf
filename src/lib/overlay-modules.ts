import { supabase } from './supabase';

/** Config key on overlays.type = main_stream */
export const SECOND_SLOT_CONFIG_KEY = 'showSecondSlot';

export type OverlayModuleAction = 'show' | 'hide' | 'toggle';

export function parseShowSecondSlot(config: Record<string, unknown> | null | undefined): boolean {
  if (!config || config[SECOND_SLOT_CONFIG_KEY] === undefined) return true;
  return Boolean(config[SECOND_SLOT_CONFIG_KEY]);
}

export function getOverlayModuleBaseUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return '';
  return `${base.replace(/\/$/, '')}/functions/v1/overlay-module`;
}

/** Stream Deck friendly URLs (GET). Include anon key so Website actions work without custom headers. */
export function getOverlayModuleDeckUrl(module: 'second_slot', action: OverlayModuleAction): string {
  const base = getOverlayModuleBaseUrl();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const url = new URL(`${base}/${module}/${action}`);
  if (anon) url.searchParams.set('apikey', anon);
  return url.toString();
}

export async function loadMainStreamOverlay() {
  const { data, error } = await supabase
    .from('overlays')
    .select('id, config, updated_at')
    .eq('type', 'main_stream')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; config: Record<string, unknown>; updated_at: string } | null;
}

export async function setSecondSlotVisible(visible: boolean) {
  const row = await loadMainStreamOverlay();
  if (!row) throw new Error('main_stream overlay not found');

  const nextConfig = {
    ...(row.config || {}),
    [SECOND_SLOT_CONFIG_KEY]: visible,
  };

  const { data, error } = await supabase
    .from('overlays')
    .update({
      config: nextConfig,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .select('id, config')
    .single();

  if (error) throw error;
  return data as { id: string; config: Record<string, unknown> };
}
