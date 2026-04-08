import { supabase } from './supabase';

export interface StreamElementsStatus {
  configured: boolean;
  channel_name: string | null;
  is_active: boolean;
  updated_at: string | null;
}

export interface StreamElementsSyncResult {
  processed: number;
  duplicates: number;
  skipped: number;
  error: string | null;
}

async function invoke(body: Record<string, unknown>, throwOnError = true) {
  const { data, error } = await supabase.functions.invoke('streamelements-socket', { body });
  if (error) throw error;
  if (throwOnError && (data as any)?.error) throw new Error(String((data as any).error));
  return (data ?? {}) as Record<string, unknown>;
}

export async function getStreamElementsStatus(): Promise<StreamElementsStatus> {
  try {
    const data = await invoke({ action: 'status' }, false);
    return {
      configured: !!data?.configured,
      channel_name: (data?.channel_name as string) ?? null,
      is_active: !!data?.is_active,
      updated_at: (data?.updated_at as string) ?? null,
    };
  } catch {
    return { configured: false, channel_name: null, is_active: false, updated_at: null };
  }
}

export async function saveStreamElementsConfig(payload: {
  jwtToken: string;
  accountId: string;
  channelName: string;
}): Promise<StreamElementsStatus> {
  const data = await invoke({ action: 'save', ...payload });
  return {
    configured: !!data?.configured,
    channel_name: (data?.channel_name as string) ?? null,
    is_active: !!data?.is_active,
    updated_at: (data?.updated_at as string) ?? null,
  };
}

export async function syncStreamElementsData(): Promise<StreamElementsSyncResult> {
  try {
    const data = await invoke({ action: 'sync' }, false);
    return {
      processed: Number(data?.processed ?? 0),
      duplicates: Number(data?.duplicates ?? 0),
      skipped: Number(data?.skipped ?? 0),
      error: (data?.error as string) ?? null,
    };
  } catch {
    return { processed: 0, duplicates: 0, skipped: 0, error: 'sync_failed' };
  }
}

export async function clearStreamElementsConfig(): Promise<void> {
  try {
    await invoke({ action: 'clear' }, false);
  } catch {
    // ignore
  }
}