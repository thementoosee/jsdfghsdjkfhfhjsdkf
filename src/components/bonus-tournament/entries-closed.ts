/**
 * Single source of truth for Bonus Tournament entry enrollment:
 * `bonus_tournaments.entries_open` (mirrored in demo.entriesConfig.entriesOpen).
 *
 * Draw presentation `entries_closed` is a sync mirror used by the ceremony machine;
 * when the tournament says closed, the draw must treat entries as closed even if the
 * presentation row was never written yet.
 */

export function isTournamentEntriesClosed(entriesOpen: boolean): boolean {
  return entriesOpen === false;
}

/** Whether GENERATE / START may proceed (tournament SoT OR presentation mirror). */
export function areEntriesClosedForDraw(args: {
  tournamentEntriesOpen: boolean;
  presentationEntriesClosed: boolean;
}): boolean {
  return (
    isTournamentEntriesClosed(args.tournamentEntriesOpen) || args.presentationEntriesClosed
  );
}

/**
 * Optimistic UI must not show "Encerradas" unless the write succeeded (or local DEMO).
 * Use after a confirmed remote persist / CLOSE_ENTRIES ack.
 */
export function entriesClosedUiLabel(closed: boolean): 'Encerradas' | 'Abertas' {
  return closed ? 'Encerradas' : 'Abertas';
}
