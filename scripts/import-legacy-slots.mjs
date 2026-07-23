/**
 * Import canonical legacy catalog + apply safe cleanups (reproducible).
 *
 * Fresh install:
 *   1. Apply supabase migration 20260723173000_slots_catalog_v2.sql
 *   2. node scripts/import-legacy-slots.mjs
 *
 * Existing DB already imported with the old buggy parser:
 *   node scripts/repair-slots-data.mjs
 *   node scripts/repair-slots-residual.mjs
 *
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (preferred) or anon key
 * with open write policies. Never commit .env.
 *
 * Source: sql/root-batches/slots_complete.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const SQL_PATH = path.join(root, 'sql', 'root-batches', 'slots_complete.sql');
const REPORT_DIR = path.join(root, 'scripts', 'reports');

const NORMAL_VOL = new Set(['Low', 'Medium', 'High', 'Medium+', 'Low-High', 'Extreme']);
const VOL_CASING = {
  Medim: 'Medium',
  medium: 'Medium',
  high: 'High',
  low: 'Low',
  'medium+': 'Medium+',
  'low-high': 'Low-High',
  extreme: 'Extreme',
};

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

/** Broken SQL rows (comma-split names) → reconstructed identity + fields */
const HIGH_FIXES = {
  'Dead|Dead or Deader': {
    name: 'Dead, Dead or Deader',
    provider: 'Nolimit City',
    max_win: 19349,
    rtp: 96.09,
    volatility: null,
  },
  'The Good|The Bad and The Rich': {
    name: 'The Good, The Bad and The Rich',
    provider: 'Red Tiger',
    max_win: 10462,
    rtp: 96,
    volatility: null,
  },
  'Betty|Boris And Boo': {
    name: 'Betty, Boris And Boo',
    provider: 'Red Tiger',
    max_win: 5241,
    rtp: 95.69,
    volatility: null,
  },
  'Lucky|Grace and Charm': {
    name: 'Lucky, Grace and Charm',
    provider: 'Pragmatic Play / Reel Kingdom',
    max_win: 10000,
    rtp: 96.71,
    volatility: null,
  },
  'Lights|Camera': {
    name: 'Lights, Camera, Cash!',
    provider: 'NetEnt',
    max_win: null,
    rtp: 96,
    volatility: 'High',
  },
  'Pizza!|Pizza?': {
    name: 'Pizza! Pizza?',
    provider: 'Pragmatic Play',
    max_win: null,
    rtp: 96.04,
    volatility: 'High',
  },
  '10|000 Big Bass Lightning Spins': {
    name: '10000 Big Bass Lightning Spins',
    provider: 'ReelPlay',
    max_win: 4660,
    rtp: 96.11,
    volatility: null,
  },
  '10|000 Wonders MultiMax': {
    name: '10000 Wonders MultiMax',
    provider: 'ReelPlay',
    max_win: 34213,
    rtp: 96,
    volatility: null,
  },
  '10|000 Wolves 10K Ways': {
    name: '10000 Wolves 10K Ways',
    provider: 'ReelPlay',
    max_win: null,
    rtp: 96.16,
    volatility: null,
  },
  '10|000 Wonders 10K Ways': {
    name: '10000 Wonders 10K Ways',
    provider: 'ReelPlay',
    max_win: 5662,
    rtp: 96.16,
    volatility: null,
  },
  '10|001 Nights': {
    name: '10001 Nights',
    provider: 'Red Tiger',
    max_win: 10347,
    rtp: 95.73,
    volatility: null,
  },
  '10|001 Nights Megaways': {
    name: '10001 Nights Megaways',
    provider: 'Red Tiger',
    max_win: 10346,
    rtp: 96,
    volatility: null,
  },
  'Dragon 50|000': {
    name: 'Dragon 50000',
    provider: 'ReelPlay',
    max_win: 2000,
    rtp: 95.6,
    volatility: null,
  },
  'Jackpot Jester 200|000': {
    name: 'Jackpot Jester 200000',
    provider: 'SG Digital',
    max_win: 10000,
    rtp: 94.9,
    volatility: null,
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

/** Preserve empty fields between commas (fixes the original import bug). */
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

function normalizeKey(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

function normalizeVolatility(raw) {
  if (raw == null || raw === '' || raw === 'NULL') return null;
  const s = String(raw);
  if (NORMAL_VOL.has(s)) return s;
  if (VOL_CASING[s]) return VOL_CASING[s];
  // Incomplete / non-canonical tokens from catalog (N, No, 2, 4.83, …)
  return null;
}

function isHttp(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

function parseCatalog(sqlText) {
  const byKey = new Map();
  const quality = {
    total: 0,
    highReconstructed: 0,
    providersMapped: 0,
    emptyRtp: 0,
    epochDatesNulled: 0,
    duplicateExtraRows: 0,
  };

  const re = /VALUES\s*\((.*)\);\s*$/gm;
  let m;
  while ((m = re.exec(sqlText))) {
    const vals = splitSqlValuesPreserveEmpty(m[1]);
    if (vals.length < 6) continue;
    quality.total += 1;

    let name = vals[0] == null ? '' : String(vals[0]);
    let provider = vals[1] == null ? '' : String(vals[1]);
    let image_url = isHttp(vals[2]) ? String(vals[2]) : null;
    let max_win = parseIntOrNull(vals[3]);
    let volatility = normalizeVolatility(vals[4]);
    let rtp = parseNum(vals[5]);
    let min_bet = parseNum(vals[6]);
    let max_bet = parseNum(vals[7]);
    let theme =
      vals[8] == null || vals[8] === 'NULL' || vals[8] === '{}'
        ? null
        : String(vals[8]);
    let release_date = (() => {
      const raw = vals[9];
      if (raw == null || raw === 'NULL' || raw === '{}') return null;
      const s = String(raw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      if (s.startsWith('1970-01-01')) {
        quality.epochDatesNulled += 1;
        return null;
      }
      return s;
    })();

    const brokenKey = `${name}|${provider}`;
    const high = HIGH_FIXES[brokenKey];
    if (high) {
      name = high.name;
      provider = high.provider;
      image_url = null;
      max_win = high.max_win;
      rtp = high.rtp;
      volatility = high.volatility;
      min_bet = 0.2;
      max_bet = 100;
      quality.highReconstructed += 1;
    }

    if (PROVIDER_MAP[provider]) {
      provider = PROVIDER_MAP[provider];
      quality.providersMapped += 1;
    }

    if (rtp == null) quality.emptyRtp += 1;
    // Defaults only for bets when missing (catalog convention), never invent RTP/vol
    if (min_bet == null) min_bet = 0.2;
    if (max_bet == null) max_bet = 100;
    if (max_win == null) max_win = 0;
    if (rtp != null && (rtp < 0 || rtp > 100)) rtp = null;
    if (min_bet > max_bet) {
      min_bet = 0.2;
      max_bet = 100;
    }

    const row = {
      name,
      provider,
      image_url,
      max_win,
      volatility,
      rtp,
      min_bet,
      max_bet,
      theme,
      release_date,
      features: [],
      aliases: [],
      source_name: 'legacy_repository_catalog',
      data_confidence: high ? 'legacy_repaired_high' : 'legacy',
      is_active: true,
      name_key: normalizeKey(name),
      provider_key: normalizeKey(provider),
    };

    const key = `${row.provider_key}||${row.name_key}`;
    if (byKey.has(key)) quality.duplicateExtraRows += 1;
    else byKey.set(key, row);
  }

  return { rows: [...byKey.values()], quality };
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing Supabase URL/key in .env');
    process.exit(1);
  }
  if (!fs.existsSync(SQL_PATH)) {
    console.error('Missing catalog SQL:', SQL_PATH);
    process.exit(1);
  }

  const sqlText = fs.readFileSync(SQL_PATH, 'utf8');
  const { rows, quality } = parseCatalog(sqlText);
  console.log('Parsed', quality);

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const report = {
    analyzed: quality,
    uniqueKeys: rows.length,
    importedOrUpdatedBatches: 0,
    errors: [],
  };

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('slots').upsert(chunk, {
      onConflict: 'provider_key,name_key',
    });
    if (error) {
      console.error('Batch error at', i, error.message);
      report.errors.push({ offset: i, error: error.message });
      for (let j = 0; j < chunk.length; j += 10) {
        const mini = chunk.slice(j, j + 10);
        const { error: miniErr } = await supabase.from('slots').upsert(mini, {
          onConflict: 'provider_key,name_key',
        });
        if (miniErr) {
          report.errors.push({ offset: i + j, error: miniErr.message, size: mini.length });
        } else {
          report.importedOrUpdatedBatches += 1;
        }
      }
    } else {
      report.importedOrUpdatedBatches += 1;
      console.log(`Upserted ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
    }
  }

  // Minimal alias seed for search UX
  await supabase
    .from('slots')
    .update({ aliases: ['GOO 1000', 'gates 1000'] })
    .eq('name', 'Gates of Olympus 1000')
    .eq('provider', 'Pragmatic Play');

  const { count } = await supabase
    .from('slots')
    .select('*', { count: 'exact', head: true });
  report.finalCount = count;

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outPath = path.join(REPORT_DIR, `import-legacy-slots-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('Done', { finalCount: count, errors: report.errors.length, outPath });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
