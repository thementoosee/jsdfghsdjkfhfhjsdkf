import { describe, expect, it } from 'vitest';
import { generateDrawResult } from './draw-result';
import { buildDemoEntries } from './demo-data';
import {
  applyDrawLaunchToDemo,
  buildMatchesFromDrawResult,
  confirmWinnerAndAdvance,
  isMatchPlayable,
  PENDING_PLAYER_ID,
} from './match-progression';
import { defaultEntriesConfig } from './demo-data';
import type { BonusTournamentDemo } from './types';

describe('match-progression', () => {
  it('builds 4 QF + pending SF/Final from draw result', async () => {
    const result = await generateDrawResult(buildDemoEntries(12));
    const built = buildMatchesFromDrawResult(result);
    expect(built.players).toHaveLength(8);
    expect(built.matches.filter((m) => m.round === 'qf')).toHaveLength(4);
    expect(built.matches.find((m) => m.id === 'sf-0')?.playerAId).toBe(PENDING_PLAYER_ID);
    expect(built.selectedMatchId).toBe('qf-0');
  });

  it('advances QF winners into SF seats and selects next match', async () => {
    const result = await generateDrawResult(buildDemoEntries(10));
    const built = buildMatchesFromDrawResult(result);
    const base: BonusTournamentDemo = {
      id: 't1',
      name: 'TEST',
      isDemo: true,
      status: 'qf',
      entries: buildDemoEntries(10),
      entriesConfig: defaultEntriesConfig(),
      players: built.players,
      matches: built.matches,
      selectedMatchId: 'qf-0',
      overlayView: 'duel',
    };
    const winnerA = built.matches[0]!.playerAId;
    const next = confirmWinnerAndAdvance(base, 'qf-0', winnerA);
    expect(next.matches.find((m) => m.id === 'qf-0')?.status).toBe('done');
    expect(next.matches.find((m) => m.id === 'sf-0')?.playerAId).toBe(winnerA);
    expect(next.selectedMatchId).toBe('qf-1');
  });

  it('does not rebuild matches on second launch', async () => {
    const result = await generateDrawResult(buildDemoEntries(8));
    const empty: BonusTournamentDemo = {
      id: 't2',
      name: 'TEST',
      isDemo: true,
      status: 'draw',
      entries: buildDemoEntries(8),
      entriesConfig: defaultEntriesConfig({ entriesOpen: false }),
      players: [],
      matches: [],
      selectedMatchId: null,
      overlayView: 'draw',
    };
    const once = applyDrawLaunchToDemo(empty, result);
    const twice = applyDrawLaunchToDemo(once, result);
    expect(twice.matches).toHaveLength(once.matches.length);
    expect(twice.players[0]?.id).toBe(once.players[0]?.id);
  });

  it('isMatchPlayable rejects pending seats', () => {
    const players = { a: { id: 'a', twitchUserId: 'a', displayName: 'A', avatarUrl: '', slotName: '', slotImage: '' } };
    expect(
      isMatchPlayable(
        {
          id: 'sf-0',
          round: 'sf',
          index: 0,
          playerAId: PENDING_PLAYER_ID,
          playerBId: 'a',
          buyPriceA: null,
          buyPriceB: null,
          buysA: [
            { pay: null, realized: false },
            { pay: null, realized: false },
            { pay: null, realized: false },
          ],
          buysB: [
            { pay: null, realized: false },
            { pay: null, realized: false },
            { pay: null, realized: false },
          ],
          confirmedWinnerId: null,
          status: 'pending',
        },
        players,
      ),
    ).toBe(false);
  });
});
