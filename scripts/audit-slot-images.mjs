/**
 * Read-only image URL audit for slots catalog.
 * Does NOT mutate the database.
 *
 * Usage: node scripts/audit-slot-images.mjs [--limit=N] [--concurrency=8]
 *
 * Writes: scripts/reports/slot-images-audit-*.json (gitignored)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(root, 'scripts', 'reports');

const USER_AGENT =
  'OverlaysFeverImageAudit/1.0 (+https://ollo-pasidaojk.vercel.app; catalog health check; contact: ops)';
const TIMEOUT_MS = 10000;
const DEFAULT_CONCURRENCY = 8;
const HASH_SAMPLE = 40;
const SIZE_PROBE_BYTES = 65536;

function loadEnv() {
  const env = {};
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function parseArgs(argv) {
  const out = { limit: null, concurrency: DEFAULT_CONCURRENCY };
  for (const a of argv) {
    if (a.startsWith('--limit=')) out.limit = Number(a.slice(8));
    if (a.startsWith('--concurrency=')) out.concurrency = Number(a.slice(14));
  }
  return out;
}

function domainOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function extOf(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function classifyUrlStatic(url) {
  const reasons = [];
  if (!url || !String(url).trim()) return { ok: false, reasons: ['empty'] };
  const u = String(url).trim();
  if (u.startsWith('/')) reasons.push('relative');
  if (!/^https?:\/\//i.test(u)) reasons.push('non_http');
  if (/placeholder|default|fallback|no[-_]?image|missing|wVqLzwT_default/i.test(u)) {
    reasons.push('placeholderish');
  }
  if (/[?&](expires|signature|token|sig|X-Amz-|Policy|Signature)=/i.test(u)) {
    reasons.push('signed_or_temp_params');
  }
  try {
    // eslint-disable-next-line no-new
    new URL(u);
  } catch {
    reasons.push('invalid_url');
  }
  return { ok: reasons.length === 0, reasons };
}

async function fetchAllSlots(sb, limit) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    let q = sb
      .from('slots')
      .select('id,name,provider,image_url,image_storage_path,thumbnail_url,is_active')
      .order('name')
      .range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
    if (limit && rows.length >= limit) break;
  }
  return limit ? rows.slice(0, limit) : rows;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

async function probeUrl(url) {
  const result = {
    statusClass: 'desconhecida',
    httpStatus: null,
    finalUrl: null,
    redirected: false,
    contentType: null,
    contentLength: null,
    method: null,
    bytesSampled: 0,
    apparentlyTiny: false,
    error: null,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Prefer HEAD
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.8' },
    });
    result.method = 'HEAD';
    result.httpStatus = res.status;
    result.finalUrl = res.url;
    result.redirected = res.url !== url && res.redirected;
    result.contentType = res.headers.get('content-type');
    const cl = res.headers.get('content-length');
    if (cl) result.contentLength = Number(cl);

    // Some CDNs reject HEAD
    if (res.status === 405 || res.status === 403 || res.status === 501 || !res.ok) {
      const getRes = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/*,*/*;q=0.8',
          Range: `bytes=0-${SIZE_PROBE_BYTES - 1}`,
        },
      });
      result.method = getRes.headers.get('content-range') ? 'GET-range' : 'GET';
      result.httpStatus = getRes.status;
      result.finalUrl = getRes.url;
      result.redirected = getRes.redirected || getRes.url !== url;
      result.contentType = getRes.headers.get('content-type') || result.contentType;
      const buf = Buffer.from(await getRes.arrayBuffer());
      result.bytesSampled = buf.length;
      const cl2 = getRes.headers.get('content-length');
      if (cl2) result.contentLength = Number(cl2);
      // magic bytes
      if (buf.length >= 3) {
        const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
        const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e;
        const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
        const isWebp = buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF';
        const looksHtml = buf.toString('utf8', 0, Math.min(64, buf.length)).trimStart().startsWith('<');
        if (looksHtml) result.contentType = result.contentType || 'text/html';
        if (!result.contentType) {
          if (isJpeg) result.contentType = 'image/jpeg';
          else if (isPng) result.contentType = 'image/png';
          else if (isGif) result.contentType = 'image/gif';
          else if (isWebp) result.contentType = 'image/webp';
        }
      }
      if (result.bytesSampled > 0 && result.bytesSampled < 800 && !getRes.headers.get('content-range')) {
        result.apparentlyTiny = true;
      }
      if (result.contentLength != null && result.contentLength < 800) {
        result.apparentlyTiny = true;
      }
    } else {
      if (result.contentLength != null && result.contentLength < 800) {
        result.apparentlyTiny = true;
      }
    }

    const ct = (result.contentType || '').toLowerCase();
    const st = result.httpStatus;

    if (st === 404) result.statusClass = '404';
    else if (st === 403) result.statusClass = '403';
    else if (st === 401 || st === 407) result.statusClass = 'bloqueada';
    else if (st >= 300 && st < 400) result.statusClass = 'redirecionada';
    else if (st >= 200 && st < 300) {
      if (ct.includes('text/html') || ct.includes('application/json')) {
        result.statusClass = 'content-type inválido';
      } else if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream')) {
        result.statusClass = 'content-type inválido';
      } else if (result.apparentlyTiny) {
        result.statusClass = 'imagem demasiado pequena';
      } else if (result.redirected) {
        result.statusClass = 'redirecionada';
      } else {
        result.statusClass = 'disponível';
      }
    } else if (st >= 400) {
      result.statusClass = 'bloqueada';
    }
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'timeout' : String(e?.message || e);
    result.error = msg;
    result.statusClass = msg.includes('timeout') || msg === 'timeout' ? 'timeout' : 'desconhecida';
  } finally {
    clearTimeout(timer);
  }

  return result;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
      if (idx % 50 === 0) {
        process.stdout.write(`\rprobed ${idx + 1}/${items.length}`);
      }
      // polite delay between requests per worker
      await sleep(80);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  process.stdout.write('\n');
  return results;
}

async function hashSample(urls) {
  const out = [];
  for (const url of urls) {
    try {
      const res = await withTimeout(
        fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
          redirect: 'follow',
        }),
        TIMEOUT_MS
      );
      if (!res.ok) {
        out.push({ url, error: `HTTP ${res.status}` });
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const hash = createHash('sha256').update(buf).digest('hex');
      out.push({
        url,
        bytes: buf.length,
        sha256: hash,
        contentType: res.headers.get('content-type'),
      });
      await sleep(120);
    } catch (e) {
      out.push({ url, error: String(e.message || e) });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing Supabase URL/key');
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  console.log('Fetching slots…');
  const slots = await fetchAllSlots(sb, args.limit);
  console.log('Slots loaded', slots.length);

  const withUrl = slots.filter((s) => s.image_url && String(s.image_url).trim());
  const withoutUrl = slots.filter((s) => !s.image_url || !String(s.image_url).trim());

  const staticStats = {
    domains: {},
    extensions: {},
    relative: 0,
    nonHttp: 0,
    invalid: 0,
    placeholderish: 0,
    signedOrTemp: 0,
  };

  const urlToSlots = new Map();
  for (const s of withUrl) {
    const u = s.image_url.trim();
    const st = classifyUrlStatic(u);
    if (st.reasons.includes('relative')) staticStats.relative += 1;
    if (st.reasons.includes('non_http')) staticStats.nonHttp += 1;
    if (st.reasons.includes('invalid_url')) staticStats.invalid += 1;
    if (st.reasons.includes('placeholderish')) staticStats.placeholderish += 1;
    if (st.reasons.includes('signed_or_temp_params')) staticStats.signedOrTemp += 1;
    const d = domainOf(u) || '(invalid)';
    staticStats.domains[d] = (staticStats.domains[d] || 0) + 1;
    const ext = extOf(u) || '(none)';
    staticStats.extensions[ext] = (staticStats.extensions[ext] || 0) + 1;
    if (!urlToSlots.has(u)) urlToSlots.set(u, []);
    urlToSlots.get(u).push({ id: s.id, name: s.name, provider: s.provider });
  }

  const duplicateUrls = [...urlToSlots.entries()]
    .filter(([, arr]) => arr.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([u, arr]) => ({
      url: u,
      count: arr.length,
      slots: arr.slice(0, 8),
    }));

  // Unique URLs to probe (avoid hammering same URL N times)
  const uniqueUrls = [...urlToSlots.keys()];
  console.log('Unique URLs to probe', uniqueUrls.length, 'concurrency', args.concurrency);

  const probeResults = await mapPool(uniqueUrls, args.concurrency, async (u) => {
    const probe = await probeUrl(u);
    return { url: u, ...probe };
  });

  const byUrl = new Map(probeResults.map((p) => [p.url, p]));

  const statusCounts = {};
  const domainStatus = {};
  const brokenSlots = [];
  const availableSlots = [];
  const examples = {};

  for (const s of withUrl) {
    const u = s.image_url.trim();
    const p = byUrl.get(u);
    const cls = p?.statusClass || 'desconhecida';
    statusCounts[cls] = (statusCounts[cls] || 0) + 1;
    const d = domainOf(u) || '(invalid)';
    if (!domainStatus[d]) domainStatus[d] = {};
    domainStatus[d][cls] = (domainStatus[d][cls] || 0) + 1;

    if (!examples[cls]) examples[cls] = [];
    if (examples[cls].length < 5) {
      examples[cls].push({
        id: s.id,
        name: s.name,
        provider: s.provider,
        image_url: u,
        httpStatus: p?.httpStatus,
        contentType: p?.contentType,
        error: p?.error,
      });
    }

    if (cls === 'disponível' || cls === 'redirecionada') {
      availableSlots.push(s.id);
    } else {
      brokenSlots.push({
        id: s.id,
        name: s.name,
        provider: s.provider,
        image_url: u,
        status: cls,
        httpStatus: p?.httpStatus,
        contentType: p?.contentType,
        error: p?.error,
      });
    }
  }

  // Size estimate: sample available content-lengths
  const lengths = probeResults
    .filter((p) => p.contentLength && p.contentLength > 0 && p.statusClass === 'disponível')
    .map((p) => p.contentLength);
  lengths.sort((a, b) => a - b);
  const medianLen = lengths.length
    ? lengths[Math.floor(lengths.length / 2)]
    : 45000;
  const avgLen = lengths.length
    ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    : 50000;

  // Hash sample: mix of domains
  const sampleUrls = [];
  for (const domain of ['www.bigwinboard.com', 'mediumrare.imgix.net']) {
    const cand = probeResults.filter(
      (p) => domainOf(p.url) === domain && p.statusClass === 'disponível'
    );
    for (const c of cand.slice(0, Math.ceil(HASH_SAMPLE / 2))) {
      sampleUrls.push(c.url);
    }
  }
  console.log('Hashing sample', sampleUrls.length);
  const hashes = await hashSample(sampleUrls.slice(0, HASH_SAMPLE));
  const hashGroups = {};
  for (const h of hashes) {
    if (!h.sha256) continue;
    if (!hashGroups[h.sha256]) hashGroups[h.sha256] = [];
    hashGroups[h.sha256].push(h);
  }
  const duplicateHashes = Object.entries(hashGroups)
    .filter(([, arr]) => arr.length > 1)
    .map(([sha, arr]) => ({ sha256: sha, count: arr.length, urls: arr.map((x) => x.url) }));

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    totals: {
      slots: slots.length,
      withUrl: withUrl.length,
      withoutUrl: withoutUrl.length,
      withStoragePath: slots.filter((s) => s.image_storage_path).length,
      withThumbnail: slots.filter((s) => s.thumbnail_url).length,
      uniqueUrls: uniqueUrls.length,
      duplicateUrlGroups: duplicateUrls.length,
      slotsSharingUrl: duplicateUrls.reduce((s, d) => s + d.count, 0),
    },
    staticStats,
    httpStatusCounts: statusCounts,
    domainStatus,
    withoutUrlSlots: withoutUrl.map((s) => ({
      id: s.id,
      name: s.name,
      provider: s.provider,
    })),
    brokenCount: brokenSlots.length,
    brokenSample: brokenSlots.slice(0, 40),
    brokenAllIds: brokenSlots.map((b) => b.id),
    examplesByStatus: examples,
    duplicateUrlsTop: duplicateUrls.slice(0, 25),
    hashSample: {
      sampled: hashes.length,
      duplicateHashGroups: duplicateHashes,
      samples: hashes.slice(0, 20),
    },
    sizeEstimate: {
      samplesWithLength: lengths.length,
      medianBytes: medianLen,
      averageBytes: avgLen,
      minBytes: lengths[0] || null,
      maxBytes: lengths[lengths.length - 1] || null,
      // Storage plan: original webp ~0.6*jpeg + thumb ~15KB
      estimateOriginalWebpTotalMB: Math.round(
        ((withUrl.length * medianLen * 0.65) / (1024 * 1024)) * 10
      ) / 10,
      estimateWithThumbnailsMB: Math.round(
        ((withUrl.length * (medianLen * 0.65 + 15000)) / (1024 * 1024)) * 10
      ) / 10,
      note: 'Estimates from median Content-Length of available samples; WebP factor 0.65 heuristic.',
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = Date.now();
  const out = path.join(REPORT_DIR, `slot-images-audit-${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  // slim summary for canvas
  const slim = {
    generatedAt: report.generatedAt,
    totals: report.totals,
    domains: staticStats.domains,
    extensions: staticStats.extensions,
    httpStatusCounts: statusCounts,
    domainStatus,
    withoutUrl: report.withoutUrlSlots,
    brokenCount: report.brokenCount,
    brokenSample: report.brokenSample.slice(0, 15),
    examplesByStatus: examples,
    duplicateUrlsTop: report.duplicateUrlsTop.slice(0, 10),
    hashSample: report.hashSample,
    sizeEstimate: report.sizeEstimate,
  };
  fs.writeFileSync(
    path.join(REPORT_DIR, `slot-images-audit-summary-${stamp}.json`),
    JSON.stringify(slim, null, 2)
  );
  console.log(JSON.stringify({ out, summary: slim.totals, httpStatusCounts: statusCounts, sizeEstimate: report.sizeEstimate }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
