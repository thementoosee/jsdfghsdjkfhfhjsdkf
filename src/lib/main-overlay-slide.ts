/**
 * Main-stream sidebar SLIDE transition — timing + identity helpers only.
 * Transform lives inside the fixed sidebar frame (never Slot View).
 */

export const MAIN_OVERLAY_SLIDE_EXIT_MS = 900;
export const MAIN_OVERLAY_SLIDE_ENTER_MS = 900;
/** Minimum time the sidebar stays fully hidden while the next overlay is prepared. */
export const MAIN_OVERLAY_SLIDE_HIDDEN_MIN_MS = 2000;

/** Smooth continuous ease for both slide-out and slide-in. */
export const MAIN_OVERLAY_SLIDE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

export type MainOverlaySlideIdentity = {
  type: string | null;
  id: string | null;
};

export function sameMainOverlayIdentity(
  a: MainOverlaySlideIdentity,
  b: MainOverlaySlideIdentity,
): boolean {
  return a.type === b.type && a.id === b.id;
}

/**
 * Decide whether to start a slide, queue a superseding target, or no-op.
 * While sliding, a newer distinct target is queued (current slide finishes first).
 */
export function planMainOverlaySlide(args: {
  current: MainOverlaySlideIdentity;
  next: MainOverlaySlideIdentity;
  sliding: boolean;
  pending: MainOverlaySlideIdentity | null;
}): 'noop' | 'start' | 'queue' {
  if (sameMainOverlayIdentity(args.current, args.next)) {
    return 'noop';
  }
  if (args.sliding) {
    if (args.pending && sameMainOverlayIdentity(args.pending, args.next)) {
      return 'noop';
    }
    return 'queue';
  }
  return 'start';
}
