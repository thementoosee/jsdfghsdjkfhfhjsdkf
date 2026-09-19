// overlay-module — Stream Deck / HTTP triggers to show|hide|toggle main overlay modules
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SECOND_SLOT_CONFIG_KEY = 'showSecondSlot';

type Action = 'show' | 'hide' | 'toggle';
type ModuleName = 'second_slot';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Silent response for Stream Deck Website / Open URL (no OK page). */
function silentOk() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

function getAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

function parsePath(pathname: string): { module: ModuleName | null; action: Action | null } {
  // /overlay-module/second_slot/hide  or  /functions/v1/overlay-module/second_slot/hide
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.findIndex((p) => p === 'overlay-module');
  const slice = idx >= 0 ? parts.slice(idx + 1) : parts;
  const module = (slice[0] as ModuleName) || null;
  const action = (slice[1] as Action) || null;
  return { module, action };
}

function normalizeAction(raw: string | null): Action | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === 'show' || v === 'start' || v === 'on' || v === '1' || v === 'true') return 'show';
  if (v === 'hide' || v === 'stop' || v === 'off' || v === '0' || v === 'false') return 'hide';
  if (v === 'toggle') return 'toggle';
  return null;
}

function normalizeModule(raw: string | null): ModuleName | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === 'second_slot' || v === 'second-slot' || v === 'slot2' || v === 'pip') return 'second_slot';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  try {
    const url = new URL(req.url);
    const pathParsed = parsePath(url.pathname);

    let moduleName = normalizeModule(pathParsed.module || url.searchParams.get('module'));
    let action = normalizeAction(pathParsed.action || url.searchParams.get('action'));

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (!moduleName) moduleName = normalizeModule(body?.module ?? null);
        if (!action) action = normalizeAction(body?.action ?? null);
      } catch {
        // ignore empty/non-json body
      }
    }

    if (!moduleName) {
      return json({
        error: 'unknown_module',
        hint: 'Use module=second_slot or /overlay-module/second_slot/{show|hide|toggle}',
      }, 400);
    }
    if (!action) {
      return json({
        error: 'unknown_action',
        hint: 'Use action=show|hide|toggle (aliases: start/stop, on/off)',
      }, 400);
    }

    const sb = getAdmin();
    const { data: row, error: loadError } = await sb
      .from('overlays')
      .select('id, config')
      .eq('type', 'main_stream')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!row) return json({ error: 'main_stream_not_found' }, 404);

    const config = (row.config || {}) as Record<string, unknown>;
    const current =
      config[SECOND_SLOT_CONFIG_KEY] === undefined
        ? true
        : Boolean(config[SECOND_SLOT_CONFIG_KEY]);

    let next = current;
    if (moduleName === 'second_slot') {
      if (action === 'show') next = true;
      else if (action === 'hide') next = false;
      else next = !current;
    }

    const nextConfig = { ...config, [SECOND_SLOT_CONFIG_KEY]: next };
    const { error: updateError } = await sb
      .from('overlays')
      .update({
        config: nextConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (updateError) throw new Error(updateError.message);

    const payload = {
      ok: true,
      module: moduleName,
      action,
      showSecondSlot: next,
      previous: current,
    };

    const format = (url.searchParams.get('format') || '').toLowerCase();
    if (format === 'json') return json(payload);
    if (format === 'html') {
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>OK</title><body style="font-family:system-ui;background:#0b1220;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0"><p>Second slot ${next ? 'ON' : 'OFF'}</p></body>`,
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    // Default: silent 204 so Stream Deck Website / API Request don't show a page body.
    return silentOk();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: 'internal_error', message }, 500);
  }
});
