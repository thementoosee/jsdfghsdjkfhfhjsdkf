/**
 * Priority for the OBS main-stream left sidebar transitions.
 * Higher rows win. Bonus Tournament uses is_active (not show_on_main_overlay):
 * it only surfaces when nothing above is claiming the main panel.
 */
export type MainOverlayKind = 'opening' | 'hunt' | 'fever' | 'chill' | 'tournament' | null;

export interface MainOverlayPick {
  type: MainOverlayKind;
  id: string | null;
}

export function pickMainOverlay(args: {
  openingId?: string | null;
  huntId?: string | null;
  feverId?: string | null;
  chillId?: string | null;
  /** ACTIVE bonus tournament id (is_active = true). */
  bonusTournamentId?: string | null;
}): MainOverlayPick {
  if (args.openingId) return { type: 'opening', id: args.openingId };
  if (args.huntId) return { type: 'hunt', id: args.huntId };
  if (args.feverId) return { type: 'fever', id: args.feverId };
  if (args.chillId) return { type: 'chill', id: args.chillId };
  if (args.bonusTournamentId) return { type: 'tournament', id: args.bonusTournamentId };
  return { type: null, id: null };
}
