/**
 * Admin script: migrate slot images to Supabase Storage (single optimized WebP).
 *
 * NEVER run from the frontend. Uses service role only in this Node process.
 * Do not log secrets.
 *
 * Examples:
 *   node scripts/migrate-slot-images.mjs --dry-run --pilot --concurrency=2
 *   node scripts/migrate-slot-images.mjs --dry-run --limit=40 --only-not-migrated
 *   node scripts/migrate-slot-images.mjs --provider="Pragmatic Play" --limit=20 --checkpoint=./scripts/reports/img-ckpt.json
 *   node scripts/migrate-slot-images.mjs --resume --checkpoint=./scripts/reports/img-ckpt.json
 *
 * Path layout: providers/{provider_slug}/{slot_slug}.webp
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(root, 'scripts', 'reports');
const PILOT_IDS_PATH = path.join(root, 'scripts', 'pilot-slot-image-ids.json');

const BUCKET = 'slot-images';
const USER_AGENT =
  'OverlaysFeverImageMigrate/1.0 (+https://ollo-pasidaojk.vercel.app; admin catalog migration)';
const TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;
const DEFAULT_CONCURRENCY = 2;
const MAX_EDGE = 512;
const WEBP_QUALITY = 78;
const TARGET_MAX_BYTES = 200 * 1024;
const MIN_EDGE = 48;
const MIN_BYTES = 1500;
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const MAX_RETRIES = 3;

const IMAGE_STATUSES = new Set([
  'pending',
  'available_external',
  'migrated',
  'missing',
  'invalid',
  'blocked',
  'failed',
  'review_required',
]);

function loadEnv() {
  const env = { ...process.env };
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!(k in env) || env[k] === undefined || env[k] === '') env[k] = v;
  }
  return env;
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    provider: null,
    limit: null,
    onlyMissing: false,
    onlyNotMigrated: false,
    reprocess: false,
    concurrency: DEFAULT_CONCURRENCY,
    checkpoint: null,
    resume: false,
    pilot: false,
    idsFile: null,
    maxEdge: MAX_EDGE,
    webpQuality: WEBP_QUALITY,
    maxBytes: TARGET_MAX_BYTES,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--only-missing') out.onlyMissing = true;
    else if (a === '--only-not-migrated') out.onlyNotMigrated = true;
    else if (a === '--reprocess') out.reprocess = true;
    else if (a === '--resume') out.resume = true;
    else if (a === '--pilot') out.pilot = true;
    else if (a.startsWith('--provider=')) out.provider = a.slice(11);
    else if (a.startsWith('--limit=')) out.limit = Number(a.slice(8));
    else if (a.startsWith('--concurrency=')) out.concurrency = Number(a.slice(14));
    else if (a.startsWith('--checkpoint=')) out.checkpoint = a.slice(13);
    else if (a.startsWith('--ids-file=')) out.idsFile = a.slice(11);
    else if (a.startsWith('--max-edge=')) out.maxEdge = Number(a.slice(11));
    else if (a.startsWith('--webp-quality=')) out.webpQuality = Number(a.slice(15));
    else if (a.startsWith('--max-bytes=')) out.maxBytes = Number(a.slice(12));
  }
  return out;
}

function sleep(ms) {
  return Promise.resolve().then(
    () => new Promise((r) => setTimeout(r, ms))
  );
}

function toSlug(text) {
  return (
    String(text || 'unknown')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[''`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

function domainOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function storagePathFor(slot) {
  const providerSlug = toSlug(slot.provider_key || slot.provider);
  const slotSlug = toSlug(slot.slug || `${slot.name}-${slot.provider}`);
  return `providers/${providerSlug}/${slotSlug}.webp`;
}

function magicKind(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

function looksLikeHtml(buf) {
  const head = buf.toString('utf8', 0, Math.min(80, buf.length)).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<');
}

async function fetchWithRedirects(url, { method = 'GET', maxRedirects = MAX_REDIRECTS } = {}) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/*,*/*;q=0.8',
        },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error(`redirect without location (${res.status})`);
        current = new URL(loc, current).toString();
        continue;
      }
      return { res, finalUrl: current };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('too many redirects');
}

async function downloadImage(url) {
  const { res, finalUrl } = await fetchWithRedirects(url);
  const status = res.status;
  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  if (status === 404) {
    return { ok: false, statusClass: 'missing', httpStatus: status, error: '404' };
  }
  if (status === 401 || status === 403 || status === 407) {
    return { ok: false, statusClass: 'blocked', httpStatus: status, error: `HTTP ${status}` };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, statusClass: 'failed', httpStatus: status, error: `HTTP ${status}` };
  }

  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_DOWNLOAD_BYTES) {
    return {
      ok: false,
      statusClass: 'invalid',
      httpStatus: status,
      error: 'download too large',
    };
  }
  const buf = Buffer.from(ab);
  if (buf.length < MIN_BYTES) {
    return {
      ok: false,
      statusClass: 'invalid',
      httpStatus: status,
      error: 'file too small',
      bytes: buf.length,
      finalUrl,
      contentType,
    };
  }
  if (looksLikeHtml(buf) || contentType.includes('text/html')) {
    return {
      ok: false,
      statusClass: 'invalid',
      httpStatus: status,
      error: 'html response',
      finalUrl,
      contentType,
    };
  }
  const kind = magicKind(buf);
  if (!kind) {
    return {
      ok: false,
      statusClass: 'invalid',
      httpStatus: status,
      error: 'unrecognized image magic',
      finalUrl,
      contentType,
    };
  }
  if (
    contentType &&
    !contentType.startsWith('image/') &&
    !contentType.includes('octet-stream')
  ) {
    return {
      ok: false,
      statusClass: 'invalid',
      httpStatus: status,
      error: `bad content-type ${contentType}`,
      finalUrl,
      contentType,
    };
  }

  return {
    ok: true,
    buf,
    bytes: buf.length,
    kind,
    contentType: contentType || `image/${kind}`,
    httpStatus: status,
    finalUrl,
    redirected: finalUrl !== url,
  };
}

async function convertToWebp(buf, { maxEdge, quality, maxBytes }) {
  const meta = await sharp(buf, { failOn: 'none' }).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < MIN_EDGE || height < MIN_EDGE) {
    return {
      ok: false,
      statusClass: 'invalid',
      error: `dimensions too small ${width}x${height}`,
      width,
      height,
    };
  }

  let q = quality;
  let webp = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: q, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  // Tighten quality if over budget
  while (webp.data.length > maxBytes && q > 55) {
    q -= 6;
    webp = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: q, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  }

  if (webp.data.length > maxBytes) {
    // Last resort: slightly smaller edge
    const edge = Math.max(320, Math.floor(maxEdge * 0.85));
    webp = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({
        width: edge,
        height: edge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: Math.min(q, 70), effort: 5 })
      .toBuffer({ resolveWithObject: true });
  }

  const outMeta = webp.info;
  return {
    ok: true,
    buffer: webp.data,
    bytes: webp.data.length,
    width: outMeta.width,
    height: outMeta.height,
    sourceWidth: width,
    sourceHeight: height,
    qualityUsed: q,
    overBudget: webp.data.length > maxBytes,
  };
}

async function withRetries(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      const wait = 400 * 2 ** (attempt - 1);
      console.warn(`[retry] ${label} attempt ${attempt}/${MAX_RETRIES}: ${e.message || e}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function loadCheckpoint(file) {
  if (!file || !fs.existsSync(file)) {
    return { processedIds: [], results: [], hashIndex: {} };
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveCheckpoint(file, data) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const SLOT_SELECT_BASE =
  'id,name,provider,provider_key,slug,image_url,image_storage_path,thumbnail_url,is_active';
const SLOT_SELECT_WITH_META = `${SLOT_SELECT_BASE},image_status,image_hash`;

async function selectSlots(sb, buildQuery) {
  // Prefer meta columns when migration is applied; fall back for pre-migration dry-runs.
  let q = buildQuery(sb.from('slots').select(SLOT_SELECT_WITH_META));
  let { data, error } = await q;
  if (error && /image_status|image_hash|column/i.test(error.message || '')) {
    q = buildQuery(sb.from('slots').select(SLOT_SELECT_BASE));
    ({ data, error } = await q);
  }
  if (error) throw error;
  return data || [];
}

async function fetchSlots(sb, args, skipIds) {
  if (args.pilot || args.idsFile) {
    const idsPath = args.idsFile
      ? path.resolve(root, args.idsFile)
      : PILOT_IDS_PATH;
    const ids = JSON.parse(fs.readFileSync(idsPath, 'utf8'));
    const data = await selectSlots(sb, (q) => q.in('id', ids));
    const byId = new Map(data.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  const pageSize = 500;
  let from = 0;
  const rows = [];
  for (;;) {
    const page = await selectSlots(sb, (q) => {
      let query = q.eq('is_active', true).order('name').range(from, from + pageSize - 1);
      if (args.provider) query = query.eq('provider', args.provider);
      if (args.onlyMissing) {
        query = query.or('image_url.is.null,image_url.eq.');
      }
      if (args.onlyNotMigrated && !args.reprocess) {
        query = query.or('image_storage_path.is.null,image_storage_path.eq.');
      }
      return query;
    });
    if (!page.length) break;
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
    if (args.limit && rows.length >= args.limit * 3) break;
  }

  let filtered = rows;
  if (args.onlyNotMigrated && !args.reprocess) {
    filtered = filtered.filter((s) => !s.image_storage_path);
  }
  if (!args.reprocess) {
    filtered = filtered.filter((s) => s.image_status !== 'migrated' || !s.image_storage_path);
  }
  if (skipIds?.size) {
    filtered = filtered.filter((s) => !skipIds.has(s.id));
  }
  if (args.limit) filtered = filtered.slice(0, args.limit);
  return filtered;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
      await sleep(60);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return results;
}

async function findExistingByHash(sb, hash, excludeId) {
  const { data, error } = await sb
    .from('slots')
    .select('id,image_storage_path')
    .eq('image_hash', hash)
    .not('image_storage_path', 'is', null)
    .neq('id', excludeId)
    .limit(1);
  if (error) {
    if (/image_hash|column/i.test(error.message || '')) return null;
    throw error;
  }
  return data?.[0] || null;
}

async function markSlotStatus(sb, slotId, status, extra = {}) {
  const patch = {
    image_status: status,
    image_last_checked_at: new Date().toISOString(),
    ...extra,
  };
  const { error } = await sb.from('slots').update(patch).eq('id', slotId);
  if (error) throw new Error(`status update failed: ${error.message}`);
}

async function processSlot(slot, ctx) {
  const { args, sb, hashIndex } = ctx;
  const proposedPath = storagePathFor(slot);
  const sourceUrl = (slot.image_url || '').trim();
  const base = {
    id: slot.id,
    name: slot.name,
    provider: slot.provider,
    sourceUrl: sourceUrl || null,
    domain: sourceUrl ? domainOf(sourceUrl) : null,
    proposedPath,
  };

  const fail = async (status, problem, fields = {}) => {
    if (!args.dryRun) {
      try {
        await markSlotStatus(sb, slot.id, status, {
          image_storage_path: null,
          image_hash: null,
        });
      } catch (e) {
        return {
          ...base,
          ...fields,
          outcome: 'failed',
          image_status: 'failed',
          problem: `${problem}; also ${e.message}`,
          originalBytes: fields.originalBytes || 0,
          webpBytes: 0,
        };
      }
    }
    return {
      ...base,
      ...fields,
      outcome: status,
      image_status: status,
      problem,
      originalBytes: fields.originalBytes || 0,
      webpBytes: 0,
    };
  };

  if (!sourceUrl) {
    if (!args.dryRun) {
      try {
        await markSlotStatus(sb, slot.id, 'missing', {
          image_storage_path: null,
        });
      } catch (e) {
        return fail('failed', `missing mark failed: ${e.message}`);
      }
    }
    return {
      ...base,
      outcome: 'missing',
      image_status: 'missing',
      problem: 'no image_url',
      originalBytes: 0,
      webpBytes: 0,
    };
  }

  if (
    !args.reprocess &&
    slot.image_storage_path &&
    slot.image_status === 'migrated' &&
    !args.dryRun
  ) {
    return {
      ...base,
      outcome: 'skipped_already_migrated',
      image_status: 'migrated',
      proposedPath: slot.image_storage_path,
    };
  }

  let download;
  try {
    download = await withRetries(() => downloadImage(sourceUrl), `download ${slot.name}`);
  } catch (e) {
    const msg = String(e.message || e);
    return fail('failed', msg);
  }

  if (!download.ok) {
    return fail(download.statusClass, download.error, {
      httpStatus: download.httpStatus,
      contentType: download.contentType || null,
      originalBytes: download.bytes || 0,
      finalUrl: download.finalUrl || null,
    });
  }

  let converted;
  try {
    converted = await convertToWebp(download.buf, {
      maxEdge: args.maxEdge,
      quality: args.webpQuality,
      maxBytes: args.maxBytes,
    });
  } catch (e) {
    return fail('invalid', `convert failed: ${e.message || e}`, {
      originalBytes: download.bytes,
      originalFormat: download.kind,
    });
  }

  if (!converted.ok) {
    return fail(converted.statusClass, converted.error, {
      originalBytes: download.bytes,
      originalFormat: download.kind,
      sourceWidth: converted.width,
      sourceHeight: converted.height,
    });
  }

  const hash = createHash('sha256').update(converted.buffer).digest('hex');
  const inBatchDup = hashIndex[hash];
  let reusedPath = inBatchDup?.path || null;
  let dedupSource = inBatchDup ? `batch:${inBatchDup.slotId}` : null;

  if (!reusedPath && !args.dryRun) {
    try {
      const existing = await findExistingByHash(sb, hash, slot.id);
      if (existing?.image_storage_path) {
        reusedPath = existing.image_storage_path;
        dedupSource = `db:${existing.id}`;
      }
    } catch (e) {
      console.warn(`[hash-lookup] ${e.message || e}`);
    }
  }

  const finalPath = reusedPath || proposedPath;
  const overBudget = converted.overBudget;

  const proposedStatus = overBudget ? 'review_required' : 'migrated';
  const result = {
    ...base,
    outcome: args.dryRun
      ? overBudget
        ? 'would_review'
        : 'would_migrate'
      : proposedStatus,
    image_status: proposedStatus,
    originalBytes: download.bytes,
    originalFormat: download.kind,
    contentType: download.contentType,
    sourceWidth: converted.sourceWidth,
    sourceHeight: converted.sourceHeight,
    webpWidth: converted.width,
    webpHeight: converted.height,
    webpBytes: converted.bytes,
    webpQuality: converted.qualityUsed,
    hash,
    redirected: download.redirected,
    finalUrl: download.finalUrl,
    reusedPath: Boolean(reusedPath),
    dedupSource,
    proposedPath: finalPath,
    overBudget,
    problem: overBudget ? `webp exceeds ${args.maxBytes} bytes` : null,
  };

  if (args.dryRun) {
    if (!hashIndex[hash]) {
      hashIndex[hash] = { path: finalPath, slotId: slot.id };
    }
    return result;
  }

  // Live path: upload unless reused
  if (!reusedPath) {
    try {
      await withRetries(async () => {
        const { error } = await sb.storage.from(BUCKET).upload(finalPath, converted.buffer, {
          contentType: 'image/webp',
          upsert: true,
        });
        if (error) throw new Error(error.message);
        return true;
      }, `upload ${slot.name}`);
    } catch (e) {
      return fail('failed', `upload: ${e.message || e}`, {
        originalBytes: download.bytes,
        originalFormat: download.kind,
        webpBytes: converted.bytes,
        hash,
      });
    }
  }

  try {
    await markSlotStatus(sb, slot.id, proposedStatus, {
      image_storage_path: finalPath,
      image_hash: hash,
    });
  } catch (e) {
    return {
      ...result,
      outcome: 'failed',
      image_status: 'failed',
      problem: e.message,
    };
  }

  if (!hashIndex[hash]) {
    hashIndex[hash] = { path: finalPath, slotId: slot.id };
  }

  result.image_status = proposedStatus;
  result.outcome = proposedStatus;
  return result;
}

function summarize(results) {
  const counts = {};
  let originalTotal = 0;
  let webpTotal = 0;
  let valid = 0;
  let missing = 0;
  let invalid = 0;
  const hashGroups = new Map();

  for (const r of results) {
    counts[r.outcome] = (counts[r.outcome] || 0) + 1;
    originalTotal += r.originalBytes || 0;
    webpTotal += r.webpBytes || 0;
    if (r.outcome === 'missing') missing += 1;
    else if (['invalid', 'blocked', 'failed'].includes(r.outcome)) invalid += 1;
    else if (r.webpBytes > 0) valid += 1;
    if (r.hash) {
      if (!hashGroups.has(r.hash)) hashGroups.set(r.hash, []);
      hashGroups.get(r.hash).push(r.name);
    }
  }

  const dupHashes = [...hashGroups.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([hash, names]) => ({ hash: hash.slice(0, 12), count: names.length, names }));

  const withWebp = results.filter((r) => r.webpBytes > 0);
  const avgWebp = withWebp.length
    ? Math.round(webpTotal / withWebp.length)
    : 0;

  return {
    analyzed: results.length,
    valid,
    invalid,
    missing,
    outcomeCounts: counts,
    originalTotalBytes: originalTotal,
    webpTotalBytes: webpTotal,
    originalTotalMB: +(originalTotal / (1024 * 1024)).toFixed(2),
    webpTotalMB: +(webpTotal / (1024 * 1024)).toFixed(2),
    avgWebpBytes: avgWebp,
    forecast3671WebpMB: +((avgWebp * 3671) / (1024 * 1024)).toFixed(1),
    duplicateHashes: dupHashes,
  };
}

async function validateMigrated(results, supabaseUrl) {
  const migrated = results.filter((r) => r.outcome === 'migrated' || r.outcome === 'review_required');
  const checks = [];
  const seenPaths = new Map();

  for (const r of migrated) {
    const pathKey = r.proposedPath;
    if (seenPaths.has(pathKey)) {
      seenPaths.get(pathKey).push(r.id);
    } else {
      seenPaths.set(pathKey, [r.id]);
    }

    const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${pathKey}`;
    const item = {
      id: r.id,
      name: r.name,
      path: pathKey,
      hash: r.hash,
      webpBytes: r.webpBytes,
      publicUrl,
      ok: false,
      issues: [],
    };

    try {
      const res = await fetch(publicUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/webp,*/*' },
        redirect: 'follow',
      });
      item.httpStatus = res.status;
      item.contentType = res.headers.get('content-type');
      if (res.status !== 200) item.issues.push(`HTTP ${res.status}`);
      if (!(item.contentType || '').includes('image/webp')) {
        item.issues.push(`content-type ${item.contentType}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      item.fetchedBytes = buf.length;
      if (buf.length < MIN_BYTES) item.issues.push('fetched too small');
      if (buf.length > TARGET_MAX_BYTES) item.issues.push('fetched over max bytes');
      if (magicKind(buf) !== 'webp') item.issues.push('magic not webp');
      const hash = createHash('sha256').update(buf).digest('hex');
      item.fetchedHash = hash;
      if (r.hash && hash !== r.hash) item.issues.push('hash mismatch vs DB intent');
      // sharp open check
      const meta = await sharp(buf, { failOn: 'none' }).metadata();
      item.width = meta.width;
      item.height = meta.height;
      if (!meta.width || !meta.height) item.issues.push('cannot read dimensions');
      item.ok = item.issues.length === 0;
    } catch (e) {
      item.issues.push(String(e.message || e));
      item.ok = false;
    }
    checks.push(item);
    await sleep(40);
  }

  const duplicatePaths = [...seenPaths.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([p, ids]) => ({ path: p, slotIds: ids }));

  return {
    checked: checks.length,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
    duplicatePaths,
    checks,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

  if (!url) {
    console.error('Missing VITE_SUPABASE_URL / SUPABASE_URL');
    process.exit(1);
  }

  // Dry-run can use anon (read-only). Live prefers service role.
  // --allow-anon-upload: temporary pilot path when service role is unavailable locally.
  // Must be paired with short-lived Storage write policies that are revoked after the run.
  const allowAnonUpload = process.argv.includes('--allow-anon-upload');
  const key = args.dryRun
    ? serviceKey || anonKey
    : serviceKey || (allowAnonUpload ? anonKey : null);
  if (!key) {
    console.error(
      args.dryRun
        ? 'Missing Supabase key for dry-run'
        : 'SUPABASE_SERVICE_ROLE_KEY required for live migration (or pass --allow-anon-upload with temporary Storage write policies)'
    );
    process.exit(1);
  }
  if (!args.dryRun && !serviceKey && !allowAnonUpload) {
    console.error('Refusing live run without SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!args.dryRun && !serviceKey && allowAnonUpload) {
    console.warn(
      'WARNING: live upload using anon key under temporary Storage write policies; revoke policies after run.'
    );
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const checkpointPath =
    args.checkpoint ||
    path.join(REPORT_DIR, `slot-images-checkpoint${args.dryRun ? '-dry' : ''}.json`);

  let checkpoint = { processedIds: [], results: [], hashIndex: {} };
  if (args.resume) {
    checkpoint = loadCheckpoint(checkpointPath);
    console.log(`Resuming; already processed ${checkpoint.processedIds.length}`);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const skipIds = new Set(args.resume ? checkpoint.processedIds : []);
  console.log(
    JSON.stringify({
      mode: args.dryRun ? 'dry-run' : 'live',
      pilot: args.pilot,
      provider: args.provider,
      limit: args.limit,
      concurrency: args.concurrency,
      maxEdge: args.maxEdge,
      webpQuality: args.webpQuality,
      maxBytes: args.maxBytes,
      bucket: BUCKET,
      note: 'secrets not logged',
    })
  );

  const slots = await fetchSlots(sb, args, skipIds);
  console.log(`Slots selected: ${slots.length}`);

  const hashIndex = { ...(checkpoint.hashIndex || {}) };
  const ctx = { args, sb, hashIndex };

  const batchResults = await mapPool(slots, args.concurrency, async (slot) => {
    const r = await processSlot(slot, ctx);
    const line = [
      r.outcome.padEnd(16),
      r.provider.slice(0, 18).padEnd(18),
      r.name.slice(0, 28).padEnd(28),
      r.domain || '(none)',
      r.webpBytes ? `${Math.round(r.webpBytes / 1024)}KB` : '-',
      r.problem || '',
    ].join(' | ');
    console.log(line);

    checkpoint.processedIds.push(slot.id);
    checkpoint.results.push(r);
    checkpoint.hashIndex = hashIndex;
    if (checkpoint.processedIds.length % 5 === 0) {
      saveCheckpoint(checkpointPath, checkpoint);
    }
    return r;
  });

  const allResults = args.resume
    ? [...(loadCheckpoint(checkpointPath).results || []).filter(
        (r) => !batchResults.find((b) => b.id === r.id)
      ), ...batchResults]
    : batchResults;

  // Prefer current run results for summary of this invocation
  const summary = summarize(batchResults);
  let validation = null;
  if (!args.dryRun) {
    console.log('\nValidating migrated public URLs…');
    validation = await validateMigrated(batchResults, url);
    console.log(
      JSON.stringify(
        {
          checked: validation.checked,
          passed: validation.passed,
          failed: validation.failed,
          duplicatePaths: validation.duplicatePaths,
          failedSamples: validation.checks.filter((c) => !c.ok).slice(0, 5),
        },
        null,
        2
      )
    );
  }

  const reportPath = path.join(
    REPORT_DIR,
    `slot-images-migrate-${args.dryRun ? 'dry-' : ''}${Date.now()}.json`
  );
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    args: {
      ...args,
      // no env
    },
    summary,
    validation,
    results: batchResults,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  saveCheckpoint(checkpointPath, {
    processedIds: checkpoint.processedIds,
    results: allResults,
    hashIndex,
    updatedAt: new Date().toISOString(),
  });

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${reportPath}`);
  console.log(`Checkpoint: ${checkpointPath}`);

  if (args.dryRun) {
    console.log(
      '\nDry-run complete: no bucket created, no uploads, no DB updates.'
    );
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message || e);
  process.exit(1);
});
