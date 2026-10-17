/**
 * Mirrors Edge `_shared/bt-draw.ts` generate gate — tournament.entries_open is SoT.
 */
import { describe, expect, it } from 'vitest';

function isTournamentEntriesClosed(entriesOpen: boolean | null | undefined): boolean {
  return entriesOpen === false;
}

function assertGenerateAllowed(args: {
  presentationEntriesClosed: boolean;
  tournamentEntriesOpen: boolean | null | undefined;
}): void {
  const tournamentClosed = isTournamentEntriesClosed(args.tournamentEntriesOpen);
  const closed = args.presentationEntriesClosed || tournamentClosed;
  if (!closed) throw new Error('Close entries first');
}

describe('Edge GENERATE entries-closed gate (mirrored)', () => {
  it('rejects when both tournament open and presentation open', () => {
    expect(() =>
      assertGenerateAllowed({
        presentationEntriesClosed: false,
        tournamentEntriesOpen: true,
      }),
    ).toThrow('Close entries first');
  });

  it('allows when Dashboard closed tournament even without presentation row', () => {
    expect(() =>
      assertGenerateAllowed({
        presentationEntriesClosed: false,
        tournamentEntriesOpen: false,
      }),
    ).not.toThrow();
  });

  it('allows when presentation mirror is closed', () => {
    expect(() =>
      assertGenerateAllowed({
        presentationEntriesClosed: true,
        tournamentEntriesOpen: true,
      }),
    ).not.toThrow();
  });

  it('still rejects if tournament open and unknown presentation (open)', () => {
    expect(() =>
      assertGenerateAllowed({
        presentationEntriesClosed: false,
        tournamentEntriesOpen: null,
      }),
    ).toThrow('Close entries first');
  });
});
