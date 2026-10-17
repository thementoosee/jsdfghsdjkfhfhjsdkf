import type { BonusTournamentEntry } from './types';

/** Fixed bracket size — 8 players, 4 quarterfinal matchups. */
export const DRAW_SLOT_COUNT = 8;
export const DRAW_MATCH_COUNT = 4;

export type DrawPhase =
  | 'idle'
  | 'intro'
  | 'countdown'
  | 'reveal_player'
  /** Player revealed — overlay waits; admin must confirm a game slot. */
  | 'awaiting_slot'
  /** Short gold confirmation after slot pick, then auto-advance. */
  | 'slot_confirmed'
  /** All 8 slots confirmed — admin may LAUNCH_MATCHUPS. */
  | 'slots_ready'
  | 'show_selected'
  | 'reveal_match'
  | 'show_bracket'
  | 'awaiting_advance';

export type DrawRunStatus = 'idle' | 'running' | 'paused' | 'completed';

/** Slot chosen for a drawn participant (persists through QF→final). */
export interface DrawSlotChoice {
  slotId: string;
  slotName: string;
  slotImage: string;
}

/** Public participant payload exposed to OBS (no private entry metadata). */
export interface DrawParticipant {
  twitchUserId: string;
  displayName: string;
  avatarUrl: string;
  /** Set after admin confirms slot; null/undefined until then. */
  slot?: DrawSlotChoice | null;
}

export interface DrawMatchup {
  index: number;
  playerA: DrawParticipant;
  playerB: DrawParticipant;
}

/** Immutable draw order / matchups — fixed before any animation starts. */
export interface DrawResult {
  selected: DrawParticipant[];
  matchups: DrawMatchup[];
  generatedAt: string;
  /** SHA-256 hex of canonical draw order (players + pairs). Slot picks are separate. */
  resultHash: string;
}

export interface DrawPresentationState {
  tournamentId: string;
  presentationId: string;
  tournamentName: string;
  /** Monotonic version — reject stale / duplicate writes. */
  version: number;
  /** Last accepted command / event id (uuid). */
  eventId: string;
  runStatus: DrawRunStatus;
  phase: DrawPhase;
  /** 0–8 how many selected players have been revealed. */
  revealedPlayers: number;
  /** 0–8 how many matchups have been revealed. */
  revealedMatches: number;
  /** Countdown digit currently shown (3|2|1) while phase=countdown; else null. */
  countdownValue: number | null;
  phaseStartedAt: string | null;
  phaseDurationMs: number | null;
  /** Locked result; null until GERAR SORTEIO. */
  result: DrawResult | null;
  entriesClosed: boolean;
  uniqueEntryCount: number;
  updatedAt: string;
}

export type DrawAdminCommand =
  | { type: 'CLOSE_ENTRIES' }
  | { type: 'GENERATE_DRAW'; entries: BonusTournamentEntry[] }
  | { type: 'START_PRESENTATION' }
  | { type: 'TICK' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NEXT' }
  | { type: 'RESTART_PRESENTATION' }
  | { type: 'REGENERATE_DRAW'; entries: BonusTournamentEntry[] }
  | {
      type: 'CONFIRM_SLOT';
      twitchUserId: string;
      slotId: string;
      slotName: string;
      slotImage: string;
    }
  | {
      type: 'CORRECT_SLOT';
      twitchUserId: string;
      slotId: string;
      slotName: string;
      slotImage: string;
    }
  | { type: 'LAUNCH_MATCHUPS' };

export interface DrawPublicSnapshot {
  tournamentId: string;
  presentationId: string;
  tournamentName: string;
  version: number;
  eventId: string;
  runStatus: DrawRunStatus;
  phase: DrawPhase;
  revealedPlayers: number;
  revealedMatches: number;
  countdownValue: number | null;
  phaseStartedAt: string | null;
  phaseDurationMs: number | null;
  result: DrawResult | null;
  entriesClosed: boolean;
  uniqueEntryCount: number;
  updatedAt: string;
}

export function toPublicSnapshot(state: DrawPresentationState): DrawPublicSnapshot {
  return {
    tournamentId: state.tournamentId,
    presentationId: state.presentationId,
    tournamentName: state.tournamentName,
    version: state.version,
    eventId: state.eventId,
    runStatus: state.runStatus,
    phase: state.phase,
    revealedPlayers: state.revealedPlayers,
    revealedMatches: state.revealedMatches,
    countdownValue: state.countdownValue,
    phaseStartedAt: state.phaseStartedAt,
    phaseDurationMs: state.phaseDurationMs,
    result: state.result,
    entriesClosed: state.entriesClosed,
    uniqueEntryCount: state.uniqueEntryCount,
    updatedAt: state.updatedAt,
  };
}

export function createIdleDrawState(partial: {
  tournamentId: string;
  tournamentName: string;
  uniqueEntryCount?: number;
  entriesClosed?: boolean;
}): DrawPresentationState {
  const now = new Date().toISOString();
  return {
    tournamentId: partial.tournamentId,
    presentationId: crypto.randomUUID(),
    tournamentName: partial.tournamentName,
    version: 0,
    eventId: crypto.randomUUID(),
    runStatus: 'idle',
    phase: 'idle',
    revealedPlayers: 0,
    revealedMatches: 0,
    countdownValue: null,
    phaseStartedAt: null,
    phaseDurationMs: null,
    result: null,
    entriesClosed: partial.entriesClosed ?? false,
    uniqueEntryCount: partial.uniqueEntryCount ?? 0,
    updatedAt: now,
  };
}

export function countConfirmedSlots(result: DrawResult | null | undefined): number {
  if (!result) return 0;
  return result.selected.filter((p) => !!p.slot?.slotId).length;
}

/** Player currently on screen awaiting / confirming a slot. */
export function currentRevealPlayer(state: {
  phase: DrawPhase;
  revealedPlayers: number;
  result: DrawResult | null;
}): DrawParticipant | null {
  if (
    state.phase !== 'reveal_player' &&
    state.phase !== 'awaiting_slot' &&
    state.phase !== 'slot_confirmed'
  ) {
    return null;
  }
  const idx = state.revealedPlayers - 1;
  if (idx < 0 || !state.result) return null;
  return state.result.selected[idx] ?? null;
}

/** Apply slot to selected + sync into matchups (same twitch ids). */
export function assignSlotToResult(
  result: DrawResult,
  twitchUserId: string,
  slot: DrawSlotChoice,
): DrawResult {
  const selected = result.selected.map((p) =>
    p.twitchUserId === twitchUserId ? { ...p, slot } : p,
  );
  const byId = new Map(selected.map((p) => [p.twitchUserId, p]));
  const matchups = result.matchups.map((m) => ({
    ...m,
    playerA: byId.get(m.playerA.twitchUserId) ?? m.playerA,
    playerB: byId.get(m.playerB.twitchUserId) ?? m.playerB,
  }));
  return { ...result, selected, matchups };
}

export function clearSlotsFromResult(result: DrawResult): DrawResult {
  const selected = result.selected.map((p) => ({ ...p, slot: null }));
  const byId = new Map(selected.map((p) => [p.twitchUserId, p]));
  const matchups = result.matchups.map((m) => ({
    ...m,
    playerA: byId.get(m.playerA.twitchUserId) ?? { ...m.playerA, slot: null },
    playerB: byId.get(m.playerB.twitchUserId) ?? { ...m.playerB, slot: null },
  }));
  return { ...result, selected, matchups };
}
