import { describe, expect, it } from 'vitest';
import { pickMainOverlay } from './main-overlay-priority';

describe('pickMainOverlay', () => {
  it('prefers opening over hunt / chill / tournament', () => {
    expect(
      pickMainOverlay({
        openingId: 'o1',
        huntId: 'h1',
        chillId: 'c1',
        bonusTournamentId: 't1',
      }),
    ).toEqual({ type: 'opening', id: 'o1' });
  });

  it('prefers chill over ACTIVE bonus tournament (BT stays ACTIVE in DB)', () => {
    expect(
      pickMainOverlay({
        chillId: 'c1',
        bonusTournamentId: 't1',
      }),
    ).toEqual({ type: 'chill', id: 'c1' });
  });

  it('surfaces bonus tournament when nothing else claims main', () => {
    expect(pickMainOverlay({ bonusTournamentId: 't1' })).toEqual({
      type: 'tournament',
      id: 't1',
    });
  });

  it('returns null when empty', () => {
    expect(pickMainOverlay({})).toEqual({ type: null, id: null });
  });
});
