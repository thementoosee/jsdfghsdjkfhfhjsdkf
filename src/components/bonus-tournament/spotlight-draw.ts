import type { DrawParticipant } from './draw-types';

/**
 * Progress fractions of reveal_player (duration = DRAW_TIMING.revealPlayerMs).
 * At 3600ms: spin ~1800 · fade sats ~300 · glide ~1100 · name settle ~400.
 */
export const SPOTLIGHT_SPIN_END = 0.5;
/** Satellites fully faded; selected hero still at spin anchor. */
export const SPOTLIGHT_FADE_END = 0.583;
/** Soft glide to wait-stack center complete. */
export const SPOTLIGHT_LAND_END = 0.889;

const DEFAULT_STEPS = 28;

/**
 * Deterministic face sequence that always ends on the persisted winner.
 * Animation only displays this order — it never picks the result.
 */
export function buildSpotlightSequence(
  pool: DrawParticipant[],
  winner: DrawParticipant,
  steps = DEFAULT_STEPS,
): DrawParticipant[] {
  const n = Math.max(2, steps);
  const others = pool.filter((p) => p.twitchUserId !== winner.twitchUserId);
  const seq: DrawParticipant[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (others.length === 0) {
      seq.push(winner);
    } else {
      // Alternate through others; avoid immediate repeats when possible.
      seq.push(others[i % others.length]!);
    }
  }
  seq.push(winner);
  return seq;
}

/**
 * Map phase progress → sequence index.
 * Ease-out so early progress burns many faces (fast) and late progress holds longer (slow).
 */
export function spotlightIndexAtProgress(progress: number, steps: number, spinEnd = SPOTLIGHT_SPIN_END): number {
  if (steps <= 1) return 0;
  const t = Math.min(1, Math.max(0, progress / spinEnd));
  const eased = 1 - Math.pow(1 - t, 2.85);
  return Math.min(steps - 1, Math.floor(eased * (steps - 1) + 1e-9));
}

/** Four satellite participants (never the current center face), stable order. */
export function pickSpotlightSatellites(
  pool: DrawParticipant[],
  center: DrawParticipant,
  count = 4,
): DrawParticipant[] {
  const rest = pool.filter((p) => p.twitchUserId !== center.twitchUserId);
  if (rest.length === 0) return [];
  const out: DrawParticipant[] = [];
  for (let i = 0; i < count; i++) {
    out.push(rest[i % rest.length]!);
  }
  return out;
}

/**
 * Fixed orbital positions (px from center). Distance keeps ~42px satellites
 * clear of a ~120px hero and of each other inside 288px width.
 * Order: north, east, south, west.
 */
export const SPOTLIGHT_ORBIT: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: -108 },
  { x: 102, y: 0 },
  { x: 0, y: 108 },
  { x: -102, y: 0 },
];

/**
 * Soft land easing ≈ CSS cubic-bezier(0.22, 1, 0.36, 1).
 * Progress-driven (no CSS transition) so OBS sync stays deterministic.
 */
export function easeSoftLand(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return cubicBezier(x, 0.22, 1, 0.36, 1);
}

function bezier1D(s: number, p1: number, p2: number): number {
  const u = 1 - s;
  return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s;
}

function bezier1DDeriv(s: number, p1: number, p2: number): number {
  const u = 1 - s;
  return 3 * u * u * p1 + 6 * u * s * (p2 - p1) + 3 * s * s * (1 - p2);
}

/** Solve cubic-bezier x1,y1,x2,y2 for input x ∈ [0,1] → y. */
function cubicBezier(x: number, x1: number, y1: number, x2: number, y2: number): number {
  let s = x;
  for (let i = 0; i < 8; i++) {
    const xErr = bezier1D(s, x1, x2) - x;
    const dx = bezier1DDeriv(s, x1, x2);
    if (Math.abs(dx) < 1e-6) break;
    s = Math.min(1, Math.max(0, s - xErr / dx));
  }
  return bezier1D(s, y1, y2);
}
