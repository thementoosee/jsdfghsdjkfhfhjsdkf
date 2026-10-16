import { describe, expect, it } from 'vitest';
import {
  ENTRIES_DOT_GREEN,
  ENTRIES_DOT_RED,
  ENTRIES_DOT_YELLOW,
  entriesStatusDotColor,
} from './EntriesOverlay';

describe('entriesStatusDotColor', () => {
  it('green when inscriptions are open (entries phase)', () => {
    expect(
      entriesStatusDotColor({ status: 'entries', entriesOpen: true, timerClosed: false }),
    ).toBe(ENTRIES_DOT_GREEN);
  });

  it('yellow when inscriptions closed / awaiting draw', () => {
    expect(
      entriesStatusDotColor({ status: 'entries', entriesOpen: false, timerClosed: true }),
    ).toBe(ENTRIES_DOT_YELLOW);
    expect(
      entriesStatusDotColor({ status: 'draw', entriesOpen: false, timerClosed: true }),
    ).toBe(ENTRIES_DOT_YELLOW);
    expect(
      entriesStatusDotColor({ status: 'preparation', entriesOpen: false, timerClosed: true }),
    ).toBe(ENTRIES_DOT_YELLOW);
  });

  it('red when tournament rounds are active', () => {
    expect(
      entriesStatusDotColor({ status: 'qf', entriesOpen: false, timerClosed: true }),
    ).toBe(ENTRIES_DOT_RED);
    expect(
      entriesStatusDotColor({ status: 'sf', entriesOpen: false, timerClosed: true }),
    ).toBe(ENTRIES_DOT_RED);
    expect(
      entriesStatusDotColor({ status: 'final', entriesOpen: false, timerClosed: true }),
    ).toBe(ENTRIES_DOT_RED);
    expect(
      entriesStatusDotColor({ status: 'completed', entriesOpen: false, timerClosed: true }),
    ).toBe(ENTRIES_DOT_RED);
  });

  it('tournament phase wins over open flag (no misleading green during QF)', () => {
    expect(
      entriesStatusDotColor({ status: 'qf', entriesOpen: true, timerClosed: false }),
    ).toBe(ENTRIES_DOT_RED);
  });
});
