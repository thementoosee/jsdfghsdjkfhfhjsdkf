import type { BonusTournamentEntry } from './types';

/** Mulberry32 — deterministic PRNG for stable layouts. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashEntriesSeed(entries: BonusTournamentEntry[]): number {
  const key = entries.map((e) => e.twitchUserId).join('|');
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Stable roster identity for circulation bootstrap.
 * Same twitch id set → same key (order-independent), so polling with a new array
 * reference must NOT remount / restart float animations.
 */
export function entriesRosterIdentity(entries: BonusTournamentEntry[]): string {
  return entries
    .map((e) => e.twitchUserId)
    .filter(Boolean)
    .sort()
    .join('|');
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const FLOAT_AVATAR = 52;
export const FLOAT_NAME_MAX = 128;
export const FLOAT_GAP = 10;
export const FLOAT_UNIT_H = 56;
/** Avatar gold ring extends outside the box — count it in bounds. */
export const FLOAT_RING = 2;
/** Keep full chip (incl. ring) inside the field. */
export const FLOAT_SAFE_MARGIN = 16;
/** Extra bottom inset — clears parent overlay border-radius clipping. */
export const FLOAT_BOTTOM_EXTRA = 10;
/**
 * Hard cap for simultaneous floaters in 288px width.
 * Vertical rhythm is the primary anti-collision strategy.
 */
export const FLOAT_MAX_VISIBLE = 7;

/**
 * How many visual floater instances to prepare (may include artificial repeats).
 * Artificial fill only when unique count < 20. Never mutates the source list.
 */
export function targetVisualCount(uniqueCount: number): number {
  if (uniqueCount <= 0) return 0;
  if (uniqueCount <= 3) return Math.min(FLOAT_MAX_VISIBLE, Math.max(6, uniqueCount * 2));
  if (uniqueCount <= 9) return Math.min(FLOAT_MAX_VISIBLE, uniqueCount);
  if (uniqueCount <= 19) return Math.min(FLOAT_MAX_VISIBLE, uniqueCount);
  return uniqueCount; // real set only — visibility capped separately
}

/** @deprecated row helper kept for older tests — prefer targetVisualCount */
export function targetSlotsPerRow(uniqueCount: number): number {
  return targetVisualCount(uniqueCount);
}

/** Max chip width that still fits with lateral safety margins. */
export function maxFloaterWidth(fieldW: number): number {
  return Math.max(
    FLOAT_AVATAR + FLOAT_GAP + 48,
    fieldW - FLOAT_SAFE_MARGIN * 2,
  );
}

export function estimateFloaterWidth(displayName: string, fieldW?: number): number {
  // Rubik 16px semibold — bias high; include ring so circles stay fully visible
  const textW = Math.min(FLOAT_NAME_MAX, Math.max(56, Math.round(displayName.length * 11.2)));
  let w = FLOAT_AVATAR + FLOAT_GAP + textW + FLOAT_RING * 2;
  if (fieldW != null) w = Math.min(w, maxFloaterWidth(fieldW));
  return w;
}

/** Name column width for a chip of total width `chipW`. */
export function nameMaxForChip(chipW: number): number {
  return Math.max(40, chipW - FLOAT_AVATAR - FLOAT_GAP - FLOAT_RING * 2);
}

/**
 * Clamp horizontal amplitude so resting ± amp stays inside safe margins.
 * Prefer reducing amp over clipping.
 */
export function fitAmplitudeX(
  x: number,
  w: number,
  fieldW: number,
  desiredAmp: number,
): number {
  const minX = FLOAT_SAFE_MARGIN;
  const maxX = fieldW - w - FLOAT_SAFE_MARGIN;
  if (maxX < minX) return 0;
  const room = Math.min(x - minX, maxX - x);
  return Math.max(0, Math.min(desiredAmp, room));
}

export function fitAmplitudeY(
  y: number,
  h: number,
  fieldH: number,
  desiredAmp: number,
): number {
  const minY = FLOAT_SAFE_MARGIN;
  const maxY = fieldH - h - FLOAT_SAFE_MARGIN - FLOAT_BOTTOM_EXTRA;
  if (maxY < minY) return 0;
  const room = Math.min(y - minY, maxY - y);
  return Math.max(0, Math.min(desiredAmp, room));
}

export interface FloatingUnitLayout {
  /** Stable visual slot id (survives soft entry rotation). */
  slotId: string;
  entry: BonusTournamentEntry;
  /** Resting top-left inside the field. */
  x: number;
  y: number;
  w: number;
  h: number;
  ampX: number;
  ampY: number;
  /** Angular speed (rad/s). */
  speedX: number;
  speedY: number;
  phaseX: number;
  phaseY: number;
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad: number,
): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

/**
 * Build a visual-only pool (artificial repeats when few uniques).
 * Does not mutate `entries`. Counter must always use `entries.length`.
 */
export function buildVisualPool(entries: BonusTournamentEntry[]): BonusTournamentEntry[] {
  const n = entries.length;
  if (n === 0) return [];
  const seed = hashEntriesSeed(entries);
  const rng = mulberry32(seed ^ 0x51eed);
  const target = targetVisualCount(n);

  if (n >= 20) {
    return shuffle([...entries], rng);
  }

  const filled: BonusTournamentEntry[] = [];
  let base = shuffle([...entries], rng);
  while (filled.length < target) {
    for (const e of base) {
      filled.push(e);
      if (filled.length >= target) break;
    }
    base = shuffle([...entries], rng);
  }

  for (let i = 1; i < filled.length; i += 1) {
    if (filled[i].twitchUserId !== filled[i - 1].twitchUserId) continue;
    for (let j = i + 1; j < filled.length; j += 1) {
      if (filled[j].twitchUserId !== filled[i - 1].twitchUserId) {
        [filled[i], filled[j]] = [filled[j], filled[i]];
        break;
      }
    }
  }
  return filled.slice(0, target);
}

/**
 * Staggered packing — safe margins, amp fitted to real chip width.
 * Guarantees resting ± amp stays fully inside the field.
 */
export function layoutFloatingUnits(
  entries: BonusTournamentEntry[],
  fieldW: number,
  fieldH: number,
): FloatingUnitLayout[] {
  if (entries.length === 0 || fieldW < 80 || fieldH < 80) return [];

  const pool = buildVisualPool(entries);
  const seed = hashEntriesSeed(entries) ^ (Math.round(fieldW) * 73856093) ^ (Math.round(fieldH) * 19349663);
  const rng = mulberry32(seed);

  const margin = FLOAT_SAFE_MARGIN;
  const visible = pool.slice(0, FLOAT_MAX_VISIBLE);
  const n = visible.length;
  if (n === 0) return [];

  const vPadTop = margin + 4;
  const vPadBottom = margin + FLOAT_BOTTOM_EXTRA + 4;
  const usableH = Math.max(1, fieldH - FLOAT_UNIT_H - vPadTop - vPadBottom);
  const minStep = FLOAT_UNIT_H + 18;
  const step = n <= 1 ? 0 : Math.max(minStep, usableH / (n - 1));
  const fitCount = Math.max(1, Math.min(n, Math.floor(usableH / minStep) + 1));

  const placed: FloatingUnitLayout[] = [];

  for (let i = 0; i < fitCount; i += 1) {
    const entry = visible[i];
    const w = estimateFloaterWidth(entry.displayName, fieldW);
    const h = FLOAT_UNIT_H;

    const minX = margin;
    const maxX = fieldW - w - margin;
    const minY = margin;
    const maxY = fieldH - h - margin - FLOAT_BOTTOM_EXTRA;
    if (maxX < minX || maxY < minY) continue;

    const lane = i % 2;
    const travel = Math.max(0, maxX - minX);
    let x: number;
    if (lane === 0) {
      x = minX + rng() * travel * 0.38;
    } else {
      x = minX + travel * (0.52 + rng() * 0.48);
    }
    x = Math.min(maxX, Math.max(minX, x));

    const yJitter = (rng() - 0.5) * Math.min(16, step * 0.3);
    let y = vPadTop + i * step + yJitter;
    y = Math.min(maxY, Math.max(minY, y));

    // Desired organic amps — then fit to remaining room (never clip)
    let ampY = fitAmplitudeY(y, h, fieldH, 5 + rng() * 7);
    let ampX = fitAmplitudeX(x, w, fieldW, 10 + rng() * 16);

    // Re-center slightly if amp collapsed to zero on a jammed edge
    if (ampX < 4 && travel > 20) {
      x = minX + travel * (0.25 + (lane === 0 ? 0 : 0.35) + rng() * 0.15);
      x = Math.min(maxX, Math.max(minX, x));
      ampX = fitAmplitudeX(x, w, fieldW, 10 + rng() * 14);
    }

    const envelope = {
      x: x - ampX,
      y: y - ampY,
      w: w + ampX * 2,
      h: h + ampY * 2,
    };
    for (let guard = 0; guard < 16; guard += 1) {
      const hit = placed.find((p) =>
        overlaps(
          envelope,
          { x: p.x - p.ampX, y: p.y - p.ampY, w: p.w + p.ampX * 2, h: p.h + p.ampY * 2 },
          10,
        ),
      );
      if (!hit) break;
      y = Math.min(maxY, hit.y + hit.h + hit.ampY + ampY + 12);
      ampY = fitAmplitudeY(y, h, fieldH, ampY);
      envelope.y = y - ampY;
      envelope.h = h + ampY * 2;
    }

    ampX = fitAmplitudeX(x, w, fieldW, ampX);
    ampY = fitAmplitudeY(y, h, fieldH, ampY);

    const dir = (lane === 0 ? 1 : -1) * (rng() < 0.42 ? -1 : 1);

    placed.push({
      slotId: `slot-${i}`,
      entry,
      x,
      y,
      w,
      h,
      ampX,
      ampY,
      speedX: ((Math.PI * 2) / (11 + rng() * 11)) * dir,
      speedY: (Math.PI * 2) / (4.5 + rng() * 3.5),
      phaseX: rng() * Math.PI * 2,
      phaseY: rng() * Math.PI * 2,
    });
  }

  return placed;
}

/**
 * After measuring the real DOM chip width, retarget x/amp so motion never clips.
 */
export function retargetUnitToMeasuredWidth(
  unit: FloatingUnitLayout,
  measuredW: number,
  fieldW: number,
  fieldH: number,
): FloatingUnitLayout {
  const w = Math.min(Math.ceil(measuredW), maxFloaterWidth(fieldW));
  const minX = FLOAT_SAFE_MARGIN;
  const maxX = fieldW - w - FLOAT_SAFE_MARGIN;
  let x = unit.x;
  if (maxX >= minX) {
    x = Math.min(maxX, Math.max(minX, x));
  } else {
    x = minX;
  }
  const ampX = fitAmplitudeX(x, w, fieldW, unit.ampX);
  const ampY = fitAmplitudeY(unit.y, unit.h, fieldH, unit.ampY);
  return { ...unit, w, x, ampX, ampY };
}

/**
 * Soft rotation: which pool entries map onto fixed slots when pool > slots.
 * Index advances slowly; positions/motion stay on the slot.
 */
export function pickRotatedEntries(
  pool: BonusTournamentEntry[],
  slotCount: number,
  rotationIndex: number,
): BonusTournamentEntry[] {
  if (pool.length <= slotCount) return pool.slice(0, slotCount);
  const out: BonusTournamentEntry[] = [];
  for (let i = 0; i < slotCount; i += 1) {
    out.push(pool[(rotationIndex + i) % pool.length]);
  }
  return out;
}

/** Legacy 4-row builder — kept so existing tests still cover fill rules. */
export function buildCarouselRows(
  entries: BonusTournamentEntry[],
  rowCount = 4,
): BonusTournamentEntry[][] {
  const unique = entries;
  const n = unique.length;
  if (n === 0) return Array.from({ length: rowCount }, () => []);

  const seed = hashEntriesSeed(unique);
  const slots = targetVisualCount(n);
  const rows: BonusTournamentEntry[][] = [];

  for (let r = 0; r < rowCount; r += 1) {
    const rowRng = mulberry32(seed ^ ((r + 1) * 0x9e3779b9));
    let base = shuffle(unique, rowRng);
    const offset = Math.floor(rowRng() * n);
    base = [...base.slice(offset), ...base.slice(0, offset)];

    const filled: BonusTournamentEntry[] = [];
    while (filled.length < slots) {
      for (const e of base) {
        filled.push(e);
        if (filled.length >= slots) break;
      }
      if (n >= 20) break;
      base = shuffle(unique, rowRng);
    }
    rows.push(filled.slice(0, Math.max(slots, n >= 20 ? n : slots)));
  }
  return rows;
}

/** Format mm:ss for the entries countdown. */
export function formatEntriesTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
