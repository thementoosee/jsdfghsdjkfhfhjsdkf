// streamelements-sync-scheduler — background task to sync SE events every 30 seconds
import { createClient } from 'npm:@supabase/supabase-js@2';

interface SyncResult {
  processed: number;
  duplicates: number;
  skipped: number;
  error: string | null;
}

async function triggerSync(): Promise<SyncResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    return { processed: 0, duplicates: 0, skipped: 0, error: 'Missing Supabase config' };
  }

  try {
    const syncUrl = `${supabaseUrl}/functions/v1/streamelements-socket?action=sync`;
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const text = await response.text();
      return { processed: 0, duplicates: 0, skipped: 0, error: `HTTP ${response.status}: ${text}` };
    }

    return await response.json() as SyncResult;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[streamelements-sync-scheduler]', msg);
    return { processed: 0, duplicates: 0, skipped: 0, error: msg };
  }
}

Deno.serve(async (req: Request) => {
  // Allow GET for manual trigger
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const result = await triggerSync();

  console.log('[streamelements-sync-scheduler]', {
    timestamp: new Date().toISOString(),
    ...result,
  });

  return new Response(JSON.stringify(result), {
    status: result.error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
