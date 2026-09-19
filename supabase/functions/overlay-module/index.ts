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

function htmlOk(message: string, payload: Record<string, unknown>) {
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>OK</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1220;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0}
.card{padding:1.25rem 1.5rem;border:1px solid #334155;border-radius:12px;background:#111827;text-align:center}
.ok{color:#4ade80;font-weight:700;letter-spacing:.04em}</style></head>
<body><div class="card"><div class="ok">OK</div><p>${message}</p>
<pre style="text-align:left;font-size:12px;opacity:.8">${JSON.stringify(payload, null, 2)}</pre>
<script>setTimeout(()=>window.close(),800)</script></div></body></html>`;
  return new Response(body, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
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

    const wantsJson = url.searchParams.get('format') === 'json';
    const wantsHtml =
      !wantsJson &&
      ((req.headers.get('accept') || '').includes('text/html') || req.method === 'GET');

    if (wantsHtml) {
      // Stream Deck "Website" / Open URL → quick visual OK
      return htmlOk(
        next ? 'Second slot ON' : 'Second slot OFF',
        payload,
      );
    }

    return json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: 'internal_error', message }, 500);
  }
});
