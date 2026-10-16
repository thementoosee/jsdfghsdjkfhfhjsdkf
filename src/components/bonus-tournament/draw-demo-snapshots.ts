/**
 * DEMO-only presentation snapshots for visual preview (sidebar draw).
 */
import { buildDemoEntries, buildDemoSlotCatalogPicks } from './demo-data';
import {
  DRAW_MATCH_COUNT,
  DRAW_SLOT_COUNT,
  assignSlotToResult,
  type DrawParticipant,
  type DrawPublicSnapshot,
  type DrawResult,
} from './draw-types';

function buildDemoResult(): DrawResult {
  const entries = buildDemoEntries(40);
  const picked = entries.slice(0, DRAW_SLOT_COUNT).map(
    (e): DrawParticipant => ({
      twitchUserId: e.twitchUserId,
      displayName: e.displayName,
      avatarUrl: e.avatarUrl,
      slot: null,
    }),
  );
  const matchups = Array.from({ length: DRAW_MATCH_COUNT }, (_, i) => ({
    index: i,
    playerA: picked[i * 2]!,
    playerB: picked[i * 2 + 1]!,
  }));
  return {
    selected: picked,
    matchups,
    generatedAt: new Date().toISOString(),
    resultHash: 'demo-visual-preview-not-a-real-draw',
  };
}

let DEMO_RESULT = buildDemoResult();

function withSlots(count: number): DrawResult {
  const picks = buildDemoSlotCatalogPicks(8);
  let result = clearAll(DEMO_RESULT);
  for (let i = 0; i < count; i += 1) {
    const p = result.selected[i]!;
    const slot = picks[i]!;
    result = assignSlotToResult(result, p.twitchUserId, slot);
  }
  return result;
}

function clearAll(result: DrawResult): DrawResult {
  return {
    ...result,
    selected: result.selected.map((p) => ({ ...p, slot: null })),
    matchups: result.matchups.map((m) => ({
      ...m,
      playerA: { ...m.playerA, slot: null },
      playerB: { ...m.playerB, slot: null },
    })),
  };
}

export type DrawPreviewScene =
  | 'idle'
  | 'intro'
  | 'countdown3'
  | 'roulette'
  | 'roulette_slow'
  | 'roulette_land'
  | 'awaiting_slot'
  | 'slot_confirm_mid'
  | 'slot_confirmed'
  | 'slots_ready'
  | 'match_a'
  | 'match_vs'
  | 'match_1'
  | 'final';

export const DRAW_PREVIEW_SCENES: Array<{ id: DrawPreviewScene; label: string }> = [
  { id: 'idle', label: 'Idle' },
  { id: 'intro', label: 'Abertura' },
  { id: 'countdown3', label: 'Contagem' },
  { id: 'roulette', label: 'Roleta' },
  { id: 'roulette_slow', label: 'Desacelera' },
  { id: 'roulette_land', label: 'Selecionado' },
  { id: 'awaiting_slot', label: 'Aguarda slot' },
  { id: 'slot_confirm_mid', label: 'Sobe + slot' },
  { id: 'slot_confirmed', label: 'Slot confirmada' },
  { id: 'slots_ready', label: '8 slots prontas' },
  { id: 'match_a', label: 'Confronto A' },
  { id: 'match_vs', label: 'Confronto VS' },
  { id: 'match_1', label: 'Confronto completo' },
  { id: 'final', label: 'Quartos ok' },
];

export function previewForceProgress(scene: DrawPreviewScene): number | undefined {
  switch (scene) {
    case 'roulette':
      return 0.18;
    case 'roulette_slow':
      return 0.64;
    case 'roulette_land':
      return 0.9;
    case 'intro':
      return 0.9;
    case 'countdown3':
      return 0.4;
    case 'awaiting_slot':
      return 1;
    case 'slot_confirm_mid':
      // Mid lift: ~50% rise, slot entering, wait badge collapsing
      return 0.14;
    case 'slot_confirmed':
      // Settled: player up + slot fully visible
      return 0.88;
    case 'slots_ready':
      return 1;
    case 'match_a':
      // Moment 1: Player A settled, VS/B not yet
      return 0.26;
    case 'match_vs':
      // Moment 2: A + VS, B not yet
      return 0.38;
    case 'match_1':
      // Hold: full diagonal A + VS + B
      return 0.85;
    case 'final':
      return 1;
    default:
      return undefined;
  }
}

function base(partial: Partial<DrawPublicSnapshot>): DrawPublicSnapshot {
  const now = new Date().toISOString();
  return {
    tournamentId: 'demo-visual-preview',
    presentationId: 'demo-visual-pres',
    tournamentName: 'HUNT DOS REIS',
    version: 1,
    eventId: 'demo-visual-event',
    runStatus: 'running',
    phase: 'idle',
    revealedPlayers: 0,
    revealedMatches: 0,
    countdownValue: null,
    phaseStartedAt: now,
    phaseDurationMs: 2800,
    result: DEMO_RESULT,
    entriesClosed: true,
    uniqueEntryCount: 100,
    updatedAt: now,
    ...partial,
  };
}

export function buildDemoDrawSnapshot(scene: DrawPreviewScene): DrawPublicSnapshot {
  const now = new Date().toISOString();
  DEMO_RESULT = buildDemoResult();

  switch (scene) {
    case 'idle':
      return base({
        runStatus: 'idle',
        phase: 'idle',
        phaseStartedAt: null,
        phaseDurationMs: null,
        result: DEMO_RESULT,
      });
    case 'intro':
      return base({ phase: 'intro', phaseStartedAt: now, phaseDurationMs: 2800 });
    case 'countdown3':
      return base({ phase: 'countdown', countdownValue: 3, phaseStartedAt: now, phaseDurationMs: 1000 });
    case 'roulette':
    case 'roulette_slow':
    case 'roulette_land':
      return base({
        phase: 'reveal_player',
        revealedPlayers: 1,
        phaseStartedAt: now,
        phaseDurationMs: 3600,
        result: clearAll(DEMO_RESULT),
      });
    case 'awaiting_slot':
      return base({
        phase: 'awaiting_slot',
        revealedPlayers: 5,
        phaseStartedAt: now,
        phaseDurationMs: null,
        result: withSlots(4),
      });
    case 'slot_confirm_mid':
    case 'slot_confirmed':
      return base({
        phase: 'slot_confirmed',
        revealedPlayers: 5,
        phaseStartedAt: now,
        phaseDurationMs: 2400,
        result: withSlots(5),
      });
    case 'slots_ready':
      return base({
        phase: 'slots_ready',
        revealedPlayers: 8,
        phaseStartedAt: now,
        phaseDurationMs: null,
        result: withSlots(8),
      });
    case 'match_a':
    case 'match_vs':
    case 'match_1':
      return base({
        phase: 'reveal_match',
        revealedPlayers: 8,
        revealedMatches: 1,
        phaseStartedAt: now,
        phaseDurationMs: 7000,
        result: withSlots(8),
      });
    case 'final':
      return base({
        phase: 'awaiting_advance',
        runStatus: 'completed',
        revealedPlayers: 8,
        revealedMatches: 4,
        phaseStartedAt: now,
        phaseDurationMs: null,
        result: withSlots(8),
      });
    default:
      return base({ phase: 'idle', runStatus: 'idle' });
  }
}

export function demoDecorPool(): DrawParticipant[] {
  return buildDemoEntries(24).map((e) => ({
    twitchUserId: e.twitchUserId,
    displayName: e.displayName,
    avatarUrl: e.avatarUrl,
  }));
}
