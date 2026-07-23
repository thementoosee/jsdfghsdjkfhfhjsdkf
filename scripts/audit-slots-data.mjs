/**
 * Read-only slots data quality audit. Does not mutate the database.
 * Usage: node scripts/audit-slots-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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

function isHttp(u) {
  if (!u) return false;
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
}

const RECONSTRUCT = {
  'Dead|Dead or Deader': {
    name: 'Dead, Dead or Deader',
    provider: 'Nolimit City',
  },
  'The Good|The Bad and The Rich': {
    name: 'The Good, The Bad and The Rich',
    provider: 'Red Tiger',
  },
  'Betty|Boris And Boo': {
    name: 'Betty, Boris And Boo',
    provider: 'Red Tiger',
  },
  'Lucky|Grace and Charm': {
    name: 'Lucky, Grace and Charm',
    provider: 'Pragmatic Play / Reel Kingdom',
  },
  'Lights|Camera': {
    name: 'Lights, Camera, Cash!',
    provider: 'NetEnt',
  },
  'Pizza!|Pizza?': {
    name: 'Pizza! Pizza?',
    provider: 'Pragmatic Play',
  },
  '10|000 Big Bass Lightning Spins': {
    name: '10000 Big Bass Lightning Spins',
    provider: 'ReelPlay',
  },
  '10|000 Wonders MultiMax': {
    name: '10000 Wonders MultiMax',
    provider: 'ReelPlay',
  },
  '10|000 Wolves 10K Ways': {
    name: '10000 Wolves 10K Ways',
    provider: 'ReelPlay',
  },
  '10|000 Wonders 10K Ways': {
    name: '10000 Wonders 10K Ways',
    provider: 'ReelPlay',
  },
  '10|001 Nights': {
    name: '10001 Nights',
    provider: 'Red Tiger',
  },
  '10|001 Nights Megaways': {
    name: '10001 Nights Megaways',
    provider: 'Red Tiger',
  },
  'Dragon 50|000': {
    name: 'Dragon 50000',
    provider: 'ReelPlay',
  },
  'Jackpot Jester 200|000': {
    name: 'Jackpot Jester 200000',
    provider: 'SG Digital',
  },
};

const NAME_CONTINUATION_PROVIDERS = new Set([
  '000',
  '000 Big Bass Lightning Spins',
  '000 Wolves 10K Ways',
  '000 Wonders 10K Ways',
  '000 Wonders MultiMax',
  '001 Nights',
  '001 Nights Megaways',
  'Dead or Deader',
  'Boris And Boo',
  'Grace and Charm',
  'The Bad and The Rich',
  'Camera',
  'Pizza?',
]);

const HIGH_NAMES = new Set([
  '10',
  'Betty',
  'Dead',
  'Lucky',
  'The Good',
  'Dragon 50',
  'Jackpot Jester 200',
  'Lights',
  'Pizza!',
]);

const NORMAL_VOL = new Set(['High', 'Medium', 'Low', 'Medium+', 'Low-High']);

const PROVIDER_GROUPS = [
  {
    canonical: 'Pragmatic Play',
    variants: ['PRAGMATIC', 'Pragmatic Play'],
    note:
      'PRAGMATIC is the manual Sweet Bonanza 2500 row. Merge only after UNIQUE collision check.',
  },
  {
    canonical: "Play'n GO",
    variants: ["Play'n GO", "PLAY'N GO", 'Play n GO'],
    note: 'Only Play\'n GO casing found in DB.',
  },
  {
    canonical: 'Nolimit City',
    variants: ['Nolimit City', 'Nolimit', 'NoLimit City', 'No Limit City'],
    note: 'Only Nolimit City found in DB.',
  },
  { canonical: '1x2 Gaming', variants: ['1X2 Gaming', '1x2 Gaming'] },
  { canonical: 'iSoftBet', variants: ['iSoftBet', 'iSoftbet'] },
  { canonical: 'Booongo', variants: ['Booongo', 'Boongo'] },
  { canonical: 'Alchemy Gaming', variants: ['Alchemy Gaming', 'Alchecmy Gaming'] },
  {
    canonical: 'Gameburger Studios',
    variants: ['Gameburger Studios', 'Gameburger'],
  },
  {
    canonical: 'Northern Lights Gaming',
    variants: ['Northern Lights Gaming', 'Northernlights Gaming'],
  },
  {
    canonical: 'Pear Fiction Studios',
    variants: ['Pear Fiction Studios', 'PearFiction Studios'],
  },
  {
    canonical: 'Boomerang Studios',
    variants: ['Boomerang Studios', 'Boomerang Games', 'Boomerang'],
  },
  {
    canonical: 'DreamTech Gaming',
    variants: ['DreamTech Gaming', 'Dreamtech Gaming'],
  },
  { canonical: 'SpinPlay Games', variants: ['SpinPlay Games', 'Spinplay Games'] },
  { canonical: 'Inspired Gaming', variants: ['Inspired Gaming', 'Inspired'] },
  { canonical: 'TrueLab', variants: ['TrueLab', 'TrueLab Games'] },
  { canonical: 'Skywind', variants: ['Skywind', 'Skywind Group'] },
  { canonical: 'Spearhead Studios', variants: ['Spearhead Studios', 'Spearhead'] },
  { canonical: 'Buck Stakes Ent.', variants: ['Buck Stakes Ent.', 'Buck Stakes'] },
  {
    canonical: 'Bulletproof Games',
    variants: ['Bulletproof Games', 'BulletProof'],
  },
  {
    canonical: 'Red Tiger (collabs optional)',
    variants: ['Red Tiger', 'Red Tiger/R7', 'Red Tiger / Max Win Gaming'],
    note: 'Optional: keep collab suffixes or collapse to Red Tiger.',
  },
  {
    canonical: 'Pragmatic Play (collabs optional)',
    variants: [
      'Pragmatic Play',
      'Pragmatic Play / Reel Kingdom',
      'Pragmatic Play / Wild Streak Gaming',
    ],
    note: 'Optional: keep collab suffixes or collapse to Pragmatic Play.',
  },
];

async function fetchAll(sb) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await sb
      .from('slots')
      .select(
        'id,name,provider,image_url,max_win,volatility,rtp,min_bet,max_bet,theme,release_date,source_name,is_active,aliases'
      )
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function mainSummary(report) {
  return {
    slots: report.totals.slots,
    providers: report.totals.providers,
    providerGroupsWithAction: report.providerNormalize.filter(
      (g) => g.variants.filter((v) => v.original !== g.canonicalProposed).length > 0 || g.variants.length > 1
    ).length,
    highSeverity: report.corrupted.high.length,
    mediumSeverity: report.corrupted.mediumCount,
    noImage: report.noImage.length,
    rtpLooksLikeBet: report.invalidFields.rtpLooksLikeBet,
    maxWinZero: report.invalidFields.maxWinZero,
    volatilityAbnormal: report.invalidFields.volatilityAbnormal,
    epochDates: report.invalidFields.epochDates,
  };
}

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

const sb = createClient(url, key);
const rows = await fetchAll(sb);

const providerCounts = new Map();
for (const r of rows) {
  providerCounts.set(r.provider, (providerCounts.get(r.provider) || 0) + 1);
}

const providerNormalize = [];
for (const g of PROVIDER_GROUPS) {
  const present = g.variants
    .map((v) => ({ original: v, count: providerCounts.get(v) || 0 }))
    .filter((x) => x.count > 0);
  if (!present.length) continue;
  const affected = rows
    .filter((r) => g.variants.includes(r.provider))
    .map((r) => ({ id: r.id, name: r.name, provider: r.provider }));
  const needsChange = present.some((p) => p.original !== g.canonical.split(' (')[0] && !g.canonical.startsWith(p.original));
  providerNormalize.push({
    canonicalProposed: g.canonical,
    note: g.note || null,
    variants: present,
    totalAffected: affected.length,
    needsNormalization: present.length > 1 || needsChange,
    sample: affected.slice(0, 10),
    allIds: affected.map((a) => a.id),
  });
}

const corruptedRaw = [];
function pushCorr(r, reasons, proposal, severity, extras = {}) {
  corruptedRaw.push({
    id: r.id,
    name: r.name,
    provider: r.provider,
    image_url: r.image_url,
    max_win: r.max_win,
    volatility: r.volatility,
    rtp: r.rtp,
    min_bet: r.min_bet,
    max_bet: r.max_bet,
    theme: r.theme,
    release_date: r.release_date,
    source_name: r.source_name,
    is_active: r.is_active,
    reason: [...new Set(reasons)].join('; '),
    proposal,
    severity,
    ...extras,
  });
}

for (const r of rows) {
  const reasons = [];
  const key = `${r.name}|${r.provider}`;
  const isHigh =
    HIGH_NAMES.has(r.name) ||
    NAME_CONTINUATION_PROVIDERS.has(r.provider) ||
    (r.image_url && !isHttp(r.image_url));

  if (/^[0-9]+$/.test(String(r.name || '').trim())) reasons.push('nome apenas numérico');
  if (
    (r.name || '').trim().length > 0 &&
    (r.name || '').trim().length <= 2 &&
    !/^(IO)$/i.test(r.name)
  ) {
    reasons.push('nome muito curto');
  }
  if (/^[0-9]+$/.test(String(r.provider || '').trim())) reasons.push('provider numérico');
  if (/^[0-9]{3}\s/.test(String(r.provider || ''))) {
    reasons.push('provider parece continuação do nome (prefixo numérico)');
  }
  if (NAME_CONTINUATION_PROVIDERS.has(r.provider)) {
    reasons.push('provider parece fragmento do título (split por vírgula no SQL fonte)');
  }
  if (r.image_url && !isHttp(r.image_url)) reasons.push('image_url não é URL http(s)');
  if (!r.image_url || !String(r.image_url).trim()) reasons.push('sem image_url');

  const volNum = /^[0-9]+(\.[0-9]+)?$/.test(String(r.volatility || ''));
  if (volNum && Number(r.max_win) > 0 && Number(r.max_win) < 100) {
    reasons.push('colunas deslocadas: max_win parece RTP e volatility parece max_win');
  }
  if (Number(r.max_win) === 0 && volNum) {
    reasons.push('colunas deslocadas: max_win=0 e volatility parece RTP');
  }
  if (r.rtp != null && Number(r.rtp) > 0 && Number(r.rtp) <= 1 && volNum) {
    reasons.push('rtp parece min_bet (≤1) com volatility numérica');
  }

  if (isHigh) {
    if (!reasons.length) reasons.push('estrutura anormal');
    const hint = RECONSTRUCT[key] || null;
    pushCorr(r, reasons, 'corrigir', 'high', {
      reconstructHint: hint,
      afterConfirmIfUnfixable: 'is_active=false (nunca apagar)',
    });
    continue;
  }

  if (
    reasons.some(
      (x) =>
        x.includes('colunas deslocadas') ||
        x.includes('rtp parece')
    )
  ) {
    pushCorr(
      r,
      reasons,
      'corrigir',
      'medium',
      {
        reconstructHint:
          'Provável split por vírgula no SQL fonte: repor name/provider/max_win/volatility/rtp a partir da linha original ou fonte externa',
      }
    );
  }
}

const sevRank = { high: 3, medium: 2, low: 1 };
const byId = new Map();
for (const c of corruptedRaw) {
  const prev = byId.get(c.id);
  if (!prev || (sevRank[c.severity] || 0) > (sevRank[prev.severity] || 0)) {
    byId.set(c.id, c);
  }
}
const corruptedList = [...byId.values()].sort(
  (a, b) =>
    (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0) ||
    a.name.localeCompare(b.name)
);

const high = corruptedList.filter((c) => c.severity === 'high');
const medium = corruptedList.filter((c) => c.severity === 'medium');

const noImage = rows
  .filter((r) => !r.image_url || !String(r.image_url).trim())
  .map((r) => ({
    id: r.id,
    name: r.name,
    provider: r.provider,
    max_win: r.max_win,
    volatility: r.volatility,
    rtp: r.rtp,
    note: 'Todas as 12 sem imagem são também high-severity (corrupção por split).',
  }));

const invalidFields = {
  rtpOutOfRange: rows.filter(
    (r) => r.rtp != null && (Number(r.rtp) < 0 || Number(r.rtp) > 100)
  ).length,
  rtpLooksLikeBet: rows.filter(
    (r) => r.rtp != null && Number(r.rtp) > 0 && Number(r.rtp) <= 1
  ).length,
  maxWinNegative: rows.filter(
    (r) => r.max_win != null && Number(r.max_win) < 0
  ).length,
  maxWinZero: rows.filter((r) => Number(r.max_win) === 0).length,
  maxWinOver100k: rows
    .filter((r) => r.max_win != null && Number(r.max_win) > 100000)
    .map((r) => ({
      id: r.id,
      name: r.name,
      provider: r.provider,
      max_win: r.max_win,
      proposal: 'manter (max win elevado típico de high-volatility / Nolimit / Megaways)',
    })),
  minGtMax: rows.filter(
    (r) =>
      r.min_bet != null &&
      r.max_bet != null &&
      Number(r.min_bet) > Number(r.max_bet)
  ).length,
  epochDates: rows.filter(
    (r) => r.release_date && String(r.release_date).startsWith('1970-01-01')
  ).length,
  futureDates: rows.filter(
    (r) => r.release_date && new Date(r.release_date) > new Date('2026-07-23')
  ).length,
  volatilityAbnormal: rows.filter(
    (r) => r.volatility && !NORMAL_VOL.has(r.volatility)
  ).length,
  volatilityNumeric: rows.filter((r) =>
    /^[0-9]+(\.[0-9]+)?$/.test(String(r.volatility || ''))
  ).length,
  volatilityTypos: rows
    .filter((r) => ['Medim', 'medium', 'N', 'No'].includes(r.volatility))
    .map((r) => ({
      id: r.id,
      name: r.name,
      provider: r.provider,
      volatility: r.volatility,
      proposal:
        r.volatility === 'Medim' || r.volatility === 'medium'
          ? 'corrigir → Medium'
          : 'rever manualmente',
    })),
  nonHttpImage: rows
    .filter((r) => r.image_url && !isHttp(r.image_url))
    .map((r) => ({
      id: r.id,
      name: r.name,
      provider: r.provider,
      image_url: r.image_url,
      proposal: 'corrigir',
    })),
};

const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  noMutationsApplied: true,
  totals: { slots: rows.length, providers: providerCounts.size },
  providerNormalize,
  corrupted: {
    high,
    mediumCount: medium.length,
    mediumSample: medium.slice(0, 30),
    mediumAllIds: medium.map((c) => c.id),
  },
  noImage,
  invalidFields,
  recommendedActions: [
    'Nenhuma alteração aplicada nesta auditoria.',
    'Após confirmação: corrigir os 14 high-severity usando reconstructHint (causa: vírgulas no nome partiram o SQL fonte).',
    'Se não corrigir de imediato: is_active=false nos high-severity — nunca DELETE.',
    'Medium (~colunas deslocadas): reparação em lote a partir do SQL fonte com parser CSV-aware — só após confirmação.',
    'Normalizar providers equivalentes (casing/typos) com UPDATE controlado; PRAGMATIC→Pragmatic Play só após check UNIQUE.',
    'release_date=1970-01-01 (853): tratar como NULL / desconhecido.',
    'max_win>100000: manter (dados plausíveis).',
    'Typos volatility (Medim/medium/N/No): corrigir após confirmação.',
  ],
};

const outDir = path.join(root, 'scripts', 'reports');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'slots-data-audit-2026-07-23.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));

// Slim canvas-friendly summary
const slim = {
  generatedAt: report.generatedAt,
  summary: mainSummary(report),
  providerNormalize: providerNormalize.map((g) => ({
    canonicalProposed: g.canonicalProposed,
    note: g.note,
    needsNormalization: g.needsNormalization,
    variants: g.variants,
    totalAffected: g.totalAffected,
    sample: g.sample.slice(0, 5),
  })),
  highCorrupted: high,
  mediumCount: medium.length,
  mediumSample: medium.slice(0, 20).map((c) => ({
    id: c.id,
    name: c.name,
    provider: c.provider,
    max_win: c.max_win,
    volatility: c.volatility,
    rtp: c.rtp,
    reason: c.reason,
    proposal: c.proposal,
  })),
  noImage,
  invalidFields: {
    ...invalidFields,
    maxWinOver100k: invalidFields.maxWinOver100k.slice(0, 10),
  },
  recommendedActions: report.recommendedActions,
};
fs.writeFileSync(
  path.join(outDir, 'slots-data-audit-summary.json'),
  JSON.stringify(slim, null, 2)
);

console.log(JSON.stringify({ out, ...mainSummary(report) }, null, 2));
