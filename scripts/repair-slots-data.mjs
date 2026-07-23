/**
 * Idempotent cleanup for DBs imported with the old buggy parser.
 * Prefer a fresh `node scripts/import-legacy-slots.mjs` on new installs.
 *
 * Fixes: HIGH reconstructions, MEDIUM empty-field shifts, provider map, 1970 dates.
 * Snapshots go to scripts/reports/ (gitignored). No DELETE.
 * Usage: node scripts/repair-slots-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(root, 'scripts', 'reports');
const SQL_PATH = path.join(root, 'sql', 'root-batches', 'slots_complete.sql');

const NORMAL_VOL = new Set(['Low', 'Medium', 'High', 'Medium+', 'Low-High', 'Extreme']);

/** Explicit original → canonical. No fuzzy merges. */
const PROVIDER_MAP = {
  PRAGMATIC: 'Pragmatic Play',
  iSoftbet: 'iSoftBet',
  Boongo: 'Booongo',
  'Alchecmy Gaming': 'Alchemy Gaming',
  Gameburger: 'Gameburger Studios',
  'Northernlights Gaming': 'Northern Lights Gaming',
  'PearFiction Studios': 'Pear Fiction Studios',
  Boomerang: 'Boomerang Studios',
  'Boomerang Games': 'Boomerang Studios',
  'Dreamtech Gaming': 'DreamTech Gaming',
  'Spinplay Games': 'SpinPlay Games',
  Inspired: 'Inspired Gaming',
  'TrueLab Games': 'TrueLab',
  'Skywind Group': 'Skywind',
  Spearhead: 'Spearhead Studios',
  'Buck Stakes': 'Buck Stakes Ent.',
  BulletProof: 'Bulletproof Games',
  '1X2 Gaming': '1x2 Gaming',
};

/**
 * HIGH reconstructions supported by source SQL + audit hints.
 * Columns after name/provider come from reinterpreting the broken VALUES line.
 */
const HIGH_FIXES = {
  'Dead|Dead or Deader': {
    name: 'Dead, Dead or Deader',
    provider: 'Nolimit City',
    max_win: 19349,
    rtp: 96.09,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  'The Good|The Bad and The Rich': {
    name: 'The Good, The Bad and The Rich',
    provider: 'Red Tiger',
    max_win: 10462,
    rtp: 96,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  'Betty|Boris And Boo': {
    name: 'Betty, Boris And Boo',
    provider: 'Red Tiger',
    max_win: 5241,
    rtp: 95.69,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  'Lucky|Grace and Charm': {
    name: 'Lucky, Grace and Charm',
    provider: 'Pragmatic Play / Reel Kingdom',
    max_win: 10000,
    rtp: 96.71,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  'Lights|Camera': {
    name: 'Lights, Camera, Cash!',
    provider: 'NetEnt',
    max_win: null,
    rtp: 96,
    volatility: 'High',
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  'Pizza!|Pizza?': {
    name: 'Pizza! Pizza?',
    provider: 'Pragmatic Play',
    max_win: null,
    rtp: 96.04,
    volatility: 'High',
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  '10|000 Big Bass Lightning Spins': {
    name: '10000 Big Bass Lightning Spins',
    provider: 'ReelPlay',
    max_win: 4660,
    rtp: 96.11,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  '10|000 Wonders MultiMax': {
    name: '10000 Wonders MultiMax',
    provider: 'ReelPlay',
    max_win: 34213,
    rtp: 96,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  '10|000 Wolves 10K Ways': {
    name: '10000 Wolves 10K Ways',
    provider: 'ReelPlay',
    max_win: null,
    rtp: 96.16,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  '10|000 Wonders 10K Ways': {
    name: '10000 Wonders 10K Ways',
    provider: 'ReelPlay',
    max_win: 5662,
    rtp: 96.16,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  '10|001 Nights': {
    name: '10001 Nights',
    provider: 'Red Tiger',
    max_win: 10347,
    rtp: 95.73,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  '10|001 Nights Megaways': {
    name: '10001 Nights Megaways',
    provider: 'Red Tiger',
    max_win: 10346,
    rtp: 96,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  'Dragon 50|000': {
    name: 'Dragon 50000',
    provider: 'ReelPlay',
    max_win: 2000,
    rtp: 95.6,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
  'Jackpot Jester 200|000': {
    name: 'Jackpot Jester 200000',
    provider: 'SG Digital',
    max_win: 10000,
    rtp: 94.9,
    volatility: null,
    image_url: null,
    min_bet: 0.2,
    max_bet: 100,
    confidence: 'high',
  },
};

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

/** Preserve empty fields between commas (unlike the import bug). */
function splitSqlValuesPreserveEmpty(s) {
  const vals = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && ' \t\r\n'.includes(s[i])) i += 1;
    if (i >= n) break;
    if (s[i] === ',') {
      vals.push(null);
      i += 1;
      continue;
    }
    if (s[i] === "'") {
      i += 1;
      let buf = '';
      while (i < n) {
        if (s[i] === "'" && i + 1 < n && s[i + 1] === "'") {
          buf += "'";
          i += 2;
          continue;
        }
        if (s[i] === "'") {
          i += 1;
          break;
        }
        buf += s[i];
        i += 1;
      }
      vals.push(buf);
    } else if (s.startsWith('NULL', i)) {
      vals.push(null);
      i += 4;
    } else {
      let j = i;
      while (j < n && s[j] !== ',') j += 1;
      const tok = s.slice(i, j).trim();
      vals.push(tok === '' ? null : tok);
      i = j;
    }
    while (i < n && ' \t\r\n'.includes(s[i])) i += 1;
    if (i < n && s[i] === ',') i += 1;
  }
  return vals;
}

function parseNum(v) {
  if (v == null || v === '' || v === 'NULL') return null;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function parseIntOrNull(v) {
  if (v == null || v === '' || v === 'NULL') return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function isRecognizedVol(v) {
  return v != null && NORMAL_VOL.has(String(v));
}

function looksLikeRtp(v) {
  const n = parseNum(v);
  return n != null && n >= 80 && n <= 100;
}

function looksLikeBet(v) {
  const n = parseNum(v);
  return n != null && n > 0 && n <= 1;
}

/** Re-parse catalog with empty-field preservation → map by name|provider */
function parseCatalogCorrect(sqlText) {
  const byKey = new Map();
  const re = /VALUES\s*\((.*)\);\s*$/gm;
  let m;
  while ((m = re.exec(sqlText))) {
    const vals = splitSqlValuesPreserveEmpty(m[1]);
    if (vals.length < 6) continue;
    const name = vals[0];
    const provider = vals[1];
    if (!name || !provider) continue;
    // Skip clearly broken name/provider pairs (HIGH) — handled separately
    const row = {
      name: String(name),
      provider: String(provider),
      image_url: vals[2] && String(vals[2]).startsWith('http') ? String(vals[2]) : vals[2] || null,
      max_win: parseIntOrNull(vals[3]),
      volatility: vals[4] == null || vals[4] === 'NULL' ? null : String(vals[4]),
      rtp: parseNum(vals[5]),
      min_bet: parseNum(vals[6]),
      max_bet: parseNum(vals[7]),
      theme: vals[8] == null || vals[8] === 'NULL' || vals[8] === '{}' ? null : String(vals[8]),
      release_date: (() => {
        const raw = vals[9];
        if (raw == null || raw === 'NULL' || raw === '{}') return null;
        const s = String(raw);
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
      })(),
      rawVals: vals,
    };
    // Invalid image placeholders
    if (row.image_url && !String(row.image_url).startsWith('http')) {
      row.image_url = null;
    }
    byKey.set(`${row.name}|${row.provider}`, row);
  }
  return byKey;
}

async function fetchAll(sb, columns) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await sb
      .from('slots')
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function pick(row, keys) {
  const o = {};
  for (const k of keys) o[k] = row[k];
  return o;
}

const SNAPSHOT_COLS = [
  'id',
  'name',
  'provider',
  'image_url',
  'max_win',
  'volatility',
  'rtp',
  'min_bet',
  'max_bet',
  'theme',
  'release_date',
  'source_name',
  'is_active',
  'slug',
  'search_normalized',
  'name_key',
  'provider_key',
  'aliases',
];

async function main() {
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

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const sqlText = fs.readFileSync(SQL_PATH, 'utf8');
  const catalog = parseCatalogCorrect(sqlText);

  const all = await fetchAll(sb, SNAPSHOT_COLS.join(','));
  console.log('Loaded slots', all.length, 'catalog keys', catalog.size);

  // Identify affected sets BEFORE mutation
  const highCandidates = all.filter((r) => HIGH_FIXES[`${r.name}|${r.provider}`]);
  const mediumCandidates = all.filter((r) => {
    if (HIGH_FIXES[`${r.name}|${r.provider}`]) return false;
    const volNum = looksLikeRtp(r.volatility);
    const rtpBet = looksLikeBet(r.rtp);
    const maxZero = Number(r.max_win) === 0;
    // Unequivocal shift from empty max_win skip: vol looks like RTP, rtp looks like bet
    return maxZero && volNum && rtpBet;
  });

  const providerAffected = all.filter((r) => PROVIDER_MAP[r.provider]);
  const epochAffected = all.filter(
    (r) => r.release_date && String(r.release_date).startsWith('1970-01-01')
  );

  const affectedIds = new Set([
    ...highCandidates.map((r) => r.id),
    ...mediumCandidates.map((r) => r.id),
    ...providerAffected.map((r) => r.id),
    ...epochAffected.map((r) => r.id),
  ]);

  const snapshot = all.filter((r) => affectedIds.has(r.id));
  const stamp = Date.now();
  const snapshotPath = path.join(REPORT_DIR, `slots-repair-snapshot-${stamp}.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows: snapshot }, null, 2));
  console.log('Snapshot written', snapshot.length, snapshotPath);

  const beforeAfter = [];
  const report = {
    startedAt: new Date().toISOString(),
    snapshotPath,
    high: { corrected: [], deactivated: [], skipped: [] },
    medium: { corrected: [], leftForReview: [] },
    providers: { map: PROVIDER_MAP, byMapping: {}, errors: [] },
    dates: { convertedToNull: 0, errors: [] },
    uniqueCheck: null,
    finalCounts: null,
    stillSuspicious: [],
    searchSmoke: {},
    errors: [],
  };

  // ---------- HIGH ----------
  for (const row of highCandidates) {
    const key = `${row.name}|${row.provider}`;
    const fix = HIGH_FIXES[key];
    const before = pick(row, SNAPSHOT_COLS);

    if (!fix || fix.confidence !== 'high') {
      const { error } = await sb.from('slots').update({ is_active: false }).eq('id', row.id);
      if (error) {
        report.errors.push({ id: row.id, stage: 'high-deactivate', error: error.message });
        continue;
      }
      report.high.deactivated.push({ id: row.id, key, reason: 'doubt or missing fix' });
      beforeAfter.push({ id: row.id, stage: 'high-deactivate', before, after: { ...before, is_active: false } });
      continue;
    }

    // Unique collision check for new keys
    const { data: clash } = await sb
      .from('slots')
      .select('id,name,provider')
      .neq('id', row.id)
      .eq('name', fix.name)
      .eq('provider', fix.provider)
      .maybeSingle();

    if (clash) {
      const { error } = await sb.from('slots').update({ is_active: false }).eq('id', row.id);
      if (error) report.errors.push({ id: row.id, stage: 'high-clash', error: error.message });
      else {
        report.high.deactivated.push({
          id: row.id,
          key,
          reason: `unique clash with ${clash.id}`,
          clash,
        });
        beforeAfter.push({ id: row.id, stage: 'high-deactivate-clash', before, after: { ...before, is_active: false } });
      }
      continue;
    }

    const patch = {
      name: fix.name,
      provider: fix.provider,
      image_url: fix.image_url,
      max_win: fix.max_win ?? 0,
      volatility: fix.volatility,
      rtp: fix.rtp,
      min_bet: fix.min_bet,
      max_bet: fix.max_bet,
      is_active: true,
      data_confidence: 'legacy_repaired_high',
    };

    // Validate numeric constraints we can
    if (patch.rtp != null && (patch.rtp < 0 || patch.rtp > 100)) {
      const { error } = await sb.from('slots').update({ is_active: false }).eq('id', row.id);
      report.high.deactivated.push({ id: row.id, key, reason: 'rtp out of range after reconstruct' });
      beforeAfter.push({ id: row.id, stage: 'high-deactivate-rtp', before, after: { ...before, is_active: false } });
      if (error) report.errors.push({ id: row.id, error: error.message });
      continue;
    }
    if (patch.min_bet != null && patch.max_bet != null && patch.min_bet > patch.max_bet) {
      const { error } = await sb.from('slots').update({ is_active: false }).eq('id', row.id);
      report.high.deactivated.push({ id: row.id, key, reason: 'min_bet > max_bet' });
      if (error) report.errors.push({ id: row.id, error: error.message });
      continue;
    }

    const { data: updated, error } = await sb
      .from('slots')
      .update(patch)
      .eq('id', row.id)
      .select(SNAPSHOT_COLS.join(','))
      .single();

    if (error) {
      // fallback deactivate
      await sb.from('slots').update({ is_active: false }).eq('id', row.id);
      report.high.deactivated.push({ id: row.id, key, reason: error.message });
      report.errors.push({ id: row.id, stage: 'high-update', error: error.message });
    } else {
      report.high.corrected.push({
        id: row.id,
        from: { name: row.name, provider: row.provider },
        to: { name: fix.name, provider: fix.provider },
        note: fix.volatility == null ? 'volatility left null (not present in broken SQL line)' : null,
      });
      beforeAfter.push({ id: row.id, stage: 'high-correct', before, after: updated });
    }
  }

  // ---------- MEDIUM ----------
  for (const row of mediumCandidates) {
    const before = pick(row, SNAPSHOT_COLS);
    const src = catalog.get(`${row.name}|${row.provider}`);

    if (!src) {
      report.medium.leftForReview.push({
        id: row.id,
        name: row.name,
        provider: row.provider,
        reason: 'no matching source SQL row',
      });
      continue;
    }

    // Unequivocal: source has recognized volatility + RTP in range + empty/null max_win in source
    const srcVolOk = isRecognizedVol(src.volatility);
    const srcRtpOk = src.rtp != null && src.rtp >= 0 && src.rtp <= 100;
    const srcBetsOk =
      src.min_bet != null &&
      src.max_bet != null &&
      src.min_bet <= src.max_bet;
    const srcMaxOk = src.max_win == null || src.max_win >= 0;

    // Confirm DB shows the known shift pattern vs source
    const dbShifted =
      Number(row.max_win) === 0 &&
      looksLikeRtp(row.volatility) &&
      looksLikeBet(row.rtp);

    if (!(dbShifted && srcVolOk && srcRtpOk && srcBetsOk && srcMaxOk)) {
      report.medium.leftForReview.push({
        id: row.id,
        name: row.name,
        provider: row.provider,
        reason: 'ambiguous — source or db pattern not unequivocal',
        db: { max_win: row.max_win, volatility: row.volatility, rtp: row.rtp },
        src: {
          max_win: src.max_win,
          volatility: src.volatility,
          rtp: src.rtp,
          min_bet: src.min_bet,
          max_bet: src.max_bet,
        },
      });
      continue;
    }

    const patch = {
      max_win: src.max_win == null ? 0 : src.max_win,
      volatility: src.volatility,
      rtp: src.rtp,
      min_bet: src.min_bet,
      max_bet: src.max_bet,
      // restore image if we wiped incorrectly? keep existing if http
      image_url:
        row.image_url && String(row.image_url).startsWith('http')
          ? row.image_url
          : src.image_url,
      data_confidence: 'legacy_repaired_medium',
    };

    // Post-fix validation
    if (patch.rtp < 0 || patch.rtp > 100 || !isRecognizedVol(patch.volatility) || patch.min_bet > patch.max_bet || patch.max_win < 0) {
      report.medium.leftForReview.push({
        id: row.id,
        name: row.name,
        provider: row.provider,
        reason: 'failed post-fix validation',
        patch,
      });
      continue;
    }

    // release_date from source if epoch — dates pass will also catch
    if (src.release_date && src.release_date.startsWith('1970-01-01')) {
      patch.release_date = null;
    } else if (src.release_date) {
      patch.release_date = src.release_date;
    }

    const { data: updated, error } = await sb
      .from('slots')
      .update(patch)
      .eq('id', row.id)
      .select(SNAPSHOT_COLS.join(','))
      .single();

    if (error) {
      report.medium.leftForReview.push({
        id: row.id,
        name: row.name,
        provider: row.provider,
        reason: error.message,
      });
      report.errors.push({ id: row.id, stage: 'medium', error: error.message });
    } else {
      report.medium.corrected.push({
        id: row.id,
        name: row.name,
        provider: row.provider,
        before: {
          max_win: row.max_win,
          volatility: row.volatility,
          rtp: row.rtp,
          min_bet: row.min_bet,
          max_bet: row.max_bet,
        },
        after: {
          max_win: updated.max_win,
          volatility: updated.volatility,
          rtp: updated.rtp,
          min_bet: updated.min_bet,
          max_bet: updated.max_bet,
        },
      });
      beforeAfter.push({ id: row.id, stage: 'medium-correct', before, after: updated });
    }
  }

  // ---------- PROVIDERS ----------
  for (const [from, to] of Object.entries(PROVIDER_MAP)) {
    report.providers.byMapping[`${from}→${to}`] = { attempted: 0, updated: 0, skippedClash: 0, errors: [] };
  }

  // Refresh provider list after high/medium (names may have changed)
  const afterHm = await fetchAll(sb, 'id,name,provider,provider_key,name_key,is_active');
  for (const row of afterHm) {
    const canonical = PROVIDER_MAP[row.provider];
    if (!canonical || canonical === row.provider) continue;

    const mapKey = `${row.provider}→${canonical}`;
    report.providers.byMapping[mapKey].attempted += 1;

    // Check UNIQUE clash: another row with same name + canonical provider
    const { data: clash } = await sb
      .from('slots')
      .select('id')
      .neq('id', row.id)
      .eq('name', row.name)
      .eq('provider', canonical)
      .maybeSingle();

    if (clash) {
      report.providers.byMapping[mapKey].skippedClash += 1;
      report.providers.errors.push({
        id: row.id,
        name: row.name,
        from: row.provider,
        to: canonical,
        reason: `UNIQUE clash with ${clash.id}`,
      });
      continue;
    }

    const before = afterHm.find((r) => r.id === row.id);
    const { error } = await sb.from('slots').update({ provider: canonical }).eq('id', row.id);
    if (error) {
      report.providers.byMapping[mapKey].errors.push(error.message);
      report.providers.errors.push({ id: row.id, error: error.message });
    } else {
      report.providers.byMapping[mapKey].updated += 1;
      beforeAfter.push({
        id: row.id,
        stage: 'provider',
        before: { provider: row.provider },
        after: { provider: canonical },
      });
    }
  }

  // ---------- DATES ----------
  // Only 1970-01-01 → NULL; only on current epoch rows
  const epochNow = await fetchAll(sb, 'id,release_date');
  const epochIds = epochNow
    .filter((r) => r.release_date && String(r.release_date).startsWith('1970-01-01'))
    .map((r) => r.id);

  // batch update
  const dateBatch = 100;
  for (let i = 0; i < epochIds.length; i += dateBatch) {
    const ids = epochIds.slice(i, i + dateBatch);
    const { error, count } = await sb
      .from('slots')
      .update({ release_date: null })
      .in('id', ids);
    if (error) {
      report.dates.errors.push({ offset: i, error: error.message });
    } else {
      report.dates.convertedToNull += ids.length;
    }
  }

  // Trigger already refreshes derived fields on UPDATE (slug/search_normalized/keys).
  const keys = await fetchAll(sb, 'id,provider_key,name_key,is_active,name,provider,volatility,rtp,max_win,min_bet,max_bet,image_url,release_date,slug,search_normalized');
  const keyMap = new Map();
  const dups = [];
  for (const r of keys) {
    const k = `${r.provider_key}||${r.name_key}`;
    if (keyMap.has(k)) dups.push({ key: k, a: keyMap.get(k), b: r.id });
    else keyMap.set(k, r.id);
  }
  report.uniqueCheck = { duplicatePairs: dups.length, duplicates: dups };

  const active = keys.filter((r) => r.is_active).length;
  const inactive = keys.filter((r) => !r.is_active).length;
  report.finalCounts = {
    total: keys.length,
    active,
    inactive,
    noImage: keys.filter((r) => !r.image_url).length,
    epochLeft: keys.filter((r) => r.release_date && String(r.release_date).startsWith('1970')).length,
  };

  // Still suspicious
  for (const r of keys) {
    const reasons = [];
    if (/^[0-9]+$/.test(String(r.name || ''))) reasons.push('numeric name');
    if (/^[0-9]+$/.test(String(r.provider || '')) || /^[0-9]{3}\s/.test(String(r.provider || ''))) {
      reasons.push('numeric/continuation provider');
    }
    if (r.volatility && !NORMAL_VOL.has(r.volatility)) reasons.push(`vol=${r.volatility}`);
    if (r.rtp != null && (Number(r.rtp) < 0 || Number(r.rtp) > 100)) reasons.push('rtp range');
    if (r.rtp != null && Number(r.rtp) > 0 && Number(r.rtp) <= 1) reasons.push('rtp looks like bet');
    if (Number(r.max_win) === 0 && looksLikeRtp(r.volatility)) reasons.push('still shifted?');
    if (reasons.length && r.is_active) {
      report.stillSuspicious.push({
        id: r.id,
        name: r.name,
        provider: r.provider,
        is_active: r.is_active,
        reasons,
      });
    }
  }

  // Search smoke via RPC
  for (const q of ['Gates', 'Sweet Bonanza', 'Wanted', 'Mental', 'Fire', 'Book', 'GOO 1000', 'Hacksaw']) {
    const { data, error } = await sb.rpc('search_slots', { q, lim: 5 });
    report.searchSmoke[q] = error
      ? { error: error.message }
      : (data || []).map((d) => `${d.name} (${d.provider})`);
  }

  report.finishedAt = new Date().toISOString();
  report.summary = {
    highCorrected: report.high.corrected.length,
    highDeactivated: report.high.deactivated.length,
    mediumCorrected: report.medium.corrected.length,
    mediumLeftForReview: report.medium.leftForReview.length,
    providersUpdated: Object.values(report.providers.byMapping).reduce((s, m) => s + m.updated, 0),
    datesConverted: report.dates.convertedToNull,
    active: report.finalCounts.active,
    inactive: report.finalCounts.inactive,
    stillSuspiciousActive: report.stillSuspicious.length,
    uniqueDupes: report.uniqueCheck.duplicatePairs,
  };

  const baPath = path.join(REPORT_DIR, `slots-repair-before-after-${stamp}.json`);
  const repPath = path.join(REPORT_DIR, `slots-repair-report-${stamp}.json`);
  fs.writeFileSync(baPath, JSON.stringify(beforeAfter, null, 2));
  fs.writeFileSync(repPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary: report.summary, repPath, baPath, snapshotPath }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
