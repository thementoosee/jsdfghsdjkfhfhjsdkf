import { generateDrawResult, uniqueEntriesByTwitchId } from './draw-result';
import { DRAW_TIMING } from './draw-timing';
import {
  DRAW_MATCH_COUNT,
  DRAW_SLOT_COUNT,
  assignSlotToResult,
  countConfirmedSlots,
  createIdleDrawState,
  type DrawAdminCommand,
  type DrawPhase,
  type DrawPresentationState,
  type DrawSlotChoice,
} from './draw-types';
import type { BonusTournamentEntry } from './types';

function bump(
  state: DrawPresentationState,
  patch: Partial<DrawPresentationState>,
  eventId = crypto.randomUUID(),
): DrawPresentationState {
  return {
    ...state,
    ...patch,
    version: state.version + 1,
    eventId,
    updatedAt: new Date().toISOString(),
  };
}

function enterPhase(
  state: DrawPresentationState,
  phase: DrawPhase,
  durationMs: number | null,
  extra: Partial<DrawPresentationState> = {},
): DrawPresentationState {
  return bump(state, {
    phase,
    phaseStartedAt: new Date().toISOString(),
    phaseDurationMs: durationMs,
    ...extra,
  });
}

export function canGenerateDraw(uniqueCount: number, entriesClosed: boolean): boolean {
  return entriesClosed && uniqueCount >= DRAW_SLOT_COUNT;
}

export function canStartPresentation(state: DrawPresentationState): boolean {
  return (
    !!state.result &&
    state.result.selected.length === DRAW_SLOT_COUNT &&
    (state.runStatus === 'idle' || state.phase === 'idle' || state.phase === 'awaiting_advance')
  );
}

export function canPause(state: DrawPresentationState): boolean {
  return state.runStatus === 'running';
}

export function canResume(state: DrawPresentationState): boolean {
  return state.runStatus === 'paused';
}

/**
 * Manual NEXT — never skips awaiting_slot / slots_ready.
 * During reveal_player it may finish the reveal early into awaiting_slot.
 */
export function canNext(state: DrawPresentationState): boolean {
  if (state.runStatus !== 'running' && state.runStatus !== 'paused') return false;
  if (
    state.phase === 'idle' ||
    state.phase === 'awaiting_advance' ||
    state.phase === 'awaiting_slot' ||
    state.phase === 'slots_ready'
  ) {
    return false;
  }
  return true;
}

export function canRestartPresentation(state: DrawPresentationState): boolean {
  return !!state.result;
}

export function canConfirmSlot(state: DrawPresentationState): boolean {
  return (
    (state.phase === 'awaiting_slot' || state.phase === 'slot_confirmed') &&
    state.revealedPlayers >= 1 &&
    !!state.result
  );
}

export function canCorrectSlot(state: DrawPresentationState): boolean {
  if (!state.result) return false;
  if (state.phase === 'reveal_match' || state.phase === 'show_bracket' || state.phase === 'awaiting_advance') {
    return false;
  }
  return countConfirmedSlots(state.result) > 0;
}

export function canLaunchMatchups(state: DrawPresentationState): boolean {
  return (
    state.phase === 'slots_ready' &&
    countConfirmedSlots(state.result) === DRAW_SLOT_COUNT &&
    !!state.result
  );
}

/** Pure auto-advance: given current state + now, return next state or null if not ready. */
export function maybeAutoAdvance(
  state: DrawPresentationState,
  nowMs = Date.now(),
): DrawPresentationState | null {
  if (state.runStatus !== 'running') return null;
  if (!state.phaseStartedAt || state.phaseDurationMs == null) return null;
  const started = Date.parse(state.phaseStartedAt);
  if (!Number.isFinite(started)) return null;
  if (nowMs < started + state.phaseDurationMs) return null;
  return advancePresentation(state);
}

/**
 * Advance one presentation step (timer or PRÓXIMO).
 * Never mutates the locked draw order / matchups pairing.
 * Never skips awaiting_slot — that requires CONFIRM_SLOT.
 */
export function advancePresentation(state: DrawPresentationState): DrawPresentationState {
  if (!state.result) return state;

  switch (state.phase) {
    case 'intro':
      return enterPhase(state, 'countdown', DRAW_TIMING.countdownStepMs, {
        countdownValue: 3,
        runStatus: 'running',
      });
    case 'countdown': {
      const v = state.countdownValue ?? 3;
      if (v > 1) {
        return enterPhase(state, 'countdown', DRAW_TIMING.countdownStepMs, {
          countdownValue: v - 1,
        });
      }
      return enterPhase(state, 'reveal_player', DRAW_TIMING.revealPlayerMs, {
        countdownValue: null,
        revealedPlayers: 1,
      });
    }
    case 'reveal_player':
      // Roulette finished → wait for slot (do NOT auto-reveal next player).
      return enterPhase(state, 'awaiting_slot', null, {
        runStatus: 'running',
      });
    case 'slot_confirmed': {
      if (state.revealedPlayers >= DRAW_SLOT_COUNT) {
        return enterPhase(state, 'slots_ready', null, {
          revealedPlayers: DRAW_SLOT_COUNT,
          runStatus: 'running',
        });
      }
      return enterPhase(state, 'reveal_player', DRAW_TIMING.revealPlayerMs, {
        revealedPlayers: state.revealedPlayers + 1,
      });
    }
    case 'show_selected':
      // Legacy path — prefer slots_ready → LAUNCH_MATCHUPS.
      return enterPhase(state, 'reveal_match', DRAW_TIMING.revealMatchMs, {
        revealedMatches: 1,
      });
    case 'reveal_match': {
      const next = state.revealedMatches + 1;
      if (next <= DRAW_MATCH_COUNT) {
        return enterPhase(state, 'reveal_match', DRAW_TIMING.revealMatchMs, {
          revealedMatches: next,
        });
      }
      // No intermediate bracket on the sidebar — Arena Duel (QF) is next.
      return enterPhase(state, 'awaiting_advance', null, {
        revealedMatches: DRAW_MATCH_COUNT,
        runStatus: 'completed',
      });
    }
    case 'show_bracket':
      // Legacy phase — complete immediately (bracket is a separate OBS overlay).
      return enterPhase(state, 'awaiting_advance', null, {
        runStatus: 'completed',
      });
    case 'awaiting_slot':
    case 'slots_ready':
    case 'idle':
    case 'awaiting_advance':
    default:
      return state;
  }
}

function applySlotCommand(
  state: DrawPresentationState,
  twitchUserId: string,
  slot: DrawSlotChoice,
  mode: 'confirm' | 'correct',
): DrawPresentationState {
  if (!state.result) throw new Error('No draw result');

  if (mode === 'confirm') {
    if (state.phase !== 'awaiting_slot' && state.phase !== 'slot_confirmed') {
      throw new Error('Not awaiting slot selection');
    }
    const current = state.result.selected[state.revealedPlayers - 1];
    if (!current || current.twitchUserId !== twitchUserId) {
      throw new Error('CONFIRM_SLOT must target the currently revealed player');
    }
    if (current.slot?.slotId) {
      // Idempotent: same slot → no-op (blocks double-click); different → CORRECT_SLOT
      if (current.slot.slotId === slot.slotId) return state;
      throw new Error('Slot already confirmed — use CORRECT_SLOT');
    }
    if (state.phase !== 'awaiting_slot') {
      throw new Error('Not awaiting slot selection');
    }
  } else {
    if (!canCorrectSlot(state)) throw new Error('Cannot correct slot in this phase');
    const target = state.result.selected.find((p) => p.twitchUserId === twitchUserId);
    if (!target) throw new Error('Unknown player');
    if (!target.slot?.slotId) throw new Error('Player has no slot to correct');
  }

  const result = assignSlotToResult(state.result, twitchUserId, slot);

  if (mode === 'correct') {
    return bump(state, { result });
  }

  return enterPhase(state, 'slot_confirmed', DRAW_TIMING.slotConfirmMs, {
    result,
    runStatus: 'running',
  });
}

export async function applyDrawCommand(
  state: DrawPresentationState,
  command: DrawAdminCommand,
): Promise<DrawPresentationState> {
  switch (command.type) {
    case 'CLOSE_ENTRIES':
      return bump(state, { entriesClosed: true });

    case 'GENERATE_DRAW': {
      if (!state.entriesClosed) {
        throw new Error('Close entries before generating the draw');
      }
      const unique = uniqueEntriesByTwitchId(command.entries);
      if (unique.length < DRAW_SLOT_COUNT) {
        throw new Error(`Need ${DRAW_SLOT_COUNT} unique entries`);
      }
      if (state.result) {
        throw new Error('Draw already locked — use REGENERATE_DRAW with confirmation');
      }
      const result = await generateDrawResult(unique);
      return bump(state, {
        result,
        presentationId: crypto.randomUUID(),
        phase: 'idle',
        runStatus: 'idle',
        revealedPlayers: 0,
        revealedMatches: 0,
        countdownValue: null,
        phaseStartedAt: null,
        phaseDurationMs: null,
        uniqueEntryCount: unique.length,
      });
    }

    case 'REGENERATE_DRAW': {
      if (!state.entriesClosed) {
        throw new Error('Close entries before regenerating the draw');
      }
      const unique = uniqueEntriesByTwitchId(command.entries);
      if (unique.length < DRAW_SLOT_COUNT) {
        throw new Error(`Need ${DRAW_SLOT_COUNT} unique entries`);
      }
      const result = await generateDrawResult(unique);
      return bump(state, {
        result,
        presentationId: crypto.randomUUID(),
        phase: 'idle',
        runStatus: 'idle',
        revealedPlayers: 0,
        revealedMatches: 0,
        countdownValue: null,
        phaseStartedAt: null,
        phaseDurationMs: null,
        uniqueEntryCount: unique.length,
      });
    }

    case 'START_PRESENTATION': {
      if (!state.result) throw new Error('Generate draw first');
      // Idempotent: already in ceremony — do not restart or re-roll.
      if (state.runStatus === 'running' && state.phase !== 'idle' && state.phase !== 'awaiting_advance') {
        return state;
      }
      if (state.runStatus === 'paused' && state.phase !== 'idle' && state.phase !== 'awaiting_advance') {
        return state;
      }
      // Presentation only — keep locked draw result identical (no clearSlots rewrite).
      return enterPhase(state, 'countdown', DRAW_TIMING.countdownStepMs, {
        runStatus: 'running',
        revealedPlayers: 0,
        revealedMatches: 0,
        countdownValue: 3,
      });
    }

    case 'TICK': {
      const advanced = maybeAutoAdvance(state);
      return advanced ?? state;
    }

    case 'PAUSE': {
      if (state.runStatus !== 'running') return state;
      return bump(state, { runStatus: 'paused' });
    }

    case 'RESUME': {
      if (state.runStatus !== 'paused') return state;
      return bump(state, {
        runStatus: 'running',
        phaseStartedAt: new Date().toISOString(),
      });
    }

    case 'NEXT': {
      if (!canNext(state)) return state;
      const wasPaused = state.runStatus === 'paused';
      const advanced = advancePresentation({ ...state, runStatus: 'running' });
      if (wasPaused && advanced.runStatus === 'running') {
        return { ...advanced, runStatus: 'paused' };
      }
      return advanced;
    }

    case 'RESTART_PRESENTATION': {
      if (!state.result) throw new Error('No draw to restart');
      // Keep locked participants + confirmed slots — only replay presentation.
      return enterPhase(state, 'countdown', DRAW_TIMING.countdownStepMs, {
        result: state.result,
        presentationId: crypto.randomUUID(),
        runStatus: 'running',
        revealedPlayers: 0,
        revealedMatches: 0,
        countdownValue: 3,
      });
    }

    case 'CONFIRM_SLOT':
      return applySlotCommand(
        state,
        command.twitchUserId,
        {
          slotId: command.slotId,
          slotName: command.slotName,
          slotImage: command.slotImage,
        },
        'confirm',
      );

    case 'CORRECT_SLOT':
      return applySlotCommand(
        state,
        command.twitchUserId,
        {
          slotId: command.slotId,
          slotName: command.slotName,
          slotImage: command.slotImage,
        },
        'correct',
      );

    case 'LAUNCH_MATCHUPS': {
      if (!canLaunchMatchups(state)) {
        throw new Error('Confirm all 8 slots before launching matchups');
      }
      return enterPhase(state, 'reveal_match', DRAW_TIMING.revealMatchMs, {
        revealedMatches: 1,
        runStatus: 'running',
      });
    }

    default:
      return state;
  }
}

export function mergeRemoteIfNewer(
  local: DrawPresentationState,
  remote: DrawPresentationState,
): DrawPresentationState {
  if (remote.version < local.version) return local;
  if (remote.version === local.version && remote.eventId === local.eventId) return local;
  if (remote.version === local.version && remote.updatedAt <= local.updatedAt) return local;
  return remote;
}

export function resetDrawForEntries(
  tournamentId: string,
  tournamentName: string,
  entries: BonusTournamentEntry[],
  entriesClosed: boolean,
): DrawPresentationState {
  return createIdleDrawState({
    tournamentId,
    tournamentName,
    uniqueEntryCount: entries.length,
    entriesClosed,
  });
}
