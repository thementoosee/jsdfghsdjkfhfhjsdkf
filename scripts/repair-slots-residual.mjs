/**
 * Idempotent residual cleanup (empty RTP shifts, vol casing, N/No/numeric vols).
 * Prefer a fresh `node scripts/import-legacy-slots.mjs` on new installs.
 * Usage:
 *   node scripts/repair-slots-residual.mjs --dry
 *   node scripts/repair-slots-residual.mjs
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

/** Casing / clear typos only */
const VOL_CASING = {
  Medim: 'Medium',
  medium: 'Medium',
  high: 'High',
  low: 'Low',
  'medium+': 'Medium+',
  'low-high': 'Low-High',
  extreme: 'Extreme',
};

const SUSPICIOUS_IDS = [
  '3610145b-ebaa-44c7-b38c-9556079a48fe',
  '9f2971c4-4177-4eae-a339-abb88b2f9578',
  '84b0fa98-209e-482c-b342-66cbb1d232bd',
  '52219ab6-180f-43cf-b18d-4196373e9ca4',
  'df8d2e5d-cb06-4273-9cdd-bde9d7bc224b',
  '32dfcdbe-910f-4daf-8abf-48e9d1f11c29',
  '2b2a7dc5-092e-4e44-80ae-e53e4441c277',
  'aae08b52-b8bc-4ff5-b512-1d8d76dffb5c',
  'e5fd7b79-714e-4029-ae16-94ba176e20a9',
  '48244657-48da-41a9-9d8d-8cc671ce37ad',
  '4e2564b3-78a8-41c7-99d5-260f2fa2acc5',
  '3f81da3d-81fb-4d8d-8215-cdb4cf536e63',
  'b9177208-5962-44fc-94dd-cf4381acf60c',
  'e85f8b06-aa14-4dd4-ab16-497d01b540e1',
  '75561e8c-1bb5-4b7a-aea6-ed24e054143d',
  '88408a89-b559-47c8-bd93-b6e605da0fc2',
  '5db86eb3-94ce-475d-b93a-8aae1d6108af',
  'a02ebb8e-eda8-48a0-a984-559b5b6eb48f',
  '5ce0db1e-9f7e-4a10-aafd-12c6bd16316b',
  'fd45898e-17e7-48a0-9194-c6fa1cff536e',
  'ebe4e6e6-53be-4a95-8f01-db39f276a35b',
  '64dc8199-4dbf-4af9-a54d-d68ad53c1a31',
  '6c3877a8-1c53-4576-87e6-a62a376fcec1',
  '55372b33-e7d7-4569-946c-88a8844ae0fe',
  '182013ab-87a5-44bb-be5d-2bc68fb5054a',
  '37b08b72-34f2-4a09-8431-96843215738d',
  '95c5e896-e876-43d3-a614-3cb389def463',
  '3f7b6c84-9034-4ae9-9a5d-8eea2d32952e',
  '02f69cb0-ba15-4337-a8c1-8f0fe139792d',
  'fe7e6e44-ba5a-4df1-8638-f04b9cf2790d',
  'ac22cb76-fba2-419b-8e7c-f0efbea419d7',
  '321aae0a-cb18-42f8-8488-35a0ebcc76d9',
  '94a6fc64-828f-4bf1-80cb-5ebd858ca3cc',
  '6cf0f097-54e7-4c9c-aae4-f2f523af6200',
  '7a6d79b3-a121-4116-b07f-ccc45d34f14f',
];

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

function isDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function parseCatalog(sqlText) {
  const byName = new Map(); // name -> first row (providers may have been normalized)
  const byKey = new Map();
  const re = /VALUES\s*\((.*)\);\s*$/gm;
  let m;
  while ((m = re.exec(sqlText))) {
    const vals = splitSqlValuesPreserveEmpty(m[1]);
    if (vals.length < 6 || !vals[0] || !vals[1]) continue;
    const row = {
      rawLine: m[0].length > 260 ? m[0].slice(0, 260) + '…' : m[0],
      name: String(vals[0]),
      provider: String(vals[1]),
      image_url: vals[2],
      max_win: vals[3],
      volatility: vals[4],
      rtp: vals[5],
      min_bet: vals[6],
      max_bet: vals[7],
      theme: vals[8],
      release_date: vals[9],
    };
    byKey.set(`${row.name}|${row.provider}`, row);
    if (!byName.has(row.name)) byName.set(row.name, row);
  }
  return { byKey, byName };
}

function canonicalVol(v) {
  if (v == null) return null;
  const s = String(v);
  if (NORMAL_VOL.has(s)) return s;
  if (VOL_CASING[s]) return VOL_CASING[s];
  return null;
}

function isIncompleteVolToken(v) {
  if (v == null) return false;
  const s = String(v);
  if (s === 'N' || s === 'No' || s === 'n' || s === 'no') return true;
  if (/^\d+(\.\d+)?$/.test(s)) return true; // 2, 4.83, 98.1 as vol label
  return false;
}

/**
 * @returns {{ group: 1|2|3, action: string, patch: object|null, notes: string[] }}
 */
function analyze(db, src) {
  const notes = [];
  if (!src) {
    return { group: 3, action: 'manual_review', patch: null, notes: ['no SQL source match'] };
  }

  const srcVolRaw = src.volatility == null ? null : String(src.volatility);
  const srcVolCanon = canonicalVol(srcVolRaw);
  const srcRtp = parseNum(src.rtp);
  const srcMin = parseNum(src.min_bet);
  const srcMaxBet = parseNum(src.max_bet);
  const srcMaxWin = parseIntOrNull(src.max_win);
  const srcRelease = isDate(src.release_date) ? String(src.release_date) : null;
  const srcReleaseClean =
    srcRelease && srcRelease.startsWith('1970-01-01') ? null : srcRelease;

  const dbVol = db.volatility == null ? null : String(db.volatility);
  const dbRtp = db.rtp == null ? null : Number(db.rtp);
  const dbMin = db.min_bet == null ? null : Number(db.min_bet);
  const dbMaxBet = db.max_bet == null ? null : Number(db.max_bet);

  // ----- 1) Pure casing / Medim typo (fields otherwise sane) -----
  if (dbVol && VOL_CASING[dbVol] && dbVol !== VOL_CASING[dbVol]) {
    const rtpOk = dbRtp != null && dbRtp > 1 && dbRtp <= 100;
    const betsOk = dbMin != null && dbMaxBet != null && dbMin <= dbMaxBet && dbMaxBet <= 500;
    if (rtpOk && betsOk && Number(db.max_win) >= 0) {
      notes.push(`volatility casing/typo ${dbVol} → ${VOL_CASING[dbVol]}`);
      return {
        group: 1,
        action: 'correct',
        patch: { volatility: VOL_CASING[dbVol] },
        notes,
      };
    }
  }

  // ----- 2) Empty RTP in SQL → importer shift (rtp=0.20, min=100, max=100) -----
  // Source: max_win OK, vol canonical, rtp EMPTY, min 0.20, max 100
  // DB: vol OK, rtp<=1, min=100, max=100
  if (
    srcRtp == null &&
    srcVolCanon &&
    srcMin != null &&
    srcMaxBet != null &&
    srcMin <= srcMaxBet &&
    srcMaxBet <= 500 &&
    NORMAL_VOL.has(dbVol) &&
    dbRtp != null &&
    dbRtp > 0 &&
    dbRtp <= 1 &&
    dbMin === 100 &&
    dbMaxBet === 100
  ) {
    notes.push(
      'SQL has empty RTP field; importer skipped empty → rtp/min/max shifted. Restore bets from source; rtp=NULL (not invented).'
    );
    return {
      group: 1,
      action: 'correct',
      patch: {
        rtp: null,
        min_bet: srcMin,
        max_bet: srcMaxBet,
        max_win: srcMaxWin == null ? db.max_win : srcMaxWin,
        volatility: dbVol, // already canonical
        release_date: srcReleaseClean,
      },
      notes,
    };
  }

  // ----- 3) Empty max_win + empty RTP in SQL → vol=0.20, rtp=100, max_bet=year -----
  // Source: max_win EMPTY, vol canonical, rtp EMPTY, min 0.20, max 100, date YYYY-MM-DD
  if (
    srcMaxWin == null &&
    srcRtp == null &&
    srcVolCanon &&
    srcMin != null &&
    srcMaxBet != null &&
    srcMin <= srcMaxBet &&
    String(dbVol) === '0.20' &&
    dbRtp === 100 &&
    dbMaxBet != null &&
    dbMaxBet > 1900 &&
    dbMaxBet < 2100
  ) {
    notes.push(
      'SQL empty max_win + empty RTP; importer shifted vol/rtp/bets/date. Restore vol/bets from source; rtp=NULL; max_win=0.'
    );
    return {
      group: 1,
      action: 'correct',
      patch: {
        max_win: 0,
        volatility: srcVolCanon,
        rtp: null,
        min_bet: srcMin,
        max_bet: srcMaxBet,
        release_date: srcReleaseClean,
      },
      notes,
    };
  }

  // ----- 4) Pearl-like: empty max_win + vol token N/No + real RTP in source -----
  // Pearl SQL: ..., , 'N', 98.1, 0.20, 100, NULL, '2025-01-15'
  // DB after skip: vol=98.1, rtp=0.20, min=100, max=100
  // Conclusion: 'N' is incomplete volatility in source (NOT a shifted High/Medium).
  if (
    srcMaxWin == null &&
    isIncompleteVolToken(srcVolRaw) &&
    !srcVolCanon &&
    srcRtp != null &&
    srcRtp > 1 &&
    srcRtp <= 100 &&
    srcMin != null &&
    srcMaxBet != null
  ) {
    notes.push(
      `Pearl-pattern: source volatility='${srcVolRaw}' is incomplete catalog data (not a displaced High/Medium). Null volatility; restore rtp/bets from source.`
    );
    return {
      group: 1,
      action: 'correct',
      patch: {
        max_win: 0,
        volatility: null,
        rtp: srcRtp,
        min_bet: srcMin,
        max_bet: srcMaxBet,
        release_date: srcReleaseClean,
      },
      notes,
    };
  }

  // ----- 5) Source/DB volatility is N/No/numeric junk; other fields already OK -----
  if (
    dbVol &&
    !NORMAL_VOL.has(dbVol) &&
    !VOL_CASING[dbVol] &&
    isIncompleteVolToken(dbVol) &&
    dbRtp != null &&
    dbRtp > 1 &&
    dbRtp <= 100 &&
    dbMin != null &&
    dbMaxBet != null &&
    dbMin <= dbMaxBet &&
    dbMaxBet <= 500
  ) {
    // Confirm source agrees it's junk (same token) or also incomplete
    if (isIncompleteVolToken(srcVolRaw) || srcVolRaw === dbVol) {
      notes.push(
        `volatility='${dbVol}' is invalid/incomplete in SQL source → NULL; rtp/bets/max_win kept`
      );
      return {
        group: 1,
        action: 'null_invalid',
        patch: { volatility: null },
        notes,
      };
    }
  }

  // ----- 6) Spaceman: vol=No, rtp OK -----
  if (dbVol === 'No' || dbVol === 'N') {
    if (dbRtp != null && dbRtp > 1 && dbRtp <= 100) {
      notes.push(`volatility='${dbVol}' incomplete in source → NULL`);
      return {
        group: 1,
        action: 'null_invalid',
        patch: { volatility: null },
        notes,
      };
    }
  }

  return {
    group: 3,
    action: 'manual_review',
    patch: null,
    notes: ['insufficient unequivocal signal', `srcVol=${srcVolRaw}`, `srcRtp=${srcRtp}`],
  };
}

async function fetchAllKeys(sb) {
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await sb
      .from('slots')
      .select('id,provider_key,name_key,rtp,volatility,min_bet,max_bet,max_win,is_active')
      .range(from, from + 999);
    if (error) throw error;
    if (!data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { byKey, byName } = parseCatalog(fs.readFileSync(SQL_PATH, 'utf8'));

  const { data: rows, error } = await sb
    .from('slots')
    .select(
      'id,name,provider,max_win,volatility,rtp,min_bet,max_bet,image_url,release_date,is_active,slug,search_normalized'
    )
    .in('id', SUSPICIOUS_IDS);
  if (error) throw error;

  const analyses = rows.map((db) => {
    const src =
      byKey.get(`${db.name}|${db.provider}`) || byName.get(db.name) || null;
    const a = analyze(db, src);
    return {
      id: db.id,
      name: db.name,
      provider: db.provider,
      db: {
        max_win: db.max_win,
        volatility: db.volatility,
        rtp: db.rtp,
        min_bet: db.min_bet,
        max_bet: db.max_bet,
      },
      src: src
        ? {
            max_win: src.max_win,
            volatility: src.volatility,
            rtp: src.rtp,
            min_bet: src.min_bet,
            max_bet: src.max_bet,
            release_date: src.release_date,
            rawLine: src.rawLine,
          }
        : null,
      ...a,
    };
  });

  const safe = analyses.filter((a) => a.group === 1);
  const probable = analyses.filter((a) => a.group === 2);
  const insufficient = analyses.filter((a) => a.group === 3);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = Date.now();
  fs.writeFileSync(
    path.join(REPORT_DIR, `slots-residual-analysis-${stamp}.json`),
    JSON.stringify({ dry, safe, probable, insufficient, analyses }, null, 2)
  );

  console.log(
    JSON.stringify(
      {
        dry,
        counts: {
          total: analyses.length,
          safe: safe.length,
          probable: probable.length,
          insufficient: insufficient.length,
        },
        safe: safe.map((a) => ({
          name: a.name,
          provider: a.provider,
          action: a.action,
          patch: a.patch,
          notes: a.notes,
        })),
        insufficient: insufficient.map((a) => ({
          name: a.name,
          provider: a.provider,
          notes: a.notes,
          db: a.db,
          src: a.src && {
            max_win: a.src.max_win,
            volatility: a.src.volatility,
            rtp: a.src.rtp,
            min_bet: a.src.min_bet,
            max_bet: a.src.max_bet,
          },
        })),
        pearl: analyses.find((a) => a.name.startsWith('Pearl O Plinko')),
      },
      null,
      2
    )
  );

  if (dry) return;

  // Snapshot before apply
  fs.writeFileSync(
    path.join(REPORT_DIR, `slots-residual-snapshot-${stamp}.json`),
    JSON.stringify(rows, null, 2)
  );

  const report = {
    startedAt: new Date().toISOString(),
    corrected: [],
    nulled: [],
    unchanged: [],
    manualReview: [],
    probableNeedsConfirmation: [],
    pearlConclusion: null,
    validation: null,
  };

  const pearl = analyses.find((a) => a.name.startsWith('Pearl O Plinko'));
  if (pearl) {
    report.pearlConclusion = {
      name: pearl.name,
      provider: pearl.provider,
      sourceLine: pearl.src?.rawLine,
      finding:
        "volatility='N' no SQL fonte é dado incompleto do catálogo, NÃO um High/Medium deslocado. A linha tem max_win vazio + vol='N' + rtp=98.1; o import saltou o vazio e pôs 98.1 em volatility.",
      action: pearl.action,
      patch: pearl.patch,
    };
  }

  for (const a of analyses) {
    if (a.group === 2) {
      report.probableNeedsConfirmation.push(a);
      continue;
    }
    if (a.group === 3 || !a.patch) {
      report.unchanged.push({
        id: a.id,
        name: a.name,
        provider: a.provider,
        reason: a.notes.join('; '),
      });
      report.manualReview.push(a);
      continue;
    }

    const patch = { ...a.patch };
    // Validate
    if (patch.rtp != null && (patch.rtp < 0 || patch.rtp > 100)) {
      report.manualReview.push({ ...a, notes: [...a.notes, 'invalid patch rtp'] });
      continue;
    }
    if (patch.volatility != null && !NORMAL_VOL.has(patch.volatility)) {
      report.manualReview.push({ ...a, notes: [...a.notes, 'invalid patch vol'] });
      continue;
    }
    if (
      patch.min_bet != null &&
      patch.max_bet != null &&
      patch.min_bet > patch.max_bet
    ) {
      report.manualReview.push({ ...a, notes: [...a.notes, 'invalid patch bets'] });
      continue;
    }
    if (patch.max_win != null && patch.max_win < 0) {
      report.manualReview.push({ ...a, notes: [...a.notes, 'invalid patch max_win'] });
      continue;
    }

    const before = rows.find((r) => r.id === a.id);
    const { data: updated, error: upErr } = await sb
      .from('slots')
      .update(patch)
      .eq('id', a.id)
      .select(
        'id,name,provider,max_win,volatility,rtp,min_bet,max_bet,release_date,slug,search_normalized'
      )
      .single();
    if (upErr) {
      report.manualReview.push({ ...a, notes: [...a.notes, upErr.message] });
      continue;
    }

    const entry = {
      id: a.id,
      name: a.name,
      provider: a.provider,
      action: a.action,
      notes: a.notes,
      before: {
        max_win: before.max_win,
        volatility: before.volatility,
        rtp: before.rtp,
        min_bet: before.min_bet,
        max_bet: before.max_bet,
        release_date: before.release_date,
      },
      after: {
        max_win: updated.max_win,
        volatility: updated.volatility,
        rtp: updated.rtp,
        min_bet: updated.min_bet,
        max_bet: updated.max_bet,
        release_date: updated.release_date,
      },
      patch,
    };
    if (a.action === 'null_invalid') report.nulled.push(entry);
    else report.corrected.push(entry);
  }

  // Re-check the original 35
  const { data: afterRows } = await sb
    .from('slots')
    .select('id,name,provider,max_win,volatility,rtp,min_bet,max_bet,is_active')
    .in('id', SUSPICIOUS_IDS);

  const still = [];
  for (const r of afterRows || []) {
    const reasons = [];
    if (r.volatility != null && !NORMAL_VOL.has(r.volatility)) reasons.push(`vol=${r.volatility}`);
    if (r.rtp != null && (Number(r.rtp) < 0 || Number(r.rtp) > 100)) reasons.push('rtp range');
    if (r.rtp != null && Number(r.rtp) > 0 && Number(r.rtp) <= 1) reasons.push('rtp like bet');
    if (r.min_bet != null && r.max_bet != null && Number(r.min_bet) > Number(r.max_bet)) {
      reasons.push('min>max');
    }
    if (r.max_win != null && Number(r.max_win) < 0) reasons.push('max_win neg');
    if (r.max_bet != null && Number(r.max_bet) > 1000) reasons.push('max_bet absurd');
    if (reasons.length) still.push({ id: r.id, name: r.name, provider: r.provider, reasons, r });
  }

  const all = await fetchAllKeys(sb);
  const keyMap = new Map();
  let dups = 0;
  let badRtp = 0;
  let badVol = 0;
  let badBets = 0;
  let badMax = 0;
  for (const r of all) {
    const k = `${r.provider_key}||${r.name_key}`;
    if (keyMap.has(k)) dups += 1;
    else keyMap.set(k, r.id);
    if (r.rtp != null && (Number(r.rtp) < 0 || Number(r.rtp) > 100)) badRtp += 1;
    if (r.volatility != null && !NORMAL_VOL.has(r.volatility)) badVol += 1;
    if (
      r.min_bet != null &&
      r.max_bet != null &&
      Number(r.min_bet) > Number(r.max_bet)
    )
      badBets += 1;
    if (r.max_win != null && Number(r.max_win) < 0) badMax += 1;
  }

  report.validation = {
    duplicateKeys: dups,
    rtpOutOfRange: badRtp,
    volatilityNonCanonical: badVol,
    minGtMax: badBets,
    maxWinNegative: badMax,
    stillSuspiciousAmongOriginal35: still,
    stillCount: still.length,
    active: all.filter((r) => r.is_active).length,
    inactive: all.filter((r) => !r.is_active).length,
    total: all.length,
  };
  report.finishedAt = new Date().toISOString();
  report.summary = {
    corrected: report.corrected.length,
    fieldsNulled: report.nulled.length,
    unchanged: report.unchanged.length,
    probableNeedsConfirmation: report.probableNeedsConfirmation.length,
    manualReviewListed: report.manualReview.length,
    stillSuspicious: still.length,
  };

  const out = path.join(REPORT_DIR, `slots-residual-repair-${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('\n=== APPLY SUMMARY ===');
  console.log(JSON.stringify({ summary: report.summary, validation: report.validation, pearl: report.pearlConclusion, out }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
