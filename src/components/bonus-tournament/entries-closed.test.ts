import { describe, expect, it } from 'vitest';
import {
  areEntriesClosedForDraw,
  entriesClosedUiLabel,
  isTournamentEntriesClosed,
} from './entries-closed';
import { canGenerateDraw } from './draw-presentation-machine';

describe('entries closed SoT', () => {
  it('treats tournament entries_open=false as closed', () => {
    expect(isTournamentEntriesClosed(false)).toBe(true);
    expect(isTournamentEntriesClosed(true)).toBe(false);
  });

  it('blocks draw when tournament still open and presentation not closed', () => {
    expect(
      areEntriesClosedForDraw({
        tournamentEntriesOpen: true,
        presentationEntriesClosed: false,
      }),
    ).toBe(false);
    expect(canGenerateDraw(8, false)).toBe(false);
  });

  it('allows draw when tournament closed even if presentation mirror is stale', () => {
    expect(
      areEntriesClosedForDraw({
        tournamentEntriesOpen: false,
        presentationEntriesClosed: false,
      }),
    ).toBe(true);
    expect(
      canGenerateDraw(
        8,
        areEntriesClosedForDraw({
          tournamentEntriesOpen: false,
          presentationEntriesClosed: false,
        }),
      ),
    ).toBe(true);
  });

  it('allows draw when presentation mirror is closed', () => {
    expect(
      areEntriesClosedForDraw({
        tournamentEntriesOpen: true,
        presentationEntriesClosed: true,
      }),
    ).toBe(true);
  });

  it('keeps independent closed flags per boolean inputs (tournament A vs B)', () => {
    const a = areEntriesClosedForDraw({
      tournamentEntriesOpen: false,
      presentationEntriesClosed: false,
    });
    const b = areEntriesClosedForDraw({
      tournamentEntriesOpen: true,
      presentationEntriesClosed: false,
    });
    expect(a).toBe(true);
    expect(b).toBe(false);
  });

  it('ui label only reflects confirmed closed boolean', () => {
    expect(entriesClosedUiLabel(true)).toBe('Encerradas');
    expect(entriesClosedUiLabel(false)).toBe('Abertas');
  });
});
