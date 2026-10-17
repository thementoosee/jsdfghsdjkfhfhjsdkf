/** Shared draw presentation helpers for Edge Functions (Deno). */
/** Must match draw-timing.json and src/.../draw-timing.ts (enforced by FE consistency test). */
export const DRAW_TIMING = {
  introMs: 2800,
  countdownStepMs: 1000,
  revealPlayerMs: 3600,
  slotConfirmMs: 2400,
  showSelectedMs: 3200,
  revealMatchMs: 7000,
  showBracketMs: 2400,
  commandLockMs: 350,
} as const;

export const DRAW_SLOT_COUNT = 8;
export const DRAW_MATCH_COUNT = 4;
export const ENTRIES_TABLE = 'bonus_tournament_entries';
export const PRESENTATIONS_TABLE = 'bonus_tournament_draw_presentations';

export type DrawPhase =
  | 'idle'
  | 'intro'
  | 'countdown'
  | 'reveal_player'
  | 'awaiting_slot'
  | 'slot_confirmed'
  | 'slots_ready'
  | 'show_selected'
  | 'reveal_match'
  | 'show_bracket'
  | 'awaiting_advance';

export type DrawRunStatus = 'idle' | 'running' | 'paused' | 'completed';

export type DrawSlotChoice = {
  slotId: string;
  slotName: string;
  slotImage: string;
};

export type DrawParticipant = {
  twitchUserId: string;
  displayName: string;
  avatarUrl: string;
  slot?: DrawSlotChoice | null;
};

export type DrawResult = {
  selected: DrawParticipant[];
  matchups: Array<{ index: number; playerA: DrawParticipant; playerB: DrawParticipant }>;
  generatedAt: string;
  resultHash: string;
};

export type DrawRow = {
  tournament_id: string;
  presentation_id: string;
  tournament_name: string;
  version: number;
  event_id: string;
  run_status: DrawRunStatus;
  phase: DrawPhase;
  revealed_players: number;
  revealed_matches: number;
  countdown_value: number | null;
  phase_started_at: string | null;
  phase_duration_ms: number | null;
  result: DrawResult | null;
  entries_closed: boolean;
  unique_entry_count: number;
  /** false for live Twitch tournaments; true only for explicit DEMO fixtures. */
  is_demo?: boolean;
  updated_at: string;
};

/** Commands accepted by Edge — GENERATE never carries client entry lists. */
export type DrawCmd =
  | { type: 'CLOSE_ENTRIES' }
  | { type: 'GENERATE_DRAW' }
  | { type: 'REGENERATE_DRAW' }
  | { type: 'START_PRESENTATION' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NEXT' }
  | { type: 'RESTART_PRESENTATION' }
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

export function isAdminAppMetadata(app: Record<string, unknown> | undefined): boolean {
  if (!app) return false;
  return app.bonus_tournament_admin === true || app.bonus_tournament_admin === 'true';
}

export function validateDrawResult(result: DrawResult): { ok: true } | { ok: false; reason: string } {
  if (!result || !Array.isArray(result.selected) || !Array.isArray(result.matchups)) {
    return { ok: false, reason: 'missing selected/matchups' };
  }
  if (result.selected.length !== DRAW_SLOT_COUNT) {
    return { ok: false, reason: `selected length ${result.selected.length}` };
  }
  if (result.matchups.length !== DRAW_MATCH_COUNT) {
    return { ok: false, reason: `matchups length ${result.matchups.length}` };
  }
  const ids = result.selected.map((p) => p.twitchUserId);
  if (ids.some((id) => !id || typeof id !== 'string')) {
    return { ok: false, reason: 'invalid twitchUserId' };
  }
  if (new Set(ids).size !== DRAW_SLOT_COUNT) {
    return { ok: false, reason: 'duplicate twitchUserId in selected' };
  }
  const seen = new Set<string>();
  for (const m of result.matchups) {
    for (const p of [m.playerA, m.playerB]) {
      if (!p?.twitchUserId) return { ok: false, reason: 'invalid matchup player' };
      if (seen.has(p.twitchUserId)) return { ok: false, reason: 'player in multiple matchups' };
      seen.add(p.twitchUserId);
    }
  }
  if (seen.size !== DRAW_SLOT_COUNT) {
    return { ok: false, reason: 'matchups do not cover all selected' };
  }
  for (const id of ids) {
    if (!seen.has(id)) return { ok: false, reason: 'selected not in matchups' };
  }
  return { ok: true };
}

function uniqueByTwitch(
  entries: Array<{ twitchUserId: string; displayName: string; avatarUrl: string }>,
) {
  const seen = new Set<string>();
  const out: typeof entries = [];
  for (const e of entries) {
    const id = e.twitchUserId?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...e, twitchUserId: id });
  }
  return out;
}

function secureShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  const buf = new Uint32Array(1);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    crypto.getRandomValues(buf);
    const j = buf[0]! % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateDrawResult(
  entries: Array<{ twitchUserId: string; displayName: string; avatarUrl: string }>,
): Promise<DrawResult> {
  const unique = uniqueByTwitch(entries);
  if (unique.length < DRAW_SLOT_COUNT) {
    throw new Error(`Need at least ${DRAW_SLOT_COUNT} unique entries, got ${unique.length}`);
  }
  const picked = secureShuffle(unique).slice(0, DRAW_SLOT_COUNT).map((e) => ({
    twitchUserId: e.twitchUserId,
    displayName: e.displayName,
    avatarUrl: e.avatarUrl,
  }));
  const ordered = secureShuffle(picked);
  const matchups = [];
  for (let i = 0; i < DRAW_MATCH_COUNT; i += 1) {
    matchups.push({
      index: i,
      playerA: ordered[i * 2]!,
      playerB: ordered[i * 2 + 1]!,
    });
  }
  const generatedAt = new Date().toISOString();
  const canonical = JSON.stringify({
    selected: ordered.map((p) => p.twitchUserId),
    matchups: matchups.map((m) => [m.playerA.twitchUserId, m.playerB.twitchUserId]),
    generatedAt,
  });
  const result: DrawResult = {
    selected: ordered,
    matchups,
    generatedAt,
    resultHash: await sha256Hex(canonical),
  };
  const check = validateDrawResult(result);
  if (!check.ok) throw new Error(`Invalid draw: ${check.reason}`);
  return result;
}

function bump(row: DrawRow, patch: Partial<DrawRow>): DrawRow {
  return {
    ...row,
    ...patch,
    version: row.version + 1,
    event_id: crypto.randomUUID(),
    updated_at: new Date().toISOString(),
  };
}

function enterPhase(
  row: DrawRow,
  phase: DrawPhase,
  durationMs: number | null,
  extra: Partial<DrawRow> = {},
): DrawRow {
  return bump(row, {
    phase,
    phase_started_at: new Date().toISOString(),
    phase_duration_ms: durationMs,
    ...extra,
  });
}

function countConfirmedSlots(result: DrawResult | null): number {
  if (!result) return 0;
  return result.selected.filter((p) => !!p.slot?.slotId).length;
}

function assignSlotToResult(
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

function clearSlotsFromResult(result: DrawResult): DrawResult {
  const selected = result.selected.map((p) => ({ ...p, slot: null }));
  const byId = new Map(selected.map((p) => [p.twitchUserId, p]));
  const matchups = result.matchups.map((m) => ({
    ...m,
    playerA: byId.get(m.playerA.twitchUserId) ?? { ...m.playerA, slot: null },
    playerB: byId.get(m.playerB.twitchUserId) ?? { ...m.playerB, slot: null },
  }));
  return { ...result, selected, matchups };
}

/** Advance one presentation step using DRAW_TIMING only (no hardcoded duplicates). */
export function advancePresentation(row: DrawRow): DrawRow {
  if (!row.result) return row;
  switch (row.phase) {
    case 'intro':
      return enterPhase(row, 'countdown', DRAW_TIMING.countdownStepMs, {
        countdown_value: 3,
        run_status: 'running',
      });
    case 'countdown': {
      const v = row.countdown_value ?? 3;
      if (v > 1) {
        return enterPhase(row, 'countdown', DRAW_TIMING.countdownStepMs, { countdown_value: v - 1 });
      }
      return enterPhase(row, 'reveal_player', DRAW_TIMING.revealPlayerMs, {
        countdown_value: null,
        revealed_players: 1,
      });
    }
    case 'reveal_player':
      return enterPhase(row, 'awaiting_slot', null, { run_status: 'running' });
    case 'slot_confirmed': {
      if (row.revealed_players >= DRAW_SLOT_COUNT) {
        return enterPhase(row, 'slots_ready', null, {
          revealed_players: DRAW_SLOT_COUNT,
          run_status: 'running',
        });
      }
      return enterPhase(row, 'reveal_player', DRAW_TIMING.revealPlayerMs, {
        revealed_players: row.revealed_players + 1,
      });
    }
    case 'show_selected':
      return enterPhase(row, 'reveal_match', DRAW_TIMING.revealMatchMs, { revealed_matches: 1 });
    case 'reveal_match': {
      const next = row.revealed_matches + 1;
      if (next <= DRAW_MATCH_COUNT) {
        return enterPhase(row, 'reveal_match', DRAW_TIMING.revealMatchMs, { revealed_matches: next });
      }
      // No intermediate bracket on the sidebar — Arena Duel (QF) is next.
      return enterPhase(row, 'awaiting_advance', null, {
        revealed_matches: DRAW_MATCH_COUNT,
        run_status: 'completed',
      });
    }
    case 'show_bracket':
      return enterPhase(row, 'awaiting_advance', null, { run_status: 'completed' });
    case 'awaiting_slot':
    case 'slots_ready':
    default:
      return row;
  }
}

export function maybeAutoAdvance(row: DrawRow, nowMs = Date.now()): DrawRow | null {
  if (row.run_status !== 'running') return null;
  if (!row.phase_started_at || row.phase_duration_ms == null) return null;
  const started = Date.parse(row.phase_started_at);
  if (!Number.isFinite(started)) return null;
  if (nowMs < started + row.phase_duration_ms) return null;
  return advancePresentation(row);
}

export async function applyCommand(
  row: DrawRow | null,
  cmd: DrawCmd,
  tournamentId: string,
  trustedEntries?: Array<{ twitchUserId: string; displayName: string; avatarUrl: string }>,
): Promise<{ row: DrawRow; allowResultReplace: boolean }> {
  if (!row) {
    row = {
      tournament_id: tournamentId,
      presentation_id: crypto.randomUUID(),
      tournament_name: '',
      version: 0,
      event_id: crypto.randomUUID(),
      run_status: 'idle',
      phase: 'idle',
      revealed_players: 0,
      revealed_matches: 0,
      countdown_value: null,
      phase_started_at: null,
      phase_duration_ms: null,
      result: null,
      entries_closed: false,
      unique_entry_count: 0,
      is_demo: false,
      updated_at: new Date().toISOString(),
    };
  }

  switch (cmd.type) {
    case 'CLOSE_ENTRIES':
      return { row: bump(row, { entries_closed: true }), allowResultReplace: false };

    case 'GENERATE_DRAW':
    case 'REGENERATE_DRAW': {
      if (!row.entries_closed) throw new Error('Close entries first');
      if (!trustedEntries) {
        throw new Error('entries_source_unavailable');
      }
      if (cmd.type === 'GENERATE_DRAW' && row.result) {
        throw new Error('Draw already locked — use REGENERATE_DRAW');
      }
      const result = await generateDrawResult(trustedEntries);
      return {
        row: bump(row, {
          result,
          presentation_id: crypto.randomUUID(),
          phase: 'idle',
          run_status: 'idle',
          revealed_players: 0,
          revealed_matches: 0,
          countdown_value: null,
          phase_started_at: null,
          phase_duration_ms: null,
          unique_entry_count: uniqueByTwitch(trustedEntries).length,
        }),
        allowResultReplace: cmd.type === 'REGENERATE_DRAW' && row.result != null,
      };
    }

    case 'START_PRESENTATION': {
      if (!row.result) throw new Error('Generate draw first');
      if (row.run_status === 'running' && row.phase !== 'idle' && row.phase !== 'awaiting_advance') {
        return { row, allowResultReplace: false };
      }
      if (row.run_status === 'paused' && row.phase !== 'idle' && row.phase !== 'awaiting_advance') {
        return { row, allowResultReplace: false };
      }
      return {
        row: enterPhase(row, 'countdown', DRAW_TIMING.countdownStepMs, {
          result: clearSlotsFromResult(row.result),
          run_status: 'running',
          revealed_players: 0,
          revealed_matches: 0,
          countdown_value: 3,
        }),
        allowResultReplace: false,
      };
    }

    case 'PAUSE':
      if (row.run_status !== 'running') return { row, allowResultReplace: false };
      return { row: bump(row, { run_status: 'paused' }), allowResultReplace: false };

    case 'RESUME':
      if (row.run_status !== 'paused') return { row, allowResultReplace: false };
      return {
        row: bump(row, {
          run_status: 'running',
          phase_started_at: new Date().toISOString(),
        }),
        allowResultReplace: false,
      };

    case 'NEXT': {
      if (row.run_status !== 'running' && row.run_status !== 'paused') {
        return { row, allowResultReplace: false };
      }
      if (
        row.phase === 'idle' ||
        row.phase === 'awaiting_advance' ||
        row.phase === 'awaiting_slot' ||
        row.phase === 'slots_ready'
      ) {
        return { row, allowResultReplace: false };
      }
      const wasPaused = row.run_status === 'paused';
      let next = advancePresentation({ ...row, run_status: 'running' });
      if (wasPaused && next.run_status === 'running') next = { ...next, run_status: 'paused' };
      return { row: next, allowResultReplace: false };
    }

    case 'RESTART_PRESENTATION': {
      if (!row.result) throw new Error('No draw to restart');
      return {
        row: enterPhase(row, 'countdown', DRAW_TIMING.countdownStepMs, {
          result: clearSlotsFromResult(row.result),
          presentation_id: crypto.randomUUID(),
          run_status: 'running',
          revealed_players: 0,
          revealed_matches: 0,
          countdown_value: 3,
        }),
        allowResultReplace: false,
      };
    }

    case 'CONFIRM_SLOT': {
      if (row.phase !== 'awaiting_slot' || !row.result) {
        throw new Error('Not awaiting slot selection');
      }
      const current = row.result.selected[row.revealed_players - 1];
      if (!current || current.twitchUserId !== cmd.twitchUserId) {
        throw new Error('CONFIRM_SLOT must target the currently revealed player');
      }
      const slot = {
        slotId: cmd.slotId,
        slotName: cmd.slotName,
        slotImage: cmd.slotImage,
      };
      if (current.slot?.slotId) {
        if (current.slot.slotId === slot.slotId) return { row, allowResultReplace: false };
        throw new Error('Slot already confirmed — use CORRECT_SLOT');
      }
      return {
        row: enterPhase(row, 'slot_confirmed', DRAW_TIMING.slotConfirmMs, {
          result: assignSlotToResult(row.result, cmd.twitchUserId, slot),
          run_status: 'running',
        }),
        allowResultReplace: false,
      };
    }

    case 'CORRECT_SLOT': {
      if (!row.result) throw new Error('No draw result');
      if (
        row.phase === 'reveal_match' ||
        row.phase === 'show_bracket' ||
        row.phase === 'awaiting_advance'
      ) {
        throw new Error('Cannot correct slot in this phase');
      }
      if (countConfirmedSlots(row.result) === 0) throw new Error('No slots to correct');
      const target = row.result.selected.find((p) => p.twitchUserId === cmd.twitchUserId);
      if (!target?.slot?.slotId) throw new Error('Player has no slot to correct');
      return {
        row: bump(row, {
          result: assignSlotToResult(row.result, cmd.twitchUserId, {
            slotId: cmd.slotId,
            slotName: cmd.slotName,
            slotImage: cmd.slotImage,
          }),
        }),
        allowResultReplace: false,
      };
    }

    case 'LAUNCH_MATCHUPS': {
      if (row.phase !== 'slots_ready' || countConfirmedSlots(row.result) !== DRAW_SLOT_COUNT) {
        throw new Error('Confirm all 8 slots before launching matchups');
      }
      return {
        row: enterPhase(row, 'reveal_match', DRAW_TIMING.revealMatchMs, {
          revealed_matches: 1,
          run_status: 'running',
        }),
        allowResultReplace: false,
      };
    }

    default:
      throw new Error('unknown_command');
  }
}

export function rowToCasPayload(row: DrawRow): Record<string, unknown> {
  return {
    tournament_id: row.tournament_id,
    presentation_id: row.presentation_id,
    tournament_name: row.tournament_name,
    version: row.version,
    event_id: row.event_id,
    run_status: row.run_status,
    phase: row.phase,
    revealed_players: row.revealed_players,
    revealed_matches: row.revealed_matches,
    countdown_value: row.countdown_value,
    phase_started_at: row.phase_started_at,
    phase_duration_ms: row.phase_duration_ms,
    result: row.result,
    entries_closed: row.entries_closed,
    unique_entry_count: row.unique_entry_count,
    updated_at: row.updated_at,
    is_demo: row.is_demo === true,
  };
}
