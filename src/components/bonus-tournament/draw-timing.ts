/**
 * Presentation timings (ms).
 * Canonical file also: supabase/functions/_shared/draw-timing.json
 * Keep both identical — enforced by draw-timing.consistency.test.ts
 *
 * revealMatchMs raised to ~7s for TV-paced duel reveals (player A → B → VS → slots).
 * slotConfirmMs covers player lift + slot thumbnail entrance.
 */
export const DRAW_TIMING = {
  introMs: 2800,
  countdownStepMs: 1000,
  /** Spotlight draw: fast→slow face cycle + soft fade/glide land on winner (+~1.8s hold for audience). */
  revealPlayerMs: 5400,
  /** Player lifts up + slot thumbnail gold entrance after CONFIRMAR SLOT. */
  slotConfirmMs: 2400,
  showSelectedMs: 3200,
  /** Full matchup beat on the sidebar (~7s TV rhythm). */
  revealMatchMs: 7000,
  showBracketMs: 2400,
  commandLockMs: 350,
} as const;

export type DrawTimingKey = keyof typeof DRAW_TIMING;
