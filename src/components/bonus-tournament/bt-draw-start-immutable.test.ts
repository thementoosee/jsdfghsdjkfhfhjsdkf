/**
 * Edge applyCommand parity: START must not rewrite locked `result`
 * (clearSlotsFromResult used to inject slot:null → CAS immutable error).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, type DrawResult, type DrawRow } from '../../../supabase/functions/_shared/bt-draw.ts';

function lockedIdleRow(result: DrawResult): DrawRow {
  return {
    tournament_id: 't1',
    presentation_id: 'p1',
    tournament_name: 'HUNT',
    version: 1,
    event_id: 'e1',
    run_status: 'idle',
    phase: 'idle',
    revealed_players: 0,
    revealed_matches: 0,
    countdown_value: null,
    phase_started_at: null,
    phase_duration_ms: null,
    result,
    entries_closed: true,
    unique_entry_count: 8,
    is_demo: false,
    updated_at: new Date().toISOString(),
  };
}

function sampleResult(withExplicitNullSlots: boolean): DrawResult {
  const mk = (id: string, name: string) =>
    withExplicitNullSlots
      ? { twitchUserId: id, displayName: name, avatarUrl: '', slot: null as null }
      : { twitchUserId: id, displayName: name, avatarUrl: '' };
  const selected = Array.from({ length: 8 }, (_, i) => mk(`u${i}`, `P${i}`));
  const matchups = [0, 1, 2, 3].map((index) => ({
    index,
    playerA: selected[index * 2]!,
    playerB: selected[index * 2 + 1]!,
  }));
  return {
    selected,
    matchups,
    generatedAt: '2026-01-01T00:00:00.000Z',
    resultHash: 'hash-locked',
  };
}

describe('Edge applyCommand START / immutability', () => {
  it('START does not change result JSON (no slot keys)', async () => {
    const result = sampleResult(false);
    const row = lockedIdleRow(result);
    const { row: next, allowResultReplace } = await applyCommand(row, { type: 'START_PRESENTATION' }, 't1');
    expect(allowResultReplace).toBe(false);
    expect(next.result).toBe(result);
    expect(JSON.stringify(next.result)).toBe(JSON.stringify(result));
    expect(next.phase).toBe('countdown');
    expect(next.run_status).toBe('running');
    expect(next.version).toBe(2);
  });

  it('START does not rewrite result when slots are already null', async () => {
    const result = sampleResult(true);
    const row = lockedIdleRow(result);
    const { row: next } = await applyCommand(row, { type: 'START_PRESENTATION' }, 't1');
    expect(next.result).toBe(result);
  });

  it('START without result throws Generate draw first', async () => {
    const row = lockedIdleRow(sampleResult(false));
    row.result = null;
    await expect(applyCommand(row, { type: 'START_PRESENTATION' }, 't1')).rejects.toThrow(
      /Generate draw first/,
    );
  });

  it('second START while running is a no-op (same version)', async () => {
    const row = lockedIdleRow(sampleResult(false));
    const first = await applyCommand(row, { type: 'START_PRESENTATION' }, 't1');
    const second = await applyCommand(first.row, { type: 'START_PRESENTATION' }, 't1');
    expect(second.row.version).toBe(first.row.version);
    expect(second.row.result).toBe(first.row.result);
    expect(second.allowResultReplace).toBe(false);
  });

  it('RESTART keeps result reference and bumps presentation', async () => {
    const result = sampleResult(false);
    const running = {
      ...lockedIdleRow(result),
      version: 2,
      run_status: 'running' as const,
      phase: 'countdown' as const,
    };
    const { row: next, allowResultReplace } = await applyCommand(
      running,
      { type: 'RESTART_PRESENTATION' },
      't1',
    );
    expect(allowResultReplace).toBe(false);
    expect(next.result).toBe(result);
    expect(next.presentation_id).not.toBe(running.presentation_id);
    expect(next.phase).toBe('countdown');
    expect(next.revealed_players).toBe(0);
  });

  it('TICK catch-up advances overdue countdown toward reveal', async () => {
    const result = sampleResult(false);
    const started = new Date(Date.now() - 3500).toISOString();
    const row = {
      ...lockedIdleRow(result),
      version: 2,
      run_status: 'running' as const,
      phase: 'countdown' as const,
      countdown_value: 3,
      phase_started_at: started,
      phase_duration_ms: 1000,
    };
    const { row: next } = await applyCommand(row, { type: 'TICK' }, 't1');
    expect(next.phase).toBe('reveal_player');
    expect(next.countdown_value).toBeNull();
    expect(next.version).toBe(3);
    expect(next.result).toBe(result);
  });

  it('TICK is no-op when not due', async () => {
    const result = sampleResult(false);
    const row = {
      ...lockedIdleRow(result),
      version: 2,
      run_status: 'running' as const,
      phase: 'countdown' as const,
      countdown_value: 3,
      phase_started_at: new Date().toISOString(),
      phase_duration_ms: 1000,
    };
    const { row: next } = await applyCommand(row, { type: 'TICK' }, 't1');
    expect(next.version).toBe(2);
    expect(next.countdown_value).toBe(3);
  });

  it('CONFIRM_SLOT allows result replace for slot metadata only', async () => {
    const result = sampleResult(false);
    const awaiting = {
      ...lockedIdleRow(result),
      version: 5,
      run_status: 'running' as const,
      phase: 'awaiting_slot' as const,
      revealed_players: 1,
    };
    const { row: next, allowResultReplace } = await applyCommand(
      awaiting,
      {
        type: 'CONFIRM_SLOT',
        twitchUserId: 'u0',
        slotId: 's1',
        slotName: 'Slot One',
        slotImage: 'https://example.com/s1.png',
      },
      't1',
    );
    expect(allowResultReplace).toBe(true);
    expect(next.result!.selected[0]!.slot?.slotId).toBe('s1');
    expect(next.result!.selected.map((p) => p.twitchUserId)).toEqual(
      result.selected.map((p) => p.twitchUserId),
    );
    expect(next.result!.resultHash).toBe(result.resultHash);
  });
});
