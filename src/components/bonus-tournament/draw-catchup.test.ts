import { describe, expect, it } from 'vitest';
import {
  catchUpPresentation,
  type DrawResult,
  type DrawRow,
} from '../../../supabase/functions/_shared/bt-draw.ts';
import { isReconcileDue } from './draw-reconcile';

function sampleResult(): DrawResult {
  const selected = Array.from({ length: 8 }, (_, i) => ({
    twitchUserId: `u${i}`,
    displayName: `P${i}`,
    avatarUrl: '',
  }));
  const matchups = [0, 1, 2, 3].map((index) => ({
    index,
    playerA: selected[index * 2]!,
    playerB: selected[index * 2 + 1]!,
  }));
  return {
    selected,
    matchups,
    generatedAt: '2026-01-01T00:00:00.000Z',
    resultHash: 'hash',
  };
}

function baseRow(overrides: Partial<DrawRow> = {}): DrawRow {
  return {
    tournament_id: 't1',
    presentation_id: 'p1',
    tournament_name: 'HUNT',
    version: 2,
    event_id: 'e1',
    run_status: 'running',
    phase: 'countdown',
    revealed_players: 0,
    revealed_matches: 0,
    countdown_value: 3,
    phase_started_at: '2026-10-18T00:00:00.000Z',
    phase_duration_ms: 1000,
    result: sampleResult(),
    entries_closed: true,
    unique_entry_count: 8,
    is_demo: false,
    updated_at: '2026-10-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('catchUpPresentation autonomy', () => {
  it('catches long-overdue countdown 3→reveal in one bump', () => {
    const t0 = Date.parse('2026-10-18T00:00:00.000Z');
    const row = baseRow();
    const { row: next, steps } = catchUpPresentation(row, t0 + 3500);
    expect(steps).toBeGreaterThanOrEqual(3);
    expect(next.phase).toBe('reveal_player');
    expect(next.countdown_value).toBeNull();
    expect(next.revealed_players).toBe(1);
    expect(next.version).toBe(row.version + 1);
    expect(next.result!.resultHash).toBe(row.result!.resultHash);
  });

  it('stops at awaiting_slot gate', () => {
    const t0 = Date.parse('2026-10-18T00:00:00.000Z');
    const row = baseRow({
      phase: 'reveal_player',
      countdown_value: null,
      revealed_players: 1,
      phase_duration_ms: 3600,
    });
    const { row: next, steps } = catchUpPresentation(row, t0 + 10_000);
    expect(steps).toBe(1);
    expect(next.phase).toBe('awaiting_slot');
    expect(next.phase_duration_ms).toBeNull();
  });

  it('no-op when not due', () => {
    const t0 = Date.parse('2026-10-18T00:00:00.000Z');
    const row = baseRow();
    const { steps } = catchUpPresentation(row, t0 + 100);
    expect(steps).toBe(0);
  });
});

describe('isReconcileDue', () => {
  it('detects overdue countdown for OBS scheduler', () => {
    const snap = {
      runStatus: 'running' as const,
      phase: 'countdown' as const,
      phaseStartedAt: '2026-10-18T00:00:00.000Z',
      phaseDurationMs: 1000,
    };
    const t0 = Date.parse(snap.phaseStartedAt);
    expect(isReconcileDue(snap, t0 + 500)).toBe(false);
    expect(isReconcileDue(snap, t0 + 1000)).toBe(true);
  });

  it('false at awaiting_slot gate', () => {
    expect(
      isReconcileDue({
        runStatus: 'running',
        phase: 'awaiting_slot',
        phaseStartedAt: '2026-10-18T00:00:00.000Z',
        phaseDurationMs: null,
      }),
    ).toBe(false);
  });
});
