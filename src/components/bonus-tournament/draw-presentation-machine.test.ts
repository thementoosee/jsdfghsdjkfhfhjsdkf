import { describe, expect, it } from 'vitest';
import { buildDemoEntries, buildDemoSlotCatalogPicks } from './demo-data';
import {
  advancePresentation,
  applyDrawCommand,
  canConfirmSlot,
  canGenerateDraw,
  canLaunchMatchups,
  canNext,
  maybeAutoAdvance,
  mergeRemoteIfNewer,
} from './draw-presentation-machine';
import {
  countConfirmedSlots,
  createIdleDrawState,
  DRAW_MATCH_COUNT,
  DRAW_SLOT_COUNT,
} from './draw-types';

const idle = createIdleDrawState;
const picks = buildDemoSlotCatalogPicks(8);

async function toAwaitingFirstSlot() {
  let state = idle({
    tournamentId: 'demo',
    tournamentName: 'HUNT',
    uniqueEntryCount: 8,
    entriesClosed: true,
  });
  state = await applyDrawCommand(state, {
    type: 'GENERATE_DRAW',
    entries: buildDemoEntries(8),
  });
  state = await applyDrawCommand(state, { type: 'START_PRESENTATION' });
  expect(state.phase).toBe('countdown');
  expect(state.countdownValue).toBe(3);
  state = advancePresentation(state); // 2
  state = advancePresentation(state); // 1
  state = advancePresentation(state); // reveal 1
  expect(state.phase).toBe('reveal_player');
  state = advancePresentation(state); // awaiting_slot
  expect(state.phase).toBe('awaiting_slot');
  expect(state.revealedPlayers).toBe(1);
  expect(canNext(state)).toBe(false);
  expect(canConfirmSlot(state)).toBe(true);
  return state;
}

describe('draw-presentation-machine', () => {
  it('blocks generate until entries closed and ≥8', () => {
    expect(canGenerateDraw(20, false)).toBe(false);
    expect(canGenerateDraw(7, true)).toBe(false);
    expect(canGenerateDraw(8, true)).toBe(true);
  });

  it('locks result before presentation and restart keeps same hash', async () => {
    let state = idle({
      tournamentId: 'demo',
      tournamentName: 'HUNT',
      uniqueEntryCount: 20,
      entriesClosed: true,
    });
    state = await applyDrawCommand(state, {
      type: 'GENERATE_DRAW',
      entries: buildDemoEntries(20),
    });
    const hash = state.result!.resultHash;
    state = await applyDrawCommand(state, { type: 'START_PRESENTATION' });
    expect(state.phase).toBe('countdown');
    expect(state.countdownValue).toBe(3);
    expect(state.runStatus).toBe('running');

    // Second START while running is a no-op (same phase / hash).
    const mid = await applyDrawCommand(state, { type: 'START_PRESENTATION' });
    expect(mid.phase).toBe('countdown');
    expect(mid.version).toBe(state.version);
    expect(mid.result!.resultHash).toBe(hash);

    state = await applyDrawCommand(state, { type: 'RESTART_PRESENTATION' });
    expect(state.result!.resultHash).toBe(hash);
    expect(state.revealedPlayers).toBe(0);
    expect(state.phase).toBe('countdown');
    expect(state.countdownValue).toBe(3);
    // Restart must not re-roll participants (slots still empty at this point).
    expect(countConfirmedSlots(state.result)).toBe(0);
  });

  it('refuses second GENERATE without REGENERATE', async () => {
    let state = idle({
      tournamentId: 'demo',
      tournamentName: 'HUNT',
      uniqueEntryCount: 8,
      entriesClosed: true,
    });
    state = await applyDrawCommand(state, {
      type: 'GENERATE_DRAW',
      entries: buildDemoEntries(8),
    });
    await expect(
      applyDrawCommand(state, { type: 'GENERATE_DRAW', entries: buildDemoEntries(8) }),
    ).rejects.toThrow(/REGENERATE/);
  });

  it('stops at awaiting_slot and blocks NEXT until CONFIRM_SLOT', async () => {
    let state = await toAwaitingFirstSlot();
    const before = state.revealedPlayers;
    state = await applyDrawCommand(state, { type: 'NEXT' });
    expect(state.phase).toBe('awaiting_slot');
    expect(state.revealedPlayers).toBe(before);

    const player = state.result!.selected[0]!;
    const slot = picks[0]!;
    state = await applyDrawCommand(state, {
      type: 'CONFIRM_SLOT',
      twitchUserId: player.twitchUserId,
      ...slot,
    });
    expect(state.phase).toBe('slot_confirmed');
    expect(countConfirmedSlots(state.result)).toBe(1);

    // Idempotent same slot
    const again = await applyDrawCommand(state, {
      type: 'CONFIRM_SLOT',
      twitchUserId: player.twitchUserId,
      ...slot,
    });
    expect(again.version).toBe(state.version);

    state = advancePresentation(state);
    expect(state.phase).toBe('reveal_player');
    expect(state.revealedPlayers).toBe(2);
  });

  it('requires all 8 slots before LAUNCH_MATCHUPS', async () => {
    let state = await toAwaitingFirstSlot();

    for (let i = 0; i < DRAW_SLOT_COUNT; i += 1) {
      expect(state.phase).toBe('awaiting_slot');
      const player = state.result!.selected[state.revealedPlayers - 1]!;
      const slot = picks[i]!;
      state = await applyDrawCommand(state, {
        type: 'CONFIRM_SLOT',
        twitchUserId: player.twitchUserId,
        ...slot,
      });
      expect(state.phase).toBe('slot_confirmed');
      state = advancePresentation(state);
      if (i < DRAW_SLOT_COUNT - 1) {
        expect(state.phase).toBe('reveal_player');
        state = advancePresentation(state);
      }
    }

    expect(state.phase).toBe('slots_ready');
    expect(countConfirmedSlots(state.result)).toBe(8);
    expect(canLaunchMatchups(state)).toBe(true);
    expect(canNext(state)).toBe(false);

    state = await applyDrawCommand(state, { type: 'LAUNCH_MATCHUPS' });
    expect(state.phase).toBe('reveal_match');
    expect(state.revealedMatches).toBe(1);
    expect(state.result!.matchups[0]!.playerA.slot?.slotId).toBeTruthy();
    expect(state.result!.matchups[0]!.playerB.slot?.slotId).toBeTruthy();

    // Advance through all 4 duel reveals → awaiting_advance (QF not auto-started)
    while (state.phase === 'reveal_match') {
      state = advancePresentation(state);
    }
    expect(state.phase).toBe('awaiting_advance');
    expect(state.revealedMatches).toBe(DRAW_MATCH_COUNT);
  });

  it('pause blocks auto-advance; resume continues without skipping', async () => {
    let state = idle({
      tournamentId: 'demo',
      tournamentName: 'HUNT',
      uniqueEntryCount: 8,
      entriesClosed: true,
    });
    state = await applyDrawCommand(state, {
      type: 'GENERATE_DRAW',
      entries: buildDemoEntries(8),
    });
    state = await applyDrawCommand(state, { type: 'START_PRESENTATION' });
    state = await applyDrawCommand(state, { type: 'PAUSE' });
    expect(maybeAutoAdvance(state, Date.now() + 999_999)).toBeNull();
    const playersBefore = state.revealedPlayers;
    state = await applyDrawCommand(state, { type: 'RESUME' });
    expect(state.runStatus).toBe('running');
    expect(state.revealedPlayers).toBe(playersBefore);
  });

  it('mergeRemoteIfNewer rejects older versions', () => {
    const a = createIdleDrawState({ tournamentId: 't', tournamentName: 'n' });
    const older = { ...a, version: 1, eventId: 'old' };
    const newer = { ...a, version: 3, eventId: 'new', phase: 'countdown' as const };
    expect(mergeRemoteIfNewer(newer, older)).toBe(newer);
    expect(mergeRemoteIfNewer(older, newer).version).toBe(3);
  });
});
