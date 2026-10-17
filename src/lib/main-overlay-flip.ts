/**
 * Main-stream sidebar FLIP 3D transition — timing + identity helpers only.
 * Perspective / transform stay inside the fixed sidebar frame (never Slot View).
 */

export const MAIN_OVERLAY_FLIP_DURATION_MS = 700;

/** Smooth acceleration / deceleration for the full 180° card flip. */
export const MAIN_OVERLAY_FLIP_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

export type MainOverlayFlipIdentity = {
  type: string | null;
  id: string | null;
};

export function sameMainOverlayIdentity(
  a: MainOverlayFlipIdentity,
  b: MainOverlayFlipIdentity,
): boolean {
  return a.type === b.type && a.id === b.id;
}

/**
 * Decide whether to start a flip, queue a superseding target, or no-op.
 * While flipping, a newer distinct target is queued (current flip finishes first).
 */
export function planMainOverlayFlip(args: {
  current: MainOverlayFlipIdentity;
  next: MainOverlayFlipIdentity;
  flipping: boolean;
  pending: MainOverlayFlipIdentity | null;
}): 'noop' | 'start' | 'queue' {
  if (sameMainOverlayIdentity(args.current, args.next)) {
    // Idle: already there. Flipping: in-flight target reaffirmed (ignore duplicate Realtime).
    return 'noop';
  }
  if (args.flipping) {
    if (args.pending && sameMainOverlayIdentity(args.pending, args.next)) {
      return 'noop';
    }
    return 'queue';
  }
  return 'start';
}
